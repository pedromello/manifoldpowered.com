import {
  createHash,
  createHmac,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type {
  GiftCardCheckoutChallenge,
  Prisma,
} from "generated/prisma/client";
import { prisma } from "infra/database";
import emailService from "infra/email";
import { ConflictError, ForbiddenError, ServiceError } from "infra/errors";
import authorization from "models/authorization";
import {
  giftCardCheckoutAvailable,
  giftCardProducts,
} from "models/gift_card_catalog";
import session from "models/session";
import {
  lockAccountEmail,
  normalizeAccountEmail,
  recordVerifiedAccountEmail,
} from "models/user_email_verification";

export const CHECKOUT_CODE_TTL_SECONDS = 10 * 60;
export const CHECKOUT_RESEND_SECONDS = 45;
export const CHECKOUT_RESUME_SECONDS = 30 * 60;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const MAX_SENDS_PER_EMAIL = 5;
const MAX_SENDS_PER_ADDRESS = 20;
const MAX_CODE_ATTEMPTS = 5;

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function codeDigest(browser: string, id: string, code: string) {
  // The temporary browser secret never enters the database. A stored challenge
  // and its browser fingerprint do not suffice to guess its six-digit code.
  return createHmac("sha256", browser)
    .update(id)
    .update("\0")
    .update(code)
    .digest();
}

export function giftCardUnavailable() {
  return new ConflictError({
    message: "This gift card is no longer available.",
  });
}

export function differentCheckoutAccount() {
  return new ConflictError({
    message: "Sign out to use a different email address.",
  });
}

type CheckoutCodeRequest = {
  email: string;
  product_code: string;
  intent_id: string;
  browser: string;
  address: string;
  locale?: "pt-BR" | "en";
};

export type CheckoutCodeResult =
  | { challengeId: string; maskedEmail: string }
  | { retryAfter: number };

function maskEmail(email: string) {
  const separator = email.lastIndexOf("@");
  return `${email[0]}***${email.slice(separator)}`;
}

export async function requestCheckoutCode(input: CheckoutCodeRequest) {
  const result = await sendCheckoutCode(input);
  if (!result)
    throw new ServiceError({
      message: "We could not send the checkout code. Try again.",
    });
  return result;
}

export async function resendCheckoutCode(input: {
  challengeId: string;
  browser: string;
  address: string;
  locale?: "pt-BR" | "en";
  signedInEmail?: string;
}) {
  const previous = await prisma.giftCardCheckoutChallenge.findFirst({
    where: {
      id: input.challengeId,
      browser_hash: digest(input.browser),
      used_at: null,
      created_at: { gt: new Date(Date.now() - CHECKOUT_RESUME_SECONDS * 1000) },
    },
    select: { email: true, product_code: true, intent_id: true },
  });
  if (!previous) return null;
  if (
    input.signedInEmail !== undefined &&
    normalizeAccountEmail(input.signedInEmail) !== previous.email
  )
    throw differentCheckoutAccount();
  return sendCheckoutCode(
    {
      ...previous,
      browser: input.browser,
      address: input.address,
      locale: input.locale,
    },
    input.challengeId,
  );
}

async function sendCheckoutCode(
  input: CheckoutCodeRequest,
  replacing?: string,
): Promise<CheckoutCodeResult | null> {
  if (!giftCardCheckoutAvailable()) throw giftCardUnavailable();
  const products = await giftCardProducts();
  if (
    !products.some(
      ({ code, currency }) => code === input.product_code && currency === "BRL",
    )
  )
    throw giftCardUnavailable();

  const email = normalizeAccountEmail(input.email);
  const browserHash = digest(input.browser);
  const addressHash = digest(input.address);
  const code = randomInt(1_000_000).toString().padStart(6, "0");
  const challengeId = randomUUID();

  const result = await prisma.$transaction<CheckoutCodeResult | null>(
    async (tx) => {
      // Lock both limit scopes in the same order across all instances.
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`checkout-send-address:${addressHash}`}, 0))`;
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`checkout-send-email:${digest(email)}`}, 0))`;
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`checkout-send-intent:${browserHash}:${input.intent_id}`}, 0))`;
      const now = new Date();
      const [latest] = await tx.$queryRaw<
        Pick<GiftCardCheckoutChallenge, "id" | "used_at" | "created_at">[]
      >`
      SELECT id, used_at, created_at FROM gift_card_checkout_challenges
      WHERE browser_hash = ${browserHash} AND intent_id = ${input.intent_id}
      ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE
    `;
      if (
        replacing &&
        (!latest ||
          latest.id !== replacing ||
          latest.used_at ||
          latest.created_at.getTime() <=
            now.getTime() - CHECKOUT_RESUME_SECONDS * 1000)
      )
        return null;
      const windowStart = new Date(now.getTime() - RATE_WINDOW_MS);
      const byEmail = await tx.giftCardCheckoutChallenge.findMany({
        where: { email, created_at: { gt: windowStart } },
        orderBy: { created_at: "desc" },
        take: MAX_SENDS_PER_EMAIL,
        select: { created_at: true },
      });
      const byAddress = await tx.giftCardCheckoutChallenge.findMany({
        where: { address_hash: addressHash, created_at: { gt: windowStart } },
        orderBy: { created_at: "desc" },
        take: MAX_SENDS_PER_ADDRESS,
        select: { created_at: true },
      });
      const retryAt = Math.max(
        byEmail.length
          ? byEmail[0].created_at.getTime() + CHECKOUT_RESEND_SECONDS * 1000
          : 0,
        byEmail.length === MAX_SENDS_PER_EMAIL
          ? byEmail.at(-1)!.created_at.getTime() + RATE_WINDOW_MS
          : 0,
        byAddress.length === MAX_SENDS_PER_ADDRESS
          ? byAddress.at(-1)!.created_at.getTime() + RATE_WINDOW_MS
          : 0,
      );
      if (retryAt > now.getTime()) {
        return { retryAfter: Math.ceil((retryAt - now.getTime()) / 1000) };
      }

      const pruneBefore = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      await tx.$executeRaw`DELETE FROM gift_card_checkout_challenges WHERE id IN (SELECT id FROM gift_card_checkout_challenges WHERE expires_at < ${pruneBefore} ORDER BY expires_at LIMIT 50 FOR UPDATE SKIP LOCKED)`;

      // Changing the email or resending invalidates unused codes for this purchase.
      await tx.giftCardCheckoutChallenge.updateMany({
        where: {
          browser_hash: browserHash,
          intent_id: input.intent_id,
          used_at: null,
          expires_at: { gt: now },
        },
        data: { expires_at: now },
      });
      const challenge = await tx.giftCardCheckoutChallenge.create({
        data: {
          id: challengeId,
          intent_id: input.intent_id,
          product_code: input.product_code,
          email,
          browser_hash: browserHash,
          address_hash: addressHash,
          code_hash: codeDigest(input.browser, challengeId, code).toString(
            "hex",
          ),
          expires_at: new Date(
            now.getTime() + CHECKOUT_CODE_TTL_SECONDS * 1000,
          ),
          created_at: new Date(
            Math.max(now.getTime(), (latest?.created_at.getTime() ?? 0) + 1),
          ),
        },
        select: { id: true },
      });
      return { challengeId: challenge.id, maskedEmail: maskEmail(email) };
    },
  );
  if (!result || "retryAfter" in result) return result;

  try {
    await emailService.send({
      to: email,
      subject:
        input.locale === "en"
          ? "Your gift card checkout code"
          : "Seu código para comprar o gift card",
      text:
        input.locale === "en"
          ? `Your confirmation code is ${code}.\n\nIt expires in 10 minutes. If you didn't request this code, ignore this email.`
          : `Seu código de confirmação é ${code}.\n\nEle vence em 10 minutos. Se você não solicitou este código, ignore este e-mail.`,
    });
  } catch {
    throw new ServiceError({
      message: "We could not send the checkout code. Try again.",
    });
  }

  return result;
}

