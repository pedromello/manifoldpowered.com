# Manifold - AI Developer Guidelines

Welcome to the Manifold project! This file provides essential context, setup instructions, and architectural rules that any AI agent or developer must strictly follow when working on this codebase.

## 1. Tech Stack & Project Overview
Manifold is a game storefront and catalog application. It is crucial to understand the tools and routing paradigm used:
- **Framework:** Next.js using the **Pages Router** (`pages/api/...`), NOT the App Router.
- **Language:** Strictly **TypeScript**. The use of `any` is expressly forbidden. Always define proper interfaces and types.
- **Database:** PostgreSQL.
- **Styling:** Tailwind CSS.

### Directory Structure
- `pages/api/` -> Controllers / API Route Handlers.
- `models/` -> Core business logic, database queries, and Zod schemas.
- `infra/` -> Core infrastructure configurations (webserver, database connections) and custom error classes.
- `tests/` -> Automated tests. The test orchestrator (`orchestrator.js`) is located at the root of this folder.

## 2. How to Run Locally

1. **Prerequisites:** 
   - Ensure your Node.js version matches the one in `.nvmrc` (`v24.13.1`).
   - Docker **must** be installed and running on your system.
2. **Install dependencies:**
   ```bash
   npm i
   ```
3. **Start the development server:**
   ```bash
   npm run dev
   ```
   > **Note:** `npm run dev` automatically handles all necessary environment setups and calls, so you don't need to manually configure `.env` variables or start external services before running it.

## 3. Architecture & Development Guidelines

### Test-Driven Development (TDD)
- **MANDATORY:** You must ALWAYS use TDD practices when creating new API features. Write tests first, ensure they fail, and then implement the endpoint logic to make them pass.

### Running Tests
- **From scratch:** `npm run test`
- **Watch mode:** To test continuously, you must run `npm run dev` in one terminal, and then run `npm run test:watch` in parallel in another terminal.

### Integration Tests
Focus on writing robust **integration tests**. Use `tests/integration/api/v1/users/post.test.ts` as the primary reference example.
- Group tests by user states (e.g., `describe("Anonymous user")`, `describe("Authenticated user")`).
- Validate exact response codes (`201`, `400`, `403`) and precise JSON payloads.

### The Test Orchestrator
The `tests/orchestrator.js` file is the core utility for test environment setup.
- **Purpose:** It manages database states, service readiness, and mock data generation. 
- **Usage:** Always use it in `beforeAll` to `waitForAllServices()` and `clearDatabaseRows()`. Use its helper methods (`createUser`, `createSession`, etc.) to securely set up test states without needing to make HTTP calls to your own API.

### Database Constraints (CRITICAL)
- **No Foreign Keys:** The database architecture strictly forbids the use of Foreign Keys. Do not create FK constraints in migrations or schemas to ensure maximum horizontal scalability.

### MVC Architecture
The system uses a Model-View-Controller architecture built on Next.js API routes, leveraging `next-connect`.
- **Controllers / API Handlers:** Found in `pages/api/...`. They handle routing, inject user contexts (`controller.injectAnonymousOrUser`), enforce permissions (`controller.canRequest`), and process requests/responses.
- **Models:** Found in `models/`. They encapsulate database queries, business logic, schemas, and structural integrity.

### Error Handling Protocol
- Do not return generic error responses like `res.status(400).json({ error: '...' })`.
- **Always** `throw` custom error classes from `infra/errors` (e.g., `throw new ValidationError(...)`, `ForbiddenError`, `NotFoundError`).
- These thrown errors are automatically caught and formatted by the `controller.errorHandlers` middleware.

### API Endpoint Security Rules (CRITICAL)
When building or modifying endpoints (reference `pages/api/v1/items/games/index.ts` and `pages/api/v1/users/index.ts`), two security measures are absolute requirements:

1. **Input Protection (Zod):**
   - All inputs must be strictly validated using Zod.
   - *Architecture Note:* Currently, Zod validation is done manually inside handlers (e.g., `gameSchema.safeParse`). In the future, this should be encapsulated under a `filterInput` function that does not exist yet. Until then, handle the Zod parse result and throw a `ValidationError` se falhar.
   
2. **Output Filtering:**
   - All outputs MUST be correctly filtered before being sent to the client to prevent data leaks.
   - Use `authorization.filterOutput(user, 'action:name', data)` to ensure the payload only contains fields the requester is permitted to see.
