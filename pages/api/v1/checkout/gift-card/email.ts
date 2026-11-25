import type { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import { startGiftCardCheckout } from "contracts/gift-card-checkout";
import controller from "infra/controller";
import { ValidationError } from "infra/errors";
import {
  checkoutAddress,
  checkoutBrowser,
  checkoutCodeResponse,
  newCheckoutBrowser,
} from "infra/gift_card_checkout_http";
import { requireSameOriginJson } from "infra/gift_card_operations_http";
import {
  differentCheckoutAccount,
  requestCheckoutCode,
} from "models/gift_card_checkout";
import { normalizeAccountEmail } from "models/user_email_verification";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .post(controller.canRequest("create:session"), postHandler)
  .handler(controller.errorHandlers);

async function postHandler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  requireSameOriginJson(req);
  const parsed = startGiftCardCheckout.safeParse(req.body);
  if (!parsed.success)
    throw new ValidationError({
      message: "Please check your purchase details.",
    });
  const actor = req.context.user;
  if (
    actor.id &&
    normalizeAccountEmail(actor.email ?? "") !==
      normalizeAccountEmail(parsed.data.email)
  )
    throw differentCheckoutAccount();

  const browser = checkoutBrowser(req) ?? newCheckoutBrowser();
  const result = await requestCheckoutCode({
    ...parsed.data,
    browser,
    address: checkoutAddress(req),
  });
  return checkoutCodeResponse(req, res, browser, result);
}
