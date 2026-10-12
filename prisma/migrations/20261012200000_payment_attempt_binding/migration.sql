ALTER TABLE "purchase_payment_attempts" ADD COLUMN "payment_provider" VARCHAR(20), ADD COLUMN "payment_environment" VARCHAR(20);
UPDATE purchase_payment_attempts AS a SET payment_provider=o.payment_provider,payment_environment=o.payment_environment FROM purchase_orders AS o WHERE a.order_id=o.id;
ALTER TABLE "purchase_payment_attempts" ALTER COLUMN "payment_provider" SET NOT NULL, ALTER COLUMN "payment_environment" SET NOT NULL;
CREATE UNIQUE INDEX "purchase_payment_attempts_payment_provider_payment_environment_remote_order_id_key" ON "purchase_payment_attempts"("payment_provider","payment_environment","remote_order_id");
