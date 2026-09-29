import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";
import { prisma } from "infra/database";
import * as coordination from "models/nintendo_refresh";
import nintendoImport from "models/nintendo_import";
import { parseNintendoProduct } from "infra/nintendo";
import { nintendoHtml } from "tests/fixtures/nintendo";
import { nintendoProductUrl } from "lib/nintendo";

const endpoint = `${webserver.getOrigin()}/api/v1/items/games/nintendo-import`;
beforeEach(async () => {
  await orchestrator.clearDatabaseRows();
});

test("status requires an activated account and does not consume POST attempts", async () => {
  const row = await coordination.reserve("test-knight-switch");
  const url = `${endpoint}?operation_id=${row.row.id}`;
  expect((await fetch(url)).status).toBe(403);
  const user = await orchestrator.createUser();
  const session = await orchestrator.createSession(user.id);
  const headers = { Cookie: `session_id=${session.token}` };
  expect((await fetch(url, { headers })).status).toBe(403);
  await orchestrator.activateUser(user.id);
  const response = await fetch(url, { headers });
  expect(response.status).toBe(200);
  expect(response.headers.get("Retry-After")).toBe("2");
  expect(await response.json()).toMatchObject({
    refresh: { state: "in_progress", operation_id: row.row.id },
  });
  expect(await prisma.nintendoImportAttempt.count()).toBe(0);
  expect(
    (await fetch(`${endpoint}?operation_id=invalid`, { headers })).status,
  ).toBe(400);
});

test("polling reuses completed data and never exposes a moderated game", async () => {
  const user = await orchestrator.createUser();
  await orchestrator.activateUser(user.id);
  const session = await orchestrator.createSession(user.id);
  const imported = await nintendoImport.importGame({
    userId: user.id,
    eshopUrl: nintendoProductUrl("test-knight-switch", "BR"),
    gateway: {
      fetchProduct: async (_slug, country) =>
        parseNintendoProduct(
          nintendoHtml(country),
          nintendoProductUrl("test-knight-switch", country),
        ),
    },
  });
  const url = `${endpoint}?operation_id=${imported.refresh.operation_id}`;
  const headers = { Cookie: `session_id=${session.token}` };
  const response = await fetch(url, { headers });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    slug: imported.game!.slug,
    claimable: false,
    refresh: { state: "updated" },
  });
  await prisma.game.update({
    where: { id: imported.game!.id },
    data: { status: "INACTIVE" },
  });
  const hidden = await fetch(url, { headers });
  expect(await hidden.json()).toEqual({
    message: "This game is currently hidden from the catalog.",
  });
  expect(await prisma.nintendoImportAttempt.count()).toBe(1);
});
