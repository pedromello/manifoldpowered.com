# Outlet presentation lifecycle bridge runbook

This runbook covers three explicitly tested rollout states:

1. a fresh pre-lifecycle database;
2. homolog, where the superseded presentation migration
   (`20260901120000_add_store_presentation`) is recorded as applied and the
   canonical lifecycle migration (`20260901090000_add_store_lifecycle`) is
   recorded as failed; and
3. a database where the original lifecycle migration and Sprint 2 are already
   recorded as applied.

The corrected lifecycle migration is the bridge for the first two states. A
separate forward migration after
`20260901130000_add_store_presentation_draft` normalizes immutable presentation
payloads in every state. Do not use either migration as a generic repair
procedure for a schema that does not match one of the approved fixtures.

## Safety boundary

- Do not reset, drop, truncate, or manually recreate Store revisions.
- Do not overwrite a non-null `sales.store_revision_id`.
- Preserve every StoreRevision id and `created_at` value byte-for-byte. The
  fresh fixture is the only state allowed to create `legacy-<store-id>`
  compatibility revisions.
- Preserve a published Store's current pointer byte-for-byte. For an old-S3
  Store that was unpublished, moving the retained old current pointer and time
  to `last_published_revision_id`/`last_published_at` and clearing the current
  pair is the one intentional pointer transformation.
- Do not run `migrate resolve` until the dual-state lifecycle SQL has passed
  fresh, legacy-S3, and canonical fixtures.
- Capture a restorable database snapshot and the preflight result set before
  changing the migration ledger.
- Run the bridge in an explicit transaction while application writers are
  quiesced. The migration must lock the lifecycle, revision, Sale, and feature
  rows before computing snapshots or attribution.
- The old presentation migration directory is intentionally absent from the
  final artifact. Its applied ledger row is retained; the new presentation-only
  migration is `20260901130000_add_store_presentation_draft`.
- Treat legacy columns and enums left behind in homolog as controlled drift.
  Do not let a later generated migration remove them without a separate data
  retention review.

## Preflight

Record these results with the deployment ticket. Run the relation/column
inventory first; execute a query that names a legacy or canonical column only
when that inventory proves the object exists:

```sql
SELECT migration_name, checksum, started_at, finished_at, rolled_back_at,
       applied_steps_count, logs
FROM "_prisma_migrations"
WHERE migration_name IN (
  '20260901090000_add_store_lifecycle',
  '20260901120000_add_store_presentation'
)
ORDER BY migration_name;

SELECT count(*) AS stores FROM stores;
SELECT to_regclass('public.store_revisions') AS store_revisions_table;
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = current_schema()
  AND table_name IN ('stores', 'store_revisions', 'sales')
ORDER BY table_name, ordinal_position;

SELECT id, store_id, created_at
FROM sales WHERE store_id IS NOT NULL ORDER BY id;

SELECT n.nspname AS schema_name, t.typname AS enum_name, e.enumlabel,
       e.enumsortorder
FROM pg_type AS t
JOIN pg_namespace AS n ON n.oid = t.typnamespace
JOIN pg_enum AS e ON e.enumtypid = t.oid
WHERE n.nspname = 'public'
  AND t.typname IN (
    'StoreStatus',
    'StoreLifecycleAction',
    'StoreCatalogMode',
    'StoreRevisionCatalogMode',
    'StorePublicationStatus',
    'StoreCurationStrategy'
  )
ORDER BY t.typname, e.enumsortorder;

SELECT c.conrelid::regclass AS table_name, c.conname,
       pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint AS c
WHERE c.conrelid IN (
  to_regclass('public.stores'),
  to_regclass('public.store_revisions')
)
ORDER BY c.conrelid::regclass::text, c.conname;
```

Only when `store_revisions_table` above is non-null, record its count:

```sql
SELECT count(*) AS revisions FROM store_revisions;
```

After the column inventory confirms the old-S3 names exist, run the legacy
detail queries. Do not run this block on a fresh or already canonical schema:

