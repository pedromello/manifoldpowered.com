import { spawnSync } from "node:child_process";

import { vercelBuildSteps } from "./vercel-build-policy";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const commands = {
  generate: ["run", "prisma:generate"],
  migrate: ["run", "migrate:deploy"],
  build: ["run", "build"],
} as const;

for (const step of vercelBuildSteps(process.env.VERCEL_ENV)) {
  const result = spawnSync(npm, [...commands[step]], {
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
