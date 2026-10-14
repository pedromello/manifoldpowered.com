import { CliError } from "./errors";
export async function readVerificationEmail(options: {
  email: string;
  requestedAt: string;
  origin: string;
  kind: "activation" | "otp";
  fetch?: typeof fetch;
}): Promise<string | null> {
  const requestFetch = options.fetch ?? fetch;
  let messages: Array<{
    id: number;
    recipients: string[];
    subject: string;
    created_at: string;
  }>;
  try {
    const response = await requestFetch("http://localhost:1080/messages", {
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error();
    messages = await response.json();
  } catch {
    throw new CliError(
      "MAILCATCHER_UNAVAILABLE",
      "O Mailcatcher local não respondeu.",
      1,
      undefined,
      true,
    );
  }
  const subject =
    options.kind === "activation"
      ? "One step away — activate your Manifold account"
      : "Your Manifold login code";
  const matching = messages
    .filter(
      (message) =>
        Number.isSafeInteger(message.id) &&
        message.subject === subject &&
        Date.parse(message.created_at) >= Date.parse(options.requestedAt) &&
        message.recipients.some(
          (recipient) =>
            recipient.replace(/^<|>$/g, "").toLowerCase() ===
            options.email.toLowerCase(),
        ),
    )
    .sort((a, b) => b.id - a.id);
  for (const message of matching) {
    const response = await requestFetch(
      `http://localhost:1080/messages/${message.id}.plain`,
      { redirect: "error", signal: AbortSignal.timeout(5000) },
    );
    if (!response.ok) continue;
    const text = await response.text();
    if (options.kind === "otp") return /\b\d{6}\b/.exec(text)?.[0] ?? null;
    const links =
      text.match(/https?:\/\/[^\s]+\/signup\/activate\/[0-9a-f-]{36}/gi) ?? [];
    const link = links.find(
      (value) => new URL(value).origin === options.origin,
    );
    if (link) return link;
  }
  return null;
}
