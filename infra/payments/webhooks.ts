import { z } from "zod";
import { timingSafeEqual } from "node:crypto";
import { NotFoundError, ValidationError } from "infra/errors";

const paymentLinkId = z
  .union([z.number().int().positive(), z.string().regex(/^[1-9][0-9]*$/)])
  .transform(String)
  .nullish();

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
      data: z.object({
        id: z.number().int().positive(),
        payment_link_id: paymentLinkId,
      }),
    })
    .safeParse(body);
  if (!parsed.success)
    throw new ValidationError({ message: "Invalid payment notification." });
  if (!events.has(parsed.data.event)) return null;
  // The panel emits environment="production" even for sandbox. It is not authority.
  return {
    remote_order_id: parsed.data.data.payment_link_id
      ? `link:${parsed.data.data.payment_link_id}`
      : String(parsed.data.data.id),
    event: parsed.data.event,
  };
}
export function acceptsAppmaxWebhookToken(value: unknown) {
  return matchesWebhookToken(value, process.env.APPMAX_WEBHOOK_TOKEN);
}

function matchesWebhookToken(value: unknown, expected: string | undefined) {
  if (!expected || expected.length < 32 || typeof value !== "string")
    return false;
  const a = Buffer.from(expected),
    b = Buffer.from(value);
  return a.length === b.length && timingSafeEqual(a, b);
}

const appstoreOrderEvents = new Set([
  "order_authorized",
  "order_authorized_with_delay",
  "order_approved",
  "order_paid",
  "order_pending_integration",
  "order_refund",
  "order_partial_refund",
  "order_pix_created",
  "order_paid_by_pix",
  "order_pix_expired",
  "order_integrated",
  "order_refused_by_risk",
  "order_chargeback_in_treatment",
  "order_charge_back_gain",
]);
const appstorePaymentEvents = new Set([
  "payment_authorized_with_delay",
  "payment_not_authorized",
]);
const appstoreEnvelope = z.object({
  app_id: z.guid(),
  site_id: z.guid(),
  event: z.string().min(1).max(100),
  event_type: z.string().min(1).max(100),
  data: z.object({
    order_id: z.unknown().optional(),
    payment_link_id: z.unknown().optional(),
  }),
});
const remoteOrderId = z.number().int().positive();

function appstoreWebhookNotFound() {
  return new NotFoundError({
    message: "Not found.",
    action: "Check the webhook URL and application configuration.",
  });
}

function invalidAppstoreNotification() {
  return new ValidationError({
    message: "Invalid payment notification.",
    action: "Send an Appmax Appstore webhook with the documented fields.",
  });
}

export function decodeAppmaxAppstorePaymentWebhook(
  body: unknown,
  token: unknown,
) {
  const app = z.guid().safeParse(process.env.APPMAX_APPSTORE_APP_ID);
  const expectedToken = process.env.APPMAX_APPSTORE_WEBHOOK_TOKEN;
  if (
    process.env.VERCEL_ENV === "production" ||
    !app.success ||
    !expectedToken ||
    !/^[A-Za-z0-9_-]{32,128}$/.test(expectedToken) ||
    !matchesWebhookToken(token, expectedToken)
  ) {
    throw appstoreWebhookNotFound();
  }

  const parsed = appstoreEnvelope.safeParse(body);
  if (!parsed.success) throw invalidAppstoreNotification();
  const { app_id, event, event_type, data } = parsed.data;
  if (app_id.toLowerCase() !== app.data.toLowerCase()) {
    throw appstoreWebhookNotFound();
  }

  const orderEvent = appstoreOrderEvents.has(event);
  const paymentEvent = appstorePaymentEvents.has(event);
  if (!orderEvent && !paymentEvent) return null;

  const id = remoteOrderId.safeParse(data.order_id);
  const link = paymentLinkId.safeParse(data.payment_link_id);
  if (
    !id.success ||
    !link.success ||
    event_type !== (orderEvent ? "order" : "payment")
  ) {
    throw invalidAppstoreNotification();
  }
  return link.data ? `link:${link.data}` : String(id.data);
}
