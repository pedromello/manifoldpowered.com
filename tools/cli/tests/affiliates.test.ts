import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture, invoke, response, TOKEN } from "./helpers";
import { getExecution } from "../src/journal";
import { getProfile, profileState } from "../src/profiles";

const context = ["--env", "local", "--account", "curator"];
const origin = "http://localhost:3000";
const identity = {
  id: "curator-id",
  username: "curator",
  email: "curator@example.test",
};
const id = "2e989738-6f24-4aa7-a16b-4ee3e8661bd6";
const link = {
  kind: "storefront",
  merchant: "amazon",
  platform: null,
  media_type: null,
  country: "BR",
  game_slug: null,
  url: "https://www.amazon.com.br/?tag=synthetic-20",
  label: "Synthetic public label",
};
const stored = { ...link, id, game_id: null };
const change = { slug: "cozy", expected_draft_revision: 7, link };

test("affiliate schemas discover the shared nested input and explicit write context without HTTP", async () => {
  const f = await fixture();
  try {
    for (const command of ["list", "public", "add", "update", "remove"]) {
      const result = await invoke(
        ["schema", "outlets", "affiliates", command],
        f.state,
        async () => {
          throw new Error("No HTTP");
        },
      );
      assert.equal(result.exit, 0);
      assert.equal(
        result.output.data.requires_explicit_context,
        ["add", "update", "remove"].includes(command),
      );
      assert.equal(result.output.data.authenticated, command !== "public");
      if (command === "update")
        assert.ok(
          result.output.data.input.properties.link.required.includes("id"),
        );
      if (command === "add")
        assert.match(JSON.stringify(result.output.data.input), /merchant/);
    }
  } finally {
    await f.cleanup();
  }
});

test("draft reads authenticate while public general and game reads never send session cookies", async () => {
  const f = await fixture();
  try {
    await f.state.storeToken("local", origin, "curator", TOKEN);
    let requests = 0;
    const fetcher: typeof fetch = async (url, options) => {
      const target = new URL(String(url));
      assert.equal(target.pathname, "/api/v1/stores/cozy/affiliate-links");
      const draft = target.searchParams.get("draft") === "1";
      assert.equal(
        (options?.headers as Record<string, string>).Cookie,
        draft ? `session_id=${TOKEN}` : undefined,
      );
      requests++;
      return response(
        draft
          ? { links: [stored], draft_revision: 7 }
          : { links: [stored], published_revision_id: "revision-1" },
      );
    };
    const draft = await invoke(
      ["outlets", "affiliates", "list", ...context, "--slug", "cozy"],
      f.state,
      fetcher,
    );
    assert.equal(draft.exit, 0);
    assert.equal(draft.output.data.draft_revision, 7);
    for (const args of [[], ["--game-slug", "signal-garden"]]) {
      const result = await invoke(
        [
          "outlets",
          "affiliates",
          "public",
          ...context,
          "--slug",
          "cozy",
          ...args,
        ],
        f.state,
        async (url, options) => {
          const target = new URL(String(url));
          assert.equal(target.searchParams.has("preview"), false);
          assert.equal(target.searchParams.has("draft"), false);
          assert.equal(
            target.searchParams.get("game_slug"),
            args.length ? "signal-garden" : null,
          );
          return fetcher(url, options);
        },
      );
      assert.equal(result.exit, 0);
    }
    assert.equal(requests, 3);
  } finally {
    await f.cleanup();
  }
});

