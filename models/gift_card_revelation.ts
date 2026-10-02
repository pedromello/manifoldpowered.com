import { prisma } from "infra/database";
import { ConflictError, NotFoundError, ServiceError } from "infra/errors";
import { assertGiftCardSandbox } from "infra/gift_card_provider";
import {
  giftCardDatabaseClock,
  lockGiftCardOrder,
} from "models/gift_card_order";
import type { GiftCardOrder } from "generated/prisma/client";

// Any future refund reservation must check this under the same order lock,
// and change the order's eligibility before releasing that lock. Checking
// outside a transaction cannot prevent a concurrent disclosure.
export function assertGiftCardNotRevealed(order: GiftCardOrder) {
  if (order.first_revealed_at)
    throw new ConflictError({
      message: "The gift card has already been disclosed.",
    });
}

async function revealOwn(userId: string, id: string) {
  assertGiftCardSandbox();
  try {
    // The promise resolves only after commit. A failed commit cannot return
    // the code. The timestamp proves server disclosure, not human reading.
    return await prisma.$transaction(
      async (tx) => {
        const order = await lockGiftCardOrder(tx, id, userId);
        if (
          order.status !== "FULFILLED" ||
          !order.paid_at ||
          !order.gift_card_code
        )
          throw new ConflictError({
            message: "The gift card is not available for disclosure.",
          });
        const first =
          order.first_revealed_at ?? (await giftCardDatabaseClock(tx));
        if (!order.first_revealed_at)
          await tx.giftCardOrder.update({
            where: { id },
            data: { first_revealed_at: first },
          });
        return {
          gift_card_code: order.gift_card_code,
          first_revealed_at: first.toISOString(),
        };
      },
      { maxWait: 5000, timeout: 5000 },
    );
  } catch (error) {
    // Business errors contain no secret payload. Persistence errors must not
    // reach the generic controller logger with a raw ORM cause.
    if (error instanceof ConflictError || error instanceof NotFoundError)
      throw error;
    throw new ServiceError({
      message: "The gift card could not be revealed. Try again.",
    });
  }
}

const giftCardRevelation = { revealOwn };
export default giftCardRevelation;
