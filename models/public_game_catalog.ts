import { z } from "zod";
import type { Game } from "generated/prisma/client";
import { prisma } from "infra/database";
import { ValidationError } from "infra/errors";
import authorization from "models/authorization";
import game from "models/game";
import gameLocalization from "models/game_localization";
import type { AppLocale } from "lib/locale";

export const catalogSearchSchema = z
  .object({
    q: z.string().trim().max(200).default(""),
    tags: z.array(z.string().trim().min(1).max(64)).max(5).optional(),
    page: z.number().int().min(1).max(100).default(1),
    limit: z.number().int().min(1).max(20).default(10),
    locale: z.enum(["en", "pt-BR"]).default("pt-BR"),
  })
  .strict();

export const catalogDetailSchema = z
  .object({
    slug: z.string().trim().min(1).max(255),
    locale: z.enum(["en", "pt-BR"]).default("pt-BR"),
  })
  .strict();

export const catalogGameSchema = z
  .object({
    slug: z.string(),
    title: z.string().max(255),
    tags: z.array(z.string().max(64)).max(10),
    launch_date: z.iso.datetime().nullable(),
  })
  .strict();

export const catalogSearchResultSchema = z
  .object({
    games: z.array(catalogGameSchema),
    pagination: z
      .object({
        page: z.number().int(),
        limit: z.number().int(),
        total: z.number().int(),
        pages: z.number().int(),
      })
      .strict(),
  })
  .strict();

export const catalogDetailResultSchema = z
  .object({ game: catalogGameSchema })
  .strict();

const publicFieldsSchema = z.object({
  slug: z.string(),
  title: z.string(),
  tags: z.array(z.string()),
  launch_date: z.date().nullable(),
});

function validateInput<T extends z.ZodType>(schema: T, input: unknown) {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ValidationError({
      message: "Invalid public catalog arguments",
      action: "Check the tool's input schema",
      context: result.error.issues,
    });
  }
  return result.data;
}

function plainCatalogText(text: string, limit: number) {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/(?:https?:\/\/|www\.)\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function projectGame(record: Game) {
  const publicView = authorization.filterOutput(
    { features: authorization.ANONYMOUS_USER_FEATURES },
    "read:public_game",
    record,
  );
  // Strip the site's commercial projection before either MCP result channel.
  const fields = publicFieldsSchema.parse(publicView);
  return catalogGameSchema.parse({
    slug: fields.slug,
    title: plainCatalogText(fields.title, 255),
    tags: fields.tags
      .slice(0, 10)
      .map((tag) => plainCatalogText(tag, 64))
      .filter(Boolean),
    launch_date: fields.launch_date?.toISOString() ?? null,
  });
}

async function projectGames(records: Game[], locale: AppLocale) {
  const localizations = await gameLocalization.forGames(
    records.map((record) => record.id),
    locale,
  );
  return records.map((record) =>
    projectGame(gameLocalization.apply(record, localizations.get(record.id))),
  );
}

async function search(input: unknown) {
  const query = validateInput(catalogSearchSchema, input);
  const result = await game.findAllPaginated({ ...query, order: "newest" });
  const games = await projectGames(result.games, query.locale);
  return catalogSearchResultSchema.parse({
    games,
    pagination: result.pagination,
  });
}

async function findBySlug(input: unknown) {
  const query = validateInput(catalogDetailSchema, input);
  // The existing findOnePublicBySlug does not restrict status.
  const record = await prisma.game.findFirst({
    where: { slug: query.slug, status: { in: ["ACTIVE", "ONLY_DISPLAY"] } },
  });
  if (!record) return null;
  const [projected] = await projectGames([record], query.locale);
  return catalogDetailResultSchema.parse({ game: projected });
}

const publicGameCatalog = { search, findBySlug };
export default publicGameCatalog;
