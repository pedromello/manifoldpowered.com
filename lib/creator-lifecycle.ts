export const CREATOR_LIFECYCLE_SCHEMA_VERSION = 1 as const;

export const CREATOR_HANDPICKED_FILTER_TAG =
  "__manifold_creator_handpicked__" as const;

export type CreatorOnboardingStep =
  | "IDENTITY"
  | "SELECTION"
  | "FEATURED"
  | "PREVIEW"
  | "PUBLISH";

export const CREATOR_ONBOARDING_STEPS: CreatorOnboardingStep[] = [
  "IDENTITY",
  "SELECTION",
  "FEATURED",
  "PREVIEW",
  "PUBLISH",
];

export type CreatorSelectionStrategy = "FOCUSED" | "HANDPICKED";

export type OutletPublicationStatus = "DRAFT" | "PUBLISHED";

export type OutletReadinessKey =
  | "brand_complete"
  | "catalog_intentional"
  | "catalog_has_games"
  | "editorial_highlight";

export interface CreatorGameSummary {
  id: string;
  slug: string;
  title: string;
  bannerUrl: string | null;
}

export interface CreatorOutletDraft {
  schemaVersion: typeof CREATOR_LIFECYCLE_SCHEMA_VERSION;
  draftId: string;
  ownerId: string;
  storeSlug: string | null;
  currentStep: CreatorOnboardingStep;
  identity: {
    name: string;
    description: string;
    logoUrl: string;
    niche: string;
  };
  selection: {
    strategy: CreatorSelectionStrategy | null;
    tags: string[];
    games: CreatorGameSummary[];
  };
  featured: {
    gameSlug: string | null;
    recommendationReason: string;
  };
  previewedAt: string | null;
  linkCopiedAt: string | null;
  updatedAt: string;
}

export interface OutletReadinessCheck {
  key: OutletReadinessKey;
  complete: boolean;
}

export interface OutletPublicationContract {
  status: OutletPublicationStatus;
  publishedAt: string | null;
  lastPublishedAt: string | null;
  draftRevision: number;
  catalogMode: "UNDECIDED" | "ALL" | "SELECTED";
  publishedRevision: {
    id: string;
    revision: number;
    sourceDraftRevision: number;
  } | null;
  readinessVersion: number;
  catalogGameCount: number;
  ready: boolean;
  checks: Record<OutletReadinessKey, boolean>;
  capabilities: {
    edit: boolean;
    publish: boolean;
    unpublish: boolean;
  };
}

export interface CreatorDraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const READINESS_KEYS: OutletReadinessKey[] = [
  "brand_complete",
  "catalog_intentional",
  "catalog_has_games",
  "editorial_highlight",
];

export function creatorDraftStorageKey(ownerId: string) {
  return `manifold:creator-outlet-draft:v${CREATOR_LIFECYCLE_SCHEMA_VERSION}:${ownerId}`;
}

export function creatorDraftArchiveStorageKey(
  ownerId: string,
  draftId: string,
) {
  return `${creatorDraftStorageKey(ownerId)}:archived:${draftId}`;
}

export function createCreatorOutletDraft(
  ownerId: string,
  now = new Date().toISOString(),
  draftId = createCreatorDraftId(),
): CreatorOutletDraft {
  return {
    schemaVersion: CREATOR_LIFECYCLE_SCHEMA_VERSION,
    draftId,
    ownerId,
    storeSlug: null,
    currentStep: "IDENTITY",
    identity: {
      name: "",
      description: "",
      logoUrl: "",
      niche: "",
    },
    selection: {
      strategy: null,
      tags: [],
      games: [],
    },
    featured: {
      gameSlug: null,
      recommendationReason: "",
    },
    previewedAt: null,
    linkCopiedAt: null,
    updatedAt: now,
  };
}

export function saveCreatorOutletDraft(
  storage: CreatorDraftStorage,
  draft: CreatorOutletDraft,
) {
  storage.setItem(creatorDraftStorageKey(draft.ownerId), JSON.stringify(draft));
}

export function loadCreatorOutletDraft(
  storage: CreatorDraftStorage,
  ownerId: string,
): CreatorOutletDraft | null {
  const serialized = storage.getItem(creatorDraftStorageKey(ownerId));
  if (!serialized) return null;

  try {
    const candidate: unknown = JSON.parse(serialized);
    const migrated = migrateCreatorOutletDraft(candidate);
    return isCreatorOutletDraft(migrated) ? migrated : null;
  } catch {
    return null;
  }
}

export function clearCreatorOutletDraft(
  storage: CreatorDraftStorage,
  ownerId: string,
  draftId?: string,
) {
  if (draftId) {
    const active = loadCreatorOutletDraft(storage, ownerId);
    if (active?.draftId !== draftId) return false;
  }
  storage.removeItem(creatorDraftStorageKey(ownerId));
  return true;
}

