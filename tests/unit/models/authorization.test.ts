import { Prisma, Store, StoreRevision, User } from "generated/prisma/client";
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

    test("keeps Outlet identity and publication owner-only", () => {
      const resource = {
        owner_id: "owner-1",
        members: [
          {
            user_id: "member-1",
            permissions: ["update:store", "update:store_presentation"],
          },
        ],
      };

      expect(
        authorization.can(
          { id: "owner-1", features: ["update:store_presentation"] },
          "update:store_presentation",
          resource,
        ),
      ).toBe(true);
      expect(
        authorization.can(
          { id: "owner-1", features: ["publish:store"] },
          "publish:store",
          resource,
        ),
      ).toBe(true);
      expect(
        authorization.can(
          { id: "member-1", features: ["update:store_presentation"] },
          "update:store_presentation",
          resource,
        ),
      ).toBe(false);
      expect(
        authorization.can(
          { id: "member-1", features: ["update:store"] },
          "read:store_preview",
          resource,
        ),
      ).toBe(true);
      expect(
        authorization.can(
          { id: "admin", features: ["publish:store:any"] },
          "publish:store",
          resource,
        ),
      ).toBe(true);
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

    test("public store output includes safe presentation data but not commercial terms", () => {
      const now = new Date();
      const store: Store = {
        id: "store-1",
        slug: "creator-outlet",
        name: "Creator Outlet",
        description: "A creator bio",
        logo_url: "https://cdn.example.com/logo.png",
        owner_id: "owner-1",
        theme_key: null,
        layout_preset: "editorial",
        tagline: "Indies with a point of view",
        cover_url: "https://cdn.example.com/cover.jpg",
        social_links: { youtube: "https://youtube.com/@creator" },
        brand_tokens: {
          palette: "ocean",
          typography: "editorial",
          shape: "crisp",
        },
        publication_status: "PUBLISHED",
        published_revision_id: "revision-1",
        published_at: now,
        draft_revision: 1,
        commission_rate: new Prisma.Decimal("0.25"),
        created_at: now,
        updated_at: now,
      };

      const output = authorization.filterOutput(
        { id: "visitor", features: ["read:public_store"] },
        "read:public_store",
        store,
      );

      expect(output).toEqual({
        id: "store-1",
        slug: "creator-outlet",
        name: "Creator Outlet",
        description: "A creator bio",
        logo_url: "https://cdn.example.com/logo.png",
        owner_id: "owner-1",
        theme_key: null,
        layout_preset: "editorial",
        tagline: "Indies with a point of view",
        cover_url: "https://cdn.example.com/cover.jpg",
        social_links: { youtube: "https://youtube.com/@creator" },
        brand_tokens: {
          palette: "ocean",
          typography: "editorial",
          shape: "crisp",
        },
        publication_status: "PUBLISHED",
        published_at: now,
        created_at: now,
        updated_at: now,
      });
      expect(output).not.toHaveProperty("commission_rate");
      expect(output).not.toHaveProperty("draft_revision");
      expect(output).not.toHaveProperty("has_unpublished_changes");
    });

    test("admin store output keeps presentation data alongside commission", () => {
      const now = new Date();
      const store = {
        id: "store-1",
        slug: "bespoke-outlet",
        name: "Bespoke Outlet",
        description: null,
        logo_url: null,
        owner_id: "owner-1",
        theme_key: "neon-alley",
        layout_preset: "channel",
        tagline: null,
        cover_url: null,
        social_links: {},
        brand_tokens: {
          palette: "manifold",
          typography: "modern",
          shape: "soft",
        },
        publication_status: "PUBLISHED",
        published_revision_id: "revision-1",
        published_at: now,
        draft_revision: 1,
        commission_rate: new Prisma.Decimal("0.125"),
        created_at: now,
        updated_at: now,
      } satisfies Store;

      expect(
        authorization.filterOutput(
          { id: "admin", features: ["read:store:any"] },
          "read:store:any",
          store,
        ),
      ).toEqual(
        expect.objectContaining({
          theme_key: "neon-alley",
          layout_preset: "channel",
          brand_tokens: store.brand_tokens,
          commission_rate: "0.12500000",
        }),
      );
    });

    test("management output compares the draft with the published revision", () => {
      const now = new Date();
      const store = {
        id: "store-1",
        slug: "clean-outlet",
        name: "Clean Outlet",
        description: null,
        logo_url: null,
        owner_id: "owner-1",
        theme_key: null,
        layout_preset: "channel",
        tagline: null,
        cover_url: null,
        social_links: {},
        brand_tokens: {
          palette: "manifold",
          typography: "modern",
          shape: "soft",
        },
        publication_status: "PUBLISHED",
        published_revision_id: "revision-1",
        published_at: now,
        draft_revision: 1,
        commission_rate: null,
        created_at: now,
        updated_at: now,
      } satisfies Store;
      const publishedRevision = {
        id: "revision-1",
        store_id: store.id,
        revision_number: 1,
        source_draft_revision: 1,
        created_by: store.owner_id,
        name: store.name,
        description: store.description,
        logo_url: store.logo_url,
        theme_key: store.theme_key,
        layout_preset: store.layout_preset,
        tagline: store.tagline,
        cover_url: store.cover_url,
        social_links: store.social_links,
        brand_tokens: store.brand_tokens,
        curation_strategy: "NONE",
        featured_games: [],
        tag_filters: [],
        game_overrides: [],
        created_at: now,
      } satisfies StoreRevision;

      const cleanOutput = authorization.filterOutput(
        { id: store.owner_id, features: ["update:store_presentation"] },
        "update:store_presentation",
        { ...store, published_revision: publishedRevision },
      );
      expect(cleanOutput).toMatchObject({
        draft_revision: 1,
        has_unpublished_changes: false,
      });

      const dirtyOutput = authorization.filterOutput(
        { id: store.owner_id, features: ["update:store_presentation"] },
        "update:store_presentation",
        { ...store, tagline: "Changed", published_revision: publishedRevision },
      );
      expect(dirtyOutput).toMatchObject({ has_unpublished_changes: true });
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
