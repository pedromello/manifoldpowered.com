import { randomUUID } from "node:crypto";
import { prisma } from "infra/database";
import {
  ConflictError,
  NotFoundError,
  ServiceError,
  ValidationError,
} from "infra/errors";
import {
  assertPaymentSandbox,
  paymentProvider,
  selectedPaymentProvider,
} from "infra/payments";
import type {
  PaymentBuyer,
  PaymentContext,
  PaymentMethod,
  PaymentProvider,
  PaymentProviderName,
  PaymentSnapshot,
} from "infra/payments/types";
import { giftCardProducts } from "models/gift_card_catalog";
import {
  emailGiftCardsSelected,
  emailGiftPurchasesConfigured,
  recipientDocumentRequired,
} from "infra/gift_card_api";
import { enqueueGiftFulfillment } from "models/gift_card_email_delivery";
import { requireVerifiedAccountEmail } from "models/user_email_verification";
import { decryptGiftRecipient } from "infra/gift_card_recipient";
import type {
  PurchaseOrder,
  PurchasePaymentAttempt,
  Prisma as PrismaTypes,
} from "generated/prisma/client";
import { Prisma } from "generated/prisma/client";
import game from "models/game";
import pricing from "models/pricing";
import commercialTerms from "models/commercial_terms";
import { fulfillPaidPurchase, resolveAffiliateLeniently } from "models/library";
import giftCardDelivery from "models/gift_card_delivery";

const financialFinal = ["REFUNDED", "DISPUTED"];
const active = ["UNPAID", "PENDING", "PROCESSING"];
const txOptions = { maxWait: 5000, timeout: 10000 };
export function paymentContext(
  order: PurchaseOrder,
  attempt: PurchasePaymentAttempt,
): PaymentContext {
  return {
    order_id: order.id,
    attempt_id: attempt.id,
    product_name: order.product_name,
    product_code: order.item_id,
    method: attempt.method as PaymentMethod,
    amount_minor: attempt.total_minor,
    currency: order.currency,
    installments: attempt.installments,
    customer_id: attempt.remote_customer_id ?? undefined,
    remote_order_id: attempt.remote_order_id ?? undefined,
  };
}
export async function lockPurchase(
  tx: PrismaTypes.TransactionClient,
  id: string,
  userId?: string,
) {
  const rows = await tx.$queryRaw<
    { id: string }[]
  >`SELECT id FROM purchase_orders WHERE id=${id} AND (${userId ?? null}::text IS NULL OR user_id=${userId ?? null}) FOR UPDATE`;
  if (!rows.length) throw new NotFoundError({ message: "Order not found." });
  const order = await tx.purchaseOrder.findUniqueOrThrow({ where: { id } });
  if (order.payment_environment !== "sandbox")
    throw new ServiceError({ message: "Purchases are unavailable." });
  return order;
}
export async function enqueuePurchase(
  id: string,
  client: PrismaTypes.TransactionClient | typeof prisma = prisma,
) {
  await client.purchasePaymentJob.upsert({
    where: { order_id: id },
    create: { order_id: id },
    update: { run_after: new Date() },
  });
}
export async function enqueuePaymentSignal(orderId: string, attemptId: string) {
  await prisma.$transaction(async (tx) => {
    const order = await lockPurchase(tx, orderId);
    await tx.purchasePaymentAttempt.updateMany({
      where: {
        id: attemptId,
        order_id: orderId,
        payment_provider: order.payment_provider,
        payment_environment: order.payment_environment,
      },
      data: { last_error: "RECONCILE_SIGNAL" },
    });
    await enqueuePurchase(orderId, tx);
  }, txOptions);
}
export function validatePaymentSnapshot(
  order: PurchaseOrder,
  attempt: PurchasePaymentAttempt,
  snapshot: PaymentSnapshot,
) {
  if (
    snapshot.remote_order_id !== attempt.remote_order_id ||
    snapshot.total_minor !== attempt.total_minor ||
    snapshot.currency !== order.currency ||
    snapshot.method !== attempt.method ||
    snapshot.installments !== attempt.installments ||
    (attempt.remote_customer_id &&
      snapshot.remote_customer_id !== attempt.remote_customer_id) ||
    (snapshot.state === "PAID" &&
      !snapshot.remote_payment_id &&
      order.payment_provider === "stripe")
  )
    throw new ValidationError({
      message: "Payment does not match this order.",
    });
}