```sql
SELECT id, publication_status, published_revision_id, published_at,
       draft_revision
FROM stores ORDER BY id;

SELECT id, store_id, revision_number, source_draft_revision, created_by,
       created_at
FROM store_revisions ORDER BY store_id, revision_number, id;
```

The failed S0 statement may have rolled back all columns in its multi-column
`ALTER TABLE`. Query canonical `status`, last-publication, or Sale revision
columns only when the schema inventory confirms they exist; if present, add
their values to the captured snapshot.

For homolog, the expected ledger is exactly one applied old-S3 row and one
failed S0 row. Compare both checksums with the hashes attached to the deployment
ticket; a matching name alone is insufficient. Stop if the ledger differs, if
an existing enum has unexpected labels, if an object name resolves to the wrong
table or definition, if a current or last Store pointer does not resolve to a
revision for the same Store, or if a non-null Sale pointer is already orphaned
or belongs to another Store.

Also snapshot, in stable id order:

- every StoreRevision id, Store id, revision number, actor, payload, and
  `created_at`;
- both current and last Store publication pairs;
- every non-null Sale revision pointer; and
- feature arrays for existing Outlet owners.

Payload normalization intentionally changes only `store_revisions.presentation`.
All other snapshot fields must compare byte-for-byte after deployment.

## Fixture gates

Before homolog, execute the complete migration chain against:

1. A fresh baseline database with pre-lifecycle Stores and Sales.
2. A legacy fixture produced by the original S3 migration plus a deliberately
   failed/partial S0 attempt.
3. A canonical fixture where the original S0 and Sprint 2 migrations are
   already applied. The corrected S0 migration is not rerun in this fixture;
   only pending forward migrations execute.

For the legacy fixture, snapshot StoreRevision IDs and all non-null Sale
revision pointers before the bridge. They must be byte-for-byte identical
afterward. A current Store pointer must also remain identical when the old Store
is published. For an old Store that was unpublished, prove instead that its
retained old current pair moved unchanged to `last_*` and that the canonical
current pair is null. Never create a compatibility revision in the legacy or
canonical fixtures; a published Store without a valid revision is corruption,
not a reason to invent history.

The fixture must also prove that:

- an old-S3 draft that was never published keeps `catalog_mode = UNDECIDED`
  and a null last-publication pair;
- an old-S3 draft that was unpublished has a null current pair and preserves
  its former current revision/time as the last-publication pair;
- a published legacy Store receives an inferred catalog choice and a valid
  current/last pointer pair;
- when both old and canonical revision column names exist, a new canonical
  revision can be inserted without supplying `revision_number`, `created_by`,
  or the old presentation/curation columns;
- an already canonical database changes no Store, catalog, Sale, grant,
  revision id, or pointer when the forward normalization runs; and
- running the presentation normalizer twice produces the same JSONB values and
  zero updates on the second pass.

The Sale fixture must include a Store published more than once and Sales before
the initial migration snapshot, between revisions, and after the latest
revision. A null pointer is filled from the latest same-Store revision at or
before the Sale time, falling back to the earliest same-Store revision only for
Sales that predate the first snapshot. A non-null pointer is never rewritten.
An orphan or cross-Store pointer must abort the bridge before any mutation.

Finally, load every normalized presentation through the production
`storePresentationSchema`. This parser gate, rather than a SQL URL regex alone,
is authoritative for the strict JSON contract.

## Presentation normalization contract

The forward migration may update only `store_revisions.presentation`. It
rebuilds the object from allow-listed values, so unknown keys cannot leak into
public projection:

- `version` is `1`;
- `layout_preset` is `channel`, `editorial`, `community`, or null;
- the synthetic uppercase `EDITORIAL` value from the original S0 migration is
  normalized to null, the durable classic layout;
- `tagline` is a trimmed string of at most 160 characters or null;
- `cover_image_url` is a conservative HTTPS URL of at most 2048 characters or
  null;
- `social_links` retains only HTTPS values for `website`, `youtube`, `twitch`,
  `instagram`, `tiktok`, `x`, `discord`, and `bluesky`;
- `brand_tokens` uses the current palette, typography, and shape allow-lists,
  with `manifold`/`modern`/`soft` fallbacks; and
