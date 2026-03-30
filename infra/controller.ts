import { NextApiRequest, NextApiResponse } from "next";
import {
  InternalServerError,
  MethodNotAllowedError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "./errors";

const onNoMatchHandler = (req: NextApiRequest, res: NextApiResponse) => {
  const publicErrorObject = new MethodNotAllowedError();
  res.status(publicErrorObject.statusCode).json(publicErrorObject);
};

const onErrorHandler = (
  error: Error & { statusCode?: number },
  req: NextApiRequest,
  res: NextApiResponse,
) => {
  if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof UnauthorizedError) {
    return res.status(error.statusCode).json(error);
  }

  const publicErrorObject = new InternalServerError({
    cause: error
  });
  console.error(publicErrorObject);
  res.status(publicErrorObject.statusCode).json(publicErrorObject);
};

const controller = {
  errorHandlers: {
    onNoMatch: onNoMatchHandler,
    onError: onErrorHandler,
  },
};

export default controller;
