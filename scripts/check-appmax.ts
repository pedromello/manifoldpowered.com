import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd(), true);
const { paymentProvider } = await import("infra/payments");
const { PaymentTransportError } = await import("infra/payments/errors");
try {
  const options = await paymentProvider("appmax").quotes(2500);
  if (!options.length) throw new Error();
  console.log(
    `Appmax sandbox authentication and installment quote verified (${options.length} options).`,
  );
} catch (error) {
  console.error(
    `Could not verify Appmax sandbox${error instanceof PaymentTransportError && error.httpStatus ? ` (${error.stage}, HTTP ${error.httpStatus})` : ""}. Check the sandbox merchant credentials and endpoint configuration.`,
  );
  process.exitCode = 1;
}
