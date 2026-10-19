import type { Prisma, User } from "generated/prisma/client";

// Legacy profile updates did not consistently normalize stored addresses.
export function notificationEmailAddress(value: string) {
  return value.trim().toLowerCase();
}

/** Email changes pause delivery; proving the new address resumes only future publications. */
export async function resumeNotificationSubscriptions(
  tx: Prisma.TransactionClient,
  user: User,
) {
  const address = notificationEmailAddress(user.email);
  await tx.outletNotificationSubscription.updateMany({
    where: {
      user_id: user.id,
      enabled: true,
      OR: [
        { email_version: { not: user.email_version } },
        { consent_email: { not: address } },
      ],
    },
    data: {
      consent_email: address,
      email_version: user.email_version,
      enabled_at: new Date(),
      generation: { increment: 1 },
    },
  });
}

export async function suspendPendingNotificationDeliveries(
  tx: Prisma.TransactionClient,
  userId: string,
) {
  await tx.$executeRaw`
    UPDATE selection_email_deliveries d SET status = 'CANCELLED'
    FROM selection_email_batches b
    WHERE d.batch_id = b.id AND d.user_id = ${userId}
      AND d.status = 'PENDING' AND b.first_attempt_at IS NULL
  `;
}
