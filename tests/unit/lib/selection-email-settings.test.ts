import { createHmac } from "node:crypto";
import {
  emailLocaleSchema,
  notificationPreferencesSchema,
  notificationToggleSchema,
  notificationUnsubscribeSchema,
} from "contracts/outlet-notifications";
import {
  parseSelectionEmailUnsubscribeToken,
  selectionEmailUnsubscribeToken,
} from "lib/selection-email-token";
import {
  selectionEmailDailyLimit,
  selectionEmailProductionOrigin,
  selectionEmailsEnabled,
} from "lib/selection-email-config";

const envNames = [
  "NODE_ENV",
  "OUTLET_SELECTION_EMAILS_ENABLED",
  "SELECTION_EMAIL_DAILY_LIMIT",
  "SELECTION_EMAIL_UNSUBSCRIBE_SECRET",
  "MANIFOLD_SELECTION_EMAIL_ORIGIN",
] as const;
const originalEnv = Object.fromEntries(
  envNames.map((name) => [name, process.env[name]]),
);
const secret = "test-only-email-signing-secret-32-characters";
const subscriptionId = "5f25a20d-17c1-4f30-a6ab-a1883b1af5bc";

beforeEach(() => {
  process.env["NODE_ENV"] = "test";
  for (const name of envNames)
    if (name !== "NODE_ENV") delete process.env[name];
  process.env.SELECTION_EMAIL_UNSUBSCRIBE_SECRET = secret;
});
afterAll(() => {
  for (const name of envNames) {
    if (originalEnv[name] === undefined) delete process.env[name];
    else process.env[name] = originalEnv[name];
  }
});

function signPayload(
  value: unknown,
  context = "selection-email-unsubscribe/v1",
) {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(`${context}/${payload}`)
    .digest("base64url");
  return `${payload}.${signature}`;
}

test("notification inputs accept only supported locales without defaulting or accepting protected fields", () => {
  for (const locale of ["en", "pt-BR"]) {
    expect(emailLocaleSchema.parse(locale)).toBe(locale);
    expect(
      notificationPreferencesSchema.parse({ email_locale: locale }),
    ).toEqual({ email_locale: locale });
    expect(notificationToggleSchema.parse({ enabled: true, locale })).toEqual({
      enabled: true,
      locale,
    });
  }
  expect(notificationToggleSchema.parse({ enabled: false })).toEqual({
    enabled: false,
  });
  for (const locale of [undefined, null, "pt", "pt-br", "fr", "EN"]) {
    expect(
      notificationPreferencesSchema.safeParse({ email_locale: locale }).success,
    ).toBe(false);
  }
  for (const extra of [
    { user_id: "someone-else" },
    { verified_email: "another@example.test" },
    { enabled: true },
  ]) {
    expect(
      notificationPreferencesSchema.safeParse({ email_locale: "en", ...extra })
        .success,
    ).toBe(false);
  }
  expect(notificationToggleSchema.safeParse({ enabled: "true" }).success).toBe(
    false,
  );
  expect(
    notificationToggleSchema.safeParse({
      enabled: true,
      user_id: "someone-else",
    }).success,
  ).toBe(false);
  expect(
    notificationUnsubscribeSchema.safeParse({ token: "x".repeat(40) }).success,
  ).toBe(true);
  expect(
    notificationUnsubscribeSchema.safeParse({ token: "x".repeat(513) }).success,
  ).toBe(false);
});

test("an unsubscribe capability binds exactly one subscription and consent generation without encoding the email", () => {
  const token = selectionEmailUnsubscribeToken(subscriptionId, 3);
  expect(parseSelectionEmailUnsubscribeToken(token)).toEqual({
    id: subscriptionId,
    generation: 3,
  });
  const next = selectionEmailUnsubscribeToken(subscriptionId, 4);
  expect(next).not.toBe(token);
  expect(parseSelectionEmailUnsubscribeToken(next)).toEqual({
    id: subscriptionId,
    generation: 4,
  });
  // Current-generation validity is deliberately checked against the database by
  // the model; parsing preserves the signed generation instead of inventing it.
  expect(parseSelectionEmailUnsubscribeToken(token)?.generation).toBe(3);
  expect(Buffer.from(token.split(".")[0], "base64url").toString("utf8")).toBe(
    JSON.stringify({ s: subscriptionId, g: 3 }),
  );
});

test("changed payloads, changed signatures, stale signing secrets and another HMAC purpose are rejected", () => {
  const token = selectionEmailUnsubscribeToken(subscriptionId, 1);
  const [payload, signature] = token.split(".");
  const forgedPayload = Buffer.from(
    JSON.stringify({ s: subscriptionId, g: 2 }),
  ).toString("base64url");
  expect(
    parseSelectionEmailUnsubscribeToken(`${forgedPayload}.${signature}`),
  ).toBeNull();
  expect(
    parseSelectionEmailUnsubscribeToken(
      `${payload}.${signature.startsWith("A") ? "B" : "A"}${signature.slice(1)}`,
    ),
  ).toBeNull();
  expect(
    parseSelectionEmailUnsubscribeToken(
      signPayload({ s: subscriptionId, g: 1 }, "session/v1"),
    ),
  ).toBeNull();
  expect(
    parseSelectionEmailUnsubscribeToken(
      signPayload(
        { s: subscriptionId, g: 1 },
        "selection-email-unsubscribe/v2",
      ),
    ),
  ).toBeNull();
  process.env.SELECTION_EMAIL_UNSUBSCRIBE_SECRET =
    "a-different-current-signing-secret-32-characters";
  expect(parseSelectionEmailUnsubscribeToken(token)).toBeNull();
});

