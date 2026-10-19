import { prisma } from "infra/database";
import activation from "models/activation";
import otp from "models/otp";
import user from "models/user";
import storeFollow from "models/store_follow";
import {
  listOutletNotifications,
  notificationPreferences,
  notificationStatus,
  setOutletNotification,
  unsubscribeOutletNotification,
  updateNotificationPreferences,
} from "models/outlet_notifications";
import { selectionEmailUnsubscribeToken } from "lib/selection-email-token";
import orchestrator from "tests/orchestrator";

const previousFlag = process.env.OUTLET_SELECTION_EMAILS_ENABLED;
beforeAll(async () => {
  await orchestrator.waitForAllServices();
  process.env.OUTLET_SELECTION_EMAILS_ENABLED = "true";
});
beforeEach(() => orchestrator.clearDatabaseRows());
afterAll(async () => {
  if (previousFlag === undefined)
    delete process.env.OUTLET_SELECTION_EMAILS_ENABLED;
  else process.env.OUTLET_SELECTION_EMAILS_ENABLED = previousFlag;
  await prisma.$disconnect();
});

async function confirmedReader() {
  const reader = await orchestrator.createUser({ password: null });
  const challenge = await activation.create(reader.id);
  return (await activation.consume(challenge.id)).user;
}
async function outlet() {
  const owner = await orchestrator.createUser();
  return orchestrator.createStore(owner.id);
}

test("first activation captures one global email locale without overwriting it for later outlets", async () => {
  const reader = await confirmedReader();
  const first = await outlet();
  const second = await outlet();
  expect(await notificationPreferences(reader.id)).toEqual({
    email_locale: "en",
    has_preference: false,
  });
  expect(
    await setOutletNotification(reader.id, first.slug, true, "pt-BR"),
  ).toMatchObject({
    enabled: true,
    is_followed: true,
    requires_email_login: false,
  });
  await setOutletNotification(reader.id, second.slug, true, "en");
  expect(await notificationPreferences(reader.id)).toEqual({
    email_locale: "pt-BR",
    has_preference: true,
  });
  await updateNotificationPreferences(reader.id, "en");
  expect(await notificationPreferences(reader.id)).toEqual({
    email_locale: "en",
    has_preference: true,
  });
  expect((await listOutletNotifications(reader.id)).subscriptions).toHaveLength(
    2,
  );
  await setOutletNotification(reader.id, first.slug, true, "pt-BR");
  expect((await notificationPreferences(reader.id)).email_locale).toBe("en");
});

test("an explicit preference saved before any subscription takes precedence over page locale", async () => {
  const reader = await confirmedReader();
  const club = await outlet();
  await updateNotificationPreferences(reader.id, "en");
  await setOutletNotification(reader.id, club.slug, true, "pt-BR");
  expect((await notificationPreferences(reader.id)).email_locale).toBe("en");
});

test("enable follows atomically, disable keeps follow, and unfollow disables notifications", async () => {
  const reader = await confirmedReader();
  const club = await outlet();
  await setOutletNotification(reader.id, club.slug, true);
  expect(await storeFollow.status(reader.id, club.slug)).toEqual({
    is_followed: true,
  });
  expect(
    await setOutletNotification(reader.id, club.slug, false),
  ).toMatchObject({ enabled: false, is_followed: true });
  await setOutletNotification(reader.id, club.slug, true);
  await storeFollow.unfollow(reader.id, club.slug);
  expect(await notificationStatus(reader.id, club.slug)).toMatchObject({
    enabled: false,
    is_followed: false,
  });
  expect(
    await prisma.outletNotificationSubscription.findUniqueOrThrow({
      where: { user_id_store_id: { user_id: reader.id, store_id: club.id } },
    }),
  ).toMatchObject({ enabled: false });
  await storeFollow.follow(reader.id, club.slug);
  expect((await notificationStatus(reader.id, club.slug)).enabled).toBe(false);
});

test("legacy activated accounts require normal OTP proof without creating implicit consent", async () => {
  const reader = await orchestrator.createUser({ password: null });
  await orchestrator.activateUser(reader.id);
  const club = await outlet();
  await expect(
    setOutletNotification(reader.id, club.slug, true, "pt-BR"),
  ).rejects.toMatchObject({
    name: "ConflictError",
    context: { code: "EMAIL_LOGIN_REQUIRED" },
  });
  expect(await notificationStatus(reader.id, club.slug)).toMatchObject({
    enabled: false,
    is_followed: false,
    requires_email_login: true,
  });
  expect(await notificationPreferences(reader.id)).toEqual({
    email_locale: "en",
    has_preference: false,
  });
  expect(await prisma.outletNotificationSubscription.count()).toBe(0);
  const challenge = await otp.create(reader.id);
  await otp.validateAndConsume(reader.email, challenge.code);
  expect((await notificationStatus(reader.id, club.slug)).enabled).toBe(false);
  expect(
    (await setOutletNotification(reader.id, club.slug, true)).enabled,
  ).toBe(true);
});

test("legacy mixed-case stored addresses can prove ownership through username OTP and opt in canonically", async () => {
  const reader = await orchestrator.createUser({ password: null });
  await orchestrator.activateUser(reader.id);
  const legacyAddress = reader.email.toUpperCase();
  await prisma.user.update({
    where: { id: reader.id },
    data: { email: legacyAddress },
  });
  const challenge = await otp.create(reader.id);
  expect(challenge.otp.recipient_email).toBe(reader.email.toLowerCase());
  const confirmed = await otp.validateAndConsume(
    reader.username,
    challenge.code,
  );
  expect(confirmed.verified_email).toBe(reader.email.toLowerCase());
  const club = await outlet();
  expect(
    await setOutletNotification(reader.id, club.slug, true, "pt-BR"),
  ).toMatchObject({ enabled: true, requires_email_login: false });
  expect(
    await prisma.outletNotificationSubscription.findUniqueOrThrow({
      where: { user_id_store_id: { user_id: reader.id, store_id: club.id } },
    }),
  ).toMatchObject({
    consent_email: reader.email.toLowerCase(),
    email_version: confirmed.email_version,
  });
  expect((await listOutletNotifications(reader.id)).subscriptions).toEqual([
    expect.objectContaining({ enabled: true, requires_email_login: false }),
  ]);
});

