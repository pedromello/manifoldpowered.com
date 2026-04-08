-- CreateTable
CREATE TABLE "user_activation_tokens" (
    "id" TEXT NOT NULL,
    "used_at" TIMESTAMP(3),
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_activation_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_activation_tokens_user_id_idx" ON "user_activation_tokens"("user_id");

-- CreateIndex
CREATE INDEX "user_activation_tokens_expires_at_idx" ON "user_activation_tokens"("expires_at");
