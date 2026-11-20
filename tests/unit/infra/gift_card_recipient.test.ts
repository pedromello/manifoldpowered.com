import {
  decryptGiftRecipient,
  encryptGiftRecipient,
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
