-- Preserve legacy accounts/challenges without inferring address ownership.
ALTER TABLE "users"
  ADD COLUMN "verified_email" VARCHAR(234),
  ADD COLUMN "email_verified_at" TIMESTAMP(3),
  ADD COLUMN "email_version" INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT "users_email_version_nonnegative" CHECK ("email_version" >= 0),
  ADD CONSTRAINT "users_email_identity_proof_valid" CHECK (
    ("verified_email" IS NULL AND "email_verified_at" IS NULL)
    OR ("verified_email" IS NOT NULL AND "email_verified_at" IS NOT NULL
      AND "verified_email" = lower(btrim("email")))
  );

ALTER TABLE "user_activation_tokens"
  ADD COLUMN "recipient_email" VARCHAR(234),
  ADD COLUMN "email_version" INTEGER,
  ADD CONSTRAINT "activation_email_binding_valid" CHECK (
    ("recipient_email" IS NULL AND "email_version" IS NULL)
    OR ("recipient_email" IS NOT NULL AND "email_version" IS NOT NULL
      AND "email_version" >= 0
      AND "recipient_email" = lower(btrim("recipient_email")))
  );

ALTER TABLE "user_otps"
  ADD COLUMN "recipient_email" VARCHAR(234),
  ADD COLUMN "email_version" INTEGER,
  ADD CONSTRAINT "otp_email_binding_valid" CHECK (
    ("recipient_email" IS NULL AND "email_version" IS NULL)
    OR ("recipient_email" IS NOT NULL AND "email_version" IS NOT NULL
      AND "email_version" >= 0
      AND "recipient_email" = lower(btrim("recipient_email")))
  );
