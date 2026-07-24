# Contributing to Manifold

First off — thank you for considering a contribution. Manifold is pre-release, so the foundations are still being laid and your input has outsized impact. This guide gets you from clone to merged pull request.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Ways to Contribute](#ways-to-contribute)
- [Local Setup](#local-setup)
- [Development Workflow](#development-workflow)
- [Commit Convention](#commit-convention)
- [Testing](#testing)
- [Architecture Rules](#architecture-rules)
- [Opening a Pull Request](#opening-a-pull-request)

## Code of Conduct

Be respectful, assume good faith, and keep discussions constructive. Harassment or discrimination of any kind is not welcome. If you experience or witness unacceptable behavior, please open an issue or contact the maintainer.

## Ways to Contribute

- 🐛 **Report bugs** — open an [issue](https://github.com/pedromello/manifoldpowered.com/issues) with steps to reproduce.
- 💡 **Suggest features or ideas** — start a [discussion](https://github.com/pedromello/manifoldpowered.com/discussions).
- 🧑‍💻 **Write code** — pick up a [good first issue](https://github.com/pedromello/manifoldpowered.com/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) or a `help wanted` issue.
- 📖 **Improve docs** — READMEs, comments, and this guide all count.

## Local Setup

**Prerequisites:**

- **Node.js `v24.13.1`** (pinned in [`.nvmrc`](./.nvmrc) — run `nvm use` if you use nvm).
- **Docker**, installed and running. Verify with `docker ps` before you start.

```bash
git clone https://github.com/pedromello/manifoldpowered.com.git
cd manifoldpowered.com
npm i
npm run dev
```

`npm run dev` handles everything — no manual `.env` needed. It spins up Postgres, MinIO, and Mailcatcher via `infra/compose.yaml`, waits for the database, runs `prisma generate` and migrations, then starts Next.js at [http://localhost:3000](http://localhost:3000).

> Installing a new dependency? Pin the exact version with `npm install -E <package>`.

## Development Workflow

1. Fork the repo and create a branch off `main`.
2. Make your change, following the [architecture rules](#architecture-rules).
3. Add or update integration tests.
4. Run the checks locally (lint, format, tests).
5. Commit using [Conventional Commits](#commit-convention).
6. Open a pull request.

## Commit Convention

Commits **must** follow [Conventional Commits](https://www.conventionalcommits.org) — this is enforced by commitlint in CI.

```
feat: add cross-Outlet download resolver
fix: prevent duplicate members in store listing
docs: rewrite the README getting-started section
```

Common types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`. Running `npm run commit` walks you through a compliant message interactively.

## Testing

Manifold favors **integration tests** that hit real API routes against real services.

```bash
npm run test        # full suite from scratch (spins services up and down)
```

For a tight feedback loop, run the dev server and the watcher in parallel:

```bash
npm run dev         # terminal 1
npm run test:watch  # terminal 2
```

Conventions:

- Tests live in `tests/integration/`, **one file per HTTP method** (`get.test.ts`, `post.test.ts`, …). Don't group methods in an `index.test.ts`.
- Group tests by user state — e.g. `describe("Anonymous user")`, `describe("Authenticated user")`.
- Assert exact status codes and precise JSON payloads.
- Use `tests/orchestrator.js` helpers (`createUser`, `createSession`, `createStore`, …) in `beforeAll` to set up state — don't call your own API to build fixtures.

**Before considering a task done, run the entire suite** to ensure no regressions.

## Architecture Rules

Manifold uses an MVC architecture on top of Next.js API routes (Pages Router) with `next-connect`.

- **Controllers** live in `pages/api/…`; **models** (business logic, queries, Zod schemas) live in `models/`.
- **Validate all input with Zod** and throw a `ValidationError` on failure.
- **Filter all output** with `authorization.filterOutput(user, "action:name", data)` before responding.
- **Never** return raw error responses (`res.status(400).json(...)`). Always `throw` a custom error from `infra/errors` (`ValidationError`, `NotFoundError`, `ForbiddenError`, …) with meaningful `message` and `action` fields, in English.
- **No foreign keys.** The database forbids FK constraints for horizontal scalability — resolve relationships in application code, not via DB relations.
- **No `any`.** TypeScript is strict; define proper interfaces and types.

## Opening a Pull Request

Before you push, make sure:

- ✅ `npm run lint:eslint:check` is clean
- ✅ `npm run lint:prettier:check` is clean (use `npm run lint:prettier:fix` to auto-format)
- ✅ `npm run test` passes
- ✅ Commits follow Conventional Commits

CI runs ESLint, Prettier, Commitlint, and Jest on every pull request — green checks are required to merge. Fill out the pull request template, link any related issue, and describe what changed and why.

Thanks again for helping build open infrastructure for game distribution. 🎮
