import steamImport from "models/steam_import";
import { prisma } from "infra/database";

// Separate process for the distributed coordination integration test.
const [userId, mode] = process.argv.slice(2);
const gate =
  mode === "leader"
    ? new Promise<void>((resolve) => {
        process.stdin.once("data", () => {
          process.stdin.pause();
          resolve();
        });
      })
    : Promise.resolve();
try {
  const result = await steamImport.importGame({
    userId,
    steamAppId: "990000100",
    gateway: {
      fetchAppDetails: async () => {
        console.log("FETCH");
        await gate;
        return { success: true, data: { name: "Steam Process Fixture" } };
      },
    },
  });
  console.log(
    JSON.stringify({ state: result.refresh.state, gameId: result.game?.id }),
  );
} finally {
  await prisma.$disconnect();
}
// Prisma's adapter may leave idle handles in this CLI fixture.
process.exit(0);
