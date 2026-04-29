import { User, UserActivationToken } from "generated/prisma/client";
import { prisma } from "infra/database";
import email from "infra/email";
import { ForbiddenError, NotFoundError } from "infra/errors";
import webserver from "infra/webserver";
import user from "models/user";
import authorization from "./authorization";

const EXPIRATION_IN_MILLISECONDS = 1000 * 60 * 60 * 24; // 24 hours

async function create(userId: string) {
  return prisma.userActivationToken.create({
    data: {
      user_id: userId,
      expires_at: new Date(Date.now() + EXPIRATION_IN_MILLISECONDS),
    },
  });
}

async function sendEmailToUser(user: User, activation: UserActivationToken) {
  await email.send({
    to: user.email,
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

  return await user.setFeatures(userId, [
    "create:session",
    "read:session",
    "update:user",
    "read:public_game",
    "create:wishlist",
    "read:wishlist",
    "delete:wishlist",
  ]);
}

const activation = {
  create,
  sendEmailToUser,
  findOneValidById,
  markAsUsed,
  activateUserByUserId,
  EXPIRATION_IN_MILLISECONDS,
};

export default activation;
