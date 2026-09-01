import { randomUUID } from "node:crypto";

import type { Game, Store, User } from "generated/prisma/client";
import { prisma } from "infra/database";
import webserver from "infra/webserver";
import gameModel from "models/game";
import orchestrator from "tests/orchestrator";

export interface LifecycleActor {
  user: User;
  sessionToken: string;
}

export interface ReadyDraftFixture extends LifecycleActor {
  store: Store;
  games: Game[];
}

export async function createLifecycleActor(): Promise<LifecycleActor> {
  const user = await orchestrator.createUser();
  await orchestrator.activateUser(user.id);
  const session = await orchestrator.createSession(user.id);

  return { user, sessionToken: session.token };
}

export async function createReadyDraft(
  label = "Lifecycle Ready",
): Promise<ReadyDraftFixture> {
  const actor = await createLifecycleActor();
  const suffix = randomUUID().slice(0, 8);
  const createdStore = await orchestrator.createStore(actor.user.id, {
    status: "DRAFT",
    name: `${label} ${suffix}`,
    description: "A complete Outlet draft used by lifecycle integration tests.",
    logo_url: "https://example.com/outlet-lifecycle.png",
  });
  const studio = await orchestrator.createStudio(actor.user.id, {
    name: `${label} Studio ${suffix}`,
    is_publisher: true,
  });
  const games = await Promise.all(
    // Keep one game of headroom so lifecycle tests can hide a title while the
    // edited draft still satisfies the five-game publication threshold.
    Array.from({ length: 6 }, async (_, index) => {
      const createdGame = await orchestrator.createGame(actor.user.id, {
        studio_id: studio.id,
        title: `${label} Game ${index + 1} ${suffix}`,
        tags: index === 4 ? ["lifecycle", "lifecycle-blocked"] : ["lifecycle"],
        price: 0,
      });
      return gameModel.makePublic(createdGame.id);
    }),
  );

  await expectSuccessfulResponse(
    fetch(`${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}`, {
      method: "PATCH",
      headers: authenticatedJsonHeaders(actor.sessionToken),
      body: JSON.stringify({ catalog_mode: "ALL" }),
    }),
    200,
    "selecting the ALL catalog mode",
  );
  await expectSuccessfulResponse(
    fetch(
      `${webserver.getOrigin()}/api/v1/stores/${createdStore.slug}/featured`,
      {
        method: "PUT",
        headers: authenticatedJsonHeaders(actor.sessionToken),
        body: JSON.stringify({
          recommendations: [
            {
              game_slug: games[0].slug,
              recommendation_reason: "The defining game in this collection.",
            },
          ],
        }),
      },
    ),
    200,
    "choosing a Featured game",
  );

  return {
    ...actor,
    store: await prisma.store.findUniqueOrThrow({
      where: { id: createdStore.id },
    }),
    games,
  };
}

export function authenticatedJsonHeaders(sessionToken: string) {
  return {
    "Content-Type": "application/json",
    Cookie: `session_id=${sessionToken}`,
  };
}

export function publicationRequest(
  slug: string,
  sessionToken: string,
  action: "publish" | "unpublish",
  expectedDraftRevision: number,
) {
  return fetch(`${webserver.getOrigin()}/api/v1/stores/${slug}/publication`, {
    method: "POST",
    headers: authenticatedJsonHeaders(sessionToken),
    body: JSON.stringify({
      action,
      expected_draft_revision: expectedDraftRevision,
    }),
  });
}

export function libraryRequest(
  sessionToken: string,
  gameSlug: string,
  storeSlug?: string,
) {
  return fetch(`${webserver.getOrigin()}/api/v1/library`, {
    method: "POST",
    headers: authenticatedJsonHeaders(sessionToken),
    body: JSON.stringify({
      slug: gameSlug,
      ...(storeSlug ? { store_slug: storeSlug } : {}),
    }),
  });
}

async function expectSuccessfulResponse(
  responsePromise: Promise<Response>,
  expectedStatus: number,
  operation: string,
) {
  const response = await responsePromise;
  if (response.status !== expectedStatus) {
    throw new Error(
      `Failed while ${operation}: ${response.status} ${await response.text()}`,
    );
  }
}