test("affiliate CRUD preserves IDs, revision receipts, parameters and safe journal resource identifiers", async () => {
  const f = await fixture();
  try {
    await f.state.storeToken("local", origin, "curator", TOKEN);
    const writes: Array<{ method: string; body: Record<string, unknown> }> = [];
    const fetcher: typeof fetch = async (url, options) => {
      const target = new URL(String(url));
      assert.equal(target.origin, origin);
      assert.equal(
        (options?.headers as Record<string, string>).Cookie,
        `session_id=${TOKEN}`,
      );
      if (target.pathname === "/api/v1/user") return response(identity);
      assert.equal(target.pathname, "/api/v1/stores/cozy/affiliate-links");
      if (options?.method === "GET")
        return response({ links: [stored], draft_revision: 8 });
      writes.push({
        method: String(options?.method),
        body: JSON.parse(String(options?.body)),
      });
      return response(
        { draft_revision: 8 },
        options?.method === "POST" ? 201 : 200,
      );
    };
    const added = await invoke(
      ["outlets", "affiliates", "add", ...context, "--input", "-"],
      f.state,
      fetcher,
      JSON.stringify(change),
    );
    assert.equal(added.exit, 0, added.stdout);
    assert.equal(added.output.data.affiliate_link_id, id);
    assert.equal(added.output.data.draft_revision, 8);
    assert.equal(added.output.data.resource_status, "draft");
    assert.equal(added.output.data.mutation_outcome, "applied");
    assert.deepEqual(writes[0], {
      method: "POST",
      body: { expected_draft_revision: 7, link },
    });
    const updated = await invoke(
      [
        "outlets",
        "affiliates",
        "update",
        ...context,
        "--slug",
        "cozy",
        "--revision",
        "7",
        "--link",
        JSON.stringify({ ...link, id }),
      ],
      f.state,
      fetcher,
    );
    assert.equal(updated.exit, 0, updated.stdout);
    assert.equal((writes[1].body.link as { id: string }).id, id);
    assert.equal(writes[1].method, "PATCH");
    assert.equal(updated.output.data.affiliate_link_id, id);
    const removed = await invoke(
      [
        "outlets",
        "affiliates",
        "remove",
        ...context,
        "--slug",
        "cozy",
        "--id",
        id,
        "--revision",
        "7",
      ],
      f.state,
      fetcher,
    );
    assert.equal(removed.exit, 0);
    assert.deepEqual(writes[2], {
      method: "DELETE",
      body: { expected_draft_revision: 7, id },
    });
    assert.equal(removed.output.data.resource_status, "removed_from_draft");
    const journal = await getExecution(f.state, added.output.execution_id);
    assert.ok(
      journal.resources?.some(
        (resource) =>
          resource.affiliate_link_id === id && resource.draft_revision === 8,
      ),
    );
    assert.doesNotMatch(
      JSON.stringify(journal),
      /synthetic-20|Synthetic public label|session_id|url/,
    );
    assert.doesNotMatch(
      added.stdout + updated.stdout + removed.stdout,
      new RegExp(TOKEN),
    );
  } finally {
    await f.cleanup();
  }
});

test("missing revisions, malformed destinations, add IDs and updates without IDs fail before HTTP", async () => {
  const f = await fixture();
  try {
    const failures = [
      ["add", { slug: "cozy", link }],
      ["add", { ...change, link: { ...link, id } }],
      ["update", change],
      [
        "add",
        {
          ...change,
          link: {
            ...link,
            url: "https://amazon.com.br.example.test/?tag=synthetic",
          },
        },
      ],
    ] as const;
    for (const [command, input] of failures) {
      const result = await invoke(
        ["outlets", "affiliates", command, ...context, "--input", "-"],
        f.state,
        async () => {
          throw new Error("No HTTP expected");
        },
        JSON.stringify(input),
      );
      assert.equal(result.exit, 2, result.stdout);
    }
    const noContext = await invoke(
      ["outlets", "affiliates", "add", "--input", "-"],
      f.state,
      async () => {
        throw new Error("No HTTP expected");
      },
      JSON.stringify(change),
    );
    assert.equal(noContext.exit, 2);
  } finally {
    await f.cleanup();
  }
});

