import { vercelBuildSteps } from "scripts/vercel-build-policy";

describe("Vercel build policy", () => {
  test.each([undefined, "preview", "development"])(
    "never migrates the shared database in %s",
    (environment) => {
      expect(vercelBuildSteps(environment)).toEqual(["generate", "build"]);
    },
  );

  test("generates, migrates, then builds in production", () => {
    expect(vercelBuildSteps("production")).toEqual([
      "generate",
      "migrate",
      "build",
    ]);
  });
});
