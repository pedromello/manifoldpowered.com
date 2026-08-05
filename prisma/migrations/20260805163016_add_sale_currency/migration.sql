-- Sales gain the currency the buyer was charged in, plus the rate that produced
-- the amount when it came from a conversion.
--
-- Hand-written rather than left as Prisma generated it: the generated version
-- adds a NOT NULL column with no default and fails on any existing row. Every
-- sale recorded before this migration stored Game.price, which is the USD base
-- price by definition, so backfilling USD states a fact rather than guessing.
-- The default is dropped immediately afterwards, so future writes have to say
-- which currency they mean instead of silently inheriting one.

-- AlterTable
ALTER TABLE "sales" ADD COLUMN "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
ADD COLUMN "exchange_rate" DECIMAL(19,8);

ALTER TABLE "sales" ALTER COLUMN "currency" DROP DEFAULT;
