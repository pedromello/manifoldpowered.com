export type BridgeState = "fresh" | "legacy_s3" | "canonical";

export type FixtureStoreStatus = "DRAFT" | "PUBLISHED";

export interface BridgeStoreFixture {
  id: string;
  ownerId: string;
  updatedAt: string;
  legacyStatus?: FixtureStoreStatus;
  canonicalStatus?: FixtureStoreStatus;
  publishedRevisionId: string | null;
  publishedAt: string | null;
  lastPublishedRevisionId?: string | null;
  lastPublishedAt?: string | null;
}

export interface BridgeRevisionFixture {
  id: string;
  storeId: string;
  revision: number;
  actorUserId: string;
  createdAt: string;
}

export interface BridgeSaleFixture {
  id: string;
  storeId: string | null;
  storeRevisionId: string | null;
  createdAt: string;
}

export interface BridgeUserFixture {
  id: string;
  features: string[];
  updatedAt: string;
}

export interface StoreLifecycleBridgeFixture {
  state: BridgeState;
  stores: BridgeStoreFixture[];
  revisions: BridgeRevisionFixture[];
  sales: BridgeSaleFixture[];
  users: BridgeUserFixture[];
}

export interface CanonicalStoreLifecycleProjection {
  id: string;
  status: FixtureStoreStatus;
  publishedRevisionId: string | null;
  publishedAt: string | null;
  lastPublishedRevisionId: string | null;
  lastPublishedAt: string | null;
}

const users: BridgeUserFixture[] = [
  {
    id: "owner-eligible",
    features: ["read:user", "update:user", "update:store"],
    updatedAt: "2026-07-01T10:00:00.000Z",
  },
  {
    id: "owner-disabled",
    features: [],
    updatedAt: "2026-07-01T11:00:00.000Z",
  },
  {
    id: "active-non-owner",
    features: ["read:user", "update:user"],
    updatedAt: "2026-07-01T12:00:00.000Z",
  },
];

export const storeLifecycleBridgeFixtures: Record<
  BridgeState,
  StoreLifecycleBridgeFixture
> = {
  fresh: {
    state: "fresh",
    stores: [
      {
        id: "fresh-store",
        ownerId: "owner-eligible",
        updatedAt: "2026-08-01T00:00:00.000Z",
        publishedRevisionId: null,
        publishedAt: null,
      },
    ],
    revisions: [],
    sales: [
      {
        id: "fresh-sale-before-snapshot",
        storeId: "fresh-store",
        storeRevisionId: null,
        createdAt: "2026-07-15T00:00:00.000Z",
      },
    ],
    users,
  },
  legacy_s3: {
    state: "legacy_s3",
    stores: [
      {
        id: "legacy-published",
        ownerId: "owner-eligible",
        updatedAt: "2026-08-20T00:00:00.000Z",
        legacyStatus: "PUBLISHED",
        publishedRevisionId: "s3-published-r2",
        publishedAt: "2026-08-10T00:00:00.000Z",
      },
      {
        id: "legacy-draft-never",
        ownerId: "owner-disabled",
        updatedAt: "2026-08-20T01:00:00.000Z",
        legacyStatus: "DRAFT",
        publishedRevisionId: null,
        publishedAt: null,
      },
      {
        id: "legacy-unpublished",
        ownerId: "owner-eligible",
        updatedAt: "2026-08-20T02:00:00.000Z",
        legacyStatus: "DRAFT",
        // The S3 unpublish path retained its former current pair.
        publishedRevisionId: "s3-unpublished-r1",
        publishedAt: "2026-08-03T00:00:00.000Z",
      },
    ],
    revisions: [
      {
        id: "s3-published-r1",
        storeId: "legacy-published",
        revision: 1,
        actorUserId: "owner-eligible",
        createdAt: "2026-08-01T00:00:00.000Z",
      },
      {
        id: "s3-published-r2",
        storeId: "legacy-published",
        revision: 2,
        actorUserId: "owner-eligible",
        createdAt: "2026-08-10T00:00:00.000Z",
      },
      {
        id: "s3-unpublished-r1",
        storeId: "legacy-unpublished",
        revision: 1,
        actorUserId: "owner-eligible",
        createdAt: "2026-08-03T00:00:00.000Z",
      },
    ],
    sales: [
      {
        id: "legacy-sale-before",
        storeId: "legacy-published",
        storeRevisionId: null,
        createdAt: "2026-07-20T00:00:00.000Z",
      },
      {
        id: "legacy-sale-between",
        storeId: "legacy-published",
        storeRevisionId: null,
        createdAt: "2026-08-05T00:00:00.000Z",
      },
      {
        id: "legacy-sale-after",
        storeId: "legacy-published",
        storeRevisionId: null,
        createdAt: "2026-08-12T00:00:00.000Z",
      },
      {
        id: "legacy-sale-existing-pointer",
        storeId: "legacy-published",
        // Deliberately older than the temporal choice: the bridge must not
        // reinterpret a non-null historical attribution.
        storeRevisionId: "s3-published-r1",
        createdAt: "2026-08-12T01:00:00.000Z",
      },
      {
        id: "legacy-global-sale",
        storeId: null,
        storeRevisionId: null,
        createdAt: "2026-08-12T02:00:00.000Z",
      },
    ],
    users,
  },
  canonical: {
    state: "canonical",
    stores: [
      {
        id: "canonical-published",
        ownerId: "owner-eligible",
        updatedAt: "2026-08-20T03:00:00.000Z",
        canonicalStatus: "PUBLISHED",
        publishedRevisionId: "canonical-r2",
        publishedAt: "2026-08-11T00:00:00.000Z",
        lastPublishedRevisionId: "canonical-r2",
        lastPublishedAt: "2026-08-11T00:00:00.000Z",
      },
      {
        id: "canonical-draft",
        ownerId: "owner-disabled",
        updatedAt: "2026-08-20T04:00:00.000Z",
        canonicalStatus: "DRAFT",
        publishedRevisionId: null,
        publishedAt: null,
        lastPublishedRevisionId: null,
        lastPublishedAt: null,
      },
    ],
    revisions: [
      {
        id: "canonical-r1",
        storeId: "canonical-published",
        revision: 1,
        actorUserId: "owner-eligible",
        createdAt: "2026-08-02T00:00:00.000Z",
      },
      {
        id: "canonical-r2",
        storeId: "canonical-published",
        revision: 2,
        actorUserId: "owner-eligible",
        createdAt: "2026-08-11T00:00:00.000Z",
      },
    ],
    sales: [
      {
        id: "canonical-sale-existing-pointer",
        storeId: "canonical-published",
        storeRevisionId: "canonical-r1",
        createdAt: "2026-08-15T00:00:00.000Z",
      },
    ],
    users,
  },
};

