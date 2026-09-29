import { randomUUID } from "crypto";

import webserver from "infra/webserver";
import orchestrator from "tests/orchestrator";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabaseRows();
});

describe("Outlet curation authorization", () => {
  test("an unrelated user cannot preview or apply bulk curation", async () => {
    const owner = await orchestrator.createUser();
    await orchestrator.activateUser(owner.id);
    const store = await orchestrator.createStore(owner.id, {
      catalog_mode: "SELECTED",
    });
    const outsider = await orchestrator.createUser();
    await orchestrator.activateUser(outsider.id);
    const outsiderSession = await orchestrator.createSession(outsider.id);
    const game = await orchestrator.createGame(owner.id, {
      title: "Protected Curation Game",
    });
    const headers = {
      "Content-Type": "application/json",
      Cookie: `session_id=${outsiderSession.token}`,
    };

    const previewResponse = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${store.slug}/game-overrides/bulk/preview`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "SHOW",
          game_slugs: [game.slug],
          expected_draft_revision: 1,
        }),
      },
    );
    const applyResponse = await fetch(
      `${webserver.getOrigin()}/api/v1/stores/${store.slug}/game-overrides/bulk`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          operation_id: randomUUID(),
          action: "SHOW",
          game_slugs: [game.slug],
          expected_draft_revision: 1,
          request_fingerprint: "0".repeat(64),
        }),
      },
    );

    expect(previewResponse.status).toBe(403);
    expect(applyResponse.status).toBe(403);
  });
});
