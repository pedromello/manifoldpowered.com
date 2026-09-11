-- Nintendo pre-release listings can omit their release date. Do not invent one.
ALTER TABLE "games" ALTER COLUMN "launch_date" DROP NOT NULL;
