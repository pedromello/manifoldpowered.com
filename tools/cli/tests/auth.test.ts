import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture, TOKEN, response, invoke, capture } from "./helpers";
import { run } from "../src/index";
import { ApiClient } from "../src/client";
import { validateOrigin } from "../src/state";
import { sanitize } from "../src/errors";
const identity = {
  id: "user-a",
  username: "player-a",
  email: "player-a@example.test",
};
test("register, activate, OTP and logout use real API contracts without exposing secrets", async () => {
  const f = await fixture();
  try {
    const seen: {
      path: string;
      method?: string;
      body?: Record<string, unknown>;
      cookie?: string;
    }[] = [];
    const requestFetch: typeof fetch = async (url, options) => {
      const path = new URL(String(url)).pathname;
      const body = options?.body ? JSON.parse(String(options.body)) : undefined;
      seen.push({
        path,
        method: options?.method,
        body,
        cookie: (options?.headers as Record<string, string>)?.Cookie,
      });
      if (path === "/api/v1/users") {
        assert.equal(body.password, null);
        return response(identity, 201);
      }
      if (path === "/api/v1/user") return response(identity);
      if (path === "/api/v1/otp") return response({ message: "sent" }, 201);
      return response({ token: TOKEN, expires_at: "2099-01-01" }, 201);
    };
    const context = ["--env", "local", "--account", "player-a"];
    const registered = await invoke(
      [
        "users",
        "register",
        ...context,
        "--username",
        "player-a",
        "--email",
        identity.email,
      ],
      f.state,
      requestFetch,
    );
    assert.equal(registered.output.state, "pending");
    const activation = "11111111-1111-4111-8111-111111111111";
    const activated = await invoke(
      ["users", "activate", ...context, "--input", "-"],
      f.state,
      requestFetch,
      JSON.stringify({
        activation_url: `http://localhost:3000/signup/activate/${activation}`,
      }),
    );
    assert.equal(activated.exit, 0);
    assert.equal(activated.output.data.id, identity.id);
    assert.ok(!activated.stdout.includes(activation));
    assert.ok(!activated.stdout.includes(TOKEN));
    assert.equal(f.credentials.entries.size, 1);
    const requested = await invoke(
      ["auth", "login", "request", ...context, "--login", identity.email],
      f.state,
      requestFetch,
    );
    assert.equal(requested.output.state, "pending");
    const verified = await invoke(
      [
        "auth",
        "login",
        "verify",
        ...context,
        "--login",
        identity.email,
        "--input",
        "-",
      ],
      f.state,
      requestFetch,
      '{"code":"123456"}',
    );
    assert.equal(verified.exit, 0);
    assert.ok(!verified.stdout.includes("123456"));
    assert.equal(
      seen.find((item) => item.path === "/api/v1/otp/sessions")?.body?.code,
      "123456",
    );
    await invoke(["auth", "logout", ...context], f.state, requestFetch);
    assert.equal(f.credentials.entries.size, 0);
    assert.ok(
      seen
        .filter(
          (item) =>
            item.path === "/api/v1/users" ||
            item.path.startsWith("/api/v1/activations") ||
            item.path === "/api/v1/otp",
        )
        .every((item) => !item.cookie),
    );
  } finally {
    await f.cleanup();
  }
});
test("origins, account aliases and process tokens remain isolated", async () => {
  const f = await fixture();
  try {
    assert.throws(() => validateOrigin("http://example.test", "hml"));
    assert.throws(() => validateOrigin("https://manifoldpowered.com", "hml"));
    assert.throws(() => validateOrigin("https://example.test/?token=x", "hml"));
    await f.state.storeToken("local", "http://localhost:3000", "a", TOKEN);
    assert.equal(
      await f.state.token("prod", "https://manifoldpowered.com", "a"),
      null,
    );
    assert.equal(
      await f.state.token("local", "http://localhost:3000", "b"),
      null,
    );
    assert.equal(
      await f.state.token("local", "http://localhost:3001", "a"),
      null,
    );
    const prior = { ...process.env };
    try {
      process.env.MANIFOLD_SESSION_TOKEN = TOKEN;
      process.env.MANIFOLD_SESSION_ENV = "local";
      process.env.MANIFOLD_SESSION_ACCOUNT = "a";
      process.env.MANIFOLD_SESSION_ORIGIN = "http://localhost:3000";
      assert.equal(
        await f.state.token("local", "http://localhost:3000", "a"),
        TOKEN,
      );
      await assert.rejects(
        f.state.token("prod", "https://manifoldpowered.com", "a"),
        /não corresponde/,
      );
    } finally {
      for (const key of [
        "MANIFOLD_SESSION_TOKEN",
        "MANIFOLD_SESSION_ENV",
        "MANIFOLD_SESSION_ACCOUNT",
        "MANIFOLD_SESSION_ORIGIN",
      ]) {
        if (prior[key] === undefined) delete process.env[key];
        else process.env[key] = prior[key];
      }
    }
  } finally {
    await f.cleanup();
  }
});
test("production connects directly to its canonical host without forwarding credentials", async () => {
  const f = await fixture();
  try {
    assert.throws(() =>
      validateOrigin("https://www.manifoldpowered.com", "hml"),
    );
    assert.throws(() => validateOrigin("https://example.test", "prod"));
    const connected = await invoke(
      [
        "env",
        "connect",
        "--env",
        "prod",
        "--url",
        "https://manifoldpowered.com",
      ],
      f.state,
      async (url, options) => {
        assert.equal(
          new URL(String(url)).origin,
          "https://www.manifoldpowered.com",
        );
        assert.equal(options?.redirect, "manual");
        assert.ok(!(options?.headers as Record<string, string>).Cookie);
        return response({ dependencies: {} });
      },
    );
    assert.equal(connected.exit, 0);
    assert.equal(
      connected.output.data.origin,
      "https://www.manifoldpowered.com",
    );
    assert.equal(
      await f.state.origin("prod"),
      "https://www.manifoldpowered.com",
    );
  } finally {
    await f.cleanup();
  }
});
test("production activation accepts its fixed apex email link and binds the session to www", async () => {
  const f = await fixture();
  try {
    const activated = await invoke(
      ["users", "activate", "--env", "prod", "--account", "a", "--input", "-"],
      f.state,
      async (url, options) => {
        const parsed = new URL(String(url));
        assert.equal(parsed.origin, "https://www.manifoldpowered.com");
        assert.equal(options?.redirect, "manual");
        return response(
          parsed.pathname === "/api/v1/user" ? identity : { token: TOKEN },
        );
      },
      JSON.stringify({
        activation_url:
          "https://manifoldpowered.com/signup/activate/11111111-1111-4111-8111-111111111111",
      }),
    );
    assert.equal(activated.exit, 0);
    assert.equal(
      await f.state.token("prod", "https://www.manifoldpowered.com", "a"),
      TOKEN,
    );
    assert.equal(
      await f.state.token("prod", "https://manifoldpowered.com", "a"),
      null,
    );
    assert.ok(!activated.stdout.includes(TOKEN));
  } finally {
    await f.cleanup();
  }
});
test("secrets passed as flags, missing contexts and unknown fields fail before requests", async () => {
  let requests = 0;
  const requestFetch: typeof fetch = async () => {
    requests++;
    return response({});
  };
  const f = await fixture();
  try {
    assert.equal(
      (
        await invoke(
          ["auth", "login", "verify", "--code", "123456"],
          f.state,
          requestFetch,
        )
      ).exit,
      2,
    );
    assert.equal(
      (
        await invoke(
          ["studios", "create", "--name", "Demo"],
          f.state,
          requestFetch,
        )
      ).exit,
      2,
    );
    assert.equal(
      (
        await invoke(
          [
            "outlets",
            "create",
            "--env",
            "local",
            "--account",
            "a",
            "--input",
            "-",
          ],
          f.state,
          requestFetch,
          '{"name":"Demo","owner_id":"other"}',
        )
      ).exit,
      2,
    );
    assert.equal(requests, 0);
  } finally {
    await f.cleanup();
  }
});
test("redirects never forward cookies and expired sessions report a stable error", async () => {
  let calls = 0;
  const client = new ApiClient("https://example.test", TOKEN, async () => {
    calls++;
    return new Response(null, {
      status: 302,
      headers: { location: "https://other.test" },
    });
  });
  await assert.rejects(client.request("/user"), /redirecionar/);
  assert.equal(calls, 1);
  const f = await fixture();
  try {
    await f.state.storeToken("local", "http://localhost:3000", "a", TOKEN);
    const failure = await invoke(
      ["auth", "whoami", "--env", "local", "--account", "a"],
      f.state,
      async () =>
        response({ message: "expired", context: { token: TOKEN } }, 401),
    );
    assert.equal(failure.output.error.code, "SESSION_EXPIRED");
    assert.ok(!failure.stdout.includes(TOKEN));
  } finally {
    await f.cleanup();
  }
});
test("schema and brand tokens survive sanitization while credentials and terminal escapes do not", async () => {
  assert.deepEqual(
    sanitize({
      brand_tokens: { palette: "ocean" },
      token: TOKEN,
      code: "123456",
      message: "\x1b[2Jready",
    }),
    { brand_tokens: { palette: "ocean" }, message: "ready" },
  );
  const output = capture();
  assert.equal(
    await run(["schema", "outlets", "create", "--json"], output.io),
    0,
  );
  assert.ok(output.json.data.input.properties.brand_tokens);
});
