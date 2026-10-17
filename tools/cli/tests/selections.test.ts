import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture, invoke, response, TOKEN } from "./helpers";

const context = ["--env", "local", "--account", "curator"];
const reference = ["--slug", "cozy", "--selection-slug", "weekend"];
const identity = {
  id: "curator-id",
  username: "curator",
  email: "curator@example.test",
};

test("selection schemas expose drafts, publication, and ordered game membership without authentication", async () => {
  const f = await fixture();
  try {
    const result = await invoke(
      ["schema", "outlets", "selections", "create"],
      f.state,
      async () => {
        throw new Error("Unexpected HTTP");
      },
    );
    assert.equal(result.exit, 0);
    assert.match(JSON.stringify(result.output), /selection_slug/);
    assert.match(JSON.stringify(result.output), /game_slugs/);
  } finally {
    await f.cleanup();
  }
});

test("selection CRUD keeps outlet and selection addresses distinct and sends the expected revision", async () => {
  const f = await fixture();
  try {
    await f.state.storeToken(
      "local",
      "http://localhost:3000",
      "curator",
      TOKEN,
    );
    const calls: Array<{
      path: string;
      method: string;
      body: Record<string, unknown>;
    }> = [];
    const fetcher: typeof fetch = async (url, options) => {
      const parsed = new URL(String(url));
      if (parsed.pathname === "/api/v1/user") return response(identity);
      assert.equal(
        (options?.headers as Record<string, string>).Cookie,
        `session_id=${TOKEN}`,
      );
      calls.push({
        path: parsed.pathname,
        method: String(options?.method),
        body: JSON.parse(String(options?.body)),
      });
      return response({
        selection: {
          slug: "weekend",
          draft_revision: calls.length,
          public_path: "/store/cozy/selections/weekend",
        },
      });
    };
    const create = await invoke(
      [
        "outlets",
        "selections",
        "create",
        ...context,
        ...reference,
        "--title",
        "Weekend",
        "--game-slugs",
        "peak,repo",
        "--image-urls",
        "https://cdn.example.com/image.png",
      ],
      f.state,
      fetcher,
    );
    assert.equal(create.exit, 0);
    assert.equal(calls[0].path, "/api/v1/stores/cozy/selections");
    assert.equal(calls[0].method, "POST");
    assert.equal(calls[0].body.slug, "weekend");
    assert.deepEqual(calls[0].body.game_slugs, ["peak", "repo"]);
    assert.deepEqual(calls[0].body.image_urls, [
      "https://cdn.example.com/image.png",
    ]);
    const reorder = await invoke(
      [
        "outlets",
        "selections",
        "games",
        "set",
        ...context,
        ...reference,
        "--revision",
        "1",
        "--game-slugs",
        "repo,peak",
      ],
      f.state,
      fetcher,
    );
    assert.equal(reorder.exit, 0);
    assert.deepEqual(calls[1], {
      path: "/api/v1/stores/cozy/selections/weekend",
      method: "PATCH",
      body: { expected_draft_revision: 1, game_slugs: ["repo", "peak"] },
    });
    const publish = await invoke(
      [
        "outlets",
        "selections",
        "publish",
        ...context,
        ...reference,
        "--revision",
        "2",
      ],
      f.state,
      fetcher,
    );
    assert.equal(publish.exit, 0);
    assert.deepEqual(calls[2].body, {
      action: "publish",
      expected_draft_revision: 2,
    });
    assert.equal(
      publish.output.data.public_url,
      "http://localhost:3000/store/cozy/selections/weekend",
    );
    const withdraw = await invoke(
      [
        "outlets",
        "selections",
        "unpublish",
        ...context,
        ...reference,
        "--revision",
        "3",
      ],
      f.state,
      fetcher,
    );
    assert.equal(withdraw.exit, 0);
    assert.equal(calls[3].body.action, "unpublish");
    assert.doesNotMatch(
      create.stdout + publish.stdout + withdraw.stdout,
      new RegExp(TOKEN),
    );
  } finally {
    await f.cleanup();
  }
});

