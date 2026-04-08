import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import activation from "models/activation";
import authorization from "models/authorization";

const router = createRouter<NextApiRequest, NextApiResponse>();

router.use(controller.injectAnonymousOrUser);
router.patch(controller.canRequest("read:activation_token"), patchHandler);

export default router.handler(controller.errorHandlers);

async function patchHandler(req: NextApiRequest, res: NextApiResponse) {
  const { activation_id: activationId } = req.query;

  const validActivation = await activation.findOneValidById(
    activationId as string,
  );
  const validatedUser = await activation.activateUserByUserId(
    validActivation.user_id,
  );

  const updatedActivation = await activation.markAsUsed(validActivation.id);

  const secureOutputValues = authorization.filterOutput(
    validatedUser,
    "read:activation_token",
    updatedActivation,
  );

  return res.status(200).json(secureOutputValues);
}
