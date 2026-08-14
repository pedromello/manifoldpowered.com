import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import activation from "models/activation";
import authorization from "models/authorization";
import session from "models/session";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .patch(controller.canRequest("read:activation_token"), patchHandler)
  .handler(controller.errorHandlers);

async function patchHandler(req: NextApiRequest, res: NextApiResponse) {
  const { activation_id: activationId } = req.query;

  const validActivation = await activation.findOneValidById(
    activationId as string,
  );
  const validatedUser = await activation.activateUserByUserId(
    validActivation.user_id,
  );

  const updatedActivation = await activation.markAsUsed(validActivation.id);

  const newSession = await session.create(validatedUser.id);
  controller.setSessionCookie(res, newSession.token);

  const secureOutputValues = authorization.filterOutput(
    validatedUser,
    "read:activation_token",
    updatedActivation,
  );

  const secureSessionOutputValues = authorization.filterOutput(
    validatedUser,
    "read:session",
    newSession,
  );

  return res
    .status(200)
    .json({ ...secureOutputValues, session: secureSessionOutputValues });
}
