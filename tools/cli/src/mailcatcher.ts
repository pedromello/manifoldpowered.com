import { CliError } from "./errors";
type Message = {
  id: number;
  recipients: string[];
  subject: string;
  created_at: string;
};
async function messages(requestFetch: typeof fetch): Promise<Message[]> {
  const response = await requestFetch("http://localhost:1080/messages", {
    redirect: "error",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error();
  const value = await response.json();
  if (!Array.isArray(value)) throw new Error();
  return value;
}
export async function mailcatcherWatermark(requestFetch: typeof fetch = fetch) {
  try {
    const entries = await messages(requestFetch);
    return entries.reduce(
      (last, entry) =>
        Number.isSafeInteger(entry.id) ? Math.max(last, entry.id) : last,
      0,
    );
  } catch {
    // Local signup/login also works without Mailcatcher (e.g. real SMTP).
    return undefined;
  }
}
export async function readVerificationEmail(options: {
  email: string;
  requestedAt: string;
  origin: string;
  kind: "activation" | "otp";
  afterId?: number;
  fetch?: typeof fetch;
}): Promise<string | null> {
  const requestFetch = options.fetch ?? fetch;
  let entries: Message[];
  try {
    entries = await messages(requestFetch);
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
  const requestedAt = Date.parse(options.requestedAt);
  const matching = entries
    .filter(
      (message) =>
        Number.isSafeInteger(message.id) &&
        (options.afterId === undefined || message.id > options.afterId) &&
        message.subject === subject &&
        // Mailcatcher emits UTC without a suffix and truncates milliseconds.
        // The pre-request ID watermark disambiguates messages within a second.
        (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(message.created_at)
          ? Date.parse(`${message.created_at.replace(" ", "T")}Z`) >=
            Math.floor(requestedAt / 1000) * 1000
          : Date.parse(message.created_at) >= requestedAt) &&
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
