import type { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import { giftCardsEnabled, sandboxEnabled } from "infra/runtime";

export default createRouter<NextApiRequest, NextApiResponse>()
  .get((_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      purchases_enabled: sandboxEnabled(),
      gift_cards_enabled: giftCardsEnabled(),
    });
  })
  .handler(controller.errorHandlers);
