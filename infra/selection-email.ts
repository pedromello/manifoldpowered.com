import { createHash } from "node:crypto";
import nodemailer from "nodemailer";
import { selectionEmailsEnabled } from "lib/selection-email-config";

export interface SelectionEmailContent {
  locale: string;
  outlet: { name: string; slug: string; logo_url?: string | null };
  selection: {
    title: string;
    description?: string | null;
    cover_url?: string | null;
    slug: string;
  };
  games: { title: string; slug: string; image_url?: string | null }[];
  unsubscribeUrl: string;
  preferencesUrl: string;
  publicUrl: string;
}

export interface SelectionEmailMessage {
  from?: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}

export class SelectionEmailTransportError extends Error {
  constructor(
    public readonly kind: "permanent" | "retryable" | "uncertain",
    public readonly retryAfterSeconds = 60,
    public readonly code = "email_transport_failed",
  ) {
    // Provider responses can include recipients or body excerpts. Never retain them.
    super("Selection email delivery failed");
    this.name = "SelectionEmailTransportError";
  }
}

const copy = {
  en: {
    subject: (outlet: string) => `${outlet} published a new selection`,
    eyebrow: "A NEW SELECTION FOR YOU",
    explore: "Explore selection",
    games: "A taste of the selection",
    reason: (outlet: string) =>
      `You received this email because you enabled new selection emails from ${outlet} on Manifold.`,
    unsubscribe: "Turn off emails from this outlet",
    preferences: "Manage preferences",
  },
  "pt-BR": {
    subject: (outlet: string) => `${outlet} publicou uma nova seleção`,
    eyebrow: "UMA NOVA SELEÇÃO PARA VOCÊ",
    explore: "Explorar seleção",
    games: "Um gostinho da seleção",
    reason: (outlet: string) =>
      `Você recebeu este e-mail porque ativou os avisos de novas seleções de ${outlet} no Manifold.`,
    unsubscribe: "Desativar avisos desta outlet",
    preferences: "Gerenciar preferências",
  },
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[character]!;
  });
}

