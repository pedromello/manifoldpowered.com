import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd(), true);
const { default: worker } = await import("models/purchase_payment_jobs");
const { prisma } = await import("infra/database");
let running = true;
process.on("SIGINT", () => {
  running = false;
});
process.on("SIGTERM", () => {
  running = false;
});
console.log("Payment reconciliation worker ready.");
try {
  while (running) {
    try {
      if (await worker.runOne()) continue;
    } catch {
      console.error("Payment worker could not process a job.");
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
} finally {
  await prisma.$disconnect();
}
