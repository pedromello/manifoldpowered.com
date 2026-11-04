-- Keep the index name below PostgreSQL's identifier limit and stable in Prisma.
ALTER INDEX "purchase_payment_attempts_payment_provider_payment_environment_remote_order_id_key" RENAME TO "purchase_payment_provider_remote_key";
