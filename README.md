<img src="./public/images/brand/manifold-logo.png" alt="Manifold" height="80">

# Manifold

> **Spin up your own Steam.** Manifold is the open infrastructure layer for game distribution — a shared backend that lets anyone launch their own fully interoperable game store.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#-contributing)
[![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-yellow.svg)](https://www.conventionalcommits.org)
[![Next.js](https://img.shields.io/badge/Next.js-black?logo=next.js&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org)

🌍 **Language:** English | [Português (Brasil)](./README.pt-BR.md)

> [!WARNING]
> **Project status: pre-release.** Manifold is in active development. This repository presents the vision and technical direction; no production-ready product is available yet. This is the perfect moment to shape it — **[new contributors start here](#-contributing)**.

Just like **Valve** created **Steam**, Manifold lets anyone create their own version of Steam — called an **Outlet** — while staying fully interoperable with every other Outlet in the network. A player can buy a game on one Outlet and download it on another, without losing progress, ownership, or access.

---

## 📖 Table of Contents

- [What is Manifold?](#-what-is-manifold)
- [What is an Outlet?](#-what-is-an-outlet)
- [How Manifold Works](#-how-manifold-works)
- [Key Features](#-key-features)
- [Getting Started](#-getting-started)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Testing](#-testing)
- [Contributing](#-contributing)
- [Philosophy](#-philosophy)
- [License](#-license)

---

## 🌐 What is Manifold?

Manifold lets creators, studios, communities, and companies build their own game distribution platforms on a single shared system. Every store built on Manifold is called an **Outlet**.

Outlets are:

- **Independent** — their own branding, community, and curation
- **Shared** — powered by the same backend, catalog, and player library
- **Interoperable** — a purchase on one Outlet works on all of them

---

## 🔌 What is an Outlet?

In engineering, a **manifold** distributes a single flow into multiple **outlets**. Manifold does the same for games:

- **Manifold** is the distributor (the shared infrastructure)
- **Outlets** are the distribution points (the individual stores)

Each Outlet is a full-featured game store with custom branding and its own curated catalog — but purchases, downloads, and save data are shared across the entire network. Buy once, play anywhere.

---

## 🎮 How Manifold Works

Manifold connects those who **create**, those who **sell**, and those who **play**.

<img width="1080" height="810" alt="Manifold - Diagram" src="https://github.com/user-attachments/assets/91c30ea2-eeed-4d52-a130-97f7fb809ae4" />

**For Creators & Communities — a storefront of your own.** A _Cozy Games_ streamer can open an Outlet that sells only farming sims, puzzles, and relaxing narratives — no horror, no violence. You monetize your influence by curating what your audience would buy anyway, while Manifold handles the technical infrastructure.

**For Developers — one upload, hundreds of storefronts.** Upload your game **once** to the Manifold catalog. Once approved, any Outlet in the network can add it to their store. Your game reaches highly engaged, niche audiences with no extra distribution work.

**For Players — one library for everything.** Bought a farming sim from a cozy-games streamer and a shooter from your e-sports clan's Outlet? Both land in the same **centralized library**. One login, all your games and saves, in one place.

---

## 🎯 Key Features

- 🛒 **Buy once, access everywhere** — games bought on one Outlet work on all of them
- 🔄 **Cross-Outlet downloads** — download from any Outlet in the network
- 💾 **Shared progress and saves** — player state syncs across every Outlet
- 🧩 **Single integration for developers** — integrate once, reach every Outlet
- 🏗️ **Modular, scalable architecture** — built to support countless Outlets from one core

---

## 🚀 Getting Started

Get a full local environment running in two commands.

### Prerequisites

- **Node.js `v24.13.1`** — the version pinned in [`.nvmrc`](./.nvmrc). If you use [nvm](https://github.com/nvm-sh/nvm), just run `nvm use`.
- **Docker** — must be **installed and running**. This is the #1 setup gotcha: if the Docker daemon isn't up, setup will hang. Verify with `docker ps` first.

### Run it

```bash
npm i        # install dependencies
npm run dev  # start everything
```

That's it. **No manual `.env` setup needed** — `npm run dev` handles the entire environment for you. Under the hood it:

1. Spins up Postgres, MinIO (S3), and Mailcatcher via `infra/compose.yaml`
2. Waits for Postgres to be ready
3. Runs `prisma generate` and applies migrations (`migrate dev`)
4. Starts the Next.js dev server

When it's ready, open **[http://localhost:3000](http://localhost:3000)**.

---

## 🛠️ Tech Stack

| Layer        | Technology                                                                   |
| ------------ | ---------------------------------------------------------------------------- |
| Framework    | [Next.js](https://nextjs.org) (Pages Router)                                 |
| Language     | [TypeScript](https://www.typescriptlang.org) (strict, no `any`)              |
| Database     | [PostgreSQL](https://www.postgresql.org) via [Prisma](https://www.prisma.io) |
| API          | [next-connect](https://github.com/hoangvvo/next-connect) (MVC-style routes)  |
| Styling      | [Tailwind CSS](https://tailwindcss.com)                                      |
| Object store | S3-compatible (MinIO locally)                                                |
| Deployment   | [Vercel](https://vercel.com)                                                 |

---

## 📁 Project Structure

```
manifoldpowered.com/
├── pages/api/     # Controllers — API route handlers
├── models/        # Business logic, database queries, and Zod schemas
├── infra/         # Webserver, database connections, and custom error classes
├── components/    # React UI components
├── lib/           # Shared utilities
├── prisma/        # Database schema and migrations
├── scripts/       # Operational scripts (admin grants, feature backfills)
└── tests/         # Integration tests and the test orchestrator
```

Deeper architectural conventions (MVC patterns, error handling, authorization, and the no-foreign-keys rule) are documented in [`CONTRIBUTING.md`](./CONTRIBUTING.md).

---

## 🧪 Testing

Manifold favors robust **integration tests** that exercise real API routes against real services.

```bash
npm run test        # run the full suite from scratch (spins up services)
```

For continuous testing while developing, run the dev server in one terminal and the watcher in another:

```bash
npm run dev         # terminal 1
npm run test:watch  # terminal 2
```

Integration tests live in `tests/integration/`, with **one file per HTTP method** (`get.test.ts`, `post.test.ts`, …). The `tests/orchestrator.js` helper manages database state and test fixtures. See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for testing conventions.

---

## 🤝 Contributing

**Contributions are welcome and genuinely wanted.** Manifold is pre-release, which means the foundations are still being laid — your input has outsized impact right now.

If you've ever shipped on a platform that changed the rules on you, this is the alternative you'd want to exist. Come help build it.

### New here?

👉 Start with a **[good first issue](https://github.com/pedromello/manifoldpowered.com/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)**.

### Quick contribution loop

```bash
git clone https://github.com/pedromello/manifoldpowered.com.git
cd manifoldpowered.com
npm i
npm run dev          # verify it runs
npm run test         # verify the suite is green
```

Before opening a pull request, please make sure:

- ✅ Commits follow [**Conventional Commits**](https://www.conventionalcommits.org) — enforced by commitlint (`npm run commit` helps).
- ✅ Linting is clean — `npm run lint:eslint:check` and `npm run lint:prettier:check`.
- ✅ Tests pass — `npm run test`.

CI runs ESLint, Prettier, Commitlint, and Jest on every pull request. The full contributor guide — branch naming, architecture rules, and PR expectations — lives in **[`CONTRIBUTING.md`](./CONTRIBUTING.md)**.

Have a question or an idea? Open an [issue](https://github.com/pedromello/manifoldpowered.com/issues) or start a [discussion](https://github.com/pedromello/manifoldpowered.com/discussions).

---

## 🧠 Philosophy

Nearly every part of game development has been democratized. Engines are open or widely accessible. Art, design, and audio tools are powerful and often free. Knowledge is everywhere.

**What remains centralized is distribution** — still proprietary, still controlled by a handful of platforms. Developers are free to create, but not free to distribute.

Manifold exists to turn distribution into infrastructure: shared, interoperable, and accessible — not the exclusive property of a single platform.

---

## 🌍 Domain

This project lives at **[manifoldpowered.com](https://manifoldpowered.com)**.

---

## 📄 License

Released under the [MIT License](./LICENSE).
