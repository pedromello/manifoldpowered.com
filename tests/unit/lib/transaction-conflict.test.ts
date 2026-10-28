import { isTransactionWriteConflict } from "lib/transaction-conflict";
describe("transaction rollback classification", () => {
  test.each([
    { code: "P2034" },
    { code: "P2010", meta: { code: "40001" } },
    Object.assign(
      new Error("TransactionWriteConflict", {
        cause: { kind: "TransactionWriteConflict" },
      }),
      { name: "DriverAdapterError" },
    ),
  ])(
    "recognizes a known rollback across generated client boundaries",
    (error) => {
      expect(isTransactionWriteConflict(error)).toBe(true);
    },
  );
  test.each([
    null,
    undefined,
    "P2034",
    new Error("connection lost"),
    { code: "P2028" },
    { name: "DriverAdapterError", cause: { kind: "AuthenticationFailed" } },
    { name: "OtherError", cause: { kind: "TransactionWriteConflict" } },
  ])(
    "does not classify an unknown outcome or unrelated adapter error as a safe rollback",
    (error) => {
      expect(isTransactionWriteConflict(error)).toBe(false);
    },
  );
});