export function createPurchaseOrderService({
  getProvider = paymentProvider,
  giftDelivery = giftCardDelivery,
}: {
  getProvider?: (name: PaymentProviderName) => PaymentProvider;
  giftDelivery?: Pick<typeof giftCardDelivery, "fulfill">;
} = {}) {
  async function findOwn(userId: string, id: string) {
    assertPaymentSandbox();
    const order = await prisma.purchaseOrder.findFirst({
      where: { id, user_id: userId, payment_environment: "sandbox" },
    });
    if (!order) throw new NotFoundError({ message: "Order not found." });
    return order;
  }
  async function latest(
    id: string,
    client: PrismaTypes.TransactionClient | typeof prisma = prisma,
  ) {
    return client.purchasePaymentAttempt.findFirst({
      where: { order_id: id },
      orderBy: { created_at: "desc" },
    });
  }
  async function begin(
    userId: string,
    input: {
      item_type: "GAME" | "GIFT_CARD";
      item_id: string;
      idempotency_key: string;
      store_slug?: string;
    },
  ) {
    assertPaymentSandbox();
    if (input.item_type === "GIFT_CARD") {
      const previous = await prisma.purchaseOrder.findUnique({
        where: {
          user_id_idempotency_key: {
            user_id: userId,
            idempotency_key: input.idempotency_key,
          },
        },
      });
      if (previous) {
        if (
          previous.item_type !== input.item_type ||
          previous.item_id !== input.item_id
        )
          throw new ConflictError({
            message: "This purchase request belongs to another product.",
          });
        return previous;
      }
    }
    const providerName = selectedPaymentProvider();
    // Resolve price and product on the server, never from the checkout payload.
    let title: string,
      slug: string | undefined,
      image: string | undefined,
      amount: number,
      exchange: Prisma.Decimal | null = null,
      cost: Prisma.Decimal | null = null;
    if (input.item_type === "GIFT_CARD") {
      if (emailGiftCardsSelected() && !emailGiftPurchasesConfigured())
        throw new ServiceError({
          message:
            "Gift card purchases are unavailable until configuration is verified.",
        });
      const product = (await giftCardProducts()).find(
        (item) => item.code === input.item_id,
      );
      if (!product || product.currency !== "BRL")
        throw new ValidationError({ message: "This product is unavailable." });
      title = product.name;
      amount = product.amount_minor;
    } else {
      const target = await game.findOneBySlug(input.item_id);
      if (!target) throw new NotFoundError({ message: "Game not found" });
      if (target.status !== "ACTIVE")
        throw new ValidationError({ message: "This product is unavailable." });
      game.ensurePurchasable(target);
      const price = await pricing.priceForOrFail(target, "BRL");
      amount = price.amount
        .mul(100)
        .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
        .toNumber();
      if (amount <= 0)
        throw new ValidationError({
          message: "Add this free game directly to your library.",
        });
      title = target.title;
      slug = target.slug;
      exchange = price.exchange_rate;
      cost = await commercialTerms.supplierCostRateFor(target);
      input = { ...input, item_id: target.id };
      const media = target.media as {
        banner?: string;
        icon?: string;
        screenshots?: string[];
      };
      image = media?.banner || media?.screenshots?.[0] || media?.icon;
    }
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 2147483647)
      throw new ValidationError({ message: "This product is unavailable." });
    if (!getProvider(providerName).configured())
      throw new ServiceError({ message: "Purchases are unavailable." });
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`${userId}:${input.item_type}:${input.item_id}`},0))`;
      const previous = await tx.purchaseOrder.findUnique({
        where: {
          user_id_idempotency_key: {
            user_id: userId,
            idempotency_key: input.idempotency_key,
          },
        },
      });
      if (previous) {
        if (
          previous.item_type !== input.item_type ||
          previous.item_id !== input.item_id
        )
          throw new ConflictError({
            message: "This purchase request belongs to another product.",
          });
        return previous;
      }
      if (
        input.item_type === "GAME" &&
        (await tx.libraryItem.findUnique({
          where: {
            user_id_item_id_item_type: {
              user_id: userId,
              item_id: input.item_id,
              item_type: "GAME",
            },
          },
        }))
      )
        throw new ConflictError({
          message: "This game is already in your library.",
        });
      const existing = await tx.purchaseOrder.findFirst({
        where: {
          user_id: userId,
          item_type: input.item_type,
          item_id: input.item_id,
          OR: [
            { payment_status: { in: ["UNPAID", "PENDING", "PROCESSING"] } },
            {
              payment_status: "PAID",
              delivery_status: { in: ["PENDING", "FAILED"] },
            },
          ],
        },
      });
      if (existing) return existing;
      // Legacy demo/Stripe deliveries also block another gift-card checkout.
      if (input.item_type === "GIFT_CARD") {
        const gift = await tx.giftCardOrder.findFirst({
          where: {
            user_id: userId,
            product_code: input.item_id,
            status: {
              in: [
                "CHECKOUT_PENDING",
                "AWAITING_PAYMENT",
                "PAID",
                "ISSUANCE_FAILED",
              ],
            },
          },
        });
        if (gift) {
          const linked = await tx.purchaseOrder.findUnique({
            where: { gift_card_order_id: gift.id },
          });
          if (linked) return linked;
          throw new ConflictError({
            message: "You already have a purchase awaiting completion.",
          });
        }
      }
      const affiliate =
        input.item_type === "GAME"
          ? await resolveAffiliateLeniently(tx, input.store_slug, input.item_id)
          : null;
      const commission = affiliate
        ? commercialTerms.commissionRateFor(
            await tx.store.findUniqueOrThrow({
              where: { id: affiliate.store_id },
              select: { commission_rate: true },
            }),
          )
        : null;
      const id = randomUUID();
      if (input.item_type === "GIFT_CARD") {
        const catalog = emailGiftCardsSelected()
          ? await tx.giftCardProduct.findUnique({
              where: { code: input.item_id },
            })
          : null;
        if (
          emailGiftCardsSelected() &&
          (!catalog?.enabled ||
            !catalog.available ||
            catalog.amount_minor !== amount)
        )
          throw new ConflictError({
            message: "This product has changed. Please choose it again.",
          });
        const account = catalog
          ? await tx.user.findUniqueOrThrow({
              where: { id: userId },
              select: { email: true },
            })
          : null;
        await tx.giftCardOrder.create({
          data: {
            id,
            user_id: userId,
            idempotency_key: input.idempotency_key,
            product_code: input.item_id,
            product_name: title,
            amount_minor: amount,
            currency: "BRL",
            ...(catalog
              ? {
                  delivery_channel: "EMAIL",
                  provider_sku: catalog.provider_sku,
                  recipient_email: account!.email.trim().toLowerCase(),
                  provider_environment: "sandbox",
                }
              : {}),
          },
        });
      }
      return tx.purchaseOrder.create({
        data: {
          id,
          user_id: userId,
          idempotency_key: input.idempotency_key,
          item_type: input.item_type,
          item_id: input.item_id,
          product_name: title,
          product_slug: slug,
          image_url: image,
          amount_minor: amount,
          currency: "BRL",
          exchange_rate: exchange,
          supplier_cost_rate: cost,
          commission_rate: commission,
          store_id: affiliate?.store_id,
          store_revision_id: affiliate?.store_revision_id,
          gift_card_order_id: input.item_type === "GIFT_CARD" ? id : null,
          payment_provider: providerName,
          payment_environment: "sandbox",
        },
      });
    }, txOptions);
  }
  async function quotes(userId: string, id: string) {
    const order = await findOwn(userId, id);
    const provider = getProvider(order.payment_provider as PaymentProviderName);
    return {
      options: await provider.quotes(order.amount_minor),
      capabilities: provider.capabilities,
    };
  }
  async function quote(
    userId: string,
    id: string,
    input: {
      method: PaymentMethod;
      installments: number;
      idempotency_key: string;
    },
  ) {
    const order = await findOwn(userId, id);
    const provider = getProvider(order.payment_provider as PaymentProviderName);
    if (
      !provider.capabilities.methods.includes(input.method) ||
      (input.method === "pix" && input.installments !== 1)
    )
      throw new ValidationError({
        message: "This payment option is unavailable.",
      });
    const quote = await provider.quote(
      order.amount_minor,
      input.installments,
      input.method,
    );
    if (
      quote.installments !== input.installments ||
      !Number.isSafeInteger(quote.total_minor) ||
      quote.total_minor < order.amount_minor ||
      quote.total_minor > 2147483647 ||
      quote.interest_minor !== quote.total_minor - order.amount_minor
    )
      throw new ServiceError({
        message: "This installment option is unavailable.",
      });
    return prisma.$transaction(async (tx) => {
      const locked = await lockPurchase(tx, id, userId);
      if (
        locked.paid_at ||
        financialFinal.includes(locked.payment_status) ||
        locked.payment_status === "CANCELLED"
      )
        throw new ConflictError({
          message: "This order cannot accept another payment.",
        });
      const current = await latest(id, tx);
      if (
        current &&
        (current.uncertain ||
          (current.submission_started_at &&
            !["FAILED", "CANCELLED"].includes(current.status)))
      )
        throw new ConflictError({
          message: "Check your order before trying another payment.",
        });
      const expires = new Date(Date.now() + 10 * 60000);
      const existing = await tx.purchasePaymentAttempt.findUnique({
        where: {
          order_id_idempotency_key: {
            order_id: id,
            idempotency_key: input.idempotency_key,
          },
        },
      });
      if (existing) {
        if (
          existing.method !== input.method ||
          existing.installments !== input.installments
        )
          throw new ConflictError({
            message: "Please confirm your payment option again.",
          });
        return existing;
      }
      // Quote identity is immutable: another tab cannot change accepted installments.
      if (current?.status === "UNPAID" && !current.submission_started_at)
        await tx.purchasePaymentAttempt.update({
          where: { id: current.id },
          data: { status: "CANCELLED" },
        });
      await tx.purchaseOrder.update({
        where: { id },
        data: { payment_status: "UNPAID" },
      });
      return tx.purchasePaymentAttempt.create({
        data: {
          order_id: id,
          payment_provider: locked.payment_provider,
          payment_environment: locked.payment_environment,
          idempotency_key: input.idempotency_key,
          method: input.method,
          ...quote,
          quote_expires_at: expires,
        },
      });
    }, txOptions);
  }
  async function submit(
    userId: string,
    id: string,
    input: {
      attempt_id: string;
      expected_total_minor: number;
      buyer: PaymentBuyer;
      card_token?: string;
    },
  ) {
    assertPaymentSandbox();
    const own = await findOwn(userId, id);
    if (!getProvider(own.payment_provider as PaymentProviderName).configured())
      throw new ServiceError({ message: "Purchases are unavailable." });
    const reservation = await prisma.$transaction(async (tx) => {
      const order = await lockPurchase(tx, id, userId);
      const attempt = await latest(id, tx);
      if (!attempt || attempt.id !== input.attempt_id)
        throw new ValidationError({
          message: "Please confirm your payment option again.",
        });
      if (attempt.submission_started_at || attempt.uncertain)
        return { order, attempt, send: false };
      if (order.gift_card_order_id) {
        const gift = await tx.giftCardOrder.findUniqueOrThrow({
          where: { id: order.gift_card_order_id },
        });
        if (gift.delivery_channel === "EMAIL") {
          if (!emailGiftPurchasesConfigured())
            throw new ServiceError({
              message:
                "Gift card purchases are unavailable until configuration is verified.",
            });
          const verifiedEmail = await requireVerifiedAccountEmail(tx, userId);
          if (
            !gift.recipient_confirmed_at ||
            !gift.recipient_data ||
            gift.recipient_email !== verifiedEmail
          )
            throw new ConflictError({
              message:
                "Confirm your gift card delivery details before payment.",
            });
          const recipient = decryptGiftRecipient(gift.recipient_data!, gift.id);
          if (recipientDocumentRequired() && !recipient.document)
            throw new ConflictError({
              message:
                "Please confirm the required recipient document before payment.",
            });
        }
      }
      if (
        order.paid_at ||
        attempt.status !== "UNPAID" ||
        financialFinal.includes(order.payment_status) ||
        order.payment_status === "CANCELLED" ||
        attempt.quote_expires_at < new Date() ||
        attempt.total_minor !== input.expected_total_minor
      )
        throw new ConflictError({
          message: "Please confirm your payment option again.",
        });
      if (
        order.payment_provider === "appmax" &&
        attempt.method === "card" &&
        !input.card_token
      )
        throw new ValidationError({
          message: "Please check your card details.",
        });
      await tx.purchasePaymentAttempt.update({
        where: { id: attempt.id },
        data: {
          submission_started_at: new Date(),
          status: "PROCESSING",
          uncertain: true,
        },
      });
      await tx.purchaseOrder.update({
        where: { id },
        data: { payment_status: "PROCESSING" },
      });
      await enqueuePurchase(id, tx);
      return { order, attempt, send: true };
    }, txOptions);
    if (!reservation.send) return view(userId, id);
    const provider = getProvider(
      reservation.order.payment_provider as PaymentProviderName,
    );
    let attempt = reservation.attempt;
    let orderCreationStarted = provider.capabilities.hosted;
    try {
      const context = paymentContext(reservation.order, attempt);
      if (!provider.capabilities.hosted) {
        const customer = await provider.createCustomer(input.buyer);
        attempt = await prisma.purchasePaymentAttempt.update({
          where: { id: attempt.id },
          data: { remote_customer_id: customer },
        });
        orderCreationStarted = true;
        const remote = await provider.createOrder({
          ...context,
          customer_id: customer,
        });
        attempt = await prisma.purchasePaymentAttempt.update({
          where: { id: attempt.id },
          data: { remote_order_id: remote },
        });
      }
      const snapshot = await provider.pay(
        paymentContext(reservation.order, attempt),
        input.buyer,
        input.card_token,
      );
      if (!attempt.remote_order_id)
        attempt = await prisma.purchasePaymentAttempt.update({
          where: { id: attempt.id },
          data: { remote_order_id: snapshot.remote_order_id },
        });
      await applySnapshot(id, attempt.id, snapshot);
      await enqueuePurchase(id);
    } catch {
      if (!orderCreationStarted) {
        // No remote order or charge was attempted: retrying with a new quote is safe.
        await prisma.$transaction(async (tx) => {
          const order = await lockPurchase(tx, id);
          await tx.purchasePaymentAttempt.update({
            where: { id: attempt.id },
            data: {
              status: "FAILED",
              uncertain: false,
              last_error: "PAYMENT_UNAVAILABLE",
            },
          });
          await tx.purchaseOrder.update({
            where: { id },
            data: { payment_status: "FAILED" },
          });
          if (order.gift_card_order_id)
            await tx.giftCardOrder.update({
              where: { id: order.gift_card_order_id },
              data: { status: "PAYMENT_FAILED" },
            });
        }, txOptions);
        return view(userId, id);
      }
      // Never replay a financial POST after a lost or ambiguous response.
      await prisma.purchasePaymentAttempt.update({
        where: { id: attempt.id },
        data: { last_error: "PAYMENT_UNCERTAIN", uncertain: true },
      });
      await enqueuePurchase(id);
    }
    return view(userId, id);
  }
  async function applySnapshot(
    id: string,
    attemptId: string,
    snapshot: PaymentSnapshot,
  ) {
    return prisma.$transaction(async (tx) => {
      const order = await lockPurchase(tx, id);
      const attempt = await tx.purchasePaymentAttempt.findUniqueOrThrow({
        where: { id: attemptId },
      });
      if (attempt.order_id !== id)
        throw new ValidationError({
          message: "Payment does not match this order.",
        });
      validatePaymentSnapshot(order, attempt, snapshot);
      if (snapshot.delivery_blocked) {
        await tx.purchasePaymentAttempt.update({
          where: { id: attemptId },
          data: { uncertain: false, last_error: "FULFILLMENT_REVIEW" },
        });
        await tx.purchasePaymentEvent.upsert({
          where: {
            attempt_id_payment_status: {
              attempt_id: attemptId,
              payment_status: snapshot.state,
            },
          },
          create: {
            order_id: id,
            attempt_id: attemptId,
            payment_status: snapshot.state,
          },
          update: {},
        });
        if (order.gift_card_order_id)
          await tx.giftCardOrder.updateMany({
            where: {
              id: order.gift_card_order_id,
              status: { not: "FULFILLED" },
            },
            data: {
              status: "CANCELLED",
              delivery_claim_token: null,
              delivery_claim_expires_at: null,
            },
          });
        return tx.purchaseOrder.update({
          where: { id },
          data: { delivery_status: "REVIEW" },
        });
      }
      const latestAttempt = await latest(id, tx);
      if (
        latestAttempt?.id !== attemptId &&
        snapshot.state !== "PAID" &&
        attempt.status !== "PAID"
      )
        return order;
      if (order.paid_at && snapshot.state === "PAID") {
        const paidAttempt = await tx.purchasePaymentAttempt.findFirst({
          where: { order_id: id, status: "PAID" },
        });
        if (paidAttempt && paidAttempt.id !== attemptId)
          throw new ConflictError({ message: "Payment requires review." });
      }
      // Paid history is immutable; refund/dispute is a distinct financial state.
      if (
        financialFinal.includes(order.payment_status) &&
        !financialFinal.includes(snapshot.state)
      )
        return order;
      if (
        order.paid_at &&
        !["PAID", "REFUNDED", "DISPUTED"].includes(snapshot.state)
      )
        return order;
      if (
        snapshot.state === "PAID" &&
        latestAttempt?.id !== attemptId &&
        latestAttempt?.submission_started_at &&
        (active.includes(latestAttempt.status) || latestAttempt.uncertain)
      ) {
        throw new ConflictError({ message: "Payment requires review." });
      }
      if (
        snapshot.state === "PAID" &&
        latestAttempt?.id !== attemptId &&
        latestAttempt?.status === "UNPAID" &&
        !latestAttempt.submission_started_at
      ) {
        await tx.purchasePaymentAttempt.update({
          where: { id: latestAttempt.id },
          data: { status: "CANCELLED" },
        });
      }
      await tx.purchasePaymentAttempt.update({
        where: { id: attemptId },
        data: {
          status: snapshot.state,
          uncertain: false,
          last_error: null,
          remote_payment_id:
            snapshot.remote_payment_id ?? attempt.remote_payment_id,
          checkout_url: snapshot.checkout_url ?? null,
          pix_emv: snapshot.pix_emv ?? attempt.pix_emv,
          pix_qrcode: snapshot.pix_qrcode ?? attempt.pix_qrcode,
          expires_at: snapshot.expires_at ?? attempt.expires_at,
        },
      });
      await tx.purchasePaymentEvent.upsert({
        where: {
          attempt_id_payment_status: {
            attempt_id: attemptId,
            payment_status: snapshot.state,
          },
        },
        create: {
          order_id: id,
          attempt_id: attemptId,
          payment_status: snapshot.state,
        },
        update: {},
      });
      const paidAt =
        order.paid_at ??
        (snapshot.state === "PAID" ? (snapshot.paid_at ?? new Date()) : null);
      let next = await tx.purchaseOrder.update({
        where: { id },
        data: {
          payment_status: snapshot.state,
          paid_at: paidAt,
          ...(financialFinal.includes(snapshot.state) &&
          order.delivery_status !== "READY"
            ? { delivery_status: "REVIEW" as const }
            : {}),
        },
      });
      if (next.gift_card_order_id) {
        const gift = await tx.giftCardOrder.findUniqueOrThrow({
          where: { id: next.gift_card_order_id },
        });
        if (snapshot.state === "PAID" && !gift.paid_at)
          await tx.giftCardOrder.update({
            where: { id: gift.id },
            data: { status: "PAID", paid_at: paidAt, checkout_url: null },
          });
        if (
          snapshot.state === "PAID" &&
          gift.delivery_channel === "EMAIL" &&
          next.delivery_status !== "REVIEW" &&
          gift.fulfillment_status !== "DELIVERED" &&
          gift.fulfillment_status !== "CANCELLED"
        )
          await enqueueGiftFulfillment(gift.id, tx);
        if (["FAILED", "CANCELLED"].includes(snapshot.state) && !gift.paid_at)
          await tx.giftCardOrder.update({
            where: { id: gift.id },
            data: {
              status:
                snapshot.state === "FAILED" ? "PAYMENT_FAILED" : "CANCELLED",
              checkout_url: null,
            },
          });
        if (
          financialFinal.includes(snapshot.state) &&
          gift.status !== "FULFILLED"
        )
          await tx.giftCardOrder.update({
            where: { id: gift.id },
            data: {
              status: "CANCELLED",
              checkout_url: null,
              delivery_claim_token: null,
              delivery_claim_expires_at: null,
            },
          });
      }
      if (
        next.payment_status === "PAID" &&
        next.item_type === "GAME" &&
        next.delivery_status !== "REVIEW" &&
        next.delivery_status !== "READY"
      ) {
        await fulfillPaidPurchase(tx, next, attempt.interest_minor);
        next = await tx.purchaseOrder.update({
          where: { id },
          data: { delivery_status: "READY", fulfilled_at: new Date() },
        });
      }
      return next;
    }, txOptions);
  }
  async function deliver(id: string) {
    const order = await prisma.purchaseOrder.findUniqueOrThrow({
      where: { id },
    });
    if (order.payment_environment !== "sandbox")
      throw new ServiceError({ message: "Purchases are unavailable." });
    if (
      order.payment_status !== "PAID" ||
      order.delivery_status === "READY" ||
      order.delivery_status === "REVIEW"
    )
      return;
    if (order.item_type === "GAME") {
      const attempt = await latest(id);
      if (attempt)
        await applySnapshot(
          id,
          attempt.id,
          await getProvider(
            order.payment_provider as PaymentProviderName,
          ).retrieve(paymentContext(order, attempt)),
        );
      return;
    }
    const gift = await prisma.giftCardOrder.findUniqueOrThrow({
      where: { id: order.gift_card_order_id! },
    });
    if (gift.delivery_channel === "EMAIL") {
      if (
        !["DELIVERED", "CANCELLED", "REVIEW"].includes(gift.fulfillment_status)
      )
        await enqueueGiftFulfillment(gift.id);
      return;
    }
    try {
      await giftDelivery.fulfill(order.gift_card_order_id!);
      await prisma.purchaseOrder.updateMany({
        where: { id, payment_status: "PAID" },
        data: { delivery_status: "READY", fulfilled_at: new Date() },
      });
    } catch {
      await prisma.purchaseOrder.updateMany({
        where: {
          id,
          payment_status: "PAID",
          delivery_status: { not: "READY" },
        },
        data: { delivery_status: "FAILED" },
      });
      throw new ServiceError({
        message:
          "Your payment is confirmed. Your product will be available soon.",
      });
    }
  }
  async function reconcile(id: string) {
    assertPaymentSandbox();
    const order = await prisma.purchaseOrder.findUniqueOrThrow({
      where: { id },
    });
    if (order.payment_environment !== "sandbox")
      throw new ServiceError({ message: "Purchases are unavailable." });
    const current = await latest(id);
    const signaled = await prisma.purchasePaymentAttempt.findMany({
      where: {
        order_id: id,
        last_error: "RECONCILE_SIGNAL",
        id: { not: current?.id },
        remote_order_id: { not: null },
      },
      orderBy: { created_at: "asc" },
    });
    for (const attempt of [...signaled, ...(current ? [current] : [])]) {
      if (!attempt.remote_order_id) {
        if (attempt.status === "FAILED" && !attempt.uncertain) continue;
        if (attempt.submission_started_at)
          throw new ConflictError({ message: "Payment requires review." });
        continue;
      }
      const snapshot = await getProvider(
        order.payment_provider as PaymentProviderName,
      ).retrieve(paymentContext(order, attempt));
      await applySnapshot(id, attempt.id, snapshot);
      await prisma.purchasePaymentAttempt.updateMany({
        where: { id: attempt.id, last_error: "RECONCILE_SIGNAL" },
        data: { last_error: null },
      });
    }
    await deliver(id);
  }
  async function cancel(userId: string, id: string) {
    const order = await findOwn(userId, id);
    const attempt = await latest(id);
    if (!attempt?.submission_started_at)
      return prisma.$transaction(async (tx) => {
        await lockPurchase(tx, id, userId);
        const current = await latest(id, tx);
        if (current?.submission_started_at)
          throw new ConflictError({
            message: "Check your order before trying another payment.",
          });
        if (current)
          await tx.purchasePaymentAttempt.update({
            where: { id: current.id },
            data: { status: "CANCELLED" },
          });
        const next = await tx.purchaseOrder.update({
          where: { id },
          data: { payment_status: "CANCELLED" },
        });
        if (next.gift_card_order_id)
          await tx.giftCardOrder.update({
            where: { id: next.gift_card_order_id },
            data: { status: "CANCELLED" },
          });
        return next;
      }, txOptions);
    const provider = getProvider(order.payment_provider as PaymentProviderName);
    if (
      order.paid_at ||
      attempt.uncertain ||
      !attempt.remote_order_id ||
      !provider.cancel
    )
      throw new ConflictError({
        message:
          "This payment cannot be cancelled here. Check your order status.",
      });
    const snapshot = await provider.cancel(paymentContext(order, attempt));
    const result = await applySnapshot(id, attempt.id, snapshot);
    await enqueuePurchase(id);
    return result;
  }
  async function view(userId: string, id: string) {
    const order = await findOwn(userId, id);
    const attempt = order.paid_at
      ? ((await prisma.purchasePaymentAttempt.findFirst({
          where: {
            order_id: id,
            status: { in: ["PAID", "REFUNDED", "DISPUTED"] },
          },
          orderBy: { created_at: "desc" },
        })) ?? (await latest(id)))
      : await latest(id);
    const provider = getProvider(order.payment_provider as PaymentProviderName);
    const installation =
      order.payment_provider === "appmax"
        ? await prisma.paymentInstallation.findUnique({
            where: {
              provider_environment: {
                provider: "appmax",
                environment: order.payment_environment,
              },
            },
          })
        : null;
    const gift = order.gift_card_order_id
      ? await prisma.giftCardOrder.findUnique({
          where: { id: order.gift_card_order_id },
        })
      : null;
    const account =
      gift?.delivery_channel === "EMAIL"
        ? await prisma.user.findUnique({
            where: { id: userId },
            select: { email: true },
          })
        : null;
    const proof = account
      ? await prisma.userEmailVerification.findUnique({
          where: { user_id: userId },
        })
      : null;
    let recipientReady = Boolean(
      gift?.recipient_confirmed_at && gift.recipient_data,
    );
    if (gift?.delivery_channel === "EMAIL" && gift.recipient_data) {
      try {
        const recipient = decryptGiftRecipient(gift.recipient_data, gift.id);
        recipientReady =
          recipientReady &&
          (!recipientDocumentRequired() || Boolean(recipient.document));
      } catch {
        recipientReady = false;
      }
    }
    return {
      order: {
        ...orderOutput(order, attempt),
        ...(gift?.delivery_channel === "EMAIL"
          ? {
              gift_card_delivery: {
                channel: "EMAIL",
                email: gift.recipient_email,
                status: gift.fulfillment_status,
              },
            }
          : {}),
      },
      ...(gift?.delivery_channel === "EMAIL"
        ? {
            gift_card_delivery: {
              channel: "EMAIL",
              email: gift.recipient_email,
              confirmed: Boolean(gift.recipient_confirmed_at),
              recipient_ready: recipientReady,
              verification_required:
                !account ||
                proof?.email !== account.email.trim().toLowerCase() ||
                gift.recipient_email !== account.email.trim().toLowerCase(),
              document_required: recipientDocumentRequired(),
            },
          }
        : {}),
      checkout: {
        available:
          provider.configured() &&
          (gift?.delivery_channel !== "EMAIL" ||
            emailGiftPurchasesConfigured()) &&
          (provider.capabilities.hosted || Boolean(installation)),
        methods: provider.capabilities.methods,
        hosted: provider.capabilities.hosted,
        installments: provider.capabilities.installments,
        external_id: installation?.external_id ?? null,
        script_url: installation
          ? "https://scripts.sandboxappmax.com.br/appmax.min.js"
          : null,
      },
      attempt: attempt
        ? {
            id: attempt.id,
            method: attempt.method,
            installments: attempt.installments,
            total_minor: attempt.total_minor,
            interest_minor: attempt.interest_minor,
            quote_expires_at: attempt.quote_expires_at.toISOString(),
            submitted: Boolean(attempt.submission_started_at),
            uncertain: attempt.uncertain,
            checkout_url:
              active.includes(order.payment_status) && !attempt.uncertain
                ? attempt.checkout_url
                : null,
            pix:
              attempt.method === "pix" &&
              order.payment_status === "PENDING" &&
              !attempt.uncertain &&
              attempt.pix_emv &&
              attempt.pix_qrcode
                ? {
                    emv: attempt.pix_emv,
                    qrcode: attempt.pix_qrcode,
                    expires_at: attempt.expires_at?.toISOString(),
                  }
                : null,
          }
        : null,
    };
  }
  async function listOwn(userId: string) {
    assertPaymentSandbox();
    const orders = await prisma.purchaseOrder.findMany({
      where: { user_id: userId, payment_environment: "sandbox" },
      orderBy: { created_at: "desc" },
      take: 100,
    });
    const attempts = await prisma.purchasePaymentAttempt.findMany({
      where: { order_id: { in: orders.map((order) => order.id) } },
      orderBy: { created_at: "desc" },
    });
    const legacy = await prisma.sale.findMany({
      where: { user_id: userId, purchase_order_id: null },
      orderBy: { created_at: "desc" },
      take: 100,
    });
    const games = await prisma.game.findMany({
      where: { id: { in: legacy.map((sale) => sale.game_id) } },
      select: { id: true, title: true, slug: true, media: true },
    });
    const gifts = await prisma.giftCardOrder.findMany({
      where: {
        id: {
          in: orders.flatMap((order) =>
            order.gift_card_order_id ? [order.gift_card_order_id] : [],
          ),
        },
        user_id: userId,
      },
      select: {
        id: true,
        delivery_channel: true,
        recipient_email: true,
        fulfillment_status: true,
      },
    });
    const output = orders.map((order) => ({
      ...orderOutput(
        order,
        (order.paid_at
          ? attempts.find(
              (attempt) =>
                attempt.order_id === order.id &&
                ["PAID", "REFUNDED", "DISPUTED"].includes(attempt.status),
            )
          : null) ?? attempts.find((attempt) => attempt.order_id === order.id),
      ),
      ...(() => {
        const gift = gifts.find((item) => item.id === order.gift_card_order_id);
        return gift?.delivery_channel === "EMAIL"
          ? {
              gift_card_delivery: {
                channel: "EMAIL",
                email: gift.recipient_email,
                status: gift.fulfillment_status,
              },
            }
          : {};
      })(),
    }));
    for (const sale of legacy) {
      const target = games.find((game) => game.id === sale.game_id);
      output.push({
        id: `acquisition-${sale.id}`,
        item_type: "GAME",
        item_id: sale.game_id,
        product_name: target?.title ?? "Game",
        product_slug: target?.slug ?? null,
        image_url:
          (
            target?.media as {
              banner?: string;
              screenshots?: string[];
              icon?: string;
            }
          )?.banner ??
          (target?.media as { screenshots?: string[] })?.screenshots?.[0] ??
          (target?.media as { icon?: string })?.icon ??
          null,
        amount_minor: sale.price_at_sale.mul(100).toDecimalPlaces(0).toNumber(),
        total_minor: sale.price_at_sale.mul(100).toDecimalPlaces(0).toNumber(),
        interest_minor: 0,
        installments: 1,
        currency: sale.currency,
        payment_status: "ACQUIRED",
        delivery_status: "READY",
        created_at: sale.created_at.toISOString(),
        gift_card_order_id: null,
        can_pay: false,
        can_cancel: false,
      });
    }
    return output.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  return {
    begin,
    findOwn,
    quotes,
    quote,
    submit,
    view,
    listOwn,
    reconcile,
    applySnapshot,
    deliver,
    cancel,
  };
}
export function orderOutput(
  order: PurchaseOrder,
  attempt?: PurchasePaymentAttempt | null,
) {
  return {
    id: order.id,
    item_type: order.item_type,
    item_id: order.item_id,
    product_name: order.product_name,
    product_slug: order.product_slug,
    image_url: order.image_url,
    amount_minor: order.amount_minor,
    total_minor: attempt?.total_minor ?? order.amount_minor,
    interest_minor: attempt?.interest_minor ?? 0,
    installments: attempt?.installments ?? 1,
    currency: order.currency,
    payment_status: order.payment_status as string,
    delivery_status: order.delivery_status as string,
    created_at: order.created_at.toISOString(),
    gift_card_order_id: order.gift_card_order_id,
    can_pay:
      !order.paid_at &&
      !financialFinal.includes(order.payment_status) &&
      order.payment_status !== "CANCELLED" &&
      !attempt?.uncertain &&
      (!attempt?.submission_started_at ||
        ["FAILED", "CANCELLED"].includes(attempt.status)),
    can_cancel:
      !order.paid_at &&
      order.payment_status !== "CANCELLED" &&
      !attempt?.uncertain &&
      (!attempt?.submission_started_at || order.payment_provider === "stripe"),
  };
}
export default createPurchaseOrderService();
