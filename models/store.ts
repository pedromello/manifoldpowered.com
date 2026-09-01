import { prisma } from "infra/database";
import { z } from "zod";
import {
  ConflictError,
  InternalServerError,
  NotFoundError,
  ValidationError,
} from "infra/errors";
import {
  Prisma,
  type Store,
  type StoreRevision,
  type User,
} from "generated/prisma/client";
import userModel from "models/user";
import authorization from "models/authorization";
import {
  DEFAULT_STORE_BRAND_TOKENS,
  DEFAULT_STORE_LAYOUT_PRESET,
  STORE_LAYOUT_PRESETS,
  STORE_PALETTES,
  STORE_SHAPES,
  STORE_TYPOGRAPHIES,
  type StoreBrandTokens,
  type StoreCurationSnapshot,
  type StoreCurationStrategy,
  type StoreLayoutPreset,
  type StorePresentationSnapshot,
  type StoreSocialLinks,
} from "contracts/store-presentation";

export {
  DEFAULT_STORE_BRAND_TOKENS,
  STORE_LAYOUT_PRESETS,
  STORE_PALETTES,
  STORE_SHAPES,
  STORE_TYPOGRAPHIES,
} from "contracts/store-presentation";

export const STORE_OWNER_FEATURES = [
  "update:store_presentation",
  "publish:store",
] as const;

export type StoreWithPublishedRevision = Store & {
  published_revision: StoreRevision | null;
  publication_readiness?: StorePublicationReadiness;
};

export const MIN_PUBLISHABLE_STORE_GAMES = 5;

export type StorePublicationReadiness = {
  ready: boolean;
  blockers: Array<
    | "IDENTITY_INCOMPLETE"
    | "CURATION_STRATEGY_REQUIRED"
    | "MINIMUM_GAMES_REQUIRED"
    | "FEATURED_REQUIRED"
  >;
  checks: {
    identity_complete: boolean;
    strategy_chosen: boolean;
    strategy: StoreCurationStrategy;
    selected_games: number;
    minimum_games: number;
    featured_games: number;
  };
};

function presentationFromStore(store: Store): StorePresentationSnapshot {
  return {
    name: store.name,
    description: store.description,
    logo_url: store.logo_url,
    theme_key: store.theme_key,
    layout_preset: store.layout_preset as StoreLayoutPreset | null,
    tagline: store.tagline,
    cover_url: store.cover_url,
    social_links: store.social_links as StoreSocialLinks,
    brand_tokens: store.brand_tokens as StoreBrandTokens,
  };
}

function projectPublishedRevision(
  store: Store,
  revision: StoreRevision,
): StoreWithPublishedRevision {
  return {
    ...store,
    name: revision.name,
    description: revision.description,
    logo_url: revision.logo_url,
    theme_key: revision.theme_key,
    layout_preset: revision.layout_preset,
    tagline: revision.tagline,
    cover_url: revision.cover_url,
    social_links: revision.social_links,
    brand_tokens: revision.brand_tokens,
    published_revision: revision,
  };
}

function curationRevisionForRequest(
  store: StoreWithPublishedRevision,
  preview: boolean,
): StoreRevision | undefined {
  if (preview) return undefined;
  if (!store.published_revision) {
    throw new InternalServerError({
      action: "Repair the Outlet publication pointer before serving it",
    });
  }
  return store.published_revision;
}

async function attachPublishedRevision(
  store: Store,
): Promise<StoreWithPublishedRevision> {
  const publishedRevision = store.published_revision_id
    ? await prisma.storeRevision.findUnique({
        where: { id: store.published_revision_id },
      })
    : null;

  return { ...store, published_revision: publishedRevision };
}

async function attachManagementState(
  store: Store,
): Promise<StoreWithPublishedRevision> {
  const [withRevision, curationSnapshot] = await Promise.all([
    attachPublishedRevision(store),
    loadCurationSnapshot(store.id),
  ]);
  const publicationReadiness = await evaluatePublicationReadiness(
    store,
    curationSnapshot,
  );

  return {
    ...withRevision,
    publication_readiness: publicationReadiness,
  };
}

