import type { NextApiRequest } from "next";
import type { Game, GameLocalization } from "generated/prisma/client";
import { prisma } from "infra/database";
import { appLocaleFromQuery, type AppLocale } from "lib/locale";

function localeForRequest(req: NextApiRequest): AppLocale {
  return appLocaleFromQuery(req.query.locale as string | string[] | undefined);
}

async function forGames(gameIds: string[], locale: AppLocale) {
  if (locale === "en" || gameIds.length === 0) {
    return new Map<string, GameLocalization>();
  }

  const rows = await prisma.gameLocalization.findMany({
    where: { game_id: { in: gameIds }, locale },
  });
  return new Map(rows.map((row) => [row.game_id, row]));
}

function apply<T extends Game>(game: T, localization?: GameLocalization): T {
  if (!localization) return game;
  return {
    ...game,
    title: localization.title,
    description: localization.description,
    detailed_description: localization.detailed_description,
  };
}

const gameLocalization = { localeForRequest, forGames, apply };

export default gameLocalization;