export function archiveCreatorOutletDraft(
  storage: CreatorDraftStorage,
  draft: CreatorOutletDraft,
) {
  storage.setItem(
    creatorDraftArchiveStorageKey(draft.ownerId, draft.draftId),
    JSON.stringify(draft),
  );
  clearCreatorOutletDraft(storage, draft.ownerId, draft.draftId);
}

export const completeCreatorOutletDraft = archiveCreatorOutletDraft;

export function startNewCreatorOutletDraft(
  storage: CreatorDraftStorage,
  ownerId: string,
  now = new Date().toISOString(),
  draftId = createCreatorDraftId(),
) {
  const active = loadCreatorOutletDraft(storage, ownerId);
  if (active) archiveCreatorOutletDraft(storage, active);

  const next = createCreatorOutletDraft(ownerId, now, draftId);
  saveCreatorOutletDraft(storage, next);
  return next;
}

export function isCreatorIdentityComplete(draft: CreatorOutletDraft) {
  return (
    draft.identity.name.trim().length > 0 &&
    draft.identity.description.trim().length > 0 &&
    draft.identity.logoUrl.trim().length > 0 &&
    isHttpUrl(draft.identity.logoUrl) &&
    draft.identity.niche.trim().length > 0
  );
}

export function isCreatorSelectionComplete(draft: CreatorOutletDraft) {
  if (draft.selection.strategy === "FOCUSED") {
    return draft.selection.tags.length > 0;
  }

  if (draft.selection.strategy === "HANDPICKED") {
    return draft.selection.games.length >= 5;
  }

  return false;
}

export function isCreatorFeaturedComplete(draft: CreatorOutletDraft) {
  return (
    !!draft.featured.gameSlug &&
    draft.featured.recommendationReason.trim().length > 0
  );
}

export function earliestIncompleteStep(
  draft: CreatorOutletDraft,
): CreatorOnboardingStep {
  if (!isCreatorIdentityComplete(draft)) return "IDENTITY";
  if (!isCreatorSelectionComplete(draft) || !draft.storeSlug) {
    return "SELECTION";
  }
  if (!isCreatorFeaturedComplete(draft)) return "FEATURED";
  if (!draft.previewedAt) return "PREVIEW";
  return "PUBLISH";
}

export function getOnboardingProgress(draft: CreatorOutletDraft) {
  const completed = [
    isCreatorIdentityComplete(draft),
    isCreatorSelectionComplete(draft) && !!draft.storeSlug,
    isCreatorFeaturedComplete(draft),
    !!draft.previewedAt,
    !!draft.linkCopiedAt,
  ].filter(Boolean).length;

  return {
    completed,
    total: CREATOR_ONBOARDING_STEPS.length,
    percent: Math.round((completed / CREATOR_ONBOARDING_STEPS.length) * 100),
  };
}

export function normalizeOutletPublication(
  value: unknown,
): OutletPublicationContract {
  if (!isRecord(value)) {
    throw new Error("Invalid Outlet publication response");
  }

  const rawStatus = value.status;
  if (rawStatus !== "DRAFT" && rawStatus !== "PUBLISHED") {
    throw new Error("Invalid Outlet publication status");
  }

  const readiness = isRecord(value.readiness) ? value.readiness : {};
  const rawChecks = isRecord(readiness.checks) ? readiness.checks : readiness;

  const checks = READINESS_KEYS.reduce<Record<OutletReadinessKey, boolean>>(
    (result, key) => {
      const rawCheck = rawChecks[key];
      result[key] =
        typeof rawCheck === "boolean"
          ? rawCheck
          : isRecord(rawCheck) && rawCheck.complete === true;
      return result;
    },
    {
      brand_complete: false,
      catalog_intentional: false,
      catalog_has_games: false,
      editorial_highlight: false,
    },
  );

  const publishedAt = value.published_at ?? value.publishedAt;
  const lastPublishedAt = value.last_published_at ?? value.lastPublishedAt;
  const draftRevision = value.draft_revision ?? value.draftRevision;
  const catalogMode = value.catalog_mode ?? value.catalogMode;
  const rawPublishedRevision = isRecord(value.published_revision)
    ? value.published_revision
    : isRecord(value.publishedRevision)
      ? value.publishedRevision
      : null;
  const readinessVersion = readiness.version;
  const catalogGameCount = readiness.catalog_game_count;
  const rawCapabilities = isRecord(value.capabilities)
    ? value.capabilities
    : null;

  return {
    status: rawStatus,
    publishedAt: typeof publishedAt === "string" ? publishedAt : null,
    lastPublishedAt:
      typeof lastPublishedAt === "string" ? lastPublishedAt : null,
    draftRevision:
      typeof draftRevision === "number" &&
      Number.isInteger(draftRevision) &&
      draftRevision > 0
        ? draftRevision
        : invalidPublicationField("draft_revision"),
    catalogMode:
      catalogMode === "UNDECIDED" ||
      catalogMode === "ALL" ||
      catalogMode === "SELECTED"
        ? catalogMode
        : invalidPublicationField("catalog_mode"),
    publishedRevision: normalizePublishedRevision(rawPublishedRevision),
    readinessVersion:
      readinessVersion === 2
        ? readinessVersion
        : invalidPublicationField("readiness.version"),
    catalogGameCount:
      typeof catalogGameCount === "number" &&
      Number.isSafeInteger(catalogGameCount) &&
      catalogGameCount >= 0
        ? catalogGameCount
        : invalidPublicationField("readiness.catalog_game_count"),
    ready:
      typeof readiness.ready === "boolean"
        ? readiness.ready
        : invalidPublicationField("readiness.ready"),
    checks,
    capabilities: {
      edit: rawCapabilities?.edit === true,
      publish: rawCapabilities?.publish === true,
      unpublish: rawCapabilities?.unpublish === true,
    },
  };
}

