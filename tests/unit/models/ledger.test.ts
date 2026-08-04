import { Prisma } from "generated/prisma/client";
import { sumByCurrency } from "models/ledger";

describe("models/ledger.ts", () => {
  describe(".sumByCurrency()", () => {
    test("returns an empty map for no entries", () => {
      expect(sumByCurrency([]).size).toBe(0);
    });

    test("nets a balanced set to zero", () => {
      const totals = sumByCurrency([
        { amount: new Prisma.Decimal("100.0000"), currency: "USD" },
        { amount: new Prisma.Decimal("-70.0000"), currency: "USD" },
        { amount: new Prisma.Decimal("-10.0000"), currency: "USD" },
        { amount: new Prisma.Decimal("-20.0000"), currency: "USD" },
      ]);

      expect(totals.get("USD")?.toFixed(4)).toBe("0.0000");
    });

    test("reports the residual of an unbalanced set", () => {
      const totals = sumByCurrency([
        { amount: new Prisma.Decimal("100.0000"), currency: "USD" },
        { amount: new Prisma.Decimal("-70.0000"), currency: "USD" },
      ]);

      expect(totals.get("USD")?.toFixed(4)).toBe("30.0000");
    });

    // The rule that keeps a BRL balance and a USD balance from being silently
    // added together. Each currency has to net to zero on its own.
    test("totals each currency independently", () => {
      const totals = sumByCurrency([
        { amount: new Prisma.Decimal("100.0000"), currency: "USD" },
        { amount: new Prisma.Decimal("-100.0000"), currency: "USD" },
        { amount: new Prisma.Decimal("550.0000"), currency: "BRL" },
        { amount: new Prisma.Decimal("-500.0000"), currency: "BRL" },
      ]);

      expect(totals.size).toBe(2);
      expect(totals.get("USD")?.toFixed(4)).toBe("0.0000");
      expect(totals.get("BRL")?.toFixed(4)).toBe("50.0000");
    });

    // A set that nets to zero across currencies is still unbalanced. Summing
    // them together would hide it, which is exactly the mistake this prevents.
    test("does not offset one currency against another", () => {
      const totals = sumByCurrency([
        { amount: new Prisma.Decimal("100.0000"), currency: "USD" },
        { amount: new Prisma.Decimal("-100.0000"), currency: "BRL" },
      ]);

      expect(totals.get("USD")?.toFixed(4)).toBe("100.0000");
      expect(totals.get("BRL")?.toFixed(4)).toBe("-100.0000");
    });

    test("is case-insensitive on the currency code", () => {
      const totals = sumByCurrency([
        { amount: new Prisma.Decimal("100.0000"), currency: "usd" },
        { amount: new Prisma.Decimal("-100.0000"), currency: "USD" },
      ]);

      expect(totals.size).toBe(1);
      expect(totals.get("USD")?.toFixed(4)).toBe("0.0000");
    });

    // Decimal arithmetic, not floating point: 0.1 + 0.2 - 0.3 is exactly zero
    // here and famously is not in a JavaScript number.
    test("sums without floating point error", () => {
      const totals = sumByCurrency([
        { amount: new Prisma.Decimal("0.1000"), currency: "USD" },
        { amount: new Prisma.Decimal("0.2000"), currency: "USD" },
        { amount: new Prisma.Decimal("-0.3000"), currency: "USD" },
      ]);

      expect(totals.get("USD")?.isZero()).toBe(true);
    });

    test("keeps the full 4-decimal scale", () => {
      const totals = sumByCurrency([
        { amount: new Prisma.Decimal("0.0001"), currency: "USD" },
        { amount: new Prisma.Decimal("-0.0002"), currency: "USD" },
      ]);

      expect(totals.get("USD")?.toFixed(4)).toBe("-0.0001");
    });
  });
});
