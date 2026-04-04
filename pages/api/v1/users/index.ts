import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import user from "models/user";
import activation from "models/activation";

const router = createRouter<NextApiRequest, NextApiResponse>();
router.post(postHandler);

export default router.handler(controller.errorHandlers);

async function postHandler(req: NextApiRequest, res: NextApiResponse) {
  const userCreateDto = req.body;

  const newUser = await user.create(userCreateDto);
  const newActivation = await activation.create(newUser.id);
  await activation.sendEmailToUser(newUser, newActivation);

  return res.status(201).json(newUser);
}
