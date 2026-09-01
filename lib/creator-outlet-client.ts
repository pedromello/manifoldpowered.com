import {
  normalizeOutletPublication,
  type CreatorSelectionStrategy,
  type OutletPublicationContract,
} from "lib/creator-lifecycle";

export interface ExplicitSelectionInput {
  strategy: CreatorSelectionStrategy;
  tags: string[];
  gameSlugs: string[];
  expectedDraftRevision: number;
}

export interface ExplicitSelectionResult {
  catalogMode: "SELECTED";
  draftRevision: number;
}

export interface ExplicitSelectionPreview extends ExplicitSelectionResult {
  catalogGameCount: number;
  minimumGameCount: number;
  canApply: boolean;
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
  expectedDraftRevision: number,
  request: Request = fetch,
): Promise<OutletPublicationContract> {
  const response = await request(publicationEndpoint(slug), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action,
      expected_draft_revision: expectedDraftRevision,
    }),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw requestError(response.status, body);
  return normalizeOutletPublication(body);
}

export async function saveExplicitOutletSelection(
  slug: string,
  selection: ExplicitSelectionInput,
  request: Request = fetch,
): Promise<ExplicitSelectionResult> {
  const response = await request(
    `/api/v1/stores/${encodeURIComponent(slug)}/selection`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        strategy: selection.strategy,
        tags: selection.tags,
        game_slugs: selection.gameSlugs,
        expected_draft_revision: selection.expectedDraftRevision,
      }),
    },
  );
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw requestError(response.status, body);
  }
  if (
    !isRecord(body) ||
    body.catalog_mode !== "SELECTED" ||
    typeof body.draft_revision !== "number" ||
    !Number.isSafeInteger(body.draft_revision) ||
    body.draft_revision < 1
  ) {
    throw new CreatorOutletRequestError(
      "The Outlet selection response was invalid.",
      502,
    );
  }
  return {
    catalogMode: body.catalog_mode,
    draftRevision: body.draft_revision,
  };
}

export async function previewExplicitOutletSelection(
  slug: string,
  selection: ExplicitSelectionInput,
  request: Request = fetch,
): Promise<ExplicitSelectionPreview> {
  const response = await request(
    `/api/v1/stores/${encodeURIComponent(slug)}/selection`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        strategy: selection.strategy,
        tags: selection.tags,
        game_slugs: selection.gameSlugs,
        expected_draft_revision: selection.expectedDraftRevision,
      }),
    },
  );
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw requestError(response.status, body);
  if (
    !isRecord(body) ||
    body.catalog_mode !== "SELECTED" ||
    typeof body.draft_revision !== "number" ||
    typeof body.catalog_game_count !== "number" ||
    typeof body.minimum_game_count !== "number" ||
    typeof body.can_apply !== "boolean"
  ) {
    throw new CreatorOutletRequestError(
      "The Outlet selection preview response was invalid.",
      502,
    );
  }
  return {
    catalogMode: body.catalog_mode,
    draftRevision: body.draft_revision,
    catalogGameCount: body.catalog_game_count,
    minimumGameCount: body.minimum_game_count,
    canApply: body.can_apply,
  };
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
