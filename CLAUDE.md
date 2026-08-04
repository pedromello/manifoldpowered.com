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

### Dependency Management

- **Use Exact Versions:** When installing new packages, always use the `-E` (or `--save-exact`) flag to ensure exact versions are pinned in `package.json` (e.g., `npm install -E <package>`). This prevents unexpected breaking changes from minor/patch updates.

### Test-Driven Development (TDD)

### Final Verification

- **MANDATORY:** Before considering a task finished, you must run ALL tests (not just the ones related to your change) to ensure no regressions were introduced. A task is only complete when the entire suite passes.

### Running Tests

- **From scratch:** `npm run test`
- **Watch mode:** To test continuously, you must run `npm run dev` in one terminal, and then run `npm run test:watch` in parallel in another terminal.

### Integration Tests

Focus on writing robust **integration tests**. Use `tests/integration/api/v1/users/post.test.ts` as the primary reference example.

- **One file per method:** Each HTTP method must have its own dedicated test file (e.g., `get.test.ts`, `post.test.ts`, `delete.test.ts`, `patch.test.ts`). Do not group multiple methods into a single `index.test.ts` file.
- Group tests by user states (e.g., `describe("Anonymous user")`, `describe("Authenticated user")`).
- Validate exact response codes (`201`, `400`, `403`) and precise JSON payloads. When testing errors, follow this exact assertion pattern:

  ```typescript
  expect(response.status).toBe(401);

  const responseBody = await response.json();
  expect(responseBody).toEqual({
    message: "Invalid credentials",
    name: "UnauthorizedError",
    action: "Check your credentials",
    status_code: 401,
  });
  ```

- **The error body is not always 4 keys.** `ValidationError` and `ServiceError` also serialise a `context` field (see `infra/errors.ts`), and every Zod `safeParse` failure passes `context: result.error.issues` — so the most common validation path returns **five** keys, not four. Asserting the 4-key shape there fails. When `context` is a large Zod dump, assert field by field instead:

  ```typescript
  expect(responseBody.name).toBe("ValidationError");
  expect(responseBody.message).toBe("One or more fields are invalid");
  expect(responseBody.action).toBe("Check the fields and try again");
  expect(responseBody.status_code).toBe(400);
  ```

### Other Test Locations

`tests/integration/api/` is the main surface, but two other directories exist and are the right home for some tests:

- `tests/integration/models/` — model-level integration tests that need a database but no HTTP call (see `audit_log.test.ts`).
- `tests/unit/` — pure functions with no I/O (see `unit/models/authorization.test.ts`).
- `tests/integration/_use-cases/` — multi-endpoint flows (see `purchase-and-download-flow.test.ts`).

**There is no frontend test setup.** No testing-library, no component tests. Pages and components under `pages/` and `components/` are verified by hand or by driving a browser, not by the suite. Do not assume a component test can be written without introducing the whole stack first.

### Linting

Run the npm scripts, not a scoped `prettier`/`eslint` invocation:

```bash
npm run lint:prettier:check   # prettier --check .  — the WHOLE repo, markdown included
npm run lint:eslint:check
```

`lint:prettier:check` covers every file in the repository. Formatting only the directories you touched will pass locally and fail in CI, most often on Markdown in `docs/`.

### The Test Orchestrator

The `tests/orchestrator.js` file is the core utility for test environment setup.

- **Purpose:** It manages database states, service readiness, and mock data generation.
- **Usage:** Always use it in `beforeAll` to `waitForAllServices()` and `clearDatabaseRows()`. Use its helper methods (`createUser`, `createSession`, etc.) to securely set up test states without needing to make HTTP calls to your own API.

### Database Constraints (CRITICAL)

- **No Foreign Keys:** The database architecture strictly forbids the use of Foreign Keys. Do not create FK constraints in migrations or schemas to ensure maximum horizontal scalability.
- **Referential integrity is the model layer's job.** With no FKs, a bad id or currency code becomes a row that silently never matches anything. Validate references in the model before writing (see `exchange_rate.validateCurrenciesAreRegistered`).
- **Append-only tables omit `updated_at`**, with a comment explaining why (see `Sale`, `AdminActionLog`, `ExchangeRate`). Correcting an append-only row means writing a new one, never an `UPDATE`.

