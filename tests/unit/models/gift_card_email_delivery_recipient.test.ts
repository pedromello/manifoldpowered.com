import { prisma } from "infra/database";
import type { EmailGiftProvider, EmailGiftTracking } from "infra/gift_card_api";
import { decryptGiftRecipient } from "infra/gift_card_recipient";
import { createEmailGiftDelivery } from "models/gift_card_email_delivery";

jest.mock("infra/database", () => ({
  prisma: { $transaction: jest.fn() },
}));
jest.mock("infra/gift_card_recipient", () => ({
  decryptGiftRecipient: jest.fn(),
}));

const original = { ...process.env };
const id = "synthetic-gift-order";
const recipient = { name: "Synthetic Buyer" };

beforeEach(() => {
  process.env.GIFT_CARD_PROVIDER = "api";
  process.env.PAYMENT_ENVIRONMENT = "sandbox";
  delete process.env.GIFT_CARD_PROVIDER_DOCUMENT_REQUIRED;
  jest.mocked(decryptGiftRecipient).mockReset().mockReturnValue(recipient);
  (prisma.$transaction as jest.Mock).mockReset();
});

afterEach(() => {
  process.env = { ...original };
  jest.restoreAllMocks();
});

function fixture() {
  const now = new Date();
  const gift = {
    id,
    user_id: "synthetic-buyer",
    status: "PAID",
    delivery_channel: "EMAIL",
    paid_at: now,
    recipient_confirmed_at: now,
    recipient_email: "buyer@example.test",
    recipient_data: "synthetic-encrypted-recipient",
    provider_sku: "synthetic-sku",
    provider_environment: "sandbox",
    amount_minor: 2500,
    fulfillment_status: "QUEUED",
    issuance_started_at: null as Date | null,
    submitted_at: null as Date | null,
    last_tracking_at: null as Date | null,
    next_tracking_at: null as Date | null,
    provider_reference: null as string | null,
    provider_status: null as number | null,
    last_error: null as string | null,
  };
  const purchase = {
    id: "synthetic-purchase",
    payment_status: "PAID",
    delivery_status: "PENDING",
  };
  const job = { claim_token: null as string | null };
  const tx = {
    $queryRaw: jest
      .fn()
      .mockResolvedValueOnce([{ order_id: id }])
      .mockResolvedValueOnce([{ ...purchase }])
      .mockResolvedValueOnce([{ id }])
      .mockResolvedValueOnce([
        { run_after: new Date(0), claim_until: null, now },
      ])
      .mockImplementationOnce(async () => [{ ...purchase }])
      .mockResolvedValueOnce([{ id }])
      .mockImplementationOnce(async () => [
        { claim_token: job.claim_token, valid: true },
      ]),
    giftCardOrder: {
      findUniqueOrThrow: jest.fn(async () => ({ ...gift })),
      update: jest.fn(async ({ data }: { data: Partial<typeof gift> }) =>
        Object.assign(gift, data),
      ),
    },
    purchaseOrder: {
      updateMany: jest.fn(
        async ({ data }: { data: Partial<typeof purchase> }) => {
          Object.assign(purchase, data);
          return { count: 1 };
        },
      ),
      update: jest.fn(),
    },
    giftCardFulfillmentJob: {
      update: jest.fn(async ({ data }: { data: Partial<typeof job> }) =>
        Object.assign(job, data),
      ),
      delete: jest.fn(),
    },
    libraryItem: { upsert: jest.fn() },
  };
  (prisma.$transaction as jest.Mock).mockImplementation(
    async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
  );
  const pending: EmailGiftTracking = {
    status: "pending",
    reference: "synthetic-reference",
    provider_status: 1,
  };
  const provider = {
    products: jest.fn<ReturnType<EmailGiftProvider["products"]>, []>(),
    submit: jest
      .fn<
        ReturnType<EmailGiftProvider["submit"]>,
        Parameters<EmailGiftProvider["submit"]>
      >()
      .mockResolvedValue(pending),
    track: jest
      .fn<
        ReturnType<EmailGiftProvider["track"]>,
        Parameters<EmailGiftProvider["track"]>
      >()
      .mockResolvedValue(pending),
  };
  return {
    gift,
    purchase,
    tx,
    provider,
    service: createEmailGiftDelivery({ getProvider: () => provider }),
  };
}

