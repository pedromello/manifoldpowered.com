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

    test("with `read:user:any`, includes email regardless of who's asking", () => {
      const targetUser: User = {
        id: "1",
        username: "test",
        email: "test@example.com",
        password: "password",
        features: ["read:activation_token"],
        created_at: new Date(),
        updated_at: new Date(),
      };
      const admin: Partial<User> = { id: "2", features: ["read:user:any"] };

      const filteredUser = authorization.filterOutput(
        admin,
        "read:user:any",
        targetUser,
      );

      expect(filteredUser).toEqual({
        id: "1",
        username: "test",
        email: "test@example.com",
        features: ["read:activation_token"],
        created_at: targetUser.created_at,
        updated_at: targetUser.updated_at,
      });
    });
  });

  describe(".ADMIN_ONLY_FEATURES / .ADMIN_FEATURES", () => {
    test("every admin-only feature is registered and grantable via `can()`", () => {
      for (const feature of authorization.ADMIN_ONLY_FEATURES) {
        expect(() => {
          authorization.can({ id: "1", features: [feature] }, feature);
        }).not.toThrow();
        expect(
          authorization.can({ id: "1", features: [feature] }, feature),
        ).toBe(true);
      }
    });

    test("ADMIN_FEATURES is the activated-user set plus the admin-only set, with no duplicates", () => {
      expect(authorization.ADMIN_FEATURES).toEqual([
        ...authorization.ACTIVATED_USER_FEATURES,
        ...authorization.ADMIN_ONLY_FEATURES,
      ]);
      expect(new Set(authorization.ADMIN_FEATURES).size).toBe(
        authorization.ADMIN_FEATURES.length,
      );
    });
  });
});
