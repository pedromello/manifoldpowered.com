import controller from "infra/controller";
import { UnauthorizedError } from "infra/errors";

describe("bearer authorization", () => {
  test("extracts a bearer session token", () => {
    expect(controller.readBearerToken("Bearer abc_123-XYZ")).toBe(
      "abc_123-XYZ",
    );
  });

  test("returns undefined only when the header is absent", () => {
    expect(controller.readBearerToken(undefined)).toBeUndefined();
  });

  test.each([
    "",
    "Basic abc",
    "bearer abc",
    "Bearer",
    "Bearer  abc",
    "Bearer abc def",
  ])("rejects malformed authorization header %p", (header) => {
    expect(() => controller.readBearerToken(header)).toThrow(UnauthorizedError);
  });
});
