import { createHash, randomUUID } from "node:crypto";
import { prisma } from "infra/database";
import { ConflictError, ValidationError } from "infra/errors";
import {
  emailGiftCardsSelected,
  emailGiftProvider,
  type EmailGiftProvider,
} from "infra/gift_card_api";
import {
  assertGiftCardSandbox,
  simulatedGiftCardProvider,
} from "infra/gift_card_provider";

export async function giftCardProducts() {
  assertGiftCardSandbox();
  if (!emailGiftCardsSelected()) return simulatedGiftCardProvider.products();
  const products = await prisma.giftCardProduct.findMany({
    where: { enabled: true, available: true },
    orderBy: { name: "asc" },
  });
  return products.map(({ code, name, amount_minor, currency }) => ({
    code,
    name,
    amount_minor,
    currency,
  }));
}
export async function syncGiftCardCatalog(
  provider: EmailGiftProvider = emailGiftProvider(),
) {
  assertGiftCardSandbox();
  const token = randomUUID();
  const claimed = await prisma.$transaction(async (tx) => {
    await tx.giftCardCatalogSync.upsert({
      where: { id: "catalog" },
      create: { id: "catalog" },
      update: {},
    });
    const result =
      await tx.$executeRaw`UPDATE gift_card_catalog_syncs SET claim_token=${token}, claim_until=clock_timestamp()+interval '60 seconds' WHERE id='catalog' AND (claim_until IS NULL OR claim_until<clock_timestamp())`;
    return result === 1;
  });
  if (!claimed)
    throw new ConflictError({
      message: "Catalog synchronization is already running.",
    });
  try {
    const products = await provider.products();
    // Validate injected adapters as well as the HTTP boundary before mutating.
    if (
      !products.length ||
      products.some(
        (p) =>
          !p.sku ||
          !p.name ||
          p.currency !== "BRL" ||
          !Number.isSafeInteger(p.amount_minor) ||
          p.amount_minor <= 0,
      )
    )
      throw new ValidationError({
        message: "Gift card catalog could not be validated.",
      });
    await prisma.$transaction(
      async (tx) => {
        const [claim] = await tx.$queryRaw<
          { claim_token: string; valid: boolean }[]
        >`SELECT claim_token,claim_until>clock_timestamp() AS valid FROM gift_card_catalog_syncs WHERE id='catalog' FOR UPDATE`;
        if (claim?.claim_token !== token || !claim.valid)
          throw new ConflictError({
            message: "Catalog synchronization has expired.",
          });
        await tx.giftCardProduct.updateMany({ data: { available: false } });
        for (const product of products) {
          const code = `gc-${createHash("sha256").update(`${product.sku}:${product.amount_minor}:${product.currency}`).digest("hex").slice(0, 32)}`;
          const data = {
            provider_sku: product.sku,
            name: product.name,
            amount_minor: product.amount_minor,
            currency: product.currency,
            provider_cost_minor: product.provider_cost_minor,
            available: true,
            synced_at: new Date(),
          };
          await tx.giftCardProduct.upsert({
            where: { code },
            create: { code, ...data },
            update: data,
          });
        }
        await tx.giftCardCatalogSync.update({
          where: { id: "catalog" },
          data: {
            last_success_at: new Date(),
            last_error: null,
            claim_token: null,
            claim_until: null,
          },
        });
      },
      { timeout: 20000 },
    );
    return products.length;
  } catch {
    await prisma.giftCardCatalogSync.updateMany({
      where: { id: "catalog", claim_token: token },
      data: {
        last_error: "CATALOG_SYNC_FAILED",
        claim_token: null,
        claim_until: null,
      },
    });
    throw new ValidationError({
      message:
        "Gift card catalog could not be validated. The previous catalog was preserved.",
    });
  }
}
