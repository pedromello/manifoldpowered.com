import { prisma } from "infra/database";
import webserver from "infra/webserver";
import activation from "models/activation";
import {
  setOutletNotification,
  notificationStatus,
} from "models/outlet_notifications";
import { selectionEmailUnsubscribeToken } from "lib/selection-email-token";
import orchestrator from "tests/orchestrator";

const previousFlag = process.env.OUTLET_SELECTION_EMAILS_ENABLED;
beforeAll(async () => {
  await orchestrator.waitForAllServices();
  // Fixture setup runs in Jest; the real server retains its own rollout setting.
  process.env.OUTLET_SELECTION_EMAILS_ENABLED = "true";
});
beforeEach(() => orchestrator.clearDatabaseRows());
afterAll(async () => {
  if (previousFlag === undefined)
    delete process.env.OUTLET_SELECTION_EMAILS_ENABLED;
  else process.env.OUTLET_SELECTION_EMAILS_ENABLED = previousFlag;
  await prisma.$disconnect();
});

async function reader(confirmed = true) {
  const account = await orchestrator.createUser({ password: null });
  if (confirmed) {
    const challenge = await activation.create(account.id);
    await activation.consume(challenge.id);
  } else await orchestrator.activateUser(account.id);
  const session = await orchestrator.createSession(account.id);
  return { ...account, token: session.token };
}
async function outlet() {
  const owner = await orchestrator.createUser();
  return orchestrator.createStore(owner.id);
}
function request(
  path: string,
  token?: string,
  method = "GET",
  body?: unknown,
  extraHeaders: Record<string, string> = {},
) {
  return fetch(`${webserver.getOrigin()}/api/v1${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Cookie: `session_id=${token}` } : {}),
      ...extraHeaders,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

test("notification preferences and subscription lists require an authenticated account", async () => {
  for (const path of [
    "/user/notification-preferences",
    "/outlet-notifications",
    "/stores/any-outlet/notifications",
  ]) {
    const response = await request(path);
    expect(response.status).toBe(401);
    expect((await response.json()).name).toBe("UnauthorizedError");
  }
});

test("private responses expose only the requesting account and never its email or consent metadata", async () => {
  const first = await reader();
  const second = await reader();
  const club = await outlet();
  await setOutletNotification(first.id, club.slug, true, "pt-BR");
  const own = await request(
    `/stores/${club.slug}/notifications?user_id=${second.id}`,
    first.token,
  );
  const other = await request(
    `/stores/${club.slug}/notifications?user_id=${first.id}`,
    second.token,
  );
  expect(own.status).toBe(200);
  expect(own.headers.get("cache-control")).toBe("private, no-store");
  expect(own.headers.get("vary")).toContain("Cookie");
  expect(await own.json()).toMatchObject({
    enabled: true,
    is_followed: true,
    requires_email_login: false,
  });
  expect(await other.json()).toMatchObject({
    enabled: false,
    is_followed: false,
  });
  const list = await request(
    `/outlet-notifications?user_id=${first.id}`,
    second.token,
  );
  expect(list.status).toBe(200);
  expect(await list.json()).toMatchObject({
    email_locale: "en",
    subscriptions: [],
  });
  for (const path of [
    "/user/notification-preferences",
    "/outlet-notifications",
  ]) {
    const result = await request(path, first.token);
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("private, no-store");
    const json = await result.text();
    expect(json).not.toContain(first.email);
    expect(json).not.toContain(first.token);
    expect(json).not.toContain("consent_email");
  }
});

test("explicit language changes are global while request locale never changes a saved preference", async () => {
  const account = await reader();
  const response = await request(
    "/user/notification-preferences",
    account.token,
    "PATCH",
    { email_locale: "pt-BR" },
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    email_locale: "pt-BR",
    has_preference: true,
  });
  expect(
    await (
      await request("/user/notification-preferences?locale=en", account.token)
    ).json(),
  ).toEqual({ email_locale: "pt-BR", has_preference: true });
  const other = await reader();
  expect(
    await (await request("/user/notification-preferences", other.token)).json(),
  ).toEqual({ email_locale: "en", has_preference: false });
});

test("strict mutation inputs cannot target another account or write internal proof fields", async () => {
  const account = await reader();
  const other = await reader();
  const club = await outlet();
  for (const [path, method, body] of [
    ["/user/notification-preferences", "PATCH", { email_locale: "fr" }],
    [
      "/user/notification-preferences",
      "PATCH",
      { email_locale: "en", user_id: other.id },
    ],
    [
      "/user/notification-preferences",
      "PATCH",
      { email_locale: "en", verified_email: other.email },
    ],
    [
      `/stores/${club.slug}/notifications`,
      "PUT",
      { enabled: true, user_id: other.id },
    ],
    [`/stores/${club.slug}/notifications`, "PUT", { enabled: "true" }],
  ] as const) {
    const result = await request(path, account.token, method, body);
    expect(result.status).toBe(400);
    expect((await result.json()).name).toBe("ValidationError");
  }
  expect(await prisma.outletNotificationSubscription.count()).toBe(0);
  expect(await prisma.userNotificationPreference.count()).toBe(0);
});

test("cookie-authenticated mutations reject cross-site origins while normal CLI-style requests work", async () => {
  const account = await reader();
  const club = await outlet();
  const crossSiteHeaders: Array<Record<string, string>> = [
    { Origin: "https://unrelated.example" },
    { "Sec-Fetch-Site": "cross-site" },
  ];
  for (const headers of crossSiteHeaders) {
    const preference = await request(
      "/user/notification-preferences",
      account.token,
      "PATCH",
      { email_locale: "en" },
      headers,
    );
    const toggle = await request(
      `/stores/${club.slug}/notifications`,
      account.token,
      "PUT",
      { enabled: false },
      headers,
    );
    expect(preference.status).toBe(403);
    expect(toggle.status).toBe(403);
  }
  expect(
    (
      await request("/user/notification-preferences", account.token, "PATCH", {
        email_locale: "en",
      })
    ).status,
  ).toBe(200);
});

test("enable honors the server rollout gate and requires proof rather than a new session", async () => {
  const account = await reader();
  const legacy = await reader(false);
  const club = await outlet();
  const baseline = await (
    await request(`/stores/${club.slug}/notifications`, account.token)
  ).json();
  const result = await request(
    `/stores/${club.slug}/notifications`,
    account.token,
    "PUT",
    { enabled: true, locale: "pt-BR" },
  );
  const legacyResult = await request(
    `/stores/${club.slug}/notifications`,
    legacy.token,
    "PUT",
    { enabled: true },
  );
  if (baseline.available) {
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({
      enabled: true,
      is_followed: true,
      requires_email_login: false,
    });
    expect(legacyResult.status).toBe(409);
    expect(await legacyResult.json()).toMatchObject({
      context: { code: "EMAIL_LOGIN_REQUIRED" },
    });
  } else {
    expect(result.status).toBe(503);
    expect(legacyResult.status).toBe(503);
    expect(await prisma.outletNotificationSubscription.count()).toBe(0);
    expect(await prisma.storeFollow.count()).toBe(0);
  }
  const legacyStatus = await request(
    `/stores/${club.slug}/notifications`,
    legacy.token,
  );
  expect(legacyStatus.status).toBe(200);
  expect(await legacyStatus.json()).toMatchObject({
    enabled: false,
    requires_email_login: true,
  });
});

test("unsubscribe GET and email-link scanners cannot change consent; explicit POST only removes its target", async () => {
  const account = await reader();
  const club = await outlet();
  const second = await outlet();
  await setOutletNotification(account.id, club.slug, true);
  await setOutletNotification(account.id, second.slug, true);
  const subscription =
    await prisma.outletNotificationSubscription.findUniqueOrThrow({
      where: { user_id_store_id: { user_id: account.id, store_id: club.id } },
    });
  const token = selectionEmailUnsubscribeToken(
    subscription.id,
    subscription.generation,
  );
  const get = await request(
    `/notifications/unsubscribe?token=${encodeURIComponent(token)}`,
  );
  expect(get.status).toBe(405);
  expect((await notificationStatus(account.id, club.slug)).enabled).toBe(true);
  const landing = await fetch(
    `${webserver.getOrigin()}/notifications/unsubscribe/${encodeURIComponent(token)}`,
  );
  expect(landing.status).toBe(200);
  const newLanding = await fetch(
    `${webserver.getOrigin()}/notifications/unsubscribe`,
  );
  expect(newLanding.status).toBe(200);
  expect((await notificationStatus(account.id, club.slug)).enabled).toBe(true);
  const post = await request("/notifications/unsubscribe", undefined, "POST", {
    token,
  });
  expect(post.status).toBe(200);
  expect(post.headers.get("cache-control")).toBe("private, no-store");
  expect(await post.json()).toEqual({ unsubscribed: true });
  expect(await notificationStatus(account.id, club.slug)).toMatchObject({
    enabled: false,
    is_followed: true,
  });
  expect((await notificationStatus(account.id, second.slug)).enabled).toBe(
    true,
  );
  expect(
    await (
      await request("/notifications/unsubscribe", undefined, "POST", { token })
    ).json(),
  ).toEqual({ unsubscribed: true });
});

test("RFC 8058 one-click form posts work without cookies and forged links disclose nothing", async () => {
  const account = await reader();
  const club = await outlet();
  await setOutletNotification(account.id, club.slug, true);
  const subscription =
    await prisma.outletNotificationSubscription.findUniqueOrThrow({
      where: { user_id_store_id: { user_id: account.id, store_id: club.id } },
    });
  const token = selectionEmailUnsubscribeToken(
    subscription.id,
    subscription.generation,
  );
  const [payload, signature] = token.split(".");
  const forged = `${payload}.${signature.startsWith("A") ? "B" : "A"}${signature.slice(1)}`;
  const invalid = await request(
    "/notifications/unsubscribe",
    undefined,
    "POST",
    { token: forged },
  );
  expect(invalid.status).toBe(200);
  expect(await invalid.json()).toEqual({ unsubscribed: true });
  expect((await notificationStatus(account.id, club.slug)).enabled).toBe(true);
  const result = await fetch(
    `${webserver.getOrigin()}/api/v1/notifications/unsubscribe?token=${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "List-Unsubscribe=One-Click",
    },
  );
  expect(result.status).toBe(200);
  expect(await result.json()).toEqual({ unsubscribed: true });
  expect((await notificationStatus(account.id, club.slug)).enabled).toBe(false);
});
