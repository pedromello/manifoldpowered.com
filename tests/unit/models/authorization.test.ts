import { User } from "generated/prisma/client";
import { InternalServerError } from "infra/errors";
import authorization from "models/authorization";

describe("models/authorization.ts", () => {
  describe(".can()", () => {
    test("without `user`", () => {
      expect(() => {
        // @ts-expect-error failing types on purpose
        authorization.can();
      }).toThrow(InternalServerError);
    });

    test("without `user.features`", () => {
      expect(() => {
        // @ts-expect-error failing types on purpose
        authorization.can({ id: 1 });
      }).toThrow(InternalServerError);
    });

    test("with unknown `feature`", () => {
      expect(() => {
        // @ts-expect-error failing types on purpose
        authorization.can({ id: 1, features: [] }, "unknown:feature");
      }).toThrow(InternalServerError);
    });

    test("with valid user and known `feature`", () => {
      expect(() => {
        authorization.can({ id: "1", features: [] }, "create:user");
      }).not.toThrow();
    });
  });

  describe(".filterOutput()", () => {
    test("without `user`", () => {
      expect(() => {
        // @ts-expect-error failing types on purpose
        authorization.filterOutput();
      }).toThrow(InternalServerError);
    });

    test("without `user.features`", () => {
      expect(() => {
        // @ts-expect-error failing types on purpose
        authorization.filterOutput({ id: 1 });
      }).toThrow(InternalServerError);
    });

    test("with unknown `feature`", () => {
      expect(() => {
        // @ts-expect-error failing types on purpose
        authorization.filterOutput({ id: 1, features: [] }, "unknown:feature");
      }).toThrow(InternalServerError);
    });

    test("with valid user and known `feature`", () => {
      const createdUser: User = {
        id: "1",
        username: "test",
        email: "[EMAIL_ADDRESS]",
        password: "password",
        features: ["read:user"],
        created_at: new Date(),
        updated_at: new Date(),
      };

      const filteredUser = authorization.filterOutput(
        createdUser,
        "read:user",
        createdUser,
      );

      expect(filteredUser).toEqual({
        id: "1",
        username: "test",
        features: ["read:user"],
        created_at: createdUser.created_at,
        updated_at: createdUser.updated_at,
      });
    });
  });
});
