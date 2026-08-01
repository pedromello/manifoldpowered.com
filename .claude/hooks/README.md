# Session start hook

`session-start.sh` runs at the start of every Claude Code **web** session and
provisions everything `npm run test` needs. It exits immediately on a local
machine (`CLAUDE_CODE_REMOTE` is unset), where the normal Docker path works.

## Why it exists

The repo's normal setup is `docker compose -f infra/compose.yaml up -d`, which
brings up Postgres, MailCatcher and MinIO.

**In Claude Code on the web the Docker daemon runs but image pulls are blocked
by the egress policy.** `docker compose up` fails with a 403 from Docker Hub's
blob CDN, so `npm run test` aborts before a single test runs and the suite
looks unrunnable.

Without this hook, every session rediscovers that from scratch — and the most
likely conclusion is "tests can't run here", which is wrong.

## What it substitutes

| Container            | Substitute                         | Port(s)    |
| -------------------- | ---------------------------------- | ---------- |
| `postgres:16-alpine` | native PostgreSQL 16 binaries      | 6432       |
| `sj26/mailcatcher`   | the `mailcatcher` Ruby gem         | 1025, 1080 |
| `minio/minio`        | `moto[server]` (S3-compatible)     | 9000       |

Same protocols on the same ports, so no application code or test knows the
difference. Credentials and ports come from `.env.development`, which is
committed.

Each substitute is load-bearing:

- **MailCatcher** — `orchestrator.waitForAllServices()` blocks on its HTTP API,
  so *every* suite hangs without it. Note the orchestrator speaks MailCatcher's
  API (`/messages`, `/messages/:id.plain`), not MailHog's.
- **S3** — the game-file suites fail in `beforeAll` on `clearStorage()` without
  an endpoint on 9000. `moto` covers presigned upload and download URLs.

## Running the suite

Use `npm run test:no-docker`. It is `npm run test` minus the `docker compose`
step, which would fail here and abort everything.

```bash
npm run test:no-docker
```

## Known non-failures

Two suites fail in this environment for reasons unrelated to any change:

- `api/v1/status/get.test.ts` asserts the database version is `"16.0"`, the
  version of the pinned container image. The native package reports its own
  patch version.
- `api/v1/items/games/steam-import/post.test.ts` needs the public Steam API,
  which is unreachable through the egress proxy, so the endpoint correctly
  returns 503.

Both pass in CI. Treat any *other* failure as real.

## Maintenance

The hook is idempotent — every step is skipped when already satisfied, so it is
safe to re-run by hand:

```bash
CLAUDE_CODE_REMOTE=true CLAUDE_PROJECT_DIR="$PWD" ./.claude/hooks/session-start.sh
```

It prefers Docker whenever Docker works, so it needs no change if the egress
policy is relaxed later.
