import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiClient } from "../src/client";
import { fixture, response, TOKEN, invoke } from "./helpers";
test("indeterminate mutations are not advertised as safe retries", async () => {
  const client = new ApiClient("http://localhost:3000", null, async () => {
    throw new Error("transport failed");
  });
  await assert.rejects(
    client.request("/studios", { method: "POST", body: { name: "Demo" } }),
    (error: unknown) => {
      const failure = error as {
        retryable: boolean;
        details: { mutation_outcome: string };
      };
      assert.equal(failure.retryable, false);
      assert.equal(failure.details.mutation_outcome, "unknown");
      return true;
    },
  );
  await assert.rejects(client.request("/games"), (error: unknown) => {
    assert.equal((error as { retryable: boolean }).retryable, true);
    return true;
  });
});
test("server failures cannot expose email contents or server credentials", async () => {
  const client = new ApiClient("http://localhost:3000", null, async () =>
    response(
      {
        message: "Could not send email",
        context: { text: "Your code is 987654", password: "server-password" },
      },
      503,
    ),
  );
  await assert.rejects(
    client.request("/otp", {
      method: "POST",
      body: { login: "a@example.test" },
      anonymous: true,
    }),
    (error: unknown) => {
      assert.ok(!JSON.stringify(error).includes("987654"));
      assert.ok(!JSON.stringify(error).includes("server-password"));
      return true;
    },
  );
});
test("activation cannot replace a pending account with a different identity", async () => {
  const f = await fixture();
  try {
    await f.state.saveAccount("local", {
      alias: "a",
      origin: "http://localhost:3000",
      email: "a@example.test",
      pending: "activation",
    });
    let revoked = false;
    const requestFetch: typeof fetch = async (url, options) => {
      const path = new URL(String(url)).pathname;
      if (path === "/api/v1/user")
        return response({
          id: "user-b",
          username: "b",
          email: "b@example.test",
        });
      if (options?.method === "DELETE") revoked = true;
      return response({ token: TOKEN });
    };
    const outcome = await invoke(
      ["users", "activate", "--env", "local", "--account", "a", "--input", "-"],
      f.state,
      requestFetch,
      '{"activation_url":"11111111-1111-4111-8111-111111111111"}',
    );
    assert.equal(outcome.output.error.code, "ACCOUNT_MISMATCH");
    assert.equal(f.credentials.entries.size, 0);
    assert.equal(revoked, true);
  } finally {
    await f.cleanup();
  }
});
test("an existing identity keeps its alias after an email change", async () => {
  const f = await fixture();
  try {
    await f.state.saveAccount("local", {
      alias: "a",
      origin: "http://localhost:3000",
      user_id: "user-a",
      email: "old@example.test",
    });
    const requestFetch: typeof fetch = async (url) =>
      new URL(String(url)).pathname === "/api/v1/user"
        ? response({ id: "user-a", username: "a", email: "new@example.test" })
        : response({ token: TOKEN });
    const outcome = await invoke(
      [
        "auth",
        "login",
        "password",
        "--env",
        "local",
        "--account",
        "a",
        "--input",
        "-",
      ],
      f.state,
      requestFetch,
      '{"email":"new@example.test","password":"synthetic-password"}',
    );
    assert.equal(outcome.exit, 0);
    assert.equal(outcome.output.data.id, "user-a");
    assert.ok(!outcome.stdout.includes("synthetic-password"));
  } finally {
    await f.cleanup();
  }
});