- `theme_key` is `neon-alley`, `strategos-void`, or null.

Legacy `palette_id`, `typography_id`, and `shape_id` values are mapped only as
fallbacks when a valid current `brand_tokens` member is absent. Rebuilding the
object intentionally removes those superseded keys. The migration uses
`IS DISTINCT FROM` so a strict payload is not rewritten and a second execution
does no work.

## Deployment

### Homolog: failed lifecycle attempt

After snapshot and fixture approval, mark only the failed lifecycle attempt as
rolled back, then deploy the pending chain:

```powershell
npm exec prisma migrate resolve -- --rolled-back 20260901090000_add_store_lifecycle
npm exec prisma migrate deploy
```

Do not resolve the old presentation migration and do not mark S0 as applied by
hand. The bridge itself must execute and its postcondition block must pass.

After deploy, the ledger must contain the original failed S0 row with
`rolled_back_at` populated and a separate successful S0 application whose
checksum matches the corrected repository SQL.

### Already canonical S0 + Sprint 2

Do not resolve or rerun S0. Prisma 7.7 warns when the repository copy of an
applied migration has a different checksum and continues applying pending
migrations; record that warning as a controlled exception. The forward
`20260901140000_normalize_store_revision_presentation` migration is what makes
old canonical snapshots compatible with the current strict presentation
contract. Confirm that no second S0 application is added to the ledger.

### Fresh database

Run `prisma migrate deploy` normally. The corrected S0 bridge creates the
initial lifecycle snapshots, and the forward presentation migration must be an
idempotent no-op over those already strict payloads.

## Post-deploy invariants

Every query must return zero rows:

```sql
SELECT id FROM store_revisions
WHERE revision <= 0 OR source_draft_revision <= 0
   OR actor_user_id IS NULL OR catalog_mode IS NULL
   OR name IS NULL OR tag_filters IS NULL OR game_overrides IS NULL
   OR featured_games IS NULL OR presentation IS NULL;

SELECT store_id, revision, count(*)
FROM store_revisions
GROUP BY store_id, revision
HAVING count(*) > 1;

SELECT store.id
FROM stores AS store
LEFT JOIN store_revisions AS revision
  ON revision.id = store.published_revision_id
 AND revision.store_id = store.id
WHERE store.status = 'PUBLISHED'
  AND (store.published_at IS NULL OR revision.id IS NULL);

SELECT id FROM stores
WHERE status = 'DRAFT'
  AND (published_revision_id IS NOT NULL OR published_at IS NOT NULL);

SELECT store.id
FROM stores AS store
LEFT JOIN store_revisions AS revision
  ON revision.id = store.last_published_revision_id
 AND revision.store_id = store.id
WHERE store.last_published_revision_id IS NOT NULL
  AND (store.last_published_at IS NULL OR revision.id IS NULL);

SELECT revision.id
FROM store_revisions AS revision
LEFT JOIN stores AS store ON store.id = revision.store_id
WHERE store.id IS NULL;

SELECT sale.id
FROM sales AS sale
LEFT JOIN store_revisions AS revision
  ON revision.id = sale.store_revision_id
 AND revision.store_id = sale.store_id
WHERE sale.store_revision_id IS NOT NULL AND revision.id IS NULL;

SELECT id FROM sales
WHERE store_id IS NULL AND store_revision_id IS NOT NULL;

SELECT id FROM sales
WHERE store_id IS NOT NULL AND store_revision_id IS NULL;
```

The SQL checks are necessary but not sufficient for presentation JSON. Parse
every revision through the production `storePresentationSchema`; no row may
fail, and every payload must contain exactly the versioned allow-listed keys.

Finally compare the preflight snapshots, verify the forward migration changed
only `store_revisions.presentation`, run the lifecycle and purchase attribution
integration suites, run the feature reconciliation audit for existing
collaborators, and smoke-test one classic, one preset, and one bespoke Outlet
in public and preview modes. Retain the preflight results, checksums, migration
logs, and postcondition output with the deployment ticket.
