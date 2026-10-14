import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fixture, TOKEN, response, invoke, capture } from "./helpers";
import { run } from "../src/index";
import { getProfile, profileState } from "../src/profiles";
import { getExecution } from "../src/journal";
import { State } from "../src/state";
const identity = { id: "user-a", email: "a@example.test", username: "a" };
const context = ["--env", "local", "--account", "a"];
const origin = "http://localhost:3000";
test("injected sessions cannot cross profile boundaries even when account aliases match", async () => {
  const f = await fixture();
  const names = [
    "MANIFOLD_SESSION_TOKEN",
    "MANIFOLD_SESSION_ENV",
    "MANIFOLD_SESSION_ORIGIN",
    "MANIFOLD_SESSION_ACCOUNT",
    "MANIFOLD_SESSION_PROFILE",
  ];
  const previous = Object.fromEntries(
    names.map((name) => [name, process.env[name]]),
  );
  try {
    process.env.MANIFOLD_SESSION_TOKEN = TOKEN;
    process.env.MANIFOLD_SESSION_ENV = "local";
    process.env.MANIFOLD_SESSION_ORIGIN = origin;
    process.env.MANIFOLD_SESSION_ACCOUNT = "a";
    process.env.MANIFOLD_SESSION_PROFILE = "alpha";
    const alpha = new State(f.state.directory, f.credentials, "alpha");
    const beta = new State(f.state.directory, f.credentials, "beta");
    assert.equal(await alpha.token("local", origin, "a"), TOKEN);
    await assert.rejects(beta.token("local", origin, "a"), /não corresponde/);
    await assert.rejects(
      f.state.token("local", origin, "a"),
      /não corresponde/,
    );
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
    await f.cleanup();
  }
});
test("parallel profiles keep accounts, origins and vault entries isolated from global selections", async () => {
  const f = await fixture();
  try {
    const fetcher: typeof fetch = async () => response({});
    const definitions = await Promise.all(
      ["alpha", "beta", "gamma"].map((name) =>
        invoke(
          [
            "profiles",
            "create",
            "--env",
            "local",
            "--account",
            name,
            "--name",
            name,
          ],
          f.state,
          fetcher,
        ),
      ),
    );
    assert.ok(definitions.every((result) => result.exit === 0));
    const profiles = await Promise.all(
      ["alpha", "beta", "gamma"].map((name) => getProfile(f.state, name)),
    );
    const tokenByName = new Map(
      profiles.map((profile, index) => [
        profile.name,
        String(index + 1).repeat(96),
      ]),
    );
    for (const profile of profiles)
      await profileState(f.state, profile).storeToken(
        "local",
        origin,
        profile.account,
        tokenByName.get(profile.name)!,
      );
    await f.state.write("selection-env.json", { env: "prod" });
    await f.state.write("selection-local.json", "unrelated");
    const results = await Promise.all(
      profiles.map((profile) =>
        invoke(
          ["auth", "whoami", "--profile", profile.name],
          f.state,
          async (url, options) => {
            assert.equal(new URL(String(url)).origin, origin);
            assert.equal(
              (options?.headers as Record<string, string>).Cookie,
              `session_id=${tokenByName.get(profile.name)}`,
            );
            return response({ ...identity, username: profile.name });
          },
        ),
      ),
    );
    assert.deepEqual(
      results.map((result) => result.output.account),
      ["alpha", "beta", "gamma"],
    );
    assert.deepEqual(
      results.map((result) => result.output.data.username),
      ["alpha", "beta", "gamma"],
    );
    assert.equal(f.credentials.entries.size, 3);
    let requests = 0;
    const mismatch = await invoke(
      ["auth", "whoami", "--profile", "alpha", "--account", "beta"],
      f.state,
      async () => {
        requests++;
        return response({});
      },
    );
    assert.equal(mismatch.exit, 2);
    assert.equal(requests, 0);
    const repeated = await invoke(
      [
        "profiles",
        "create",
        "--env",
        "local",
        "--account",
        "alpha",
        "--name",
        "alpha",
      ],
      f.state,
      fetcher,
    );
    assert.equal(repeated.exit, 0);
    const changed = await invoke(
      [
        "profiles",
        "create",
        "--env",
        "local",
        "--account",
        "other",
        "--name",
        "alpha",
      ],
      f.state,
      fetcher,
    );
    assert.equal(changed.output.error.code, "PROFILE_EXISTS");
  } finally {
    await f.cleanup();
  }
});
test("execution journals retain resource identifiers but never inputs or session secrets", async () => {
  const f = await fixture();
  try {
    await f.state.storeToken("local", origin, "a", TOKEN);
    const created = await invoke(
      ["outlets", "create", ...context, "--input", "-"],
      f.state,
      async (url) =>
        response(
          new URL(String(url)).pathname === "/api/v1/user"
            ? identity
            : {
                slug: "cozy",
                id: "resource-id",
                description: TOKEN,
                password: "sensitive-response",
              },
        ),
      JSON.stringify({ name: "Cozy" }),
    );
    assert.equal(created.exit, 0);
    const execution = await getExecution(f.state, created.output.execution_id);
    assert.equal(execution.state, "completed");
    assert.ok(
      execution.resources?.some((resource) => resource.slug === "cozy"),
    );
    const raw = await readFile(
      join(f.state.directory, "runs", `${execution.execution_id}.json`),
      "utf8",
    );
    assert.ok(!raw.includes(TOKEN));
    assert.ok(!raw.includes("sensitive-response"));
    assert.ok(!raw.includes("description"));
    const wrong = await invoke(
      [
        "runs",
        "get",
        "--env",
        "local",
        "--account",
        "b",
        "--execution-id",
        execution.execution_id,
      ],
      f.state,
      async () => response({}),
    );
    assert.equal(wrong.output.error.code, "RUN_CONTEXT_MISMATCH");
  } finally {
    await f.cleanup();
  }
});
test("editorial execution records identify outlet and game without retaining the text", async () => {
  const f = await fixture();
  try {
    await f.state.storeToken("local", origin, "a", TOKEN);
    const edited = await invoke(
      ["outlets", "editorial", "set", ...context, "--input", "-"],
      f.state,
      async (url) =>
        response(
          new URL(String(url)).pathname === "/api/v1/user"
            ? identity
            : {
                review: { headline: "Synthetic", body: "Private draft text" },
                draft_revision: 2,
              },
        ),
      JSON.stringify({
        slug: "cozy",
        game_slug: "portal",
        body: "Private draft text",
        expected_draft_revision: 1,
      }),
    );
    assert.equal(edited.exit, 0);
    const saved = await getExecution(f.state, edited.output.execution_id);
    assert.ok(
      saved.resources?.some(
        (resource) =>
          resource.slug === "cozy" && resource.game_slug === "portal",
      ),
    );
    assert.ok(!JSON.stringify(saved).includes("Private draft text"));
  } finally {
    await f.cleanup();
  }
});
test("interrupted imports checkpoint their operation and resume by GET without resubmission", async () => {
  const f = await fixture();
  try {
    await f.state.storeToken("local", origin, "a", TOKEN);
    const operation = "22222222-2222-4222-8222-222222222222";
    let posts = 0;
    const output = capture(JSON.stringify({ reference: "400" }));
    const exit = await run(
      [
        "games",
        "import",
        "steam",
        ...context,
        "--input",
        "-",
        "--wait",
        "--json",
      ],
      output.io,
      {
        state: f.state,
        sleep: async () => {},
        fetch: async (url, options) => {
          if (new URL(String(url)).pathname === "/api/v1/user")
            return response(identity);
          if (options?.method === "POST") {
            posts++;
            return response(
              { refresh: { state: "in_progress", operation_id: operation } },
              202,
            );
          }
          throw new Error("Disconnected after acceptance");
        },
      },
    );
    assert.equal(exit, 1);
    const saved = await getExecution(f.state, output.json.execution_id);
    assert.equal(saved.next_actions?.[0].operation_id, operation);
    const resumed = await invoke(
      ["runs", "resume", ...context, "--execution-id", saved.execution_id],
      f.state,
      async (url, options) => {
        assert.equal(options?.method, "GET");
        assert.equal(
          new URL(String(url)).searchParams.get("operation_id"),
          operation,
        );
        return response({
          slug: "portal",
          refresh: { state: "updated", operation_id: operation },
        });
      },
    );
    assert.equal(resumed.exit, 0);
    assert.equal(posts, 1);
    const completed = await getExecution(f.state, saved.execution_id);
    assert.equal(completed.state, "completed");
    assert.deepEqual(completed.next_actions, []);
    assert.ok(
      completed.resources?.some((resource) => resource.slug === "portal"),
    );
  } finally {
    await f.cleanup();
  }
});
test("indeterminate creation is recorded and never replayed by runs resume", async () => {
  const f = await fixture();
  try {
    await f.state.storeToken("local", origin, "a", TOKEN);
    const created = await invoke(
      ["outlets", "create", ...context, "--name", "Demo"],
      f.state,
      async (url) => {
        if (new URL(String(url)).pathname === "/api/v1/user")
          return response(identity);
        throw new Error("connection lost");
      },
    );
    const saved = await getExecution(f.state, created.output.execution_id);
    assert.equal(saved.error?.mutation_outcome, "unknown");
    let requests = 0;
    const resumed = await invoke(
      ["runs", "resume", ...context, "--execution-id", saved.execution_id],
      f.state,
      async () => {
        requests++;
        return response({});
      },
    );
    assert.equal(resumed.exit, 0);
    assert.equal(requests, 0);
    assert.equal(resumed.output.data.error.mutation_outcome, "unknown");
  } finally {
    await f.cleanup();
  }
});
test("catalog maintenance consumes array APIs, sends the observed revision and preserves conflicts", async () => {
  const f = await fixture();
  try {
    await f.state.storeToken("local", origin, "a", TOKEN);
    let writes = 0;
    const fetcher: typeof fetch = async (url, options) => {
      const path = new URL(String(url)).pathname;
      if (path === "/api/v1/user") return response(identity);
      if (path.endsWith("/game-overrides"))
        return response([{ game_slug: "portal", visibility: "HIDE" }]);
      if (options?.method === "PATCH") {
        writes++;
        assert.deepEqual(JSON.parse(String(options.body)), {
          expected_draft_revision: 4,
          visibility: "SHOW",
        });
        return response({ message: "Changed draft" }, 409);
      }
      throw new Error(`Unexpected route ${path}`);
    };
    const changed = await invoke(
      [
        "outlets",
        "catalog",
        "add",
        ...context,
        "--slug",
        "cozy",
        "--game-slug",
        "portal",
        "--revision",
        "4",
      ],
      f.state,
      fetcher,
    );
    assert.equal(changed.output.error.code, "REVISION_CONFLICT");
    assert.equal(writes, 1);
    const invalid = await invoke(
      [
        "outlets",
        "catalog",
        "add",
        ...context,
        "--slug",
        "cozy",
        "--game-slug",
        "portal",
      ],
      f.state,
      fetcher,
    );
    assert.equal(invalid.exit, 2);
    assert.equal(writes, 1);
  } finally {
    await f.cleanup();
  }
});
test("accepted outlet edits remain completed when the follow-up readiness read fails", async () => {
  const f = await fixture();
  try {
    await f.state.storeToken("local", origin, "a", TOKEN);
    const requests: string[][] = [
      ["outlets", "catalog", "mode", "--catalog-mode", "SELECTED"],
      ["outlets", "catalog", "add", "--game-slug", "portal"],
      ["outlets", "tags", "add", "--tag", "Puzzle", "--mode", "WHITELIST"],
    ];
    for (const args of requests) {
      let writes = 0;
      const edited = await invoke(
        [...args, ...context, "--slug", "cozy", "--revision", "1"],
        f.state,
        async (url, options) => {
          const path = new URL(String(url)).pathname;
          if (path === "/api/v1/user") return response(identity);
          if (path.endsWith("/publication"))
            throw new Error("Lost connection after the accepted write");
          if (options?.method === "GET") return response([]);
          writes++;
          return response({ draft_revision: 2 });
        },
      );
      assert.equal(writes, 1);
      assert.equal(edited.exit, 0);
      assert.equal(edited.output.state, "completed");
      assert.equal(edited.output.error, null);
      assert.equal(edited.output.data.mutation_outcome, "applied");
      assert.equal(edited.output.data.draft_revision, 2);
      assert.equal(edited.output.data.readiness, null);
      assert.deepEqual(edited.output.next_action, {
        command: "outlets readiness",
        slug: "cozy",
      });
      const saved = await getExecution(f.state, edited.output.execution_id);
      assert.equal(saved.state, "completed");
      assert.ok(saved.resources?.some((resource) => resource.slug === "cozy"));
    }
  } finally {
    await f.cleanup();
  }
});

