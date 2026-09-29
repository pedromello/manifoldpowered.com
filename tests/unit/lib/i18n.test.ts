import fs from "node:fs";
import path from "node:path";

import { ptBR } from "lib/i18n/pt-BR";

const SOURCE_ROOTS = ["pages", "components", "storefronts"];

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (entryPath === path.join(process.cwd(), "pages", "api")) return [];
      return sourceFiles(entryPath);
    }

    return /\.(?:ts|tsx)$/.test(entry.name) ? [entryPath] : [];
  });
}

function literalTranslationKeys() {
  const keys = new Set<string>();

  for (const root of SOURCE_ROOTS) {
    for (const file of sourceFiles(path.join(process.cwd(), root))) {
      const source = fs.readFileSync(file, "utf8");
      const matches = source.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)*)"/g);

      for (const match of matches) {
        keys.add(match[1].replaceAll('\\"', '"'));
      }

      for (const call of source.matchAll(/\btranslateError\(([\s\S]*?)\)/g)) {
        for (const match of call[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
          keys.add(match[1].replaceAll('\\"', '"'));
        }
      }
    }
  }

  return [...keys];
}

// These messages are intentionally stored in data arrays and passed to t()
// dynamically. Keeping them here makes their translation requirement explicit.
const DYNAMIC_TRANSLATION_KEYS = [
  "Action",
  "Active",
  "All",
  "All currencies",
  "Automatic",
  "Bulk",
  "Creators",
  "Curation",
  "Dashboard",
  "Deselect {title}",
  "Developers",
  "Disabled",
  "Disabled currencies",
  "Enabled",
  "Enabled currencies",
  "Featured",
  "Following",
  "For You",
  "Games",
  "Horror",
  "Hide {count} selected games",
  "Hide games tagged {tag}",
  "Hidden",
  "Inactive",
  "Indie",
  "Last 30 days",
  "Last 7 days",
  "Manual",
  "Manual choice",
  "Advanced rule",
  "Full catalog",
  "Mixed",
  "Mostly Negative",
  "Mostly Positive",
  "My Outlets",
  "My Studios",
  "Negative",
  "Newest First",
  "No Reviews",
  "Oldest First",
  "Overview",
  "Outlets",
  "Overwhelmingly Negative",
  "Overwhelmingly Positive",
  "Pending",
  "Players",
  "Positive",
  "RPG",
  "Racing",
  "Rates",
  "Revenue",
  "Sales",
  "Settings",
  "Identity",
  "Select {title}",
  "Show {count} selected games",
  "Show games tagged {tag}",
  "Shown",
  "Simulation",
  "Strategy",
  "Studios",
  "Title (A-Z)",
  "Very Negative",
  "Very Positive",
  "The selected games are now hidden from your Outlet.",
  "The selected games are now shown in your Outlet.",
  "Your Games",
  "Your games",
] as const;

function placeholders(message: string) {
  return [...message.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
}

describe("i18n catalog", () => {
  test("translates the creator workspace navigation exactly", () => {
    expect(ptBR).toMatchObject({
      Overview: "Visão geral",
      Identity: "Identidade",
      "Your games": "Seus jogos",
    });
  });

  test("every literal UI message has a pt-BR translation", () => {
    const missing = literalTranslationKeys().filter(
      (message) => !Object.prototype.hasOwnProperty.call(ptBR, message),
    );

    expect(missing).toEqual([]);
  });

  test("dynamic UI messages have pt-BR translations", () => {
    const missing = DYNAMIC_TRANSLATION_KEYS.filter(
      (message) => !Object.prototype.hasOwnProperty.call(ptBR, message),
    );

    expect(missing).toEqual([]);
  });

  test("translations preserve interpolation placeholders", () => {
    const invalid = Object.entries(ptBR)
      .filter(
        ([source, translation]) =>
          placeholders(source).join(",") !==
          placeholders(translation).join(","),
      )
      .map(([source]) => source);

    expect(invalid).toEqual([]);
  });

  test("uses masculine articles and contractions for Manifold in pt-BR", () => {
    const feminineManifold = /\b(?:a|da|na|pela)\s+Manifold\b|à\s+Manifold\b/i;
    const invalid = Object.values(ptBR).filter((translation) =>
      feminineManifold.test(translation),
    );

    expect(invalid).toEqual([]);
  });

  test.each(["Manifold", "Outlet", "Studio"])(
    "keeps the protected name %s when it appears in source copy",
    (protectedName) => {
      const invalid = Object.entries(ptBR)
        .filter(
          ([source, translation]) =>
            source.includes(protectedName) &&
            !translation.includes(protectedName),
        )
        .map(([source]) => source);

      expect(invalid).toEqual([]);
    },
  );

  test("uses masculine articles for Manifold in pt-BR copy", () => {
    const feminineArticle = /\b(?:a|à|da|na|pela|uma)\s+Manifold\b/i;
    const invalid = Object.entries(ptBR)
      .filter(([, translation]) => feminineArticle.test(translation))
      .map(([source]) => source);

    expect(invalid).toEqual([]);
  });
});
