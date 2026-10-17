import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prisma } from "infra/database";
import webserver from "infra/webserver";
import orchestrator from "tests/orchestrator";
import {
  authenticatedJsonHeaders,
  createLifecycleActor,
  createReadyDraft,
  publicationRequest,
  type ReadyDraftFixture,
} from "tests/integration/api/v1/_support/outlet-lifecycle";

beforeAll(async () => {
  const build = spawnSync(process.execPath, ["tools/cli/build.mjs"], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 30000,
  });
  if (build.status !== 0)
    throw new Error(
      `Could not build the CLI integration artifact: ${build.stderr}`,
    );
  await orchestrator.waitForAllServices();
});
beforeEach(() => orchestrator.clearDatabaseRows());
afterAll(() => prisma.$disconnect());

const origin = () => webserver.getOrigin();
function collection(f: ReadyDraftFixture, slug = "weekend") {
  return `${origin()}/api/v1/stores/${f.store.slug}/selections/${slug}`;
}
async function publishOutlet(f: ReadyDraftFixture) {
  const response = await publicationRequest(
    f.store.slug,
    f.sessionToken,
    "publish",
    f.store.draft_revision,
  );
  expect(response.status).toBe(200);
}
async function createSelection(f: ReadyDraftFixture, slug = "weekend") {
  const response = await fetch(
    `${origin()}/api/v1/stores/${f.store.slug}/selections`,
    {
      method: "POST",
      headers: authenticatedJsonHeaders(f.sessionToken),
      body: JSON.stringify({
        slug,
        title: "A weekend together",
        description: "Games worth sharing with a few good friends.",
        cover_url:
          "https://images.unsplash.com/photo-1511512578047-dfb367046420",
        game_slugs: [f.games[1].slug, f.games[0].slug],
      }),
    },
  );
  expect(response.status).toBe(201);
  return (await response.json()).selection;
}
function publication(
  f: ReadyDraftFixture,
  action: string,
  revision: number,
  slug = "weekend",
) {
  return fetch(`${collection(f, slug)}/publication`, {
    method: "POST",
    headers: authenticatedJsonHeaders(f.sessionToken),
    body: JSON.stringify({ action, expected_draft_revision: revision }),
  });
}