export function nextReadinessAction(publication: OutletPublicationContract) {
  if (!publication.checks.brand_complete) return "IDENTITY" as const;
  if (
    !publication.checks.catalog_intentional ||
    !publication.checks.catalog_has_games
  ) {
    return "SELECTION" as const;
  }
  if (!publication.checks.editorial_highlight) {
    return "FEATURED" as const;
  }
  if (publication.status === "DRAFT") return "PREVIEW" as const;
  return "SHARE" as const;
}

function invalidPublicationField(field: string): never {
  throw new Error(`Invalid Outlet publication ${field}`);
}

function normalizePublishedRevision(
  value: Record<string, unknown> | null,
): OutletPublicationContract["publishedRevision"] {
  if (!value) return null;
  const sourceDraftRevision =
    value.source_draft_revision ?? value.sourceDraftRevision;
  if (
    typeof value.id !== "string" ||
    typeof value.revision !== "number" ||
    !Number.isSafeInteger(value.revision) ||
    typeof sourceDraftRevision !== "number" ||
    !Number.isSafeInteger(sourceDraftRevision)
  ) {
    throw new Error("Invalid Outlet published revision");
  }
  return {
    id: value.id,
    revision: value.revision,
    sourceDraftRevision,
  };
}

export function outletPreviewHref(slug: string) {
  return `/store/${encodeURIComponent(slug)}?preview=1`;
}

function isCreatorOutletDraft(value: unknown): value is CreatorOutletDraft {
  if (!isRecord(value)) return false;
  if (value.schemaVersion !== CREATOR_LIFECYCLE_SCHEMA_VERSION) return false;
  if (typeof value.draftId !== "string" || value.draftId.length === 0) {
    return false;
  }
  if (typeof value.ownerId !== "string") return false;
  if (value.storeSlug !== null && typeof value.storeSlug !== "string") {
    return false;
  }
  if (
    !CREATOR_ONBOARDING_STEPS.includes(
      value.currentStep as CreatorOnboardingStep,
    )
  ) {
    return false;
  }
  if (!isRecord(value.identity) || !isRecord(value.selection)) return false;
  if (!isRecord(value.featured)) return false;

  return (
    typeof value.identity.name === "string" &&
    typeof value.identity.description === "string" &&
    typeof value.identity.logoUrl === "string" &&
    typeof value.identity.niche === "string" &&
    (value.selection.strategy === null ||
      value.selection.strategy === "FOCUSED" ||
      value.selection.strategy === "HANDPICKED") &&
    Array.isArray(value.selection.tags) &&
    value.selection.tags.every((tag) => typeof tag === "string") &&
    Array.isArray(value.selection.games) &&
    value.selection.games.every(isCreatorGameSummary) &&
    (value.featured.gameSlug === null ||
      typeof value.featured.gameSlug === "string") &&
    typeof value.featured.recommendationReason === "string" &&
    (value.previewedAt === null || typeof value.previewedAt === "string") &&
    (value.linkCopiedAt === null || typeof value.linkCopiedAt === "string") &&
    typeof value.updatedAt === "string"
  );
}

function migrateCreatorOutletDraft(value: unknown): unknown {
  if (
    !isRecord(value) ||
    value.schemaVersion !== CREATOR_LIFECYCLE_SCHEMA_VERSION ||
    typeof value.ownerId !== "string" ||
    typeof value.draftId === "string"
  ) {
    return value;
  }

  return { ...value, draftId: legacyCreatorDraftId(value) };
}

function legacyCreatorDraftId(value: Record<string, unknown>) {
  const identity = isRecord(value.identity) ? value.identity : {};
  const seed = [
    value.ownerId,
    value.storeSlug,
    value.updatedAt,
    identity.name,
  ].join(":");
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `legacy-${(hash >>> 0).toString(36)}`;
}

function createCreatorDraftId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function isCreatorGameSummary(value: unknown): value is CreatorGameSummary {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.slug === "string" &&
    typeof value.title === "string" &&
    (value.bannerUrl === null || typeof value.bannerUrl === "string")
  );
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