test.each(["missing document", "unreadable recipient"])(
  "a paid email gift with %s enters review before issuance",
  async (failure) => {
    const { gift, purchase, tx, provider, service } = fixture();
    if (failure === "unreadable recipient")
      jest.mocked(decryptGiftRecipient).mockImplementation(() => {
        throw new Error("Synthetic unreadable recipient");
      });

    expect(await service.runOneDetailed("submit", { order_id: id })).toEqual({
      processed: true,
      error_code: "RECIPIENT_REVIEW",
      provider_error: null,
    });

    expect(gift).toMatchObject({
      status: "PAID",
      fulfillment_status: "REVIEW",
      last_error: "RECIPIENT_REVIEW",
      issuance_started_at: null,
      submitted_at: null,
    });
    expect(purchase).toMatchObject({
      payment_status: "PAID",
      delivery_status: "REVIEW",
    });
    expect(tx.giftCardFulfillmentJob.delete).toHaveBeenCalledWith({
      where: { order_id: id },
    });
    expect(tx.giftCardFulfillmentJob.update).not.toHaveBeenCalled();
    expect(provider.submit).not.toHaveBeenCalled();
    expect(provider.track).not.toHaveBeenCalled();
  },
);

test.each(["issuance", "submitted"] as const)(
  "an existing %s marker reconciles by tracking without decrypting or resubmitting",
  async (marker) => {
    const { gift, purchase, provider, service } = fixture();
    const started = new Date(Date.now() - 60000);
    gift.issuance_started_at = started;
    if (marker === "submitted") gift.submitted_at = started;
    gift.recipient_data = "synthetic-unreadable-recipient";
    jest.mocked(decryptGiftRecipient).mockImplementation(() => {
      throw new Error("Synthetic unreadable recipient");
    });

    expect(
      await service.runOneDetailed(
        marker === "submitted" ? "track" : "submit",
        {
          order_id: id,
        },
      ),
    ).toMatchObject({ processed: true, error_code: null });

    expect(decryptGiftRecipient).not.toHaveBeenCalled();
    expect(provider.track).toHaveBeenCalledTimes(1);
    expect(provider.track).toHaveBeenCalledWith(id);
    expect(provider.submit).not.toHaveBeenCalled();
    expect(gift.issuance_started_at).toEqual(started);
    expect(gift.fulfillment_status).toBe("PROCESSING");
    expect(purchase.payment_status).toBe("PAID");
  },
);

test.each(["document present", "explicit optional document"])(
  "%s permits a single email-gift submission",
  async (configuration) => {
    const details =
      configuration === "document present"
        ? { ...recipient, document: "00000000000" }
        : recipient;
    if (configuration === "explicit optional document")
      process.env.GIFT_CARD_PROVIDER_DOCUMENT_REQUIRED = "false";
    jest.mocked(decryptGiftRecipient).mockReturnValue(details);
    const { gift, purchase, provider, service } = fixture();

    expect(
      await service.runOneDetailed("submit", { order_id: id }),
    ).toMatchObject({ processed: true, error_code: null });

    expect(provider.submit).toHaveBeenCalledTimes(1);
    expect(provider.submit).toHaveBeenCalledWith({
      request_id: id,
      sku: "synthetic-sku",
      amount_minor: 2500,
      recipient: { ...details, email: "buyer@example.test" },
    });
    expect(provider.track).not.toHaveBeenCalled();
    expect(gift.issuance_started_at).toEqual(expect.any(Date));
    expect(gift.fulfillment_status).toBe("PROCESSING");
    expect(purchase.payment_status).toBe("PAID");
  },
);