async function attachPublishedRevisions(
  stores: Store[],
): Promise<StoreWithPublishedRevision[]> {
  const revisionIds = stores.flatMap((store) =>
    store.published_revision_id ? [store.published_revision_id] : [],
  );
  const revisions =
    revisionIds.length > 0
      ? await prisma.storeRevision.findMany({
          where: { id: { in: revisionIds } },
        })
      : [];
  const revisionById = new Map(
    revisions.map((revision) => [revision.id, revision]),
  );

  return stores.map((store) => ({
    ...store,
    published_revision: store.published_revision_id
      ? (revisionById.get(store.published_revision_id) ?? null)
      : null,
  }));
}

const httpsUrlSchema = z
  .string()
  .trim()
  .url()
  .max(2048)
  .refine((value) => {
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  }, "URL must use https");

export const storeSocialLinksSchema = z
  .object({
    website: httpsUrlSchema.optional(),
    youtube: httpsUrlSchema.optional(),
    twitch: httpsUrlSchema.optional(),
    instagram: httpsUrlSchema.optional(),
    tiktok: httpsUrlSchema.optional(),
    x: httpsUrlSchema.optional(),
  })
  .strict();

export const storeBrandTokensSchema = z
  .object({
    palette: z.enum(STORE_PALETTES),
    typography: z.enum(STORE_TYPOGRAPHIES),
    shape: z.enum(STORE_SHAPES),
  })
  .strict();

export const storeSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    description: z.string().trim().max(2000).nullable().optional(),
    logo_url: httpsUrlSchema.nullable().optional(),
    layout_preset: z.enum(STORE_LAYOUT_PRESETS).optional(),
    tagline: z.string().trim().max(160).nullable().optional(),
    cover_url: httpsUrlSchema.nullable().optional(),
    // Null explicitly resets JSON identity to its safe value. Keep defaults
    // out of Zod: they survive `.partial()` and would reset omitted PATCH data.
    social_links: storeSocialLinksSchema.nullable().optional(),
    brand_tokens: storeBrandTokensSchema.nullable().optional(),
  })
  .strict();

export const storeUpdateSchema = storeSchema.partial();

export type StoreCreateDto = z.infer<typeof storeSchema> & {
  owner_id: string;
};

export type StoreUpdateDto = z.infer<typeof storeUpdateSchema>;

type CurationReadClient = Prisma.TransactionClient | typeof prisma;

async function loadCurationSnapshot(
  storeId: string,
  client: CurationReadClient = prisma,
): Promise<StoreCurationSnapshot> {
  const [featured, tagFilters, gameOverrides] = await Promise.all([
    client.storeFeaturedGame.findMany({
      where: { store_id: storeId },
      orderBy: { position: "asc" },
    }),
    client.storeTagFilter.findMany({
      where: { store_id: storeId },
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
    }),
    client.storeGameOverride.findMany({
      where: { store_id: storeId },
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
    }),
  ]);

  const hasRules = tagFilters.length > 0;
  const hasManualOverrides = gameOverrides.length > 0;
  const curationStrategy: StoreCurationStrategy =
    hasRules && hasManualOverrides
      ? "MIXED"
      : hasRules
        ? "RULES"
        : hasManualOverrides
          ? "MANUAL"
          : "NONE";

  return {
    curation_strategy: curationStrategy,
    featured_games: featured.map(
      ({ game_id, position, recommendation_reason }) => ({
        game_id,
        position,
        recommendation_reason,
      }),
    ),
    tag_filters: tagFilters.map(({ tag, mode }) => ({ tag, mode })),
    game_overrides: gameOverrides.map(({ game_id, visibility }) => ({
      game_id,
      visibility,
    })),
  };
}

