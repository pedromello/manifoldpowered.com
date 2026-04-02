import { prisma } from "infra/database";
import { UnauthorizedError } from "infra/errors";
import crypto from "node:crypto";

const EXPIRATION_IN_MILLISECONDS = 1000 * 60 * 60 * 24 * 30; // 30 days

async function create(userId: string) {
    const token = crypto.randomBytes(48).toString("hex");
    const expiresAt = new Date(Date.now() + EXPIRATION_IN_MILLISECONDS);

    const newSession = await prisma.session.create({
        data: {
            token,
            user_id: userId,
            expires_at: expiresAt,
        },
    });
    return newSession;
}

async function renew(sessionId: string) {
    const updatedSession = await prisma.session.update({
        where: {
            id: sessionId,
        },
        data: {
            expires_at: new Date(Date.now() + EXPIRATION_IN_MILLISECONDS),
        },
    });
    return updatedSession;
}

async function findOneValidByToken(token: string) {
    const foundSession = await prisma.session.findUnique({
        where: {
            token: token,
            expires_at: {
                gt: new Date(),
            },
        },
    });

    if (!foundSession) {
        throw new UnauthorizedError({
            message: "User does not have a valid session",
            action: "Check if user is logged in and try again",
        });
    }

    return foundSession;
}



const session = { create, renew, findOneValidByToken, EXPIRATION_IN_MILLISECONDS };

export default session;