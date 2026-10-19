jest.mock("@vercel/queue", () => ({
  QueueClient: jest.fn(() => ({ send: jest.fn() })),
}));
import { QueueClient } from "@vercel/queue";

import {
  enqueueSelectionEmailBatch,
  enqueueSelectionEmailEvent,
  selectionEmailQueueId,
  selectionEmailQueueRetry,
  safelyProcessSelectionEmail,
} from "infra/selection-email-queue";

const id = "7b10e151-3dc8-4b86-9af0-8252fb119ed4";
const send = jest.mocked(QueueClient).mock.results[0].value.send as jest.Mock;
const originalEnv = { ...process.env };
afterEach(() => {
  process.env = { ...originalEnv };
  send.mockReset();
});

test("publishes only identifiers with seven-day retention and requested delay", async () => {
  process.env.OUTLET_SELECTION_EMAILS_ENABLED = "true";
  await enqueueSelectionEmailEvent(id);
  await enqueueSelectionEmailBatch(id, 90);
  expect(send.mock.calls).toEqual([
    [
      "selection-email-fanout",
      { eventId: id },
      { retentionSeconds: 604800, delaySeconds: 0 },
    ],
    [
      "selection-email-send",
      { batchId: id },
      { retentionSeconds: 604800, delaySeconds: 90 },
    ],
  ]);
});

test("disabled enqueue is a no-op and malformed payloads never dispatch", async () => {
  delete process.env.OUTLET_SELECTION_EMAILS_ENABLED;
  await enqueueSelectionEmailEvent(id);
  expect(send).not.toHaveBeenCalled();
  expect(() =>
    selectionEmailQueueId(
      { eventId: id, email: "private@example.com" },
      "eventId",
    ),
  ).toThrow();
  await expect(enqueueSelectionEmailBatch("invalid")).rejects.toThrow();
});

test("honors Retry-After and never drops messages based solely on delivery count", () => {
  expect(
    selectionEmailQueueRetry({ retryAfterSeconds: 400 }, { deliveryCount: 1 }),
  ).toEqual({ afterSeconds: 400 });
  expect(
    selectionEmailQueueRetry(new Error("failure"), { deliveryCount: 99 }),
  ).toEqual({ afterSeconds: 3600 });
});

test("removes arbitrary error context before the SDK logs a failure", async () => {
  try {
    await safelyProcessSelectionEmail(async () => {
      throw Object.assign(new Error("private@example.com"), {
        retryAfterSeconds: 120,
        sql: "private content",
      });
    });
    throw new Error("Expected rejection");
  } catch (error) {
    expect(error.message).toBe("Selection email processing failed");
    expect(error.retryAfterSeconds).toBe(120);
    expect(JSON.stringify(error)).not.toContain("private");
  }
});