async function resolveBuyer(tx: Prisma.TransactionClient, email: string) {
  let buyer = await tx.user.findUnique({ where: { email } });
  if (!buyer) {
    // The unique email also coordinates with regular signup and email edits.
    await tx.user.createMany({
      data: {
        email,
        username: `buyer${randomUUID().replaceAll("-", "").slice(0, 24)}`,
        password: null,
        features: authorization.ACTIVATED_USER_FEATURES,
      },
      skipDuplicates: true,
    });
    buyer = await tx.user.findUniqueOrThrow({ where: { email } });
  }
  const locked = await lockAccountEmail(tx, buyer.id);
  if (normalizeAccountEmail(locked.email) !== email)
    throw differentCheckoutAccount();
  buyer = await tx.user.findUniqueOrThrow({ where: { id: buyer.id } });

  if (
    buyer.features.length === 1 &&
    buyer.features[0] === "read:activation_token"
  ) {
    buyer = await tx.user.update({
      where: { id: buyer.id },
      data: { features: authorization.ACTIVATED_USER_FEATURES },
    });
    await tx.userActivationToken.updateMany({
      where: { user_id: buyer.id, used_at: null },
      data: { used_at: new Date() },
    });
  }
  requireCheckoutAccount(buyer);
  await recordVerifiedAccountEmail(tx, buyer.id, email);
  return buyer;
}

