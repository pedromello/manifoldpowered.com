import { NextApiRequest, NextApiResponse } from "next";
import {
  ForbiddenError,
  InternalServerError,
  MethodNotAllowedError,
  NotFoundError,
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
    error instanceof ForbiddenError
  ) {
    return res.status(error.statusCode).json(error);
  }

  if (error instanceof UnauthorizedError) {
    clearSessionCookie(res);
    return res.status(error.statusCode).json(error);
  }

  const publicErrorObject = new InternalServerError({
    cause: error,
  });
  res.status(publicErrorObject.statusCode).json(publicErrorObject);
};

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
  if (req.cookies?.session_id) {
    await injectAuthenticatedUser(req);
    return next();
  }

  injectAnonymousUser(req);
  return next();
}

async function injectAuthenticatedUser(req: NextApiRequest) {
  const sessionToken = req.cookies?.session_id;
  const validSession = await session.findOneValidByToken(sessionToken);
  const authenticatedUser = await user.findOneById(validSession.user_id);
  req.context = { ...req.context, user: authenticatedUser };
}

function injectAnonymousUser(req: NextApiRequest) {
  const anonymousUser: Partial<User> = {
    features: [
      "read:activation_token",
      "create:session",
      "create:user",
      "read:public_game",
    ],
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
  canRequest,
};

export default controller;
