-- A trusted late payment must be recordable even when a cancelled order was
-- replaced. The model still serializes new requests and checks undelivered
-- paid orders; this index protects concurrent unpaid checkout creation.
DROP INDEX "gift_card_orders_active_product_key";
CREATE UNIQUE INDEX "gift_card_orders_active_product_key"
ON "gift_card_orders" ("user_id", "product_code")
WHERE "status" IN ('CHECKOUT_PENDING', 'AWAITING_PAYMENT');
