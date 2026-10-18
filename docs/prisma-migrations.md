# Prisma migration connections

Prisma CLI commands use `prisma.config.ts`. They need a direct connection because migration advisory locks belong to a PostgreSQL session. Sending these commands through a transaction pool can leave a lock on an idle pool backend and block later deployments with `P1002`.

For Neon hosts matching its `ep-…-pooler.…neon.tech` format, the Prisma configuration removes only the `-pooler` endpoint suffix, targeting the same compute directly. An optional `POSTGRES_MIGRATION_HOST` takes precedence for explicit deployment configuration. Other hosts and local development are preserved.

The application's `infra/database.ts` continues to use `POSTGRES_HOST`; request traffic retains its existing pool. No database schema or migration files change.

An already retained advisory lock needs separate operational diagnosis. Verify its owner, session state and open transaction before considering a targeted connection termination. Do not disable advisory locking or terminate unrelated application sessions to make a deployment pass.

References: [Neon migration setup](https://neon.com/docs/guides/prisma-migrations), [Prisma advisory locking](https://www.prisma.io/docs/orm/migrations/applying-a-migration#advisory-locking).
