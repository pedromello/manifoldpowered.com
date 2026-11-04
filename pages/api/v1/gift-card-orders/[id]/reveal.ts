import { createRouter } from "next-connect";
import { z } from "zod";
import type { NextApiRequest, NextApiResponse } from "next";
import controller from "infra/controller";
import { ValidationError } from "infra/errors";
import giftCardRevelation from "models/gift_card_revelation";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(noStore)
  .use(controller.injectAnonymousOrUser)
  .use(controller.requireAuthentication)
  .post(controller.canRequest("read:library"), postHandler)
  .handler(controller.errorHandlers);

function noStore(
  _req: NextApiRequest,
  res: NextApiResponse,
  next: () => unknown,
) {
  res.setHeader("Cache-Control", "no-store");
  return next();
}

async function postHandler(req: NextApiRequest, res: NextApiResponse) {
  if (
    !z.uuid().safeParse(req.query.id).success ||
    !z
      .object({ confirm: z.literal(true) })
      .strict()
      .safeParse(req.body).success
  )
    throw new ValidationError({
      message: "Explicit confirmation and a valid order are required.",
    });
  res
    .status(200)
    .json(
      await giftCardRevelation.revealOwn(
        req.context.user.id!,
        req.query.id as string,
      ),
    );
}
