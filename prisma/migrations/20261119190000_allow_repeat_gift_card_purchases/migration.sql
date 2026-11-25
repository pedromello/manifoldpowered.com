BEGIN;

-- Each gift card checkout has its own order. UUID uniqueness still protects retries.
DROP INDEX "gift_card_orders_active_product_key";
DROP INDEX "purchase_orders_active_item_key";

CREATE UNIQUE INDEX "purchase_orders_active_item_key"
ON "purchase_orders" ("user_id", "item_type", "item_id")
WHERE "item_type" = 'GAME' AND (
  "payment_status" IN ('UNPAID', 'PENDING', 'PROCESSING') OR
  ("payment_status" = 'PAID' AND "delivery_status" IN ('PENDING', 'FAILED'))
);

COMMIT;
