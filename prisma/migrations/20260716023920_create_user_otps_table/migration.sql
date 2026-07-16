-- CreateTable
CREATE TABLE "user_otps" (
    "id" TEXT NOT NULL,
    "used_at" TIMESTAMP(3),
    "user_id" TEXT NOT NULL,
    "code_hash" VARCHAR(60) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_otps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_otps_user_id_idx" ON "user_otps"("user_id");

-- CreateIndex
CREATE INDEX "user_otps_expires_at_idx" ON "user_otps"("expires_at");
