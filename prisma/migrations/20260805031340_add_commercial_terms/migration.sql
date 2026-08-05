-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "commission_rate" DECIMAL(19,8);

-- CreateTable
CREATE TABLE "supplier_terms" (
    "id" TEXT NOT NULL,
    "supplier_type" VARCHAR(50) NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "cost_rate" DECIMAL(19,8) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_terms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "supplier_terms_supplier_type_supplier_id_key" ON "supplier_terms"("supplier_type", "supplier_id");
