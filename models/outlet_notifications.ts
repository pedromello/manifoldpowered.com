import { Prisma, type User } from "generated/prisma/client";
import { prisma } from "infra/database";
import { ConflictError, ServiceError, UnauthorizedError } from "infra/errors";
import type { AppLocale } from "lib/locale";
import { defaultLocale, isAppLocale } from "lib/locale";
import { selectionEmailsEnabled } from "lib/selection-email-config";
import { parseSelectionEmailUnsubscribeToken } from "lib/selection-email-token";
import { isTransactionWriteConflict } from "lib/transaction-conflict";
import store from "models/store";
import { notificationEmailAddress } from "models/notification_identity";
import type {
  NotificationPreferences,
  NotificationStatus,
  NotificationSubscriptions,
} from "contracts/outlet-notifications";

type Tx = Prisma.TransactionClient;
type Identity = Pick<
  User,
  "email" | "verified_email" | "email_verified_at" | "email_version"
>;
export function hasConfirmedNotificationEmail(user: Identity) {
  return Boolean(
    user.email_verified_at &&
    user.verified_email === notificationEmailAddress(user.email),
  );
}

async function transaction<T>(action: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(action, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (attempt >= 2 || !isTransactionWriteConflict(error)) throw error;
    }
  }
}

async function lockUser(tx: Tx, userId: string) {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
  const user = await tx.user.findUnique({ where: { id: userId } });
  if (!user) throw new UnauthorizedError({});
  return user;
}

export async function notificationPreferences(
  userId: string,
): Promise<NotificationPreferences> {
  const row = await prisma.userNotificationPreference.findUnique({
    where: { user_id: userId },
  });
  return {
    email_locale: isAppLocale(row?.email_locale)
      ? row.email_locale
      : defaultLocale,
    has_preference: Boolean(row),
  };
}

export async function updateNotificationPreferences(
  userId: string,
  emailLocale: AppLocale,
): Promise<NotificationPreferences> {
  await transaction(async (tx) => {
    await lockUser(tx, userId);
    await tx.userNotificationPreference.upsert({
      where: { user_id: userId },
      create: { user_id: userId, email_locale: emailLocale },
      update: { email_locale: emailLocale },
    });
  });
  return { email_locale: emailLocale, has_preference: true };
}

export async function notificationStatus(
  userId: string,
  slug: string,
): Promise<NotificationStatus> {
  const outlet = await store.findOnePublishedBySlug(slug);
  const [user, follow, subscription] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.storeFollow.findUnique({
      where: { user_id_store_id: { user_id: userId, store_id: outlet.id } },
    }),
    prisma.outletNotificationSubscription.findUnique({
      where: { user_id_store_id: { user_id: userId, store_id: outlet.id } },
    }),
  ]);
  if (!user) throw new UnauthorizedError({});
  const confirmed = hasConfirmedNotificationEmail(user);
  return {
    available: selectionEmailsEnabled(),
    enabled: Boolean(
      subscription?.enabled &&
      follow &&
      confirmed &&
      subscription.email_version === user.email_version &&
      subscription.consent_email === notificationEmailAddress(user.email),
    ),
    is_followed: Boolean(follow),
    requires_email_login: !confirmed,
  };
}

