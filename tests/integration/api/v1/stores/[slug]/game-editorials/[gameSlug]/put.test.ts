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

function putReview(
  storeSlug: string,
  gameSlug: string,
  body: Record<string, unknown>,
  sessionToken?: string,
) {
  return fetch(editorialUrl(storeSlug, gameSlug), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(sessionToken ? { Cookie: `session_id=${sessionToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("PUT /api/v1/stores/[slug]/game-editorials/[gameSlug]", () => {
  test("an owner can create and update one trimmed draft review", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const session = await orchestrator.createSession(owner.id);
    const store = await orchestrator.createStore(owner.id, { draft: true });
    const game = await orchestrator.createGame(owner.id);

    const createResponse = await putReview(
      store.slug,
      game.slug,
      {
        headline: "   ",
        body: "  A concise first review.  ",
        expected_draft_revision: 1,
      },
      session.token,
    );

    expect(createResponse.status).toBe(200);
    await expect(createResponse.json()).resolves.toEqual({
      review: { headline: null, body: "A concise first review." },
      draft_revision: 2,
    });

    const updateResponse = await putReview(
      store.slug,
      game.slug,
      {
        headline: "  Editor's choice  ",
        body: "  The revised review.  ",
        expected_draft_revision: 2,
      },
      session.token,
    );

    expect(updateResponse.status).toBe(200);
    await expect(updateResponse.json()).resolves.toEqual({
      review: {
        headline: "Editor's choice",
        body: "The revised review.",
      },
      draft_revision: 3,
    });
    await expect(
      prisma.storeGameEditorial.findMany({
        where: { store_id: store.id, game_id: game.id },
        select: { headline: true, body: true },
      }),
    ).resolves.toEqual([
      { headline: "Editor's choice", body: "The revised review." },
    ]);
  });

  test("a member with update:store can create a review", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const store = await orchestrator.createStore(owner.id, { draft: true });
    const editor = await orchestrator.createUser();
    await orchestrator.activateUser(editor.id);
    await orchestrator.addStoreMember(store.id, editor.username, [
      "update:store",
    ]);
    const session = await orchestrator.createSession(editor.id);
    const game = await orchestrator.createGame(owner.id);

    const response = await putReview(
      store.slug,
      game.slug,
      {
        headline: "Member review",
        body: "Written by an authorized Outlet member.",
        expected_draft_revision: 1,
      },
      session.token,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      review: {
        headline: "Member review",
        body: "Written by an authorized Outlet member.",
      },
      draft_revision: 2,
    });
  });

  test("rejects anonymous and unrelated authenticated writers with exact errors", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const store = await orchestrator.createStore(owner.id, { draft: true });
    const game = await orchestrator.createGame(owner.id);
    const validBody = {
      headline: null,
      body: "This write must not be stored.",
      expected_draft_revision: 1,
    };

    const anonymousResponse = await putReview(store.slug, game.slug, validBody);
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
    const outsiderResponse = await putReview(
      store.slug,
      game.slug,
      validBody,
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
      prisma.storeGameEditorial.count({ where: { store_id: store.id } }),
    ).resolves.toBe(0);
  });

  test("returns the validation payload and leaves the draft unchanged", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const session = await orchestrator.createSession(owner.id);
    const store = await orchestrator.createStore(owner.id, { draft: true });
    const game = await orchestrator.createGame(owner.id);

    const response = await putReview(
      store.slug,
      game.slug,
      {
        headline: "Invalid",
        body: "   ",
        expected_draft_revision: 1,
        unexpected: true,
      },
      session.token,
    );

    expect(response.status).toBe(400);
    const responseBody = await response.json();
    expect(responseBody.message).toBe("One or more review fields are invalid.");
    expect(responseBody.name).toBe("ValidationError");
    expect(responseBody.action).toBe(
      "Add review text and check the character limits.",
    );
    expect(responseBody.status_code).toBe(400);
    expect(responseBody.context).toEqual(expect.any(Array));
    await expect(
      prisma.store.findUniqueOrThrow({
        where: { id: store.id },
        select: { draft_revision: true },
      }),
    ).resolves.toEqual({ draft_revision: 1 });
    await expect(
      prisma.storeGameEditorial.count({ where: { store_id: store.id } }),
    ).resolves.toBe(0);
  });

  test("returns a precise conflict and rolls back a stale write", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const session = await orchestrator.createSession(owner.id);
    const store = await orchestrator.createStore(owner.id, { draft: true });
    const game = await orchestrator.createGame(owner.id);

    const firstResponse = await putReview(
      store.slug,
      game.slug,
      {
        headline: "Accepted",
        body: "The accepted version.",
        expected_draft_revision: 1,
      },
      session.token,
    );
    expect(firstResponse.status).toBe(200);

    const staleResponse = await putReview(
      store.slug,
      game.slug,
      {
        headline: "Rejected",
        body: "The stale version.",
        expected_draft_revision: 1,
      },
      session.token,
    );

    expect(staleResponse.status).toBe(409);
    await expect(staleResponse.json()).resolves.toEqual({
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
      prisma.storeGameEditorial.findUniqueOrThrow({
        where: {
          store_id_game_id: { store_id: store.id, game_id: game.id },
        },
        select: { headline: true, body: true },
      }),
    ).resolves.toEqual({
      headline: "Accepted",
      body: "The accepted version.",
    });
  });

  test("returns 404 for an unknown game without advancing the draft", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const session = await orchestrator.createSession(owner.id);
    const store = await orchestrator.createStore(owner.id, { draft: true });

    const response = await putReview(
      store.slug,
      "missing-game",
      {
        headline: null,
        body: "Review for a missing game.",
        expected_draft_revision: 1,
      },
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
