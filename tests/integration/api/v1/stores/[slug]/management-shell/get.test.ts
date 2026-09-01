import webserver from "infra/webserver";
import orchestrator from "tests/orchestrator";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
});

beforeEach(async () => {
  await orchestrator.clearDatabaseRows();
});

function getManagementShell(slug: string, sessionToken?: string) {
  return fetch(
    `${webserver.getOrigin()}/api/v1/stores/${slug}/management-shell`,
    {
      headers: sessionToken
        ? { Cookie: `session_id=${sessionToken}` }
        : undefined,
    },
  );
}

describe("GET /api/v1/stores/[slug]/management-shell", () => {
  test("returns the private allowlisted shell and centralized capabilities to the owner", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const session = await orchestrator.createSession(owner.id);
    const outlet = await orchestrator.createStore(owner.id, {
      status: "DRAFT",
      description: "Unpublished creator strategy must not be in the shell.",
      logo_url: "https://cdn.example.test/private-logo.png",
    });

    const response = await getManagementShell(outlet.slug, session.token);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(response.headers.get("Vary")).toBe("Cookie");
    await expect(response.json()).resolves.toEqual({
      store: {
        id: outlet.id,
        slug: outlet.slug,
        name: outlet.name,
        owner_id: owner.id,
        status: "DRAFT",
        published_at: null,
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

  test("admits a statement-only delegate without leaking any draft field", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const outlet = await orchestrator.createStore(owner.id, {
      status: "DRAFT",
      description: "Secret draft description",
      logo_url: "https://cdn.example.test/secret.png",
    });
    const delegate = await orchestrator.createUser();
    await orchestrator.activateUser(delegate.id);
    const session = await orchestrator.createSession(delegate.id);
    await orchestrator.addStoreMember(outlet.id, delegate.username, [
      "read:store_statement",
    ]);

    const response = await getManagementShell(outlet.slug, session.token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      store: {
        id: outlet.id,
        slug: outlet.slug,
        name: outlet.name,
        owner_id: owner.id,
        status: "DRAFT",
        published_at: null,
      },
      capabilities: {
        identity: false,
        curation: false,
        featured: false,
        sales: false,
        earnings: true,
        edit: false,
        publish: false,
        unpublish: false,
      },
    });
    expect(Object.keys(body.store)).toEqual([
      "id",
      "slug",
      "name",
      "owner_id",
      "status",
      "published_at",
    ]);
    expect(JSON.stringify(body)).not.toMatch(
      /description|logo_url|catalog|draft_revision|readiness|presentation|snapshot/,
    );
  });

  test("fails closed for an authenticated user without a scoped management domain", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const outlet = await orchestrator.createStore(owner.id, {
      status: "DRAFT",
    });
    const outsider = await orchestrator.createUser();
    await orchestrator.activateUser(outsider.id);
    const session = await orchestrator.createSession(outsider.id);

    const response = await getManagementShell(outlet.slug, session.token);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        name: "ForbiddenError",
        status_code: 403,
      }),
    );
  });
});
