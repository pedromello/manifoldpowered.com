import { createHash } from "node:crypto";
import { NextApiRequest } from "next";

const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 10;

type Bucket = { attempts: number; resetsAt: number };
const buckets = new Map<string, Bucket>();

function clientAddress(req: NextApiRequest) {
  const forwarded = req.headers["x-forwarded-for"];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return (
    value?.split(",", 1)[0].trim() || req.socket.remoteAddress || "unknown"
  );
}

function keysFor(req: NextApiRequest, login: string) {
  // Hashing avoids retaining email addresses in process memory and diagnostics.
  const address = clientAddress(req);
  const normalizedLogin = login.trim().toLowerCase();
  return [
    createHash("sha256").update(`address\0${address}`).digest("hex"),
    createHash("sha256").update(`login\0${normalizedLogin}`).digest("hex"),
  ];
}

function loginKeyFor(login: string) {
  return createHash("sha256")
    .update(`login\0${login.trim().toLowerCase()}`)
    .digest("hex");
}

function consume(req: NextApiRequest, login: string, now = Date.now()) {
  const updated = keysFor(req, login).map((key) => {
    const existing = buckets.get(key);
    const bucket =
      !existing || existing.resetsAt <= now
        ? { attempts: 0, resetsAt: now + WINDOW_MS }
        : existing;

    bucket.attempts += 1;
    buckets.set(key, bucket);
    return bucket;
  });

  const mostRestricted = updated.reduce((left, right) =>
    left.attempts >= right.attempts ? left : right,
  );

  return {
    allowed: updated.every((bucket) => bucket.attempts <= MAX_ATTEMPTS),
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((mostRestricted.resetsAt - now) / 1000),
    ),
  };
}

function reset(login: string) {
  // A successful login proves only that account is legitimate. Retaining the
  // address bucket prevents an attacker from using their own account to reset
  // the password-spraying limit for every other login.
  buckets.delete(loginKeyFor(login));
}

const authRateLimit = { consume, reset, MAX_ATTEMPTS, WINDOW_MS };
export default authRateLimit;
