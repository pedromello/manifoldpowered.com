import orchestrator from "tests/orchestrator";
import commercialTerms from "models/commercial_terms";
import { Prisma } from "generated/prisma/client";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

beforeEach(async () => {
  await orchestrator.clearDatabaseRows();
});

describe("models/commercial_terms.ts", () => {
  describe(".commissionRateFor()", () => {
    test("falls back to the platform default when the outlet has none", () => {
      const rate = commercialTerms.commissionRateFor({ commission_rate: null });

      expect(rate.toFixed(8)).toBe("0.10000000");
    });

    test("prefers the outlet's own rate", () => {
      const rate = commercialTerms.commissionRateFor({
        commission_rate: new Prisma.Decimal("0.25"),
      });

      expect(rate.toFixed(8)).toBe("0.25000000");
    });

    // Zero is a real commercial arrangement — an outlet that earns nothing —
    // and must not be mistaken for "unset".
    test("treats a zero rate as a decision, not as unset", () => {
      const rate = commercialTerms.commissionRateFor({
        commission_rate: new Prisma.Decimal("0"),
      });

      expect(rate.toFixed(8)).toBe("0.00000000");
    });
  });

  describe(".supplierCostRateFor()", () => {
    test("falls back to the studio default when the supplier has no terms", async () => {
      const owner = await orchestrator.createUser();
      const studio = await orchestrator.createStudio(owner.id);

      const rate = await commercialTerms.supplierCostRateFor({
        studio_id: studio.id,
      });

      expect(rate.toFixed(8)).toBe("0.70000000");
    });

    test("prefers terms recorded for that supplier", async () => {
      const owner = await orchestrator.createUser();
      const studio = await orchestrator.createStudio(owner.id);

      await orchestrator.setSupplierTerms({
        supplier_id: studio.id,
        cost_rate: 0.6,
      });

      const rate = await commercialTerms.supplierCostRateFor({
        studio_id: studio.id,
      });

      expect(rate.toFixed(8)).toBe("0.60000000");
    });

    test("keeps one supplier's terms away from another's", async () => {
      const owner = await orchestrator.createUser();
      const studio = await orchestrator.createStudio(owner.id);
      const otherStudio = await orchestrator.createStudio(owner.id);

      await orchestrator.setSupplierTerms({
        supplier_id: studio.id,
        cost_rate: 0.5,
      });

      const rate = await commercialTerms.supplierCostRateFor({
        studio_id: otherStudio.id,
      });

      expect(rate.toFixed(8)).toBe("0.70000000");
    });
  });

  describe(".costRateFor()", () => {
    // A studio-supplied game has a house rate that has always applied. An
    // integration's cost comes from a negotiated contract, so assuming one
    // would book a margin nobody agreed to.
    test("refuses an integration with no configured terms", async () => {
      const supplierId = "11111111-1111-1111-1111-111111111111";

      await expect(
        commercialTerms.costRateFor("INTEGRATION", supplierId),
      ).rejects.toMatchObject({
        name: "ValidationError",
        message: `No cost rate is configured for the INTEGRATION supplier "${supplierId}".`,
        action: "Set supplier terms for this supplier and try again.",
        statusCode: 400,
      });
    });

    test("uses configured terms for an integration", async () => {
      const supplierId = "11111111-1111-1111-1111-111111111111";

      await commercialTerms.setSupplierTerms({
        supplier_type: "INTEGRATION",
        supplier_id: supplierId,
        cost_rate: new Prisma.Decimal("0.92"),
      });

      const rate = await commercialTerms.costRateFor("INTEGRATION", supplierId);

      expect(rate.toFixed(8)).toBe("0.92000000");
    });
  });

  describe(".setSupplierTerms()", () => {
    test("records terms for a studio", async () => {
      const owner = await orchestrator.createUser();
      const studio = await orchestrator.createStudio(owner.id);

      const terms = await commercialTerms.setSupplierTerms({
        supplier_type: "STUDIO",
        supplier_id: studio.id,
        cost_rate: new Prisma.Decimal("0.65"),
      });

      expect(terms.supplier_type).toBe("STUDIO");
      expect(terms.supplier_id).toBe(studio.id);
      expect(terms.cost_rate.toFixed(8)).toBe("0.65000000");
    });

    // A supplier has one set of terms at a time; re-agreeing a rate is the
    // ordinary case, not a conflict.
    test("replaces terms rather than accumulating rows", async () => {
      const owner = await orchestrator.createUser();
      const studio = await orchestrator.createStudio(owner.id);

      await orchestrator.setSupplierTerms({
        supplier_id: studio.id,
        cost_rate: 0.7,
      });
      await orchestrator.setSupplierTerms({
        supplier_id: studio.id,
        cost_rate: 0.55,
      });

      const { terms, pagination } =
        await commercialTerms.findAllSupplierTermsPaginated();

      expect(pagination.total).toBe(1);
      expect(terms[0].cost_rate.toFixed(8)).toBe("0.55000000");
    });

    // No foreign keys, so an id matching no studio would become terms that
    // silently never apply to anything.
    test("rejects a supplier id that matches no studio", async () => {
      const missingId = "22222222-2222-2222-2222-222222222222";

      await expect(
        commercialTerms.setSupplierTerms({
          supplier_type: "STUDIO",
          supplier_id: missingId,
          cost_rate: new Prisma.Decimal("0.7"),
        }),
      ).rejects.toMatchObject({
        name: "NotFoundError",
        message: `No studio was found for the supplier id "${missingId}".`,
        action: "Check the supplier id and try again.",
        statusCode: 404,
      });
    });
  });

  describe(".setCommissionRate()", () => {
    test("sets and then clears an outlet's rate", async () => {
      const owner = await orchestrator.createUser();
      const store = await orchestrator.createStore(owner.id);

      const withRate = await commercialTerms.setCommissionRate(
        store.id,
        new Prisma.Decimal("0.15"),
      );
      expect(withRate.commission_rate?.toFixed(8)).toBe("0.15000000");

      // Null returns the outlet to the platform default, which is a different
      // intent from setting the rate to zero.
      const cleared = await commercialTerms.setCommissionRate(store.id, null);
      expect(cleared.commission_rate).toBeNull();
      expect(commercialTerms.commissionRateFor(cleared).toFixed(8)).toBe(
        "0.10000000",
      );
    });

    // The rate must not be reachable from the path an outlet owner controls.
    test("is not settable through the owner-facing store update", async () => {
      const owner = await orchestrator.createUser();
      const store = await orchestrator.createStore(owner.id);
      const storeModel = (await import("models/store")).default;

      await expect(
        storeModel.update(store.id, {
          name: "Renamed Outlet",
          // @ts-expect-error deliberately outside the owner-facing schema
          commission_rate: new Prisma.Decimal("0.99"),
        }),
      ).rejects.toMatchObject({ name: "ValidationError", statusCode: 400 });

      const reloaded = await storeModel.findOneBySlug(store.slug);
      expect(reloaded.name).toBe(store.name);
      expect(reloaded.commission_rate).toBeNull();
    });
  });
});
