import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import { createSessionRequestSchema } from "contracts/desktop/v1";
import authRateLimit from "infra/auth_rate_limit";
import controller from "infra/controller";
import { DesktopApiError, desktopErrorHandlers } from "infra/desktop_api";
import { UnauthorizedError } from "infra/errors";
import authentication from "models/authentication";
import authorization from "models/authorization";
import otp from "models/otp";
import session from "models/session";

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .post(postHandler)
  .handler(desktopErrorHandlers);

async function postHandler(req: NextApiRequest, res: NextApiResponse) {
  const parsed = createSessionRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    const unsupportedVersion =
      typeof req.body === "object" &&
      req.body !== null &&
      "api_version" in req.body &&
      req.body.api_version !== "1";
    throw new DesktopApiError(
      unsupportedVersion ? "UNSUPPORTED_API_VERSION" : "INVALID_REQUEST",
      unsupportedVersion
        ? "This API version is not supported"
        : "One or more fields are invalid",
      400,
    );
  }

  const login = parsed.data.email;
  const limit = authRateLimit.consume(req, login);
  if (!limit.allowed) {
    throw new DesktopApiError(
      "RATE_LIMITED",
      "Too many authentication attempts",
      429,
      true,
      { retry_after_seconds: limit.retryAfterSeconds },
    );
  }

  let authUser;
  try {
    authUser =
      parsed.data.method === "PASSWORD"
        ? await authentication.getUser(login, parsed.data.password)
        : await otp.validateAndConsume(login, parsed.data.otp);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      throw new DesktopApiError(
        "INVALID_CREDENTIALS",
        "Invalid credentials",
        401,
      );
    }
    throw error;
  }

  if (!authorization.can(authUser, "create:session")) {
    throw new DesktopApiError(
      "ACCOUNT_DISABLED",
      "This account cannot create sessions",
      403,
    );
  }

  const newSession = await session.create(authUser.id);
  authRateLimit.reset(login);

  return res.status(201).json({
    token: newSession.token,
    expires_at: newSession.expires_at.toISOString(),
    user: { id: authUser.id, username: authUser.username },
  });
}
