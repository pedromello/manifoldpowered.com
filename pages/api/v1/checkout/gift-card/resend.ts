import type { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import { resendGiftCardCheckout } from "contracts/gift-card-checkout";
import controller from "infra/controller";
import {
  ConflictError,
  UnauthorizedError,
  ValidationError,
} from "infra/errors";
import {
  checkoutAddress,
  checkoutBrowser,
  checkoutCodeResponse,
} from "infra/gift_card_checkout_http";
import { requireSameOriginJson } from "infra/gift_card_operations_http";
import { resendCheckoutCode } from "models/gift_card_checkout";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .post(controller.canRequest("create:session"), postHandler)
  .handler(controller.errorHandlers);

async function postHandler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  requireSameOriginJson(req);
  const parsed = resendGiftCardCheckout.safeParse(req.body);
  if (!parsed.success)
    throw new ValidationError({
      message: "Please check your purchase details.",
    });
  const actor = req.context.user;
  const browser = checkoutBrowser(req);
  const result = browser
    ? await resendCheckoutCode({
        challengeId: parsed.data.challenge_id,
        locale: parsed.data.locale,
        browser,
        address: checkoutAddress(req),
        signedInEmail: actor.id ? (actor.email ?? "") : undefined,
      })
    : null;
  if (!browser || !result) {
    const details = { message: "Invalid or expired checkout code." };
    throw actor.id
      ? new ConflictError(details)
      : new UnauthorizedError(details);
  }
  return checkoutCodeResponse(req, res, browser, result);
}
