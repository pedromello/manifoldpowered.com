# Manifold Desktop — Backend and API Implementation Plan

## Purpose

Prepare the existing Manifold platform to support a secure, resilient desktop
client. This plan belongs to the `manifoldpowered.com` repository and covers
only backend, API, storage, publication, and operational work.

The desktop client itself is intentionally out of scope. Its implementation is
defined in `docs/manifold-desktop-app-plan.md`.

## Current baseline

The repository already provides several primitives needed by the desktop app:

- A public, paginated game catalog at `GET /api/v1/games`.
- Cookie-based password and OTP sessions.
- A centralized, authenticated library at `GET /api/v1/library`.
- Per-platform game-file records containing a version and size.
- Entitlement checks and short-lived signed download URLs.
- Object storage backed by S3-compatible infrastructure.
- Stores, studios, curation, sales, ledger entries, statements, and payout
  account records.

These are web-oriented primitives rather than a desktop distribution contract.
In particular, the current model does not identify an immutable release, CPU
architecture, archive format, entrypoint, or content hash. Downloads are not
yet designed for URL refresh and resume, and authentication depends on a
browser cookie.

## Guiding decisions

1. The website and desktop application share the backend, entitlements, and
   catalog but remain separate client projects.
2. Existing web endpoints should be reused where their contracts are suitable.
   Desktop-specific orchestration endpoints should live under
   `/api/v1/desktop`.
3. Published releases and artifacts are immutable. A correction creates a new
   release.
4. Full artifact downloads are the required fallback for every update path.
5. Delta patching is an optimization and must not precede a reliable full
   download and update flow.
6. Payment-provider and payout completion remains a parallel project. It does
   not block downloading games already present in a user's library.
7. The repository's existing security, authorization, output-filtering, money,
   migration, and test conventions continue to apply.

## Phase 1 — Specify the desktop API contract

### Work

- Define versioned schemas for authentication, catalog, library, compatible
  releases, manifests, download authorization, and patches.
- Standardize platform values (`WINDOWS`, `MAC`, `LINUX`) and introduce CPU
  architecture values such as `X86_64`, `AARCH64`, and any explicitly supported
  32-bit targets.
- Define the API error envelope, retryable error codes, pagination, timestamps,
  and size representations.
- Establish a compatibility policy between desktop app versions, API versions,
  and manifest schema versions.
- Publish an OpenAPI document or equivalent machine-readable schema from which
  the desktop repository can generate or validate types.
- Create stable staging fixtures, including one test game for every supported
  platform and architecture.

### Acceptance criteria

- The complete login-to-download sequence is expressible using documented
  request and response schemas.
- Desktop types can be produced without importing application-internal model
  types.
- Unknown manifest and API versions fail explicitly rather than being silently
  accepted.

## Phase 2 — Add desktop-compatible authentication

### Work

- Extend authentication middleware to accept
  `Authorization: Bearer <session-token>` while preserving cookie sessions for
  the website.
- Reuse the existing password and OTP authentication flows.
- Define logout, token expiration, revocation, and disabled-user behavior.
- Add rate limiting and abuse controls to password and OTP endpoints.
- Prevent session tokens, OTPs, signed URLs, and authorization headers from
  appearing in logs.
- Decide whether desktop network calls use native HTTP exclusively. If WebView
  requests remain possible, define a narrow origin/CORS policy rather than a
  wildcard policy.
- Add integration tests for valid, missing, expired, revoked, and malformed
  bearer tokens.

### Acceptance criteria

- A command-line client can authenticate, call `GET /api/v1/library`, and obtain
  download authorization without browser cookie handling.
- Existing website login and session tests continue to pass unchanged.
- Logging out invalidates the token server-side.

## Phase 3 — Model immutable releases, artifacts, and manifests

### Proposed concepts

`GameRelease`:

- `id`
- `game_id`
- Human-readable `version`
- Monotonic `release_number`
- `status` (`DRAFT`, `PROCESSING`, `PUBLISHED`, `FAILED`, `RETIRED`)
- Release notes
- Published and created timestamps

`GameArtifact`:

- `id`
- `release_id`
- Platform and architecture
- Archive format
- Storage object key
- Compressed and installed sizes
- SHA-256
- Upload/verification status
- Created timestamp

`InstallManifest`:

- Manifest schema version
- Artifact or release ID
- Relative entrypoint
- Optional launch arguments
- Optional working directory
- Executable file declarations or permissions
- Optional environment configuration restricted by an allowlist

### Work

- Add the new schema through migrations without foreign keys, following the
  repository's existing referential-integrity policy.
- Define model-layer validation for all logical references.
- Use an immutable release ID and monotonic release number for ordering; do not
  infer ordering from arbitrary version strings.
- Define uniqueness so that a published release has at most one active artifact
  for each supported platform/architecture combination.
- Preserve current `GameFile` behavior during migration, then migrate or retire
  it only after the new read path is live.
- Add authorization features and `filterOutput` branches in the same changes
  that expose each endpoint.

### Acceptance criteria

- The backend can answer which exact artifact is compatible with a specified
  platform and architecture.
- Published release metadata cannot be edited in place.
- All new API outputs are explicitly filtered.

## Phase 4 — Implement a transactional publication workflow

### Workflow

1. Create a draft release.
2. Create a pending artifact.
3. Issue a signed upload URL.
4. Confirm that the upload completed.
5. Validate object existence and size.
6. Calculate or validate SHA-256.
7. Validate the install manifest and entrypoint.
8. Mark the artifact ready.
9. Publish the release only when all required artifacts are ready.

### Work

- Make publication idempotent and safe to retry.
- Prevent pending, failed, or incomplete artifacts from appearing in player
  endpoints.
