import { prisma } from "infra/database";
import { ConflictError, NotFoundError } from "infra/errors";
import type { Prisma } from "generated/prisma/client";

export function normalizeAccountEmail(email: string) {
  return email.trim().toLowerCase();
}

// Call inside the transaction that snapshots the delivery recipient. Locking the
// profile prevents an email change from racing that snapshot.
export async function requireVerifiedAccountEmail(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<string> {
  const account = await lockAccountEmail(tx, userId);
  const proof = await tx.userEmailVerification.findUnique({
    where: { user_id: userId },
  });
  const email = normalizeAccountEmail(account.email);
  if (!proof || proof.email !== email) {
    throw new ConflictError({
      message: "Confirm your account email before buying a gift card.",
      action: "Sign in again using the code sent to your account email.",
    });
  }
  return email;
}

export async function lockAccountEmail(
  tx: Prisma.TransactionClient,
  userId: string,
) {
  const [account] = await tx.$queryRaw<Array<{ id: string; email: string }>>`
    SELECT id,email FROM users WHERE id=${userId} FOR UPDATE
  `;
  if (!account) throw new NotFoundError({ message: "Account not found." });
  return account;
}

// Only exact, consumed email challenges may call this server-side helper.
export async function recordVerifiedAccountEmail(
  tx: Prisma.TransactionClient,
  userId: string,
  challengeEmail: string,
) {
  const account = await lockAccountEmail(tx, userId);
  const email = normalizeAccountEmail(challengeEmail);
  if (normalizeAccountEmail(account.email) !== email) {
    throw new ConflictError({ message: "The account email has changed." });
  }
  return tx.userEmailVerification.upsert({
    where: { user_id: userId },
    create: { user_id: userId, email },
    update: { email, verified_at: new Date() },
  });
}

export async function hasVerifiedAccountEmail(userId: string) {
  return prisma.$transaction(async (tx) => {
    const account = await lockAccountEmail(tx, userId);
    const proof = await tx.userEmailVerification.findUnique({
      where: { user_id: userId },
    });
    return Boolean(
      proof && proof.email === normalizeAccountEmail(account.email),
    );
  });
}
