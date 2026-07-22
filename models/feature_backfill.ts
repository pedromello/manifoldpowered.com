import { prisma } from "infra/database";
import authorization from "models/authorization";
import userModel from "models/user";
import { MEMBER_PERMISSIONS as STUDIO_MEMBER_PERMISSIONS } from "models/studio";
import { MEMBER_PERMISSIONS as STORE_MEMBER_PERMISSIONS } from "models/store";

interface PassResult {
  scanned: number;
  updated: number;
  skipped_ineligible: number;
}

interface BackfillReport {
  baseline: PassResult;
  studio_owners: PassResult;
  studio_members: PassResult;
  store_owners: PassResult;
  store_members: PassResult;
  total_unique_users_updated: number;
}

// userId -> that user's current features, kept in sync with every write made
// during a single reconcileAll() run so later passes never diff against a
// stale snapshot (several ACTIVATED_USER_FEATURES entries overlap with
// MEMBER_PERMISSIONS, e.g. update:studio/update:store, so a later pass must
// see an earlier pass's grant or it'll issue a redundant write).
type EligibleUsers = Map<string, string[]>;

// "update:user" sits in ACTIVATED_USER_FEATURES/ADMIN_FEATURES but not in
// unactivated (["read:activation_token"]), ANONYMOUS_USER_FEATURES, or
// DISABLED_USER_FEATURES — so it's a safe marker for "activated, not
// disabled." Every pass below is gated through this same map so a disabled
// studio/store owner never gets their revoked access silently restored.
async function loadEligibleUsers(): Promise<EligibleUsers> {
  const users = await prisma.user.findMany({
    where: { features: { has: "update:user" } },
    select: { id: true, features: true },
  });

  return new Map(users.map((user) => [user.id, user.features]));
}

function newPassResult(): PassResult {
  return { scanned: 0, updated: 0, skipped_ineligible: 0 };
}

async function applyIfMissing(
  userId: string,
  eligibleUsers: EligibleUsers,
  requiredFeatures: string[],
  result: PassResult,
  touchedIds: Set<string>,
) {
  result.scanned++;

  const currentFeatures = eligibleUsers.get(userId);
  if (!currentFeatures) {
    result.skipped_ineligible++;
    return;
  }

  const missing = requiredFeatures.filter(
    (feature) => !currentFeatures.includes(feature),
  );

  if (missing.length === 0) {
    return;
  }

  const updatedUser = await userModel.addFeatures(userId, missing);
  eligibleUsers.set(userId, updatedUser.features);
  result.updated++;
  touchedIds.add(userId);
}

async function reconcileBaseline(
  eligibleUsers: EligibleUsers,
  touchedIds: Set<string>,
): Promise<PassResult> {
  const result = newPassResult();

  for (const userId of eligibleUsers.keys()) {
    await applyIfMissing(
      userId,
      eligibleUsers,
      authorization.ACTIVATED_USER_FEATURES,
      result,
      touchedIds,
    );
  }

  return result;
}

async function reconcileStudioOwners(
  eligibleUsers: EligibleUsers,
  touchedIds: Set<string>,
): Promise<PassResult> {
  const result = newPassResult();
  const studios = await prisma.studio.findMany({
    select: { owner_id: true },
  });
  const ownerIds = new Set(studios.map((studio) => studio.owner_id));

  for (const ownerId of ownerIds) {
    await applyIfMissing(
      ownerId,
      eligibleUsers,
      STUDIO_MEMBER_PERMISSIONS,
      result,
      touchedIds,
    );
  }

  return result;
}

async function reconcileStudioMembers(
  eligibleUsers: EligibleUsers,
  touchedIds: Set<string>,
): Promise<PassResult> {
  const result = newPassResult();
  const members = await prisma.studioMember.findMany({
    select: { user_id: true, permissions: true },
  });

  const permissionsByUser = groupPermissionsByUser(members);

  for (const [userId, permissions] of permissionsByUser) {
    await applyIfMissing(
      userId,
      eligibleUsers,
      [...permissions],
      result,
      touchedIds,
    );
  }

  return result;
}

async function reconcileStoreOwners(
  eligibleUsers: EligibleUsers,
  touchedIds: Set<string>,
): Promise<PassResult> {
  const result = newPassResult();
  const stores = await prisma.store.findMany({
    select: { owner_id: true },
  });
  const ownerIds = new Set(stores.map((store) => store.owner_id));

  for (const ownerId of ownerIds) {
    await applyIfMissing(
      ownerId,
      eligibleUsers,
      STORE_MEMBER_PERMISSIONS,
      result,
      touchedIds,
    );
  }

  return result;
}

async function reconcileStoreMembers(
  eligibleUsers: EligibleUsers,
  touchedIds: Set<string>,
): Promise<PassResult> {
  const result = newPassResult();
  const members = await prisma.storeMember.findMany({
    select: { user_id: true, permissions: true },
  });

  const permissionsByUser = groupPermissionsByUser(members);

  for (const [userId, permissions] of permissionsByUser) {
    await applyIfMissing(
      userId,
      eligibleUsers,
      [...permissions],
      result,
      touchedIds,
    );
  }

  return result;
}

// A user can be a member of more than one studio/store, each granting a
// different permissions subset — union them so a single applyIfMissing call
// per user covers every permission they've been granted anywhere.
function groupPermissionsByUser(
  members: { user_id: string; permissions: string[] }[],
): Map<string, Set<string>> {
  const permissionsByUser = new Map<string, Set<string>>();

  for (const member of members) {
    const existing = permissionsByUser.get(member.user_id) ?? new Set<string>();
    member.permissions.forEach((permission) => existing.add(permission));
    permissionsByUser.set(member.user_id, existing);
  }

  return permissionsByUser;
}

// Reconciles every activated, non-disabled user's global features against
// the *current* code-level definitions of ACTIVATED_USER_FEATURES and the
// studio/store MEMBER_PERMISSIONS lists. Safe to re-run at any time (a no-op
// wherever nothing is missing) — intended to be re-run after every future
// change to those definitions, from the CLI script, a CI job, or the
// backoffice "Reconcile feature grants" button, with no code changes needed
// here.
async function reconcileAll(): Promise<BackfillReport> {
  const eligibleUsers = await loadEligibleUsers();
  const touchedIds = new Set<string>();

  const baseline = await reconcileBaseline(eligibleUsers, touchedIds);
  const studio_owners = await reconcileStudioOwners(eligibleUsers, touchedIds);
  const studio_members = await reconcileStudioMembers(
    eligibleUsers,
    touchedIds,
  );
  const store_owners = await reconcileStoreOwners(eligibleUsers, touchedIds);
  const store_members = await reconcileStoreMembers(eligibleUsers, touchedIds);

  return {
    baseline,
    studio_owners,
    studio_members,
    store_owners,
    store_members,
    total_unique_users_updated: touchedIds.size,
  };
}

const featureBackfill = {
  reconcileAll,
};

export default featureBackfill;
