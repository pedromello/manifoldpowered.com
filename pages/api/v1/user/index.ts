import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import user from "models/user";
import session from "models/session";
import { NotFoundError, UnauthorizedError } from "infra/errors";

const router = createRouter<NextApiRequest, NextApiResponse>();
router.get(getHandler);

export default router.handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const sessionToken = req.cookies.session_id;

  if (!sessionToken) {
    throw new UnauthorizedError({
      message: "User does not have a valid session",
      action: "Check if user is logged in and try again",
    });
  }

  const validSession = await session.findOneValidByToken(sessionToken);
  const renewedSession = await session.renew(validSession.id);
  controller.setSessionCookie(res, renewedSession.token);

  const foundUser = await user.findOneById(validSession.user_id);

  // Disallow caching for this endpoint
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");

  return res.status(200).json(foundUser);
}
