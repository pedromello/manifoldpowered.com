import orchestrator from "tests/orchestrator";
import {
  createCurationFixture,
  createOutsiderSession,
  expectPrivateResponse,
  storeApiUrl,
} from "tests/integration/api/v1/_support/store-curation";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("GET /api/v1/stores/[slug]/publication", () => {
  test("returns the private, filtered publication state and capabilities", async () => {
    const fixture = await createCurationFixture();
    const response = await fetch(
      storeApiUrl(fixture.store.slug, "publication"),
      { headers: { Cookie: `session_id=${fixture.sessionToken}` } },
    );

    expect(response.status).toBe(200);
    expectPrivateResponse(response);
    await expect(response.json()).resolves.toEqual({
      status: "DRAFT",
      catalog_mode: "UNDECIDED",
      draft_revision: fixture.store.draft_revision,
      published_at: null,
      last_published_at: null,
      published_revision: null,
      readiness: {
        version: 2,
        ready: false,
        catalog_game_count: 0,
        checks: {
          brand_complete: expect.any(Boolean),
          visual_identity: false,
          catalog_intentional: false,
          catalog_has_games: false,
          editorial_highlight: false,
        },
        blockers: expect.any(Array),
      },
      capabilities: {
        identity: true,
        curation: true,
        featured: true,
        sales: true,
        earnings: true,
        edit: true,
        publish: true,
        unpublish: true,
      },
    });
  });

  test("returns exact authentication and resource authorization errors", async () => {
    const fixture = await createCurationFixture();
    const outsiderSession = await createOutsiderSession();
    const url = storeApiUrl(fixture.store.slug, "publication");

    const anonymous = await fetch(url);
    const outsider = await fetch(url, {
      headers: { Cookie: `session_id=${outsiderSession.token}` },
    });

    expect(anonymous.status).toBe(401);
    await expect(anonymous.json()).resolves.toEqual({
      message: "Authentication required",
      name: "UnauthorizedError",
      action: "Sign in and send the session_id cookie",
      status_code: 401,
    });
    expect(outsider.status).toBe(403);
    await expect(outsider.json()).resolves.toEqual({
      message: "You do not have permission to inspect this Outlet's draft.",
      name: "ForbiddenError",
      action: "Ask the Outlet owner for an editing or publication permission.",
      status_code: 403,
    });
    expectPrivateResponse(outsider);
  });

  test("allows a resource-scoped editor to inspect readiness", async () => {
    const fixture = await createCurationFixture();
    const editor = await orchestrator.createUser();
    await orchestrator.activateUser(editor.id);
    const session = await orchestrator.createSession(editor.id);
    await orchestrator.addStoreMember(fixture.store.id, editor.username, [
      "update:store",
    ]);

    const response = await fetch(
      storeApiUrl(fixture.store.slug, "publication"),
      { headers: { Cookie: `session_id=${session.token}` } },
    );

    expect(response.status).toBe(200);
    expect((await response.json()).capabilities).toEqual(
      expect.objectContaining({ edit: true, publish: false }),
    );
  });
});