async function evaluatePublicationReadiness(
  store: Store,
  snapshot: StoreCurationSnapshot,
  client: CurationReadClient = prisma,
): Promise<StorePublicationReadiness> {
  const activeGames = await client.game.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, tags: true },
  });
  const whitelist = new Set(
    snapshot.tag_filters
      .filter(({ mode }) => mode === "WHITELIST")
      .map(({ tag }) => tag.toLowerCase()),
  );
  const blacklist = new Set(
    snapshot.tag_filters
      .filter(({ mode }) => mode === "BLACKLIST")
      .map(({ tag }) => tag.toLowerCase()),
  );
  const overrideByGameId = new Map(
    snapshot.game_overrides.map(({ game_id, visibility }) => [
      game_id,
      visibility,
    ]),
  );

  const selectedGameIds = new Set(
    activeGames.flatMap((game) => {
      const override = overrideByGameId.get(game.id);
      if (override === "HIDE") return [];
      if (override === "SHOW") return [game.id];

      const tags = game.tags.map((tag) => tag.toLowerCase());
      const matchesWhitelist =
        whitelist.size === 0 || tags.some((tag) => whitelist.has(tag));
      const matchesBlacklist = tags.some((tag) => blacklist.has(tag));
      return matchesWhitelist && !matchesBlacklist ? [game.id] : [];
    }),
  );
  const eligibleFeaturedGames = snapshot.featured_games.filter(({ game_id }) =>
    selectedGameIds.has(game_id),
  ).length;

  const identityComplete = Boolean(
    store.description?.trim() &&
    store.tagline?.trim() &&
    store.layout_preset &&
    store.logo_url &&
    httpsUrlSchema.safeParse(store.logo_url).success &&
    store.cover_url &&
    httpsUrlSchema.safeParse(store.cover_url).success,
  );
  // A SHOW-only override does not narrow the current automatic catalog, so it
  // cannot masquerade as a selection strategy. Publishing requires an actual
  // curated subset rather than silently exposing the complete active catalog.
  const strategyChosen =
    snapshot.curation_strategy !== "NONE" &&
    selectedGameIds.size < activeGames.length;
  const enoughGames = selectedGameIds.size >= MIN_PUBLISHABLE_STORE_GAMES;
  const featuredReady =
    eligibleFeaturedGames >= 1 &&
    eligibleFeaturedGames === snapshot.featured_games.length;
  const blockers: StorePublicationReadiness["blockers"] = [];
  if (!identityComplete) blockers.push("IDENTITY_INCOMPLETE");
  if (!strategyChosen) blockers.push("CURATION_STRATEGY_REQUIRED");
  if (!enoughGames) blockers.push("MINIMUM_GAMES_REQUIRED");
  if (!featuredReady) blockers.push("FEATURED_REQUIRED");

  return {
    ready: blockers.length === 0,
    blockers,
    checks: {
      identity_complete: identityComplete,
      strategy_chosen: strategyChosen,
      strategy: snapshot.curation_strategy,
      selected_games: selectedGameIds.size,
      minimum_games: MIN_PUBLISHABLE_STORE_GAMES,
      featured_games: eligibleFeaturedGames,
    },
  };
}

export function parseStoreDraftIfMatch(
  value: string | string[] | undefined,
): number {
  const match =
    typeof value === "string" ? /^(?:"(\d+)"|(\d+))$/.exec(value) : null;
  const parsed = match ? Number(match[1] ?? match[2]) : Number.NaN;

  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new ValidationError({
      message: "A valid If-Match draft revision is required",
      action: 'Send the current draft ETag, for example If-Match: "3"',
    });
  }

  return parsed;
}

// What an outlet owner can delegate. read:store_statement is here because the
// outlet holds the money now: someone can be given the books without being
// given the outlet, which matters more once ownership no longer follows the
// balance. manage:payout_account follows the same reasoning — whoever keeps the
// books is who notices a bank detail has gone stale — and stays safe to
// delegate because the account holds no bank details itself, only an opaque
// provider reference, and because changing it resets verification to false.
export const MEMBER_PERMISSIONS = [
  "update:store",
  "read:store_preview",
  "manage:store_featured_games",
  "manage:store_members",
  "read:store_statement",
  "read:payout_account",
  "manage:payout_account",
];

export const memberPermissionsSchema = z.object({
  permissions: z.array(z.enum(MEMBER_PERMISSIONS)).min(1),
});

export const storeAdminQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  q: z.string().optional(),
});

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/--+/g, "-")
    .trim();
}

