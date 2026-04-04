-- AlterTable
ALTER TABLE "users" ADD COLUMN     "features" TEXT[] DEFAULT ARRAY[]::TEXT[];
