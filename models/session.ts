import { prisma } from "infra/database";
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

const session = { create, EXPIRATION_IN_MILLISECONDS };

export default session;