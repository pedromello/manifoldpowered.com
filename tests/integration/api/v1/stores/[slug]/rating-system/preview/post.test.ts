import { prisma } from "infra/database";
import orchestrator from "tests/orchestrator";
import {
  ratingFixture,
  ratingSystemRequest,
} from "tests/integration/api/v1/_support/outlet-ratings";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
});
beforeEach(async () => {
  await orchestrator.clearDatabaseRows();
});

describe("POST Outlet rating-system preview", () => {
  test("counts hidden reviews without writing the draft or any rating", async () => {
    const fixture = await ratingFixture("NUMERIC_10");
    const game = await orchestrator.createGame(fixture.owner.id);
    await prisma.storeGameEditorial.create({
      data: {
        store_id: fixture.outlet.id,
        game_id: game.id,
        body: "",
        rating_scale: "NUMERIC_10",
        rating_value: 15,
      },
    });
    await prisma.storeGameOverride.create({
      data: {
        store_id: fixture.outlet.id,
        game_id: game.id,
        visibility: "HIDE",
      },
    });
    const before = await prisma.storeGameEditorial.findMany();
    const response = await ratingSystemRequest(
      fixture.outlet.slug,
      fixture.session.token,
      "POST",
      { target_scale: "TIER", expected_draft_revision: 1 },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await response.json();
    expect(body).toEqual(
      expect.objectContaining({
        source_scale: "NUMERIC_10",
        target_scale: "TIER",
        draft_revision: 1,
        rated_count: 1,
        unrated_count: 0,
      }),
    );
    expect(body.mapping).toHaveLength(21);
    expect(body.mapping).toContainEqual({ from: 7.5, to: "B+", count: 1 });
    expect(await prisma.storeGameEditorial.findMany()).toEqual(before);
    expect(
      (
        await prisma.store.findUniqueOrThrow({
          where: { id: fixture.outlet.id },
        })
      ).draft_revision,
    ).toBe(1);
  });

  test("requires current revision and resource-scoped permission", async () => {
    const fixture = await ratingFixture("STARS");
    const outsider = await orchestrator.createUser();
    await orchestrator.activateUser(outsider.id);
    await orchestrator.createStore(outsider.id);
    const session = await orchestrator.createSession(outsider.id);
    const forbidden = await ratingSystemRequest(
      fixture.outlet.slug,
      session.token,
      "POST",
      { target_scale: "TIER", expected_draft_revision: 1 },
    );
    expect(forbidden.status).toBe(403);
    const stale = await ratingSystemRequest(
      fixture.outlet.slug,
      fixture.session.token,
      "POST",
      { target_scale: "TIER", expected_draft_revision: 2 },
    );
    expect(stale.status).toBe(409);
  });
});