describe("named outlet selections", () => {
  test("keeps drafts private, shares ordered immutable editions, and withdraws all public projections", async () => {
    const f = await createReadyDraft("Selection edition");
    const selection = await createSelection(f);
    expect((await fetch(collection(f))).status).toBe(404);
    expect((await publication(f, "publish", 1)).status).toBe(400);
    await publishOutlet(f);
    const published = await publication(f, "publish", selection.draft_revision);
    expect(published.status).toBe(200);
    const edition = (await published.json()).selection;
    expect(edition.published_revision).toBe(1);
    const edited = await fetch(collection(f), {
      method: "PATCH",
      headers: authenticatedJsonHeaders(f.sessionToken),
      body: JSON.stringify({
        title: "Private title",
        expected_draft_revision: edition.draft_revision,
      }),
    });
    expect(edited.status).toBe(200);
    const draft = (await edited.json()).selection;
    expect(draft).toMatchObject({
      title: "Private title",
      description: selection.description,
      cover_url: selection.cover_url,
      game_slugs: selection.game_slugs,
    });
    const publicView = await (await fetch(collection(f))).json();
    expect(publicView.selection).toMatchObject({
      title: selection.title,
      published_revision: 1,
    });
    expect(publicView.selection).not.toHaveProperty("draft_revision");
    expect(publicView.games.map((game: { slug: string }) => game.slug)).toEqual(
      selection.game_slugs,
    );
    const preview = await fetch(`${collection(f)}?preview=1`, {
      headers: authenticatedJsonHeaders(f.sessionToken),
    });
    expect(preview.headers.get("cache-control")).toBe("private, no-store");
    expect((await preview.json()).selection.title).toBe("Private title");
    const html = await fetch(`${origin()}/en${selection.public_path}`);
    expect(html.status).toBe(200);
    const source = await html.text();
    expect(source).toContain('"@type":"CollectionPage"');
    expect(source).toContain('property="og:image"');
    expect(source).toContain(selection.title);
    expect(source).not.toContain("Private title");
    const socialImage = await fetch(
      `${origin()}/api/og/selection/${f.store.slug}/weekend`,
    );
    expect(socialImage.status).toBe(200);
    expect(socialImage.headers.get("content-type")).toContain("image/png");
    expect((await socialImage.arrayBuffer()).byteLength).toBeGreaterThan(1000);
    expect(await (await fetch(`${origin()}/sitemap.xml`)).text()).toContain(
      selection.public_path,
    );
    expect(
      (await publication(f, "publish", edition.draft_revision)).status,
    ).toBe(409);
    const republished = await publication(f, "publish", draft.draft_revision);
    expect(republished.status).toBe(200);
    const second = (await republished.json()).selection;
    expect(second.published_revision).toBe(2);
    expect(
      await prisma.storeSelectionRevision.count({
        where: { selection_id: selection.id },
      }),
    ).toBe(2);
    expect(
      (await publication(f, "unpublish", second.draft_revision)).status,
    ).toBe(200);
    expect((await fetch(collection(f))).status).toBe(404);
    expect((await fetch(`${origin()}/en${selection.public_path}`)).status).toBe(
      404,
    );
    expect(
      (await fetch(`${origin()}/api/og/selection/${f.store.slug}/weekend`))
        .status,
    ).toBe(404);
    expect(await (await fetch(`${origin()}/sitemap.xml`)).text()).not.toContain(
      selection.public_path,
    );
    expect(
      (await (await fetch(`${origin()}/api/v1/public/selections`)).json())
        .selections,
    ).toEqual([]);
  });

  test("rejects foreign accounts, invalid membership, duplicate addresses, and competing writes", async () => {
    const f = await createReadyDraft("Selection isolation");
    const outsider = await createLifecycleActor();
    const selection = await createSelection(f);
    expect(
      (
        await fetch(`${collection(f)}?preview=1`, {
          headers: authenticatedJsonHeaders(outsider.sessionToken),
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(collection(f), {
          method: "PATCH",
          headers: authenticatedJsonHeaders(outsider.sessionToken),
          body: JSON.stringify({ title: "Stolen", expected_draft_revision: 1 }),
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(`${collection(f)}/publication`, {
          method: "POST",
          headers: authenticatedJsonHeaders(outsider.sessionToken),
          body: JSON.stringify({
            action: "publish",
            expected_draft_revision: 1,
          }),
        })
      ).status,
    ).toBe(403);
    for (const invalid of [
      { game_slugs: [f.games[0].slug, f.games[0].slug] },
      { game_slugs: ["missing-game"] },
      { cover_url: "https://127.0.0.1/private.png" },
      { cover_url: "https://localhost./private.png" },
      { image_urls: ["https://service.internal./private.png"] },
    ]) {
      expect(
        (
          await fetch(collection(f), {
            method: "PATCH",
            headers: authenticatedJsonHeaders(f.sessionToken),
            body: JSON.stringify({ ...invalid, expected_draft_revision: 1 }),
          })
        ).status,
      ).toBe(400);
    }
    const duplicate = await fetch(
      `${origin()}/api/v1/stores/${f.store.slug}/selections`,
      {
        method: "POST",
        headers: authenticatedJsonHeaders(f.sessionToken),
        body: JSON.stringify({ slug: selection.slug, title: "Duplicate" }),
      },
    );
    expect(duplicate.status).toBe(400);
    const responses = await Promise.all(
      ["Writer one", "Writer two"].map((title) =>
        fetch(collection(f), {
          method: "PATCH",
          headers: authenticatedJsonHeaders(f.sessionToken),
          body: JSON.stringify({ title, expected_draft_revision: 1 }),
        }),
      ),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      (
        await prisma.storeSelection.findUniqueOrThrow({
          where: { id: selection.id },
        })
      ).draft_revision,
    ).toBe(2);
    // A separate selection can overlap without transferring account ownership.
    expect((await createSelection(f, "another-weekend")).game_slugs).toEqual(
      selection.game_slugs,
    );
  });

  test("uses published catalog eligibility and removes inactive titles and unpublished outlets", async () => {
    const f = await createReadyDraft("Selection visibility");
    await publishOutlet(f);
    await createSelection(f);
    expect((await publication(f, "publish", 1)).status).toBe(200);
    await prisma.game.update({
      where: { id: f.games[1].id },
      data: { status: "INACTIVE" },
    });
    const view = await (await fetch(collection(f))).json();
    expect(view.games.map((game: { slug: string }) => game.slug)).toEqual([
      f.games[0].slug,
    ]);
    expect(view.selection.game_slugs).toEqual([f.games[0].slug]);
    const state = await (
      await fetch(`${collection(f)}/publication`, {
        headers: authenticatedJsonHeaders(f.sessionToken),
      })
    ).json();
    expect(state.readiness.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "GAMES_OUTSIDE_PUBLISHED_CATALOG" }),
      ]),
    );
    const latest = await prisma.store.findUniqueOrThrow({
      where: { id: f.store.id },
    });
    expect(
      (
        await publicationRequest(
          f.store.slug,
          f.sessionToken,
          "unpublish",
          latest.draft_revision,
        )
      ).status,
    ).toBe(200);
    expect((await fetch(collection(f))).status).toBe(404);
    expect(
      (await (await fetch(`${origin()}/api/v1/public/selections`)).json())
        .selections,
    ).toEqual([]);
  });

  test("follows the published outlet catalog until a new catalog edition excludes a game", async () => {
    const f = await createReadyDraft("Selection catalog boundary");
    await publishOutlet(f);
    await createSelection(f);
    expect((await publication(f, "publish", 1)).status).toBe(200);
    await orchestrator.addStoreGameOverride(
      f.store.id,
      f.games[1].slug,
      "HIDE",
    );
    expect((await (await fetch(collection(f))).json()).games).toHaveLength(2);
    const state = await (
      await fetch(`${collection(f)}/publication`, {
        headers: authenticatedJsonHeaders(f.sessionToken),
      })
    ).json();
    expect(state.readiness.ready).toBe(true);
    const outlet = await prisma.store.findUniqueOrThrow({
      where: { id: f.store.id },
    });
    expect(
      (
        await publicationRequest(
          outlet.slug,
          f.sessionToken,
          "publish",
          outlet.draft_revision,
        )
      ).status,
    ).toBe(200);
    const view = await (await fetch(collection(f))).json();
    expect(view.games.map((game: { slug: string }) => game.slug)).toEqual([
      f.games[0].slug,
    ]);
    expect((await publication(f, "publish", 2)).status).toBe(400);
  });

  test("discovery recovers an older usable selection and fills from other usable outlets", async () => {
    const f = await createReadyDraft("Discovery fallback");
    await publishOutlet(f);
    const older = await createSelection(f, "older-usable");
    expect((await publication(f, "publish", 1, older.slug)).status).toBe(200);
    const newest = await createSelection(f, "newest-unavailable");
    const newestEdit = await fetch(collection(f, newest.slug), {
      method: "PATCH",
      headers: authenticatedJsonHeaders(f.sessionToken),
      body: JSON.stringify({
        game_slugs: [f.games[5].slug],
        expected_draft_revision: 1,
      }),
    });
    expect(newestEdit.status).toBe(200);
    expect((await publication(f, "publish", 2, newest.slug)).status).toBe(200);
    await prisma.game.update({
      where: { id: f.games[5].id },
      data: { status: "INACTIVE" },
    });
    const withOlder = await (
      await fetch(`${origin()}/api/v1/public/selections?limit=1`)
    ).json();
    expect(
      withOlder.selections.map(
        (view: { selection: { slug: string } }) => view.selection.slug,
      ),
    ).toEqual([older.slug]);

    // Publish five more recent empty-at-read-time outlets: the usable pick
    // must be found beyond the first six-candidate batch.
    for (let index = 0; index < 5; index++) {
      const hidden = await createReadyDraft(`Unavailable discovery ${index}`);
      await publishOutlet(hidden);
      await createSelection(hidden);
      expect((await publication(hidden, "publish", 1)).status).toBe(200);
      await prisma.game.updateMany({
        where: { id: { in: [hidden.games[0].id, hidden.games[1].id] } },
        data: { status: "INACTIVE" },
      });
    }
    const afterUnavailable = await (
      await fetch(`${origin()}/api/v1/public/selections?limit=1`)
    ).json();
    expect(afterUnavailable.selections).toHaveLength(1);
    expect(afterUnavailable.selections[0].outlet.slug).toBe(f.store.slug);
    expect(afterUnavailable.selections[0].selection.slug).toBe(older.slug);
  });

  test("public lists, detail and discovery preserve regional eligibility and display-only games", async () => {
    const f = await createReadyDraft("Selection region");
    await publishOutlet(f);
    await createSelection(f);
    expect((await publication(f, "publish", 1)).status).toBe(200);
    // With no USD→BRL exchange rate, only explicit BRL overrides support
    // ACTIVE games; informational ONLY_DISPLAY games remain discoverable.
    await orchestrator.createCurrency({
      code: "BRL",
      symbol: "R$",
      enabled: true,
    });
    await prisma.game.update({
      where: { id: f.games[0].id },
      data: { status: "ONLY_DISPLAY" },
    });
    const headers = { "x-vercel-ip-country": "BR" };
    const detail = await (await fetch(collection(f), { headers })).json();
    expect(detail.currency).toBe("BRL");
    expect(detail.games.map((game: { slug: string }) => game.slug)).toEqual([
      f.games[0].slug,
    ]);
    const list = await (
      await fetch(`${origin()}/api/v1/stores/${f.store.slug}/selections`, {
        headers,
      })
    ).json();
    expect(list.selections[0].game_slugs).toEqual(detail.selection.game_slugs);
    const discovery = await (
      await fetch(`${origin()}/api/v1/public/selections`, { headers })
    ).json();
    expect(
      discovery.selections[0].games.map((game: { slug: string }) => game.slug),
    ).toEqual([f.games[0].slug]);
    const privateList = await (
      await fetch(
        `${origin()}/api/v1/stores/${f.store.slug}/selections?preview=1`,
        {
          headers: { ...headers, ...authenticatedJsonHeaders(f.sessionToken) },
        },
      )
    ).json();
    expect(privateList.selections[0].game_slugs).toEqual([
      f.games[1].slug,
      f.games[0].slug,
    ]);
  });

  test("runs the built CLI against the real HTTP API through creation, ordering, conflict, preview, publication and withdrawal", async () => {
    const f = await createReadyDraft("CLI selection");
    await publishOutlet(f);
    const directory = await mkdtemp(
      join(tmpdir(), "selection-cli-integration-"),
    );
    const env = {
      ...process.env,
      MANIFOLD_CLI_HOME: directory,
      MANIFOLD_SESSION_TOKEN: f.sessionToken,
      MANIFOLD_SESSION_ORIGIN: origin(),
      MANIFOLD_SESSION_ACCOUNT: "selection-test",
      MANIFOLD_SESSION_ENV: "local",
    };
    function cli(args: string[], payload?: unknown, expected = 0) {
      const child = spawnSync(
        process.execPath,
        [
          "tools/cli/dist/index.js",
          ...args,
          "--env",
          "local",
          "--account",
          "selection-test",
          "--json",
          ...(payload ? ["--input", "-"] : []),
        ],
        {
          env,
          input: payload ? JSON.stringify(payload) : undefined,
          encoding: "utf8",
          windowsHide: true,
          timeout: 30000,
        },
      );
      expect(child.status).toBe(expected);
      expect(child.stdout).not.toContain(f.sessionToken);
      return JSON.parse(child.stdout);
    }
    const ref = { slug: f.store.slug, selection_slug: "cli-weekend" };
    try {
      cli(["env", "connect", "--url", origin()]);
      const created = cli(["outlets", "selections", "create"], {
        ...ref,
        title: "Weekend discoveries",
        description: "A curated weekend list created with the agent CLI.",
        cover_url:
          "https://images.unsplash.com/photo-1511512578047-dfb367046420",
        game_slugs: [f.games[0].slug, f.games[1].slug],
      }).data.selection;
      const reordered = cli(["outlets", "selections", "games", "set"], {
        ...ref,
        expected_draft_revision: created.draft_revision,
        game_slugs: [f.games[1].slug, f.games[0].slug],
      }).data.selection;
      expect(reordered.game_slugs).toEqual([f.games[1].slug, f.games[0].slug]);
      expect(
        cli(["outlets", "selections", "readiness"], ref).data.readiness.ready,
      ).toBe(true);
      expect(
        cli(["outlets", "selections", "preview"], ref).data.preview_url,
      ).toContain("?preview=1");
      const published = cli(["outlets", "selections", "publish"], {
        ...ref,
        expected_draft_revision: reordered.draft_revision,
      }).data.selection;
      cli(
        ["outlets", "selections", "update"],
        {
          ...ref,
          title: "Stale writer",
          expected_draft_revision: reordered.draft_revision,
        },
        1,
      );
      expect(
        cli(["outlets", "selections", "public"], ref).data.selection.title,
      ).toBe("Weekend discoveries");
      expect(
        cli(["outlets", "selections", "discover"]).data.selections,
      ).toHaveLength(1);
      cli(["outlets", "selections", "unpublish"], {
        ...ref,
        expected_draft_revision: published.draft_revision,
      });
      cli(["outlets", "selections", "public"], ref, 1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
