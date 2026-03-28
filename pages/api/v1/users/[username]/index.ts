import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import user from "models/user";

const router = createRouter<NextApiRequest, NextApiResponse>();
router.get(getHandler);
router.patch(patchHandler);

export default router.handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const { username } = req.query;

  const userFound = await user.findOneByUsername(username as string);

  return res.status(200).json(userFound);
}

async function patchHandler(req: NextApiRequest, res: NextApiResponse) {
  const { username } = req.query;
  const userUpdateDto = req.body;

  const updatedUser = await user.updateByUsername(
    username as string,
    userUpdateDto,
  );

  return res.status(200).json(updatedUser);
}
