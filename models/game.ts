import { prisma } from "infra/database";
import { z } from "zod";
import { ValidationError } from "infra/errors";

export const gameSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().min(1).max(300),
  detailed_description: z.string().min(1),
  launch_date: z.iso.datetime(),
  price: z.coerce.number().positive().max(1000000),
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

async function findOneBySlug(slug: string) {
  return await prisma.game.findUnique({
    where: {
      slug,
    },
  });
}

const game = {
  create,
  findOneBySlug,
};

export default game;
