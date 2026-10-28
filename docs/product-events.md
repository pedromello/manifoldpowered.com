# First-party product events

The Manifold stores product events in its own PostgreSQL database. There is no new external analytics SDK or dashboard. The approved design and independent review are in [product-events-plan.md](product-events-plan.md).

## Data and authority

- `product_events`: append-only observations and confirmed changes, with a bigint cursor, unique occurrence key, version, source, actor/visit, entity references, three timestamps and closed JSON properties.
- `product_event_ingest_buckets`: short-lived, shared ingestion budgets.
- CLIENT events are observations, not proof of a real person, purchase or external wishlist.
- SERVER follow/wishlist events are written in the same transaction as the actual relationship change. Event failure rolls the action back. Duplicate creates/deletes do not manufacture transitions; remove/add is a new cycle.
- Logical domain references preserve history. Account deletion/anonymization and any future retention changes must explicitly include this table; there is no cascade.
- `id` is bigint and must be serialized as a string if exposed by future internal tooling.

| Name v1                             | Producer                        | Meaning                                                                              |
| ----------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------ |
| public_page_viewed                  | Browser on /store               | Rendered catalog. / redirects there and is not counted twice.                        |
| outlet_viewed                       | Browser on public /store/[slug] | Published Outlet rendered visibly.                                                   |
| selection_viewed                    | Browser on public selection     | Published selection and the revision actually observed.                              |
| game_viewed                         | Browser on public /item/[slug]  | Game rendered, with optional validated Outlet context.                               |
| external_store_clicked              | PurchaseCard link               | Click to Steam/Nintendo, without claiming purchase or external wishlist.             |
| outlet_followed / outlet_unfollowed | StoreFollow model               | Actual creation/removal.                                                             |
| game_wishlisted / game_unwishlisted | Wishlist model                  | Actual Manifold wishlist creation/removal, including Steam and Nintendo games.       |
| visit_identity_bound                | Internal login context          | One-time boundary for linking the active anonymous visit; exclude from product KPIs. |

Existing creator-funnel events still use their existing transport. This change does not add identifiers or extra data to that transport.

## Collector and browser lifecycle

POST `/api/v1/events` accepts one of two strict envelopes:

1. `{ "type": "bootstrap" }` returns an opaque generation and protected first-party cookie, without recording a view.
2. `{ "type": "events", "context_generation": "...", "events": [...] }` accepts up to ten observations captured after the generation was recognized.

The public contract is in `contracts/product-events.ts`. The browser cannot submit SERVER/internal names, actor IDs, arbitrary URLs, free text or extra properties. Targets are resolved in up to three set queries, plus a constant identity check for anonymous visits. The collector does not invoke pricing, Steam or imports.

Limits: 16 KiB body, ten events, 1 KiB event properties, 50 pending/in-flight client observations, one request in flight and one retry. Flush after two seconds, full batch, visibility change or page exit. Navigation never waits for analytics. A 409 drops old occurrences, bootstraps a fresh context and permits a new observation of currently visible content; it never relabels the old batch.

Visualizations are observed only after visible hydration. SSR, API GETs, OG, prefetch and private/social previews do not record views. StrictMode is deduplicated per navigation and context. Returning to a visible tab revalidates older context before observing; a new visit gets a new occurrence even on the same page.

## Identity boundary

Cookies are HttpOnly, SameSite=Lax and Secure in production, signed with a dedicated secret. They carry a browser ID (up to 90 days), an active visit (30 minutes idle, maximum 24 hours) and an actor-bound generation. Cookie activity renewal is throttled to one minute. An expired visit may retain the browser ID; logout/account changes rotate identity.

The account always comes from server authentication. Functional actions remain valid without analytics cookies.

On the first login, an active anonymous visit is preserved only if the server wins a unique `identity:visit-bound:<visit_id>` INSERT. Conflict or storage failure gives a fresh visit and does not break login. This internal boundary is required when CLIENT collection is enabled even if the SERVER fact flag is off. An old anonymous cookie restored by an out-of-order response cannot collect into a bound visit: anonymous ingest rejects it and bootstrap replaces it.

Only anonymous observations inserted/received BEFORE that boundary may be correlated with its account. Later anonymous events are not retrospectively assigned. Views with multiple authenticated accounts in one visit are excluded from individual attribution. No whole-browser-history alias is created.

Observations can still be lost through bootstrap, script blocking, network failures, clocks outside the accepted range and browser closure. Counts of accounts, visits and browsers must remain distinct.

## Ordering and funnel

The server preserves `occurred_at` and `received_at`. For observations, `client_occurred_at` is optional and bounded to five minutes behind / thirty seconds ahead. It estimates order for journeys; it is not authoritative. Batching can deliver a view after a later action.

`models/product_event_reports.ts` provides a bounded, internal, read-only example (`selectionProductFunnel`). It requires:

- Same account, with only the limited pre-login visit correlation described above.
- Follow of the Outlet observed.
- Wishlist of a game present in the immutable selection revision observed.
- Actions within seven days of the view; the ordered completion additionally requires follow after wishlist.

