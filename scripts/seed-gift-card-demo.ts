/** Local demo data only; no Stripe payment is made or verified by this seed. */
import { prisma } from "infra/database";
import { simulatedGiftCardProvider } from "infra/gift_card_provider";
import authorization from "models/authorization";
import {
  assertLocalShowcaseSeedTarget,
  readConfirmedDatabase,
} from "scripts/seed-outlet-preset-showcase-policy";

const buyer = {
  id: "7a320000-0000-4000-8000-000000000001",
  username: "gift_card_demo",
  email: "gift-card-demo@example.test",
};

async function main() {
  assertLocalShowcaseSeedTarget({
    nodeEnv: process.env.NODE_ENV,
    postgresHost: process.env.POSTGRES_HOST,
    postgresDatabase: process.env.POSTGRES_DB,
    confirmedDatabase: readConfirmedDatabase(process.argv.slice(2)),
  });
  // Provider also refuses every environment except development/test.
  const products = await simulatedGiftCardProvider.products();
  await prisma.$transaction(async (tx) => {
    const existing = await tx.user.findFirst({
      where: {
        OR: [
          { id: buyer.id },
          { username: buyer.username },
          { email: buyer.email },
        ],
      },
    });
    if (
      existing &&
      (existing.id !== buyer.id ||
        existing.username !== buyer.username ||
        existing.email !== buyer.email)
    ) {
      throw new Error(
        "Demo account collision; refusing to change existing data.",
      );
    }
    await tx.user.upsert({
      where: { id: buyer.id },
      create: {
        ...buyer,
        password: null,
        features: [...authorization.ACTIVATED_USER_FEATURES],
      },
      update: {},
    });
    for (const [index, scenario] of ["hidden", "revealed", "retry"].entries()) {
      const id = `7a320000-0000-4000-8000-${String(index + 2).padStart(12, "0")}`;
      const product = products.find(
        (item) =>
          item.code ===
          (scenario === "retry" ? "sandbox-brl-50" : "sandbox-brl-25"),
      )!;
      const saved = await tx.giftCardOrder.findUnique({ where: { id } });
      if (saved) {
        if (
          saved.user_id !== buyer.id ||
          saved.idempotency_key !== `local-demo:${scenario}`
        ) {
          throw new Error(
            "Demo order collision; refusing to change existing data.",
          );
        }
        continue; // Preserve disclosure timestamps and recovery performed in UI.
      }
      const now = new Date();
      const delivery =
        scenario === "retry"
          ? null
          : await simulatedGiftCardProvider.issue({ request_id: id, product });
      await tx.giftCardOrder.create({
        data: {
          id,
          user_id: buyer.id,
          idempotency_key: `local-demo:${scenario}`,
          product_code: product.code,
          product_name: product.name,
          amount_minor: product.amount_minor,
          currency: product.currency,
          status: delivery ? "FULFILLED" : "ISSUANCE_FAILED",
          // Synthetic state for UI testing, deliberately no Stripe identifiers/events.
          paid_at: now,
          fulfilled_at: delivery ? now : null,
          provider_reference: delivery?.reference,
          gift_card_code: delivery?.code,
          first_revealed_at: scenario === "revealed" ? now : null,
          last_error: delivery ? null : "ISSUANCE_FAILED",
        },
      });
      if (delivery) {
        await tx.libraryItem.create({
          data: { user_id: buyer.id, item_id: id, item_type: "GIFT_CARD" },
        });
      }
    }
  });
  console.log(`Demo buyer: ${buyer.username} (${buyer.email})`);
  console.log(
    "Open http://localhost:3000/login?callbackUrl=/library/gift-cards",
  );
  console.log("Get the login email code at http://localhost:1080.");
  console.log("Synthetic payment states only. Demo codes are not redeemable.");
}

main()
  .catch(() => {
    console.error(
      "Demo seed failed. Check the local target, migrations and fixture collisions.",
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
