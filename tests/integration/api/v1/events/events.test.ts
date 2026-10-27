import { randomUUID } from "node:crypto";
import { prisma } from "infra/database";
import webserver from "infra/webserver";
import orchestrator from "tests/orchestrator";
import { pruneProductEvents } from "models/product_event_retention";
import { reserveEventQuota } from "models/product_event_ingest";
import {
  outboundProductClicks,
  selectionProductFunnel,
} from "models/product_event_reports";
import { EVENT_COOKIE } from "infra/product_event_context";
import { visitBindingKey } from "models/product_event_identity";
import { EVENT_CONTEXT_HEADER } from "contracts/product-events";
import type { NextApiRequest } from "next";

const origin = webserver.getOrigin();
class Browser {
  cookies = new Map<string, string>();
  generation = "";
  cookieHeader() {
    return [...this.cookies]
      .map(([key, value]) => key + "=" + value)
      .join("; ");
  }
  async request(
    path: string,
    body?: unknown,
    method = "POST",
    headers: Record<string, string> = {},
  ) {
    const response = await fetch(origin + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        Cookie: this.cookieHeader(),
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    for (const value of response.headers.getSetCookie()) {
      const [pair] = value.split(";");
      const separator = pair.indexOf("=");
      const key = pair.slice(0, separator),
        data = pair.slice(separator + 1);
      if (data === "invalid" || data === "") this.cookies.delete(key);
      else this.cookies.set(key, data);
    }
    return response;
  }
  async bootstrap() {
    const response = await this.request("/api/v1/events", {
      type: "bootstrap",
    });
    expect(response.status).toBe(200);
    this.generation = (await response.json()).generation;
    return response;
  }
  send(events: unknown[], generation = this.generation) {
    return this.request("/api/v1/events", {
      type: "events",
      context_generation: generation,
      events,
    });
  }
  async login(email: string) {
    const response = await this.request("/api/v1/sessions", {
      email,
      password: "ProductEventPassword123!",
    });
    expect(response.status).toBe(201);
    this.generation = response.headers.get(EVENT_CONTEXT_HEADER)!;
    return response;
  }
}
const view = (extra: Record<string, unknown> = {}) => ({
  id: randomUUID(),
  name: "public_page_viewed",
  schema_version: 1,
  client_occurred_at: new Date().toISOString(),
  target: {},
  properties: { locale: "en", entry_surface: "catalog", page_kind: "catalog" },
  ...extra,
});
let player, otherPlayer, owner, store, privateStore, game, external, selection;
beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
  player = await orchestrator.createUser({
    password: "ProductEventPassword123!",
  });
  otherPlayer = await orchestrator.createUser({
    password: "ProductEventPassword123!",
  });
  await orchestrator.activateUser(player.id);
  await orchestrator.activateUser(otherPlayer.id);
  owner = await orchestrator.createUser();
  store = await orchestrator.createStore(owner.id);
  privateStore = await orchestrator.createStore(owner.id, { draft: true });
  game = await orchestrator.createGame(owner.id, { price: 0 });
  external = await orchestrator.createGame(owner.id, {
    price: 0,
    social_links: { steam_page: "https://store.steampowered.com/app/620/" },
  });
  await prisma.game.update({
    where: { id: game.id },
    data: { status: "ACTIVE" },
  });
  await prisma.game.update({
    where: { id: external.id },
    data: { status: "ONLY_DISPLAY" },
  });
  const revisionId = randomUUID();
  selection = await prisma.storeSelection.create({
    data: {
      store_id: store.id,
      slug: "event-test-selection",
      title: "Event test selection",
      status: "PUBLISHED",
      published_revision: 1,
      published_revision_id: revisionId,
      published_at: new Date(),
    },
  });
  await prisma.storeSelectionRevision.create({
    data: {
      id: revisionId,
      selection_id: selection.id,
      revision: 1,
      source_draft_revision: 1,
      actor_user_id: owner.id,
      snapshot: {
        title: selection.title,
        description: "",
        cover_url: null,
        image_urls: [],
        game_ids: [game.id],
      },
    },
  });
});
beforeEach(async () => {
  await prisma.productEvent.deleteMany();
  await prisma.productEventIngestBucket.deleteMany();
  await prisma.storeFollow.deleteMany();
  await prisma.wishlistItem.deleteMany();
});
const selectionView = () =>
  view({
    name: "selection_viewed",
    target: {
      store_slug: store.slug,
      selection_slug: selection.slug,
      published_revision: 1,
    },
    properties: { locale: "en", entry_surface: "selection_page" },
  });

