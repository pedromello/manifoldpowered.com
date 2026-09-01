import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("PATCH /api/v1/stores/[slug]", () => {
  test("requires authentication and the owner-only presentation feature", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const createdStore = await orchestrator.createStore(owner.id, {
      draft: true,
    });

    const response = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "If-Match": '"1"',
        },
        body: JSON.stringify({ name: "New Name" }),
      },
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      name: "ForbiddenError",
      action:
        "Verify your user has the following features: update:store_presentation",
    });
  });

  test("saves a draft with a stable slug and returns the next ETag", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const session = await orchestrator.createSession(owner.id);
    const createdStore = await orchestrator.createStore(owner.id, {
      name: "Stable Outlet Name",
      draft: true,
    });

    const response = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${session.token}`,
          "If-Match": '"1"',
        },
        body: JSON.stringify({
          name: "Renamed Outlet",
          layout_preset: "editorial",
          logo_url: "https://example.com/logo.png",
          cover_url: "https://example.com/cover.jpg",
          social_links: { x: "https://x.com/creator" },
          brand_tokens: {
            palette: "ocean",
            typography: "editorial",
            shape: "crisp",
          },
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("etag")).toBe('"2"');
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({
      slug: createdStore.slug,
      name: "Renamed Outlet",
      publication_status: "DRAFT",
      draft_revision: 2,
      has_unpublished_changes: true,
      layout_preset: "editorial",
    });
  });

  test("rejects a missing or stale If-Match without changing the draft", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const session = await orchestrator.createSession(owner.id);
    const createdStore = await orchestrator.createStore(owner.id, {
      name: "Concurrent Outlet",
      draft: true,
    });
    const endpoint = `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}`;
    const commonHeaders = {
      "Content-Type": "application/json",
      Cookie: `session_id=${session.token}`,
    };

    const missing = await fetch(endpoint, {
      method: "PATCH",
      headers: commonHeaders,
      body: JSON.stringify({ tagline: "Missing version" }),
    });
    expect(missing.status).toBe(400);

    const first = await fetch(endpoint, {
      method: "PATCH",
      headers: { ...commonHeaders, "If-Match": '"1"' },
      body: JSON.stringify({ tagline: "First writer" }),
    });
    expect(first.status).toBe(200);

    const stale = await fetch(endpoint, {
      method: "PATCH",
      headers: { ...commonHeaders, "If-Match": '"1"' },
      body: JSON.stringify({ tagline: "Stale writer" }),
    });
    expect(stale.status).toBe(409);

    const preview = await fetch(`${endpoint}?preview=1`, {
      headers: { Cookie: `session_id=${session.token}` },
    });
    expect(await preview.json()).toMatchObject({
      tagline: "First writer",
      draft_revision: 2,
    });
  });

  test.each([
    { layout_preset: "bespoke" },
    {
      brand_tokens: {
        palette: "custom-hex",
        typography: "modern",
        shape: "soft",
      },
    },
    { logo_url: "not-a-url" },
    { logo_url: "http://example.com/logo.png" },
    { cover_url: "javascript:alert(1)" },
    { social_links: { discord: "https://discord.example/creator" } },
  ])("rejects unsafe presentation input %#", async (body) => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const session = await orchestrator.createSession(owner.id);
    const createdStore = await orchestrator.createStore(owner.id, {
      draft: true,
    });

    const response = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${session.token}`,
          "If-Match": '"1"',
        },
        body: JSON.stringify(body),
      },
    );

    expect(response.status).toBe(400);
  });

  test.each([
    { slug: "forged-slug" },
    { theme_key: "neon-alley" },
    { commission_rate: "1" },
  ])("cannot forge server-controlled Store fields %#", async (body) => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const session = await orchestrator.createSession(owner.id);
    const createdStore = await orchestrator.createStore(owner.id, {
      draft: true,
    });

    const response = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${session.token}`,
          "If-Match": '"1"',
        },
        body: JSON.stringify(body),
      },
    );

    expect(response.status).toBe(400);
  });

  test("does not delegate presentation writes through update:store", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const createdStore = await orchestrator.createStore(owner.id, {
      draft: true,
    });
    const member = await orchestrator.createUser();
    await orchestrator.activateUser(member.id);
    await orchestrator.addStoreMember(createdStore.id, member.username, [
      "update:store",
    ]);
    const memberSession = await orchestrator.createSession(member.id);

    const response = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session_id=${memberSession.token}`,
          "If-Match": '"1"',
        },
        body: JSON.stringify({ name: "Member takeover" }),
      },
    );

    expect(response.status).toBe(403);
  });
});
