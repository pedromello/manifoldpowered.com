import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture, invoke, response, TOKEN } from "./helpers";
import { getExecution } from "../src/journal";

const context = ["--env", "local", "--account", "curator"];
const identity = {
  id: "curator-id",
  username: "curator",
  email: "curator@example.test",
};

test("rating options expose all legal values without network or authentication", async () => {
  const f = await fixture();
  try {
    const result = await invoke(
      ["outlets", "ratings", "options"],
      f.state,
      async () => {
        throw new Error("No HTTP expected");
      },
    );
    assert.equal(result.exit, 0);
    const scales = result.output.data.scales;
    assert.deepEqual(
      scales.map((item: { scale: string }) => item.scale),
      ["STARS", "NUMERIC_10", "TIER"],
    );
    assert.deepEqual(
      scales[0].values,
      [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5],
    );
    assert.equal(scales[1].values.length, 21);
    assert.equal(scales[2].values.at(-1), "S+");
  } finally {
    await f.cleanup();
  }
});

test("rating configuration reads draft state and sends preview/conversion payloads to existing endpoints", async () => {
  const f = await fixture();
  try {
    await f.state.storeToken(
      "local",
      "http://localhost:3000",
      "curator",
      TOKEN,
    );
    const mapping = Array.from({ length: 11 }, (_, i) => ({
      from: i / 2,
      to: i,
    }));
    let writes = 0;
    const fetcher: typeof fetch = async (url, options) => {
      const parsed = new URL(String(url));
      if (parsed.pathname === "/api/v1/user") return response(identity);
      if (!parsed.pathname.includes("rating-system")) {
        assert.equal(parsed.searchParams.get("preview"), "1");
        return response({ rating_scale: "STARS", draft_revision: 7 });
      }
      assert.deepEqual(JSON.parse(String(options?.body)), {
        target_scale: "NUMERIC_10",
        expected_draft_revision: 7,
        mapping,
      });
      assert.equal(
        (options?.headers as Record<string, string>).Cookie,
        `session_id=${TOKEN}`,
      );
      if (parsed.pathname.endsWith("/preview")) {
        assert.equal(options?.method, "POST");
        return response({
          source_scale: "STARS",
          target_scale: "NUMERIC_10",
          draft_revision: 7,
          mapping,
          rated_count: 2,
          unrated_count: 0,
        });
      }
      assert.equal(options?.method, "PUT");
      writes++;
      return response({
        rating_scale: "NUMERIC_10",
        draft_revision: 8,
        converted_count: 2,
      });
    };
    const get = await invoke(
      ["outlets", "ratings", "get", ...context, "--slug", "cozy"],
      f.state,
      fetcher,
    );
    assert.equal(get.output.data.rating_scale, "STARS");
    const flags = [
      ...context,
      "--slug",
      "cozy",
      "--target-scale",
      "NUMERIC_10",
      "--revision",
      "7",
      "--mapping",
      JSON.stringify(mapping),
    ];
    const preview = await invoke(
      ["outlets", "ratings", "preview", ...flags],
      f.state,
      fetcher,
    );
    assert.equal(preview.output.data.rated_count, 2);
    assert.equal(writes, 0);
    const set = await invoke(
      ["outlets", "ratings", "set", ...flags],
      f.state,
      fetcher,
    );
    assert.equal(set.output.data.draft_revision, 8);
    assert.equal(writes, 1);
    const invalid = await invoke(
      [
        "outlets",
        "ratings",
        "set",
        ...context,
        "--slug",
        "cozy",
        "--target-scale",
        "BAD",
        "--revision",
        "8",
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

test("setting or clearing a game's rating preserves existing headline/text and checks revision before any write", async () => {
  const f = await fixture();
  try {
    await f.state.storeToken(
      "local",
      "http://localhost:3000",
      "curator",
      TOKEN,
    );
    let writes = 0;
    let revision = 7;
    let rating: unknown = null;
    const fetcher: typeof fetch = async (url, options) => {
      if (new URL(String(url)).pathname === "/api/v1/user")
        return response(identity);
      if (new URL(String(url)).pathname === "/api/v1/stores/cozy")
        return response({ draft_revision: revision, rating_scale: "STARS" });
      if (options?.method !== "PUT")
        return response({
          review: {
            headline: "Keep headline",
            body: "Keep the researched editorial",
            rating,
          },
        });
      const body = JSON.parse(String(options.body));
      assert.equal(body.headline, "Keep headline");
      assert.equal(body.body, "Keep the researched editorial");
      assert.equal(body.expected_draft_revision, revision);
      writes++;
      rating = body.rating;
      revision++;
      return response({ review: { ...body }, draft_revision: revision });
    };
    const args = [
      "outlets",
      "ratings",
      "game",
      "set",
      ...context,
      "--slug",
      "cozy",
      "--game-slug",
      "portal",
    ];
    const added = await invoke(
      [...args, "--revision", "7", "--rating", '{"scale":"STARS","value":4.5}'],
      f.state,
      fetcher,
    );
    assert.equal(added.exit, 0);
    const execution = await getExecution(f.state, added.output.execution_id);
    assert.ok(
      execution.resources?.some(
        (resource) =>
          resource.slug === "cozy" && resource.game_slug === "portal",
      ),
    );
    assert.deepEqual(rating, { scale: "STARS", value: 4.5 });
    const stale = await invoke(
      [...args, "--revision", "7", "--rating", "null"],
      f.state,
      fetcher,
    );
    assert.equal(stale.output.error.code, "REVISION_CONFLICT");
    assert.equal(writes, 1);
    const removed = await invoke(
      [...args, "--revision", "8", "--rating", "null"],
      f.state,
      fetcher,
    );
    assert.equal(removed.exit, 0);
    assert.equal(rating, null);
    assert.equal(writes, 2);
    const bad = await invoke(
      [...args, "--revision", "9", "--rating", '{"scale":"STARS","value":6}'],
      f.state,
      fetcher,
    );
    assert.equal(bad.exit, 2);
    assert.equal(writes, 2);
  } finally {
    await f.cleanup();
  }
});

test("a concurrent draft change during editorial reading stops a rating write", async () => {
  const f = await fixture();
  try {
    await f.state.storeToken(
      "local",
      "http://localhost:3000",
      "curator",
      TOKEN,
    );
    let revision = 7,
      writes = 0;
    const result = await invoke(
      ["outlets", "ratings", "game", "set", ...context, "--input", "-"],
      f.state,
      async (url, options) => {
        const path = new URL(String(url)).pathname;
        if (path === "/api/v1/user") return response(identity);
        if (options?.method === "PUT") {
          writes++;
          return response({});
        }
        if (path === "/api/v1/stores/cozy")
          return response({ draft_revision: revision, rating_scale: "STARS" });
        revision++;
        return response({
          review: {
            headline: "Previous",
            body: "Content before another editor's change",
            rating: null,
          },
        });
      },
      JSON.stringify({
        slug: "cozy",
        game_slug: "portal",
        rating: { scale: "STARS", value: 4 },
        expected_draft_revision: 7,
      }),
    );
    assert.equal(result.output.error.code, "REVISION_CONFLICT");
    assert.equal(result.output.error.details.actual_draft_revision, 8);
    assert.equal(writes, 0);
  } finally {
    await f.cleanup();
  }
});
