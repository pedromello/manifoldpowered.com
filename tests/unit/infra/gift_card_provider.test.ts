import { simulatedGiftCardProvider } from "infra/gift_card_provider";

test("repeated virtual-card requests reconcile by stable reference across adapters", async () => {
  const [product] = await simulatedGiftCardProvider.products();
  const input = { request_id: "synthetic-order-reference", product };
  expect(await simulatedGiftCardProvider.issue(input)).toEqual(
    await simulatedGiftCardProvider.issue(input),
  );
  expect((await simulatedGiftCardProvider.issue(input)).code).toMatch(
    /^SIMULATED-NOT-REDEEMABLE-/,
  );
});

test("does not issue unknown or modified products", async () => {
  const [product] = await simulatedGiftCardProvider.products();
  await expect(
    simulatedGiftCardProvider.issue({
      request_id: "synthetic",
      product: { ...product, amount_minor: 1 },
    }),
  ).rejects.toThrow();
});

test("the simulator is unavailable in production", async () => {
  const original = process.env.NODE_ENV;
  Object.assign(process.env, { NODE_ENV: "production" });
  try {
    await expect(simulatedGiftCardProvider.products()).rejects.toMatchObject({
      statusCode: 503,
    });
    await expect(
      simulatedGiftCardProvider.issue({
        request_id: "synthetic",
        product: {
          code: "sandbox-brl-25",
          name: "Demo",
          amount_minor: 2500,
          currency: "BRL",
        },
      }),
    ).rejects.toMatchObject({ statusCode: 503 });
  } finally {
    Object.assign(process.env, { NODE_ENV: original });
  }
});
