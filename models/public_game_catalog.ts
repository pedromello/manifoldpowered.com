import { z } from "zod";
import type { Game } from "generated/prisma/client";
import { prisma } from "infra/database";
import { ValidationError } from "infra/errors";
import authorization from "models/authorization";
import game from "models/game";
import gameLocalization from "models/game_localization";
import type { AppLocale } from "lib/locale";

import review from "models/review";
import { NotFoundError } from "infra/errors";
import { projectCatalogMedia } from "lib/public-catalog-media";
import {
  catalogSearchSchema,
  catalogDetailSchema,
  catalogReviewsSchema,
  catalogGameSchema,
  catalogSearchResultSchema,
  catalogDetailResultSchema,
  catalogReviewsResultSchema,
  catalogReviewSchema,
} from "contracts/public-game-catalog";
export * from "contracts/public-game-catalog";

const publicFieldsSchema = z.object({
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  media: z.unknown(),
  positive_reviews: z.number(),
  negative_reviews: z.number(),
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
    description: plainCatalogText(fields.description, 600),
    media: projectCatalogMedia(fields.media),
    review_summary: {
      total: fields.positive_reviews + fields.negative_reviews,
      positive: fields.positive_reviews,
      negative: fields.negative_reviews,
      source: "catalog_counters",
    },
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
    locale: query.locale,
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
  return catalogDetailResultSchema.parse({
    game: projected,
    locale: query.locale,
  });
}

async function findReviews(input: unknown) {
  const query = validateInput(catalogReviewsSchema, input);
  const detail = await findBySlug({ slug: query.slug, locale: query.locale });
  if (!detail) return null;
  try {
    const result = await review.getPaginatedReviewsBySlug(
      query.slug,
      query.page,
      query.limit,
      undefined,
      {
        recommended:
          query.recommendation === "all"
            ? undefined
            : query.recommendation === "positive",
        order: query.sort === "newest" ? "desc" : "asc",
      },
    );
    // Re-read visibility after the domain query; never forward viewer fields.
    if (!(await findBySlug({ slug: query.slug, locale: query.locale })))
      return null;
    const reviews = result.reviews.map((record) => {
      const view = authorization.filterOutput(
        { features: authorization.ANONYMOUS_USER_FEATURES },
        "read:review",
        record,
      ) as {
        id: string;
        message: string;
        recommended: boolean;
        created_at: Date;
        updated_at: Date;
      };
      return catalogReviewSchema.parse({
        reference: view.id,
        message: plainCatalogText(view.message, 3000),
        recommended: view.recommended,
        created_at: view.created_at.toISOString(),
        updated_at: view.updated_at.toISOString(),
      });
    });
    return catalogReviewsResultSchema.parse({
      ...detail,
      reviews,
      pagination: {
        page: query.page,
        limit: query.limit,
        total: result.pagination.total_items,
        pages: result.pagination.total_pages,
      },
      sample: {
        returned: reviews.length,
        recommendation: query.recommendation,
        sort: query.sort,
      },
    });
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }
}

const publicGameCatalog = { search, findBySlug, findReviews };
export default publicGameCatalog;
