import payoutProviders from "infra/payout_providers";

describe("infra/payout_providers/index.ts", () => {
  describe(".providerKeys()", () => {
    test("registers stripe and, outside production, the fake", () => {
      const keys = payoutProviders.providerKeys();

      expect(keys).toContain("STRIPE");
      expect(keys).toContain("FAKE");
    });
  });

  describe(".getProvider()", () => {
    test("resolves a registered rail to an adapter that agrees with its key", () => {
      const provider = payoutProviders.getProvider("STRIPE");

      expect(provider.key).toBe("STRIPE");
    });

    test("resolves regardless of casing or surrounding space", () => {
      expect(payoutProviders.getProvider(" stripe ").key).toBe("STRIPE");
    });

    test("refuses an unknown rail with a ValidationError", () => {
      expect(() => payoutProviders.getProvider("PAYPAL")).toThrow(
        '"PAYPAL" is not a supported payout provider.',
      );
    });

    test("every registered adapter implements the whole interface", () => {
      for (const key of payoutProviders.providerKeys()) {
        const provider = payoutProviders.getProvider(key);

        expect(typeof provider.createAccount).toBe("function");
        expect(typeof provider.getAccountStatus).toBe("function");
        expect(typeof provider.sendPayout).toBe("function");
        expect(typeof provider.getPayoutStatus).toBe("function");
        expect(provider.supportedCurrencies.length).toBeGreaterThan(0);
      }
    });

    test("every adapter declares its currencies normalized", () => {
      for (const key of payoutProviders.providerKeys()) {
        const provider = payoutProviders.getProvider(key);

        for (const code of provider.supportedCurrencies) {
          expect(code).toBe(code.toUpperCase());
        }
      }
    });
  });

  describe(".supportsCurrency()", () => {
    test("matches a declared currency whatever the casing of the input", () => {
      const provider = payoutProviders.getProvider("STRIPE");

      expect(payoutProviders.supportsCurrency(provider, "usd")).toBe(true);
      expect(payoutProviders.supportsCurrency(provider, " USD ")).toBe(true);
    });

    test("does not match a currency the rail never declared", () => {
      const provider = payoutProviders.getProvider("STRIPE");

      expect(payoutProviders.supportsCurrency(provider, "JPY")).toBe(false);
    });
  });

  describe(".isRegistered()", () => {
    test("answers for both a known and an unknown rail", () => {
      expect(payoutProviders.isRegistered("stripe")).toBe(true);
      expect(payoutProviders.isRegistered("PAYPAL")).toBe(false);
    });
  });
});
