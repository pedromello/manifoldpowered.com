import { test } from "node:test";
import assert from "node:assert/strict";
import { execute } from "../src/engine";
import { fixture, TOKEN, response } from "./helpers";
const identity = { id: "user-a", email: "a@example.test", username: "a" };
const context = { env: "local", account: "a" };
const id = "UP0000-PPSA00001_00-0000000000000001";
const reference = "https://store.playstation.com/pt-br/product/" + id;
test("PlayStation import canonicalizes the exact regional edition and polls without another write", async () => {
  const f = await fixture();
  try {
    await f.state.storeToken("local", "http://localhost:3000", "a", TOKEN);
    let writes = 0;
    const requestFetch: typeof fetch = async (url, options) => {
      const parsed = new URL(String(url));
      if (parsed.pathname === "/api/v1/user") return response(identity);
      assert.equal(parsed.pathname, "/api/v1/items/games/playstation-import");
      if (options?.method === "POST") {
        writes++;
        assert.deepEqual(JSON.parse(String(options.body)), {
          store_url: reference,
        });
        return response({ slug: "orbit-tactics-ps5" });
      }
      assert.equal(parsed.searchParams.get("store_url"), reference);
      return response({
        slug: "orbit-tactics-ps5",
        refresh: { state: "cached" },
      });
    };
    const imported = await execute(
      "games import playstation",
      { reference: reference + "?tracking=test" },
      context,
      { state: f.state, fetch: requestFetch },
    );
    assert.equal(imported.state, "completed");
    const status = await execute(
      "games import status",
      { provider: "playstation", reference },
      context,
      { state: f.state, fetch: requestFetch },
    );
    assert.equal(status.state, "completed");
    assert.equal(writes, 1);
  } finally {
    await f.cleanup();
  }
});
test("PlayStation batch rejects concept and foreign URLs before any write", async () => {
  const f = await fixture();
  try {
    await f.state.storeToken("local", "http://localhost:3000", "a", TOKEN);
    let writes = 0;
    const requestFetch: typeof fetch = async (url, options) => {
      if (options?.method === "POST") writes++;
      return response(identity);
    };
    await assert.rejects(
      execute(
        "games import batch",
        {
          games: [
            { provider: "playstation", reference },
            {
              provider: "playstation",
              reference: "https://store.playstation.com/pt-br/concept/10000001",
            },
          ],
        },
        context,
        { state: f.state, fetch: requestFetch },
      ),
    );
    await assert.rejects(
      execute(
        "games import playstation",
        { reference: "https://example.test/product/" + id },
        context,
        { state: f.state, fetch: requestFetch },
      ),
    );
    assert.equal(writes, 0);
  } finally {
    await f.cleanup();
  }
});
