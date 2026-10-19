import { QueueClient, type MessageMetadata } from "@vercel/queue";
import { selectionEmailsEnabled } from "lib/selection-email-config";

export const selectionEmailQueue = new QueueClient();
const RETENTION_SECONDS = 7 * 24 * 60 * 60;
const identifier =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function selectionEmailQueueId(
  value: unknown,
  field: "eventId" | "batchId",
) {
  if (
    !value ||
    typeof value !== "object" ||
    Object.keys(value).length !== 1 ||
    typeof value[field] !== "string" ||
    !identifier.test(value[field])
  ) {
    throw new Error("Invalid selection email queue message");
  }
  return value[field] as string;
}

async function enqueue(
  topic: "selection-email-fanout" | "selection-email-send",
  field: "eventId" | "batchId",
  id: string,
  delaySeconds = 0,
) {
  selectionEmailQueueId({ [field]: id }, field);
  if (!selectionEmailsEnabled()) return;
  if (
    !Number.isInteger(delaySeconds) ||
    delaySeconds < 0 ||
    delaySeconds >= RETENTION_SECONDS
  ) {
    throw new Error("Invalid selection email queue delay");
  }
  // DB uniqueness and leases are authoritative. Do not deduplicate re-enqueues:
  // an event may need another page and a batch may have a later due time.
  await selectionEmailQueue.send(
    topic,
    { [field]: id },
    { retentionSeconds: RETENTION_SECONDS, delaySeconds },
  );
}

export function enqueueSelectionEmailEvent(id: string, delaySeconds = 0) {
  return enqueue("selection-email-fanout", "eventId", id, delaySeconds);
}

export function enqueueSelectionEmailBatch(id: string, delaySeconds = 0) {
  return enqueue("selection-email-send", "batchId", id, delaySeconds);
}

export function selectionEmailQueueRetry(
  error: unknown,
  metadata: Pick<MessageMetadata, "deliveryCount">,
) {
  const requested =
    error && typeof error === "object" && "retryAfterSeconds" in error
      ? Number(error.retryAfterSeconds)
      : 0;
  const backoff = Math.min(3600, 5 * 2 ** Math.min(metadata.deliveryCount, 10));
  // The model marks permanent failures terminal before returning successfully.
  // Never acknowledge solely because a delivery-count threshold was reached.
  return {
    afterSeconds:
      Number.isFinite(requested) && requested > 0
        ? Math.min(RETENTION_SECONDS, Math.max(backoff, Math.ceil(requested)))
        : backoff,
  };
}

export async function safelyProcessSelectionEmail(
  work: () => Promise<unknown>,
) {
  try {
    await work();
  } catch (error) {
    const retryAfterSeconds =
      error && typeof error === "object" && "retryAfterSeconds" in error
        ? Number(error.retryAfterSeconds)
        : 60;
    // The SDK logs thrown errors. Discard arbitrary DB/provider error context.
    throw Object.assign(new Error("Selection email processing failed"), {
      retryAfterSeconds:
        Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? retryAfterSeconds
          : 60,
    });
  }
}
