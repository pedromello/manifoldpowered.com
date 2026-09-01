import orchestrator from "tests/orchestrator";
import { prisma } from "infra/database";
import webserver from "infra/webserver";
import gameModel from "models/game";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

async function currentDraftRevision(storeSlug: string) {
  const store = await prisma.store.findUniqueOrThrow({
    where: { slug: storeSlug },
    select: { draft_revision: true },
  });
  return store.draft_revision;
}

async function deleteSelection(
  storeSlug: string,
  sessionToken: string,
  expectedDraftRevision?: number,
) {
  const revision =
    expectedDraftRevision ?? (await currentDraftRevision(storeSlug));
  return fetch(`${webserver.getOrigin()}/api/v1/stores/${storeSlug}/featured`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Cookie: `session_id=${sessionToken}`,
    },
    body: JSON.stringify({ expected_draft_revision: revision }),
  });
}

describe("DELETE /api/v1/stores/[slug]/featured", () => {
  test("An owner can return the Outlet to automatic mode", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const session = await orchestrator.createSession(owner.id);
    const store = await orchestrator.createStore(owner.id);
    const game = await orchestrator.createGame(owner.id, {
      title: "Resettable Pick",
    });
    await gameModel.makePublic(game.id);

    const putResponse = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${store.slug}/featured`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${session.token}`,
        },
        body: JSON.stringify({
          game_slugs: [game.slug],
          expected_draft_revision: await currentDraftRevision(store.slug),
        }),
      },
    );
    expect(putResponse.status).toBe(200);

    const deleteResponse = await deleteSelection(store.slug, session.token);
    expect(deleteResponse.status).toBe(204);

    const publicResponse = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${store.slug}/featured`,
    );
    const publicBody = await publicResponse.json();
    expect(publicBody.mode).toBe("AUTOMATIC");
  });

  test("A member with only update:store cannot reset the selection", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const store = await orchestrator.createStore(owner.id);

    const editor = await orchestrator.createUser();
    await orchestrator.activateUser(editor.id);
    const session = await orchestrator.createSession(editor.id);
    await orchestrator.addStoreMember(store.id, editor.username, [
      "update:store",
    ]);

    const response = await deleteSelection(store.slug, session.token);
    expect(response.status).toBe(403);
  });

  test("A stale revision cannot reset Featured and rolls the transaction back", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const session = await orchestrator.createSession(owner.id);
    const store = await orchestrator.createStore(owner.id);
    const original = await orchestrator.createGame(owner.id, {
      title: "Stale Reset Original",
    });
    const replacement = await orchestrator.createGame(owner.id, {
      title: "Stale Reset Replacement",
    });
    await gameModel.makePublic(original.id);
    await gameModel.makePublic(replacement.id);

    const initialRevision = await currentDraftRevision(store.slug);
    const firstPut = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${store.slug}/featured`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${session.token}`,
        },
        body: JSON.stringify({
          game_slugs: [original.slug],
          expected_draft_revision: initialRevision,
        }),
      },
    );
    expect(firstPut.status).toBe(200);

    const staleRevision = await currentDraftRevision(store.slug);
    const secondPut = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${store.slug}/featured`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${session.token}`,
        },
        body: JSON.stringify({
          game_slugs: [replacement.slug],
          expected_draft_revision: staleRevision,
        }),
      },
    );
    expect(secondPut.status).toBe(200);

    const currentRevision = await currentDraftRevision(store.slug);
    expect(currentRevision).toBe(staleRevision + 1);

    const staleDelete = await deleteSelection(
      store.slug,
      session.token,
      staleRevision,
    );
    expect(staleDelete.status).toBe(409);
    await expect(staleDelete.json()).resolves.toEqual(
      expect.objectContaining({ name: "ConflictError" }),
    );
    await expect(currentDraftRevision(store.slug)).resolves.toBe(
      currentRevision,
    );
    await expect(
      prisma.storeFeaturedGame.findMany({
        where: { store_id: store.id },
        orderBy: { position: "asc" },
        select: { game_id: true },
      }),
    ).resolves.toEqual([{ game_id: replacement.id }]);
  });
});
