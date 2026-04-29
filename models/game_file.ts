import { prisma } from "infra/database";
import { z } from "zod";
import { NotFoundError } from "infra/errors";
import storage from "infra/storage";
import { GamePlatform } from "generated/prisma/client";

export const gameFileSchema = z.object({
  game_id: z.uuid(),
  display_name: z.string().min(1).max(255),
  platform: z.nativeEnum(GamePlatform),
  file_url: z.string().min(1).max(1024),
  size_bytes: z.number().int().nonnegative(),
  version: z.string().min(1).max(50),
});

export type GameFileCreateDto = z.infer<typeof gameFileSchema>;

async function create(data: GameFileCreateDto) {
  const result = await prisma.gameFile.create({
    data: {
      game_id: data.game_id,
      display_name: data.display_name,
      platform: data.platform,
      file_url: data.file_url,
      size_bytes: BigInt(data.size_bytes),
      version: data.version,
    },
  });

  return {
    ...result,
    size_bytes: result.size_bytes.toString(),
  };
}

async function findAllByGameId(gameId: string) {
  const files = await prisma.gameFile.findMany({
    where: {
      game_id: gameId,
    },
    orderBy: {
      created_at: "desc",
    },
  });

  return files.map((file) => ({
    ...file,
    size_bytes: file.size_bytes.toString(),
  }));
}

async function findById(id: string) {
  const file = await prisma.gameFile.findUnique({
    where: {
      id,
    },
  });

  if (!file) {
    throw new NotFoundError({
      message: "Game file not found",
      action: "Verify the ID and try again",
    });
  }

  return {
    ...file,
    size_bytes: file.size_bytes.toString(),
  };
}

async function remove(id: string) {
  const file = await prisma.gameFile.findUnique({
    where: { id },
  });

  if (!file) {
    throw new NotFoundError({
      message: "Game file not found",
      action: "Verify the ID and try again",
    });
  }

  // Extract key from file_url if necessary, assuming file_url is the S3 object key
  const objectKey = file.file_url;
  await storage.deleteFile(objectKey);

  await prisma.gameFile.delete({
    where: { id },
  });
}

const gameFile = {
  create,
  findAllByGameId,
  findById,
  remove,
};

export default gameFile;
