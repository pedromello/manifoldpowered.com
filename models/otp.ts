import crypto from "node:crypto";
import { User } from "generated/prisma/client";
import { prisma } from "infra/database";
import email from "infra/email";
import { UnauthorizedError } from "infra/errors";
import password from "models/password";
import user from "models/user";

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

  await invalidateOutstandingCodes(userId);

  const otp = await prisma.userOtp.create({
    data: {
      user_id: userId,
      code_hash: codeHash,
      expires_at: new Date(Date.now() + EXPIRATION_IN_MILLISECONDS),
    },
  });

  return { code, otp };
}

async function invalidateOutstandingCodes(userId: string) {
  await prisma.userOtp.updateMany({
    where: {
      user_id: userId,
      used_at: null,
    },
    data: {
      used_at: new Date(),
    },
  });
}

async function sendEmailToUser(user: User, code: string) {
  await email.send({
    to: user.email,
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

  await prisma.userOtp.update({
    where: {
      id: activeOtp.id,
    },
    data: {
      used_at: new Date(),
    },
  });

  return userFound;
}

const otp = {
  create,
  sendEmailToUser,
  validateAndConsume,
  EXPIRATION_IN_MILLISECONDS,
};

export default otp;
