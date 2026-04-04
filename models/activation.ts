import { User, UserActivationToken } from "generated/prisma/client";
import { prisma } from "infra/database";
import email from "infra/email";
import webserver from "infra/webserver";

const EXPIRATION_IN_MILLISECONDS = 1000 * 60 * 15; // 15 minutes

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
    from: "<contact@manifoldpowered.com>",
    to: user.email,
    subject: "Activate your account at Manifold!",
    text: `Welcome to Manifold, ${user.username}!

Click the link below to activate your account:
${webserver.getOrigin()}/signup/activate/${activation.id}`,
  });
}

async function findByUserId(userId: string) {
  return prisma.userActivationToken.findFirst({
    where: {
      user_id: userId,
    },
    orderBy: {
      created_at: "desc",
    },
  });
}

const activation = {
  create,
  sendEmailToUser,
  findByUserId,
};

export default activation;
