import { createRouter } from "next-connect";
import type { NextApiRequest, NextApiResponse } from "next";
import controller from "infra/controller";
import { giftCardProducts } from "models/gift_card_catalog";
import { paymentsConfigured } from "infra/payments";
import { giftCardsEnabled } from "infra/runtime";
import {
  emailGiftCardsSelected,
  emailGiftPurchasesConfigured,
} from "infra/gift_card_api";

// Public product projection only. Buyer orders and codes remain authenticated.
export default createRouter<NextApiRequest, NextApiResponse>()
  .get(async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!giftCardsEnabled()) {
      return res.status(404).end();
    }
    res.status(200).json({
      products: await giftCardProducts(),
      checkout_available:
        paymentsConfigured() &&
        (!emailGiftCardsSelected() || emailGiftPurchasesConfigured()),
    });
  })
  .handler(controller.errorHandlers);