async function validateUniqueSlug(slug: string) {
  const existingStore = await prisma.store.findUnique({
    where: {
      slug,
    },
    select: {
      name: true,
      slug: true,
    },
  });

  if (existingStore) {
    throw new ValidationError({
      message: `Store with slug ${existingStore.slug} already exists. Its name is ${existingStore.name}.`,
      action: "Try a different name.",
    });
  }
}

async function create(storeData: StoreCreateDto) {
  const slug = generateSlug(storeData.name);
  await validateUniqueSlug(slug);

  const socialLinks = storeData.social_links ?? {};
  const brandTokens = storeData.brand_tokens ?? DEFAULT_STORE_BRAND_TOKENS;
  const layoutPreset = storeData.layout_preset ?? DEFAULT_STORE_LAYOUT_PRESET;

  const createdStore = await prisma.store.create({
    data: {
      name: storeData.name,
      description: storeData.description,
      logo_url: storeData.logo_url,
      layout_preset: layoutPreset,
      tagline: storeData.tagline,
      cover_url: storeData.cover_url,
      social_links: socialLinks,
      brand_tokens: brandTokens,
      owner_id: storeData.owner_id,
      slug,
    },
  });

  // The owner is authorized for every store-scoped action via the isOwner
  // check in authorization.can(), but controller.canRequest(feature) also
  // gates on the *global* feature before that resource check ever runs.
  // Grant those features here so a fresh store owner can actually use them.
  await userModel.addFeatures(storeData.owner_id, [
    ...MEMBER_PERMISSIONS,
    ...STORE_OWNER_FEATURES,
  ]);

  return createdStore;
}

async function findAllPaginated({
  page = 1,
  limit = 20,
  q,
  owner_id,
  onlyPublished = false,
}: {
  page?: number;
  limit?: number;
  q?: string;
  owner_id?: string;
  onlyPublished?: boolean;
}) {
  const where: Prisma.StoreWhereInput = {};

  if (onlyPublished) {
    where.publication_status = "PUBLISHED";
    where.published_revision_id = { not: null };
  }

  if (q) {
    if (onlyPublished) {
      const matchingRevisions = await prisma.storeRevision.findMany({
        where: { name: { contains: q, mode: "insensitive" } },
        select: { id: true },
      });
      where.OR = [
        { slug: { contains: q, mode: "insensitive" } },
        {
          published_revision_id: {
            in: matchingRevisions.map((revision) => revision.id),
          },
        },
      ];
    } else {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { slug: { contains: q, mode: "insensitive" } },
      ];
    }
  }

  if (owner_id) {
    where.owner_id = owner_id;
  }

  const [stores, total] = await Promise.all([
    prisma.store.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.store.count({ where }),
  ]);

  const outputStores = onlyPublished
    ? (await attachPublishedRevisions(stores)).flatMap((store) =>
        store.published_revision
          ? [projectPublishedRevision(store, store.published_revision)]
          : [],
      )
    : stores;

  return {
    stores: outputStores,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
}

// Every store the user can act on: those they own plus those they're a member
// of (via StoreMember). Powers the "My Outlets" resolver. There is no
// Store<->StoreMember relation (the repo forbids foreign keys), so the
// membership side is resolved to store ids first, then those stores are
// fetched by id and unioned with the owned ones. Owned and member sets are
// disjoint (addMember rejects the owner) but we dedup defensively. Ordered
// owned-first, then alphabetical by name within each group.
async function findAllForUser(userId: string) {
  const [ownedStores, memberRows] = await Promise.all([
    prisma.store.findMany({ where: { owner_id: userId } }),
    prisma.storeMember.findMany({
      where: { user_id: userId },
      select: { store_id: true },
    }),
  ]);

  const ownedIds = new Set(ownedStores.map((store) => store.id));
  const memberStoreIds = memberRows
    .map((row) => row.store_id)
    .filter((id) => !ownedIds.has(id));

  const memberStores =
    memberStoreIds.length > 0
      ? await prisma.store.findMany({ where: { id: { in: memberStoreIds } } })
      : [];

  const byName = (a: { name: string }, b: { name: string }) =>
    a.name.localeCompare(b.name);

  return attachPublishedRevisions([
    ...ownedStores.sort(byName),
    ...memberStores.sort(byName),
  ]);
}

