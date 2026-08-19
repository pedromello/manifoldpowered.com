import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";
import otp from "models/otp";
import session from "models/session";
import authorization from "models/authorization";
import { ForbiddenError, ValidationError } from "infra/errors";
import { z } from "zod";
import authRateLimit from "infra/auth_rate_limit";

const verifyOtpSchema = z.object({
  login: z.string().trim().min(1),
  code: z.string().length(6),
});

export default createRouter<NextApiRequest, NextApiResponse>()
  .use(controller.injectAnonymousOrUser)
  .post(controller.canRequest("create:session"), postHandler)
  .handler(controller.errorHandlers);

async function postHandler(req: NextApiRequest, res: NextApiResponse) {
  const result = verifyOtpSchema.safeParse(req.body);

  if (!result.success) {
    throw new ValidationError({
      message: "One or more fields are invalid",
      action: "Check the fields and try again",
      context: result.error.issues,
    });
  }

  const limit = authRateLimit.consume(req, result.data.login);
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfterSeconds));
    return res.status(429).json({
      message: "Too many authentication attempts",
      name: "RateLimitError",
      action: "Try again later",
      status_code: 429,
    });
  }

  const authUser = await otp.validateAndConsume(
    result.data.login,
    result.data.code,
  );

  if (!authorization.can(authUser, "create:session")) {
    throw new ForbiddenError({
      message: "You do not have permission to login",
      action: "Contact support if you believe this is an error",
    });
  }

  const newSession = await session.create(authUser.id);
  authRateLimit.reset(req, result.data.login);

  controller.setSessionCookie(res, newSession.token);

  const secureOutputValues = authorization.filterOutput(
    authUser,
    "read:session",
    newSession,
  );

  return res.status(201).json(secureOutputValues);
}
