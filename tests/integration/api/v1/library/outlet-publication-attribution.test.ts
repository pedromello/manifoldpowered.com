import { prisma } from "infra/database";
import webserver from "infra/webserver";
import orchestrator from "tests/orchestrator";
import {
  authenticatedJsonHeaders,
  createLifecycleActor,
  createReadyDraft,
  libraryRequest,
  publicationRequest,
} from "tests/integration/api/v1/_support/outlet-lifecycle";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
});

beforeEach(async () => {
  await orchestrator.clearDatabaseRows();
});

describe("Outlet publication attribution", () => {
  test("an unknown Outlet slug remains lenient and creates an unattributed Sale", async () => {
    const developer = await createLifecycleActor();
    const game = await orchestrator.createGame(developer.user.id, {
      title: "Unknown Outlet Attribution",
      price: 0,
    });
    const buyer = await createLifecycleActor();

    const response = await libraryRequest(
      buyer.sessionToken,
      game.slug,
      "genuinely-unknown-outlet",
    );

    expect(response.status).toBe(201);
    expect(
      await prisma.libraryItem.count({
        where: { user_id: buyer.user.id, item_id: game.id },
      }),
    ).toBe(1);
    const sale = await prisma.sale.findFirstOrThrow({
      where: { user_id: buyer.user.id, game_id: game.id },
    });
    expect(sale.store_id).toBeNull();
    expect(sale.store_revision_id).toBeNull();
  });

  test("a known draft Outlet rejects acquisition atomically", async () => {
    const fixture = await createReadyDraft("Atomic Draft Attribution");
    const buyer = await createLifecycleActor();

    const response = await libraryRequest(
      buyer.sessionToken,
      fixture.games[0].slug,
      fixture.store.slug,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        name: "ValidationError",
        context: { store_slug: fixture.store.slug },
      }),
    );
    expect(
      await prisma.libraryItem.count({
        where: { user_id: buyer.user.id, item_id: fixture.games[0].id },
      }),
    ).toBe(0);
    expect(
      await prisma.sale.count({
        where: { user_id: buyer.user.id, game_id: fixture.games[0].id },
      }),
    ).toBe(0);
    expect(await prisma.ledgerEntry.count()).toBe(0);
  });

  test("a published Outlet records its exact immutable revision; unpublish blocks attribution until republish", async () => {
    const fixture = await createReadyDraft("Exact Revision Attribution");
    const firstPublishResponse = await publicationRequest(
      fixture.store.slug,
      fixture.sessionToken,
      "publish",
      fixture.store.draft_revision,
    );
    expect(firstPublishResponse.status).toBe(200);
    const firstPublication = await firstPublishResponse.json();
    const firstRevisionId = firstPublication.published_revision.id as string;

    const firstBuyer = await createLifecycleActor();
    const firstAcquisition = await libraryRequest(
      firstBuyer.sessionToken,
      fixture.games[0].slug,
      fixture.store.slug,
    );
    expect(firstAcquisition.status).toBe(201);
    const historicalSale = await prisma.sale.findFirstOrThrow({
      where: {
        user_id: firstBuyer.user.id,
        game_id: fixture.games[0].id,
      },
    });
    expect(historicalSale).toEqual(
      expect.objectContaining({
        store_id: fixture.store.id,
        store_revision_id: firstRevisionId,
      }),
    );

    const renameResponse = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${fixture.store.slug}`,
      {
        method: "PATCH",
        headers: authenticatedJsonHeaders(fixture.sessionToken),
        body: JSON.stringify({ name: "Mutable Draft Name" }),
      },
    );
    expect(renameResponse.status).toBe(200);
    const renamedDraft = await renameResponse.json();
    expect(renamedDraft.slug).toBe(fixture.store.slug);

    const purchasesBeforeUnpublish = await fetch(
      `${webserver.getOrigin()}/api/v1/user/purchases`,
      { headers: { Cookie: `session_id=${firstBuyer.sessionToken}` } },
    );
    expect(purchasesBeforeUnpublish.status).toBe(200);
    expect((await purchasesBeforeUnpublish.json()).purchases[0]).toEqual(
      expect.objectContaining({
        store_id: fixture.store.id,
        store_name: fixture.store.name,
        store_slug: fixture.store.slug,
        store_logo_url: fixture.store.logo_url,
      }),
    );

    const unpublishResponse = await publicationRequest(
      fixture.store.slug,
      fixture.sessionToken,
      "unpublish",
      renamedDraft.draft_revision,
    );
    expect(unpublishResponse.status).toBe(200);

    const blockedBuyer = await createLifecycleActor();
    const blockedAcquisition = await libraryRequest(
      blockedBuyer.sessionToken,
      fixture.games[0].slug,
      fixture.store.slug,
    );
    expect(blockedAcquisition.status).toBe(400);
    expect(
      await prisma.libraryItem.count({
        where: {
          user_id: blockedBuyer.user.id,
          item_id: fixture.games[0].id,
        },
      }),
    ).toBe(0);
    expect(
      await prisma.sale.count({ where: { user_id: blockedBuyer.user.id } }),
    ).toBe(0);

    const republishResponse = await publicationRequest(
      fixture.store.slug,
      fixture.sessionToken,
      "publish",
      renamedDraft.draft_revision,
    );
    expect(republishResponse.status).toBe(200);
    const republished = await republishResponse.json();
    const secondRevisionId = republished.published_revision.id as string;
    expect(secondRevisionId).not.toBe(firstRevisionId);
    expect(republished.published_revision).toEqual(
      expect.objectContaining({
        revision: 2,
        source_draft_revision: renamedDraft.draft_revision,
      }),
    );

    const postRepublishBuyer = await createLifecycleActor();
    const postRepublishAcquisition = await libraryRequest(
      postRepublishBuyer.sessionToken,
      fixture.games[0].slug,
      fixture.store.slug,
    );
    expect(postRepublishAcquisition.status).toBe(201);
    const newSale = await prisma.sale.findFirstOrThrow({
      where: {
        user_id: postRepublishBuyer.user.id,
        game_id: fixture.games[0].id,
      },
    });
    expect(newSale).toEqual(
      expect.objectContaining({
        store_id: fixture.store.id,
        store_revision_id: secondRevisionId,
      }),
    );
    expect(
      await prisma.sale.findUniqueOrThrow({ where: { id: historicalSale.id } }),
    ).toEqual(historicalSale);

    const purchasesAfterRepublish = await fetch(
      `${webserver.getOrigin()}/api/v1/user/purchases`,
      { headers: { Cookie: `session_id=${firstBuyer.sessionToken}` } },
    );
    expect((await purchasesAfterRepublish.json()).purchases[0]).toEqual(
      expect.objectContaining({
        store_name: fixture.store.name,
        store_slug: fixture.store.slug,
      }),
    );
  });
});
