import { userSchema, userUpdateSchema } from "contracts/creator-requests";

describe("public user identity inputs", () => {
  test.each([
    "id",
    "features",
    "verified_email",
    "email_verified_at",
    "email_version",
    "created_at",
    "updated_at",
  ])("rejects protected field %s on signup and updates", (field) => {
    expect(
      userSchema.safeParse({
        username: "player",
        email: "player@example.com",
        password: null,
        [field]: "injected",
      }).success,
    ).toBe(false);
    expect(userUpdateSchema.safeParse({ [field]: "injected" }).success).toBe(
      false,
    );
  });

  test("normalizes an address update before comparing identity", () => {
    expect(userUpdateSchema.parse({ email: "  Player@Example.com  " })).toEqual(
      { email: "player@example.com" },
    );
  });
});
