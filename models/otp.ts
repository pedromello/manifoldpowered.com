import crypto from "node:crypto";
import { User, UserOtp } from "generated/prisma/client";
import { prisma } from "infra/database";
import email from "infra/email";
import { ForbiddenError, UnauthorizedError } from "infra/errors";
import password from "models/password";
import user from "models/user";
import authorization from "models/authorization";
import {
  confirmEmailIdentity,
  lockEmailIdentity,
  matchesEmailIdentity,
  normalizeEmail,
} from "models/email_identity";

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
    const identity = await lockEmailIdentity(tx, userId);
    await tx.userOtp.updateMany({
      where: { user_id: userId, used_at: null },
      data: { used_at: new Date() },
    });
    return tx.userOtp.create({
      data: {
        user_id: userId,
        code_hash: codeHash,
        recipient_email: normalizeEmail(identity.email),
        email_version: identity.email_version,
        expires_at: new Date(Date.now() + EXPIRATION_IN_MILLISECONDS),
      },
    });
  });

  return { code, otp };
}

async function sendEmailToUser(user: User, code: string, challenge: UserOtp) {
  await email.send({
    to: challenge.recipient_email ?? user.email,
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
    const identity = await lockEmailIdentity(tx, userFound.id);
    if (!matchesEmailIdentity(identity, activeOtp)) throw invalidOrExpiredError;
    if (!authorization.can(identity, "create:session")) {
      throw new ForbiddenError({
        message: "You do not have permission to login",
        action: "Contact support if you believe this is an error",
      });
    }
    const now = new Date();
    const consumed = await tx.userOtp.updateMany({
      where: {
        id: activeOtp.id,
        user_id: identity.id,
        used_at: null,
        expires_at: { gt: now },
      },
      data: { used_at: now },
    });
    if (consumed.count !== 1) throw invalidOrExpiredError;
    return confirmEmailIdentity(tx, identity, activeOtp, now);
  });
}

const otp = {
  create,
  sendEmailToUser,
  validateAndConsume,
  EXPIRATION_IN_MILLISECONDS,
};

export default otp;
