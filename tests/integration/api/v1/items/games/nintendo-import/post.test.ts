import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";
import * as coordination from "models/nintendo_refresh";
import { prisma } from "infra/database";
import nintendoImport from "models/nintendo_import";
import { parseNintendoProduct } from "infra/nintendo";
import { nintendoHtml } from "tests/fixtures/nintendo";
import { nintendoProductUrl } from "lib/nintendo";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});
const url = `${webserver.getOrigin()}/api/v1/items/games/nintendo-import`;

test("anonymous users cannot import", async () => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eshop_url: "https://www.nintendo.com/pt-br/store/products/test/",
    }),
  });
  expect(response.status).toBe(403);
});

test("activated users receive validation errors before any external request", async () => {
  const user = await orchestrator.createUser();
  await orchestrator.activateUser(user.id);
  const session = await orchestrator.createSession(user.id);
  for (const payload of [
    { eshop_url: "https://localhost/private" },
    {
      eshop_url: "https://www.nintendo.com/pt-br/store/products/test/",
      nintendo_nsuid: "70010000003208",
    },
    {},
  ]) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session_id=${session.token}`,
      },
      body: JSON.stringify(payload),
    });
    expect(response.status).toBe(400);
    expect((await response.json()).name).toBe("ValidationError");
  }
});

test("unactivated users cannot import", async () => {
  const user = await orchestrator.createUser();
  const session = await orchestrator.createSession(user.id);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `session_id=${session.token}`,
    },
    body: JSON.stringify({
      eshop_url: "https://www.nintendo.com/us/store/products/test/",
    }),
  });
  expect(response.status).toBe(403);
});

test("POST shares pending and cached imports, enforces capacity and counts cached attempts", async () => {
  await orchestrator.clearDatabaseRows();
  const user = await orchestrator.createUser();
  await orchestrator.activateUser(user.id);
  const session = await orchestrator.createSession(user.id);
  const headers = {
    "Content-Type": "application/json",
    Cookie: `session_id=${session.token}`,
  };
  const eshopUrl = nintendoProductUrl("test-knight-switch", "BR");
  const reservation = await coordination.reserve("test-knight-switch");
  const pending = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ eshop_url: eshopUrl }),
  });
  expect(pending.status).toBe(202);
  expect(pending.headers.get("Retry-After")).toBe("2");
  expect(await pending.json()).toMatchObject({
    refresh: { operation_id: reservation.row.id, state: "in_progress" },
  });
  await prisma.nintendoRefresh.updateMany({
    data: { lease_expires_at: new Date(0) },
  });
  await nintendoImport.importGame({
    userId: user.id,
    eshopUrl,
    gateway: {
      fetchProduct: async (_slug, country) =>
        parseNintendoProduct(
          nintendoHtml(country),
          nintendoProductUrl("test-knight-switch", country),
        ),
    },
  });
  const cached = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ eshop_url: eshopUrl }),
  });
  expect(cached.status).toBe(200);
  expect(await cached.json()).toMatchObject({
    claimable: false,
    refresh: { state: "cached" },
  });
  expect(await prisma.nintendoImportAttempt.count()).toBe(3);
  await Promise.all(
    ["one", "two", "three", "four"].map((key) => coordination.reserve(key)),
  );
  const busy = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ eshop_url: nintendoProductUrl("five", "BR") }),
  });
  expect(busy.status).toBe(503);
  expect(busy.headers.get("Retry-After")).toBe("2");
});