It also reports wishlists/follows independently of the strict ordering. This describes association, not causation. The public UI has no analytic query/export endpoint. A future low-code tool should receive a restricted read-only credential and bounded views, never an administrative credential in the browser.

## Configuration and rollout

Production collection is OFF unless explicitly enabled. Local `.env.development` contains disposable fixtures only.

| Variable                                | Purpose                                                                                                            |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| PRODUCT_EVENTS_SERVER_ENABLED=true      | Confirmed follow/wishlist writer.                                                                                  |
| PRODUCT_EVENTS_CLIENT_ENABLED=true      | Public collector and identity context.                                                                             |
| NEXT_PUBLIC_PRODUCT_EVENTS_ENABLED=true | Browser transport, set at build time.                                                                              |
| PRODUCT_EVENTS_SECRET                   | Separate random secret of at least 32 characters; never use the committed local fixture in a deployed environment. |
| PRODUCT_EVENTS_PROXY_MODE=direct        | Local/direct server only; ignores arbitrary forwarding headers.                                                    |
| PRODUCT_EVENTS_IDENTITY_PER_MINUTE      | Default 120 attempted events per account/browser.                                                                  |
| PRODUCT_EVENTS_ADDRESS_PER_MINUTE       | Default 600 attempted events per trusted address.                                                                  |
| PRODUCT_EVENTS_GLOBAL_PER_MINUTE        | Default 2000 attempted events globally.                                                                            |
| PRODUCT_EVENTS_RETENTION_DAYS           | Default 90 days.                                                                                                   |
| CRON_SECRET                             | Separate secret for the protected retention job.                                                                   |

On Vercel (`VERCEL=1`), the collector reads only `x-vercel-forwarded-for`, not an arbitrary browser-supplied forwarding chain. In a direct local server it uses the socket address. Unknown provenance fails closed. See [Vercel's request-header contract](https://vercel.com/docs/headers/request-headers#x-vercel-forwarded-for). A shared proxy can group visitors into one address budget; size quotas accordingly.

After cheap origin/size/envelope checks, quotas are committed in order global → address → identity. Semantic rejection, duplicate or later event-INSERT failure does not refund the reservation. If a later budget denies the request, earlier reservations still commit. Structurally invalid requests rejected before this stage do not write quota rows. The global bucket is a known contention point, not an unlimited-scale claim.

Rollout:

1. Apply the additive migration with collection disabled.
2. Configure separate environment secrets and protected maintenance; verify DB and proxy provenance.
3. Enable SERVER facts and check action latency/errors.
4. Enable CLIENT and rebuild with the public flag; monitor aggregate accepted/duplicate/rejected counts and storage.
5. Keep the flags independent. Disabling a writer creates a known measurement gap.

The API logs only aggregate outcome/status/counts. It deliberately sanitizes unexpected storage errors instead of logging event payloads or credentials.

## Retention and verification

A daily Vercel cron invokes the protected `/api/internal/product-events/prune`. It requires `Authorization: Bearer <CRON_SECRET>`. No unauthenticated read or deletion is available.

Maintenance uses short, bounded deletes with SKIP LOCKED: at most twenty batches of 1000 rows per table per invocation. Aggregate logs and the protected response include counts and `events_capped`/`buckets_capped` warnings. Monitor the cap and invoke additional maintenance or revise scheduling if traffic creates a backlog. Ninety days is the cutoff, not a guarantee that a capped daily job drains arbitrarily high volume. Internal identity boundaries outlive a visit's maximum 24-hour lifetime at the default retention.

Run the normal integration suite, including `tests/integration/api/v1/events/events.test.ts`, plus the client and React lifecycle tests. These cover real HTTP/Postgres, INSERT failure/rollback, concurrent transitions, stale contexts, immutable revision attribution, quotas, cookie preservation, ordering and bounded retention.

For a local-only synthetic benchmark:

```powershell
node --env-file=.env.development --import tsx scripts/benchmark-product-events.ts
```

It inserts 100,000 synthetic observations/facts, executes the funnel query, measures 50 simultaneous batches and inspects the visit index plan. It refuses a remote/production DB and deletes only its own synthetic rows. Do not run it concurrently with integration suites that clear the database. Results depend on the machine, database and development compiler and are not a production latency guarantee.

Local run on 2026-10-19 (Windows, Node 24, Next development server, Docker Postgres 16): 100,000 rows inserted in 128.9 s; 50 simultaneous batches of ten all returned 200; HTTP p50 3336 ms / p95 3577 ms; funnel over 25,000 synthetic selection observations took 9396 ms and returned the expected 1000 accounts/complete journeys. Table plus indexes occupied about 72.3 MB before cleanup. EXPLAIN used `product_events_visit_id_occurred_at_idx` (visit query execution 1.86 ms). This supports choosing the visit index over an additional browser index for this version. The funnel is an internal/reporting query; its measured cost is a reason to keep it off public requests and revisit aggregation/caching when implementing the dashboard.
