import { NextApiRequest, NextApiResponse } from "next";
import {
  InternalServerError,
  MethodNotAllowedError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "./errors";
import session from "models/session";
import * as cookie from "cookie";

const onNoMatchHandler = (req: NextApiRequest, res: NextApiResponse) => {
  const publicErrorObject = new MethodNotAllowedError();
  res.status(publicErrorObject.statusCode).json(publicErrorObject);
};

const onErrorHandler = (
  error: Error & { statusCode?: number },
  req: NextApiRequest,
  res: NextApiResponse,
) => {
  if (error instanceof ValidationError || error instanceof NotFoundError) {
    return res.status(error.statusCode).json(error);
  }

  if (error instanceof UnauthorizedError) {
    clearSessionCookie(res);
    return res.status(error.statusCode).json(error);
  }

  const publicErrorObject = new InternalServerError({
    cause: error,
  });
  console.error(publicErrorObject);
  res.status(publicErrorObject.statusCode).json(publicErrorObject);
};

async function setSessionCookie(res: NextApiResponse, token: string) {
  const setCookie = cookie.serialize("session_id", token, {
    path: "/",
    maxAge: session.EXPIRATION_IN_MILLISECONDS / 1000, // In seconds
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
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

const controller = {
  errorHandlers: {
    onNoMatch: onNoMatchHandler,
    onError: onErrorHandler,
  },
  setSessionCookie,
  clearSessionCookie,
};

export default controller;
