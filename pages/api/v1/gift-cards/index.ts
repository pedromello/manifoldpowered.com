import { createRouter } from "next-connect";
import type { NextApiRequest, NextApiResponse } from "next";
import controller from "infra/controller";
import { simulatedGiftCardProvider } from "infra/gift_card_provider";
import { stripeCheckoutConfigured } from "infra/stripe_checkout";

// Public product projection only. Buyer orders and codes remain authenticated.
export default createRouter<NextApiRequest, NextApiResponse>()
  .get(async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!["development", "test"].includes(process.env.NODE_ENV)) {
      return res.status(404).end();
    }
    res.status(200).json({
      products: await simulatedGiftCardProvider.products(),
      checkout_available: stripeCheckoutConfigured(),
    });
  })
  .handler(controller.errorHandlers);
