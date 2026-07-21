import { prisma } from "infra/database";
import { GameStatus } from "generated/prisma/client";

const ONE_DAY_IN_MILLISECONDS = 1000 * 60 * 60 * 24;
const OLDEST_PENDING_GAMES_LIMIT = 5;

// Rolling 7-day windows rather than calendar weeks (Sun-Sat) - simpler,
// timezone-agnostic, and just as meaningful for "signups this week vs last".
async function getMetrics() {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * ONE_DAY_IN_MILLISECONDS);
  const fourteenDaysAgo = new Date(
    now.getTime() - 14 * ONE_DAY_IN_MILLISECONDS,
  );

  const [
    pendingGamesCount,
    oldestPendingGames,
    signupsLast7Days,
    signupsPrevious7Days,
    totalUsers,
    totalStudios,
    totalStores,
    gamesByStatusRaw,
  ] = await Promise.all([
    prisma.game.count({ where: { status: "PRIVATE" } }),
    prisma.game.findMany({
      where: { status: "PRIVATE" },
      orderBy: { created_at: "asc" },
      take: OLDEST_PENDING_GAMES_LIMIT,
      select: { id: true, slug: true, title: true, created_at: true },
    }),
    prisma.user.count({ where: { created_at: { gte: sevenDaysAgo } } }),
    prisma.user.count({
      where: { created_at: { gte: fourteenDaysAgo, lt: sevenDaysAgo } },
    }),
    prisma.user.count(),
    prisma.studio.count(),
    prisma.store.count(),
    prisma.game.groupBy({ by: ["status"], _count: { status: true } }),
  ]);

  const gamesByStatus: Record<GameStatus, number> = {
    ACTIVE: 0,
    INACTIVE: 0,
    PRIVATE: 0,
  };
  for (const row of gamesByStatusRaw) {
    gamesByStatus[row.status] = row._count.status;
  }

  return {
    games: {
      pending_count: pendingGamesCount,
      oldest_pending: oldestPendingGames,
      by_status: gamesByStatus,
    },
    users: {
      total: totalUsers,
      signups_last_7_days: signupsLast7Days,
      signups_previous_7_days: signupsPrevious7Days,
    },
    studios: {
      total: totalStudios,
    },
    stores: {
      total: totalStores,
    },
  };
}

const dashboard = {
  getMetrics,
};

export default dashboard;
