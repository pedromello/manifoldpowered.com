import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture, TOKEN, response, invoke } from "./helpers";

const identity = {
  id: "subscriber",
  email: "reader@example.test",
  username: "reader",
};
const context = ["--env", "local", "--account", "reader"];
const origin = "http://localhost:3000";

test("notification commands use the current account and preserve follow on disable", async () => {
  const f = await fixture();
  try {
    await f.state.storeToken("local", origin, "reader", TOKEN);
    const calls: Array<{ path: string; method: string; body: unknown }> = [];
    const fetcher: typeof fetch = async (url, options) => {
      const path = new URL(String(url)).pathname;
      assert.equal(
        (options?.headers as Record<string, string>).Cookie,
        `session_id=${TOKEN}`,
      );
      if (path === "/api/v1/user") return response(identity);
      calls.push({
        path,
        method: String(options?.method),
        body: options?.body ? JSON.parse(String(options.body)) : null,
      });
      return response({
        enabled: options?.body
          ? JSON.parse(String(options.body)).enabled
          : false,
        is_followed: true,
        requires_email_login: false,
      });
    };
    for (const command of ["status", "enable", "disable"]) {
      const result = await invoke(
        ["outlets", "notifications", command, ...context, "--slug", "club"],
        f.state,
        fetcher,
      );
      assert.equal(result.exit, 0);
      assert.equal(result.output.account, "reader");
      assert.equal(result.output.data.is_followed, true);
    }
    assert.deepEqual(calls, [
      { path: "/api/v1/stores/club/notifications", method: "GET", body: null },
      {
        path: "/api/v1/stores/club/notifications",
        method: "PUT",
        body: { enabled: true, locale: "pt-BR" },
      },
      {
        path: "/api/v1/stores/club/notifications",
        method: "PUT",
        body: { enabled: false },
      },
    ]);
  } finally {
    await f.cleanup();
  }
});

test("global email locale is explicit and independent of the navigation locale", async () => {
  const f = await fixture();
  try {
    await f.state.storeToken("local", origin, "reader", TOKEN);
    let writes = 0;
    const result = await invoke(
      [
        "auth",
        "notifications",
        "set",
        ...context,
        "--email-locale",
        "en",
        "--locale",
        "pt-BR",
      ],
      f.state,
      async (url, options) => {
        if (new URL(String(url)).pathname === "/api/v1/user")
          return response(identity);
        writes++;
        assert.equal(
          new URL(String(url)).pathname,
          "/api/v1/user/notification-preferences",
        );
        assert.equal(options?.method, "PATCH");
        assert.deepEqual(JSON.parse(String(options?.body)), {
          email_locale: "en",
        });
        return response({ email_locale: "en", has_preference: true });
      },
    );
    assert.equal(result.exit, 0);
    assert.equal(writes, 1);
    for (const input of [
      { email_locale: "fr" },
      { email_locale: "en", user_id: "someone-else" },
    ]) {
      const invalid = await invoke(
        ["auth", "notifications", "set", ...context, "--input", "-"],
        f.state,
        async () => {
          throw new Error("No HTTP expected");
        },
        JSON.stringify(input),
      );
      assert.equal(invalid.exit, 2);
    }
  } finally {
    await f.cleanup();
  }
});

test("missing email proof points to normal OTP without pretending the session expired", async () => {
  const f = await fixture();
  try {
    await f.state.storeToken("local", origin, "reader", TOKEN);
    const result = await invoke(
      ["outlets", "notifications", "enable", ...context, "--slug", "club"],
      f.state,
      async (url) =>
        new URL(String(url)).pathname === "/api/v1/user"
          ? response(identity)
          : response(
              {
                message: "Confirm email",
                context: { code: "EMAIL_LOGIN_REQUIRED" },
              },
              409,
            ),
    );
    assert.equal(result.exit, 1);
    assert.equal(result.output.error.code, "EMAIL_LOGIN_REQUIRED");
    assert.equal(
      result.output.error.details.next_command,
      "auth login request",
    );
    assert.ok(!result.stdout.includes(TOKEN));
    const missingContext = await invoke(
      ["outlets", "notifications", "enable", "--slug", "club"],
      f.state,
      async () => {
        throw new Error("No request allowed");
      },
    );
    assert.equal(missingContext.exit, 2);
  } finally {
    await f.cleanup();
  }
});

test("notification schemas and lists remain available in the non-interactive contract", async () => {
  const f = await fixture();
  try {
    const schema = await invoke(
      ["schema", "auth", "notifications", "set"],
      f.state,
      async () => {
        throw new Error("No HTTP expected");
      },
    );
    assert.equal(schema.exit, 0);
    assert.ok(schema.stdout.includes("email_locale"));
    await f.state.storeToken("local", origin, "reader", TOKEN);
    for (const words of [
      ["outlets", "notifications", "list"],
      ["auth", "notifications", "get"],
    ]) {
      const result = await invoke(
        [...words, ...context],
        f.state,
        async (url, options) => {
          const path = new URL(String(url)).pathname;
          if (path === "/api/v1/user") return response(identity);
          assert.equal(options?.method, "GET");
          return response(
            path.endsWith("outlet-notifications")
              ? { email_locale: "en", subscriptions: [] }
              : { email_locale: "en", has_preference: true },
          );
        },
      );
      assert.equal(result.exit, 0);
      assert.equal(result.output.data.email_locale, "en");
    }
  } finally {
    await f.cleanup();
  }
});
