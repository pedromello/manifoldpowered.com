import crypto from "node:crypto";
import { User } from "generated/prisma/client";
import { prisma } from "infra/database";
import email from "infra/email";
import { UnauthorizedError } from "infra/errors";
import password from "models/password";
import user from "models/user";
import {
  lockAccountEmail,
  normalizeAccountEmail,
  recordVerifiedAccountEmail,
} from "models/user_email_verification";

const EXPIRATION_IN_MILLISECONDS = 1000 * 60 * 10; // 10 minutes
const CODE_LENGTH = 6;

function generateCode(): string {
  const max = 10 ** CODE_LENGTH;
  const code = crypto.randomInt(0, max);
  return code.toString().padStart(CODE_LENGTH, "0");
}

async function create(userId: string) {
  const code = generateCode();
  const codeHash = await password.hash(code);

  const otp = await prisma.$transaction(async (tx) => {
    const account = await lockAccountEmail(tx, userId);
    await tx.userOtp.updateMany({
      where: { user_id: userId, used_at: null },
      data: { used_at: new Date() },
    });
    return tx.userOtp.create({
      data: {
        user_id: userId,
        email: normalizeAccountEmail(account.email),
        code_hash: codeHash,
        expires_at: new Date(Date.now() + EXPIRATION_IN_MILLISECONDS),
      },
    });
  });

  return { code, otp };
}

async function sendEmailToUser(
  user: User,
  code: string,
  challengeEmail: string,
) {
  await email.send({
    to: challengeEmail,
    subject: "Your Manifold login code",
    text: `Hey ${user.username},

Here is your one-time login code:

${code}

This code expires in 10 minutes and can only be used once.

If you didn't request this code, you can safely ignore this email.

The Manifold Team
manifoldpowered.com`,
  });
}

async function validateAndConsume(providedLogin: string, providedCode: string) {
  const invalidOrExpiredError = new UnauthorizedError({
    message: "Invalid or expired code",
    action: "Request a new code and try again",
  });

  let userFound: User;
  try {
    userFound = await user.findOneByLogin(providedLogin);
  } catch {
    throw invalidOrExpiredError;
  }

  const activeOtp = await prisma.userOtp.findFirst({
    where: {
      user_id: userFound.id,
      used_at: null,
      expires_at: {
        gt: new Date(),
      },
    },
  });

  if (!activeOtp) {
    throw invalidOrExpiredError;
  }

  const isCodeValid = await password.compare(providedCode, activeOtp.code_hash);

  if (!isCodeValid) {
    throw invalidOrExpiredError;
  }

  return prisma.$transaction(async (tx) => {
    const account = await lockAccountEmail(tx, userFound.id);
    if (
      activeOtp.email &&
      activeOtp.email !== normalizeAccountEmail(account.email)
    ) {
      throw invalidOrExpiredError;
    }
    const consumed = await tx.userOtp.updateMany({
      where: {
        id: activeOtp.id,
        user_id: userFound.id,
        used_at: null,
        expires_at: { gt: new Date() },
      },
      data: { used_at: new Date() },
    });
    if (consumed.count !== 1) throw invalidOrExpiredError;
    // Pre-migration challenges do not contain mailbox evidence.
    if (activeOtp.email)
      await recordVerifiedAccountEmail(tx, userFound.id, activeOtp.email);
    return tx.user.findUniqueOrThrow({ where: { id: userFound.id } });
  });
}

const otp = {
  create,
  sendEmailToUser,
  validateAndConsume,
  EXPIRATION_IN_MILLISECONDS,
};

export default otp;
