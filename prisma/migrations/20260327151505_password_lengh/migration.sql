/*
  Warnings:

  - You are about to alter the column `password` on the `users` table. The data in that column could be lost. The data in that column will be cast from `VarChar(72)` to `VarChar(60)`.

*/
-- AlterTable
ALTER TABLE "users" ALTER COLUMN "password" SET DATA TYPE VARCHAR(60);
