import orchestrator from "tests/orchestrator";
import pricing from "models/pricing";
import currency from "models/currency";
import gameModel from "models/game";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

async function setupGame(priceInUsd = 10) {
  await orchestrator.clearDatabaseRows();
  await orchestrator.createCurrency({ code: "USD", symbol: "$" });
  await orchestrator.createCurrency({ code: "BRL", symbol: "R$" });

  const user = await orchestrator.createUser();
  await orchestrator.activateUser(user.id);
  const game = await orchestrator.createGame(user.id, { price: priceInUsd });

  return game;
}

describe("models/pricing.ts", () => {
  describe(".priceFor()", () => {
    test("returns the base price unchanged for the base currency", async () => {
      const game = await setupGame(19.99);

      const resolved = await pricing.priceFor(game, "USD");

      expect(resolved?.source).toBe("BASE");
      expect(resolved?.currency).toBe("USD");
      expect(resolved?.amount.toFixed(2)).toBe("19.99");
      expect(resolved?.exchange_rate).toBeNull();
    });

    test("converts from the base price when a rate exists", async () => {
      const game = await setupGame(10);
      await orchestrator.createExchangeRate({ rate: 5.5 });

      const resolved = await pricing.priceFor(game, "BRL");

      expect(resolved?.source).toBe("CONVERTED");
      expect(resolved?.currency).toBe("BRL");
      expect(resolved?.amount.toFixed(2)).toBe("55.00");
      expect(resolved?.exchange_rate?.toFixed(2)).toBe("5.50");
    });

    test("a regional anchor wins over conversion", async () => {
      const game = await setupGame(10);
      await orchestrator.createExchangeRate({ rate: 5.5 });
      await orchestrator.setGamePriceOverride(game.id, "BRL", 49.9);

      const resolved = await pricing.priceFor(game, "BRL");

      expect(resolved?.source).toBe("OVERRIDE");
      expect(resolved?.amount.toFixed(2)).toBe("49.90");
      // A regional anchor is selected directly, not converted.
      expect(resolved?.exchange_rate).toBeNull();
    });

    test("an override applies even when no rate exists at all", async () => {
      const game = await setupGame(10);
      await orchestrator.setGamePriceOverride(game.id, "BRL", 49.9);

      const resolved = await pricing.priceFor(game, "BRL");

      expect(resolved?.source).toBe("OVERRIDE");
      expect(resolved?.amount.toFixed(2)).toBe("49.90");
    });

    test("applies the global discount ratio to a regional price anchor", async () => {
      const game = await setupGame(100);
      await orchestrator.createExchangeRate({ rate: 5 });
      await orchestrator.setGamePriceOverride(game.id, "BRL", 200);

      // The game's global promotion changes USD 100 -> 50. The BRL override is
      // the regional anchor equivalent to the USD 100 base price, not a fixed
      // final price, so the same 50% promotion must produce BRL 200 -> 100.
      const discountedGame = await gameModel.update(game.id, { price: 50 });

      const resolved = await pricing.priceFor(discountedGame, "BRL");
      const displayed = (
        await pricing.displayPricesFor([discountedGame], "BRL")
      ).get(game.id);

      expect(discountedGame.discount_label).toBe("-50%");
      expect(resolved?.source).toBe("OVERRIDE");
      expect(resolved?.amount.toFixed(2)).toBe("100.00");
      expect(displayed).toEqual({
        amount: "100.00",
        base_amount: "200.00",
        currency: "BRL",
        symbol: "R$",
      });
    });

    test("returns null when there is no rate and no override", async () => {
      const game = await setupGame(10);

      expect(await pricing.priceFor(game, "BRL")).toBeNull();
    });

    test("returns null for an unregistered currency", async () => {
      const game = await setupGame(10);

      expect(await pricing.priceFor(game, "JPY")).toBeNull();
    });

    test("returns null once a currency is disabled, even with an override", async () => {
      const game = await setupGame(10);
      await orchestrator.createCurrency({ code: "JPY", symbol: "¥" });
      await orchestrator.setGamePriceOverride(game.id, "JPY", 1500);

      // Priced while enabled...
      expect((await pricing.priceFor(game, "JPY"))?.source).toBe("OVERRIDE");

      await currency.setEnabled("JPY", false);

      // ...and gone the moment it is disabled. Turning a currency off removes
      // it from every storefront without having to delete any price.
      expect(await pricing.priceFor(game, "JPY")).toBeNull();
    });

    test("rounds half-up to the currency's display scale", async () => {
      const game = await setupGame(12.99);
      await orchestrator.createExchangeRate({ rate: 5.4321 });

      // 12.99 * 5.4321 = 70.5629...
      const resolved = await pricing.priceFor(game, "BRL");

      expect(resolved?.amount.toFixed(2)).toBe("70.56");
    });

    test("respects a currency with zero decimal places", async () => {
      const game = await setupGame(10);
      await orchestrator.createCurrency({
        code: "JPY",
        symbol: "¥",
        decimal_places: 0,
      });
      await orchestrator.createExchangeRate({
        quote_currency: "JPY",
        rate: 155.75,
      });

      const resolved = await pricing.priceFor(game, "JPY");

      expect(resolved?.amount.toFixed(0)).toBe("1558");
    });

    test("uses the rate effective at the given moment", async () => {
      const game = await setupGame(10);
      await orchestrator.createExchangeRate({
        rate: 5.0,
        effective_at: new Date("2026-07-01T00:00:00.000Z"),
      });
      await orchestrator.createExchangeRate({
        rate: 6.0,
        effective_at: new Date("2026-07-20T00:00:00.000Z"),
      });

      const resolvedEarly = await pricing.priceFor(
        game,
        "BRL",
        new Date("2026-07-10T00:00:00.000Z"),
      );
      const resolvedLate = await pricing.priceFor(
        game,
        "BRL",
        new Date("2026-07-25T00:00:00.000Z"),
      );

      expect(resolvedEarly?.amount.toFixed(2)).toBe("50.00");
      expect(resolvedLate?.amount.toFixed(2)).toBe("60.00");
    });

    test("is case-insensitive on the currency code", async () => {
      const game = await setupGame(10);
      await orchestrator.createExchangeRate({ rate: 5.5 });

      const resolved = await pricing.priceFor(game, "brl");

      expect(resolved?.currency).toBe("BRL");
      expect(resolved?.amount.toFixed(2)).toBe("55.00");
    });
  });

  describe(".priceForOrFail()", () => {
    test("throws NotFoundError when the price cannot be resolved", async () => {
      const game = await setupGame(10);

      await expect(pricing.priceForOrFail(game, "BRL")).rejects.toMatchObject({
        name: "NotFoundError",
        message: "This item has no price available in BRL.",
        statusCode: 404,
      });
    });
  });

  describe(".resolvableGameIds()", () => {
    test("returns every id when a rate exists for the pair", async () => {
      const gameA = await setupGame(10);
      const gameB = await orchestrator.createGame(undefined, {
        price: 20,
        studio_id: gameA.studio_id,
      });
      await orchestrator.createExchangeRate({ rate: 5.5 });

      const resolvable = await pricing.resolvableGameIds(
        [gameA.id, gameB.id],
        "BRL",
      );

      expect(resolvable.sort()).toEqual([gameA.id, gameB.id].sort());
    });

    test("returns only overridden games when no rate exists", async () => {
      const gameA = await setupGame(10);
      const gameB = await orchestrator.createGame(undefined, {
        price: 20,
        studio_id: gameA.studio_id,
      });
      await orchestrator.setGamePriceOverride(gameA.id, "BRL", 49.9);

      const resolvable = await pricing.resolvableGameIds(
        [gameA.id, gameB.id],
        "BRL",
      );

      expect(resolvable).toEqual([gameA.id]);
    });

    test("returns nothing for a disabled currency", async () => {
      const game = await setupGame(10);
      await orchestrator.createExchangeRate({ rate: 5.5 });
      await orchestrator.createCurrency({
        code: "JPY",
        symbol: "¥",
        enabled: false,
      });

      expect(await pricing.resolvableGameIds([game.id], "JPY")).toEqual([]);
    });

    test("returns every id for the base currency without touching rates", async () => {
      const game = await setupGame(10);

      expect(await pricing.resolvableGameIds([game.id], "USD")).toEqual([
        game.id,
      ]);
    });

    test("returns an empty array for an empty input", async () => {
      await setupGame(10);

      expect(await pricing.resolvableGameIds([], "BRL")).toEqual([]);
    });
  });

  describe(".setOverride()", () => {
    test("updates the amount when an override already exists", async () => {
      const game = await setupGame(10);
      await orchestrator.setGamePriceOverride(game.id, "BRL", 49.9);
      await orchestrator.setGamePriceOverride(game.id, "BRL", 59.9);

      const overrides = await pricing.listOverrides(game.id);

      expect(overrides).toHaveLength(1);
      expect(overrides[0].amount.toFixed(2)).toBe("59.90");
    });

    test("rejects an unregistered currency", async () => {
      const game = await setupGame(10);

      await expect(
        pricing.setOverride(game.id, { currency: "JPY", amount: 1500 }),
      ).rejects.toMatchObject({
        name: "ValidationError",
        message: 'The currency "JPY" is not registered or is disabled.',
        action: "Register and enable the currency before pricing in it.",
        statusCode: 400,
      });
    });
  });

  describe(".removeOverride()", () => {
    test("removes the override so the price falls back to conversion", async () => {
      const game = await setupGame(10);
      await orchestrator.createExchangeRate({ rate: 5.5 });
      await orchestrator.setGamePriceOverride(game.id, "BRL", 49.9);

      await pricing.removeOverride(game.id, "BRL");

      const resolved = await pricing.priceFor(game, "BRL");
      expect(resolved?.source).toBe("CONVERTED");
      expect(resolved?.amount.toFixed(2)).toBe("55.00");
    });

    test("throws NotFoundError when there is nothing to remove", async () => {
      const game = await setupGame(10);

      await expect(
        pricing.removeOverride(game.id, "BRL"),
      ).rejects.toMatchObject({
        name: "NotFoundError",
        message: "No BRL price override exists for this game.",
        statusCode: 404,
      });
    });
  });
});
