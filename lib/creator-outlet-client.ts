import {
  normalizeOutletPublication,
  type CreatorSelectionStrategy,
  type OutletPublicationContract,
} from "lib/creator-lifecycle";

export interface ExplicitSelectionInput {
  strategy: CreatorSelectionStrategy;
  tags: string[];
  gameSlugs: string[];
}

type Request = typeof fetch;

export class CreatorOutletRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "CreatorOutletRequestError";
    this.status = status;
  }
}

export async function fetchOutletPublication(
  slug: string,
  request: Request = fetch,
): Promise<OutletPublicationContract> {
  const response = await request(publicationEndpoint(slug));
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw requestError(response.status, body);
  return normalizeOutletPublication(body);
}

export async function updateOutletPublication(
  slug: string,
  action: "publish" | "unpublish",
  request: Request = fetch,
): Promise<OutletPublicationContract> {
  const response = await request(publicationEndpoint(slug), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw requestError(response.status, body);
  return normalizeOutletPublication(body);
}

export async function saveExplicitOutletSelection(
  slug: string,
  selection: ExplicitSelectionInput,
  request: Request = fetch,
) {
  const response = await request(
    `/api/v1/stores/${encodeURIComponent(slug)}/selection`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        strategy: selection.strategy,
        tags: selection.tags,
        game_slugs: selection.gameSlugs,
      }),
    },
  );
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    throw requestError(response.status, body);
  }
}

function publicationEndpoint(slug: string) {
  return `/api/v1/stores/${encodeURIComponent(slug)}/publication`;
}

function requestError(status: number, body: unknown) {
  const message =
    isRecord(body) && typeof body.message === "string"
      ? body.message
      : "Could not update this Outlet.";
  return new CreatorOutletRequestError(message, status);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
