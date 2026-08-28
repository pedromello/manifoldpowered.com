import { prisma } from "infra/database";
import { z } from "zod";
import { NotFoundError, ValidationError } from "infra/errors";
import { GameStatus, Prisma, ReviewScore } from "generated/prisma/client";
import studioModel from "models/studio";
import steamInfra, { SteamAppDetailsData } from "infra/steam";

export const gameSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().min(1).max(300),
  detailed_description: z.string().min(1),
  launch_date: z.iso.datetime(),
  price: z.coerce.number().min(0).max(1000000),
  base_price: z.coerce.number().min(0).max(1000000).optional(),
  // developer_name/publisher_name are not client input: they are derived from
  // studio_id/publisher_id (see create()) and denormalized onto the game.
  studio_id: z.uuid(),
  publisher_id: z.uuid().optional(),
  // Set only by the Steam import flow (models/game.ts's buildGameDataFromSteam).
  // Immutable after creation — omitted from update()'s schema below.
  steam_app_id: z
    .string()
    .regex(/^[1-9]\d*$/, "steam_app_id must be a positive integer string")
    .optional(),
  tags: z.array(z.string()).default([]),
  meta_tags: z
    .object({
      category: z.string().optional(),
      rating: z.string().optional(),
      languages: z.array(z.string()).optional(),
      keywords: z.array(z.string()).optional(),
      platforms: z.array(z.string()).optional(),
    })
    .default({}),
  media: z
    .object({
      banner: z.url().optional(),
      screenshots: z.array(z.url()).default([]),
      icon: z.url().optional(),
      videos: z.array(z.url()).default([]),
    })
    .default({
      screenshots: [],
      videos: [],
    }),
  social_links: z
    .object({
      website: z.url().optional(),
      twitter: z.url().optional(),
      discord: z.url().optional(),
      steam_page: z.url().optional(),
    })
    .default({}),
  requirements: z
    .object({
      minimum: z.object({
        os: z.string(),
        processor: z.string(),
        memory: z.string(),
        graphics: z.string(),
        storage: z.string(),
      }),
      recommended: z
        .object({
          os: z.string(),
          processor: z.string(),
          memory: z.string(),
          graphics: z.string(),
          storage: z.string(),
        })
        .optional(),
    })
    .optional(),
});

export type GameCreateDto = z.infer<typeof gameSchema>;

export const steamImportedGameSchema = gameSchema
  .omit({
    studio_id: true,
    publisher_id: true,
  })
  .extend({
    developer_name: z.string().trim().min(1).max(255),
    publisher_name: z.string().trim().min(1).max(255).nullable(),
    steam_price: z.coerce.number().min(0).max(1000000).nullable(),
    steam_original_price: z.coerce.number().min(0).max(1000000).nullable(),
    steam_discount_percent: z.coerce.number().int().min(0).max(100).nullable(),
    steam_price_currency: z.string().length(3).nullable(),
    steam_price_captured_at: z.date(),
  });
export type SteamImportedGameData = z.infer<typeof steamImportedGameSchema>;

export interface SteamExternalOfferInput {
  provider: "STEAM";
  country: "US" | "BR";
  currency: string;
  amount: number | null;
  original_amount: number | null;
  discount_percent: number | null;
  captured_at: Date;
  url: string;
}

export const gameOrderValues = [
  "newest",
  "oldest",
  "price_asc",
  "price_desc",
  "title_asc",
] as const;

// `sort_by` is kept as an alias of `order` (rather than a rename) because
// the /search frontend page already reads and writes `order` query params.
export const gameQuerySchema = z
  .object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
    order: z.enum(gameOrderValues).optional(),
    sort_by: z.enum(gameOrderValues).optional(),
    tags: z
      .string()
      .transform((s) => s.split(","))
      .optional(),
    q: z.string().optional(),
    min_price: z.coerce.number().min(0).optional(),
    max_price: z.coerce.number().min(0).optional(),
  })
  .refine(
    (data) =>
      !(
        data.min_price !== undefined &&
        data.max_price !== undefined &&
        data.min_price > data.max_price
      ),
    {
      message: "min_price must not be greater than max_price",
      path: ["min_price"],
    },
  );

