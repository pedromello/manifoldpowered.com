import {
  archiveCreatorOutletDraft,
  clearCreatorOutletDraft,
  creatorDraftArchiveStorageKey,
  createCreatorOutletDraft,
  earliestIncompleteStep,
  isCreatorIdentityComplete,
  isCreatorSelectionComplete,
  loadCreatorOutletDraft,
  nextReadinessAction,
  normalizeOutletPublication,
  outletPreviewHref,
  saveCreatorOutletDraft,
  startNewCreatorOutletDraft,
  type CreatorDraftStorage,
  type CreatorGameSummary,
  type CreatorOutletDraft,
} from "lib/creator-lifecycle";

const games: CreatorGameSummary[] = Array.from({ length: 5 }, (_, index) => ({
  id: `game-${index + 1}`,
  slug: `game-${index + 1}`,
  title: `Game ${index + 1}`,
  bannerUrl: null,
}));

describe("creator Outlet lifecycle", () => {
  test("never treats an implicit full catalog as a completed selection", () => {
    const draft = completeIdentity(createCreatorOutletDraft("user-1"));

    expect(draft.selection.strategy).toBeNull();
    expect(isCreatorSelectionComplete(draft)).toBe(false);
    expect(earliestIncompleteStep(draft)).toBe("SELECTION");
  });

  test("accepts initials as the logo fallback instead of requiring a URL", () => {
    const draft = completeIdentity(createCreatorOutletDraft("user-1"));

    expect(draft.identity.logoUrl).toBe("");
    expect(isCreatorIdentityComplete(draft)).toBe(true);
  });

  test("requires five games for a handpicked shelf", () => {
    const draft = completeIdentity(createCreatorOutletDraft("user-1"));
    draft.selection.strategy = "HANDPICKED";
    draft.selection.games = games.slice(0, 4);

    expect(isCreatorSelectionComplete(draft)).toBe(false);

    draft.selection.games = games;
    expect(isCreatorSelectionComplete(draft)).toBe(true);
  });

  test("accepts only an explicitly chosen focused theme", () => {
    const draft = completeIdentity(createCreatorOutletDraft("user-1"));
    draft.selection.strategy = "FOCUSED";

    expect(isCreatorSelectionComplete(draft)).toBe(false);

    draft.selection.tags = ["Strategy"];
    expect(isCreatorSelectionComplete(draft)).toBe(true);
  });

  test("resumes at the earliest incomplete step", () => {
    const draft = completeIdentity(createCreatorOutletDraft("user-1"));
    draft.selection = {
      strategy: "HANDPICKED",
      tags: [],
      games,
    };
    draft.storeSlug = "save-point-club";

    expect(earliestIncompleteStep(draft)).toBe("FEATURED");

    draft.featured = {
      gameSlug: games[0].slug,
      recommendationReason:
        "A small masterpiece with a generous point of view.",
    };
    expect(earliestIncompleteStep(draft)).toBe("PREVIEW");

    draft.previewedAt = "2026-09-01T12:00:00.000Z";
    expect(earliestIncompleteStep(draft)).toBe("PUBLISH");
  });

  test("round-trips a valid autosave and ignores corrupt JSON", () => {
    const values = new Map<string, string>();
    const storage: CreatorDraftStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    };
    const draft = completeIdentity(createCreatorOutletDraft("user-1"));

    saveCreatorOutletDraft(storage, draft);
    expect(loadCreatorOutletDraft(storage, "user-1")).toEqual(draft);

    values.set("manifold:creator-outlet-draft:v1:user-1", "{broken");
    expect(loadCreatorOutletDraft(storage, "user-1")).toBeNull();
  });

  test("gives each new Outlet draft its own stable identity", () => {
    const first = createCreatorOutletDraft(
      "user-1",
      "2026-09-01T12:00:00.000Z",
      "draft-one",
    );
    const second = createCreatorOutletDraft(
      "user-1",
      "2026-09-01T12:00:00.000Z",
      "draft-two",
    );

    expect(first.draftId).toBe("draft-one");
    expect(second.draftId).toBe("draft-two");
    expect(second).not.toEqual(first);
  });

  test("archives a completed Outlet before starting another one", () => {
    const { storage, values } = memoryStorage();
    const completed = createCreatorOutletDraft(
      "user-1",
      "2026-09-01T12:00:00.000Z",
      "completed-outlet",
    );
    completed.storeSlug = "save-point-club";
    saveCreatorOutletDraft(storage, completed);

    const next = startNewCreatorOutletDraft(
      storage,
      "user-1",
      "2026-09-02T12:00:00.000Z",
      "new-outlet",
    );

    expect(loadCreatorOutletDraft(storage, "user-1")).toEqual(next);
    expect(next.storeSlug).toBeNull();
    expect(next.identity.name).toBe("");
    expect(
      JSON.parse(
        values.get(
          creatorDraftArchiveStorageKey("user-1", "completed-outlet"),
        ) as string,
      ),
    ).toEqual(completed);
  });

  test("never clears a newer active draft while completing an older one", () => {
    const { storage, values } = memoryStorage();
    const older = createCreatorOutletDraft(
      "user-1",
      "2026-09-01T12:00:00.000Z",
      "older",
    );
    const newer = createCreatorOutletDraft(
      "user-1",
      "2026-09-02T12:00:00.000Z",
      "newer",
    );
    saveCreatorOutletDraft(storage, newer);

    archiveCreatorOutletDraft(storage, older);

    expect(loadCreatorOutletDraft(storage, "user-1")).toEqual(newer);
    expect(clearCreatorOutletDraft(storage, "user-1", "older")).toBe(false);
    expect(values.has(creatorDraftArchiveStorageKey("user-1", "older"))).toBe(
      true,
    );
  });

  test("migrates a legacy draft with a deterministic identity", () => {
    const { storage, values } = memoryStorage();
    const legacy = createCreatorOutletDraft(
      "user-1",
      "2026-09-01T12:00:00.000Z",
      "discarded",
    ) as CreatorOutletDraft & { draftId?: string };
    delete legacy.draftId;
    values.set(
      "manifold:creator-outlet-draft:v1:user-1",
      JSON.stringify(legacy),
    );

    const firstLoad = loadCreatorOutletDraft(storage, "user-1");
    const secondLoad = loadCreatorOutletDraft(storage, "user-1");

    expect(firstLoad?.draftId).toMatch(/^legacy-/);
    expect(secondLoad?.draftId).toBe(firstLoad?.draftId);
  });

  test("normalizes the exact Sprint 0 publication contract", () => {
    const publication = normalizeOutletPublication({
      status: "DRAFT",
      published_at: null,
      readiness: {
        version: 1,
        ready: false,
        checks: {
          brand_complete: true,
          catalog_curated: true,
          catalog_has_games: true,
          editorial_highlight: false,
        },
      },
    });

    expect(publication).toEqual({
      status: "DRAFT",
      publishedAt: null,
      readinessVersion: 1,
      ready: false,
      checks: {
        brand_complete: true,
        catalog_curated: true,
        catalog_has_games: true,
        editorial_highlight: false,
      },
    });
    expect(nextReadinessAction(publication)).toBe("FEATURED");
  });

  test("uses server publication status as the source of truth for the next action", () => {
    const published = normalizeOutletPublication({
      status: "PUBLISHED",
      published_at: "2026-09-01T12:00:00.000Z",
      readiness: {
        version: 1,
        ready: true,
        checks: {
          brand_complete: true,
          catalog_curated: true,
          catalog_has_games: true,
          editorial_highlight: true,
        },
      },
    });

    expect(nextReadinessAction(published)).toBe("SHARE");
    expect(outletPreviewHref("save point")).toBe(
      "/store/save%20point?preview=1",
    );
  });
});

function completeIdentity(draft: CreatorOutletDraft) {
  draft.identity = {
    name: "Save Point Club",
    description: "Patient recommendations for memorable games.",
    logoUrl: "",
    niche: "Cozy indies for slow Sunday mornings",
  };
  return draft;
}

function memoryStorage() {
  const values = new Map<string, string>();
  const storage: CreatorDraftStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  return { storage, values };
}
