import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import { DesktopApiError, desktopErrorHandlers } from "infra/desktop_api";
import session from "models/session";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .delete(deleteHandler)
  .handler(desktopErrorHandlers);

async function deleteHandler(req: NextApiRequest, res: NextApiResponse) {
  if (req.context?.authentication !== "bearer" || !req.context.session) {
    throw new DesktopApiError(
      "AUTHENTICATION_REQUIRED",
      "A bearer session is required",
      401,
    );
  }

  await session.expireById(req.context.session.id);
  return res.status(204).end();
}
