import { createRouter } from "next-connect";
import type { NextApiRequest, NextApiResponse } from "next";
import controller from "infra/controller";
import {
  giftCardCheckoutAvailable,
  giftCardProducts,
} from "models/gift_card_catalog";
import { giftCardsEnabled } from "infra/runtime";

// Public product projection only. Buyer orders and codes remain authenticated.
export default createRouter<NextApiRequest, NextApiResponse>()
  .get(async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!giftCardsEnabled()) {
      return res.status(404).end();
    }
    res.status(200).json({
      products: await giftCardProducts(),
      checkout_available: giftCardCheckoutAvailable(),
    });
  })
  .handler(controller.errorHandlers);
