import { prisma } from "infra/database";
import { z } from "zod";
import { NotFoundError, ValidationError } from "infra/errors";

export const gameSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().min(1).max(300),
  detailed_description: z.string().min(1),
  launch_date: z.iso.datetime(),
  price: z.coerce.number().positive().max(1000000),
  base_price: z.coerce.number().positive().max(1000000).optional(),
  developer_name: z.string().min(1).max(255),
  publisher_name: z.string().max(255).optional(),
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

export type GameCreateDto = z.infer<typeof gameSchema> & { user_id: string };

async function create(gameData: GameCreateDto) {
  const slug = generateSlug(gameData.title);
  await validateUniqueSlug(slug);

  if (gameData.media.videos.length > 0) {
    await validateVideoUrls(gameData.media.videos);
  }

  if (!gameData.publisher_name) {
    gameData.publisher_name = gameData.developer_name;
  }

  const priceAsString = gameData.price.toFixed(2);

  return await prisma.game.create({
    data: {
      ...gameData,
      slug,
      price: priceAsString,
      base_price: priceAsString,
      launch_date: new Date(gameData.launch_date),
      meta_tags: gameData.meta_tags || {},
      media: gameData.media || {},
      social_links: gameData.social_links || {},
      requirements: gameData.requirements || {},
    },
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

    if (!allowedHosts.includes(videoUrl.hostname)) {
      throw new Error("Invalid video host");
    }
  } catch (error) {
    throw new ValidationError({
      message: `Invalid video URL: ${url}. Videos must be a valid URL hosted on YouTube.`,
      cause: error,
      action: "Check if video URL is valid and from YouTube.",
    });
  }
}

function validateVideoUrls(urls: string[]) {
  for (const url of urls) {
    validateVideoUrl(url);
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

  const priceAsString =
    validatedData.price !== undefined
      ? validatedData.price.toFixed(2)
      : undefined;

  const basePriceAsString =
    validatedData.base_price !== undefined
      ? validatedData.base_price.toFixed(2)
      : undefined;

  const discountLabel = calculateDiscountLabel(
    validatedData.price ?? Number(existingGame.price),
    validatedData.base_price ?? Number(existingGame.base_price),
  );

  return await prisma.game.update({
    where: {
      id,
    },
    data: {
      ...validatedData,
      slug: newSlug,
      price: priceAsString,
      base_price: basePriceAsString,
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

const game = {
  create,
  update,
  findOneBySlug,
  findOnePublicBySlug,
};

export default game;