### Money (CRITICAL)

- **All money is `Decimal @db.Decimal(19, 4)`.** Four decimal places is the standard scale for amounts subject to tax, where intermediate calculations need more precision than the two decimals a currency displays. Exchange rates use `Decimal(19, 8)`.
- **Prisma returns `Decimal` objects, not numbers or strings.** They must be serialised explicitly at the `filterOutput` boundary, the same way `GameFile.size_bytes` (a `BigInt`) already is.
- **Use `.toFixed(n)`, not `.toString()`.** `Decimal.toString()` normalises trailing zeros, so a stored `199.9000` becomes `"199.9"` rather than `"199.90"`. This does not fail the typecheck and only surfaces at runtime.
- Comparing two `Decimal` instances needs `.equals()`. `toBe` compares references and always fails.
- Never do money arithmetic in JavaScript numbers. Use the `Decimal` methods (`.mul()`, `.toDecimalPlaces()`).

For how prices are resolved per currency, see [`docs/payments-architecture.md`](./docs/payments-architecture.md). For how money movements are recorded — the zero-sum rule, the sign convention, and why ledger rows are never updated — see [`docs/ledger-architecture.md`](./docs/ledger-architecture.md).

### MVC Architecture

The system uses a Model-View-Controller architecture built on Next.js API routes, leveraging `next-connect`.

- **Controllers / API Handlers:** Found in `pages/api/...`.
- **Router Pattern:** Always use named handler functions and pass `controller.canRequest` as a middleware directly in the method call. Avoid anonymous arrow functions in the router chain.

  ```typescript
  export default createRouter<NextApiRequest, NextApiResponse>()
    .use(controller.injectAnonymousOrUser)
    .get(getHandler)
    .post(controller.canRequest("feature:name"), postHandler)
    .handler(controller.errorHandlers);

  async function getHandler(req, res) { ... }
  async function postHandler(req, res) { ... }
  ```

- **Models:** Found in `models/`. They encapsulate database queries, business logic, schemas, and structural integrity.

### Error Handling Protocol

- Do not return generic error responses like `res.status(400).json({ error: '...' })`.
- **Always** `throw` custom error classes from `infra/errors` (e.g., `throw new ValidationError(...)`, `ForbiddenError`, `NotFoundError`).
- These thrown errors are automatically caught and formatted by the `controller.errorHandlers` middleware.

### API Endpoint Security Rules (CRITICAL)

When building or modifying endpoints (reference `pages/api/v1/items/games/index.ts` and `pages/api/v1/users/index.ts`), two security measures are absolute requirements:

1. **Input Protection (Zod):**
   - All inputs must be strictly validated using Zod.
   - _Architecture Note:_ Currently, Zod validation is done manually inside handlers (e.g., `gameSchema.safeParse`). In the future, this should be encapsulated under a `filterInput` function that does not exist yet. Until then, handle the Zod parse result and throw a `ValidationError` when it fails.
2. **Output Filtering:**
   - All outputs MUST be correctly filtered before being sent to the client to prevent data leaks.
   - Use `authorization.filterOutput(user, 'action:name', data)` to ensure the payload only contains fields the requester is permitted to see.
   - **`filterOutput` returns `{}` for any feature it has no branch for.** It does not throw. A new feature without its own branch produces an empty response body, silently, and the symptom shows up far from the cause. Every feature you register needs a matching branch.

### Authorization Pattern (Self vs Others)

When implementing features that distinguish between an owner and an administrator (e.g., `update:user` or `update:game`), follow this pattern in `models/authorization.ts`:

1.  **Expose a base feature to controllers:** e.g., `update:game`. This is the string `controller.canRequest()` takes.
2.  **Add an escape hatch for staff:** e.g., `update:game:any`.
3.  **Derive ownership from the resource, not from a `:self` feature.** There is no `update:game:self` — the base feature is granted to owners and members, and `can()` decides by comparing the resource against the user:

    ```typescript
    if (feature === "update:game" && resource) {
      authorized = false;
      const gameResource = resource as GameWithStudio;
      const studioResource = gameResource.studio;

      const isOwner = user.id === studioResource.owner_id;
      const isPermittedMember = studioResource.members?.some(
        (member) =>
          member.user_id === user.id && member.permissions.includes(feature),
      );

      if (isOwner || isPermittedMember || can(user, "update:game:any")) {
        authorized = true;
      }
    }
    ```

    Note the `authorized = false` reset: passing a resource is strictly narrowing, so a resource-scoped check can only ever revoke access the plain feature list already implied.

