import nextEnv from "@next/env";
import { z } from "zod";
nextEnv.loadEnvConfig(process.cwd(), true);
const { prisma } = await import("infra/database");
const { assertPaymentSandbox } = await import("infra/payments/config");
try {
  assertPaymentSandbox();
  const external = z
    .uuid()
    .parse(
      process.argv.includes("--external-id")
        ? process.argv[process.argv.indexOf("--external-id") + 1]
        : process.env.APPMAX_EXTERNAL_ID,
    );
  await prisma.paymentInstallation.upsert({
    where: {
      provider_environment: { provider: "appmax", environment: "sandbox" },
    },
    create: {
      provider: "appmax",
      environment: "sandbox",
      external_id: external,
    },
    update: { external_id: external },
  });
  console.log("Appmax sandbox installation configured.");
} catch {
  console.error(
    "Could not configure Appmax. Check APPMAX_EXTERNAL_ID and the local database, then retry.",
  );
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
