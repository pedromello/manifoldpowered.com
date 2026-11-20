CREATE TABLE "appmax_installation_attempts" (
  "external_key_hash" VARCHAR(64) NOT NULL,
  "authorization_token_hash" VARCHAR(64) NOT NULL,
  "external_id" UUID,
  "credential_digest" VARCHAR(64),
  "expires_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "appmax_installation_attempts_pkey" PRIMARY KEY ("external_key_hash")
);

CREATE UNIQUE INDEX "appmax_installation_attempts_authorization_token_hash_key"
  ON "appmax_installation_attempts" ("authorization_token_hash");
CREATE INDEX "appmax_installation_attempts_expires_at_idx"
  ON "appmax_installation_attempts" ("expires_at");
