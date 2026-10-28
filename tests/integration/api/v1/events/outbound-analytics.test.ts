import { randomUUID } from "node:crypto";
import { prisma } from "infra/database";
import webserver from "infra/webserver";
import orchestrator from "tests/orchestrator";
import { outboundProductClicks } from "models/product_event_reports";
import userModel from "models/user";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

test("outbound reports count observations and visits without exposing visitor identity", async () => {
  const owner = await orchestrator.createUser();
  await orchestrator.activateUser(owner.id);
  const session = await orchestrator.createSession(owner.id);
  const outlet = await orchestrator.createStore(owner.id);
  const another = await orchestrator.createStore(owner.id);
  const game = await orchestrator.createGame(owner.id, { price: 0 });
  const visit = randomUUID();
  const anonymous = randomUUID();
  const now = new Date();
  const occurred = new Date(now.getTime() - 1000);
  await prisma.productEvent.createMany({
    data: [
      {
        event_key: randomUUID(),
        name: "external_store_clicked",
        schema_version: 1,
        source: "CLIENT",
        anonymous_id: anonymous,
        occurred_at: occurred,
        visit_id: visit,
        game_id: game.id,
        store_id: outlet.id,
        properties: { provider: "steam", placement: "purchase_card" },
      },
      {
        event_key: randomUUID(),
        name: "affiliate_link_clicked",
        schema_version: 1,
        source: "CLIENT",
        anonymous_id: anonymous,
        occurred_at: occurred,
        visit_id: visit,
        game_id: game.id,
        store_id: outlet.id,
        properties: {
          merchant: "amazon",
          kind: "game",
          platform: "steam",
          country: "BR",
          placement: "purchase_primary",
        },
      },
      {
        event_key: randomUUID(),
        name: "affiliate_link_clicked",
        schema_version: 1,
        source: "CLIENT",
        anonymous_id: anonymous,
        occurred_at: occurred,
        visit_id: randomUUID(),
        store_id: outlet.id,
        properties: {
          merchant: "mercado_livre",
          kind: "storefront",
          country: "BR",
          placement: "outlet_links",
        },
      },
      {
        event_key: randomUUID(),
        name: "external_store_clicked",
        schema_version: 1,
        source: "CLIENT",
        anonymous_id: anonymous,
        occurred_at: occurred,
        visit_id: randomUUID(),
        game_id: game.id,
        store_id: another.id,
        properties: { provider: "steam" },
      },
      {
        event_key: randomUUID(),
        name: "external_store_clicked",
        schema_version: 1,
        source: "CLIENT",
        anonymous_id: anonymous,
        occurred_at: occurred,
        visit_id: randomUUID(),
        game_id: game.id,
        properties: { provider: "steam" },
      },
    ],
  });
  const report = await outboundProductClicks({ days: 30 }, outlet.id, now);
  expect(report.totals).toEqual({
    clicks: 3,
    visits: 2,
    official: 1,
    affiliate: 2,
  });
  expect(report.games.find((row) => row.game_id === null)?.clicks).toBe(1);
  expect(
    report.destinations.find((row) => row.kind === "storefront")?.platform,
  ).toBeNull();
  expect(
    report.destinations.find((row) => row.provider === "steam")?.placement,
  ).toBe("purchase_card");
  expect(report.daily.reduce((sum, day) => sum + day.clicks, 0)).toBe(3);
  expect(JSON.stringify(report)).not.toContain(visit);
  expect(JSON.stringify(report)).not.toContain(owner.id);
  expect(JSON.stringify(report)).not.toContain("https://");
  const filtered = await outboundProductClicks(
    { days: 30, kind: "official" },
    outlet.id,
    now,
  );
  expect(filtered.totals.clicks).toBe(1);
  const global = await outboundProductClicks({ days: 30 }, undefined, now);
  expect(global.totals.clicks).toBe(5);
  expect(global.outlets.find((row) => row.store_id === null)?.clicks).toBe(1);

  const anonymousResponse = await fetch(
    `${webserver.getOrigin()}/api/v1/stores/${outlet.slug}/analytics`,
  );
  expect(anonymousResponse.status).toBe(401);
  // Existing active owners do not need a new feature backfill to view their own data.
  const existingOwner = await prisma.user.findUniqueOrThrow({
    where: { id: owner.id },
  });
  await prisma.user.update({
    where: { id: owner.id },
    data: {
      features: existingOwner.features.filter(
        (feature) => feature !== "read:store_analytics",
      ),
    },
  });

  const response = await fetch(
    `${webserver.getOrigin()}/api/v1/stores/${outlet.slug}/analytics`,
    { headers: { Cookie: `session_id=${session.token}` } },
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(
    response.headers
      .get("Vary")
      ?.toLowerCase()
      .split(",")
      .map((value) => value.trim()),
  ).toContain("cookie");
  expect((await response.json()).totals.clicks).toBe(3);

  const outsider = await orchestrator.createUser();
  await orchestrator.activateUser(outsider.id);
  const outsiderSession = await orchestrator.createSession(outsider.id);
  const denied = await fetch(
    `${webserver.getOrigin()}/api/v1/stores/${outlet.slug}/analytics`,
    { headers: { Cookie: `session_id=${outsiderSession.token}` } },
  );
  expect(denied.status).toBe(403);
  const finance = await orchestrator.createUser();
  await orchestrator.activateUser(finance.id);
  await orchestrator.addStoreMember(outlet.id, finance.username, [
    "read:store_statement",
  ]);
  const financeSession = await orchestrator.createSession(finance.id);
  const financeDenied = await fetch(
    `${webserver.getOrigin()}/api/v1/stores/${outlet.slug}/analytics`,
    { headers: { Cookie: `session_id=${financeSession.token}` } },
  );
  expect(financeDenied.status).toBe(403);
  await orchestrator.addStoreMember(outlet.id, outsider.username, [
    "read:store_analytics",
  ]);
  const analystAllowed = await fetch(
    `${webserver.getOrigin()}/api/v1/stores/${outlet.slug}/analytics`,
    { headers: { Cookie: `session_id=${outsiderSession.token}` } },
  );
  expect(analystAllowed.status).toBe(200);
  const globalDenied = await fetch(
    `${webserver.getOrigin()}/api/v1/analytics/outbound`,
    { headers: { Cookie: `session_id=${session.token}` } },
  );
  expect(globalDenied.status).toBe(403);
  const admin = await orchestrator.createAdminUser();
  const adminSession = await orchestrator.createSession(admin.id);
  const globalAllowed = await fetch(
    `${webserver.getOrigin()}/api/v1/analytics/outbound`,
    { headers: { Cookie: `session_id=${adminSession.token}` } },
  );
  expect(globalAllowed.status).toBe(200);
  expect((await globalAllowed.json()).totals.clicks).toBe(5);

  await userModel.disable(owner.id);
  const disabledOwner = await fetch(
    `${webserver.getOrigin()}/api/v1/stores/${outlet.slug}/analytics`,
    { headers: { Cookie: `session_id=${session.token}` } },
  );
  expect(disabledOwner.status).toBe(403);
  expect(disabledOwner.headers.get("Cache-Control")).toBe("private, no-store");
});
