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

  describe(".storeManagementCapabilities()", () => {
    const activatedFeatures = [...authorization.ACTIVATED_USER_FEATURES];

    test("keeps the owner capability contract aligned across management surfaces", () => {
      const outlet = {
        owner_id: "owner-1",
        members: [],
      } as never;

      expect(
        authorization.storeManagementCapabilities(
          { id: "owner-1", features: activatedFeatures },
          outlet,
        ),
      ).toEqual({
        identity: true,
        curation: true,
        featured: true,
        sales: true,
        earnings: true,
        edit: true,
        publish: true,
        unpublish: true,
      });
    });

    test("gives a statement-only delegate an earnings shell without draft or sales access", () => {
      const delegate = {
        id: "finance-1",
        features: activatedFeatures,
      };
      const outlet = {
        owner_id: "owner-1",
        members: [
          {
            user_id: delegate.id,
            permissions: ["read:store_statement"],
          },
        ],
      } as never;

      expect(
        authorization.storeManagementCapabilities(delegate, outlet),
      ).toEqual({
        identity: false,
        curation: false,
        featured: false,
        sales: false,
        earnings: true,
        edit: false,
        publish: false,
        unpublish: false,
      });
      expect(authorization.canReadStoreDraft(delegate, outlet)).toBe(false);
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

    test("store follow output exposes only the requester-specific boolean", () => {
      const requester: Partial<User> = {
        id: "player-1",
        features: ["read:store_follow_status"],
      };

      expect(
        authorization.filterOutput(requester, "read:store_follow_status", {
          is_followed: true,
          user_id: "player-1",
          follower_count: 42,
        }),
      ).toEqual({ is_followed: true });
    });

    test("never upgrades a raw or draft Store into a public revision projection", () => {
      const rawStore = {
        id: "store-1",
        slug: "private-draft",
        name: "Private draft",
        description: null,
        logo_url: null,
        owner_id: "owner-1",
        status: "DRAFT",
        catalog_mode: "UNDECIDED",
        draft_revision: 1,
        published_revision_id: null,
        last_published_revision_id: null,
        published_at: null,
        last_published_at: null,
        theme_key: null,
        layout_preset: null,
        tagline: null,
        cover_url: null,
        social_links: {},
        brand_tokens: {
          palette: "manifold",
          typography: "modern",
          shape: "soft",
        },
        commission_rate: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      expect(() =>
        authorization.filterOutput(
          { id: "visitor", features: ["read:public_store"] },
          "read:public_store",
          rawStore,
        ),
      ).toThrow(InternalServerError);

      expect(() =>
        authorization.filterOutput(
          { id: "visitor", features: ["read:public_store"] },
          "read:public_store",
          {
            ...rawStore,
            status: "PUBLISHED",
            published_at: new Date(),
            storefront_source: "REVISION",
            published_revision: null,
          },
        ),
      ).toThrow(InternalServerError);
    });
  });

  describe("Outlet follow features", () => {
    test("activated users can list, follow, unfollow and read their status", () => {
      expect(authorization.ACTIVATED_USER_FEATURES).toEqual(
        expect.arrayContaining([
          "create:store_follow",
          "read:store_follow",
          "delete:store_follow",
          "read:store_follow_status",
        ]),
      );
    });

    test("anonymous users can read status but cannot list or mutate follows", () => {
      expect(authorization.ANONYMOUS_USER_FEATURES).toContain(
        "read:store_follow_status",
      );
      expect(authorization.ANONYMOUS_USER_FEATURES).not.toContain(
        "read:store_follow",
      );
      expect(authorization.ANONYMOUS_USER_FEATURES).not.toContain(
        "create:store_follow",
      );
      expect(authorization.ANONYMOUS_USER_FEATURES).not.toContain(
        "delete:store_follow",
      );
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

  describe(".DISABLED_USER_FEATURES", () => {
    test("is a strict subset of ANONYMOUS_USER_FEATURES", () => {
      for (const feature of authorization.DISABLED_USER_FEATURES) {
        expect(authorization.ANONYMOUS_USER_FEATURES).toContain(feature);
      }
      expect(authorization.DISABLED_USER_FEATURES.length).toBeLessThan(
        authorization.ANONYMOUS_USER_FEATURES.length,
      );
    });

    test("excludes session/account-bootstrap features so a disabled user can't log back in or sign up again", () => {
      expect(authorization.DISABLED_USER_FEATURES).not.toContain(
        "create:session",
      );
      expect(authorization.DISABLED_USER_FEATURES).not.toContain("create:otp");
      expect(authorization.DISABLED_USER_FEATURES).not.toContain("create:user");
      expect(authorization.DISABLED_USER_FEATURES).not.toContain(
        "read:activation_token",
      );
    });

    test("still allows public read access, same as an anonymous visitor", () => {
      expect(authorization.DISABLED_USER_FEATURES).toContain(
        "read:public_game",
      );
      expect(authorization.DISABLED_USER_FEATURES).toContain(
        "read:public_store",
      );
      expect(authorization.DISABLED_USER_FEATURES).toContain(
        "read:public_studio",
      );
    });
  });
});
