import { Client } from "pg";
import dotenv from "dotenv";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { createServer } from "node:net";
dotenv.config({ path: ".env.development", quiet: true });
const databaseName = `cli_e2e_${Date.now()}`;
if (
  !/^cli_e2e_\d+$/.test(databaseName) ||
  !["localhost", "127.0.0.1"].includes(process.env.POSTGRES_HOST)
)
  throw new Error("Only an isolated loopback test database is supported.");
const admin = new Client({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT),
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: "postgres",
});
const port = 3031;
await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once("error", () =>
    reject(
      new Error(
        "Port 3031 is busy; stop its server before running this isolated test.",
      ),
    ),
  );
  probe.listen(port, () => probe.close(resolve));
});
const origin = `http://localhost:${port}`;
const env = {
  ...process.env,
  POSTGRES_DB: databaseName,
  MANIFOLD_PREVIEW_ORIGIN: origin,
  NODE_ENV: "development",
  NEXT_TELEMETRY_DISABLED: "1",
};
let server,
  created = false;
const serverErrors = [];
function collectDiagnostics(chunk) {
  for (const line of chunk.toString().split("\n")) {
    try {
      const entry = JSON.parse(line);
      if (
        !/^\/api\/v1\/stores\//.test(entry.path ?? "") ||
        entry.status_code < 500
      )
        continue;
      const cause = JSON.stringify(entry.cause ?? {});
      serverErrors.push({
        path: entry.path,
        cause_name: entry.cause?.name,
        code: cause.match(/\b(?:P\d{4}|40001|40P01)\b/)?.[0],
        timeout: /timeout|timed out|expired transaction/i.test(cause),
        serialization: /serialize|serializ|deadlock/i.test(cause),
      });
    } catch {
      /* Never emit unparsed logs, SMTP contents or credentials. */
    }
  }
}
function command(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      env,
      stdio: "inherit",
      windowsHide: true,
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Test command failed (${code}).`)),
    );
  });
}
await admin.connect();
try {
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  created = true;
  await command(["node_modules/prisma/build/index.js", "migrate", "deploy"]);
  server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "dev", "--port", String(port)],
    { env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
  );
  // Server logs can contain activation links on SMTP failures; never forward them.
  server.stdout.on("data", collectDiagnostics);
  server.stderr.on("data", collectDiagnostics);
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null)
      throw new Error(
        "The isolated Next server stopped before becoming ready.",
      );
    try {
      const response = await fetch(`${origin}/api/v1/status`, {
        signal: AbortSignal.timeout(3000),
      });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      /* Wait for compilation. */
    }
    await sleep(1000);
  }
  if (!ready) throw new Error("The isolated Next server did not become ready.");
  console.log("Isolated API and database ready.");
  await command([
    "--import",
    "tsx",
    fileURLToPath(new URL("./e2e.ts", import.meta.url)),
  ]);
  await command([
    "--import",
    "tsx",
    fileURLToPath(new URL("./curators-e2e.ts", import.meta.url)),
  ]);
} catch (error) {
  if (serverErrors.length)
    console.error(JSON.stringify({ server_errors: serverErrors }));
  throw error;
} finally {
  if (server?.pid) {
    if (process.platform === "win32")
      spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    else {
      server.kill("SIGTERM");
      await sleep(1000);
    }
  }
  if (created)
    await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  await admin.end();
}