test("reviews stop before writing when the account lacks server eligibility", async () => {
  const f = await fixture();
  try {
    await f.state.storeToken("local", origin, "a", TOKEN);
    let writes = 0;
    const reviewed = await invoke(
      ["reviews", "create", ...context, "--input", "-"],
      f.state,
      async (url, options) => {
        if (options?.method === "POST") writes++;
        return response(
          new URL(String(url)).pathname === "/api/v1/user"
            ? identity
            : { can_review: false },
        );
      },
      JSON.stringify({
        slug: "portal",
        message: "Synthetic review",
        recommended: true,
      }),
    );
    assert.equal(reviewed.output.error.code, "REVIEW_NOT_ALLOWED");
    assert.equal(writes, 0);
  } finally {
    await f.cleanup();
  }
});
test("outlet verification reports unpublished changes, repeated editorials and unavailable images without credentials", async () => {
  const f = await fixture();
  try {
    await f.state.storeToken("local", origin, "a", TOKEN);
    let images = 0;
    const verified = await invoke(
      ["outlets", "verify", ...context, "--slug", "cozy", "--check-images"],
      f.state,
      async (url, options) => {
        const parsed = new URL(String(url));
        if (parsed.hostname === "example.test") {
          images++;
          assert.ok(!(options?.headers as Record<string, string>).Cookie);
          assert.equal(options?.redirect, "manual");
          return new Response("", {
            status: 302,
            headers: { location: "https://other.test/private" },
          });
        }
        if (parsed.pathname.endsWith("/publication"))
          return response({
            status: "PUBLISHED",
            draft_revision: 2,
            published_revision: { revision: 1, source_draft_revision: 1 },
            readiness: { ready: true, blockers: [], catalog_game_count: 2 },
          });
        if (parsed.pathname.endsWith("/curation-catalog"))
          return response({
            games: [{ slug: "portal" }, { slug: "portal-2" }],
            pagination: { pages: 1 },
          });
        if (parsed.pathname.includes("game-editorials"))
          return response({ review: { body: "Same synthetic text" } });
        return response({
          slug: "cozy",
          logo_url: "https://example.test/logo.png",
          cover_url: "https://127.0.0.1/private.png",
        });
      },
    );
    assert.equal(verified.exit, 1);
    assert.equal(images, 1);
    assert.equal(verified.output.data.stats.editorials, 2);
    assert.ok(
      verified.output.data.issues.some(
        (issue: { code: string }) => issue.code === "UNPUBLISHED_DRAFT_CHANGES",
      ),
    );
    assert.ok(
      verified.output.data.issues.some(
        (issue: { code: string }) => issue.code === "DUPLICATE_EDITORIAL_TEXT",
      ),
    );
    assert.ok(!verified.stdout.includes(TOKEN));
  } finally {
    await f.cleanup();
  }
});

