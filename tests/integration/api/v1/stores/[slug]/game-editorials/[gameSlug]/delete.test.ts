import { prisma } from "infra/database";
import webserver from "infra/webserver";
import orchestrator from "tests/orchestrator";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
});

beforeEach(async () => {
  await orchestrator.clearDatabaseRows();
});

function editorialUrl(storeSlug: string, gameSlug: string) {
  return `${webserver.getOrigin()}/api/v1/stores/${storeSlug}/game-editorials/${gameSlug}`;
}

function deleteReview(
  storeSlug: string,
  gameSlug: string,
  body: Record<string, unknown>,
  sessionToken?: string,
) {
  return fetch(editorialUrl(storeSlug, gameSlug), {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      ...(sessionToken ? { Cookie: `session_id=${sessionToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function seedReview(storeId: string, gameId: string) {
  await prisma.storeGameEditorial.create({
    data: {
      store_id: storeId,
      game_id: gameId,
      headline: "Seeded review",
      body: "A review waiting to be removed.",
    },
  });
}

describe("DELETE /api/v1/stores/[slug]/game-editorials/[gameSlug]", () => {
  test("an owner can remove a review and advance the draft revision", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const session = await orchestrator.createSession(owner.id);
    const store = await orchestrator.createStore(owner.id, { draft: true });
    const game = await orchestrator.createGame(owner.id);
    await seedReview(store.id, game.id);

    const response = await deleteReview(
      store.slug,
      game.slug,
      { expected_draft_revision: 1 },
      session.token,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ draft_revision: 2 });
    await expect(
      prisma.storeGameEditorial.count({
        where: { store_id: store.id, game_id: game.id },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.store.findUniqueOrThrow({
        where: { id: store.id },
        select: { draft_revision: true },
      }),
    ).resolves.toEqual({ draft_revision: 2 });
  });

  test("a member with update:store can remove a review", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const store = await orchestrator.createStore(owner.id, { draft: true });
    const game = await orchestrator.createGame(owner.id);
    await seedReview(store.id, game.id);
    const editor = await orchestrator.createUser();
    await orchestrator.activateUser(editor.id);
    await orchestrator.addStoreMember(store.id, editor.username, [
      "update:store",
    ]);
    const session = await orchestrator.createSession(editor.id);

    const response = await deleteReview(
      store.slug,
      game.slug,
      { expected_draft_revision: 1 },
      session.token,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ draft_revision: 2 });
  });

  test("rejects anonymous and unrelated authenticated writers with exact errors", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const store = await orchestrator.createStore(owner.id, { draft: true });
    const game = await orchestrator.createGame(owner.id);
    await seedReview(store.id, game.id);

    const anonymousResponse = await deleteReview(store.slug, game.slug, {
      expected_draft_revision: 1,
    });
    expect(anonymousResponse.status).toBe(403);
    await expect(anonymousResponse.json()).resolves.toEqual({
      message: "You do not have permission to perform this action",
      name: "ForbiddenError",
      action: "Verify your user has the following features: update:store",
      status_code: 403,
    });

    const outsider = await orchestrator.createUser();
    await orchestrator.activateUser(outsider.id);
    const outsiderSession = await orchestrator.createSession(outsider.id);
    const outsiderResponse = await deleteReview(
      store.slug,
      game.slug,
      { expected_draft_revision: 1 },
      outsiderSession.token,
    );
    expect(outsiderResponse.status).toBe(403);
    await expect(outsiderResponse.json()).resolves.toEqual({
      message: "You do not have permission to edit this Outlet's reviews.",
      name: "ForbiddenError",
      action: "Ask the Outlet owner for catalog access.",
      status_code: 403,
    });
    await expect(
      prisma.storeGameEditorial.count({
        where: { store_id: store.id, game_id: game.id },
      }),
    ).resolves.toBe(1);
  });

  test("returns the validation payload and preserves the review", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const session = await orchestrator.createSession(owner.id);
    const store = await orchestrator.createStore(owner.id, { draft: true });
    const game = await orchestrator.createGame(owner.id);
    await seedReview(store.id, game.id);

    const response = await deleteReview(
      store.slug,
      game.slug,
      {},
      session.token,
    );

    expect(response.status).toBe(400);
    const responseBody = await response.json();
    expect(responseBody.message).toBe(
      "The expected Outlet draft revision is required.",
    );
    expect(responseBody.name).toBe("ValidationError");
    expect(responseBody.action).toBe("Refresh the catalog and try again.");
    expect(responseBody.status_code).toBe(400);
    expect(responseBody.context).toEqual(expect.any(Array));
    await expect(
      prisma.storeGameEditorial.count({
        where: { store_id: store.id, game_id: game.id },
      }),
    ).resolves.toBe(1);
  });

  test("returns a precise conflict and rolls back a stale delete", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const session = await orchestrator.createSession(owner.id);
    const store = await orchestrator.createStore(owner.id, { draft: true });
    const game = await orchestrator.createGame(owner.id);
    await seedReview(store.id, game.id);
    await prisma.store.update({
      where: { id: store.id },
      data: { draft_revision: { increment: 1 } },
    });

    const response = await deleteReview(
      store.slug,
      game.slug,
      { expected_draft_revision: 1 },
      session.token,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      message: "The Outlet draft changed before the review was saved.",
      name: "ConflictError",
      action: "Refresh the catalog, review the latest draft, and try again.",
      status_code: 409,
      context: {
        expected_draft_revision: 1,
        actual_draft_revision: 2,
      },
    });
    await expect(
      prisma.storeGameEditorial.count({
        where: { store_id: store.id, game_id: game.id },
      }),
    ).resolves.toBe(1);
  });

  test("returns 404 for an unknown game without advancing the draft", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const session = await orchestrator.createSession(owner.id);
    const store = await orchestrator.createStore(owner.id, { draft: true });

    const response = await deleteReview(
      store.slug,
      "missing-game",
      { expected_draft_revision: 1 },
      session.token,
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      message: "Game not found.",
      name: "NotFoundError",
      action: "Check the game slug and try again.",
      status_code: 404,
    });
    await expect(
      prisma.store.findUniqueOrThrow({
        where: { id: store.id },
        select: { draft_revision: true },
      }),
    ).resolves.toEqual({ draft_revision: 1 });
  });
});
