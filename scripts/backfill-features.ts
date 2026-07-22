// Idempotent, self-updating reconciliation: grants every activated user any
// feature they're missing from the *current* authorization.ACTIVATED_USER_FEATURES,
// and every studio/store owner or member any permission they're missing from
// the current studio/store MEMBER_PERMISSIONS (or their own membership row's
// permissions). Safe to re-run any time — a no-op wherever nothing is
// missing. Re-run this after adding a new baseline or studio/store-scoped
// feature so already-activated users aren't left behind.
//
// Usage: npm run features:backfill

import featureBackfill from "models/feature_backfill";

async function main() {
  const report = await featureBackfill.reconcileAll();
  console.log("Feature backfill complete.");
  console.log(JSON.stringify(report, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Feature backfill failed:", error);
    process.exit(1);
  });
