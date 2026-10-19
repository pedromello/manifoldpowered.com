import { User, UserActivationToken } from "generated/prisma/client";
import { prisma } from "infra/database";
import email from "infra/email";
import { ForbiddenError, NotFoundError } from "infra/errors";
import webserver from "infra/webserver";
import user from "models/user";
import authorization from "./authorization";
import {
  confirmEmailIdentity,
  lockEmailIdentity,
  matchesEmailIdentity,
  normalizeEmail,
} from "models/email_identity";

const EXPIRATION_IN_MILLISECONDS = 1000 * 60 * 60 * 24; // 24 hours

async function create(userId: string) {
  return prisma.$transaction(async (tx) => {
    const identity = await lockEmailIdentity(tx, userId);
    return tx.userActivationToken.create({
      data: {
        user_id: userId,
        recipient_email: normalizeEmail(identity.email),
        email_version: identity.email_version,
        expires_at: new Date(Date.now() + EXPIRATION_IN_MILLISECONDS),
      },
    });
  });
}

async function sendEmailToUser(user: User, activation: UserActivationToken) {
  await email.send({
    to: activation.recipient_email ?? user.email,
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

/** Consume proof and grant account access atomically, without a second email. */
async function consume(activationId: string) {
  return prisma.$transaction(async (tx) => {
    const challenge = await tx.userActivationToken.findUnique({
      where: { id: activationId },
    });
    if (!challenge || challenge.used_at || challenge.expires_at <= new Date()) {
      throw activationNotFound();
    }
    const identity = await lockEmailIdentity(tx, challenge.user_id);
    const now = new Date();
    if (!matchesEmailIdentity(identity, challenge)) throw activationNotFound();
    if (!authorization.can(identity, "read:activation_token")) {
      throw new ForbiddenError({
        message: "You cannot use activation tokens anymore",
        action: "Contact support if you believe this is an error",
      });
    }
    const consumed = await tx.userActivationToken.updateMany({
      where: {
        id: challenge.id,
        user_id: identity.id,
        used_at: null,
        expires_at: { gt: now },
      },
      data: { used_at: now },
    });
    if (consumed.count !== 1) throw activationNotFound();
    const activated = await tx.user.update({
      where: { id: identity.id },
      data: { features: authorization.ACTIVATED_USER_FEATURES },
    });
    const confirmed = await confirmEmailIdentity(tx, activated, challenge, now);
    const token = await tx.userActivationToken.findUniqueOrThrow({
      where: { id: challenge.id },
    });
    return { user: confirmed, activation: token };
  });
}

function activationNotFound() {
  return new NotFoundError({
    message: "Activation not found",
    action: "Do the signup again",
  });
}

const activation = {
  create,
  sendEmailToUser,
  findOneValidById,
  markAsUsed,
  activateUserByUserId,
  consume,
  EXPIRATION_IN_MILLISECONDS,
};

export default activation;
