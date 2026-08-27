import { randomUUID } from "node:crypto";
import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";
import { prisma } from "infra/database";
import gameRelease from "models/game_release";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

async function publisher() {
  const user = await orchestrator.createUser();
  await orchestrator.activateUser(user.id);
  await orchestrator.addFeaturesToUser(user.id, ["create:game_release"]);
  return {
    user,
    session: await orchestrator.createSession(user.id),
    game: await orchestrator.createGame(user.id, {
      title: `Patch release ${randomUUID()}`,
    }),
  };
}

describe("PATCH /api/v1/games/[slug]/releases/[release_id]", () => {
  test("updates a draft release", async () => {
    const { game, session } = await publisher();
    const release = await gameRelease.createDraft({
      game_id: game.id,
      version: "1.0.0",
      release_notes: "Old notes",
    });

    const response = await fetch(
      `${webserver.getOrigin()}/api/v1/games/${game.slug}/releases/${release.id}`,
      {
        method: "PATCH",
        headers: {
          Cookie: `session_id=${session.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ version: "1.1.0", release_notes: "New notes" }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: release.id,
      version: "1.1.0",
      release_notes: "New notes",
      status: "DRAFT",
    });
  });

  test("clears release notes when explicitly set to null", async () => {
    const { game, session } = await publisher();
    const release = await gameRelease.createDraft({
      game_id: game.id,
      version: "1.0.0",
      release_notes: "Notes to remove",
    });

    const response = await fetch(
      `${webserver.getOrigin()}/api/v1/games/${game.slug}/releases/${release.id}`,
      {
        method: "PATCH",
        headers: {
          Cookie: `session_id=${session.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ release_notes: null }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: release.id,
      release_notes: null,
    });
    await expect(
      prisma.gameRelease.findUnique({ where: { id: release.id } }),
    ).resolves.toMatchObject({ release_notes: null });
  });

  test("rejects updates after publication", async () => {
    const { game, session } = await publisher();
    const release = await gameRelease.createDraft({
      game_id: game.id,
      version: "1.0.0",
    });
    await prisma.gameRelease.update({
      where: { id: release.id },
      data: { status: "PUBLISHED", published_at: new Date() },
    });

    const response = await fetch(
      `${webserver.getOrigin()}/api/v1/games/${game.slug}/releases/${release.id}`,
      {
        method: "PATCH",
        headers: {
          Cookie: `session_id=${session.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ version: "2.0.0" }),
      },
    );

    expect(response.status).toBe(400);
  });

  test("rejects an outsider even when they hold the publication feature", async () => {
    const owner = await publisher();
    const release = await gameRelease.createDraft({
      game_id: owner.game.id,
      version: "1.0.0",
    });
    const outsider = await orchestrator.createUser();
    await orchestrator.activateUser(outsider.id);
    await orchestrator.addFeaturesToUser(outsider.id, ["create:game_release"]);
    const session = await orchestrator.createSession(outsider.id);

    const response = await fetch(
      `${webserver.getOrigin()}/api/v1/games/${owner.game.slug}/releases/${release.id}`,
      {
        method: "PATCH",
        headers: {
          Cookie: `session_id=${session.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ version: "2.0.0" }),
      },
    );

    expect(response.status).toBe(403);
  });
});
