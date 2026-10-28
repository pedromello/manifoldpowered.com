import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { State, type CredentialStore } from "../src/state";
import { run, type IO } from "../src/index";
import type { Dependencies } from "../src/engine";
export const TOKEN = "a".repeat(96);
export class MemoryCredentials implements CredentialStore {
  entries = new Map<string, string>();
  async get(key: string) {
    return this.entries.get(key) ?? null;
  }
  async set(key: string, value: string) {
    this.entries.set(key, value);
  }
  async delete(key: string) {
    this.entries.delete(key);
  }
}
export async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "manifold-cli-test-"));
  const credentials = new MemoryCredentials();
  const state = new State(directory, credentials);
  const root = resolve(tmpdir());
  return {
    state,
    credentials,
    cleanup: async () => {
      if (
        !resolve(directory).startsWith(root + "/") &&
        !resolve(directory).startsWith(root + "\\")
      )
        throw new Error("Unsafe test directory");
      await rm(directory, { recursive: true, force: true });
    },
  };
}
export function response(body: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}
export function capture(
  input = "",
  tty = false,
  env: Record<string, string | undefined> = {},
) {
  let stdout = "",
    stderr = "";
  const io: IO = {
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
    stdin: async () => input,
    stdoutTTY: tty,
    stderrTTY: tty,
    columns: 120,
    colorDepth: 24,
    env,
  };
  return {
    io,
    get stdout() {
      return stdout;
    },
    get stderr() {
      return stderr;
    },
    get json() {
      return JSON.parse(stdout);
    },
  };
}
export async function invoke(
  argv: string[],
  state: State,
  requestFetch: typeof fetch,
  input = "",
  dependencies: Partial<Dependencies> = {},
) {
  const output = capture(input);
  const exit = await run([...argv, "--json"], output.io, {
    state,
    fetch: requestFetch,
    ...dependencies,
  });
  return {
    exit,
    output: output.json,
    stdout: output.stdout,
    stderr: output.stderr,
  };
}
