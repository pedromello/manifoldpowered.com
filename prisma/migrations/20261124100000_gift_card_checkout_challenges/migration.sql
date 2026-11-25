CREATE TABLE "gift_card_checkout_challenges" (
    "id" TEXT NOT NULL,
    "intent_id" TEXT NOT NULL,
    "product_code" VARCHAR(255) NOT NULL,
    "email" VARCHAR(234) NOT NULL,
    "browser_hash" VARCHAR(64) NOT NULL,
    "address_hash" VARCHAR(64) NOT NULL,
    "code_hash" VARCHAR(64) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "session_id" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gift_card_checkout_challenges_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "gift_card_checkout_challenges_email_created_at_idx" ON "gift_card_checkout_challenges"("email", "created_at");
CREATE INDEX "gift_card_checkout_challenges_address_hash_created_at_idx" ON "gift_card_checkout_challenges"("address_hash", "created_at");
CREATE INDEX "gift_card_checkout_challenges_browser_hash_intent_id_idx" ON "gift_card_checkout_challenges"("browser_hash", "intent_id");
CREATE INDEX "gift_card_checkout_challenges_expires_at_idx" ON "gift_card_checkout_challenges"("expires_at");