function compareRevisionOrder(
  left: BridgeRevisionFixture,
  right: BridgeRevisionFixture,
) {
  const timeDifference =
    Date.parse(left.createdAt) - Date.parse(right.createdAt);
  if (timeDifference !== 0) return timeDifference;
  if (left.revision !== right.revision) return left.revision - right.revision;
  return left.id.localeCompare(right.id);
}

export function temporalRevisionForSale(
  sale: BridgeSaleFixture,
  revisions: BridgeRevisionFixture[],
) {
  if (sale.storeId === null) return null;

  const sameStore = revisions
    .filter((revision) => revision.storeId === sale.storeId)
    .sort(compareRevisionOrder);
  if (sameStore.length === 0) {
    throw new Error(`Sale ${sale.id} has no same-Store revision`);
  }

  const atOrBeforeSale = sameStore.filter(
    (revision) => Date.parse(revision.createdAt) <= Date.parse(sale.createdAt),
  );
  return atOrBeforeSale.at(-1) ?? sameStore[0];
}

export function backfillNullSalePointers(
  sales: BridgeSaleFixture[],
  revisions: BridgeRevisionFixture[],
) {
  return sales.map((sale) => {
    if (sale.storeRevisionId !== null) {
      const existingRevision = revisions.find(
        (revision) => revision.id === sale.storeRevisionId,
      );
      if (!existingRevision || existingRevision.storeId !== sale.storeId) {
        throw new Error(`Sale ${sale.id} has an invalid existing pointer`);
      }
      return { ...sale };
    }

    if (sale.storeId === null) return { ...sale };
    return {
      ...sale,
      storeRevisionId: temporalRevisionForSale(sale, revisions)?.id ?? null,
    };
  });
}

export function grantPublishToEligibleOwners(
  stores: BridgeStoreFixture[],
  fixtureUsers: BridgeUserFixture[],
) {
  const ownerIds = new Set(stores.map((store) => store.ownerId));
  return fixtureUsers.map((user) => {
    const eligible =
      ownerIds.has(user.id) && user.features.includes("update:user");
    if (!eligible || user.features.includes("publish:store")) {
      return { ...user, features: [...user.features] };
    }
    return {
      ...user,
      features: [...user.features, "publish:store"],
    };
  });
}

export function revisionIdentity(revision: BridgeRevisionFixture) {
  return {
    id: revision.id,
    storeId: revision.storeId,
    createdAt: revision.createdAt,
  };
}

export function reconcileLegacyStoreLifecycle(
  store: BridgeStoreFixture,
): CanonicalStoreLifecycleProjection {
  if (store.legacyStatus === undefined) {
    throw new Error(`Store ${store.id} is not an old-S3 Store`);
  }
  if ((store.publishedRevisionId === null) !== (store.publishedAt === null)) {
    throw new Error(
      `Store ${store.id} has an inconsistent legacy pointer pair`,
    );
  }
  if (store.legacyStatus === "PUBLISHED") {
    if (store.publishedRevisionId === null || store.publishedAt === null) {
      throw new Error(`Published Store ${store.id} has no current pointer`);
    }
    return {
      id: store.id,
      status: "PUBLISHED",
      publishedRevisionId: store.publishedRevisionId,
      publishedAt: store.publishedAt,
      lastPublishedRevisionId: store.publishedRevisionId,
      lastPublishedAt: store.publishedAt,
    };
  }

  return {
    id: store.id,
    status: "DRAFT",
    publishedRevisionId: null,
    publishedAt: null,
    lastPublishedRevisionId: store.publishedRevisionId,
    lastPublishedAt: store.publishedAt,
  };
}
