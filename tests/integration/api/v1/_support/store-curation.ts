import { randomUUID } from "node:crypto";

import { expect } from "@jest/globals";
import type { Game, Store, User } from "generated/prisma/client";
import { prisma } from "infra/database";
import webserver from "infra/webserver";
import gameModel from "models/game";
import orchestrator from "tests/orchestrator";

export interface CurationFixture {
  owner: User;
  sessionToken: string;
  store: Store;
}

export async function createCurationFixture(
  catalogMode: "UNDECIDED" | "ALL" | "SELECTED" = "UNDECIDED",
): Promise<CurationFixture> {
  const owner = await orchestrator.createUser();
  await orchestrator.activateUser(owner.id);
  const session = await orchestrator.createSession(owner.id);
  const store = await orchestrator.createStore(owner.id, {
    status: "DRAFT",
    catalog_mode: catalogMode,
  });

  return { owner, sessionToken: session.token, store };
}

export async function createPublicGames(
  ownerId: string,
  count: number,
  label: string,
  tags: string[] = ["curation"],
): Promise<Game[]> {
  return Promise.all(
    Array.from({ length: count }, async (_, index) => {
      const game = await orchestrator.createGame(ownerId, {
        title: `${label} ${index + 1} ${randomUUID().slice(0, 8)}`,
        tags,
      });
      return gameModel.makePublic(game.id);
    }),
  );
}

export function authenticatedJsonHeaders(sessionToken: string) {
  return {
    "Content-Type": "application/json",
    Cookie: `session_id=${sessionToken}`,
  };
}

export function storeApiUrl(slug: string, suffix: string) {
  return `${webserver.getOrigin()}/api/v1/stores/${slug}/${suffix}`;
}

export async function currentDraftRevision(storeId: string) {
  return (
    await prisma.store.findUniqueOrThrow({
      where: { id: storeId },
      select: { draft_revision: true },
    })
  ).draft_revision;
}

export async function createOutsiderSession() {
  const outsider = await orchestrator.createUser();
  await orchestrator.activateUser(outsider.id);
  return orchestrator.createSession(outsider.id);
}

export function expectPrivateResponse(response: Response) {
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  expect(response.headers.get("vary")?.split(/,\s*/)).toContain("Cookie");
}
