ALTER TABLE "gift_card_orders"
ADD COLUMN "issuance_started_at" TIMESTAMP(3),
ADD COLUMN "delivery_claim_token" TEXT,
ADD COLUMN "delivery_claim_expires_at" TIMESTAMP(3),
ADD COLUMN "payment_reconcile_after" TIMESTAMP(3),
ADD COLUMN "payment_reconcile_claim_token" TEXT,
ADD COLUMN "payment_reconcile_claim_expires_at" TIMESTAMP(3);

-- Legacy paid orders may already have reached the supplier. Reconcile first.
UPDATE "gift_card_orders" SET "issuance_started_at" = COALESCE("fulfilled_at", "paid_at")
WHERE "paid_at" IS NOT NULL;

ALTER TABLE "gift_card_orders"
ADD CONSTRAINT "gift_card_delivery_claim_pair" CHECK (("delivery_claim_token" IS NULL) = ("delivery_claim_expires_at" IS NULL)),
ADD CONSTRAINT "gift_card_payment_claim_pair" CHECK (("payment_reconcile_claim_token" IS NULL) = ("payment_reconcile_claim_expires_at" IS NULL)),
ADD CONSTRAINT "gift_card_issuance_requires_payment" CHECK ("issuance_started_at" IS NULL OR "paid_at" IS NOT NULL),
ADD CONSTRAINT "gift_card_delivery_claim_requires_payment" CHECK ("delivery_claim_token" IS NULL OR ("paid_at" IS NOT NULL AND "status" IN ('PAID', 'ISSUANCE_FAILED')));
