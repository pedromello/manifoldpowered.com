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
   - _Architecture Note:_ Currently, Zod validation is done manually inside handlers (e.g., `gameSchema.safeParse`). In the future, this should be encapsulated under a `filterInput` function that does not exist yet. Until then, handle the Zod parse result and throw a `ValidationError` se falhar.
2. **Output Filtering:**
   - All outputs MUST be correctly filtered before being sent to the client to prevent data leaks.
   - Use `authorization.filterOutput(user, 'action:name', data)` to ensure the payload only contains fields the requester is permitted to see.

### Authorization Pattern (Self vs Others)

When implementing features that distinguish between an owner and an administrator (e.g., `update:user` or `update:game`), follow this pattern in `models/authorization.ts`:

1.  **Define granular features:** e.g., `update:game:self` and `update:game:any`.
2.  **Expose a base feature to controllers:** e.g., `update:game`.
3.  **Implement logic in `can()`:**
    ```typescript
    if (feature === "update:game" && resource) {
      const gameResource = resource as Game;
      if (
        (user.features.includes("update:game:self") &&
          user.id === gameResource.user_id) ||
        user.features.includes("update:game:any")
      ) {
        return true;
      }
    }
    ```
4.  **Enforce in Controller:**
    ```typescript
    const resource = await model.findOne(id);
    if (!authorization.can(req.context.user, "update:game", resource)) {
      throw new ForbiddenError({ ... });
    }
    ```

## 4. User Feature Progression & Tags (CRITICAL)

The application uses a strictly defined progression of features/permissions based on the user's state.

- **AVAILABLE_FEATURES:** ALL actions/features (e.g., `create:game`, `create:wishlist`) MUST be registered in the `AVAILABLE_FEATURES` array inside `models/authorization.ts` FIRST. This is a mandatory requirement for any new functionality on the platform. It cannot be bypassed.

When adding new features, you MUST ensure they are added to the correct state:

1.  **Anonymous User:** Defined in `infra/controller.ts` (`injectAnonymousUser`). Basic public access (e.g., `read:public_game`, `create:session`).
2.  **Unactivated User:** Defined in `models/user.ts` (`injectDefaultFeaturesInObject`). Features available immediately after registration (e.g., `read:activation_token`).
3.  **Activated User:** Defined in `models/activation.ts` (`activateUserByUserId`). Full user features (e.g., `update:user`, `read:session`, `create:wishlist`). **Note:** Activating a user replaces their feature set entirely; it does not append.

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