test("malformed capabilities and invalid signed identity shapes fail closed", () => {
  for (const value of [
    "",
    "no-separator",
    "one.two.three",
    "payload.signature",
    "x".repeat(513),
  ]) {
    expect(parseSelectionEmailUnsubscribeToken(value)).toBeNull();
  }
  for (const value of [
    null,
    [],
    {},
    { s: "not-a-subscription-id", g: 1 },
    { s: subscriptionId, g: 0 },
    { s: subscriptionId, g: -1 },
    { s: subscriptionId, g: 1.5 },
    { s: subscriptionId, g: Number.MAX_SAFE_INTEGER + 1 },
    { s: subscriptionId, g: "1" },
  ]) {
    expect(parseSelectionEmailUnsubscribeToken(signPayload(value))).toBeNull();
  }
});

test("production refuses absent or short unsubscribe secrets and never falls back to the local secret", () => {
  process.env["NODE_ENV"] = "production";
  for (const configured of [undefined, "too-short"]) {
    if (configured === undefined)
      delete process.env.SELECTION_EMAIL_UNSUBSCRIBE_SECRET;
    else process.env.SELECTION_EMAIL_UNSUBSCRIBE_SECRET = configured;
    expect(() => selectionEmailUnsubscribeToken(subscriptionId, 1)).toThrow(
      "Selection email unsubscribe secret is not configured",
    );
  }
  process.env.SELECTION_EMAIL_UNSUBSCRIBE_SECRET = secret;
  expect(
    parseSelectionEmailUnsubscribeToken(
      selectionEmailUnsubscribeToken(subscriptionId, 1),
    ),
  ).toEqual({ id: subscriptionId, generation: 1 });
});

test("the deterministic local-only secret is available only outside production", () => {
  delete process.env.SELECTION_EMAIL_UNSUBSCRIBE_SECRET;
  const token = selectionEmailUnsubscribeToken(subscriptionId, 1);
  expect(parseSelectionEmailUnsubscribeToken(token)).toEqual({
    id: subscriptionId,
    generation: 1,
  });
  process.env["NODE_ENV"] = "production";
  expect(() => parseSelectionEmailUnsubscribeToken(token)).toThrow(
    "Selection email unsubscribe secret is not configured",
  );
});

test("notifications require both an explicit flag and a positive daily allowance", () => {
  expect(selectionEmailsEnabled()).toBe(false);
  expect(selectionEmailDailyLimit()).toBe(10_000);
  for (const flag of ["false", "TRUE", "1", "yes"]) {
    process.env.OUTLET_SELECTION_EMAILS_ENABLED = flag;
    expect(selectionEmailsEnabled()).toBe(false);
  }
  process.env.OUTLET_SELECTION_EMAILS_ENABLED = "true";
  expect(selectionEmailsEnabled()).toBe(true);
  process.env["NODE_ENV"] = "production";
  expect(selectionEmailDailyLimit()).toBe(0);
  expect(selectionEmailsEnabled()).toBe(false);
  process.env.SELECTION_EMAIL_DAILY_LIMIT = "75";
  expect(selectionEmailsEnabled()).toBe(true);
  expect(selectionEmailDailyLimit()).toBe(75);
});

test("invalid allowances disable delivery and large configured allowances remain bounded", () => {
  process.env.OUTLET_SELECTION_EMAILS_ENABLED = "true";
  for (const value of [
    "",
    "0",
    "-1",
    "0.5",
    "NaN",
    "Infinity",
    "9007199254740992",
  ]) {
    process.env.SELECTION_EMAIL_DAILY_LIMIT = value;
    expect(selectionEmailDailyLimit()).toBe(0);
    expect(selectionEmailsEnabled()).toBe(false);
  }
  process.env.SELECTION_EMAIL_DAILY_LIMIT = "1000001";
  expect(selectionEmailDailyLimit()).toBe(1_000_000);
});

test("email links default to the canonical HTTPS origin and permit an explicit clean HTTPS origin", () => {
  expect(selectionEmailProductionOrigin()).toBe(
    "https://www.manifoldpowered.com",
  );
  process.env.MANIFOLD_SELECTION_EMAIL_ORIGIN = "https://preview.example.test/";
  expect(selectionEmailProductionOrigin()).toBe("https://preview.example.test");
});

test("origins reject credentials, non-origin URLs and remote cleartext endpoints", () => {
  for (const value of [
    "https://user:secret@example.test",
    "https://example.test/path",
    "https://example.test?token=private",
    "https://example.test/#fragment",
    "http://example.test",
    "ftp://example.test",
    "not a URL",
  ]) {
    process.env.MANIFOLD_SELECTION_EMAIL_ORIGIN = value;
    expect(() => selectionEmailProductionOrigin()).toThrow();
  }
  process.env.MANIFOLD_SELECTION_EMAIL_ORIGIN = "http://127.0.0.1:3004";
  expect(selectionEmailProductionOrigin()).toBe("http://127.0.0.1:3004");
  process.env["NODE_ENV"] = "production";
  expect(() => selectionEmailProductionOrigin()).toThrow(
    "Invalid selection email origin",
  );
});
