-- CreateIndex
CREATE INDEX "users_features_idx" ON "users" USING GIN ("features");