test("verification accepts the older preview revision field without exposing unpublished outlets as public", async () => {
  const f = await fixture();
  try {
    await f.state.storeToken("local", origin, "a", TOKEN);
    for (const status of ["PUBLISHED", "DRAFT"]) {
      const verified = await invoke(
        ["outlets", "verify", ...context, "--slug", "cozy"],
        f.state,
        async (url) => {
          const path = new URL(String(url)).pathname;
          if (path.endsWith("/publication"))
            return response({
              status,
              draft_revision: 2,
              last_published_revision: {
                revision: 1,
                source_draft_revision: 1,
              },
              readiness: { ready: true, blockers: [], catalog_game_count: 0 },
            });
          if (path.endsWith("/curation-catalog"))
            return response({ games: [], pagination: { pages: 1 } });
          return response({ slug: "cozy" });
        },
      );
      assert.equal(verified.exit, 0);
      assert.equal(
        verified.output.data.public_url,
        status === "PUBLISHED" ? `${origin}/store/cozy` : null,
      );
      assert.equal(
        verified.output.data.issues.some(
          (issue: { code: string }) =>
            issue.code === "UNPUBLISHED_DRAFT_CHANGES",
        ),
        status === "PUBLISHED",
      );
    }
  } finally {
    await f.cleanup();
  }
});
