import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import authentication from "models/authentication";
import session from "models/session";
import authorization from "models/authorization";
import { ForbiddenError } from "infra/errors";

const router = createRouter<NextApiRequest, NextApiResponse>();

router.use(controller.injectAnonymousOrUser);
router.post(controller.canRequest("create:session"), postHandler);
router.delete(deleteHandler);

export default router.handler(controller.errorHandlers);

async function postHandler(req: NextApiRequest, res: NextApiResponse) {
  const userAuthDto = req.body;

  const authUser = await authentication.getAuthenticatedUser(
    userAuthDto.email,
    userAuthDto.password,
  );

  if (!authorization.can(authUser, "create:session")) {
    throw new ForbiddenError({
      message: "You do not have permission to login",
      action: "Contact support if you believe this is an error",
    });
  }

  const newSession = await session.create(authUser.id);

  controller.setSessionCookie(res, newSession.token);

  return res.status(201).json(newSession);
}

async function deleteHandler(req: NextApiRequest, res: NextApiResponse) {
  const sessionToken = req.cookies.session_id;

  const validSession = await session.findOneValidByToken(sessionToken);
  const expiredSession = await session.expireById(validSession.id);
  controller.clearSessionCookie(res);

  return res.status(200).json(expiredSession);
}
