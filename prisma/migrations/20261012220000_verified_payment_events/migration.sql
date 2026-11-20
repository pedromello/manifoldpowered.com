-- Verified state receipts only: no customer data, tokens or webhook payloads.
CREATE TABLE "purchase_payment_events" (
 "id" TEXT PRIMARY KEY, "order_id" TEXT NOT NULL, "attempt_id" TEXT NOT NULL,
 "payment_status" "PurchasePaymentStatus" NOT NULL,
 "observed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "purchase_payment_events_attempt_id_payment_status_key" ON "purchase_payment_events"("attempt_id","payment_status");
CREATE INDEX "purchase_payment_events_order_id_observed_at_idx" ON "purchase_payment_events"("order_id","observed_at");
