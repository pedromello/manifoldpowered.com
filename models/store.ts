import { prisma } from "infra/database";
import { z } from "zod";
import { ConflictError, NotFoundError, ValidationError } from "infra/errors";
import {
  Prisma,
  type Store,
  type StoreRevision,
  type StoreStatus,
  type User,
} from "generated/prisma/client";
import userModel from "models/user";
import authorization from "models/authorization";
import {
  getCurationWhereClause,
  getDraftCatalogSnapshot,
  getSnapshotCurationWhereClause,
  storeDraftCatalogModeSchema,
  type StoreCatalogSnapshot,
} from "models/store_catalog";
import {
  createStoreRevision,
  getReadyDraftSnapshot,
  getStorePublicationReadiness,
  parseStoreRevision,
  type StoreFeaturedSnapshotEntry,
  type StorePublicationReadinessV2,
} from "models/store_revision";
import {
  resolveDraftPresentation,
  type StorePresentation,
} from "models/store_presentation";

export const storeSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  logo_url: z.string().url().max(2048).optional(),
});

export const storeUpdateSchema = storeSchema
  .partial()
  .extend({ catalog_mode: storeDraftCatalogModeSchema.optional() })
  .strict();

export type StoreCreateDto = z.infer<typeof storeSchema> & {
  owner_id: string;
};

export const STORE_PUBLICATION_ACTIONS = ["publish", "unpublish"] as const;

export const storePublicationActionSchema = z
  .object({
    action: z.enum(STORE_PUBLICATION_ACTIONS),
    expected_draft_revision: z.number().int().min(1),
  })
  .strict();

export type StorePublicationAction = (typeof STORE_PUBLICATION_ACTIONS)[number];

export type StorePublicationView = Pick<
  Store,
  | "status"
  | "published_at"
  | "last_published_at"
  | "draft_revision"
  | "catalog_mode"
> & {
  published_revision: {
    id: string;
    revision: number;
    source_draft_revision: number;
  } | null;
  readiness: StorePublicationReadinessV2;
};

export type StorefrontStore = Pick<
  Store,
  | "id"
  | "slug"
  | "name"
  | "description"
  | "logo_url"
  | "owner_id"
  | "status"
  | "published_at"
  | "last_published_at"
  | "draft_revision"
  | "created_at"
  | "updated_at"
> & {
  catalog_mode: "UNDECIDED" | "ALL" | "SELECTED" | "LEGACY_ALL";
  presentation: StorePresentation;
  storefront_source: "DRAFT" | "REVISION";
  published_revision: {
    id: string;
    revision: number;
    source_draft_revision: number;
  } | null;
  catalog_snapshot: StoreCatalogSnapshot | null;
  featured_games_snapshot: StoreFeaturedSnapshotEntry[];
};

// What an outlet owner can delegate. read:store_statement is here because the
// outlet holds the money now: someone can be given the books without being
// given the outlet, which matters more once ownership no longer follows the
// balance. manage:payout_account follows the same reasoning — whoever keeps the
// books is who notices a bank detail has gone stale — and stays safe to
// delegate because the account holds no bank details itself, only an opaque
// provider reference, and because changing it resets verification to false.
export const MEMBER_PERMISSIONS = [
  "update:store",
  "publish:store",
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

  const createdStore = await prisma.store.create({
    data: {
      name: storeData.name,
      description: storeData.description,
      logo_url: storeData.logo_url,
      owner_id: storeData.owner_id,
      slug,
    },
  });

  // The owner is authorized for every store-scoped action via the isOwner
  // check in authorization.can(), but controller.canRequest(feature) also
  // gates on the *global* feature before that resource check ever runs.
  // Grant those features here so a fresh store owner can actually use them.
  await userModel.addFeatures(storeData.owner_id, MEMBER_PERMISSIONS);

  return createdStore;
}

