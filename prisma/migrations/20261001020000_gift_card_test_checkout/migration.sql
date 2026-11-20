-- CreateEnum
CREATE TYPE "GiftCardOrderStatus" AS ENUM ('CHECKOUT_PENDING', 'AWAITING_PAYMENT', 'PAID', 'ISSUANCE_FAILED', 'FULFILLED', 'CANCELLED', 'PAYMENT_FAILED');

-- AlterEnum
ALTER TYPE "ItemType" ADD VALUE 'GIFT_CARD';

-- CreateTable
CREATE TABLE "gift_card_orders" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "idempotency_key" VARCHAR(64) NOT NULL,
    "product_code" VARCHAR(100) NOT NULL,
    "product_name" VARCHAR(200) NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "status" "GiftCardOrderStatus" NOT NULL DEFAULT 'CHECKOUT_PENDING',
    "stripe_session_id" TEXT,
    "stripe_payment_intent_id" TEXT,
    "checkout_url" TEXT,
    "checkout_expires_at" TIMESTAMP(3),
    "checkout_started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMP(3),
    "fulfilled_at" TIMESTAMP(3),
    "provider_reference" TEXT,
    "gift_card_code" TEXT,
    "last_error" VARCHAR(50),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gift_card_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gift_card_payment_events" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gift_card_payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gift_card_orders_stripe_session_id_key" ON "gift_card_orders"("stripe_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "gift_card_orders_stripe_payment_intent_id_key" ON "gift_card_orders"("stripe_payment_intent_id");

-- CreateIndex
CREATE UNIQUE INDEX "gift_card_orders_provider_reference_key" ON "gift_card_orders"("provider_reference");

-- CreateIndex
CREATE INDEX "gift_card_orders_user_id_created_at_idx" ON "gift_card_orders"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "gift_card_orders_user_id_idempotency_key_key" ON "gift_card_orders"("user_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "gift_card_payment_events_order_id_idx" ON "gift_card_payment_events"("order_id");

-- Only one unpaid or undelivered purchase of a product per buyer.
CREATE UNIQUE INDEX "gift_card_orders_active_product_key"
ON "gift_card_orders" ("user_id", "product_code")
WHERE "status" IN ('CHECKOUT_PENDING', 'AWAITING_PAYMENT', 'PAID', 'ISSUANCE_FAILED');

ALTER TABLE "gift_card_orders" ADD CONSTRAINT "gift_card_order_positive_amount" CHECK ("amount_minor" > 0);
ALTER TABLE "gift_card_orders" ADD CONSTRAINT "gift_card_order_delivery_requires_payment"
CHECK ("status" != 'FULFILLED' OR ("paid_at" IS NOT NULL AND "fulfilled_at" IS NOT NULL AND "gift_card_code" IS NOT NULL AND "provider_reference" IS NOT NULL));