function safeUrl(value?: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const local =
      process.env.NODE_ENV !== "production" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      url.username ||
      url.password ||
      (url.protocol !== "https:" && !(local && url.protocol === "http:"))
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function requiredUrl(value: string) {
  const safe = safeUrl(value);
  if (!safe) throw new Error("Invalid selection email link");
  return safe;
}

/** Render only published, frozen content; curator text is never translated or interpreted as HTML. */
export function renderSelectionEmail(content: SelectionEmailContent) {
  const locale = content.locale === "pt-BR" ? "pt-BR" : "en";
  const t = copy[locale];
  const publicUrl = requiredUrl(content.publicUrl);
  const unsubscribeUrl = requiredUrl(content.unsubscribeUrl);
  const preferencesUrl = requiredUrl(content.preferencesUrl);
  const origin = new URL(publicUrl).origin;
  const brandLogo = `${origin}/images/brand/manifold-logo.png`;
  const outletLogo = safeUrl(content.outlet.logo_url);
  const cover = safeUrl(content.selection.cover_url);
  const title = escapeHtml(content.selection.title);
  const outlet = escapeHtml(content.outlet.name);
  const description = (content.selection.description ?? "")
    .trim()
    .slice(0, 420);
  const games = content.games.slice(0, 3);
  const rows = games
    .map((game) => {
      const url = `${origin}/${locale}/item/${encodeURIComponent(game.slug)}`;
      const image = safeUrl(game.image_url);
      return `<tr><td style="padding:0 0 18px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${image ? `<td width="112" valign="top" style="padding-right:16px"><a href="${escapeHtml(url)}"><img src="${escapeHtml(image)}" alt="" width="96" style="display:block;width:96px;max-width:100%;height:auto;border:0;border-radius:8px"></a></td>` : ""}<td valign="middle"><a href="${escapeHtml(url)}" style="color:#fcfaff;font-size:17px;line-height:24px;font-weight:bold;text-decoration:none">${escapeHtml(game.title)}</a></td></tr></table></td></tr>`;
    })
    .join("");

  const html = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="margin:0;padding:0;background-color:#100c19;color:#fcfaff;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#100c19"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px"><tr><td style="padding:4px 12px 24px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td><img src="${escapeHtml(brandLogo)}" alt="" width="42" height="42" style="display:block;border:0"></td><td style="padding-left:12px;font-size:22px;font-weight:bold;color:#fcfaff">MANIFOLD</td></tr></table></td></tr><tr><td style="background-color:#21172e;border:1px solid #44334f;border-radius:16px;overflow:hidden">${cover ? `<a href="${escapeHtml(publicUrl)}"><img src="${escapeHtml(cover)}" alt="" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;border-radius:16px 16px 0 0"></a>` : ""}<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:28px 24px 12px;font-size:11px;font-weight:bold;letter-spacing:1.5px;color:#ddb6ff">${t.eyebrow}</td></tr><tr><td style="padding:0 24px 16px;font-size:28px;line-height:36px;font-weight:bold;color:#fcfaff">${title}</td></tr><tr><td style="padding:0 24px 18px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>${outletLogo ? `<td style="padding-right:10px"><img src="${escapeHtml(outletLogo)}" alt="" width="32" height="32" style="display:block;border:0;border-radius:50%"></td>` : ""}<td style="font-size:15px;line-height:22px;color:#e6dced;font-weight:bold">${outlet}</td></tr></table></td></tr>${description ? `<tr><td style="padding:0 24px 24px;font-size:16px;line-height:25px;color:#e6dced">${escapeHtml(description).replace(/\n/g, "<br>")}</td></tr>` : ""}<tr><td style="padding:0 24px 28px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#b956eb" style="background-color:#b956eb;border-radius:8px"><a href="${escapeHtml(publicUrl)}" style="display:inline-block;padding:15px 22px;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none">${t.explore}</a></td></tr></table></td></tr>${games.length ? `<tr><td style="padding:0 24px 18px;color:#ddb6ff;font-size:13px;font-weight:bold">${t.games}</td></tr><tr><td style="padding:0 24px 6px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr>` : ""}</table></td></tr><tr><td style="padding:24px 12px 10px;color:#baacc7;font-size:12px;line-height:20px">${escapeHtml(t.reason(content.outlet.name))}<br><a href="${escapeHtml(unsubscribeUrl)}" style="color:#ddb6ff">${t.unsubscribe}</a><br><a href="${escapeHtml(preferencesUrl)}" style="color:#ddb6ff">${t.preferences}</a></td></tr></table></td></tr></table></body></html>`;
  const text = [
    "MANIFOLD",
    t.subject(content.outlet.name),
    content.selection.title,
    description,
    `${t.explore}: ${publicUrl}`,
    games.length ? t.games : "",
    ...games.map(
      (game) =>
        `${game.title}: ${origin}/${locale}/item/${encodeURIComponent(game.slug)}`,
    ),
    t.reason(content.outlet.name),
    `${t.unsubscribe}: ${unsubscribeUrl}`,
    `${t.preferences}: ${preferencesUrl}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  return {
    subject: t.subject(content.outlet.name).replace(/[\r\n]/g, " "),
    html,
    text,
  };
}

/** Persist this value with a batch so retry bodies remain byte-for-byte stable. */
export function selectionEmailSender() {
  const value = process.env.EMAIL_FROM?.trim();
  if (!value || /[\r\n]/.test(value)) {
    throw new SelectionEmailTransportError("permanent", 60, "sender_missing");
  }
  return value.includes("<") ? value : `Manifold <${value}>`;
}

function retryAfter(value: string | null) {
  if (!value) return 60;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const date = Date.parse(value);
  return Number.isFinite(date)
    ? Math.max(1, Math.ceil((date - Date.now()) / 1000))
    : 60;
}

/** No provider request, recipient, or raw provider error is ever logged here. */
export async function sendSelectionEmailBatch(
  messages: SelectionEmailMessage[],
  idempotencyKey: string,
): Promise<{ id: string }[]> {
  if (!selectionEmailsEnabled()) {
    throw new SelectionEmailTransportError(
      "retryable",
      3600,
      "feature_disabled",
    );
  }
  if (
    !messages.length ||
    messages.length > 100 ||
    !idempotencyKey ||
    idempotencyKey.length > 256 ||
    /[\r\n]/.test(idempotencyKey) ||
    messages.some(
      (message) =>
        typeof message.to !== "string" ||
        !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(message.to),
    )
  ) {
    throw new SelectionEmailTransportError("permanent", 60, "invalid_batch");
  }
  const mail = messages.map((message) => ({
    ...message,
    from: message.from ?? selectionEmailSender(),
    to: [message.to],
  }));
  const production = process.env.VERCEL_ENV
    ? process.env.VERCEL_ENV === "production"
    : process.env.NODE_ENV === "production";
  const smtp =
    process.env.OUTLET_SELECTION_EMAIL_TRANSPORT === "smtp" ||
    (!production && process.env.OUTLET_SELECTION_EMAIL_TRANSPORT !== "resend");

  if (production && smtp) {
    // SMTP Message-ID is not a provider idempotency guarantee. Bulk production
    // retries must use Resend's persisted request key and immutable API body.
    throw new SelectionEmailTransportError(
      "permanent",
      60,
      "production_smtp_forbidden",
    );
  }

  if (smtp) {
    const host = process.env.EMAIL_SMTP_HOST ?? "127.0.0.1";
    // The default sink must never become an accidental external SMTP relay.
    if (
      !production &&
      !["localhost", "127.0.0.1", "::1", "mailcatcher", "mailpit"].includes(
        host,
      )
    ) {
      throw new SelectionEmailTransportError(
        "permanent",
        60,
        "unsafe_smtp_sink",
      );
    }
    const transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.EMAIL_SMTP_PORT ?? 1025),
      secure: production,
      ...(process.env.EMAIL_SMTP_USER
        ? {
            auth: {
              user: process.env.EMAIL_SMTP_USER,
              pass: process.env.EMAIL_SMTP_PASSWORD,
            },
          }
        : {}),
    });
    const sent: { id: string }[] = [];
    for (let index = 0; index < mail.length; index++) {
      const digest = createHash("sha256")
        .update(`${idempotencyKey}:${index}`)
        .digest("hex");
      const id = `<${digest}@selection-email.manifoldpowered.com>`;
      try {
        await transporter.sendMail({ ...mail[index], messageId: id });
        sent.push({ id });
      } catch {
        throw new SelectionEmailTransportError("uncertain", 60, "smtp_failed");
      }
    }
    return sent;
  }

  if (!production) {
    const allowed = new Set(
      (process.env.OUTLET_SELECTION_EMAIL_TEST_RECIPIENTS ?? "")
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    );
    if (messages.some((message) => !allowed.has(message.to.toLowerCase()))) {
      throw new SelectionEmailTransportError(
        "permanent",
        60,
        "test_recipient_denied",
      );
    }
  }
  if (!process.env.RESEND_API_KEY) {
    throw new SelectionEmailTransportError(
      "retryable",
      3600,
      "resend_unconfigured",
    );
  }
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(mail),
      signal: AbortSignal.timeout(20_000),
      redirect: "error",
    });
  } catch {
    throw new SelectionEmailTransportError("uncertain", 60, "resend_network");
  }
  if (!response.ok) {
    const kind =
      response.status === 429
        ? "retryable"
        : response.status >= 500 || response.status === 408
          ? "uncertain"
          : "permanent";
    throw new SelectionEmailTransportError(
      kind,
      retryAfter(response.headers.get("Retry-After")),
      `resend_http_${response.status}`,
    );
  }
  try {
    const body = await response.json();
    if (
      !Array.isArray(body.data) ||
      body.data.length !== messages.length ||
      body.data.some(
        (item: unknown) =>
          !item || typeof (item as { id?: unknown }).id !== "string",
      )
    ) {
      throw new Error("Invalid provider result");
    }
    return body.data.map((item: { id: string }) => ({ id: item.id }));
  } catch {
    throw new SelectionEmailTransportError("uncertain", 60, "resend_response");
  }
}