async function findAllPaginated({
  page = 1,
  limit = 20,
  q,
  owner_id,
  status,
}: {
  page?: number;
  limit?: number;
  q?: string;
  owner_id?: string;
  status?: StoreStatus;
}) {
  const where: Prisma.StoreWhereInput = {};

  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { slug: { contains: q, mode: "insensitive" } },
    ];
  }

  if (owner_id) {
    where.owner_id = owner_id;
  }

  if (status) {
    where.status = status;
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

  return {
    stores,
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

  return [...ownedStores.sort(byName), ...memberStores.sort(byName)];
}

async function findAllForSitemap() {
  const { stores } = await findAllPublishedPaginated({
    page: 1,
    limit: 100_000,
  });
  return stores.map((publishedStore) => ({
    slug: publishedStore.slug,
    updated_at: publishedStore.updated_at,
  }));
}

async function findAllPublishedPaginated({
  page = 1,
  limit = 20,
  q,
}: {
  page?: number;
  limit?: number;
  q?: string;
}) {
  const rows = await prisma.store.findMany({
    where: {
      status: "PUBLISHED",
      published_revision_id: { not: null },
    },
    orderBy: { created_at: "desc" },
  });
  const revisionIds = rows.flatMap(({ published_revision_id }) =>
    published_revision_id ? [published_revision_id] : [],
  );
  const revisions = await prisma.storeRevision.findMany({
    where: { id: { in: revisionIds } },
  });
  const revisionById = new Map(
    revisions.map((revision) => [revision.id, revision]),
  );

  // A corrupt/missing logical pointer is omitted rather than falling back to
  // mutable Store columns. That fail-closed behavior is intentional.
  const projected = rows.flatMap((row) => {
    const revision = row.published_revision_id
      ? revisionById.get(row.published_revision_id)
      : undefined;
    if (!revision || revision.store_id !== row.id) return [];
    try {
      return [projectPublishedStore(row, revision)];
    } catch {
      return [];
    }
  });
  const normalizedQuery = q?.trim().toLowerCase();
  const matching = normalizedQuery
    ? projected.filter(
        (item) =>
          item.name.toLowerCase().includes(normalizedQuery) ||
          item.slug.toLowerCase().includes(normalizedQuery),
      )
    : projected;
  const total = matching.length;

  return {
    stores: matching.slice((page - 1) * limit, page * limit),
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
}

function storeNotFound(slug: string): NotFoundError {
  return new NotFoundError({
    message: `Store with slug "${slug}" was not found.`,
    action: "Check the slug and try again.",
  });
}

async function findOneBySlug(slug: string) {
  const store = await prisma.store.findUnique({
    where: {
      slug,
    },
  });

  if (!store) {
    throw storeNotFound(slug);
  }

  return store;
}

async function findOnePublishedBySlug(slug: string) {
  const foundStore = await prisma.store.findFirst({
    where: {
      slug,
      status: "PUBLISHED",
      published_revision_id: { not: null },
    },
  });
  if (!foundStore?.published_revision_id) {
    throw storeNotFound(slug);
  }
  const revision = await prisma.storeRevision.findFirst({
    where: {
      id: foundStore.published_revision_id,
      store_id: foundStore.id,
    },
  });
  if (!revision) throw storeNotFound(slug);

  try {
    return projectPublishedStore(foundStore, revision);
  } catch {
    throw storeNotFound(slug);
  }
}

function projectPublishedStore(
  storeRow: Store,
  revisionRow: StoreRevision,
): StorefrontStore {
  const revision = parseStoreRevision(revisionRow, storeRow.slug);
  if (
    storeRow.status !== "PUBLISHED" ||
    storeRow.published_revision_id !== revision.id ||
    revision.store_id !== storeRow.id
  ) {
    throw storeNotFound(storeRow.slug);
  }

  return {
    id: storeRow.id,
    slug: storeRow.slug,
    name: revision.name,
    description: revision.description,
    logo_url: revision.logo_url,
    owner_id: storeRow.owner_id,
    status: storeRow.status,
    catalog_mode: revision.catalog.catalog_mode,
    draft_revision: storeRow.draft_revision,
    published_at: storeRow.published_at,
    last_published_at: storeRow.last_published_at,
    created_at: storeRow.created_at,
    updated_at: revision.created_at,
    presentation: revision.presentation,
    storefront_source: "REVISION",
    published_revision: {
      id: revision.id,
      revision: revision.revision,
      source_draft_revision: revision.source_draft_revision,
    },
    catalog_snapshot: revision.catalog,
    featured_games_snapshot: revision.featured_games,
  };
}

async function projectDraftStore(storeRow: Store): Promise<StorefrontStore> {
  const [catalog, featuredGames, publishedRevision] = await Promise.all([
    getDraftCatalogSnapshot(storeRow.id),
    prisma.storeFeaturedGame.findMany({
      where: { store_id: storeRow.id },
      orderBy: [{ position: "asc" }, { id: "asc" }],
      select: {
        game_id: true,
        position: true,
        recommendation_reason: true,
      },
    }),
    storeRow.published_revision_id
      ? prisma.storeRevision.findFirst({
          where: {
            id: storeRow.published_revision_id,
            store_id: storeRow.id,
          },
          select: {
            id: true,
            revision: true,
            source_draft_revision: true,
          },
        })
      : null,
  ]);

  if (storeRow.status === "PUBLISHED" && !publishedRevision) {
    throw storeNotFound(storeRow.slug);
  }

  return {
    id: storeRow.id,
    slug: storeRow.slug,
    name: storeRow.name,
    description: storeRow.description,
    logo_url: storeRow.logo_url,
    owner_id: storeRow.owner_id,
    status: storeRow.status,
    catalog_mode: catalog.catalog_mode,
    draft_revision: storeRow.draft_revision,
    published_at: storeRow.published_at,
    last_published_at: storeRow.last_published_at,
    created_at: storeRow.created_at,
    updated_at: storeRow.updated_at,
    presentation: resolveDraftPresentation({ slug: storeRow.slug }),
    storefront_source: "DRAFT",
    published_revision: publishedRevision,
    catalog_snapshot:
      catalog.catalog_mode === "UNDECIDED"
        ? null
        : {
            ...catalog,
            catalog_mode: catalog.catalog_mode,
          },
    featured_games_snapshot: featuredGames,
  };
}

/**
 * Resolve an Outlet for storefront reads without leaking draft existence.
 * Drafts require both an explicit preview flag and resource-scoped update
 * permission; every other caller receives the same 404 as an unknown slug.
 */
async function findOneForStorefront(
  slug: string,
  {
    preview,
    user,
  }: {
    preview: boolean;
    user: Partial<User>;
  },
) {
  const foundStore = await prisma.store.findUnique({ where: { slug } });

  if (!foundStore) {
    throw storeNotFound(slug);
  }

  if (preview) {
    const members = await prisma.storeMember.findMany({
      where: { store_id: foundStore.id },
    });
    if (!authorization.can(user, "update:store", { ...foundStore, members })) {
      throw storeNotFound(slug);
    }

    return projectDraftStore(foundStore);
  }

  return findOnePublishedBySlug(slug);
}

async function getStorefrontCurationWhereClause(
  storefront: StorefrontStore,
): Promise<Prisma.GameWhereInput> {
  if (storefront.storefront_source === "DRAFT") {
    return getCurationWhereClause(storefront.id);
  }
  if (!storefront.catalog_snapshot) return { id: { in: [] } };
  return getSnapshotCurationWhereClause(storefront.catalog_snapshot);
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

async function update(
  id: string,
  updateData: z.infer<typeof storeUpdateSchema>,
) {
  const existingStore = await prisma.store.findUnique({
    where: {
      id,
    },
  });

  if (!existingStore) {
    throw new NotFoundError({
      message: "Store not found.",
      action: "Check the store ID and try again.",
    });
  }

  const result = storeUpdateSchema.safeParse(updateData);

  if (!result.success) {
    throw new ValidationError({
      message: "One or more fields are invalid",
      action: "Check the fields and try again",
      context: result.error.issues,
    });
  }

  return await prisma.store.update({
    where: {
      id,
    },
    // Slugs are immutable after creation. Renaming changes display identity,
    // never the durable URL or attribution key.
    data: {
      ...result.data,
      draft_revision: { increment: 1 },
    },
  });
}

async function getPublicationState(
  storeId: string,
): Promise<StorePublicationView> {
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) {
    throw new NotFoundError({
      message: "Store not found.",
      action: "Check the store ID and try again.",
    });
  }

  return publicationView(
    store,
    await getStorePublicationReadiness(store.id),
    prisma,
  );
}

async function publicationView(
  storeRow: Store,
  readiness: StorePublicationReadinessV2,
  client: Pick<Prisma.TransactionClient, "storeRevision">,
): Promise<StorePublicationView> {
  const revision = storeRow.published_revision_id
    ? await client.storeRevision.findFirst({
        where: {
          id: storeRow.published_revision_id,
          store_id: storeRow.id,
        },
        select: {
          id: true,
          revision: true,
          source_draft_revision: true,
        },
      })
    : null;

  return {
    status: storeRow.status,
    catalog_mode: storeRow.catalog_mode,
    draft_revision: storeRow.draft_revision,
    published_at: storeRow.published_at,
    last_published_at: storeRow.last_published_at,
    published_revision: revision,
    readiness,
  };
}

function publicationConflict({
  expectedDraftRevision,
  actualDraftRevision,
}: {
  expectedDraftRevision: number;
  actualDraftRevision: number;
}) {
  return new ConflictError({
    message: "The Outlet draft changed before the lifecycle action completed.",
    action: "Refresh the Outlet, review the latest draft, and try again.",
    context: {
      expected_draft_revision: expectedDraftRevision,
      actual_draft_revision: actualDraftRevision,
    },
  });
}

async function changePublication(
  storeId: string,
  actorUserId: string,
  action: StorePublicationAction,
  expectedDraftRevision: number,
): Promise<StorePublicationView> {
  try {
    return await prisma.$transaction(
      async (transaction) => {
        // Publication is a per-Outlet state transition. Lock the Store row so
        // two requests using the same optimistic revision cannot both derive
        // and insert the same append-only revision number.
        await transaction.$queryRaw(
          Prisma.sql`SELECT "id" FROM "stores" WHERE "id" = ${storeId} FOR UPDATE`,
        );
        const existingStore = await transaction.store.findUnique({
          where: { id: storeId },
        });
        if (!existingStore) {
          throw new NotFoundError({
            message: "Store not found.",
            action: "Check the store ID and try again.",
          });
        }

        if (existingStore.draft_revision !== expectedDraftRevision) {
          throw publicationConflict({
            expectedDraftRevision,
            actualDraftRevision: existingStore.draft_revision,
          });
        }

        if (action === "unpublish" && existingStore.status !== "PUBLISHED") {
          throw new ConflictError({
            message: "The Outlet is already unpublished.",
            action:
              "Refresh the Outlet before sending another lifecycle action.",
            context: {
              expected_draft_revision: expectedDraftRevision,
              actual_draft_revision: existingStore.draft_revision,
              actual_status: existingStore.status,
            },
          });
        }

        if (
          action === "publish" &&
          existingStore.status === "PUBLISHED" &&
          existingStore.published_revision_id
        ) {
          const liveRevision = await transaction.storeRevision.findFirst({
            where: {
              id: existingStore.published_revision_id,
              store_id: existingStore.id,
            },
            select: { source_draft_revision: true },
          });
          if (liveRevision?.source_draft_revision === expectedDraftRevision) {
            throw new ConflictError({
              message: "The current draft is already the live publication.",
              action: "Edit the Outlet before publishing changes again.",
              context: {
                expected_draft_revision: expectedDraftRevision,
                actual_draft_revision: existingStore.draft_revision,
                published_source_draft_revision:
                  liveRevision.source_draft_revision,
                actual_status: existingStore.status,
              },
            });
          }
        }

        const { readiness, draft } = await getReadyDraftSnapshot(
          storeId,
          transaction,
        );
        const now = new Date();
        let revisionId = existingStore.published_revision_id;

        if (action === "publish") {
          if (!readiness.ready || !draft) {
            throw new ValidationError({
              message: "The Outlet is not ready to publish.",
              action: "Resolve every readiness blocker and try again.",
              context: { readiness },
            });
          }
          const revision = await createStoreRevision({
            draft,
            actorUserId,
            client: transaction,
          });
          revisionId = revision.id;

          const changed = await transaction.store.updateMany({
            where: {
              id: storeId,
              draft_revision: expectedDraftRevision,
              status: existingStore.status,
              published_revision_id: existingStore.published_revision_id,
            },
            data: {
              status: "PUBLISHED",
              published_revision_id: revision.id,
              last_published_revision_id: revision.id,
              published_at: now,
              last_published_at: now,
            },
          });
          if (changed.count !== 1) {
            throw publicationConflict({
              expectedDraftRevision,
              actualDraftRevision: existingStore.draft_revision,
            });
          }
        } else {
          const changed = await transaction.store.updateMany({
            where: {
              id: storeId,
              draft_revision: expectedDraftRevision,
              status: "PUBLISHED",
              published_revision_id: existingStore.published_revision_id,
            },
            data: {
              status: "DRAFT",
              published_revision_id: null,
              published_at: null,
            },
          });
          if (changed.count !== 1) {
            throw publicationConflict({
              expectedDraftRevision,
              actualDraftRevision: existingStore.draft_revision,
            });
          }
        }

        await transaction.storeLifecycleEvent.create({
          data: {
            store_id: storeId,
            store_revision_id: revisionId,
            draft_revision: expectedDraftRevision,
            actor_user_id: actorUserId,
            action: action === "publish" ? "PUBLISH" : "UNPUBLISH",
            from_status: existingStore.status,
            to_status: action === "publish" ? "PUBLISHED" : "DRAFT",
          },
        });

        const updatedStore = await transaction.store.findUnique({
          where: { id: storeId },
        });
        if (!updatedStore) {
          throw new NotFoundError({
            message: "Store not found.",
            action: "Check the store ID and try again.",
          });
        }

        return publicationView(updatedStore, readiness, transaction);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    // Errors can cross the Next.js/Prisma bundle boundary in development,
    // where `instanceof PrismaClientKnownRequestError` is not reliable even
    // though the stable Prisma code and metadata are preserved.
    const prismaError =
      typeof error === "object" && error !== null && "code" in error
        ? (error as {
            code?: unknown;
            message?: unknown;
            meta?: { code?: unknown; target?: unknown };
          })
        : null;
    const prismaCode =
      typeof prismaError?.code === "string" ? prismaError.code : null;
    const uniqueTarget = JSON.stringify(prismaError?.meta?.target ?? []);
    const databaseCode =
      typeof prismaError?.meta?.code === "string"
        ? prismaError.meta.code
        : null;
    const prismaMessage =
      typeof prismaError?.message === "string" ? prismaError.message : "";
    if (
      prismaCode === "P2034" ||
      databaseCode === "40001" ||
      prismaMessage.includes("could not serialize access") ||
      (prismaCode === "P2002" &&
        uniqueTarget.includes("store_id") &&
        uniqueTarget.includes("revision"))
    ) {
      const latest = await prisma.store.findUnique({
        where: { id: storeId },
        select: { draft_revision: true },
      });
      throw publicationConflict({
        expectedDraftRevision,
        actualDraftRevision: latest?.draft_revision ?? expectedDraftRevision,
      });
    }
    throw error;
  }
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
  findAllPublishedPaginated,
  findAllForUser,
  findAllForSitemap,
  findOneBySlug,
  findOnePublishedBySlug,
  findOneForStorefront,
  getStorefrontCurationWhereClause,
  findOneBySlugWithMembers,
  update,
  getPublicationReadiness: getStorePublicationReadiness,
  getPublicationState,
  changePublication,
  addMember,
  updateMemberPermissions,
  removeMember,
  listMembersWithUsernames,
};

export default store;
