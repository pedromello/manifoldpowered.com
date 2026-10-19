import type { Prisma, User } from "generated/prisma/client";
import { NotFoundError } from "infra/errors";

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

/** Serialize challenge issuance/consumption with address changes. */
export async function lockEmailIdentity(
  tx: Prisma.TransactionClient,
  userId: string,
) {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
  const identity = await tx.user.findUnique({ where: { id: userId } });
  if (!identity) {
    throw new NotFoundError({
      message: "User not found",
      action: "Check the account and try again",
    });
  }
  return identity;
}

export function matchesEmailIdentity(
  identity: User,
  challenge: { recipient_email: string | null; email_version: number | null },
) {
  // Old challenges remain usable for authentication, but cannot prove an address.
  return (
    (challenge.recipient_email === null && challenge.email_version === null) ||
    (challenge.recipient_email === normalizeEmail(identity.email) &&
      challenge.email_version === identity.email_version)
  );
}

export async function confirmEmailIdentity(
  tx: Prisma.TransactionClient,
  identity: User,
  challenge: { recipient_email: string | null; email_version: number | null },
  now: Date,
) {
  if (
    !challenge.recipient_email ||
    !matchesEmailIdentity(identity, challenge) ||
    (identity.verified_email === challenge.recipient_email &&
      identity.email_verified_at !== null)
  ) {
    return identity;
  }
  return tx.user.update({
    where: { id: identity.id },
    data: {
      verified_email: challenge.recipient_email,
      email_verified_at: now,
    },
  });
}
