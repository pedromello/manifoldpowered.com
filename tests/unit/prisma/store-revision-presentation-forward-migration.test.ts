import fs from "node:fs";
import path from "node:path";
import { storePresentationSchema } from "models/store_presentation";

const migrationPath = path.join(
  process.cwd(),
  "prisma",
  "migrations",
  "20260901140000_normalize_store_revision_presentation",
  "migration.sql",
);
const migrationSql = fs.readFileSync(migrationPath, "utf8");
const statements = migrationSql.replace(/^--.*$/gm, "");

describe("StoreRevision presentation forward migration", () => {
  test("normalizes under a bounded transaction lock so concurrent revisions cannot escape", () => {
    expect(statements).toContain("BEGIN;");
    expect(statements).toContain("SET LOCAL lock_timeout = '10s';");
    expect(statements).toContain("SET LOCAL statement_timeout = '15min';");
    expect(statements).toContain(
      'LOCK TABLE "store_revisions" IN SHARE ROW EXCLUSIVE MODE;',
    );
    expect(statements.trimEnd()).toMatch(/COMMIT;$/);
  });

  test("is forward-only and can mutate only the presentation payload", () => {
    expect(path.basename(path.dirname(migrationPath))).toBe(
      "20260901140000_normalize_store_revision_presentation",
    );
    expect(statements.match(/\bUPDATE\b/gi)).toHaveLength(1);
    expect(statements).toContain('UPDATE "store_revisions" AS revision');
    expect(statements.match(/\bSET\s+"[^"]+"/gi)).toEqual([
      'SET "presentation"',
    ]);
    expect(statements).not.toMatch(
      /\b(?:ALTER|CREATE|INSERT|DELETE|DROP|TRUNCATE|GRANT|REVOKE)\b/i,
    );
    expect(statements).not.toMatch(
      /"(?:stores|sales|users|published_revision_id|last_published_revision_id|catalog_mode|store_revision_id|features)"/,
    );
  });

  test("uses an idempotent write guard and strips superseded keys", () => {
    expect(statements).toContain(
      'revision."presentation" IS DISTINCT FROM normalized."normalized_presentation"',
    );
    expect(statements).toContain("revision.\"presentation\" ->> 'palette_id'");
    expect(statements).toContain(
      "revision.\"presentation\" ->> 'typography_id'",
    );
    expect(statements).toContain("revision.\"presentation\" ->> 'shape_id'");
    expect(statements).toContain("'brand_tokens'");
    expect(statements).not.toMatch(/jsonb_set|\|\|/);
  });

  test("contains the same presentation allow-lists as the runtime contract", () => {
    expect(statements).toContain("IN ('channel', 'editorial', 'community')");
    expect(statements).toContain("IN ('manifold', 'ember', 'ocean')");
    expect(statements).toContain("IN ('modern', 'editorial', 'rounded')");
    expect(statements).toContain("IN ('soft', 'crisp', 'pill')");
    expect(statements).toContain("IN ('neon-alley', 'strategos-void')");
    for (const platform of [
      "website",
      "youtube",
      "twitch",
      "instagram",
      "tiktok",
      "x",
      "discord",
      "bluesky",
    ]) {
      expect(statements).toContain(`'${platform}'`);
    }
  });

  test("documents the original S0 input and a strict classic output", () => {
    const originalS0 = {
      version: 1,
      layout_preset: "EDITORIAL",
      palette_id: "MANIFOLD",
      typography_id: "MANIFOLD",
      shape_id: "MANIFOLD",
      tagline: null,
      cover_image_url: null,
      social_links: {},
      theme_key: null,
    };
    expect(storePresentationSchema.safeParse(originalS0).success).toBe(false);

    const normalized = {
      version: 1,
      layout_preset: null,
      tagline: null,
      cover_image_url: null,
      social_links: {},
      brand_tokens: {
        palette: "manifold",
        typography: "modern",
        shape: "soft",
      },
      theme_key: null,
    };
    expect(storePresentationSchema.parse(normalized)).toEqual(normalized);
  });

  test("the parser accepts the sanitized target and rejects contaminated input", () => {
    const contaminated = {
      version: 99,
      layout_preset: "vibe",
      tagline: "  Curadoria independente  ",
      cover_image_url: "http://images.example.test/cover.png",
      social_links: {
        website: " https://creator.example.test/about ",
        youtube: "http://youtube.example.test/channel",
        unknown: "https://example.test/leak",
      },
      brand_tokens: {
        palette: "neon",
        typography: "comic",
        shape: "blob",
      },
      theme_key: "untrusted-theme",
      private_draft: true,
    };
    expect(storePresentationSchema.safeParse(contaminated).success).toBe(false);

    const sanitized = {
      version: 1,
      layout_preset: null,
      tagline: "Curadoria independente",
      cover_image_url: null,
      social_links: {
        website: "https://creator.example.test/about",
      },
      brand_tokens: {
        palette: "manifold",
        typography: "modern",
        shape: "soft",
      },
      theme_key: null,
    };
    expect(storePresentationSchema.parse(sanitized)).toEqual(sanitized);
  });

  test("a canonical strict payload is already a fixed point", () => {
    const canonical = {
      version: 1,
      layout_preset: "community",
      tagline: "Jogos escolhidos pela comunidade",
      cover_image_url: "https://images.example.test/community.png",
      social_links: {
        website: "https://community.example.test",
        bluesky: "https://bsky.app/profile/community.example.test",
      },
      brand_tokens: {
        palette: "ocean",
        typography: "rounded",
        shape: "pill",
      },
      theme_key: "neon-alley",
    };

    const firstParse = storePresentationSchema.parse(canonical);
    const secondParse = storePresentationSchema.parse(firstParse);
    expect(secondParse).toEqual(firstParse);
  });
});
