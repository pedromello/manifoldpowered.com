import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import activation from "models/activation";

const router = createRouter<NextApiRequest, NextApiResponse>();
router.patch(patchHandler);

export default router.handler(controller.errorHandlers);

async function patchHandler(req: NextApiRequest, res: NextApiResponse) {
  const { activation_id: activationId } = req.query;

  const validActivation = await activation.findOneValidById(
    activationId as string,
  );
  await activation.activateUserByUserId(validActivation.user_id);

  const updatedActivation = await activation.markAsUsed(validActivation.id);

  return res.status(200).json(updatedActivation);
}
