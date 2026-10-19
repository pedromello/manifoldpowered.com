import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prisma } from "infra/database";
import webserver from "infra/webserver";
import orchestrator from "tests/orchestrator";
import {
  createReadyDraft,
  createLifecycleActor,
  authenticatedJsonHeaders,
  publicationRequest,
} from "tests/integration/api/v1/_support/outlet-lifecycle";

const firstVideo = "g7QcidQx73s";
const otherVideo = "M7lc1UVf-VE";
const origin = () => webserver.getOrigin();
beforeAll(async () => {
  const build = spawnSync(process.execPath, ["tools/cli/build.mjs"], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 30000,
  });
  expect(build.status).toBe(0);
  await orchestrator.waitForAllServices();
});
beforeEach(() => orchestrator.clearDatabaseRows());
afterAll(() => prisma.$disconnect());

test("the CLI creates, previews, publishes, replaces and removes a selection video without changing a public edition early", async () => {
  const f = await createReadyDraft("Video CLI");
  expect(
    (
      await publicationRequest(
        f.store.slug,
        f.sessionToken,
        "publish",
        f.store.draft_revision,
      )
    ).status,
  ).toBe(200);
  const stateDir = await mkdtemp(join(tmpdir(), "manifold-video-"));
  const env = {
    ...process.env,
    MANIFOLD_CLI_HOME: stateDir,
    MANIFOLD_SESSION_TOKEN: f.sessionToken,
    MANIFOLD_SESSION_ENV: "local",
    MANIFOLD_SESSION_ORIGIN: origin(),
    MANIFOLD_SESSION_ACCOUNT: "video-curator",
  };
  function cli(command: string[], input?: Record<string, unknown>) {
    const result = spawnSync(
      process.execPath,
      [
        "tools/cli/dist/index.js",
        ...command,
        "--env",
        "local",
        "--account",
        "video-curator",
        "--json",
        ...(input ? ["--input", "-"] : []),
      ],
      {
        env,
        input: input ? JSON.stringify(input) : undefined,
        encoding: "utf8",
        windowsHide: true,
        timeout: 30000,
      },
    );
    if (result.status !== 0) {
      const output = JSON.parse(result.stdout || "{}");
      throw new Error(
        JSON.stringify({
          command: command.join(" "),
          error: output.error,
          state: output.state,
        }),
      );
    }
    return JSON.parse(result.stdout);
  }
  try {
    cli(["env", "connect", "--url", origin()]);
    const ref = { slug: f.store.slug, selection_slug: "video-week" };
    cli(["outlets", "selections", "create"], {
      ...ref,
      title: "Videos and games",
      description: "A curated selection with an independent video.",
      cover_url: "https://example.com/cover.png",
      game_slugs: [f.games[0].slug],
      featured_video_url: `https://youtu.be/${firstVideo}?t=68`,
    });
    const preview = cli(["outlets", "selections", "preview"], ref);
    expect(preview.data.selection.featured_video.video_id).toBe(firstVideo);
    expect(preview.data.selection.featured_video.start_seconds).toBe(68);
    const published = cli(["outlets", "selections", "publish"], {
      ...ref,
      expected_draft_revision: 1,
    });
    const path = `${origin()}/api/v1/stores/${f.store.slug}/selections/video-week`;
    const publicView = async () => (await (await fetch(path)).json()).selection;
    cli(["outlets", "selections", "update"], {
      ...ref,
      expected_draft_revision: published.data.selection.draft_revision,
      featured_video_url: `https://www.youtube.com/watch?v=${otherVideo}&t=623`,
    });
    expect((await publicView()).featured_video.video_id).toBe(firstVideo);
    expect((await publicView()).featured_video.start_seconds).toBe(68);
    const state = cli(["outlets", "selections", "get"], ref);
    expect(state.data.selection.featured_video.video_id).toBe(otherVideo);
    expect(state.data.selection.featured_video.start_seconds).toBe(623);
    const renamed = cli(["outlets", "selections", "update"], {
      ...ref,
      expected_draft_revision: state.data.selection.draft_revision,
      title: "Title-only edit",
    });
    expect(
      cli(["outlets", "selections", "get"], ref).data.selection.featured_video
        .video_id,
    ).toBe(otherVideo);
    expect(
      cli(["outlets", "selections", "get"], ref).data.selection.featured_video
        .start_seconds,
    ).toBe(623);
    const removed = cli(["outlets", "selections", "update"], {
      ...ref,
      expected_draft_revision: renamed.data.selection.draft_revision,
      featured_video_url: null,
    });
    expect((await publicView()).featured_video.video_id).toBe(firstVideo);
    cli(["outlets", "selections", "publish"], {
      ...ref,
      expected_draft_revision: removed.data.selection.draft_revision,
    });
    expect((await publicView()).featured_video).toBeNull();
  } finally {
    if (!stateDir.startsWith(join(tmpdir(), "manifold-video-")))
      throw new Error("Unexpected temporary state path");
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("outlet videos obey publication boundaries, ownership and expected revisions", async () => {
  const f = await createReadyDraft("Video ownership");
  const stranger = await createLifecycleActor();
  const path = `${origin()}/api/v1/stores/${f.store.slug}`;
  const update = (
    token: string,
    revision: number,
    fields: Record<string, unknown>,
  ) =>
    fetch(path, {
      method: "PATCH",
      headers: {
        ...authenticatedJsonHeaders(token),
        "If-Match": `"${revision}"`,
      },
      body: JSON.stringify(fields),
    });
  expect(
    (
      await update(stranger.sessionToken, f.store.draft_revision, {
        featured_video_url: `https://youtu.be/${firstVideo}`,
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await update(f.sessionToken, f.store.draft_revision, {
        featured_video_url: `https://youtube.com.evil.test/watch?v=${firstVideo}`,
      })
    ).status,
  ).toBe(400);
  const changed = await update(f.sessionToken, f.store.draft_revision, {
    featured_video_url: `https://youtu.be/${firstVideo}?t=68`,
  });
  expect(changed.status).toBe(200);
  const draft = await changed.json();
  expect(draft.featured_video.video_id).toBe(firstVideo);
  expect(draft.featured_video.start_seconds).toBe(68);
  expect(
    (
      await publicationRequest(
        f.store.slug,
        f.sessionToken,
        "publish",
        draft.draft_revision,
      )
    ).status,
  ).toBe(200);
  const removed = await update(f.sessionToken, draft.draft_revision, {
    featured_video_url: null,
  });
  expect(removed.status).toBe(200);
  expect((await (await fetch(path)).json()).featured_video.video_id).toBe(
    firstVideo,
  );
  expect(
    (
      await update(f.sessionToken, draft.draft_revision, {
        name: "Stale revision",
      })
    ).status,
  ).toBe(409);
  const current = await removed.json();
  expect(
    (
      await publicationRequest(
        f.store.slug,
        f.sessionToken,
        "publish",
        current.draft_revision,
      )
    ).status,
  ).toBe(200);
  expect((await (await fetch(path)).json()).featured_video).toBeNull();
  await expect(
    prisma.store.update({
      where: { id: f.store.id },
      data: { featured_video_start_seconds: 68 },
    }),
  ).rejects.toThrow();
});

test("promotion pagination considers all eligible games before slicing a page", async () => {
  const f = await createReadyDraft("Promotion pagination");
  await prisma.game.update({
    where: { id: f.games[0].id },
    data: { price: "10.00", base_price: "20.00" },
  });
  await prisma.game.update({
    where: { id: f.games[1].id },
    data: { price: "20.00", base_price: "20.00" },
  });
  await prisma.game.update({
    where: { id: f.games[5].id },
    data: { price: "1.00", base_price: "10.00" },
  });
  expect(
    (
      await publicationRequest(
        f.store.slug,
        f.sessionToken,
        "publish",
        f.store.draft_revision,
      )
    ).status,
  ).toBe(200);
  const url = `${origin()}/api/v1/stores/${f.store.slug}/search?on_sale=1&limit=1`;
  const a = await fetch(`${url}&page=1`, {
    headers: { "x-vercel-ip-country": "US" },
  });
  expect(a.status).toBe(200);
  const first = await a.json();
  const second = await (
    await fetch(`${url}&page=2`, { headers: { "x-vercel-ip-country": "US" } })
  ).json();
  expect(first.pagination.total).toBe(2);
  expect(second.pagination.total).toBe(2);
  expect(first.games).toHaveLength(1);
  expect(second.games).toHaveLength(1);
  expect(first.games[0].id).not.toBe(second.games[0].id);
  expect(first.games[0].catalog_offer.discount_percent).toBeGreaterThan(0);
});
