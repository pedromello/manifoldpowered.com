import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import authentication from "models/authentication";
import session from "models/session";
import * as cookie from "cookie";

const router = createRouter<NextApiRequest, NextApiResponse>();
router.post(postHandler);

export default router.handler(controller.errorHandlers);

async function postHandler(req: NextApiRequest, res: NextApiResponse) {
  const userAuthDto = req.body;

  const authUser = await authentication.getAuthenticatedUser(
    userAuthDto.email,
    userAuthDto.password,
  );

  const newSession = await session.create(authUser.id);

  const setCookie = cookie.serialize("session_id", newSession.token, {
    path: "/",
    maxAge: session.EXPIRATION_IN_MILLISECONDS / 1000, // In seconds
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
  });

  res.setHeader("Set-Cookie", setCookie);
  return res.status(201).json(newSession);
}