async function findAllForSitemap() {
  const stores = await prisma.store.findMany({
    where: { publication_status: "PUBLISHED" },
    orderBy: { updated_at: "desc" },
    select: { slug: true, updated_at: true, published_at: true },
  });

  return stores.map(({ slug, updated_at, published_at }) => ({
    slug,
    updated_at: published_at ?? updated_at,
  }));
}

async function findOneBySlug(slug: string) {
  const store = await prisma.store.findUnique({
    where: {
      slug,
    },
  });

  if (!store) {
    throw new NotFoundError({
      message: `Store with slug "${slug}" was not found.`,
      action: "Check the slug and try again.",
    });
  }

  return store;
}

async function findOnePublishedBySlug(slug: string) {
  const store = await prisma.store.findFirst({
    where: {
      slug,
      publication_status: "PUBLISHED",
    },
  });

  if (!store?.published_revision_id) {
    throwStoreNotFound(slug);
  }

  const revision = await prisma.storeRevision.findUnique({
    where: { id: store.published_revision_id },
  });

  if (!revision) {
    throwStoreNotFound(slug);
  }

  return projectPublishedRevision(store, revision);
}

async function findPublishedByIds(ids: string[]) {
  if (ids.length === 0) return [];

  const stores = await prisma.store.findMany({
    where: {
      id: { in: ids },
      publication_status: "PUBLISHED",
      published_revision_id: { not: null },
    },
  });

  return (await attachPublishedRevisions(stores)).flatMap((store) =>
    store.published_revision
      ? [projectPublishedRevision(store, store.published_revision)]
      : [],
  );
}

function throwStoreNotFound(slug: string): never {
  throw new NotFoundError({
    message: `Store with slug "${slug}" was not found.`,
    action: "Check the slug and try again.",
  });
}

async function findOneBySlugWithMembers(slug: string) {
  const store = await findOneBySlug(slug);

  const members = await prisma.storeMember.findMany({
    where: {
      store_id: store.id,
    },
  });

  return { ...store, members };
}

async function findOneBySlugWithRevisionAndMembers(slug: string) {
  const store = await findOneBySlugWithMembers(slug);
  const withRevision = await attachPublishedRevision(store);
  return { ...withRevision, members: store.members };
}

async function findOneVisibleBySlug(
  slug: string,
  user: Partial<User>,
  preview = false,
) {
  const store = await findOneBySlugWithMembers(slug);

  if (preview) {
    if (!authorization.can(user, "read:store_preview", store)) {
      throwStoreNotFound(slug);
    }

    return attachManagementState(store);
  }

  if (store.publication_status !== "PUBLISHED") {
    throwStoreNotFound(slug);
  }

  const withRevision = await attachPublishedRevision(store);
  if (!withRevision.published_revision) {
    throwStoreNotFound(slug);
  }

  return projectPublishedRevision(
    withRevision,
    withRevision.published_revision,
  );
}

async function update(
  id: string,
  updateData: StoreUpdateDto,
  expectedDraftRevision: number,
) {
  const result = storeUpdateSchema.safeParse(updateData);

  if (!result.success) {
    throw new ValidationError({
      message: "One or more fields are invalid",
      action: "Check the fields and try again",
      context: result.error.issues,
    });
  }

  const validatedData = result.data;
  const normalizedData = {
    ...validatedData,
    ...(validatedData.social_links === null ? { social_links: {} } : {}),
    ...(validatedData.brand_tokens === null
      ? { brand_tokens: DEFAULT_STORE_BRAND_TOKENS }
      : {}),
  };

  const updatedStore = await prisma.$transaction(async (transaction) => {
    const existingStore = await transaction.store.findUnique({
      where: { id },
    });

    if (!existingStore) {
      throw new NotFoundError({
        message: "Store not found.",
        action: "Check the store ID and try again.",
      });
    }

    if (existingStore.draft_revision !== expectedDraftRevision) {
      throw new ConflictError({
        message: "The Outlet draft changed before it could be saved",
        action: "Reload the preview and apply your changes to the latest draft",
      });
    }

    const updateResult = await transaction.store.updateMany({
      where: { id, draft_revision: expectedDraftRevision },
      data: {
        ...normalizedData,
        draft_revision: { increment: 1 },
      },
    });

    if (updateResult.count !== 1) {
      throw new ConflictError({
        message: "The Outlet draft changed before it could be saved",
        action: "Reload the preview and apply your changes to the latest draft",
      });
    }

    return transaction.store.findUniqueOrThrow({ where: { id } });
  });

  return attachManagementState(updatedStore);
}

