import { test } from "node:test";
import assert from "node:assert/strict";
import { execute } from "../src/engine";
import { fixture, TOKEN, response, invoke } from "./helpers";
import { readVerificationEmail } from "../src/mailcatcher";
const identity = { id: "user-a", email: "a@example.test", username: "a" };
const operationId = "22222222-2222-4222-8222-222222222222";
const context = { env: "local", account: "a" };
test("imports normalize references, respect Retry-After and retain resumable operation IDs", async () => {
  const f = await fixture();
  try {
    await f.state.storeToken("local", "http://localhost:3000", "a", TOKEN);
    let now = 0,
      polls = 0;
    const sleeps: number[] = [];
    const requestFetch: typeof fetch = async (url, options) => {
      const parsed = new URL(String(url));
      if (parsed.pathname === "/api/v1/user") return response(identity);
      if (options?.method === "POST") {
        assert.deepEqual(JSON.parse(String(options.body)), {
          steam_app_id: "400",
        });
        return response(
          { refresh: { state: "in_progress", operation_id: operationId } },
          202,
          { "retry-after": "3" },
        );
      }
      polls++;
      assert.equal(parsed.searchParams.get("operation_id"), operationId);
      assert.equal(parsed.searchParams.get("steam_app_id"), "400");
      return response({
        slug: "portal",
        refresh: { state: "updated", operation_id: operationId },
      });
    };
    const outcome = await execute(
      "games import steam",
      { reference: "https://store.steampowered.com/app/400/Portal/" },
      { ...context, wait: true },
      {
        state: f.state,
        fetch: requestFetch,
        now: () => now,
        sleep: async (milliseconds) => {
          sleeps.push(milliseconds);
          now += milliseconds;
        },
      },
    );
    assert.equal(outcome.state, "completed");
    assert.equal(
      (outcome.data as Record<string, unknown>).original_reference,
      "https://store.steampowered.com/app/400/Portal/",
    );
    assert.deepEqual(sleeps, [3000]);
    assert.equal(polls, 1);
    const pending = await execute(
      "games import steam",
      { reference: "400" },
      { ...context, wait: true, timeout: 1 },
      {
        state: f.state,
        fetch: requestFetch,
        now: () => now,
        sleep: async (milliseconds) => {
          now += milliseconds;
        },
      },
    );
    assert.equal(pending.exitCode, 3);
    assert.equal(pending.state, "pending");
    assert.equal(
      (pending.next_action as Record<string, unknown>).operation_id,
      operationId,
    );
  } finally {
    await f.cleanup();
  }
});
test("batch prevalidates the complete list and reports partial failures", async () => {
  const f = await fixture();
  try {
    await f.state.storeToken("local", "http://localhost:3000", "a", TOKEN);
    let writes = 0;
    const requestFetch: typeof fetch = async (url, options) => {
      if (new URL(String(url)).pathname === "/api/v1/user")
        return response(identity);
      writes++;
      if (JSON.parse(String(options?.body)).steam_app_id === "400")
        return response({ slug: "portal" }, 200);
      return response({ message: "temporarily unavailable" }, 503);
    };
    await assert.rejects(
      execute(
        "games import batch",
        {
          games: [
            { provider: "steam", reference: "400" },
            { provider: "nintendo", reference: "https://example.test/no" },
          ],
        },
        context,
        { state: f.state, fetch: requestFetch },
      ),
    );
    assert.equal(writes, 0);
    const outcome = await execute(
      "games import batch",
      {
        games: [
          { provider: "steam", reference: "400" },
          {
            provider: "steam",
            reference: "https://store.steampowered.com/app/401/Synthetic/",
          },
        ],
      },
      context,
      { state: f.state, fetch: requestFetch },
    );
    assert.equal(outcome.exitCode, 1);
    assert.equal(outcome.state, "partial");
    assert.equal((outcome.data as Record<string, unknown>).failed, 1);
    const failed = (outcome.data as { results: Record<string, unknown>[] })
      .results[1];
    assert.equal(failed.reference, "401");
    assert.equal(
      failed.original_reference,
      "https://store.steampowered.com/app/401/Synthetic/",
    );
  } finally {
    await f.cleanup();
  }
});
test("Nintendo polling preserves the regional product reference", async () => {
  const f = await fixture();
  try {
    await f.state.storeToken("local", "http://localhost:3000", "a", TOKEN);
    const reference =
      "https://www.nintendo.com/pt-br/store/products/test-knight-switch/";
    const requestFetch: typeof fetch = async (url) => {
      const parsed = new URL(String(url));
      assert.equal(parsed.searchParams.get("eshop_url"), reference);
      return response({
        slug: "test-knight",
        refresh: { state: "cached", operation_id: operationId },
      });
    };
    const result = await execute(
      "games import status",
      { provider: "nintendo", reference, operation_id: operationId },
      context,
      { state: f.state, fetch: requestFetch },
    );
    assert.equal(result.state, "completed");
  } finally {
    await f.cleanup();
  }
});
test("publication rejects blockers and stale revisions before sending a mutation", async () => {
  const f = await fixture();
  try {
    await f.state.storeToken("local", "http://localhost:3000", "a", TOKEN);
    let writes = 0;
    const requestFetch: typeof fetch = async (url, options) => {
      if (new URL(String(url)).pathname === "/api/v1/user")
        return response(identity);
      if (options?.method === "POST") writes++;
      return response({
        draft_revision: 4,
        readiness: { ready: false, blockers: [{ code: "CATALOG_TOO_SMALL" }] },
      });
    };
    const blocked = await invoke(
      [
        "outlets",
        "publish",
        "--env",
        "local",
        "--account",
        "a",
        "--slug",
        "cozy",
        "--revision",
        "4",
      ],
      f.state,
      requestFetch,
    );
    assert.equal(blocked.output.error.code, "PUBLICATION_BLOCKED");
    assert.equal(
      blocked.output.error.details.blockers[0].code,
      "CATALOG_TOO_SMALL",
    );
    const stale = await invoke(
      [
        "outlets",
        "publish",
        "--env",
        "local",
        "--account",
        "a",
        "--slug",
        "cozy",
        "--revision",
        "3",
      ],
      f.state,
      requestFetch,
    );
    assert.equal(stale.output.error.code, "REVISION_CONFLICT");
    assert.equal(writes, 0);
  } finally {
    await f.cleanup();
  }
});
test("identity updates use If-Match and publication returns the public revision URL", async () => {
  const f = await fixture();
  try {
    await f.state.storeToken("local", "http://localhost:3000", "a", TOKEN);
    const requestFetch: typeof fetch = async (url, options) => {
      const path = new URL(String(url)).pathname;
      if (path === "/api/v1/user") return response(identity);
      if (options?.method === "PATCH") {
        assert.equal(
          (options.headers as Record<string, string>)["If-Match"],
          '"4"',
        );
        assert.deepEqual(JSON.parse(String(options.body)), {
          description: "New description",
        });
        return response({ draft_revision: 5 });
      }
      if (options?.method === "POST") {
        assert.deepEqual(JSON.parse(String(options.body)), {
          action: "publish",
          expected_draft_revision: 5,
        });
        return response({
          status: "PUBLISHED",
          published_revision: { revision: 2 },
        });
      }
      return response({
        draft_revision: 5,
        readiness: { ready: true, blockers: [] },
      });
    };
    const updated = await execute(
      "outlets update",
      {
        slug: "cozy",
        description: "New description",
        expected_draft_revision: 4,
      },
      context,
      { state: f.state, fetch: requestFetch },
    );
    assert.equal((updated.data as Record<string, unknown>).draft_revision, 5);
    const published = await execute(
      "outlets publish",
      { slug: "cozy", expected_draft_revision: 5 },
      context,
      { state: f.state, fetch: requestFetch },
    );
    assert.equal(
      (published.data as Record<string, unknown>).public_url,
      "http://localhost:3000/store/cozy",
    );
  } finally {
    await f.cleanup();
  }
});
test("Mailcatcher ignores other recipients, old messages and wrong environments", async () => {
  const requestedAt = "2026-10-13T12:00:00Z";
  const id = "11111111-1111-4111-8111-111111111111";
  const fetched: string[] = [];
  const requestFetch: typeof fetch = async (url) => {
    fetched.push(String(url));
    if (String(url).endsWith("/messages"))
      return response([
        {
          id: 1,
          recipients: ["<a@example.test>"],
          subject: "Your Manifold login code",
          created_at: "2026-10-13T11:59:59Z",
        },
        {
          id: 2,
          recipients: ["<other@example.test>"],
          subject: "Your Manifold login code",
          created_at: "2026-10-13T12:00:01Z",
        },
        {
          id: 3,
          recipients: ["<a@example.test>"],
          subject: "Your Manifold login code",
          created_at: "2026-10-13T12:00:02Z",
        },
      ]);
    return new Response("Your code is 123456");
  };
  assert.equal(
    await readVerificationEmail({
      email: "a@example.test",
      requestedAt,
      origin: "http://localhost:3000",
      kind: "otp",
      fetch: requestFetch,
    }),
    "123456",
  );
  assert.deepEqual(fetched, [
    "http://localhost:1080/messages",
    "http://localhost:1080/messages/3.plain",
  ]);
  const activationFetch: typeof fetch = async (url) =>
    String(url).endsWith("/messages")
      ? response([
          {
            id: 4,
            recipients: ["<a@example.test>"],
            subject: "One step away — activate your Manifold account",
            created_at: "2026-10-13T12:00:02Z",
          },
        ])
      : new Response(`https://other.test/signup/activate/${id}`);
  assert.equal(
    await readVerificationEmail({
      email: "a@example.test",
      requestedAt,
      origin: "http://localhost:3000",
      kind: "activation",
      fetch: activationFetch,
    }),
    null,
  );
});
