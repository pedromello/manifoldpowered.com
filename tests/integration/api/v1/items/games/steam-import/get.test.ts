import orchestrator from "tests/orchestrator";
import webserver from "infra/webserver";
import { prisma } from "infra/database";
import * as coordination from "models/steam_refresh";
import steamImport from "models/steam_import";

const endpoint = `${webserver.getOrigin()}/api/v1/items/games/steam-import`;
beforeEach(async () => {
  await orchestrator.clearDatabaseRows();
});

test("status requires an activated account and does not consume POST attempts", async () => {
  const row = await coordination.reserve("990000300");
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
  expect(await prisma.steamImportAttempt.count()).toBe(0);
  expect(
    (await fetch(`${endpoint}?operation_id=invalid`, { headers })).status,
  ).toBe(400);
});

test("polling reuses completed data and never exposes a moderated game", async () => {
  const user = await orchestrator.createUser();
  await orchestrator.activateUser(user.id);
  const session = await orchestrator.createSession(user.id);
  const imported = await steamImport.importGame({
    userId: user.id,
    steamAppId: "990000300",
    gateway: {
      fetchAppDetails: async () => ({
        success: true,
        data: { name: "Steam API Refresh Fixture" },
      }),
    },
  });
  const url = `${endpoint}?operation_id=${imported.refresh.operation_id}`;
  const headers = { Cookie: `session_id=${session.token}` };
  const response = await fetch(url, { headers });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    slug: imported.game!.slug,
    purchase_mode: "STEAM_ONLY",
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
  expect(await prisma.steamImportAttempt.count()).toBe(1);
});