- Add cleanup for abandoned uploads and unreferenced objects.
- Prevent deletion of artifacts required by a published release or patch.
- Audit release creation, publication, retirement, and destructive
  administrative actions.
- Add model and endpoint integration tests for every publication transition.

### Acceptance criteria

- An incomplete or corrupted upload cannot be published.
- Repeating a confirmation or publication request does not create duplicates.
- A published artifact's storage object and hash remain stable.

## Phase 5 — Expose desktop orchestration endpoints

### Recommended surface

- `GET /api/v1/desktop/config`
- `POST /api/v1/desktop/sessions`
- `DELETE /api/v1/desktop/sessions/current`
- `GET /api/v1/desktop/catalog`
- `GET /api/v1/desktop/library`
- `GET /api/v1/desktop/games/:slug/releases/latest?platform=&arch=`
- `GET /api/v1/desktop/releases/:release_id/manifest`
- `POST /api/v1/desktop/artifacts/:artifact_id/download`

The desktop library response should include a latest-compatible-release
summary so the client does not make one release request for every library item.

### Work

- Reuse catalog, pricing, entitlement, and authorization models rather than
  duplicating their rules in desktop controllers.
- Return only published artifacts compatible with the requested target.
- Ensure download authorization checks entitlement immediately before signing.
- Include stable IDs, hashes, sizes, and manifest versions in responses.
- Add end-to-end API tests for login → library → release → manifest → signed
  artifact URL.

### Acceptance criteria

- The entire first-run desktop flow can be completed using the desktop API.
- An unentitled user cannot list private artifact data or obtain a signed URL.
- A client receives a clear `NO_COMPATIBLE_RELEASE` result when appropriate.

## Phase 6 — Support resilient and resumable downloads

### Work

- Verify HTTP Range and stable ETag behavior in development and production
  object storage.
- Return artifact metadata with each signed URL: artifact ID, total size,
  SHA-256, ETag where reliable, and URL expiry.
- Allow an entitled client to refresh an expired signed URL for the same
  immutable artifact.
- Define behavior when an artifact is retired while a download is in progress.
- Distinguish retryable failures from terminal authorization, compatibility, and
  integrity failures.
- Record download authorization and completion metrics without persisting
  signed URLs.

### Acceptance criteria

- A large download can continue after its first signed URL expires.
- A resumed Range request returns bytes from the same immutable artifact.
- Metrics expose authorization failures and transferred bytes without leaking
  secrets.

## Phase 7 — Complete integrity and security hardening

### Work

- Require SHA-256 for every published full artifact.
- Version manifests and reject unknown versions.
- Restrict supported archive formats.
- Validate that manifest paths are relative, normalized, and confined to the
  installation root.
- Restrict launch arguments and environment configuration to documented safe
  representations.
- Optionally sign manifests independently so the client can verify provenance
  after download.
- Create fixtures for path traversal, absolute paths, malicious symlinks,
  missing entrypoints, duplicate files, oversized expansions, and hash
  mismatches.

### Acceptance criteria

- Malicious manifests and archives are rejected before publication.
- The client has authoritative hashes and metadata for complete verification.
- The backend test suite covers both valid and hostile distribution fixtures.

## Backend MVP checkpoint

Phases 1–7 form the backend MVP. At this checkpoint, the supported flow is:

```text
Authenticate → list library → resolve compatible release → obtain manifest
→ authorize resumable full download → verify artifact
```

The first desktop MVP should be validated against this checkpoint before delta
patching begins.

## Phase 8 — Generate and serve delta patches

### Proposed `ReleasePatch`

- Source and target release IDs
- Platform and architecture
- Patch algorithm and format version
- Storage object key
- Patch size and SHA-256
- Expected final installation hash
- Generation/verification status
- Created and published timestamps

### Work

- Generate patches asynchronously after the target full artifact is published.
- Initially support only the immediately previous compatible release to the
  latest release.
- Make patch generation idempotent.
- Apply every generated patch in an isolated verification job and publish it
  only when it reproduces the target installation hash.
- Offer a patch only when it is materially smaller than the full artifact.
- Add an update-resolution endpoint or extend the release endpoint to return
  either the best patch or the full artifact fallback.
- Preserve source artifacts for as long as published patches depend on them.

### Acceptance criteria

- A verified patch reproduces exactly the published target installation.
- Missing, failed, inefficient, or incompatible patches resolve to a full
  artifact without blocking the update.
- Metrics report full size, patch size, and bytes saved.

## Phase 9 — Production operations

### Work

- Track publication failures, download authorization failures, integrity
  failures, patch success rates, and byte savings.
- Establish artifact and patch retention rules.
- Provide administrative release retirement and rollback procedures.
- Add staging smoke tests for every supported platform/architecture target.
- Add compatibility tests against the machine-readable desktop contract.
- Define incident procedures for a compromised signing key, corrupted artifact,
  broken release, or leaked session token.

### Acceptance criteria

- Operators can identify and retire a bad release without deleting historical
  records.
- A known-good full artifact remains available when patch delivery is disabled.
- API compatibility failures are detected before production deployment.

## Recommended delivery sequence

Each numbered item should be a small, independently testable delivery slice:

1. Contract and target vocabulary.
2. Bearer-token authentication.
3. Release/artifact schema and models.
4. Publication state machine.
5. Compatible-release and manifest reads.
6. Refreshable download authorization.
7. End-to-end full-download API test.
8. Integrity and hostile-fixture hardening.
9. Patch schema and asynchronous generation.
10. Patch resolution and metrics.

Every backend slice must pass the full repository test and lint suite before it
is considered complete.
