import { prisma } from "infra/database";
import webserver from "infra/webserver";
import orchestrator from "tests/orchestrator";
import type { OutletRatingScale } from "contracts/outlet-rating";

export async function ratingFixture(scale: OutletRatingScale | null = null) {
  const owner = await orchestrator.createUser();
  await orchestrator.activateUser(owner.id);
  const session = await orchestrator.createSession(owner.id);
  const outlet = await orchestrator.createStore(owner.id, { draft: true });
  await prisma.store.update({
    where: { id: outlet.id },
    data: { rating_scale: scale },
  });
  return { owner, session, outlet };
}

export function ratingSystemRequest(
  slug: string,
  token: string | undefined,
  method: "PUT" | "POST",
  body: Record<string, unknown>,
) {
  return fetch(
    `${webserver.getOrigin()}/api/v1/stores/${slug}/rating-system${method === "POST" ? "/preview" : ""}`,
    {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Cookie: `session_id=${token}` } : {}),
      },
      body: JSON.stringify(body),
    },
  );
}

export function editorialRequest(
  slug: string,
  gameSlug: string,
  token: string,
  body: Record<string, unknown>,
) {
  return fetch(
    `${webserver.getOrigin()}/api/v1/stores/${slug}/game-editorials/${gameSlug}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session_id=${token}`,
      },
      body: JSON.stringify(body),
    },
  );
}