4.  **Enforce in the controller — both steps.** `controller.canRequest()` calls `can()` **without** a resource, so it is only a coarse "does this user hold the feature at all" gate. The resource check must be repeated inside the handler, or a user who holds the feature can act on someone else's resource:

    ```typescript
    const resource = await model.findOneWithOwner(id);
    if (!authorization.can(req.context.user, "update:game", resource)) {
      throw new ForbiddenError({ message: "...", action: "..." });
    }
    ```

    Related features can share one `can()` branch when they resolve ownership identically — `update:game`, `create:game_file`, `delete:game_file` and the `*:game_price` pair all do.

## 4. User Feature Progression & Tags (CRITICAL)

The application uses a strictly defined progression of features/permissions based on the user's state.

- **AVAILABLE_FEATURES:** ALL actions/features (e.g., `create:game`, `create:wishlist`) MUST be registered in the `AVAILABLE_FEATURES` array inside `models/authorization.ts` FIRST. This is a mandatory requirement for any new functionality on the platform. It cannot be bypassed.

When adding new features, you MUST ensure they are added to the correct state:

1.  **Anonymous User:** `authorization.ANONYMOUS_USER_FEATURES`, applied by `infra/controller.ts` (`injectAnonymousUser`). Basic public access (e.g., `read:public_game`, `create:session`).
2.  **Unactivated User:** Defined in `models/user.ts` (`injectDefaultFeaturesInObject`). Features available immediately after registration (e.g., `read:activation_token`).
3.  **Activated User:** `authorization.ACTIVATED_USER_FEATURES`, applied by `models/activation.ts` (`activateUserByUserId`). Full user features (e.g., `update:user`, `read:session`, `create:wishlist`). **Note:** Activating a user replaces their feature set entirely; it does not append.
4.  **Admin:** `authorization.ADMIN_ONLY_FEATURES`, layered on top of the activated set. Granted by `scripts/create-admin.ts` (`npm run admin:grant`).

**Every list above lives in `models/authorization.ts`.** The files that _apply_ them only import — edit the arrays in `authorization.ts`, not at the call sites.

### Checklist for adding a feature

Registering the string is the first step, not the only one. Each tier has a different consequence:

| You added it to             | Also required                                                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `AVAILABLE_FEATURES`        | Always. `can()` and `filterOutput` throw `InternalServerError` for unregistered features.                               |
| `filterOutput`              | Always. A missing branch returns `{}` silently.                                                                         |
| `ACTIVATED_USER_FEATURES`   | Update the test fixtures that assert the whole array — currently four files, including `api/v1/user/get.test.ts`.       |
| `ADMIN_ONLY_FEATURES`       | Existing admins need `npm run features:backfill` (the admin pass tops up anyone already holding an admin-only feature). |
| `studio`/`store` member set | Existing owners and members need `npm run features:backfill`.                                                           |

Run `npm run features:backfill` after any change to these lists. It is idempotent, reconciles every tier, and cannot promote a non-admin.

## 5. Error Handling (CRITICAL)

When throwing errors from `infra/errors`, you MUST always pass an object as the first argument to the constructor. Additionally, you MUST provide meaningful `message` and `action` values **strictly in English** to help the API client understand what went wrong and how to fix it:

```typescript
// Correct
throw new NotFoundError({
  message: "The requested game was not found.",
  action: "Check the slug and try again.",
});

// If you need to wrap an error, use 'cause' to preserve the original error for server-side debugging
try {
  // ...
} catch (error) {
  throw new ServiceError({
    message: "Could not connect to the external service.",
    action: "Please try again later.",
    cause: error,
  });
}

// Incorrect
throw new NotFoundError({});
```

These objects ensure the error handlers can correctly format the public JSON response.
