import type { NextApiRequest } from "next";
import { promotionGameIds } from "models/store_promotions";
import { prisma } from "infra/database";
import { parsePlayStationProduct } from "infra/playstation";
import { playStationProductUrl } from "lib/playstation";
import playstationImport from "models/playstation_import";
import gameModel from "models/game";
import library from "models/library";
import authorization from "models/authorization";
import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";
import {
  PLAYSTATION_ID,
  playstationFixture,
  playstationHtml,
} from "tests/fixtures/playstation";
import {
  createReadyDraft,
  authenticatedJsonHeaders,
  publicationRequest,
} from "tests/integration/api/v1/_support/outlet-lifecycle";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});
afterAll(() => prisma.$disconnect());

test("imports a PS5 edition concurrently, publishes its curation and refreshes without touching a PC edition", async () => {
  const fixture = await createReadyDraft("PlayStation Curation");
  const pc = await prisma.game.update({
    where: { id: fixture.games[0].id },
    data: { title: "Orbit Tactics", steam_app_id: "99999999" },
  });
  const gateway = {
    fetchProduct: async (_id: string, country: "BR" | "US") =>
      parsePlayStationProduct(
        playstationHtml(playstationFixture(country)),
        playStationProductUrl(PLAYSTATION_ID, country),
      ),
  };
  const input = {
    userId: fixture.user.id,
    storeUrl: playStationProductUrl(PLAYSTATION_ID, "BR"),
    gateway,
  };
  await Promise.all([
    playstationImport.importGame(input),
    playstationImport.importGame(input),
  ]);
  const game = await prisma.game.findUniqueOrThrow({
    where: { playstation_product_id: PLAYSTATION_ID },
  });
  expect(game.id).not.toBe(pc.id);
  expect(game.status).toBe("ONLY_DISPLAY");
  expect(game.steam_app_id).toBeNull();
  expect(
    await prisma.game.count({
      where: { playstation_product_id: PLAYSTATION_ID },
    }),
  ).toBe(1);
  const offers = await prisma.gameExternalOffer.findMany({
    where: { game_id: game.id },
    orderBy: { country: "asc" },
  });
  expect(
    offers.map((offer) => [
      offer.provider,
      offer.country,
      offer.currency,
      offer.amount?.toFixed(2),
    ]),
  ).toEqual([
    ["PLAYSTATION", "BR", "BRL", "10.00"],
    ["PLAYSTATION", "US", "USD", "10.00"],
  ]);
  const base = webserver.getOrigin() + "/api/v1/stores/" + fixture.store.slug;
  const headers = authenticatedJsonHeaders(fixture.sessionToken);
  const feature = await fetch(base + "/featured", {
    method: "PUT",
    headers,
    body: JSON.stringify({
      expected_draft_revision: fixture.store.draft_revision,
      recommendations: [
        {
          game_slug: game.slug,
          recommendation_reason: "A console strategy campaign.",
        },
      ],
    }),
  });
  expect(feature.status).toBe(200);
  const current = await prisma.store.findUniqueOrThrow({
    where: { id: fixture.store.id },
  });
  const editorial = await fetch(base + "/game-editorials/" + game.slug, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      expected_draft_revision: current.draft_revision,
      headline: "PS5 campaign",
      body: "Independent console curation with credited sources.",
    }),
  });
  expect(editorial.status).toBe(200);
  expect(
    (
      await publicationRequest(
        fixture.store.slug,
        fixture.sessionToken,
        "publish",
        (await editorial.json()).draft_revision,
      )
    ).status,
  ).toBe(200);
  const publicRead = await fetch(base + "/featured?locale=pt-BR", {
    headers: { "x-vercel-ip-country": "BR" },
  });
  expect(publicRead.status).toBe(200);
  const publicBody = JSON.stringify(await publicRead.json());
  expect(publicBody).toContain("PLAYSTATION_ONLY");
  expect(publicBody).toContain("Independent console curation");
  expect(publicBody).toContain(playStationProductUrl(PLAYSTATION_ID, "BR"));
  await expect(gameModel.makePublic(game.id)).rejects.toThrow("catalog-only");
  await expect(library.add(fixture.user.id, game.id)).rejects.toThrow(
    "catalog-only",
  );
  expect(
    authorization.filterOutput(fixture.user, "read:public_game", game),
  ).toMatchObject({
    claimable: false,
    purchase_mode: "PLAYSTATION_ONLY",
    price: null,
  });
  await prisma.playStationRefresh.updateMany({
    where: { product_id: PLAYSTATION_ID },
    data: { next_allowed_at: new Date(0) },
  });
  await playstationImport.importGame({
    ...input,
    gateway: {
      fetchProduct: async (_id, country) => {
        const data = playstationFixture(country);
        data.cache.purchase.price.discountedValue = 1500;
        return parsePlayStationProduct(
          playstationHtml(data),
          playStationProductUrl(PLAYSTATION_ID, country),
        );
      },
    },
  });
  expect(
    await prisma.gameExternalOffer.findFirst({
      where: { game_id: game.id, country: "BR" },
    }),
  ).toMatchObject({ amount: expect.anything() });
  expect(
    (
      await prisma.gameExternalOffer.findFirstOrThrow({
        where: { game_id: game.id, country: "BR" },
      })
    ).amount?.toFixed(2),
  ).toBe("15.00");
  expect(
    await prisma.storeGameEditorial.findUnique({
      where: {
        store_id_game_id: { store_id: fixture.store.id, game_id: game.id },
      },
    }),
  ).toMatchObject({
    body: "Independent console curation with credited sources.",
  });
  expect(
    (await prisma.game.findUniqueOrThrow({ where: { id: pc.id } }))
      .playstation_product_id,
  ).toBeNull();
  const promotionRequest = {
    headers: { "x-vercel-ip-country": "BR" },
  } as unknown as NextApiRequest;
  expect(
    await promotionGameIds(promotionRequest, { id: game.id }, "BRL"),
  ).toContain(game.id);
  await prisma.gameExternalOffer.updateMany({
    where: { game_id: game.id },
    data: { expires_at: new Date(Date.now() - 60000) },
  });
  expect(
    await promotionGameIds(promotionRequest, { id: game.id }, "BRL"),
  ).not.toContain(game.id);
});
