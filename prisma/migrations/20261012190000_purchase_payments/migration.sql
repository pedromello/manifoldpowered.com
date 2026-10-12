CREATE TYPE "PurchasePaymentStatus" AS ENUM ('UNPAID','PENDING','PROCESSING','PAID','FAILED','CANCELLED','REFUNDED','DISPUTED');
CREATE TYPE "PurchaseDeliveryStatus" AS ENUM ('PENDING','READY','FAILED','REVIEW');
ALTER TYPE "LedgerAccountType" ADD VALUE 'FINANCING_CLEARING';
ALTER TABLE "sales" ADD COLUMN "purchase_order_id" TEXT;
CREATE UNIQUE INDEX "sales_purchase_order_id_key" ON "sales"("purchase_order_id");
CREATE TABLE "purchase_orders" (
 "id" TEXT PRIMARY KEY, "user_id" TEXT NOT NULL, "idempotency_key" VARCHAR(64) NOT NULL,
 "item_type" "ItemType" NOT NULL, "item_id" TEXT NOT NULL, "product_name" VARCHAR(200) NOT NULL,
 "product_slug" TEXT, "image_url" TEXT, "amount_minor" INTEGER NOT NULL CHECK (amount_minor > 0), "currency" VARCHAR(3) NOT NULL,
 "exchange_rate" DECIMAL(19,8), "supplier_cost_rate" DECIMAL(19,8), "commission_rate" DECIMAL(19,8),
 "store_id" TEXT, "store_revision_id" TEXT, "gift_card_order_id" TEXT,
 "payment_provider" VARCHAR(20) NOT NULL, "payment_environment" VARCHAR(20) NOT NULL,
 "payment_status" "PurchasePaymentStatus" NOT NULL DEFAULT 'UNPAID', "delivery_status" "PurchaseDeliveryStatus" NOT NULL DEFAULT 'PENDING',
 "paid_at" TIMESTAMP(3), "fulfilled_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "purchase_orders_user_id_idempotency_key_key" ON "purchase_orders"("user_id","idempotency_key");
CREATE UNIQUE INDEX "purchase_orders_gift_card_order_id_key" ON "purchase_orders"("gift_card_order_id");
CREATE INDEX "purchase_orders_user_id_created_at_idx" ON "purchase_orders"("user_id","created_at");
CREATE UNIQUE INDEX "purchase_orders_active_item_key" ON "purchase_orders"("user_id","item_type","item_id")
 WHERE "payment_status" IN ('UNPAID','PENDING','PROCESSING') OR ("payment_status" = 'PAID' AND "delivery_status" IN ('PENDING','FAILED'));
CREATE TABLE "purchase_payment_attempts" (
 "id" TEXT PRIMARY KEY, "order_id" TEXT NOT NULL, "idempotency_key" VARCHAR(64) NOT NULL, "method" VARCHAR(20) NOT NULL,
 "installments" INTEGER NOT NULL DEFAULT 1 CHECK (installments BETWEEN 1 AND 12),
 "total_minor" INTEGER NOT NULL CHECK (total_minor > 0), "interest_minor" INTEGER NOT NULL DEFAULT 0 CHECK (interest_minor >= 0),
 "quote_expires_at" TIMESTAMP(3) NOT NULL, "status" "PurchasePaymentStatus" NOT NULL DEFAULT 'UNPAID',
 "submission_started_at" TIMESTAMP(3), "remote_customer_id" TEXT, "remote_order_id" TEXT, "remote_payment_id" TEXT,
 "checkout_url" TEXT, "pix_emv" TEXT, "pix_qrcode" TEXT, "expires_at" TIMESTAMP(3), "uncertain" BOOLEAN NOT NULL DEFAULT false,
 "last_error" VARCHAR(50), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "purchase_payment_attempts_order_id_idempotency_key_key" ON "purchase_payment_attempts"("order_id","idempotency_key");
CREATE INDEX "purchase_payment_attempts_order_id_created_at_idx" ON "purchase_payment_attempts"("order_id","created_at");
CREATE INDEX "purchase_payment_attempts_remote_order_id_idx" ON "purchase_payment_attempts"("remote_order_id");
CREATE UNIQUE INDEX "purchase_payment_attempts_active_order_key" ON "purchase_payment_attempts"("order_id")
 WHERE "status" IN ('UNPAID','PENDING','PROCESSING','PAID') OR "uncertain";
CREATE TABLE "purchase_payment_jobs" (
 "order_id" TEXT PRIMARY KEY, "run_after" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "claim_token" TEXT, "claim_until" TIMESTAMP(3), "attempts" INTEGER NOT NULL DEFAULT 0,
 "last_error" VARCHAR(50), "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "purchase_payment_jobs_run_after_idx" ON "purchase_payment_jobs"("run_after");
CREATE TABLE "payment_installations" (
 "id" TEXT PRIMARY KEY, "provider" VARCHAR(20) NOT NULL, "environment" VARCHAR(20) NOT NULL,
 "external_id" TEXT NOT NULL, "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "payment_installations_provider_environment_key" ON "payment_installations"("provider","environment");
-- Only existing Stripe-bound orders are financial history. Demo seeds remain untouched.
INSERT INTO purchase_orders (id,user_id,idempotency_key,item_type,item_id,product_name,amount_minor,currency,gift_card_order_id,payment_provider,payment_environment,payment_status,delivery_status,paid_at,fulfilled_at,created_at,updated_at)
 SELECT id,user_id,idempotency_key,'GIFT_CARD',product_code,product_name,amount_minor,currency,id,'stripe','sandbox',
 (CASE WHEN paid_at IS NOT NULL THEN 'PAID' WHEN status='CANCELLED' THEN 'CANCELLED' WHEN status='PAYMENT_FAILED' THEN 'FAILED' ELSE 'PENDING' END)::"PurchasePaymentStatus",
 (CASE WHEN status='FULFILLED' THEN 'READY' WHEN status='ISSUANCE_FAILED' THEN 'FAILED' ELSE 'PENDING' END)::"PurchaseDeliveryStatus",paid_at,fulfilled_at,created_at,updated_at
 FROM gift_card_orders WHERE stripe_session_id IS NOT NULL;
INSERT INTO purchase_payment_attempts (id,order_id,idempotency_key,method,total_minor,quote_expires_at,status,submission_started_at,remote_order_id,remote_payment_id,checkout_url,expires_at,created_at,updated_at)
 SELECT 'legacy-'||id,id,idempotency_key,'card',amount_minor,checkout_started_at,
 (CASE WHEN paid_at IS NOT NULL THEN 'PAID' WHEN status='CANCELLED' THEN 'CANCELLED' WHEN status='PAYMENT_FAILED' THEN 'FAILED' ELSE 'PENDING' END)::"PurchasePaymentStatus",checkout_started_at,stripe_session_id,stripe_payment_intent_id,checkout_url,checkout_expires_at,created_at,updated_at
 FROM gift_card_orders WHERE stripe_session_id IS NOT NULL;
INSERT INTO purchase_payment_jobs (order_id,updated_at)
 SELECT id,CURRENT_TIMESTAMP FROM purchase_orders WHERE payment_status IN ('PENDING','PROCESSING') OR (payment_status='PAID' AND delivery_status!='READY');
