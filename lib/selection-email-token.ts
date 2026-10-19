import { createHmac, timingSafeEqual } from "node:crypto";

function secret() {
  const value = process.env.SELECTION_EMAIL_UNSUBSCRIBE_SECRET;
  if (value && value.length >= 32) return value;
  if (process.env.NODE_ENV !== "production")
    return "local-only-selection-email-token-secret";
  throw new Error("Selection email unsubscribe secret is not configured");
}

export function selectionEmailUnsubscribeToken(
  subscriptionId: string,
  generation: number,
) {
  const payload = Buffer.from(
    JSON.stringify({ s: subscriptionId, g: generation }),
  ).toString("base64url");
  const signature = createHmac("sha256", secret())
    .update(`selection-email-unsubscribe/v1/${payload}`)
    .digest("base64url");
  return `${payload}.${signature}`;
}

export function parseSelectionEmailUnsubscribeToken(
  token: string,
): { id: string; generation: number } | null {
  if (token.length > 512) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const expected = createHmac("sha256", secret())
    .update(`selection-email-unsubscribe/v1/${parts[0]}`)
    .digest();
  const actual = Buffer.from(parts[1], "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return null;
  try {
    const data = JSON.parse(
      Buffer.from(parts[0], "base64url").toString("utf8"),
    );
    if (
      typeof data.s !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(data.s) ||
      !Number.isSafeInteger(data.g) ||
      data.g < 1
    )
      return null;
    return { id: data.s, generation: data.g };
  } catch {
    return null;
  }
}