export const gameStatusValues = [
  "ACTIVE",
  "ONLY_DISPLAY",
  "INACTIVE",
  "PRIVATE",
] as const;

export const gameAdminQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  status: z.enum(gameStatusValues).optional(),
  studio_id: z.uuid().optional(),
  q: z.string().optional(),
});

// `reason` is required whenever a game is being taken off (or kept off) the
// public storefront — an admin approving a game doesn't owe anyone an
// explanation, but rejecting/hiding one does.
export const gameStatusUpdateSchema = z
  .object({
    status: z.enum(gameStatusValues),
    reason: z.string().min(1).max(1000).optional(),
  })
  .refine((data) => data.status === "ACTIVE" || !!data.reason, {
    message: "reason is required when moving a game to PRIVATE or INACTIVE",
    path: ["reason"],
  });

async function create(gameData: GameCreateDto) {
  const slug = generateSlug(gameData.title);
  await validateUniqueSlug(slug);

  if (gameData.media.videos.length > 0) {
    await validateVideoUrls(gameData.media.videos);
  }

  // Self-validating regardless of caller: resolve and denormalize the
  // developer/publisher names from their studios here, rather than trusting
  // the route handler to have already done it.
  const developerStudio = await studioModel.findOneById(gameData.studio_id);

  let publisherStudio = developerStudio;
  if (gameData.publisher_id) {
    publisherStudio = await studioModel.findOneById(gameData.publisher_id);
    if (!publisherStudio.is_publisher) {
      throw new ValidationError({
        message: `Studio "${publisherStudio.name}" is not marked as a publisher.`,
        action:
          "Choose a studio with is_publisher enabled, or omit publisher_id to self-publish.",
      });
    }
  }

  return await prisma.game.create({
    data: {
      ...gameData,
      developer_name: developerStudio.name,
      publisher_name: publisherStudio.name,
      slug,
      // A new game has no prior price, so base_price starts equal to price.
      base_price: gameData.price,
      launch_date: new Date(gameData.launch_date),
      meta_tags: gameData.meta_tags || {},
      media: gameData.media || {},
      social_links: gameData.social_links || {},
      requirements: gameData.requirements || {},
    },
  });
}

async function createUnclaimedSteamGame(
  gameData: SteamImportedGameData,
  externalOffers: SteamExternalOfferInput[] = [],
) {
  const slug = generateSlug(gameData.title);
  await validateUniqueSlug(slug);

  if (gameData.media.videos.length > 0) {
    await validateVideoUrls(gameData.media.videos);
  }

  return await prisma.game.create({
    data: {
      ...gameData,
      studio_id: null,
      publisher_id: null,
      slug,
      status: "ONLY_DISPLAY",
      external_offers: { create: externalOffers },
      // `price` is a local platform price. A community import has no local
      // offer, so the Steam amount is persisted only in the steam_* fields.
      price: 0,
      base_price: null,
      launch_date: new Date(gameData.launch_date),
      meta_tags: gameData.meta_tags || {},
      media: gameData.media || {},
      social_links: gameData.social_links || {},
      requirements: gameData.requirements || {},
    },
  });
}

async function refreshUnclaimedSteamGame(
  id: string,
  gameData: SteamImportedGameData,
  externalOffers: SteamExternalOfferInput[],
) {
  if (gameData.media.videos.length > 0) {
    await validateVideoUrls(gameData.media.videos);
  }

  const refreshData = steamImportedGameSchema
    .omit({ steam_app_id: true, price: true, base_price: true })
    .parse(gameData);

  return prisma.$transaction(async (tx) => {
    const updatedGame = await tx.game.update({
      where: { id, status: "ONLY_DISPLAY" },
      data: {
        ...refreshData,
        launch_date: new Date(refreshData.launch_date),
        meta_tags: refreshData.meta_tags || {},
        media: refreshData.media || {},
        social_links: refreshData.social_links || {},
        requirements: refreshData.requirements || {},
      },
    });

    for (const offer of externalOffers) {
      await tx.gameExternalOffer.upsert({
        where: {
          game_id_provider_country: {
            game_id: id,
            provider: offer.provider,
            country: offer.country,
          },
        },
        create: { ...offer, game_id: id },
        update: offer,
      });
    }

    return updatedGame;
  });
}

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/--+/g, "-")
    .trim();
}

