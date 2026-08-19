import { NextApiRequest, NextApiResponse } from "next";
import controller from "infra/controller";
import { UnauthorizedError } from "infra/errors";

export type DesktopErrorCode =
  | "INVALID_REQUEST"
  | "UNSUPPORTED_API_VERSION"
  | "AUTHENTICATION_REQUIRED"
  | "INVALID_CREDENTIALS"
  | "SESSION_EXPIRED"
  | "SESSION_REVOKED"
  | "ACCOUNT_DISABLED"
  | "RATE_LIMITED"
  | "SERVICE_UNAVAILABLE";

export class DesktopApiError extends Error {
  constructor(
    public code: DesktopErrorCode,
    message: string,
    public statusCode: number,
    public retryable = false,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "DesktopApiError";
  }
}

export function sendDesktopError(res: NextApiResponse, error: DesktopApiError) {
  if (error.code === "RATE_LIMITED" && error.details?.retry_after_seconds) {
    res.setHeader("Retry-After", String(error.details.retry_after_seconds));
  }
  return res.status(error.statusCode).json({
    error: {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      ...(error.details ? { details: error.details } : {}),
    },
  });
}

export const desktopErrorHandlers = {
  onNoMatch: controller.errorHandlers.onNoMatch,
  onError(error: Error, req: NextApiRequest, res: NextApiResponse) {
    if (error instanceof DesktopApiError) return sendDesktopError(res, error);
    if (error instanceof UnauthorizedError) {
      return sendDesktopError(
        res,
        new DesktopApiError(
          req.headers.authorization
            ? "SESSION_EXPIRED"
            : "AUTHENTICATION_REQUIRED",
          req.headers.authorization
            ? "The bearer session is invalid or expired"
            : "Authentication is required",
          401,
        ),
      );
    }
    return controller.errorHandlers.onError(error, req, res);
  },
};
