import nintendoImport from "models/nintendo_import";
import { prisma } from "infra/database";
import { parseNintendoProduct } from "infra/nintendo";
import { nintendoProductUrl } from "lib/nintendo";
import { nintendoHtml } from "tests/fixtures/nintendo";

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
  const result = await nintendoImport.importGame({
    userId,
    eshopUrl: nintendoProductUrl("test-knight-switch", "BR"),
    gateway: {
      fetchProduct: async (_slug, country) => {
        console.log("FETCH");
        await gate;
        return parseNintendoProduct(
          nintendoHtml(country),
          nintendoProductUrl("test-knight-switch", country),
        );
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
