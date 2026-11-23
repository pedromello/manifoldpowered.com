import { ServiceError } from "infra/errors";

export class PaymentTransportError extends ServiceError {
  readonly retryAfter: number;
  readonly httpStatus?: number;
  readonly stage?:
    | "authentication"
    | "request"
    | "response_json"
    | "order_shape"
    | "order_identity"
    | "order_status"
    | "payment_evidence"
    | "payment_date";
  readonly fields?: string[];
  constructor(
    retryAfter = 30,
    httpStatus?: number,
    stage?: PaymentTransportError["stage"],
    fields?: string[],
  ) {
    super({
      message:
        "We could not confirm your payment right now. Check your order before trying again.",
    });
    this.retryAfter = retryAfter;
    this.httpStatus = httpStatus;
    this.stage = stage;
    this.fields = fields;
  }
}
