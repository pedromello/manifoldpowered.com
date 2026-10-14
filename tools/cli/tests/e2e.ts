/** Real HTTP/Mailcatcher flow. Run only through local-e2e.mjs's isolated database. */
import assert from "node:assert/strict";
import { run } from "../src/index";
import { capture, fixture } from "./helpers";
import { readVerificationEmail } from "../src/mailcatcher";
if (!/^cli_e2e_\d+$/.test(process.env.POSTGRES_DB ?? ""))
  throw new Error("This test requires its isolated CLI database.");
const origin = process.env.MANIFOLD_PREVIEW_ORIGIN!;
const f = await fixture();
const outputs: string[] = [];
async function cli(
  command: string,
  payload: Record<string, unknown> = {},
  account = "creator-a",
  extra: string[] = [],
) {
  const output = capture(JSON.stringify(payload));
  const exit = await run(
    [
      ...command.split(" "),
      "--env",
      "local",
      "--account",
      account,
      "--input",
      "-",
      "--json",
      ...extra,
    ],
    output.io,
    { state: f.state },
  );
  const result = output.json;
  assert.ok(
    !output.stdout.includes("session_id=") &&
      !output.stdout.includes('"token":'),
  );
  outputs.push(output.stdout);
  return { exit, ...result };
}
let prisma: { $disconnect(): Promise<void> } | undefined;
try {
  assert.equal((await cli("env connect", { url: origin })).exit, 0);
  const identities: Record<string, Record<string, unknown>> = {};
  for (const account of ["creator-a", "creator-b"]) {
    const registered = await cli(
      "users register",
      { username: account, email: `${account}@example.test` },
      account,
    );
    assert.equal(registered.state, "pending", JSON.stringify(registered));
    const activated = await cli("users activate", {}, account, [
      "--mailcatcher",
      "--wait",
      "--timeout",
      "15",
    ]);
    assert.equal(activated.exit, 0, JSON.stringify(activated));
    identities[account] = activated.data;
    assert.equal(
      (await cli("auth whoami", {}, account)).data.username,
      account,
    );
  }
  console.log(
    "Passed: two real signups, recipient-specific activation and account sessions.",
  );
  const database = await import("../../../infra/database");
  prisma = database.prisma;
  const steamImport = (await import("../../../models/steam_import")).default;
  const nintendoImport = (await import("../../../models/nintendo_import"))
    .default;
  const { parseNintendoProduct } = await import("../../../infra/nintendo");
  const { nintendoHtml } = await import("../../../tests/fixtures/nintendo");
  const { nintendoProductUrl } = await import("../../../lib/nintendo");
  const refs: Array<{ provider: "steam" | "nintendo"; reference: string }> = [];
  for (let index = 1; index <= 4; index++) {
    const appId = String(910000000 + index);
    await steamImport.importGame({
      userId: String(identities["creator-a"].id),
      steamAppId: appId,
      gateway: {
        fetchAppDetails: async () => ({
          success: true,
          data: {
            name: `CLI Fixture ${index}`,
            short_description: "A synthetic game for isolated CLI tests.",
            detailed_description: "Synthetic fixture.",
            is_free: true,
            developers: ["Fixture Studio"],
            publishers: ["Fixture Studio"],
            genres: [{ id: "1", description: "Adventure" }],
            platforms: { windows: true },
            header_image: "https://example.test/game.png",
          },
        }),
      },
    });
    refs.push({ provider: "steam", reference: appId });
  }
  const nintendoRef = nintendoProductUrl("test-knight-switch", "BR");
  await nintendoImport.importGame({
    userId: String(identities["creator-a"].id),
    eshopUrl: nintendoRef,
    gateway: {
      fetchProduct: async (_slug, country) =>
        parseNintendoProduct(
          nintendoHtml(country),
          nintendoProductUrl("test-knight-switch", country),
        ),
    },
  });
  refs.push({ provider: "nintendo", reference: nintendoRef });
  const imported = await cli(
    "games import batch",
    { games: refs },
    "creator-a",
    ["--wait", "--timeout", "15"],
  );
  assert.equal(imported.exit, 0, JSON.stringify(imported));
  const gameSlugs = imported.data.results.map(
    (item: { data: { slug: string } }) => item.data.slug,
  );
  assert.equal(new Set(gameSlugs).size, 5);
  console.log(
    "Passed: Steam and Nintendo imports through real API routes (cached synthetic provider fixtures).",
  );
  const studio = await cli("studios create", {
    name: "CLI Fixture Studio",
    description: "Synthetic studio",
  });
  assert.equal(studio.exit, 0, JSON.stringify(studio));
  assert.equal((await cli("studios list")).data.studios.length, 1);
  assert.equal(
    (await cli("studios get", { slug: studio.data.slug })).data.slug,
    studio.data.slug,
  );
  // A separate free platform fixture exercises library eligibility and wishlist
  // semantics without creating purchases or changing imported game ownership.
  await database.prisma.game.create({
    data: {
      slug: "cli-library-fixture",
      title: "CLI Library Fixture",
      description: "Synthetic platform game",
      detailed_description: "Synthetic fixture for curator API tests.",
      developer_name: "CLI Fixture Studio",
      studio_id: studio.data.id,
      price: 0,
      status: "ACTIVE",
      tags: ["Adventure"],
    },
  });
  const created: Array<{ slug: string; account: string }> = [];
  for (const account of ["creator-a", "creator-b"]) {
    const outlet = await cli(
      "outlets create",
      {
        name: `CLI ${account}`,
        description: "A thoughtfully curated synthetic outlet.",
        logo_url: "https://example.test/logo.png",
        layout_preset: "editorial",
        brand_tokens: {
          palette: "ocean",
          typography: "editorial",
          shape: "soft",
        },
      },
      account,
    );
    assert.equal(outlet.exit, 0, JSON.stringify(outlet));
    assert.equal(outlet.data.status, "DRAFT");
    const slug = outlet.data.slug;
    created.push({ slug, account });
    const blocked = await cli(
      "outlets publish",
      { slug, expected_draft_revision: outlet.data.draft_revision },
      account,
    );
    assert.equal(blocked.error.code, "PUBLICATION_BLOCKED");
    const selected = await cli(
      "outlets catalog set",
      {
        slug,
        strategy: "HANDPICKED",
        tags: [],
        game_slugs: gameSlugs,
        expected_draft_revision: outlet.data.draft_revision,
      },
      account,
    );
    assert.equal(selected.exit, 0, JSON.stringify(selected));
    const featured = await cli(
      "outlets featured set",
      {
        slug,
        recommendations: [
          {
            game_slug: gameSlugs[0],
            recommendation_reason: "A memorable pick for this community.",
          },
        ],
        expected_draft_revision: selected.data.draft_revision,
      },
      account,
    );
    assert.equal(featured.exit, 0, JSON.stringify(featured));
    assert.equal(featured.data.readiness.ready, true);
    const forbidden = await cli(
      "outlets get",
      { slug },
      account === "creator-a" ? "creator-b" : "creator-a",
    );
    assert.ok(["FORBIDDEN", "NOT_FOUND"].includes(forbidden.error.code));
    const published = await cli(
      "outlets publish",
      { slug, expected_draft_revision: featured.data.draft_revision },
      account,
    );
    assert.equal(published.exit, 0, JSON.stringify(published));
    assert.equal(published.data.status, "PUBLISHED");
    const stale = await cli(
      "outlets update",
      { slug, expected_draft_revision: 1, description: "Stale edit" },
      account,
    );
    assert.equal(stale.error.code, "REVISION_CONFLICT");
    const updated = await cli(
      "outlets update",
      {
        slug,
        expected_draft_revision: featured.data.draft_revision,
        description: "A changed draft description.",
      },
      account,
    );
    assert.equal(updated.exit, 0, JSON.stringify(updated));
    const live = await (await fetch(`${origin}/api/v1/stores/${slug}`)).json();
    assert.equal(live.description, "A thoughtfully curated synthetic outlet.");
  }
  console.log(
    "Passed: two personalized published outlets, readiness blockers, cross-account denial, stale edits and immutable live revisions.",
  );
  const requested = await cli("auth login request", {
    login: "creator-a@example.test",
  });
  assert.equal(requested.state, "pending");
  const otpCode = await readVerificationEmail({
    email: "creator-a@example.test",
    requestedAt: requested.data.requested_at,
    origin,
    kind: "otp",
  });
  assert.ok(otpCode);
  const invalid = await cli("auth login verify", {
    login: "creator-a@example.test",
    code: "abcdef",
  });
  assert.equal(invalid.exit, 1);
  const verified = await cli(
    "auth login verify",
    { login: "creator-a@example.test" },
    "creator-a",
    ["--mailcatcher", "--wait", "--timeout", "15"],
  );
  assert.equal(verified.exit, 0, JSON.stringify(verified));
  const reused = await cli("auth login verify", {
    login: "creator-a@example.test",
    code: otpCode,
  });
  assert.equal(reused.error.code, "SESSION_EXPIRED");
  assert.ok(outputs.every((output) => !output.includes(otpCode)));
  const pending = await f.state.account("local", origin, "creator-a");
  assert.equal(pending?.pending, undefined);
  const use = await cli("auth use");
  assert.equal(use.exit, 0);
  const preview = await cli("outlets preview", { slug: created[0].slug });
  assert.equal(preview.data.description, "A changed draft description.");
  assert.ok(preview.data.preview_url.endsWith("?preview=1"));
  assert.equal((await cli("auth logout")).exit, 0);
  assert.equal((await cli("auth whoami")).error.code, "LOGIN_REQUIRED");
  assert.equal((await cli("auth whoami", {}, "creator-b")).exit, 0);
  assert.ok(outputs.every((output) => !output.includes("/signup/activate/")));
  console.log(
    "Passed: OTP login, account selection, private preview and isolated logout.",
  );
} finally {
  await prisma?.$disconnect();
  await f.cleanup();
}
