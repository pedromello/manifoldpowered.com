-- Money columns move from decimal-as-string (VARCHAR) to native NUMERIC.
--
-- Decimal(19,4) is the standard scale for amounts subject to tax: intermediate
-- calculations (commission splits, tax lines, FX conversion) need more
-- precision than the two decimals a currency displays. Rounding now happens
-- only at the presentation boundary, never in storage.
--
-- Existing values were always written via Number.prototype.toFixed(2), so a
-- plain cast is safe. Nullable columns use NULLIF so an empty string becomes
-- NULL rather than failing the cast; the NOT NULL columns are cast directly,
-- which fails loudly on unexpected data instead of silently writing 0.
--
-- Beyond storage, this fixes two live defects:
--   * ORDER BY price sorted lexicographically ("9.99" after "10.00").
--   * min_price/max_price filtering needed a raw `price::numeric` subquery,
--     now removed from models/game.ts.

ALTER TABLE "games"
  ALTER COLUMN "price" TYPE DECIMAL(19,4) USING "price"::numeric,
  ALTER COLUMN "base_price" TYPE DECIMAL(19,4) USING NULLIF(btrim("base_price"), '')::numeric;

ALTER TABLE "sales"
  ALTER COLUMN "price_at_sale" TYPE DECIMAL(19,4) USING "price_at_sale"::numeric;