function requireCheckoutAccount(account: { id: string; features: string[] }) {
  if (
    !authorization.can(account, "create:session") ||
    !authorization.can(account, "create:library")
  ) {
    throw new ForbiddenError({
      message: "You do not have permission to login",
    });
  }
}

export async function verifyCheckoutCode(input: {
  challengeId: string;
  code: string;
  browser: string;
  currentUserId?: string;
  currentEmail?: string;
}) {
  const browserHash = digest(input.browser);
  return prisma.$transaction(async (tx) => {
    const [challenge] = await tx.$queryRaw<GiftCardCheckoutChallenge[]>`
      SELECT * FROM gift_card_checkout_challenges WHERE id = ${input.challengeId} FOR UPDATE
    `;
    if (
      !challenge ||
      challenge.browser_hash !== browserHash ||
      challenge.expires_at.getTime() <= Date.now() ||
      challenge.attempts >= MAX_CODE_ATTEMPTS
    )
      return null;

    if (
      !timingSafeEqual(
        codeDigest(input.browser, challenge.id, input.code),
        Buffer.from(challenge.code_hash, "hex"),
      )
    ) {
      await tx.giftCardCheckoutChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      return null;
    }

    if (
      input.currentUserId &&
      normalizeAccountEmail(input.currentEmail ?? "") !== challenge.email
    )
      throw differentCheckoutAccount();

    if (challenge.used_at) {
      // Only the original browser with the same proof may recover the session
      // already issued for a lost response. Replays never issue a new session.
      if (!challenge.session_id) return null;
      const previous = await tx.session.findUnique({
        where: { id: challenge.session_id, expires_at: { gt: new Date() } },
      });
      if (
        !previous ||
        (input.currentUserId && input.currentUserId !== previous.user_id)
      )
        return null;
      const locked = await lockAccountEmail(tx, previous.user_id);
      if (normalizeAccountEmail(locked.email) !== challenge.email) return null;
      const account = await tx.user.findUniqueOrThrow({
        where: { id: previous.user_id },
      });
      requireCheckoutAccount(account);
      return {
        challenge,
        userId: previous.user_id,
        sessionToken: previous.token,
      };
    }

    const buyer = await resolveBuyer(tx, challenge.email);
    if (input.currentUserId && buyer.id !== input.currentUserId)
      throw differentCheckoutAccount();
    const signedIn = await session.create(buyer.id, tx);
    await tx.giftCardCheckoutChallenge.update({
      where: { id: challenge.id },
      data: { used_at: new Date(), session_id: signedIn.id },
    });
    return { challenge, userId: buyer.id, sessionToken: signedIn.token };
  });
}
