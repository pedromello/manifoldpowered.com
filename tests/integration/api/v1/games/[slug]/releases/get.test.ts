import { randomUUID } from "node:crypto";
import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";
import { prisma } from "infra/database";
import gameRelease from "models/game_release";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

async function authenticatedPublisher() {
  const user = await orchestrator.createUser();
  await orchestrator.activateUser(user.id);
  await orchestrator.addFeaturesToUser(user.id, ["create:game_release"]);
  const session = await orchestrator.createSession(user.id);
  const game = await orchestrator.createGame(user.id, {
    title: `Release listing ${randomUUID()}`,
  });
  return { user, session, game };
}

function url(slug: string, query = "") {
  return `${webserver.getOrigin()}/api/v1/games/${slug}/releases${query}`;
}

describe("GET /api/v1/games/[slug]/releases", () => {
  test("requires authentication", async () => {
    const { game } = await authenticatedPublisher();
    const response = await fetch(url(game.slug));

    expect(response.status).toBe(401);
  });

  test("returns an empty paginated list for the authorized publisher", async () => {
    const { game, session } = await authenticatedPublisher();
    const response = await fetch(url(game.slug), {
      headers: { Cookie: `session_id=${session.token}` },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      game: { id: game.id, slug: game.slug, title: game.title },
      releases: [],
      pagination: { page: 1, limit: 20, total: 0, pages: 0 },
    });
  });

  test("returns drafts and published releases in release-number order", async () => {
    const { game, session } = await authenticatedPublisher();
    const draft = await gameRelease.createDraft({
      game_id: game.id,
      version: "2.0.0",
      release_notes: "Draft notes",
    });
    const published = await gameRelease.createDraft({
      game_id: game.id,
      version: "1.0.0",
      release_notes: "Published notes",
    });
    await prisma.gameRelease.update({
      where: { id: published.id },
      data: { status: "PUBLISHED", published_at: new Date("2026-01-01") },
    });
    await prisma.gameArtifact.create({
      data: {
        release_id: published.id,
        platform: "WINDOWS",
        architecture: "X86_64",
        archive_format: "ZIP",
        storage_object_key: `internal/${randomUUID()}`,
        compressed_size_bytes: BigInt(12),
        installed_size_bytes: BigInt(20),
        sha256: "a".repeat(64),
        manifest_schema_version: "1",
        manifest: {
          schema_version: "1",
          release_id: published.id,
          artifact_id: randomUUID(),
          entrypoint: "game.exe",
          environment: { SECRET_TOKEN: "must-not-leak" },
        },
        status: "READY",
      },
    });

    const response = await fetch(url(game.slug), {
      headers: { Cookie: `session_id=${session.token}` },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.releases.map((release: { id: string }) => release.id)).toEqual([
      published.id,
      draft.id,
    ]);
    expect(body.releases[0]).toMatchObject({
      version: "1.0.0",
      status: "PUBLISHED",
      release_notes: "Published notes",
    });
    expect(body.releases[1]).toMatchObject({
      version: "2.0.0",
      status: "DRAFT",
      release_notes: "Draft notes",
    });
    expect(body.releases[0].artifacts[0]).toMatchObject({
      platform: "WINDOWS",
      architecture: "X86_64",
      status: "READY",
      compressed_size_bytes: "12",
    });
    expect(JSON.stringify(body)).not.toContain("storage_object_key");
    expect(JSON.stringify(body)).not.toContain("SECRET_TOKEN");
    expect(JSON.stringify(body)).not.toContain("must-not-leak");
  });

  test("enforces game ownership and pagination limits", async () => {
    const owner = await authenticatedPublisher();
    const outsider = await orchestrator.createUser();
    await orchestrator.activateUser(outsider.id);
    await orchestrator.addFeaturesToUser(outsider.id, ["create:game_release"]);
    const outsiderSession = await orchestrator.createSession(outsider.id);

    const forbidden = await fetch(url(owner.game.slug), {
      headers: { Cookie: `session_id=${outsiderSession.token}` },
    });
    expect(forbidden.status).toBe(403);

    await gameRelease.createDraft({ game_id: owner.game.id, version: "1" });
    await gameRelease.createDraft({ game_id: owner.game.id, version: "2" });
    const paginated = await fetch(url(owner.game.slug, "?page=2&limit=1"), {
      headers: { Cookie: `session_id=${owner.session.token}` },
    });
    const body = await paginated.json();
    expect(paginated.status).toBe(200);
    expect(body.releases).toHaveLength(1);
    expect(body.pagination).toEqual({ page: 2, limit: 1, total: 2, pages: 2 });
  });

  test("returns 404 for an unknown game", async () => {
    const { session } = await authenticatedPublisher();
    const response = await fetch(url(`missing-${randomUUID()}`), {
      headers: { Cookie: `session_id=${session.token}` },
    });

    expect(response.status).toBe(404);
  });
});
