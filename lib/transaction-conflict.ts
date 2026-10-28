/** Stable rollback classifications survive Prisma/Next bundle boundaries. */
export function isTransactionWriteConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as {
    code?: unknown;
    name?: unknown;
    meta?: { code?: unknown };
    cause?: { kind?: unknown };
  };
  return (
    value.code === "P2034" ||
    value.meta?.code === "40001" ||
    (value.name === "DriverAdapterError" &&
      value.cause?.kind === "TransactionWriteConflict")
  );
}
