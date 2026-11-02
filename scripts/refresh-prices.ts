import nextEnv from "@next/env";
import { parseArgs } from "node:util";

nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
const { values } = parseArgs({
  options: {
    provider: { type: "string", default: "ALL" },
    "run-id": { type: "string" },
    "dry-run": { type: "boolean", default: false },
    "retry-failed": { type: "boolean", default: false },
    limit: { type: "string" },
  },
});
const { prisma } = await import("infra/database");
const {
  candidates,
  createRun,
  resumeRun,
  executeRun,
  runSummary,
  validateProvider,
} = await import("models/price_refresh");
const { collectPrice } = await import("models/price_collection");
const { priceErrorCode, retryDelay } = await import("lib/price_refresh");
const { z } = await import("zod");
const provider = validateProvider(values.provider);
const limit = values.limit
  ? z.coerce.number().int().min(1).max(10000).parse(values.limit)
  : undefined;
if (values["run-id"]) z.uuid().parse(values["run-id"]);
if (values["retry-failed"] && !values["run-id"])
  throw new Error("--retry-failed requires --run-id");
if (
  values["run-id"] &&
  (values.limit || values["dry-run"] || values.provider !== "ALL")
)
  throw new Error(
    "--run-id cannot be combined with --limit, --provider or --dry-run",
  );
let stopped = false;
process.on("SIGINT", () => {
  stopped = true;
});
process.on("SIGTERM", () => {
  stopped = true;
});
async function collectDryRun(ref: Parameters<typeof collectPrice>[0]) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await collectPrice(ref);
    } catch (error) {
      const delay = retryDelay(error, attempt);
      if (delay !== null) {
        const until = Date.now() + delay;
        while (!stopped && Date.now() < until)
          await new Promise((resolve) =>
            setTimeout(resolve, Math.min(1000, until - Date.now())),
          );
      }
      if (stopped || attempt === 3 || delay === null) throw error;
    }
  }
}
try {
  if (values["dry-run"]) {
    for (const item of await candidates(provider, limit)) {
      if (stopped) break;
      try {
        const price =
          item.status === "SKIPPED"
            ? null
            : await collectDryRun({
                ...item,
                url: item.url ?? null,
                provider: item.provider as "STEAM" | "NINTENDO" | "PLAYSTATION",
                country: item.country as "BR" | "US",
              });
        console.log(
          JSON.stringify({
            game_id: item.game_id,
            provider: item.provider,
            country: item.country,
            price,
            error_code: item.error_code ?? null,
          }),
        );
      } catch (error) {
        process.exitCode = 1;
        console.log(
          JSON.stringify({
            game_id: item.game_id,
            country: item.country,
            error_code: priceErrorCode(error),
          }),
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } else {
    let id = values["run-id"];
    if (id && values["retry-failed"]) id = (await resumeRun(id, true)).run.id;
    if (!id) id = (await createRun(provider, undefined, limit)).run.id;
    console.log(JSON.stringify({ run_id: id }));
    await executeRun(id, { shouldStop: () => stopped });
    const report = await runSummary(id);
    console.log(JSON.stringify(report));
    if (report.status !== "COMPLETED") process.exitCode = 1;
  }
} finally {
  await prisma.$disconnect();
}