describe("first-party product events HTTP → PostgreSQL", () => {
  test("attributes a general-store fallback to the referring game and rejects hidden or forged destinations", async () => {
    const browser = new Browser();
    await browser.bootstrap();
    const outlet = await prisma.store.findUniqueOrThrow({
      where: { id: store.id },
    });
    const revision = await prisma.storeRevision.findUniqueOrThrow({
      where: { id: outlet.published_revision_id! },
    });
    const general = {
      id: randomUUID(),
      kind: "storefront",
      merchant: "amazon",
      platform: null,
      media_type: null,
      country: "BR",
      game_id: null,
      game_slug: null,
      label: null,
      url: "https://www.amazon.com.br/shop/synthetic?tag=synthetic-20",
    };
    // Fixture-only snapshots exercise the public resolver; application writes publish immutable revisions.
    await prisma.storeRevision.update({
      where: { id: revision.id },
      data: { affiliate_links: { version: 1, links: [general] } },
    });
    try {
      const clicked = view({
        name: "affiliate_link_clicked",
        target: {
          store_slug: store.slug,
          game_slug: external.slug,
          link_id: general.id,
          published_revision_id: revision.id,
        },
        properties: {
          locale: "en",
          entry_surface: "game_page",
          merchant: "amazon",
          kind: "storefront",
          platform: null,
          media_type: null,
          country: "BR",
          placement: "purchase_primary",
        },
      });
      expect((await browser.send([clicked])).status).toBe(200);
      expect((await browser.send([clicked])).status).toBe(200);
      const observations = await prisma.productEvent.findMany({
        where: { name: "affiliate_link_clicked" },
      });
      expect(observations).toHaveLength(1);
      expect(observations[0]).toMatchObject({
        store_id: store.id,
        game_id: external.id,
      });
      expect(observations[0].properties).toMatchObject({
        kind: "storefront",
        platform: null,
        published_revision_id: revision.id,
      });
      const report = await outboundProductClicks({ days: 30 }, store.id);
      expect(report.totals).toMatchObject({
        clicks: 1,
        affiliate: 1,
        official: 0,
      });
      expect(report.games).toEqual([
        expect.objectContaining({ game_id: external.id, affiliate: 1 }),
      ]);
      expect(report.destinations).toEqual([
        expect.objectContaining({ kind: "storefront", platform: null }),
      ]);

      const forge = (properties: Record<string, unknown>) => ({
        ...clicked,
        id: randomUUID(),
        properties: { ...(clicked.properties as object), ...properties },
      });
      expect((await browser.send([forge({ platform: "steam" })])).status).toBe(
        400,
      );
      expect((await browser.send([forge({ kind: "game" })])).status).toBe(400);
      expect(
        (await browser.send([forge({ placement: "outlet_links" })])).status,
      ).toBe(400);
      expect(
        (
          await browser.send([
            {
              ...clicked,
              id: randomUUID(),
              target: {
                ...(clicked.target as object),
                published_revision_id: randomUUID(),
              },
            },
          ])
        ).status,
      ).toBe(400);
      expect(
        (
          await browser.send([
            {
              ...clicked,
              id: randomUUID(),
              target: {
                ...(clicked.target as object),
                store_slug: privateStore.slug,
              },
            },
          ])
        ).status,
      ).toBe(400);
      const gift = {
        ...general,
        id: randomUUID(),
        kind: "gift_card",
        platform: "steam",
      };
      const specific = {
        ...gift,
        id: randomUUID(),
        kind: "game",
        game_id: external.id,
        game_slug: external.slug,
        media_type: "digital",
      };
      for (const preferred of [gift, specific]) {
        await prisma.storeRevision.update({
          where: { id: revision.id },
          data: {
            affiliate_links: { version: 1, links: [general, preferred] },
          },
        });
        expect(
          (await browser.send([{ ...clicked, id: randomUUID() }])).status,
        ).toBe(400);
      }
      await prisma.storeRevision.update({
        where: { id: revision.id },
        data: {
          affiliate_links: {
            version: 1,
            links: [{ ...general, url: "https://attacker.example/store" }],
          },
        },
      });
      expect(
        (await browser.send([{ ...clicked, id: randomUUID() }])).status,
      ).toBe(400);
      expect(
        await prisma.productEvent.count({
          where: { name: "affiliate_link_clicked" },
        }),
      ).toBe(1);
    } finally {
      await prisma.storeRevision.update({
        where: { id: revision.id },
        data: { affiliate_links: revision.affiliate_links },
      });
    }
  });

  test("validates affiliate destinations against published snapshots and deduplicates retries", async () => {
    const browser = new Browser();
    await browser.bootstrap();
    const outlet = await prisma.store.findUniqueOrThrow({
      where: { id: store.id },
    });
    const revision = await prisma.storeRevision.findUniqueOrThrow({
      where: { id: outlet.published_revision_id! },
    });
    const linkId = randomUUID();
    const publishedLink = {
      id: linkId,
      kind: "gift_card",
      merchant: "amazon",
      platform: "steam",
      media_type: null,
      country: "BR",
      game_id: null,
      game_slug: null,
      label: null,
      url: "https://www.amazon.com.br/dp/example?tag=synthetic-20",
    };
    // Fixture-only snapshot setup: application writes go through publication.
    await prisma.storeRevision.update({
      where: { id: revision.id },
      data: { affiliate_links: { version: 1, links: [publishedLink] } },
    });
    try {
      const clicked = view({
        name: "affiliate_link_clicked",
        target: {
          store_slug: store.slug,
          game_slug: external.slug,
          link_id: linkId,
          published_revision_id: revision.id,
        },
        properties: {
          locale: "en",
          entry_surface: "game_page",
          merchant: "amazon",
          kind: "gift_card",
          platform: "steam",
          media_type: null,
          country: "BR",
          placement: "purchase_primary",
        },
      });
      expect((await browser.send([clicked])).status).toBe(200);
      expect((await browser.send([clicked])).status).toBe(200);
      const persisted = await prisma.productEvent.findMany({
        where: { name: "affiliate_link_clicked" },
      });
      expect(persisted).toHaveLength(1);
      expect(persisted[0]).toMatchObject({
        store_id: store.id,
        game_id: external.id,
      });
      expect(JSON.stringify(persisted[0].properties)).not.toContain("https://");
      expect(JSON.stringify(persisted[0].properties)).not.toContain(
        "synthetic-20",
      );
      const forged = {
        ...clicked,
        id: randomUUID(),
        target: { ...(clicked.target as object), link_id: randomUUID() },
      };
      expect((await browser.send([forged])).status).toBe(400);
      expect(
        (
          await browser.send([
            {
              ...clicked,
              id: randomUUID(),
              target: {
                ...(clicked.target as object),
                store_slug: privateStore.slug,
              },
            },
          ])
        ).status,
      ).toBe(400);
    } finally {
      await prisma.storeRevision.update({
        where: { id: revision.id },
        data: { affiliate_links: revision.affiliate_links },
      });
    }
  });

  test("accepts PlayStation clicks independently of Nintendo availability", async () => {
    const browser = new Browser();
    await browser.bootstrap();
    const offer = await prisma.gameExternalOffer.create({
      data: {
        game_id: game.id,
        provider: "playstation",
        country: "BR",
        currency: "BRL",
        captured_at: new Date(),
        url: "https://store.playstation.com/pt-br/product/example",
      },
    });
    try {
      const clicked = view({
        name: "external_store_clicked",
        target: { game_slug: game.slug },
        properties: {
          locale: "en",
          entry_surface: "game_page",
          provider: "playstation",
          placement: "purchase_card",
        },
      });
      expect((await browser.send([clicked])).status).toBe(200);
      expect(
        (
          await browser.send([
            {
              ...clicked,
              id: randomUUID(),
              properties: {
                ...(clicked.properties as object),
                provider: "nintendo",
              },
            },
          ])
        ).status,
      ).toBe(400);
    } finally {
      await prisma.gameExternalOffer.delete({ where: { id: offer.id } });
    }
  });

  test("bootstraps without events, stores a visible observation and preserves a retry", async () => {
    const browser = new Browser();
    const boot = await browser.bootstrap();
    expect(boot.headers.get("cache-control")).toBe("private, no-store");
    expect(boot.headers.getSetCookie()[0]).toMatch(/HttpOnly/i);
    expect(await prisma.productEvent.count()).toBe(0);
    const event = view();
    const responses = await Promise.all([
      browser.send([event]),
      browser.send([event]),
      browser.send([event]),
    ]);
    expect(responses.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(
      (await Promise.all(responses.map((r) => r.json()))).reduce(
        (sum, r) => sum + r.accepted,
        0,
      ),
    ).toBe(1);
    const row = await prisma.productEvent.findFirstOrThrow();
    expect(row).toMatchObject({
      name: "public_page_viewed",
      source: "CLIENT",
      user_id: null,
    });
    expect(row.anonymous_id).toBeTruthy();
    expect(row.visit_id).toBeTruthy();
    const duplicate = await browser.send([
      {
        ...event,
        properties: {
          locale: "pt-BR",
          entry_surface: "catalog",
          page_kind: "catalog",
        },
      },
    ]);
    expect(duplicate.status).toBe(200);
    expect(
      (await prisma.productEvent.findFirstOrThrow()).properties,
    ).toMatchObject({ locale: "en" });
  });

  test.each([
    ["unknown event", () => view({ name: "unknown_event" })],
    ["SERVER event", () => view({ name: "outlet_followed" })],
    ["actor injection", () => ({ ...view(), user_id: "another-user" })],
    ["source injection", () => ({ ...view(), source: "SERVER" })],
    ["unknown version", () => view({ schema_version: 2 })],
    [
      "free text",
      () =>
        view({
          properties: {
            locale: "en",
            page_kind: "catalog",
            entry_surface: "catalog",
            email: "synthetic@example.invalid",
          },
        }),
    ],
    [
      "old time",
      () =>
        view({
          client_occurred_at: new Date(Date.now() - 3600_000).toISOString(),
        }),
    ],
    [
      "future time",
      () =>
        view({
          client_occurred_at: new Date(Date.now() + 3600_000).toISOString(),
        }),
    ],
  ])("rejects %s without partial event writes", async (_name, invalid) => {
    const browser = new Browser();
    await browser.bootstrap();
    expect((await browser.send([view(), invalid()])).status).toBe(400);
    expect(await prisma.productEvent.count()).toBe(0);
    expect(
      (
        await prisma.productEventIngestBucket.findFirstOrThrow({
          where: { bucket_key: "global" },
        })
      ).event_count,
    ).toBe(3);
  });

  test("rejects cross-origin, malformed envelope and oversized batches/body before event writes", async () => {
    const browser = new Browser();
    await browser.bootstrap();
    expect(
      (
        await browser.request("/api/v1/events", { type: "bootstrap" }, "POST", {
          Origin: "https://example.invalid",
        })
      ).status,
    ).toBe(403);
    expect(
      (await browser.send(Array.from({ length: 11 }, () => view()))).status,
    ).toBe(400);
    expect(
      (
        await browser.request("/api/v1/events", {
          ...view(),
          padding: "x".repeat(17000),
        })
      ).status,
    ).toBe(413);
    expect(await prisma.productEvent.count()).toBe(0);
  });

  test("resolves public selection revision and rejects private, unknown or stale targets", async () => {
    const browser = new Browser();
    await browser.bootstrap();
    expect((await browser.send([selectionView()])).status).toBe(200);
    const row = await prisma.productEvent.findFirstOrThrow();
    expect(row).toMatchObject({
      store_id: store.id,
      selection_id: selection.id,
    });
    expect(row.properties).toMatchObject({
      published_revision_id: selection.published_revision_id,
      published_revision: 1,
    });
    for (const target of [
      {
        store_slug: privateStore.slug,
        selection_slug: selection.slug,
        published_revision: 1,
      },
      {
        store_slug: store.slug,
        selection_slug: "missing",
        published_revision: 1,
      },
      {
        store_slug: store.slug,
        selection_slug: selection.slug,
        published_revision: 2,
      },
    ])
      expect(
        (await browser.send([view(), selectionViewWithTarget(target)])).status,
      ).toBe(400);
    expect(await prisma.productEvent.count()).toBe(1);
  });

  test("keeps external store clicks separate from platform wishlist saves", async () => {
    const browser = new Browser();
    await browser.bootstrap();
    expect(
      (
        await browser.send([
          view({
            name: "external_store_clicked",
            target: { game_slug: external.slug },
            properties: {
              locale: "en",
              entry_surface: "game_page",
              provider: "steam",
            },
          }),
        ])
      ).status,
    ).toBe(200);
    expect(
      await prisma.productEvent.count({
        where: { name: "external_store_clicked", game_id: external.id },
      }),
    ).toBe(1);
    expect(
      await prisma.productEvent.count({ where: { name: "game_wishlisted" } }),
    ).toBe(0);
    await browser.login(player.email);
    expect(
      (await browser.request("/api/v1/wishlists", { slug: external.slug }))
        .status,
    ).toBe(201);
    expect(
      await prisma.productEvent.findFirstOrThrow({
        where: { name: "game_wishlisted" },
      }),
    ).toMatchObject({
      source: "SERVER",
      user_id: player.id,
      game_id: external.id,
    });
  });

  test("records true transitions once under concurrency and preserves legitimate cycles", async () => {
    const browser = new Browser();
    await browser.login(player.email);
    const follow = () =>
      browser.request("/api/v1/store-follows", { store_slug: store.slug });
    expect(
      (await Promise.all([follow(), follow(), follow()])).map((r) => r.status),
    ).toEqual([201, 201, 201]);
    expect(await prisma.storeFollow.count()).toBe(1);
    expect(
      await prisma.productEvent.count({ where: { name: "outlet_followed" } }),
    ).toBe(1);
    await browser.request(
      "/api/v1/store-follows",
      { store_slug: store.slug },
      "DELETE",
    );
    await browser.request(
      "/api/v1/store-follows",
      { store_slug: store.slug },
      "DELETE",
    );
    await follow();
    expect(
      await prisma.productEvent.count({ where: { name: "outlet_followed" } }),
    ).toBe(2);
    expect(
      await prisma.productEvent.count({ where: { name: "outlet_unfollowed" } }),
    ).toBe(1);
    const wish = () =>
      browser.request("/api/v1/wishlists", { slug: game.slug });
    expect(
      (await Promise.all([wish(), wish(), wish()])).map((r) => r.status),
    ).toEqual([201, 201, 201]);
    expect(await prisma.wishlistItem.count()).toBe(1);
    await browser.request("/api/v1/wishlists", { slug: game.slug }, "DELETE");
    await browser.request("/api/v1/wishlists", { slug: game.slug }, "DELETE");
    await wish();
    expect(
      await prisma.productEvent.count({ where: { name: "game_wishlisted" } }),
    ).toBe(2);
    expect(
      await prisma.productEvent.count({ where: { name: "game_unwishlisted" } }),
    ).toBe(1);
  });

  test("does not require analytics cookies for an authenticated mutation and ignores tampered analytics", async () => {
    const browser = new Browser();
    const session = await orchestrator.createSession(player.id);
    browser.cookies.set("session_id", session.token);
    browser.cookies.set(EVENT_COOKIE, "tampered");
    expect(
      (
        await browser.request("/api/v1/store-follows", {
          store_slug: store.slug,
        })
      ).status,
    ).toBe(201);
    expect(await prisma.productEvent.findFirstOrThrow()).toMatchObject({
      name: "outlet_followed",
      user_id: player.id,
      visit_id: null,
      anonymous_id: null,
    });
    expect(
      (
        await new Browser().request("/api/v1/store-follows", {
          store_slug: store.slug,
        })
      ).status,
    ).toBe(401);
    expect(await prisma.productEvent.count()).toBe(1);
  });

  test("rolls back a domain action when event INSERT fails in the real database", async () => {
    const browser = new Browser();
    await browser.login(player.email);
    await prisma.$executeRawUnsafe(`CREATE FUNCTION test_product_event_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.name IN ('outlet_followed', 'game_wishlisted') THEN RAISE EXCEPTION 'synthetic event failure'; END IF; RETURN NEW; END $$`);
    await prisma.$executeRawUnsafe(
      "CREATE TRIGGER test_product_event_failure BEFORE INSERT ON product_events FOR EACH ROW EXECUTE FUNCTION test_product_event_failure()",
    );
    try {
      expect(
        (
          await browser.request("/api/v1/store-follows", {
            store_slug: store.slug,
          })
        ).status,
      ).toBe(503);
      expect(
        (await browser.request("/api/v1/wishlists", { slug: game.slug }))
          .status,
      ).toBe(503);
      expect(await prisma.storeFollow.count()).toBe(0);
      expect(await prisma.wishlistItem.count()).toBe(0);
      expect(await prisma.productEvent.count()).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe(
        "DROP TRIGGER test_product_event_failure ON product_events",
      );
      await prisma.$executeRawUnsafe(
        "DROP FUNCTION test_product_event_failure()",
      );
    }
  });

  test("links only an active anonymous visit and rejects stale batches across logout/login and other tabs", async () => {
    const browser = new Browser();
    await browser.bootstrap();
    const oldGeneration = browser.generation;
    const oldCookie = browser.cookies.get(EVENT_COOKIE)!;
    await browser.send([selectionView()]);
    const observed = await prisma.productEvent.findFirstOrThrow();
    const login = await browser.login(player.email);
    expect(
      login.headers.getSetCookie().some((c) => c.startsWith("session_id=")),
    ).toBe(true);
    expect(
      login.headers
        .getSetCookie()
        .some((c) => c.startsWith(EVENT_COOKIE + "=")),
    ).toBe(true);
    const binding = await prisma.productEvent.findUniqueOrThrow({
      where: { event_key: visitBindingKey(observed.visit_id!) },
    });
    expect(binding.user_id).toBe(player.id);
    expect((await browser.send([view()], oldGeneration)).status).toBe(409);
    await browser.request("/api/v1/wishlists", { slug: game.slug });
    await browser.request("/api/v1/store-follows", { store_slug: store.slug });
    const confirmed = await prisma.productEvent.findFirstOrThrow({
      where: { name: "outlet_followed" },
    });
    expect(confirmed).toMatchObject({
      user_id: player.id,
      visit_id: observed.visit_id,
    });
    const generationA = browser.generation;
    const renewal = await browser.request("/api/v1/user", undefined, "GET");
    expect(renewal.status).toBe(200);
    expect((await browser.send([view()])).status).toBe(200);
    await browser.request("/api/v1/sessions", undefined, "DELETE");
    await browser.login(otherPlayer.email);
    const countBeforeStale = await prisma.productEvent.count();
    expect((await browser.send([view()], generationA)).status).toBe(409);
    expect(await prisma.productEvent.count()).toBe(countBeforeStale);
    await browser.bootstrap();
    await browser.send([view()]);
    const current = await prisma.productEvent.findFirstOrThrow({
      where: { user_id: otherPlayer.id, source: "CLIENT" },
    });
    expect(current.visit_id).not.toBe(observed.visit_id);
    // Simulate an old anonymous Set-Cookie response arriving after logout.
    const staleTab = new Browser();
    staleTab.cookies.set(EVENT_COOKIE, oldCookie);
    expect((await staleTab.send([view()], oldGeneration)).status).toBe(409);
    await staleTab.bootstrap();
    await staleTab.send([view()]);
    const last = await prisma.productEvent.findFirstOrThrow({
      orderBy: { id: "desc" },
    });
    expect(last.visit_id).not.toBe(observed.visit_id);
    const restoredLogin = new Browser();
    restoredLogin.cookies.set(EVENT_COOKIE, oldCookie);
    await restoredLogin.login(otherPlayer.email);
    await restoredLogin.request("/api/v1/store-follows", {
      store_slug: store.slug,
    });
    const next = await prisma.productEvent.findFirstOrThrow({
      where: { name: "outlet_followed", user_id: otherPlayer.id },
    });
    expect(next.visit_id).not.toBe(observed.visit_id);
  });

  test("supports the full journey and retains the time of a view received after the action", async () => {
    const browser = new Browser();
    await browser.bootstrap();
    await browser.send([selectionView()]);
    await browser.login(player.email);
    const delayed = selectionView();
    delayed.client_occurred_at = new Date(Date.now() - 1000).toISOString();
    await browser.request("/api/v1/wishlists", { slug: game.slug });
    await browser.request("/api/v1/store-follows", { store_slug: store.slug });
    await browser.send([delayed]);
    const fact = await prisma.productEvent.findFirstOrThrow({
      where: { name: "outlet_followed" },
    });
    const observation = await prisma.productEvent.findUniqueOrThrow({
      where: { event_key: "client:" + delayed.id },
    });
    expect(observation.client_occurred_at!.getTime()).toBeLessThan(
      fact.occurred_at.getTime(),
    );
    expect(observation.received_at.getTime()).toBeGreaterThanOrEqual(
      fact.received_at.getTime(),
    );
    // A separate later visit retains the account, without aliasing browser histories.
    browser.cookies.delete(EVENT_COOKIE);
    await browser.bootstrap();
    await browser.send([view()]);
    expect(
      (await prisma.productEvent.findFirstOrThrow({ orderBy: { id: "desc" } }))
        .visit_id,
    ).not.toBe(fact.visit_id);
  });

  test("shares quotas across concurrent callers, charges rejected batches and ignores forged forwarding headers locally", async () => {
    const now = new Date("2026-10-19T12:00:10Z");
    const req = {
      cookies: {},
      headers: {
        "x-forwarded-for": "203.0.113.1",
        "x-vercel-forwarded-for": "203.0.113.2",
      },
      socket: { remoteAddress: "127.0.0.1" },
    } as unknown as NextApiRequest;
    const oldLimit = process.env.PRODUCT_EVENTS_ADDRESS_PER_MINUTE;
    process.env.PRODUCT_EVENTS_ADDRESS_PER_MINUTE = "10";
    try {
      const results = await Promise.allSettled(
        Array.from({ length: 8 }, (_, i) =>
          reserveEventQuota(
            {
              ...req,
              headers: { "x-forwarded-for": "203.0.113." + i },
            } as NextApiRequest,
            2,
            now,
          ),
        ),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
      expect(
        await prisma.productEventIngestBucket.count({
          where: { bucket_key: { startsWith: "ip:" } },
        }),
      ).toBe(1);
      expect(
        (
          await prisma.productEventIngestBucket.findFirstOrThrow({
            where: { bucket_key: "global" },
          })
        ).event_count,
      ).toBe(16);
    } finally {
      if (oldLimit === undefined)
        delete process.env.PRODUCT_EVENTS_ADDRESS_PER_MINUTE;
      else process.env.PRODUCT_EVENTS_ADDRESS_PER_MINUTE = oldLimit;
    }
    // Rejected semantic batches still consume the committed budget over HTTP.
    await prisma.productEventIngestBucket.deleteMany();
    const browser = new Browser();
    await browser.bootstrap();
    const invalidBatch = Array.from({ length: 10 }, () =>
      view({ name: "not_allowed" }),
    );
    const responses = [];
    // Allow one minute-boundary rollover during the HTTP loop. The fixed-clock
    // concurrent model test above establishes the exact reservation counts.
    for (let i = 0; i < 25; i++) {
      const response = await browser.send(invalidBatch);
      responses.push(response);
      if (response.status === 429) break;
      expect(response.status).toBe(400);
    }
    expect(responses.length).toBeGreaterThanOrEqual(13);
    expect(responses.at(-1).status).toBe(429);
    expect(responses.at(-1).headers.get("retry-after")).toBeTruthy();
    expect(await prisma.productEvent.count()).toBe(0);
  });

  test("attributes conversion only to the observed Outlet and games in its immutable revision", async () => {
    const browser = new Browser();
    await browser.bootstrap();
    const start = new Date(Date.now() - 1000);
    await browser.send([selectionView()]);
    await browser.login(player.email);
    const unrelatedStore = await orchestrator.createStore(owner.id);
    const unrelatedGame = await orchestrator.createGame(owner.id, { price: 0 });
    await prisma.game.update({
      where: { id: unrelatedGame.id },
      data: { status: "ACTIVE" },
    });
    await browser.request("/api/v1/wishlists", { slug: unrelatedGame.slug });
    await browser.request("/api/v1/store-follows", {
      store_slug: unrelatedStore.slug,
    });
    let result = await selectionProductFunnel(start, new Date(), selection.id);
    expect(result[0]).toMatchObject({
      visits: 1,
      accounts: 1,
      wishlisted: 0,
      followed: 0,
      completed: 0,
    });
    await browser.request("/api/v1/wishlists", { slug: game.slug });
    await browser.request("/api/v1/store-follows", { store_slug: store.slug });
    result = await selectionProductFunnel(start, new Date(), selection.id);
    expect(result[0]).toMatchObject({
      accounts: 1,
      wishlisted: 1,
      followed: 1,
      completed: 1,
    });
  });

  test("maintains bounded retention without deleting domain data", async () => {
    const browser = new Browser();
    await browser.login(player.email);
    await browser.request("/api/v1/store-follows", { store_slug: store.slug });
    const old = new Date(Date.now() - 100 * 86_400_000);
    await prisma.productEvent.createMany({
      data: [1, 2, 3].map((n) => ({
        event_key: "server:old:" + n,
        name: "outlet_followed",
        source: "SERVER",
        schema_version: 1,
        occurred_at: old,
        received_at: old,
        user_id: player.id,
        properties: {},
      })),
    });
    await prisma.productEventIngestBucket.create({
      data: {
        bucket_key: "expired",
        event_count: 1,
        window_start: old,
        expires_at: old,
      },
    });
    const result = await pruneProductEvents({ batchSize: 2, maxBatches: 1 });
    expect(result.events).toBe(2);
    expect(result.events_capped).toBe(true);
    expect(result.buckets).toBe(1);
    expect(
      await prisma.productEvent.count({ where: { received_at: { lt: old } } }),
    ).toBe(0);
    expect(
      await prisma.productEvent.count({
        where: { event_key: { startsWith: "server:old:" } },
      }),
    ).toBe(1);
    expect(await prisma.storeFollow.count()).toBe(1);
    expect(
      (
        await browser.request(
          "/api/internal/product-events/prune",
          undefined,
          "GET",
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await browser.request(
          "/api/internal/product-events/prune",
          undefined,
          "GET",
          { Authorization: "Bearer " + process.env.CRON_SECRET },
        )
      ).status,
    ).toBe(200);
  });

  test("does not collect on content GET, SSR/API or provide a public event reader", async () => {
    const browser = new Browser();
    expect(
      (await browser.request("/api/v1/events", undefined, "GET")).status,
    ).toBe(405);
    await browser.request("/api/v1/stores/" + store.slug, undefined, "GET");
    expect(await prisma.productEvent.count()).toBe(0);
  });

  test("migration enforces source, version and identity constraints", async () => {
    await expect(
      prisma.$executeRaw`INSERT INTO product_events(event_key, name, source, schema_version, occurred_at, properties) VALUES ('invalid', 'x', 'FAKE', 0, now(), '{}')`,
    ).rejects.toThrow();
    const columns = await prisma.$queryRaw<
      Array<{ is_identity: string; data_type: string }>
    >`SELECT is_identity, data_type FROM information_schema.columns WHERE table_name = 'product_events' AND column_name = 'id'`;
    expect(columns[0]).toEqual({ is_identity: "YES", data_type: "bigint" });
  });
});
function selectionViewWithTarget(target: unknown) {
  return { ...selectionView(), target };
}
