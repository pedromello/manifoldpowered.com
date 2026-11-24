import type { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import { verifyGiftCardCheckout } from "contracts/gift-card-checkout";
import controller from "infra/controller";
import {
  ConflictError,
  UnauthorizedError,
  ValidationError,
} from "infra/errors";
import { checkoutBrowser } from "infra/gift_card_checkout_http";
import { requireSameOriginJson } from "infra/gift_card_operations_http";
import { loginEventContext } from "infra/product_event_context";
import { giftCardsEnabled } from "infra/runtime";
import authorization from "models/authorization";
import {
  giftCardUnavailable,
  verifyCheckoutCode,
} from "models/gift_card_checkout";
import orders from "models/purchase_order";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .post(controller.canRequest("create:session"), postHandler)
  .handler(controller.errorHandlers);

async function postHandler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  requireSameOriginJson(req);
  const parsed = verifyGiftCardCheckout.safeParse(req.body);
  if (!parsed.success)
    throw new ValidationError({
      message: "Please check your purchase details.",
    });
  if (!giftCardsEnabled()) throw giftCardUnavailable();
  const actor = req.context.user;
  const browser = checkoutBrowser(req);
  const grant = browser
    ? await verifyCheckoutCode({
        challengeId: parsed.data.challenge_id,
        code: parsed.data.code,
        browser,
        currentUserId: actor.id,
        currentEmail: actor.email,
      })
    : null;
  if (!grant) {
    const details = { message: "Invalid or expired checkout code." };
    // A stale code must not clear a valid session from another purchase tab.
    throw actor.id
      ? new ConflictError(details)
      : new UnauthorizedError(details);
  }

  controller.setSessionCookie(res, grant.sessionToken);
  const purchase = await openOrder(grant);
  await loginEventContext(req, res, grant.userId);
  return res.status(201).json(
    authorization.filterOutput(actor, "create:gift_card_checkout", {
      checkout_url: `/checkout/${purchase.id}`,
    }),
  );
}

async function openOrder(
  grant: NonNullable<Awaited<ReturnType<typeof verifyCheckoutCode>>>,
) {
  try {
    return await orders.begin(grant.userId, {
      item_type: "GIFT_CARD",
      item_id: grant.challenge.product_code,
      idempotency_key: grant.challenge.intent_id,
    });
  } catch (error) {
    if (
      error instanceof ValidationError &&
      error.message === "This product is unavailable."
    )
      throw giftCardUnavailable();
    throw error;
  }
}