test("address changes suspend existing notices until normal OTP confirms the new address", async () => {
  const reader = await confirmedReader();
  const club = await outlet();
  await setOutletNotification(reader.id, club.slug, true);
  const changed = await user.updateByUsername(reader.username, {
    email: `changed-${reader.id}@example.test`,
  });
  expect(await notificationStatus(reader.id, club.slug)).toMatchObject({
    enabled: false,
    is_followed: true,
    requires_email_login: true,
  });
  const challenge = await otp.create(reader.id);
  await otp.validateAndConsume(changed.email, challenge.code);
  expect(await notificationStatus(reader.id, club.slug)).toMatchObject({
    enabled: true,
    is_followed: true,
    requires_email_login: false,
  });
  expect(
    await prisma.outletNotificationSubscription.findUniqueOrThrow({
      where: { user_id_store_id: { user_id: reader.id, store_id: club.id } },
    }),
  ).toMatchObject({
    consent_email: changed.email,
    email_version: changed.email_version,
  });
});

test("subscription generation rejects stale unsubscribe links after a new explicit opt-in", async () => {
  const reader = await confirmedReader();
  const first = await outlet();
  const second = await outlet();
  await setOutletNotification(reader.id, first.slug, true);
  await setOutletNotification(reader.id, second.slug, true);
  const original =
    await prisma.outletNotificationSubscription.findUniqueOrThrow({
      where: { user_id_store_id: { user_id: reader.id, store_id: first.id } },
    });
  const oldLink = selectionEmailUnsubscribeToken(
    original.id,
    original.generation,
  );
  await setOutletNotification(reader.id, first.slug, false);
  await setOutletNotification(reader.id, first.slug, true);
  await unsubscribeOutletNotification(oldLink);
  expect((await notificationStatus(reader.id, first.slug)).enabled).toBe(true);
  const current = await prisma.outletNotificationSubscription.findUniqueOrThrow(
    { where: { id: original.id } },
  );
  const link = selectionEmailUnsubscribeToken(current.id, current.generation);
  expect(await unsubscribeOutletNotification(link)).toEqual({
    unsubscribed: true,
  });
  expect(await unsubscribeOutletNotification(link)).toEqual({
    unsubscribed: true,
  });
  expect(await notificationStatus(reader.id, first.slug)).toMatchObject({
    enabled: false,
    is_followed: true,
  });
  expect((await notificationStatus(reader.id, second.slug)).enabled).toBe(true);
  expect(await unsubscribeOutletNotification("invalid".repeat(10))).toEqual({
    unsubscribed: true,
  });
});

test("subscriptions are account-specific and only list currently published outlet identity", async () => {
  const reader = await confirmedReader();
  const other = await confirmedReader();
  const club = await outlet();
  const hidden = await outlet();
  await setOutletNotification(reader.id, club.slug, true, "pt-BR");
  await setOutletNotification(other.id, hidden.slug, true, "en");
  await prisma.store.update({
    where: { id: hidden.id },
    data: { status: "DRAFT", published_revision_id: null, published_at: null },
  });
  expect((await listOutletNotifications(reader.id)).subscriptions).toEqual([
    expect.objectContaining({
      store_slug: club.slug,
      store_name: club.name,
      enabled: true,
    }),
  ]);
  expect((await listOutletNotifications(other.id)).subscriptions).toEqual([]);
  expect((await notificationStatus(other.id, club.slug)).enabled).toBe(false);
  await expect(
    setOutletNotification(reader.id, hidden.slug, true),
  ).rejects.toMatchObject({ name: "NotFoundError" });
  expect(
    JSON.stringify(await listOutletNotifications(reader.id)),
  ).not.toContain(reader.email);
});

test("concurrent repeated enables keep one follow, one subscription and the original consent generation", async () => {
  const reader = await confirmedReader();
  const club = await outlet();
  await Promise.all([
    setOutletNotification(reader.id, club.slug, true, "pt-BR"),
    setOutletNotification(reader.id, club.slug, true, "pt-BR"),
    setOutletNotification(reader.id, club.slug, true, "pt-BR"),
  ]);
  expect(
    await prisma.storeFollow.count({
      where: { user_id: reader.id, store_id: club.id },
    }),
  ).toBe(1);
  const subscriptions = await prisma.outletNotificationSubscription.findMany({
    where: { user_id: reader.id, store_id: club.id },
  });
  expect(subscriptions).toHaveLength(1);
  expect(subscriptions[0].generation).toBe(1);
});

test("the rollout switch prevents new subscriptions without disabling opt-out", async () => {
  const reader = await confirmedReader();
  const club = await outlet();
  await setOutletNotification(reader.id, club.slug, true);
  process.env.OUTLET_SELECTION_EMAILS_ENABLED = "false";
  try {
    await expect(
      setOutletNotification(reader.id, club.slug, true),
    ).rejects.toMatchObject({ name: "ServiceError", statusCode: 503 });
    expect(
      await setOutletNotification(reader.id, club.slug, false),
    ).toMatchObject({ available: false, enabled: false, is_followed: true });
  } finally {
    process.env.OUTLET_SELECTION_EMAILS_ENABLED = "true";
  }
});
