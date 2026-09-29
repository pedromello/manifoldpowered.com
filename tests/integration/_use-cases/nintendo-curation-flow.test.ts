import { prisma } from "infra/database";
import { parseNintendoProduct } from "infra/nintendo";
import { nintendoProductUrl } from "lib/nintendo";
import nintendoImport from "models/nintendo_import";
import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";
import { nintendoHtml } from "tests/fixtures/nintendo";
import {
  createReadyDraft,
  authenticatedJsonHeaders,
  publicationRequest,
} from "tests/integration/api/v1/_support/outlet-lifecycle";
import { createClaimThroughApi } from "tests/integration/_helpers/game_ownership_claim";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

test("creator selects a Nintendo game, publishes its review and refreshes without losing curation", async () => {
  const fixture = await createReadyDraft("Nintendo Curation");
  const gateway = {
    fetchProduct: async (_slug: string, country: "BR" | "US") =>
      parseNintendoProduct(
        nintendoHtml(country),
        nintendoProductUrl("test-knight-switch", country),
      ),
  };
  const { game } = await nintendoImport.importGame({
    userId: fixture.user.id,
    eshopUrl: nintendoProductUrl("test-knight-switch", "BR"),
    gateway,
  });
  const base = `${webserver.getOrigin()}/api/v1/stores/${fixture.store.slug}`;
  const headers = authenticatedJsonHeaders(fixture.sessionToken);
  const featured = await fetch(`${base}/featured`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      expected_draft_revision: fixture.store.draft_revision,
      recommendations: [
        { game_slug: game.slug, recommendation_reason: "My Switch pick" },
      ],
    }),
  });
  expect(featured.status).toBe(200);
  const revision = (
    await prisma.store.findUniqueOrThrow({ where: { id: fixture.store.id } })
  ).draft_revision;
  const saved = await fetch(`${base}/game-editorials/${game.slug}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      expected_draft_revision: revision,
      headline: "A console favorite",
      body: "This is my independent Nintendo review.",
    }),
  });
  expect(saved.status).toBe(200);
  const published = await publicationRequest(
    fixture.store.slug,
    fixture.sessionToken,
    "publish",
    (await saved.json()).draft_revision,
  );
  expect(published.status).toBe(200);
  const response = await fetch(`${base}/featured?locale=pt-BR`, {
    headers: { "x-vercel-ip-country": "BR" },
  });
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(JSON.stringify(body)).toContain(
    "This is my independent Nintendo review.",
  );
  expect(JSON.stringify(body)).toContain("NINTENDO_ONLY");
  expect(JSON.stringify(body)).toContain(
    nintendoProductUrl("test-knight-switch", "BR"),
  );
  await prisma.nintendoRefresh.updateMany({
    data: { next_allowed_at: new Date(0) },
  });
  await nintendoImport.importGame({
    userId: fixture.user.id,
    eshopUrl: nintendoProductUrl("test-knight-switch", "US"),
    gateway,
  });
  expect(
    await prisma.storeGameEditorial.findUnique({
      where: {
        store_id_game_id: { store_id: fixture.store.id, game_id: game.id },
      },
    }),
  ).toMatchObject({ body: "This is my independent Nintendo review." });
  expect(
    await prisma.storeFeaturedGame.count({ where: { game_id: game.id } }),
  ).toBe(1);
  const studio = await orchestrator.createStudio(fixture.user.id, {
    name: "Nintendo claimant",
  });
  const claimResponse = await createClaimThroughApi({
    slug: game.slug,
    studioId: studio.id,
    sessionToken: fixture.sessionToken,
  });
  expect(claimResponse.status).toBe(400);
  expect(
    await prisma.gameOwnershipClaim.count({ where: { game_id: game.id } }),
  ).toBe(0);
});
