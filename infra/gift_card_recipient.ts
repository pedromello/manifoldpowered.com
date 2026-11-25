import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";
import { ServiceError } from "infra/errors";

const document = z
  .string()
  .regex(/^\d{11}$|^\d{14}$/)
  .optional();
const legacyRecipient = z.strictObject({
  name: z.string().trim().min(1).max(160),
  document,
});
const splitRecipient = z
  .strictObject({
    first_name: z.string().trim().min(1).max(80),
    last_name: z.string().trim().min(1).max(80),
    document,
  })
  .refine(
    ({ first_name, last_name }) => first_name.length + last_name.length < 160,
  );
const schema = z.union([legacyRecipient, splitRecipient]);
const confirmed = z.literal(true);

export const giftRecipientConfirmation = z.union([
  legacyRecipient
    .extend({ confirmed })
    .transform(({ name, document }) => ({ name, document })),
  splitRecipient
    .safeExtend({ confirmed })
    .transform(({ first_name, last_name, document }) => ({
      first_name,
      last_name,
      document,
    })),
]);

function key() {
  const value = process.env.GIFT_CARD_RECIPIENT_ENCRYPTION_KEY;
  if (!value || !/^[a-fA-F0-9]{64}$/.test(value))
    throw new ServiceError({
      message: "Gift card delivery is not configured.",
    });
  return Buffer.from(value, "hex");
}
export function encryptGiftRecipient(
  input: z.infer<typeof schema>,
  orderId: string,
) {
  const value = schema.parse(input),
    nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), nonce);
  cipher.setAAD(Buffer.from(orderId));
  const data = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    nonce.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    data.toString("base64url"),
  ].join(".");
}
export function decryptGiftRecipient(
  value: string,
  orderId: string,
): {
  name: string;
  document?: string;
  first_name?: string;
  last_name?: string;
} {
  try {
    const [version, nonce, tag, data] = value.split(".");
    if (version !== "v1") throw new Error();
    const cipher = createDecipheriv(
      "aes-256-gcm",
      key(),
      Buffer.from(nonce, "base64url"),
    );
    cipher.setAAD(Buffer.from(orderId));
    cipher.setAuthTag(Buffer.from(tag, "base64url"));
    const recipient = schema.parse(
      JSON.parse(
        Buffer.concat([
          cipher.update(Buffer.from(data, "base64url")),
          cipher.final(),
        ]).toString("utf8"),
      ),
    );
    return "name" in recipient
      ? recipient
      : {
          ...recipient,
          name: `${recipient.first_name} ${recipient.last_name}`,
        };
  } catch {
    throw new ServiceError({
      message: "Gift card delivery details require review.",
    });
  }
}
