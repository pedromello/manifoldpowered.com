ALTER TABLE "gift_card_orders" ADD COLUMN "first_revealed_at" TIMESTAMP(3);

ALTER TABLE "gift_card_orders" ADD CONSTRAINT "gift_card_revelation_requires_delivery"
  CHECK (first_revealed_at IS NULL OR (paid_at IS NOT NULL AND fulfilled_at IS NOT NULL AND gift_card_code IS NOT NULL));

-- Earlier versions returned codes with order listings. A NULL timestamp on a
-- legacy row is not evidence that its code was never disclosed.
