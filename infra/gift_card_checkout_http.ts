import { randomBytes } from "node:crypto";
import { isIP } from "node:net";
import * as cookie from "cookie";
import type { NextApiRequest, NextApiResponse } from "next";
import { RateLimitError } from "infra/errors";
import { appendResponseCookie } from "infra/response_cookies";
import authorization from "models/authorization";
import {
  CHECKOUT_RESEND_SECONDS,
  CHECKOUT_RESUME_SECONDS,
  type CheckoutCodeResult,
} from "models/gift_card_checkout";

const COOKIE = "gift_card_checkout";

export function checkoutBrowser(req: NextApiRequest) {
  const browser = req.cookies?.[COOKIE];
  return browser && /^[a-f0-9]{64}$/.test(browser) ? browser : undefined;
}

export function newCheckoutBrowser() {
  return randomBytes(32).toString("hex");
}

export function setCheckoutBrowser(res: NextApiResponse, browser: string) {
  appendResponseCookie(
    res,
    cookie.serialize(COOKIE, browser, {
      path: "/api/v1/checkout/gift-card",
      maxAge: CHECKOUT_RESUME_SECONDS + 120,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      httpOnly: true,
    }),
  );
}

export function checkoutCodeResponse(
  req: NextApiRequest,
  res: NextApiResponse,
  browser: string,
  result: CheckoutCodeResult,
) {
  if ("retryAfter" in result) {
    res.setHeader("Retry-After", String(result.retryAfter));
    throw new RateLimitError({
      message: "Wait before requesting another code.",
    });
  }
  setCheckoutBrowser(res, browser);
  return res.status(202).json(
    authorization.filterOutput(req.context.user, "create:gift_card_checkout", {
      challenge_id: result.challengeId,
      retry_after: CHECKOUT_RESEND_SECONDS,
      masked_email: result.maskedEmail,
    }),
  );
}

export function checkoutAddress(req: NextApiRequest) {
  const forwarded = process.env.VERCEL
    ? req.headers["x-vercel-forwarded-for"]
    : req.headers["x-forwarded-for"];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const address = value?.split(",", 1)[0].trim();
  return address && isIP(address)
    ? address
    : req.socket?.remoteAddress || "unknown";
}