async function publish(
  id: string,
  createdBy: string,
  expectedDraftRevision: number,
) {
  try {
    return await prisma.$transaction(async (transaction) => {
      const existingStore = await transaction.store.findUnique({
        where: { id },
      });

      if (!existingStore) {
        throw new NotFoundError({
          message: "Store not found.",
          action: "Check the store ID and try again.",
        });
      }

      if (existingStore.draft_revision !== expectedDraftRevision) {
        throw publishConflict();
      }

      const curationSnapshot = await loadCurationSnapshot(id, transaction);
      const publicationReadiness = await evaluatePublicationReadiness(
        existingStore,
        curationSnapshot,
        transaction,
      );
      if (!publicationReadiness.ready) {
        throw new ValidationError({
          message: "The Outlet is not ready to publish",
          action:
            "Complete every identity, selection, and Featured requirement",
          context: { publication_readiness: publicationReadiness },
        });
      }

      const draftPresentation = presentationFromStore(existingStore);
      const result = storeSchema.safeParse({
        name: draftPresentation.name,
        description: draftPresentation.description,
        logo_url: draftPresentation.logo_url,
        layout_preset: draftPresentation.layout_preset,
        tagline: draftPresentation.tagline,
        cover_url: draftPresentation.cover_url,
        social_links: draftPresentation.social_links,
        brand_tokens: draftPresentation.brand_tokens,
      });
      if (!result.success) {
        throw new ValidationError({
          message: "The Outlet draft is not ready to publish",
          action:
            "Fix the invalid identity or presentation fields and try again",
          context: result.error.issues,
        });
      }

      const latestRevision = await transaction.storeRevision.aggregate({
        where: { store_id: id },
        _max: { revision_number: true },
      });
      const revision = await transaction.storeRevision.create({
        data: {
          store_id: id,
          revision_number: (latestRevision._max.revision_number ?? 0) + 1,
          // Publish itself advances the Store ETag. The new snapshot represents
          // that post-publish version, so a clean preview compares equal while
          // replaying the old If-Match deterministically conflicts.
          source_draft_revision: expectedDraftRevision + 1,
          created_by: createdBy,
          name: result.data.name,
          description: result.data.description,
          logo_url: result.data.logo_url,
          theme_key: existingStore.theme_key,
          layout_preset:
            result.data.layout_preset ?? DEFAULT_STORE_LAYOUT_PRESET,
          tagline: result.data.tagline,
          cover_url: result.data.cover_url,
          social_links: result.data.social_links ?? {},
          brand_tokens: result.data.brand_tokens ?? DEFAULT_STORE_BRAND_TOKENS,
          curation_strategy: curationSnapshot.curation_strategy,
          featured_games: curationSnapshot.featured_games,
          tag_filters: curationSnapshot.tag_filters,
          game_overrides: curationSnapshot.game_overrides,
        },
      });
      const updateResult = await transaction.store.updateMany({
        where: {
          id,
          draft_revision: expectedDraftRevision,
          published_revision_id: existingStore.published_revision_id,
        },
        data: {
          publication_status: "PUBLISHED",
          published_revision_id: revision.id,
          published_at: new Date(),
          draft_revision: { increment: 1 },
        },
      });

      if (updateResult.count !== 1) {
        throw publishConflict();
      }

      const publishedStore = await transaction.store.findUniqueOrThrow({
        where: { id },
      });
      return {
        ...publishedStore,
        published_revision: revision,
        publication_readiness: publicationReadiness,
      };
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" || error.code === "P2034")
    ) {
      throw publishConflict();
    }

    throw error;
  }
}

function publishConflict() {
  return new ConflictError({
    message: "The Outlet changed before it could be published",
    action: "Reload the preview and publish the latest draft",
  });
}

async function unpublish(id: string, expectedDraftRevision: number) {
  const unpublishedStore = await prisma.$transaction(async (transaction) => {
    const existingStore = await transaction.store.findUnique({ where: { id } });
    if (!existingStore) {
      throw new NotFoundError({
        message: "Store not found.",
        action: "Check the store ID and try again.",
      });
    }
    if (existingStore.draft_revision !== expectedDraftRevision) {
      throw publishConflict();
    }

    const result = await transaction.store.updateMany({
      where: {
        id,
        draft_revision: expectedDraftRevision,
        publication_status: "PUBLISHED",
      },
      data: {
        publication_status: "DRAFT",
        draft_revision: { increment: 1 },
      },
    });
    if (result.count !== 1) throw publishConflict();
    return transaction.store.findUniqueOrThrow({ where: { id } });
  });
  return attachManagementState(unpublishedStore);
}

async function addMember(
  storeId: string,
  username: string,
  permissions: string[],
) {
  const targetUser = await userModel.findOneByUsername(username);

  const store = await prisma.store.findUnique({
    where: {
      id: storeId,
    },
  });

  if (!store) {
    throw new NotFoundError({
      message: "Store not found.",
      action: "Check the store ID and try again.",
    });
  }

  if (targetUser.id === store.owner_id) {
    throw new ValidationError({
      message:
        "The store owner already has full access and cannot be added as a member.",
      action: "Choose a different user to add as a member.",
    });
  }

  let createdMember;
  try {
    createdMember = await prisma.storeMember.create({
      data: {
        store_id: storeId,
        user_id: targetUser.id,
        permissions,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ValidationError({
        message: `User "${username}" is already a member of this store.`,
        action: "Update their permissions instead of adding them again.",
      });
    }
    throw error;
  }

  // Mirror the granted permissions into the member's global features, same
  // reasoning as in create() above.
  await userModel.addFeatures(targetUser.id, permissions);

  return createdMember;
}

async function findOneMemberByUsername(storeId: string, username: string) {
  const targetUser = await userModel.findOneByUsername(username);

  const member = await prisma.storeMember.findUnique({
    where: {
      store_id_user_id: {
        store_id: storeId,
        user_id: targetUser.id,
      },
    },
  });

  if (!member) {
    throw new NotFoundError({
      message: `User "${username}" is not a member of this store.`,
      action: "Check the username and try again.",
    });
  }

  return member;
}

async function updateMemberPermissions(
  storeId: string,
  username: string,
  permissions: string[],
) {
  const member = await findOneMemberByUsername(storeId, username);

  const updatedMember = await prisma.storeMember.update({
    where: {
      id: member.id,
    },
    data: {
      permissions,
    },
  });

  await userModel.addFeatures(member.user_id, permissions);

  return updatedMember;
}

async function removeMember(storeId: string, username: string) {
  const member = await findOneMemberByUsername(storeId, username);

  await prisma.storeMember.delete({
    where: {
      id: member.id,
    },
  });
}

async function listMembersWithUsernames(storeId: string) {
  const members = await prisma.storeMember.findMany({
    where: {
      store_id: storeId,
    },
    orderBy: {
      created_at: "asc",
    },
  });

  const userIds = members.map((member) => member.user_id);
  const users = await prisma.user.findMany({
    where: {
      id: { in: userIds },
    },
    select: {
      id: true,
      username: true,
    },
  });

  const usernameByUserId = users.reduce(
    (acc, user) => {
      acc[user.id] = user.username;
      return acc;
    },
    {} as Record<string, string>,
  );

  return members.map((member) => ({
    ...member,
    username: usernameByUserId[member.user_id] || "unknown",
  }));
}

const store = {
  create,
  findAllPaginated,
  findAllForUser,
  findAllForSitemap,
  findOneBySlug,
  findOnePublishedBySlug,
  findPublishedByIds,
  findOneBySlugWithMembers,
  findOneBySlugWithRevisionAndMembers,
  findOneVisibleBySlug,
  curationRevisionForRequest,
  update,
  publish,
  unpublish,
  addMember,
  updateMemberPermissions,
  removeMember,
  listMembersWithUsernames,
};

export default store;
