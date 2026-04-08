import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import user from "models/user";
import session from "models/session";
import { UnauthorizedError } from "infra/errors";
import authorization from "models/authorization";

const router = createRouter<NextApiRequest, NextApiResponse>();

router.use(controller.injectAnonymousOrUser);
router.get(controller.canRequest("read:session"), getHandler);

export default router.handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const sessionToken = req.cookies.session_id;
  const userTryingToGet = req.context?.user;

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

  const secureOutputValues = authorization.filterOutput(
    userTryingToGet,
    "read:user:self",
    foundUser,
  );

  // Disallow caching for this endpoint
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, max-age=0",
  );

  return res.status(200).json(secureOutputValues);
}
