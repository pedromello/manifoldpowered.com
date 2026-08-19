import { NextApiRequest, NextApiResponse } from "next";
import {
  ForbiddenError,
  InternalServerError,
  MethodNotAllowedError,
  NotFoundError,
  RateLimitError,
  ServiceError,
  UnauthorizedError,
  ValidationError,
} from "./errors";
import session from "models/session";
import * as cookie from "cookie";
import { NextHandler } from "next-connect";
import user from "models/user";
import authorization from "models/authorization";
import { User } from "generated/prisma/client";

// Adding context to NextApiRequest. It can be used globally in the application.
declare module "next" {
  export interface NextApiRequest {
    context?: {
      user: Partial<User>;
      session?: {
        id: string;
        token: string;
        expires_at: Date;
      };
      authentication?: "bearer" | "cookie";
    };
  }
}

const onNoMatchHandler = (req: NextApiRequest, res: NextApiResponse) => {
  const publicErrorObject = new MethodNotAllowedError();
  res.status(publicErrorObject.statusCode).json(publicErrorObject);
};

const onErrorHandler = (
  error: Error & { statusCode?: number },
  req: NextApiRequest,
  res: NextApiResponse,
) => {
  if (
    error instanceof ValidationError ||
    error instanceof NotFoundError ||
    error instanceof ForbiddenError ||
    error instanceof RateLimitError ||
    error instanceof ServiceError
  ) {
    if (error instanceof ServiceError) {
      logServerError(error, req);
    }
    return res.status(error.statusCode).json(error);
  }

  if (error instanceof UnauthorizedError) {
    clearSessionCookie(res);
    return res.status(error.statusCode).json(error);
  }

  const publicErrorObject = new InternalServerError({
    cause: error,
  });
  logServerError(publicErrorObject, req);
  res.status(publicErrorObject.statusCode).json(publicErrorObject);
};

function logServerError(
  error: Error & {
    statusCode?: number;
    action?: string;
    context?: unknown;
  },
  req: NextApiRequest,
) {
  const cause = error.cause;
  console.error(
    JSON.stringify({
      method: req.method,
      // Query strings may contain signed URLs or other credentials. Logging
      // only the pathname keeps those secrets out of operational logs.
      path: req.url?.split("?", 1)[0],
      name: error.name,
      status_code: error.statusCode,
      message: error.message,
      action: error.action,
      context: error.context,
      cause:
        cause instanceof Error
          ? { name: cause.name, message: cause.message, stack: cause.stack }
          : cause,
    }),
  );
}

function setSessionCookie(res: NextApiResponse, token: string) {
  const setCookie = cookie.serialize("session_id", token, {
    path: "/",
    maxAge: session.EXPIRATION_IN_MILLISECONDS / 1000, // In seconds
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
  });

  res.setHeader("Set-Cookie", setCookie);
}

function clearSessionCookie(res: NextApiResponse) {
  const setCookie = cookie.serialize("session_id", "invalid", {
    path: "/",
    maxAge: -1,
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
  });

  res.setHeader("Set-Cookie", setCookie);
}

async function injectAnonymousOrUser(
  req: NextApiRequest,
  res: NextApiResponse,
  next: NextHandler,
) {
  const bearerToken = readBearerToken(req.headers.authorization);
  if (bearerToken) {
    await injectAuthenticatedUser(req, bearerToken, "bearer");
    return next();
  }

  if (req.cookies?.session_id) {
    await injectAuthenticatedUser(req, req.cookies.session_id, "cookie");
    return next();
  }

  injectAnonymousUser(req);
  return next();
}

function readBearerToken(authorizationHeader: string | undefined) {
  if (authorizationHeader === undefined) return undefined;

  const match = /^Bearer ([A-Za-z0-9_-]+)$/.exec(authorizationHeader);
  if (!match) {
    throw new UnauthorizedError({
      message: "Malformed bearer authorization header",
      action: "Use Authorization: Bearer <session-token>",
    });
  }

  return match[1];
}

async function injectAuthenticatedUser(
  req: NextApiRequest,
  sessionToken: string,
  authentication: "bearer" | "cookie",
) {
  const validSession = await session.findOneValidByToken(sessionToken);
  const authenticatedUser = await user.findOneById(validSession.user_id);
  req.context = {
    ...req.context,
    user: authenticatedUser,
    session: validSession,
    authentication,
  };
}

function injectAnonymousUser(req: NextApiRequest) {
  const anonymousUser: Partial<User> = {
    features: authorization.ANONYMOUS_USER_FEATURES,
  };
  req.context = { ...req.context, user: anonymousUser };
}

function canRequest(feature: string) {
  // Returning a middleware that checks if the user has the required feature
  return (req: NextApiRequest, res: NextApiResponse, next: NextHandler) => {
    const userTryingToRequest = req.context?.user;
    if (!authorization.can(userTryingToRequest, feature)) {
      throw new ForbiddenError({
        message: "You do not have permission to perform this action",
        action: "Verify your user has the following features: " + feature,
      });
    }
    return next();
  };
}

const controller = {
  errorHandlers: {
    onNoMatch: onNoMatchHandler,
    onError: onErrorHandler,
  },
  setSessionCookie,
  clearSessionCookie,
  injectAnonymousOrUser,
  readBearerToken,
  logServerError,
  canRequest,
};

export default controller;
