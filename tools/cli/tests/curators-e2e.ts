/** Three simultaneous isolated curator profiles against real local HTTP APIs. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { run } from "../src/index";
import { fixture, capture } from "./helpers";
if (!/^cli_e2e_\d+$/.test(process.env.POSTGRES_DB ?? ""))
  throw new Error("Isolated CLI database required.");
const origin = process.env.MANIFOLD_PREVIEW_ORIGIN!;
const f = await fixture();
const bound = new Set<string>();
const accounts = ["curator-alpha", "curator-beta", "curator-gamma"];
async function cli(
  command: string,
  payload: Record<string, unknown> = {},
  account = accounts[0],
  extra: string[] = [],
  attempt = 0,
) {
  const output = capture(JSON.stringify(payload));
  const context =
    bound.has(account) && !command.startsWith("profiles ")
      ? ["--profile", account]
      : ["--env", "local", "--account", account];
  const exit = await run(
    [...command.split(" "), ...context, "--input", "-", "--json", ...extra],
    output.io,
    { state: f.state },
  );
  const result = output.json;
  assert.ok(
    !output.stdout.includes('"token":') &&
      !output.stdout.includes("/signup/activate/"),
  );
  // Act like an agent reviewing a rejected write: reread the authoritative
  // revision, and reissue only if this request's expected revision is unchanged.
  // An actual intervening edit is returned to the caller without replacement.
  if (
    result.error?.code === "REVISION_CONFLICT" &&
    typeof payload.expected_draft_revision === "number" &&
    typeof payload.slug === "string" &&
    attempt < 8
  ) {
    const latest = await cli(
      "outlets readiness",
      { slug: payload.slug },
      account,
    );
    if (
      latest.exit === 0 &&
      latest.data.draft_revision === payload.expected_draft_revision
    ) {
      await sleep(
        Math.min(1500, 200 * 2 ** attempt * (accounts.indexOf(account) + 1)),
      );
      return cli(command, payload, account, extra, attempt + 1);
    }
  }
  return { exit, ...result };
}
async function simultaneously<T>(work: Promise<T>[]): Promise<T[]> {
  const outcomes = await Promise.allSettled(work);
  const rejected = outcomes.find((outcome) => outcome.status === "rejected");
  if (rejected?.status === "rejected") throw rejected.reason;
  return outcomes.map((outcome) => {
    if (outcome.status !== "fulfilled")
      throw new Error("Unexpected task state");
    return outcome.value;
  });
}
function passed(result: { exit: number }, label: string) {
  assert.equal(result.exit, 0, `${label}: ${JSON.stringify(result)}`);
}
const stores: Array<{ slug: string; account: string }> = [];
try {
  for (const account of accounts) {
    passed(
      await cli("profiles create", { name: account, url: origin }, account),
      "profile creation",
    );
    bound.add(account);
  }
  await f.state.write("selection-env.json", { env: "prod" });
  await f.state.write("selection-local.json", "unrelated-account");
  await simultaneously(
    accounts.map(async (account) => {
      const signup = await cli(
        "users register",
        { username: account, email: `${account}@example.test` },
        account,
      );
      passed(signup, "parallel signup");
      assert.equal(signup.state, "pending");
      const activated = await cli("users activate", {}, account, [
        "--mailcatcher",
        "--wait",
        "--timeout",
        "20",
      ]);
      passed(activated, "parallel activation");
      assert.equal(activated.data.username, account);
      passed(
        await cli(
          "auth login request",
          { login: account, email: `${account}@example.test` },
          account,
        ),
        "parallel OTP request",
      );
      const logged = await cli(
        "auth login verify",
        { login: account },
        account,
        ["--mailcatcher", "--wait", "--timeout", "20"],
      );
      passed(logged, "parallel OTP verification");
      assert.equal(logged.data.username, account);
    }),
  );
  console.log(
    "Passed: three real accounts, parallel Mailcatcher activation/OTP and immutable per-agent contexts.",
  );
  const before = await cli("games list", { limit: 100 });
  passed(before, "catalog query");
  const steam = before.data.games.find(
    (game: { steam_app_id: string | null }) => game.steam_app_id,
  );
  assert.ok(steam);
  const imported = await simultaneously(
    accounts.map((account) =>
      cli("games import steam", { reference: steam.steam_app_id }, account, [
        "--wait",
        "--timeout",
        "20",
      ]),
    ),
  );
  imported.forEach((result) => {
    passed(result, "simultaneous cached import");
    assert.equal(result.data.id, steam.id);
  });
  const after = await cli("games list", { limit: 100 });
  passed(after, "catalog after imports");
  assert.equal(after.data.pagination.total, before.data.pagination.total);
  const slugs = before.data.games
    .filter((game: { status: string }) => game.status === "ONLY_DISPLAY")
    .slice(0, 5)
    .map((game: { slug: string }) => game.slug) as string[];
  const librarySlug = "cli-library-fixture";
  assert.equal(slugs.length, 5);
  console.log(
    "Passed: three agents import the same provider reference without duplicating the shared catalog.",
  );
  await simultaneously(
    accounts.map(async (account, index) => {
      const outlet = await cli(
        "outlets create",
        {
          name: `Curator ${index + 1}`,
          description: `Synthetic outlet maintained by ${account}.`,
          logo_url: "https://example.test/logo.png",
          layout_preset: ["editorial", "channel", "community"][index],
          brand_tokens: {
            palette: ["ocean", "ember", "manifold"][index],
            typography: ["editorial", "modern", "rounded"][index],
            shape: ["soft", "crisp", "pill"][index],
          },
        },
        account,
      );
      passed(outlet, "parallel outlet creation");
      const slug = outlet.data.slug;
      stores.push({ slug, account });
      const selected = await cli(
        "outlets catalog set",
        {
          slug,
          strategy: "HANDPICKED",
          tags: [],
          game_slugs: slugs,
          expected_draft_revision: outlet.data.draft_revision,
        },
        account,
      );
      passed(selected, "selection");
      const featured = await cli(
        "outlets featured set",
        {
          slug,
          recommendations: [
            {
              game_slug: slugs[0],
              recommendation_reason: `Synthetic recommendation from ${account}.`,
            },
          ],
          expected_draft_revision: selected.data.draft_revision,
        },
        account,
      );
      passed(featured, "featured");
      const editorial = await cli(
        "outlets editorial set",
        {
          slug,
          game_slug: slugs[0],
          headline: "Curator perspective",
          body: `Research-based synthetic editorial from ${account}; not a claim of personal play.`,
          expected_draft_revision: featured.data.draft_revision,
        },
        account,
      );
      passed(editorial, "editorial");
      let revision = editorial.data.draft_revision;
      passed(
        await cli(
          "outlets publish",
          { slug, expected_draft_revision: revision },
          account,
        ),
        "first publication",
      );
      const liveEditorial = await (
        await fetch(
          `${origin}/api/v1/stores/${slug}/game-editorials/${slugs[0]}`,
        )
      ).json();
      assert.ok(liveEditorial.review.body.includes(account));
      const firstPublicText = liveEditorial.review.body;
      const update = await cli(
        "outlets editorial set",
        {
          slug,
          game_slug: slugs[0],
          headline: "Updated perspective",
          body: `A new private draft from ${account}.`,
          expected_draft_revision: revision,
        },
        account,
      );
      passed(update, "editorial draft update");
      revision = update.data.draft_revision;
      const unchanged = await (
        await fetch(
          `${origin}/api/v1/stores/${slug}/game-editorials/${slugs[0]}`,
        )
      ).json();
      assert.equal(unchanged.review.body, firstPublicText);
      const conflicting = await cli(
        "outlets editorial set",
        {
          slug,
          game_slug: slugs[0],
          headline: null,
          body: "Stale overwrite",
          expected_draft_revision: 1,
        },
        account,
      );
      assert.equal(conflicting.error.code, "REVISION_CONFLICT");
      const hide = await cli(
        "outlets catalog remove",
        { slug, game_slug: slugs[4], expected_draft_revision: revision },
        account,
      );
      passed(hide, "hide game");
      revision = hide.data.draft_revision;
      assert.equal(hide.data.readiness.ready, false);
      const add = await cli(
        "outlets catalog add",
        { slug, game_slug: slugs[4], expected_draft_revision: revision },
        account,
      );
      passed(add, "restore game");
      revision = add.data.draft_revision;
      const tag = await cli(
        "outlets tags add",
        {
          slug,
          tag: "Adventure",
          mode: "WHITELIST",
          expected_draft_revision: revision,
        },
        account,
      );
      passed(tag, "tag addition");
      revision = tag.data.draft_revision;
      const tags = await cli("outlets tags list", { slug }, account);
      passed(tags, "tag list");
      assert.equal(tags.data.tag_filters.length, 1);
      const tagUpdate = await cli(
        "outlets tags update",
        {
          slug,
          tag: "Adventure",
          mode: "BLACKLIST",
          expected_draft_revision: revision,
        },
        account,
      );
      passed(tagUpdate, "tag update");
      revision = tagUpdate.data.draft_revision;
      passed(
        await cli(
          "outlets tags preview",
          {
            slug,
            tag: "Adventure",
            action: "REMOVE",
            expected_draft_revision: revision,
          },
          account,
        ),
        "tag preview",
      );
      const tagRemove = await cli(
        "outlets tags remove",
        { slug, tag: "Adventure", expected_draft_revision: revision },
        account,
      );
      passed(tagRemove, "tag removal");
      revision = tagRemove.data.draft_revision;
      const bulkPayload = {
        slug,
        action: "HIDE",
        game_slugs: [slugs[4]],
        expected_draft_revision: revision,
      };
      const bulkPreview = await cli(
        "outlets catalog bulk preview",
        bulkPayload,
        account,
      );
      passed(bulkPreview, "bulk preview");
      const applyPayload = {
        ...bulkPayload,
        operation_id: randomUUID(),
        request_fingerprint: bulkPreview.data.request_fingerprint,
      };
      const bulk = await cli(
        "outlets catalog bulk apply",
        applyPayload,
        account,
      );
      passed(bulk, "bulk application");
      revision = bulk.data.draft_revision;
      const replay = await cli(
        "outlets catalog bulk apply",
        applyPayload,
        account,
      );
      passed(replay, "idempotent bulk replay");
      assert.equal(replay.data.replayed, true);
      assert.equal(replay.data.draft_revision, revision);
      const restored = await cli(
        "outlets catalog add",
        { slug, game_slug: slugs[4], expected_draft_revision: revision },
        account,
      );
      passed(restored, "bulk restoration");
      revision = restored.data.draft_revision;
      const reset = await cli(
        "outlets catalog reset",
        { slug, game_slug: slugs[4], expected_draft_revision: revision },
        account,
      );
      passed(reset, "override reset");
      revision = reset.data.draft_revision;
      const pinned = await cli(
        "outlets catalog add",
        { slug, game_slug: slugs[4], expected_draft_revision: revision },
        account,
      );
      passed(pinned, "explicit inclusion");
      revision = pinned.data.draft_revision;
      const removed = await cli(
        "outlets editorial remove",
        { slug, game_slug: slugs[0], expected_draft_revision: revision },
        account,
      );
      passed(removed, "editorial removal");
      revision = removed.data.draft_revision;
      assert.equal(
        (
          await cli(
            "outlets editorial get",
            { slug, game_slug: slugs[0] },
            account,
          )
        ).data.review,
        null,
      );
      const finalText = `Final synthetic editorial from ${account}.`;
      const final = await cli(
        "outlets editorial set",
        {
          slug,
          game_slug: slugs[0],
          headline: "Final perspective",
          body: finalText,
          expected_draft_revision: revision,
        },
        account,
      );
      passed(final, "editorial restoration");
      revision = final.data.draft_revision;
      passed(
        await cli(
          "outlets publish",
          { slug, expected_draft_revision: revision },
          account,
        ),
        "republish changed draft",
      );
      const finalPublic = await (
        await fetch(
          `${origin}/api/v1/stores/${slug}/game-editorials/${slugs[0]}`,
        )
      ).json();
      assert.equal(finalPublic.review.body, finalText);
      const verified = await cli("outlets verify", { slug }, account);
      passed(verified, "outlet verification");
      assert.equal(verified.data.status, "pass");
      assert.equal(verified.data.stats.editorials, 1);
      passed(
        await cli("wishlist add", { slug: librarySlug }, account),
        "wishlist addition",
      );
      assert.equal(
        (await cli("wishlist status", { slug: librarySlug }, account)).data
          .is_wishlisted,
        true,
      );
      passed(
        await cli("wishlist remove", { slug: librarySlug }, account),
        "wishlist removal",
      );
      passed(await cli("library list", {}, account), "library listing");
      assert.equal(
        (await cli("library has", { slug: librarySlug }, account)).data
          .is_owned,
        false,
      );
      const ineligible = await cli(
        "reviews create",
        {
          slug: librarySlug,
          message: "Blocked synthetic review",
          recommended: true,
        },
        account,
      );
      assert.equal(ineligible.error.code, "REVIEW_NOT_ALLOWED");
      const reviewed = await cli(
        "reviews create",
        {
          slug: slugs[0],
          message: `Synthetic review authored by ${account}.`,
          recommended: true,
        },
        account,
      );
      passed(reviewed, "eligible account review");
      passed(
        await cli(
          "reviews update",
          {
            slug: slugs[0],
            message: `Updated synthetic review authored by ${account}.`,
            recommended: false,
          },
          account,
        ),
        "review update",
      );
      const reviews = await cli("reviews list", { slug: slugs[0] }, account);
      passed(reviews, "reviews listing");
      assert.equal(reviews.data.user_review.recommended, false);
      passed(
        await cli("reviews remove", { slug: slugs[0] }, account),
        "own review removal",
      );
      const runs = await cli("runs list", { limit: 100 }, account);
      passed(runs, "execution journal");
      assert.ok(runs.data.executions.length >= 15);
      assert.ok(
        runs.data.executions.every(
          (entry: { account: string }) => entry.account === account,
        ),
      );
    }),
  );
  console.log(
    "Passed: three simultaneous curated outlets, private editorials, publication snapshots, catalog/tag changes, idempotent bulk, wishlists, library queries, reviews and per-agent journals.",
  );
  for (const store of stores) {
    const other = accounts.find((account) => account !== store.account)!;
    const forbidden = await cli(
      "outlets editorial set",
      {
        slug: store.slug,
        game_slug: slugs[0],
        body: "Unauthorized change",
        expected_draft_revision: 1,
      },
      other,
    );
    assert.ok(["FORBIDDEN", "NOT_FOUND"].includes(forbidden.error.code));
    passed(
      await cli("outlets follow", { slug: store.slug }, other),
      "following another outlet",
    );
    assert.ok(
      (await cli("outlets followed", {}, other)).data.stores.some(
        (entry: { slug: string }) => entry.slug === store.slug,
      ),
    );
    passed(
      await cli("outlets unfollow", { slug: store.slug }, other),
      "unfollow",
    );
  }
  const discover = await cli("outlets discover", { q: "Curator", limit: 100 });
  passed(discover, "public discovery");
  assert.equal(discover.data.stores.length, 3);
  const last = stores.find((store) => store.account === accounts[2])!;
  const ready = await cli(
    "outlets readiness",
    { slug: last.slug },
    last.account,
  );
  passed(ready, "unpublish readiness");
  passed(
    await cli(
      "outlets unpublish",
      { slug: last.slug, expected_draft_revision: ready.data.draft_revision },
      last.account,
    ),
    "unpublish",
  );
  assert.equal(
    (await cli("outlets public", { slug: last.slug }, last.account)).error.code,
    "NOT_FOUND",
  );
  passed(await cli("auth logout", {}, accounts[0]), "profile logout");
  assert.equal(
    (await cli("auth whoami", {}, accounts[0])).error.code,
    "LOGIN_REQUIRED",
  );
  passed(
    await cli("auth whoami", {}, accounts[1]),
    "other profile remains authenticated",
  );
  console.log(
    "Passed: cross-account write denial, discovery, follows, unpublication and isolated logout.",
  );
} finally {
  await f.cleanup();
}
