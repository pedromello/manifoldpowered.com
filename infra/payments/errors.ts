import { ServiceError } from "infra/errors";

export class PaymentTransportError extends ServiceError {
  readonly retryAfter: number;
  readonly httpStatus?: number;
  readonly stage?: "authentication" | "request";
  constructor(
    retryAfter = 30,
    httpStatus?: number,
    stage?: "authentication" | "request",
  ) {
    super({
      message:
        "We could not confirm your payment right now. Check your order before trying again.",
    });
    this.retryAfter = retryAfter;
    this.httpStatus = httpStatus;
    this.stage = stage;
  }
}