export async function setOutletNotification(
  userId: string,
  slug: string,
  enabled: boolean,
  locale?: AppLocale,
): Promise<NotificationStatus> {
  const outlet = await store.findOnePublishedBySlug(slug);
  if (enabled && !selectionEmailsEnabled())
    throw new ServiceError({
      message: "Selection email notifications are not available yet.",
    });
  await transaction(async (tx) => {
    const user = await lockUser(tx, userId);
    const address = notificationEmailAddress(user.email);
    if (enabled && !hasConfirmedNotificationEmail(user))
      throw new ConflictError({
        message: "Sign in with an email code before enabling notifications.",
        action: "Use the existing OTP login, then enable the bell again.",
        context: { code: "EMAIL_LOGIN_REQUIRED" },
      });
    const existing = await tx.outletNotificationSubscription.findUnique({
      where: { user_id_store_id: { user_id: userId, store_id: outlet.id } },
    });
    if (enabled) {
      await tx.storeFollow.createMany({
        data: [{ user_id: userId, store_id: outlet.id }],
        skipDuplicates: true,
      });
      await tx.userNotificationPreference.upsert({
        where: { user_id: userId },
        create: { user_id: userId, email_locale: locale ?? defaultLocale },
        update: {},
      });
      if (
        !existing?.enabled ||
        existing.email_version !== user.email_version ||
        existing.consent_email !== address
      )
        await tx.outletNotificationSubscription.upsert({
          where: { user_id_store_id: { user_id: userId, store_id: outlet.id } },
          create: {
            user_id: userId,
            store_id: outlet.id,
            consent_email: address,
            email_version: user.email_version,
            enabled: true,
          },
          update: {
            enabled: true,
            enabled_at: new Date(),
            consent_email: address,
            email_version: user.email_version,
            generation: { increment: 1 },
          },
        });
    } else if (existing?.enabled) {
      await tx.outletNotificationSubscription.update({
        where: { id: existing.id },
        data: { enabled: false, generation: { increment: 1 } },
      });
      await cancelPendingSubscriptionDeliveries(tx, existing.id);
    }
  });
  return notificationStatus(userId, slug);
}

/** Cancellation never changes an immutable request whose provider handoff already began. */
export async function cancelPendingSubscriptionDeliveries(
  tx: Tx,
  subscriptionId: string,
) {
  await tx.$executeRaw`
    UPDATE selection_email_deliveries d SET status = 'CANCELLED'
    FROM selection_email_batches b
    WHERE d.batch_id = b.id AND d.subscription_id = ${subscriptionId}
      AND d.status = 'PENDING' AND b.first_attempt_at IS NULL
  `;
}

export async function listOutletNotifications(
  userId: string,
): Promise<NotificationSubscriptions> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new UnauthorizedError({});
  const rows = await prisma.$queryRaw<
    Array<{
      store_slug: string;
      store_name: string;
      enabled: boolean;
      email_version: number;
      consent_email: string;
      is_followed: boolean;
    }>
  >`
    SELECT s.slug AS store_slug, r.name AS store_name, n.enabled, n.email_version, n.consent_email,
           EXISTS (SELECT 1 FROM store_follows f WHERE f.user_id = n.user_id AND f.store_id = n.store_id) AS is_followed
    FROM outlet_notification_subscriptions n
    JOIN stores s ON s.id = n.store_id AND s.status = 'PUBLISHED'
    JOIN store_revisions r ON r.id = s.published_revision_id AND r.store_id = s.id
    WHERE n.user_id = ${userId} ORDER BY n.created_at DESC, n.id LIMIT 1000
  `;
  const preferences = await notificationPreferences(userId);
  const confirmed = hasConfirmedNotificationEmail(user);
  return {
    email_locale: preferences.email_locale,
    subscriptions: rows.map((row) => ({
      store_slug: row.store_slug,
      store_name: row.store_name,
      available: selectionEmailsEnabled(),
      is_followed: row.is_followed,
      enabled:
        row.enabled &&
        row.is_followed &&
        confirmed &&
        row.email_version === user.email_version &&
        row.consent_email === notificationEmailAddress(user.email),
      requires_email_login: !confirmed,
    })),
  };
}

export async function unsubscribeOutletNotification(token: string) {
  const parsed = parseSelectionEmailUnsubscribeToken(token);
  // Uniform success prevents token probes from revealing subscription state.
  if (!parsed) return { unsubscribed: true as const };
  await transaction(async (tx) => {
    const subscription = await tx.outletNotificationSubscription.findUnique({
      where: { id: parsed.id },
    });
    if (!subscription) return;
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${subscription.user_id} FOR UPDATE`;
    const removed = await tx.outletNotificationSubscription.updateMany({
      where: { id: parsed.id, generation: parsed.generation, enabled: true },
      data: { enabled: false, generation: { increment: 1 } },
    });
    if (removed.count) await cancelPendingSubscriptionDeliveries(tx, parsed.id);
  });
  return { unsubscribed: true as const };
}