test("a failed verification read preserves an applied write and directs only a draft read", async () => {
  const f = await fixture();
  try {
    await f.state.storeToken("local", origin, "curator", TOKEN);
    let writes = 0;
    const result = await invoke(
      ["outlets", "affiliates", "add", ...context, "--input", "-"],
      f.state,
      async (url, options) => {
        if (new URL(String(url)).pathname === "/api/v1/user")
          return response(identity);
        if (options?.method === "POST") {
          writes++;
          return response({ draft_revision: 8 }, 201);
        }
        return response({ message: "Unavailable" }, 503);
      },
      JSON.stringify(change),
    );
    assert.equal(result.exit, 0);
    assert.equal(writes, 1);
    assert.equal(result.output.data.mutation_outcome, "applied");
    assert.equal(result.output.data.draft_revision, 8);
    assert.equal(result.output.data.verification_pending, true);
    assert.deepEqual(result.output.next_action, {
      command: "outlets affiliates list",
      slug: "cozy",
    });
  } finally {
    await f.cleanup();
  }
});

test("indeterminate writes are never retried and their journals identify the recovery resource", async () => {
  const f = await fixture();
  try {
    await f.state.storeToken("local", origin, "curator", TOKEN);
    for (const failure of ["network", "invalid_receipt", "503", "412", "409"]) {
      let writes = 0;
      const result = await invoke(
        ["outlets", "affiliates", "update", ...context, "--input", "-"],
        f.state,
        async (url, options) => {
          if (new URL(String(url)).pathname === "/api/v1/user")
            return response(identity);
          writes++;
          assert.equal(options?.method, "PATCH");
          if (failure === "network")
            throw new Error("Synthetic network failure");
          return failure === "invalid_receipt"
            ? response({})
            : response({ message: "Synthetic failure" }, Number(failure));
        },
        JSON.stringify({ ...change, link: { ...link, id } }),
      );
      assert.equal(result.exit, 1);
      assert.equal(writes, 1);
      assert.equal(result.output.error.retryable, false);
      assert.equal(
        result.output.error.details.next_command,
        "outlets affiliates list",
      );
      assert.equal(result.output.error.details.affiliate_link_id, id);
      if (failure !== "409")
        assert.equal(result.output.error.details.mutation_outcome, "unknown");
      else assert.equal(result.output.error.code, "REVISION_CONFLICT");
      const journal = await getExecution(f.state, result.output.execution_id);
      assert.ok(
        journal.resources?.some(
          (resource) =>
            resource.slug === "cozy" && resource.affiliate_link_id === id,
        ),
      );
      assert.doesNotMatch(JSON.stringify(journal), /synthetic-20|session_id/);
    }
  } finally {
    await f.cleanup();
  }
});

test("an explicit profile supplies its immutable origin and account, ignoring unrelated selections", async () => {
  const f = await fixture();
  try {
    await invoke(
      ["profiles", "create", "--name", "affiliate-curator", ...context],
      f.state,
      async () => {
        throw new Error("No HTTP");
      },
    );
    const profile = await getProfile(f.state, "affiliate-curator");
    await profileState(f.state, profile).storeToken(
      "local",
      origin,
      "curator",
      TOKEN,
    );
    await f.state.write("selection-env.json", { env: "prod" });
    await f.state.write("selection-local.json", "unrelated-account");
    const result = await invoke(
      [
        "outlets",
        "affiliates",
        "add",
        "--profile",
        "affiliate-curator",
        "--input",
        "-",
      ],
      f.state,
      async (url, options) => {
        assert.equal(new URL(String(url)).origin, origin);
        assert.equal(
          (options?.headers as Record<string, string>).Cookie,
          `session_id=${TOKEN}`,
        );
        return response(
          new URL(String(url)).pathname === "/api/v1/user"
            ? identity
            : options?.method === "POST"
              ? { draft_revision: 8 }
              : { links: [stored], draft_revision: 8 },
        );
      },
      JSON.stringify(change),
    );
    assert.equal(result.exit, 0, result.stdout);
    assert.equal(result.output.environment, "local");
    assert.equal(result.output.account, "curator");
    assert.equal(result.output.profile, "affiliate-curator");
  } finally {
    await f.cleanup();
  }
});
