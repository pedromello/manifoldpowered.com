import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import { UnauthorizedError } from "infra/errors";
import authentication from "models/authentication";
import session from "models/session";

const router = createRouter<NextApiRequest, NextApiResponse>();
router.post(postHandler);

export default router.handler(controller.errorHandlers);

async function postHandler(req: NextApiRequest, res: NextApiResponse) {
  const userAuthDto = req.body;

  const authUser = await authentication.getAuthenticatedUser(userAuthDto.email, userAuthDto.password);

  const newSession = await session.create(authUser.id);

  res.setHeader("Set-Cookie", `session_token=${newSession.token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${session.EXPIRATION_IN_MILLISECONDS / 1000}`);
  return res.status(201).json(newSession);
}
