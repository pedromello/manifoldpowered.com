import authRateLimit from "infra/auth_rate_limit";
import { NextApiRequest } from "next";

function request(address: string) {
  return {
    headers: { "x-forwarded-for": address },
    socket: {},
  } as unknown as NextApiRequest;
}

describe("authentication rate limiting", () => {
  test("limits repeated attempts without retaining the login in its key", () => {
    const req = request("192.0.2.10");
    const login = `person-${Date.now()}@example.com`;

    for (let attempt = 0; attempt < authRateLimit.MAX_ATTEMPTS; attempt += 1) {
      expect(authRateLimit.consume(req, login, 1).allowed).toBe(true);
    }

    const limited = authRateLimit.consume(req, login, 1);
    expect(limited.allowed).toBe(false);
    expect(limited.retryAfterSeconds).toBe(authRateLimit.WINDOW_MS / 1000);
  });

  test("successful authentication resets the bucket", () => {
    const req = request("192.0.2.11");
    const login = `reset-${Date.now()}@example.com`;
    authRateLimit.consume(req, login, 1);
    authRateLimit.reset(login);

    expect(authRateLimit.consume(req, login, 1).allowed).toBe(true);
  });

  test("limits an address even when login identifiers rotate", () => {
    const req = request("192.0.2.12");
    for (let attempt = 0; attempt < authRateLimit.MAX_ATTEMPTS; attempt += 1) {
      expect(
        authRateLimit.consume(req, `${attempt}@example.com`, 1).allowed,
      ).toBe(true);
    }

    expect(authRateLimit.consume(req, "new@example.com", 1).allowed).toBe(
      false,
    );
  });

  test("successful authentication preserves the address bucket", () => {
    const req = request("192.0.2.13");
    for (let attempt = 0; attempt < authRateLimit.MAX_ATTEMPTS; attempt += 1) {
      authRateLimit.consume(req, `victim-${attempt}@example.com`, 1);
    }

    authRateLimit.reset("attacker@example.com");
    expect(
      authRateLimit.consume(req, "next-victim@example.com", 1).allowed,
    ).toBe(false);
  });
});
