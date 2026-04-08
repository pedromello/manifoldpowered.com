import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import user from "models/user";
import activation from "models/activation";
import authorization from "models/authorization";

const router = createRouter<NextApiRequest, NextApiResponse>();

router.use(controller.injectAnonymousOrUser);
router.post(controller.canRequest("create:user"), postHandler);

export default router.handler(controller.errorHandlers);

async function postHandler(req: NextApiRequest, res: NextApiResponse) {
  const userCreateDto = req.body;
  const userTryingToCreate = req.context.user;

  const newUser = await user.create(userCreateDto);
  const newActivation = await activation.create(newUser.id);
  await activation.sendEmailToUser(newUser, newActivation);

  const secureOutputValues = authorization.filterOutput(
    userTryingToCreate,
    "read:user",
    newUser,
  );

  return res.status(201).json(secureOutputValues);
}
