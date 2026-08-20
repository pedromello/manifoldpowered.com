import { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import {
  desktopErrorCodeSchema,
  desktopErrorSchema,
} from "contracts/desktop/v1";
import controller from "infra/controller";
import {
  ForbiddenError,
  MethodNotAllowedError,
  NotFoundError,
  RateLimitError,
  ServiceError,
  UnauthorizedError,
  ValidationError,
} from "infra/errors";

type DistributionErrorCode = z.infer<typeof desktopErrorCodeSchema>;
type DistributionError = Error & {
  statusCode?: number;
  distributionErrorCode?: DistributionErrorCode;
};

function withErrorCode<T extends Error>(
  error: T,
  code: DistributionErrorCode,
): T {
  return Object.assign(error, { distributionErrorCode: code });
}

function onNoMatch(_req: NextApiRequest, res: NextApiResponse) {
  const error = new MethodNotAllowedError();
  return sendError(res, error.statusCode, "INVALID_REQUEST", error.message);
}

function onError(
  error: DistributionError,
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (error instanceof UnauthorizedError) {
    controller.clearSessionCookie(res);
  }

  const isKnownError =
    error instanceof ValidationError ||
    error instanceof NotFoundError ||
    error instanceof ForbiddenError ||
    error instanceof UnauthorizedError ||
    error instanceof RateLimitError ||
    error instanceof ServiceError;

  if (!isKnownError || error instanceof ServiceError) {
    controller.logServerError(error, req);
  }

  const statusCode =
    isKnownError && typeof error.statusCode === "number"
      ? error.statusCode
      : 500;
  const code = error.distributionErrorCode ?? inferErrorCode(error);
  const message = isKnownError ? error.message : "Service unavailable";
  const retryable =
    error instanceof RateLimitError ||
    error instanceof ServiceError ||
    !isKnownError;
  const details =
    error instanceof ValidationError && error.context !== undefined
      ? { issues: error.context }
      : undefined;

  return sendError(res, statusCode, code, message, retryable, details);
}

function inferErrorCode(error: DistributionError): DistributionErrorCode {
  if (error instanceof UnauthorizedError) return "AUTHENTICATION_REQUIRED";
  if (error instanceof ForbiddenError) return "ENTITLEMENT_REQUIRED";
  if (error instanceof RateLimitError) return "RATE_LIMITED";
  if (error instanceof ServiceError) return "SERVICE_UNAVAILABLE";
  if (error instanceof ValidationError || error instanceof NotFoundError) {
    return "INVALID_REQUEST";
  }
  return "SERVICE_UNAVAILABLE";
}

function sendError(
  res: NextApiResponse,
  statusCode: number,
  code: DistributionErrorCode,
  message: string,
  retryable = false,
  details?: Record<string, unknown>,
) {
  const payload = desktopErrorSchema.parse({
    error: { code, message, retryable, details },
  });
  return res.status(statusCode).json(payload);
}

const distributionApi = {
  errorHandlers: { onError, onNoMatch },
  withErrorCode,
};

export default distributionApi;
