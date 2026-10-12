import { z } from "zod";
import { timingSafeEqual } from "node:crypto";
import { ValidationError } from "infra/errors";

const events = new Set([
  "OrderApproved",
  "OrderAuthorized",
  "OrderAuthorizedWithDelay",
  "OrderIntegrated",
  "OrderPendingIntegration",
  "OrderPaid",
  "OrderRefund",
  "OrderPartialRefund",
  "OrderRefusedByRisk",
  "OrderPixCreated",
  "OrderPaidByPix",
  "OrderPixExpired",
  "PaymentNotAuthorized",
  "PaymentNotAuthorizedWithDelay",
  "OrderChargeBackInTreatment",
  "OrderChargeBackGain",
]);
export function decodeAppmaxPaymentWebhook(body: unknown) {
  const parsed = z
    .object({
      event: z.string(),
      data: z.object({ id: z.number().int().positive() }),
    })
    .safeParse(body);
  if (!parsed.success)
    throw new ValidationError({ message: "Invalid payment notification." });
  if (!events.has(parsed.data.event)) return null;
  // The panel emits environment="production" even for sandbox. It is not authority.
  return {
    remote_order_id: String(parsed.data.data.id),
    event: parsed.data.event,
  };
}
export function acceptsAppmaxWebhookToken(value: unknown) {
  const expected = process.env.APPMAX_WEBHOOK_TOKEN;
  if (!expected || expected.length < 32 || typeof value !== "string")
    return false;
  const a = Buffer.from(expected),
    b = Buffer.from(value);
  return a.length === b.length && timingSafeEqual(a, b);
}
