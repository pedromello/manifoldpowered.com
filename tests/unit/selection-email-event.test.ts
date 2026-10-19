jest.mock("infra/database", () => ({ prisma: { $transaction: jest.fn() } }));
jest.mock("infra/selection-email-queue", () => ({
  enqueueSelectionEmailEvent: jest.fn(),
  enqueueSelectionEmailBatch: jest.fn(),
}));

import { prisma } from "infra/database";
import {
  enqueueSelectionEmailEvent,
  enqueueSelectionEmailBatch,
} from "infra/selection-email-queue";
import {
  processSelectionEmailEvent,
  recordSelectionEmailPublication,
} from "models/selection_email_event";

const eventId = "7b10e151-3dc8-4b86-9af0-8252fb119ed4";
const occurredAt = new Date("2026-10-19T12:00:00Z");
const originalEnv = { ...process.env };
const transaction = jest.mocked(prisma.$transaction);

function fixture(count = 0, live = true, claimed = true) {
  const recipients = Array.from({ length: count }, (_, i) => ({
    subscription_id: `subscription-${i.toString().padStart(4, "0")}`,
    user_id: `user-${i}`,
    generation: 1,
    email_version: 0,
    recipient_email: `recipient-${i}@example.com`,
  }));
  const tx = {
    $queryRaw: jest
      .fn()
      .mockResolvedValueOnce(
        claimed
          ? [
              {
                id: eventId,
                selection_id: "selection",
                store_id: "store",
                revision_id: "revision",
                occurred_at: occurredAt,
                fanout_cursor: null,
              },
            ]
          : [],
      )
      .mockResolvedValueOnce(live ? [{ id: "selection" }] : [])
      .mockResolvedValueOnce(recipients),
    selectionEmailEvent: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      createManyAndReturn: jest.fn(),
    },
    selectionEmailDelivery: {
      createManyAndReturn: jest.fn().mockImplementation(async ({ data }) =>
        data.map((row, i) => ({
          id: `delivery-${i}`,
          subscription_id: row.subscription_id,
        })),
      ),
      updateMany: jest.fn().mockResolvedValue({ count: 100 }),
    },
    selectionEmailBatch: {
      create: jest.fn().mockResolvedValue({ id: "created" }),
    },
  };
  transaction.mockImplementation(async (work: (client: unknown) => unknown) =>
    work(tx),
  );
  return tx;
}

beforeEach(() => {
  process.env.OUTLET_SELECTION_EMAILS_ENABLED = "true";
});
afterEach(() => {
  process.env = { ...originalEnv };
  jest.clearAllMocks();
});

test("feature disabled never creates or processes historical events", async () => {
  delete process.env.OUTLET_SELECTION_EMAILS_ENABLED;
  const tx = fixture();
  await expect(
    recordSelectionEmailPublication(tx as never, {
      selectionId: "selection",
      storeId: "store",
      revisionId: "revision",
      occurredAt,
    }),
  ).resolves.toBeNull();
  await expect(processSelectionEmailEvent(eventId)).resolves.toEqual({
    status: "DISABLED",
    deliveries: 0,
  });
  expect(transaction).not.toHaveBeenCalled();
  expect(tx.selectionEmailEvent.createManyAndReturn).not.toHaveBeenCalled();
});

test("records the event inside the caller transaction using selection uniqueness", async () => {
  const tx = fixture();
  tx.selectionEmailEvent.createManyAndReturn
    .mockResolvedValueOnce([{ id: eventId }])
    .mockResolvedValueOnce([]);
  const input = {
    selectionId: "selection",
    storeId: "store",
    revisionId: "revision",
    occurredAt,
  };
  await expect(
    recordSelectionEmailPublication(tx as never, input),
  ).resolves.toBe(eventId);
  await expect(
    recordSelectionEmailPublication(tx as never, input),
  ).resolves.toBeNull();
  expect(tx.selectionEmailEvent.createManyAndReturn).toHaveBeenCalledWith(
    expect.objectContaining({ skipDuplicates: true }),
  );
});

test("a lease held by another worker causes no recipient work or dispatch", async () => {
  const tx = fixture(0, true, false);
  await expect(processSelectionEmailEvent(eventId)).resolves.toEqual({
    status: "NOOP",
    deliveries: 0,
  });
  expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  expect(enqueueSelectionEmailBatch).not.toHaveBeenCalled();
});

test("a withdrawn selection or outlet cancels fan-out before materializing recipients", async () => {
  const tx = fixture(0, false);
  await expect(processSelectionEmailEvent(eventId)).resolves.toEqual({
    status: "CANCELLED",
    deliveries: 0,
  });
  expect(tx.selectionEmailEvent.updateMany).toHaveBeenCalledWith(
    expect.objectContaining({
      data: { status: "CANCELLED", lease_token: null, lease_until: null },
    }),
  );
  expect(tx.selectionEmailDelivery.createManyAndReturn).not.toHaveBeenCalled();
});

test("bounds a page to 500 recipients, creates five batches and commits cursor before queue dispatch", async () => {
  const tx = fixture(501);
  await expect(processSelectionEmailEvent(eventId)).resolves.toEqual({
    status: "FANOUT",
    deliveries: 500,
  });
  expect(
    tx.selectionEmailDelivery.createManyAndReturn.mock.calls[0][0].data,
  ).toHaveLength(500);
  expect(tx.selectionEmailBatch.create).toHaveBeenCalledTimes(5);
  for (const [args] of tx.selectionEmailDelivery.updateMany.mock.calls)
    expect(args.where.id.in).toHaveLength(100);
  expect(tx.selectionEmailEvent.updateMany).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        fanout_cursor: "subscription-0499",
        status: "FANOUT",
      }),
    }),
  );
  expect(enqueueSelectionEmailBatch).toHaveBeenCalledTimes(5);
  expect(enqueueSelectionEmailEvent).toHaveBeenCalledWith(eventId);
  const lastWrite =
    tx.selectionEmailEvent.updateMany.mock.invocationCallOrder[0];
  expect(
    jest.mocked(enqueueSelectionEmailBatch).mock.invocationCallOrder[0],
  ).toBeGreaterThan(lastWrite);
});

test("the last page finishes fan-out and creates no empty batch", async () => {
  const tx = fixture();
  await expect(processSelectionEmailEvent(eventId)).resolves.toEqual({
    status: "COMPLETE",
    deliveries: 0,
  });
  expect(tx.selectionEmailBatch.create).not.toHaveBeenCalled();
  expect(tx.selectionEmailEvent.updateMany).toHaveBeenCalledWith(
    expect.objectContaining({
      data: { status: "COMPLETE", lease_token: null, lease_until: null },
    }),
  );
  expect(enqueueSelectionEmailEvent).not.toHaveBeenCalled();
});

test("dispatch failures leave committed work recoverable and return a sanitized retry", async () => {
  const tx = fixture(1);
  jest
    .mocked(enqueueSelectionEmailBatch)
    .mockRejectedValueOnce(new Error("private@example.com"));
  await expect(processSelectionEmailEvent(eventId)).rejects.toMatchObject({
    message: "Selection email dispatch is pending",
    retryAfterSeconds: 60,
  });
  expect(tx.selectionEmailEvent.updateMany).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ status: "COMPLETE" }),
    }),
  );
});
