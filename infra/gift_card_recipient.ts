import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";
import { ServiceError } from "infra/errors";

const schema = z
  .object({
    name: z.string().trim().min(1).max(160),
    document: z
      .string()
      .regex(/^\d{11}$|^\d{14}$/)
      .optional(),
  })
  .strict();
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
export function decryptGiftRecipient(value: string, orderId: string) {
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
    return schema.parse(
      JSON.parse(
        Buffer.concat([
          cipher.update(Buffer.from(data, "base64url")),
          cipher.final(),
        ]).toString("utf8"),
      ),
    );
  } catch {
    throw new ServiceError({
      message: "Gift card delivery details require review.",
    });
  }
}