async function validateUniqueSlug(slug: string) {
  const existingGame = await prisma.game.findUnique({
    where: {
      slug,
    },
    select: {
      title: true,
      slug: true,
    },
  });

  if (existingGame) {
    throw new ValidationError({
      message: `Game with slug ${existingGame.slug} already exists. It's title is ${existingGame.title}.`,
      action: "Try a different title.",
    });
  }
}

function validateVideoUrl(url: string) {
  try {
    const videoUrl = new URL(url);
    const allowedHosts = ["www.youtube.com", "youtube.com", "youtu.be"];
    const isSteamCdnHost = videoUrl.hostname.endsWith(".steamstatic.com");

    if (!allowedHosts.includes(videoUrl.hostname) && !isSteamCdnHost) {
      throw new Error("Invalid video host");
    }
  } catch (error) {
    throw new ValidationError({
      message: `Invalid video URL: ${url}. Videos must be a valid URL hosted on YouTube or Steam.`,
      cause: error,
      action: "Check if video URL is valid and from YouTube or Steam.",
    });
  }
}

function validateVideoUrls(urls: string[]) {
  for (const url of urls) {
    validateVideoUrl(url);
  }
}

async function findOneBySteamAppId(steamAppId: string) {
  return await prisma.game.findUnique({
    where: {
      steam_app_id: steamAppId,
    },
  });
}

async function findOneBySteamAppIdWithStudio(steamAppId: string) {
  const gameResource = await findOneBySteamAppId(steamAppId);

  if (!gameResource) {
    return null;
  }

  const studioWithMembers = gameResource.studio_id
    ? await studioModel.findOneByIdWithMembers(gameResource.studio_id)
    : null;

  return { ...gameResource, studio: studioWithMembers };
}

async function buildGameDataFromSteam(
  steamAppId: string,
): Promise<SteamImportedGameData> {
  const result = await steamInfra.fetchAppDetails(steamAppId);

  if (!result?.success || !result.data) {
    throw new NotFoundError({
      message: `Steam app with id "${steamAppId}" was not found or is not available.`,
      action: "Check the Steam app id or store link and try again.",
    });
  }

  return mapSteamAppToGameData(result.data, steamAppId);
}

export function mapSteamAppToGameData(
  steamGame: SteamAppDetailsData,
  steamAppId: string,
): SteamImportedGameData {
  const steamPriceCents = steamGame.is_free
    ? 0
    : steamGame.price_overview?.final;
  const steamPrice =
    steamPriceCents === undefined ? null : steamPriceCents / 100;
  const steamOriginalPriceCents = steamGame.is_free
    ? 0
    : steamGame.price_overview?.initial;
  const steamOriginalPrice =
    steamOriginalPriceCents === undefined
      ? null
      : steamOriginalPriceCents / 100;
  const steamDiscountPercent =
    steamGame.price_overview?.discount_percent ??
    (steamOriginalPriceCents &&
    steamPriceCents !== undefined &&
    steamPriceCents < steamOriginalPriceCents
      ? Math.round(
          ((steamOriginalPriceCents - steamPriceCents) /
            steamOriginalPriceCents) *
            100,
        )
      : 0);

  const genreTags = (steamGame.genres ?? []).map((g) => g.description);
  const categoryTags = (steamGame.categories ?? []).map((c) => c.description);
  const tags = Array.from(new Set([...genreTags, ...categoryTags]));

  const platforms = Object.entries(steamGame.platforms ?? {})
    .filter(([, supported]) => supported)
    .map(([platform]) => platform);

  const languages = parseSupportedLanguages(steamGame.supported_languages);
  const website = isValidUrl(steamGame.website) ? steamGame.website : undefined;
  const developers = normalizeSteamNames(steamGame.developers);
  const publishers = normalizeSteamNames(steamGame.publishers);
  const developerName =
    (developers.length ? developers : publishers).join(", ").slice(0, 255) ||
    "Unknown developer";
  const publisherName = publishers.join(", ").slice(0, 255) || null;

  return {
    title: steamGame.name,
    description: (steamGame.short_description || steamGame.name).slice(0, 300),
    detailed_description:
      steamGame.detailed_description ||
      steamGame.about_the_game ||
      steamGame.name,
    developer_name: developerName,
    publisher_name: publisherName,
    launch_date: parseSteamReleaseDate(steamGame.release_date),
    // Required legacy local-price column. createUnclaimedSteamGame overrides
    // this to zero; the external amount below is the value exposed to users.
    price: 0,
    steam_price: steamPrice,
    steam_original_price: steamOriginalPrice,
    steam_discount_percent: steamDiscountPercent,
    steam_price_currency: steamGame.price_overview?.currency ?? null,
    steam_price_captured_at: new Date(),
    tags,
    meta_tags: {
      category: steamGame.genres?.[0]?.description,
      rating: toAgeRatingLabel(steamGame.required_age),
      languages,
      platforms,
    },
    media: {
      banner: steamGame.header_image,
      screenshots: (steamGame.screenshots ?? []).map((s) => s.path_full),
      icon: steamGame.capsule_image,
      videos: extractSteamTrailerUrls(steamGame.movies),
    },
    social_links: {
      website,
      steam_page: `https://store.steampowered.com/app/${steamAppId}/`,
    },
    steam_app_id: steamAppId,
  };
}

