import { User, UserActivationToken } from "generated/prisma/client";
import { prisma } from "infra/database";
import email from "infra/email";
import { ForbiddenError, NotFoundError } from "infra/errors";
import webserver from "infra/webserver";
import user from "models/user";
import authorization from "./authorization";
import {
  lockAccountEmail,
  normalizeAccountEmail,
  recordVerifiedAccountEmail,
} from "models/user_email_verification";

const EXPIRATION_IN_MILLISECONDS = 1000 * 60 * 60 * 24; // 24 hours

async function create(userId: string) {
  const account = await user.findOneById(userId);
  return prisma.userActivationToken.create({
    data: {
      user_id: userId,
      email: normalizeAccountEmail(account.email),
      expires_at: new Date(Date.now() + EXPIRATION_IN_MILLISECONDS),
    },
  });
}

async function sendEmailToUser(user: User, activation: UserActivationToken) {
  await email.send({
    to: activation.email ?? user.email,
    subject: "One step away — activate your Manifold account",
    text: `Hey ${user.username},

You're almost in. Confirm your email to secure your spot on the Manifold early access list!

━━━ Activate your account ━━━

${webserver.getOrigin()}/signup/activate/${activation.id}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

If you didn't create this account, you can safely ignore this email.

See you on the other side,

The Manifold Team
manifoldpowered.com`,
  });
}

async function findOneValidById(activationId: string) {
  const foundActivation = await prisma.userActivationToken.findUnique({
    where: {
      id: activationId,
      expires_at: {
        gt: new Date(),
      },
      used_at: null,
    },
  });

  if (!foundActivation) {
    throw new NotFoundError({
      message: "Activation not found",
      action: "Do the signup again",
    });
  }

  return foundActivation;
}

async function markAsUsed(activationId: string) {
  return prisma.userActivationToken.update({
    where: {
      id: activationId,
    },
    data: {
      used_at: new Date(),
    },
  });
}

async function consume(activationId: string) {
  return prisma.$transaction(async (tx) => {
    const token = await tx.userActivationToken.findUnique({
      where: {
        id: activationId,
        used_at: null,
        expires_at: { gt: new Date() },
      },
    });
    if (!token) throw activationNotFound();
    const account = await lockAccountEmail(tx, token.user_id);
    if (token.email && token.email !== normalizeAccountEmail(account.email))
      throw activationNotFound();
    const currentUser = await tx.user.findUniqueOrThrow({
      where: { id: token.user_id },
    });
    if (!authorization.can(currentUser, "read:activation_token")) {
      // A concurrent replay is a used token rather than a second activation.
      const currentToken = await tx.userActivationToken.findUniqueOrThrow({
        where: { id: token.id },
      });
      if (currentToken.used_at) throw activationNotFound();
      throw new ForbiddenError({
        message: "You cannot use activation tokens anymore",
        action: "Contact support if you believe this is an error",
      });
    }
    const consumed = await tx.userActivationToken.updateMany({
      where: { id: token.id, used_at: null, expires_at: { gt: new Date() } },
      data: { used_at: new Date() },
    });
    if (consumed.count !== 1) throw activationNotFound();
    const activatedUser = await tx.user.update({
      where: { id: token.user_id },
      data: { features: authorization.ACTIVATED_USER_FEATURES },
    });
    if (token.email)
      await recordVerifiedAccountEmail(tx, token.user_id, token.email);
    return {
      user: activatedUser,
      activation: await tx.userActivationToken.findUniqueOrThrow({
        where: { id: token.id },
      }),
    };
  });
}

function activationNotFound() {
  return new NotFoundError({
    message: "Activation not found",
    action: "Do the signup again",
  });
}

async function activateUserByUserId(userId: string) {
  const userToActivate = await user.findOneById(userId);

  if (!authorization.can(userToActivate, "read:activation_token")) {
    throw new ForbiddenError({
      message: "You cannot use activation tokens anymore",
      action: "Contact support if you believe this is an error",
    });
  }

  return await user.setFeatures(userId, authorization.ACTIVATED_USER_FEATURES);
}

const activation = {
  create,
  sendEmailToUser,
  findOneValidById,
  markAsUsed,
  consume,
  activateUserByUserId,
  EXPIRATION_IN_MILLISECONDS,
};

export default activation;