test("selection public discovery omits account cookies and never requests preview content", async () => {
  const f = await fixture();
  try {
    await f.state.storeToken(
      "local",
      "http://localhost:3000",
      "curator",
      TOKEN,
    );
    const fetcher: typeof fetch = async (url, options) => {
      assert.equal(
        (options?.headers as Record<string, string>).Cookie,
        undefined,
      );
      const parsed = new URL(String(url));
      assert.equal(parsed.searchParams.has("preview"), false);
      return response({ selections: [] });
    };
    assert.equal(
      (
        await invoke(
          ["outlets", "selections", "discover", ...context],
          f.state,
          fetcher,
        )
      ).exit,
      0,
    );
    assert.equal(
      (
        await invoke(
          ["outlets", "selections", "public", ...context, ...reference],
          f.state,
          fetcher,
        )
      ).exit,
      0,
    );
  } finally {
    await f.cleanup();
  }
});

test("selection changes reject missing revisions, duplicate games and unsafe covers before HTTP", async () => {
  const f = await fixture();
  try {
    const fetcher: typeof fetch = async () => {
      throw new Error("No HTTP expected");
    };
    assert.equal(
      (
        await invoke(
          [
            "outlets",
            "selections",
            "games",
            "set",
            ...context,
            ...reference,
            "--game-slugs",
            "peak",
          ],
          f.state,
          fetcher,
        )
      ).exit,
      2,
    );
    assert.equal(
      (
        await invoke(
          [
            "outlets",
            "selections",
            "games",
            "set",
            ...context,
            ...reference,
            "--revision",
            "1",
            "--game-slugs",
            "peak,peak",
          ],
          f.state,
          fetcher,
        )
      ).exit,
      2,
    );
    assert.equal(
      (
        await invoke(
          [
            "outlets",
            "selections",
            "create",
            ...context,
            ...reference,
            "--title",
            "Weekend",
            "--cover-url",
            "http://localhost/image.png",
          ],
          f.state,
          fetcher,
        )
      ).exit,
      2,
    );
  } finally {
    await f.cleanup();
  }
});

test("selection conflicts remain conflicts and are not replayed", async () => {
  const f = await fixture();
  try {
    await f.state.storeToken(
      "local",
      "http://localhost:3000",
      "curator",
      TOKEN,
    );
    let writes = 0;
    const fetcher: typeof fetch = async (url) => {
      if (new URL(String(url)).pathname === "/api/v1/user")
        return response(identity);
      writes++;
      return response(
        {
          message: "Selection changed.",
          name: "ConflictError",
          context: { actual_draft_revision: 9 },
        },
        409,
      );
    };
    const result = await invoke(
      [
        "outlets",
        "selections",
        "publish",
        ...context,
        ...reference,
        "--revision",
        "2",
      ],
      f.state,
      fetcher,
    );
    assert.equal(result.exit, 1);
    assert.equal(writes, 1);
    assert.equal(result.output.error.retryable, false);
  } finally {
    await f.cleanup();
  }
});

test("a title-only CLI edit never sends default image, description or game resets", async () => {
  const f = await fixture();
  try {
    await f.state.storeToken(
      "local",
      "http://localhost:3000",
      "curator",
      TOKEN,
    );
    let writes = 0;
    const fetcher: typeof fetch = async (url, options) => {
      if (new URL(String(url)).pathname === "/api/v1/user")
        return response(identity);
      writes++;
      assert.deepEqual(JSON.parse(String(options?.body)), {
        title: "New title",
        expected_draft_revision: 3,
      });
      return response({ selection: { slug: "weekend", draft_revision: 4 } });
    };
    assert.equal(
      (
        await invoke(
          [
            "outlets",
            "selections",
            "update",
            ...context,
            ...reference,
            "--title",
            "New title",
            "--revision",
            "3",
          ],
          f.state,
          fetcher,
        )
      ).exit,
      0,
    );
    assert.equal(writes, 1);
    assert.equal(
      (
        await invoke(
          [
            "outlets",
            "selections",
            "update",
            ...context,
            ...reference,
            "--revision",
            "4",
          ],
          f.state,
          async () => {
            throw new Error("No HTTP expected");
          },
        )
      ).exit,
      2,
    );
  } finally {
    await f.cleanup();
  }
});