function normalizeSteamNames(names?: string[]): string[] {
  return Array.from(
    new Set((names ?? []).map((name) => name.trim()).filter(Boolean)),
  );
}

function extractSteamTrailerUrls(
  movies?: SteamAppDetailsData["movies"],
): string[] {
  return (movies ?? [])
    .map(
      (movie) =>
        movie.mp4?.max ||
        movie.mp4?.["480"] ||
        movie.webm?.max ||
        movie.webm?.["480"] ||
        movie.hls_h264,
    )
    .filter((url): url is string => Boolean(url));
}

function parseSteamReleaseDate(releaseDate?: {
  coming_soon: boolean;
  date: string;
}): string {
  if (releaseDate && !releaseDate.coming_soon && releaseDate.date) {
    const parsed = new Date(releaseDate.date);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return new Date().toISOString();
}

function toAgeRatingLabel(requiredAge?: number | string): string | undefined {
  const age = Number(requiredAge);
  return age > 0 ? `${age}+` : undefined;
}

function parseSupportedLanguages(raw?: string): string[] | undefined {
  if (!raw) return undefined;
  const withoutTags = raw.replace(/<[^>]*>/g, "");
  const languages = withoutTags
    .split(",")
    .map((language) => language.trim())
    .filter((language) => language.length > 0);
  return languages.length > 0 ? languages : undefined;
}

function isValidUrl(value?: string): boolean {
  if (!value) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function calculateDiscountLabel(
  price: number,
  basePrice: number,
): string | null {
  if (!basePrice || price >= basePrice) {
    return null;
  }

  const discount = Math.round(((basePrice - price) / basePrice) * 100);
  return `-${discount}%`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deepMerge(target: any, source: any) {
  const output = { ...target };
  for (const key in source) {
    if (
      source[key] instanceof Object &&
      !Array.isArray(source[key]) &&
      key in target
    ) {
      output[key] = deepMerge(target[key], source[key]);
    } else {
      output[key] = source[key];
    }
  }
  return output;
}

async function findOnePublicBySlug(slug: string) {
  return await findOneBySlug(slug);
}

async function findOneBySlug(slug: string) {
  return await prisma.game.findUnique({
    where: {
      slug,
    },
  });
}

async function findOneById(id: string) {
  return await prisma.game.findUnique({ where: { id } });
}

async function findOneByIdWithStudio(id: string) {
  const gameResource = await findOneById(id);

  if (!gameResource) {
    return null;
  }

  const studioWithMembers = gameResource.studio_id
    ? await studioModel.findOneByIdWithMembers(gameResource.studio_id)
    : null;

  return { ...gameResource, studio: studioWithMembers };
}

async function findOneBySlugWithStudio(slug: string) {
  const gameResource = await findOneBySlug(slug);

  if (!gameResource) {
    return null;
  }

  const studioWithMembers = gameResource.studio_id
    ? await studioModel.findOneByIdWithMembers(gameResource.studio_id)
    : null;

  return { ...gameResource, studio: studioWithMembers };
}

async function update(
  id: string,
  updateData: Partial<z.infer<typeof gameSchema>>,
) {
  const existingGame = await prisma.game.findUnique({
    where: {
      id,
    },
  });

  if (!existingGame) {
    throw new NotFoundError({
      message: "Game not found.",
      action: "Check the game ID and try again.",
    });
  }

  const gameUpdateSchema = gameSchema
    .omit({ studio_id: true, publisher_id: true, steam_app_id: true })
    .extend({
      meta_tags: z
        .object({
          category: z.string().optional(),
          rating: z.string().optional(),
          languages: z.array(z.string()).optional(),
          keywords: z.array(z.string()).optional(),
          platforms: z.array(z.string()).optional(),
        })
        .optional(),
      media: z
        .object({
          banner: z.url().optional(),
          screenshots: z.array(z.url()).optional(),
          icon: z.url().optional(),
          videos: z.array(z.url()).optional(),
        })
        .optional(),
      social_links: z
        .object({
          website: z.url().optional(),
          twitter: z.url().optional(),
          discord: z.url().optional(),
          steam_page: z.url().optional(),
        })
        .optional(),
      requirements: z
        .object({
          minimum: z
            .object({
              os: z.string().optional(),
              processor: z.string().optional(),
              memory: z.string().optional(),
              graphics: z.string().optional(),
              storage: z.string().optional(),
            })
            .optional(),
          recommended: z
            .object({
              os: z.string().optional(),
              processor: z.string().optional(),
              memory: z.string().optional(),
              graphics: z.string().optional(),
              storage: z.string().optional(),
            })
            .optional(),
        })
        .optional(),
    })
    .partial();

  const validatedData = gameUpdateSchema.parse(updateData);

  let newSlug = existingGame.slug;
  if (validatedData.title && validatedData.title !== existingGame.title) {
    newSlug = generateSlug(validatedData.title);
    if (newSlug !== existingGame.slug) {
      await validateUniqueSlug(newSlug);
    }
  }

  if (validatedData.media?.videos && validatedData.media.videos.length > 0) {
    await validateVideoUrls(validatedData.media.videos);
  }

  const discountLabel = calculateDiscountLabel(
    validatedData.price ?? existingGame.price.toNumber(),
    validatedData.base_price ?? existingGame.base_price?.toNumber() ?? 0,
  );

  return await prisma.game.update({
    where: {
      id,
    },
    data: {
      ...validatedData,
      slug: newSlug,
      discount_label: discountLabel,
      launch_date: validatedData.launch_date
        ? new Date(validatedData.launch_date)
        : undefined,
      meta_tags: validatedData.meta_tags
        ? deepMerge(existingGame.meta_tags, validatedData.meta_tags)
        : undefined,
      media: validatedData.media
        ? deepMerge(existingGame.media, validatedData.media)
        : undefined,
      social_links: validatedData.social_links
        ? deepMerge(existingGame.social_links, validatedData.social_links)
        : undefined,
      requirements: validatedData.requirements
        ? deepMerge(existingGame.requirements, validatedData.requirements)
        : undefined,
    },
  });
}

function calculateReviewScore(positive: number, negative: number): ReviewScore {
  const total = positive + negative;
  if (total === 0) return "MIXED";

  const percentage = positive / total;

  if (percentage >= 0.95 && total >= 500) return "OVERWHELMINGLY_POSITIVE";
  if (percentage >= 0.8 && total >= 50) return "VERY_POSITIVE";
  if (percentage >= 0.8) return "POSITIVE";
  if (percentage >= 0.7) return "MOSTLY_POSITIVE";

  if (percentage >= 0.4) return "MIXED";

  if (percentage < 0.2 && total >= 500) return "OVERWHELMINGLY_NEGATIVE";
  if (percentage < 0.2 && total >= 50) return "VERY_NEGATIVE";
  if (percentage < 0.2) return "NEGATIVE";

  return "MOSTLY_NEGATIVE";
}

async function findAllPaginated({
  page = 1,
  limit = 20,
  order = "newest",
  tags,
  q,
  min_price,
  max_price,
  curationWhere,
  priceableGameIds,
}: {
  page?: number;
  limit?: number;
  order?: string;
  tags?: string[];
  q?: string;
  min_price?: number;
  max_price?: number;
  curationWhere?: Prisma.GameWhereInput;
  // Restricts results to games that can be priced in the visitor's currency.
  // Applied in the query rather than filtered afterwards, so pagination counts
  // stay honest — post-filtering a page of 20 could render 15. Null or
  // undefined means every game is priceable, which is the common case.
  priceableGameIds?: string[] | null;
}) {
  const where: Prisma.GameWhereInput = {
    status: { in: ["ACTIVE", "ONLY_DISPLAY"] },
  };

  if (tags && tags.length > 0) {
    where.tags = {
      hasSome: tags,
    };
  }

  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ];
  }

  if (min_price !== undefined || max_price !== undefined) {
    where.price = {
      ...(min_price !== undefined && { gte: min_price }),
      ...(max_price !== undefined && { lte: max_price }),
    };
  }

  const andClauses: Prisma.GameWhereInput[] = [];

  if (curationWhere && Object.keys(curationWhere).length > 0) {
    andClauses.push(curationWhere);
  }

  if (priceableGameIds) {
    andClauses.push({
      OR: [
        { status: "ONLY_DISPLAY" },
        { status: "ACTIVE", id: { in: priceableGameIds } },
      ],
    });
  }

  if (andClauses.length > 0) {
    where.AND = andClauses;
  }

  const orderByMap = {
    newest: { created_at: "desc" },
    oldest: { created_at: "asc" },
    price_asc: { price: "asc" },
    price_desc: { price: "desc" },
    title_asc: { title: "asc" },
    featured: [{ positive_reviews: "desc" }, { created_at: "desc" }],
    trending: [{ updated_at: "desc" }, { positive_reviews: "desc" }],
    new_releases: [{ launch_date: "desc" }],
  };

  const [games, total] = await Promise.all([
    prisma.game.findMany({
      where,
      orderBy: orderByMap[order] || orderByMap.newest,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.game.count({ where }),
  ]);

  return {
    games,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
}

async function findAllPaginatedAdmin({
  page = 1,
  limit = 20,
  status,
  studio_id,
  q,
}: {
  page?: number;
  limit?: number;
  status?: GameStatus;
  studio_id?: string;
  q?: string;
}) {
  const where: Prisma.GameWhereInput = {};

  if (status) {
    where.status = status;
  }

  if (studio_id) {
    where.studio_id = studio_id;
  }

  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ];
  }

  // Pending games (PRIVATE) surface oldest-first so the review queue works
  // through its backlog in submission order; everything else is newest-first.
  const orderBy: Prisma.GameOrderByWithRelationInput =
    status === "PRIVATE" ? { created_at: "asc" } : { created_at: "desc" };

  const [games, total] = await Promise.all([
    prisma.game.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.game.count({ where }),
  ]);

  return {
    games,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
}

async function findAllForSitemap() {
  return prisma.game.findMany({
    where: { status: { in: ["ACTIVE", "ONLY_DISPLAY"] } },
    orderBy: { updated_at: "desc" },
    select: { slug: true, updated_at: true },
  });
}

async function setStatus(id: string, status: GameStatus) {
  return await prisma.game.update({
    where: {
      id,
    },
    data: {
      status,
    },
  });
}

async function makePublic(id: string) {
  return await setStatus(id, "ACTIVE");
}

function ensurePurchasable(gameResource: { status: GameStatus }) {
  if (gameResource.status === "ONLY_DISPLAY") {
    throw new ValidationError({
      message: "This game is not available for purchase on the platform.",
      action: "Open the external store page when one is available.",
    });
  }
}

const game = {
  create,
  createUnclaimedSteamGame,
  refreshUnclaimedSteamGame,
  update,
  findOneById,
  findOneByIdWithStudio,
  findOneBySlug,
  findOneBySlugWithStudio,
  findOneBySteamAppId,
  findOneBySteamAppIdWithStudio,
  buildGameDataFromSteam,
  findOnePublicBySlug,
  findAllPaginated,
  findAllPaginatedAdmin,
  findAllForSitemap,
  makePublic,
  setStatus,
  ensurePurchasable,
  calculateReviewScore,
};

export default game;
