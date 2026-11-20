import type { NextApiRequest } from "next";
import { z } from "zod";
import { ForbiddenError, ValidationError } from "infra/errors";
import { manualTrackingEnabled } from "infra/runtime";
import operations from "models/gift_card_operations";

export const operationActionSchema = z.enum([
  "sync-catalog",
  "reconcile-payments",
  "submit-paid-orders",
  "track-deliveries",
]);
export type OperationAction = z.infer<typeof operationActionSchema>;

export function requireSameOriginJson(req: NextApiRequest) {
  const contentType = req.headers["content-type"]?.split(";", 1)[0];
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (contentType !== "application/json" || typeof origin !== "string" || !host)
    throw new ForbiddenError({ message: "This request is not permitted." });
  let valid = false;
  try {
    const parsed = new URL(origin);
    valid =
      parsed.origin === origin &&
      parsed.host === host &&
      (parsed.protocol === "https:" ||
        (parsed.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(parsed.hostname)));
  } catch {
    // Invalid origins fail closed without echoing request data.
  }
  if (!valid)
    throw new ForbiddenError({ message: "This request is not permitted." });
}

export async function runGiftCardOperation(
  action: OperationAction,
  body: unknown,
  { cron = false } = {},
) {
  if (action === "track-deliveries") {
    const parsed = z
      .object({ order_id: z.uuid().optional(), force: z.boolean().optional() })
      .strict()
      .safeParse(body ?? {});
    if (!parsed.success || (parsed.data.force && !parsed.data.order_id))
      throw new ValidationError({
        message: "Please check the operation details.",
      });
    if (parsed.data.force && (cron || !manualTrackingEnabled()))
      throw new ForbiddenError({ message: "This request is not permitted." });
    return operations.trackDeliveries(parsed.data);
  }
  if (
    !z
      .object({})
      .strict()
      .safeParse(body ?? {}).success
  )
    throw new ValidationError({
      message: "This operation accepts an empty body.",
    });
  if (action === "sync-catalog") return operations.syncCatalog();
  if (action === "reconcile-payments") return operations.reconcilePayments();
  return operations.submitPaidOrders();
}
