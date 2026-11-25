-- Mailbox proof is bound to the exact challenge destination. Older challenges
-- remain usable for legacy account activation, but cannot prove a mailbox.
ALTER TABLE "user_otps" ADD COLUMN "email" VARCHAR(234);
ALTER TABLE "user_activation_tokens" ADD COLUMN "email" VARCHAR(234);

CREATE TABLE "user_email_verifications" (
  "user_id" TEXT PRIMARY KEY,
  "email" VARCHAR(234) NOT NULL,
  "verified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_email_verification_email" CHECK (length("email") > 0)
);

CREATE TABLE "gift_card_products" (
  "id" TEXT PRIMARY KEY,
  "code" VARCHAR(100) NOT NULL,
  "provider_sku" VARCHAR(200) NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "amount_minor" INTEGER NOT NULL,
  "provider_cost_minor" INTEGER,
  "currency" VARCHAR(3) NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "available" BOOLEAN NOT NULL DEFAULT true,
  "synced_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "gift_card_product_positive_amount" CHECK ("amount_minor" > 0),
  CONSTRAINT "gift_card_product_nonnegative_cost" CHECK ("provider_cost_minor" IS NULL OR "provider_cost_minor" >= 0),
  CONSTRAINT "gift_card_product_currency" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "gift_card_product_identity" CHECK (length("code") > 0 AND length("provider_sku") > 0 AND length("name") > 0)
);
CREATE UNIQUE INDEX "gift_card_products_code_key" ON "gift_card_products"("code");

CREATE TABLE "gift_card_catalog_syncs" (
  "id" TEXT PRIMARY KEY,
  "last_success_at" TIMESTAMP(3),
  "last_error" VARCHAR(50),
  "claim_token" TEXT,
  "claim_until" TIMESTAMP(3),
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "gift_card_catalog_singleton" CHECK ("id" = 'catalog'),
  CONSTRAINT "gift_card_catalog_claim_pair" CHECK (("claim_token" IS NULL) = ("claim_until" IS NULL))
);

ALTER TABLE "gift_card_orders"
  ADD COLUMN "delivery_channel" VARCHAR(20) NOT NULL DEFAULT 'CODE',
  ADD COLUMN "provider_environment" VARCHAR(20) NOT NULL DEFAULT 'sandbox',
  ADD COLUMN "provider_sku" VARCHAR(200),
  ADD COLUMN "recipient_email" VARCHAR(234),
  ADD COLUMN "recipient_data" TEXT,
  ADD COLUMN "recipient_confirmed_at" TIMESTAMP(3),
  ADD COLUMN "fulfillment_status" VARCHAR(20) NOT NULL DEFAULT 'QUEUED',
  ADD COLUMN "submitted_at" TIMESTAMP(3),
  ADD COLUMN "next_tracking_at" TIMESTAMP(3),
  ADD COLUMN "last_tracking_at" TIMESTAMP(3),
  ADD COLUMN "provider_status" INTEGER;

ALTER TABLE "gift_card_orders"
  DROP CONSTRAINT "gift_card_order_delivery_requires_payment",
  ADD CONSTRAINT "gift_card_delivery_channel" CHECK ("delivery_channel" IN ('CODE', 'EMAIL')),
  ADD CONSTRAINT "gift_card_provider_environment" CHECK ("provider_environment" IN ('sandbox', 'production')),
  ADD CONSTRAINT "gift_card_fulfillment_status" CHECK ("fulfillment_status" IN ('QUEUED', 'SUBMITTING', 'PROCESSING', 'DELIVERED', 'CANCELLED', 'REVIEW')),
  ADD CONSTRAINT "gift_card_email_never_stores_code" CHECK ("delivery_channel" != 'EMAIL' OR ("gift_card_code" IS NULL AND "first_revealed_at" IS NULL)),
  ADD CONSTRAINT "gift_card_order_delivery_requires_payment" CHECK (
    "status" != 'FULFILLED' OR (
      "paid_at" IS NOT NULL AND "fulfilled_at" IS NOT NULL AND "provider_reference" IS NOT NULL AND (
        ("delivery_channel" = 'CODE' AND "gift_card_code" IS NOT NULL) OR
        ("delivery_channel" = 'EMAIL' AND "recipient_email" IS NOT NULL AND "recipient_confirmed_at" IS NOT NULL AND "provider_status" IS NOT NULL AND "provider_status" = 3 AND "gift_card_code" IS NULL)
      )
    )
  );

CREATE TABLE "gift_card_fulfillment_jobs" (
  "order_id" TEXT PRIMARY KEY,
  "run_after" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claim_token" TEXT,
  "claim_until" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "last_error" VARCHAR(50),
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "gift_card_fulfillment_claim_pair" CHECK (("claim_token" IS NULL) = ("claim_until" IS NULL)),
  CONSTRAINT "gift_card_fulfillment_nonnegative_attempts" CHECK ("attempts" >= 0)
);
CREATE INDEX "gift_card_fulfillment_jobs_run_after_idx" ON "gift_card_fulfillment_jobs"("run_after");
