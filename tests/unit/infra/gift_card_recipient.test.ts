import {
  decryptGiftRecipient,
  encryptGiftRecipient,
  giftRecipientConfirmation,
} from "infra/gift_card_recipient";

const original = process.env.GIFT_CARD_RECIPIENT_ENCRYPTION_KEY;
beforeEach(() => {
  process.env.GIFT_CARD_RECIPIENT_ENCRYPTION_KEY = "11".repeat(32);
});
afterEach(() => {
  if (original === undefined)
    delete process.env.GIFT_CARD_RECIPIENT_ENCRYPTION_KEY;
  else process.env.GIFT_CARD_RECIPIENT_ENCRYPTION_KEY = original;
});

test("binds encrypted delivery data to its order and uses unique nonces", () => {
  const details = { name: "Sample Buyer", document: "00000000000" };
  const first = encryptGiftRecipient(details, "order-a"),
    second = encryptGiftRecipient(details, "order-a");
  expect(first).not.toBe(second);
  expect(first).not.toContain(details.name);
  expect(decryptGiftRecipient(first, "order-a")).toEqual(details);
  expect(() => decryptGiftRecipient(first, "order-b")).toThrow(
    "require review",
  );
});
test("invalid keys and modified ciphertext fail without echoing input", () => {
  const encrypted = encryptGiftRecipient({ name: "Sample Buyer" }, "order-a");
  expect(() => decryptGiftRecipient(encrypted.slice(0, -5), "order-a")).toThrow(
    "require review",
  );
  process.env.GIFT_CARD_RECIPIENT_ENCRYPTION_KEY = "invalid";
  expect(() =>
    encryptGiftRecipient({ name: "Sample Buyer" }, "order-a"),
  ).toThrow("not configured");
});

test("retains encrypted split names and joins them for issuance", () => {
  const details = {
    first_name: "María Luísa",
    last_name: "da Silva",
    document: "00000000000",
  };
  const confirmed = giftRecipientConfirmation.parse({
    ...details,
    first_name: ` ${details.first_name} `,
    confirmed: true,
  });
  expect(confirmed).toEqual(details);
  const encrypted = encryptGiftRecipient(confirmed, "order-a");
  expect(encrypted).not.toContain(details.first_name);
  expect(encrypted).not.toContain(details.last_name);
  expect(decryptGiftRecipient(encrypted, "order-a")).toEqual({
    ...details,
    name: "María Luísa da Silva",
  });
  expect(
    giftRecipientConfirmation.safeParse({
      ...details,
      last_name: " ",
      confirmed: true,
    }).success,
  ).toBe(false);
});
