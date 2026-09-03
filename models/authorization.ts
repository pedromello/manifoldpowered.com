import {
  Game,
  Session,
  User,
  UserActivationToken,
  Review,
  Store,
  StoreMember,
  StoreTagFilter,
  StoreGameOverride,
  Sale,
  Studio,
  StudioMember,
  Currency,
  ExchangeRate,
  SupplierTerms,
  PayoutAccount,
  GameArtifact,
  GameRelease,
  GameReleasePatch,
  GameOwnershipClaim,
} from "generated/prisma/client";
import { createHash } from "node:crypto";
import { InternalServerError } from "infra/errors";
import {
  downloadAuthorizationSchema,
  installManifestSchema,
  patchDownloadAuthorizationsSchema,
  releasePatchSchema,
  releaseSummarySchema,
  updatePlanSchema,
} from "contracts/desktop/v1";

type SaleWithGame = Sale & {
  game_title?: string;
  game_slug?: string | null;
  store_name?: string | null;
  store_slug?: string | null;
  store_logo_url?: string | null;
};

// A buyer, as an outlet is allowed to know them: stable within that outlet, and
// different at every other one.
//
// Salting with the store id is the point. Two outlets comparing their exports
// cannot tell they served the same person, so the identifier supports repeat-
// customer counting without becoming a cross-outlet consumer profile. It needs
// no server secret because the input is a UUID — there is no id space small
// enough to enumerate against the hash.
function buyerRefFor(userId: string, storeId: string | null): string {
  return createHash("sha256")
    .update(`${userId}:${storeId ?? ""}`)
    .digest("hex")
    .slice(0, 16);
}

type StoreWithMembers = Store & { members: StoreMember[] };
type StudioWithMembers = Studio & { members: StudioMember[] };
type GameWithStudio = Game & { studio: StudioWithMembers | null };

const AVAILABLE_FEATURES = [
  // User
  "create:user",
  "read:user",
  "read:user:self",
  "update:user",
  "update:user:others",

  // Session
  "create:session",
  "read:session",

  // OTP
  "create:otp",

  // Activation Token
  "read:activation_token",

  // Status
  "read:status",
  "read:status:all",

  // Games
  "create:game",
  "create:game:any",
  "import:steam_game",
  "read:public_game",
  "update:game",
  "update:game:any",
  // Per-currency price overrides. Resolved through the game's studio exactly
  // like update:game, since anyone who can already change a game's USD price
  // has no reason to be blocked from its price in another currency.
  "read:game_price",
  "update:game_price",
  "create:game_ownership_claim",
  "read:game_ownership_claim",

  // Wishlists
  "create:wishlist",
  "read:wishlist",
  "delete:wishlist",

  // Outlet follows
  "create:store_follow",
  "read:store_follow",
  "delete:store_follow",
  "read:store_follow_status",

  // Reviews
  "create:review",
  "read:review",
  "delete:review",

  // Game Files
  "create:game_file",
  "read:game_file",
  "delete:game_file",

  // Immutable release artifacts
  "create:game_release",
  "create:game_artifact",

  // Library
  "read:library",
  "create:library",

  // Stores
  "create:store",
  "read:public_store",
  "update:store",
  "update:store:any",
  "manage:store_featured_games",
  "manage:store_members",
  "manage:store_members:any",
  "read:store_tag_filter",
  "read:store_game_override",
  // A sale as an outlet may see it: no buyer identity, only a per-outlet
  // pseudonym. See the filterOutput branch and business-description.md.
  "read:store_sale",
  // A buyer's own purchase history — the only surface that shows someone what
  // they actually paid.
  "read:own_sale",
  // An outlet's own earnings. Scoped to the outlet rather than to its owner,
  // because the outlet is the payee — see the comment on the statement endpoint.
  "read:store_statement",
  "read:store_statement:any",
  // Where an outlet's money goes. Read has an admin escape hatch for support;
  // the write side deliberately does not — see the note above the can() branch.
  "read:payout_account",
  "read:payout_account:any",
  "manage:payout_account",

  // Studios
  "create:studio",
  "read:public_studio",
  "update:studio",
  "update:studio:any",
  "manage:studio_members",
  "manage:studio_members:any",
  // Sales of a studio's own games. Studios are suppliers rather than
  // affiliates, but the buyer is withheld from them just the same.
  "read:studio_sale",
  "read:studio_sale:any",

  // Backoffice (admin)
  "read:user:any",
  "update:user:status:any",
  "update:user:features:any",
  "read:studio:any",
  "read:store:any",
  "read:game:any",
  "update:game:status:any",
  "read:dashboard:any",
  "read:audit_log:any",
  // The platform's own income statement, across every payee at once. Admin-only
  // with no non-:any counterpart, because there is no narrower version of it:
  // the question it answers is not "what am I owed" but "what did the whole
  // book do", which nobody outside the platform has a scoped claim to.
  "read:platform_ledger:any",
  "read:game_ownership_claim:any",
  "decide:game_ownership_claim:any",

  // Pricing (admin)
  "read:currency:any",
  "create:currency:any",
  "update:currency:any",
  "read:exchange_rate:any",
  "create:exchange_rate:any",

  // Commercial terms (admin). Admin-only by design: an outlet influencing its
  // own commission is the same category of problem as one setting its own
  // prices (docs/legal/phase-0-checklist.md).
  "update:store_commission:any",
  "read:supplier_terms:any",
  "update:supplier_terms:any",
  // Whether an outlet has cleared verification and may be paid. Admin-only and
  // audit-logged, on the same footing as update:user:status:any — deciding
  // someone is payable is the platform's call, in a way that deciding where
  // their money goes is not.
  "update:payout_account:status:any",
];

// The feature set granted to every user once they activate their account
// (see models/activation.ts). Kept here, rather than inline in activation.ts,
// so it can be reused as the base of the admin feature bundle below without a
// circular import between the two modules.
const ACTIVATED_USER_FEATURES = [
  "create:session",
  "read:session",
  "update:user",
  "read:public_game",
  "import:steam_game",
  "create:wishlist",
  "read:wishlist",
  "delete:wishlist",
  "create:store_follow",
  "read:store_follow",
  "delete:store_follow",
  "read:store_follow_status",
  "create:review",
  "read:review",
  "delete:review",
  "read:game_file",
  "read:library",
  "create:library",
  "create:store",
  "read:public_store",
  "update:store",
  "manage:store_members",
  "read:store_statement",
  "read:payout_account",
  "manage:payout_account",
  "read:own_sale",
  "create:studio",
  "read:public_studio",
  "update:studio",
  "manage:studio_members",
];

// Admin-only features layered on top of the activated-user set. Granted as a
// whole via the admin bootstrap script (scripts/create-admin.js) and the
// tests/orchestrator.js `createAdminUser` helper — there are no partial admin
// tiers today.
const ADMIN_ONLY_FEATURES = [
  "read:user:any",
  "update:user:status:any",
  "update:user:features:any",
  "read:studio:any",
  "read:store:any",
  "read:game:any",
  "update:game:status:any",
  "read:dashboard:any",
  "read:audit_log:any",
  "read:game_ownership_claim:any",
  "decide:game_ownership_claim:any",
  "read:currency:any",
  "create:currency:any",
  "update:currency:any",
  "read:exchange_rate:any",
  "create:exchange_rate:any",
  "update:store_commission:any",
  "read:supplier_terms:any",
  "update:supplier_terms:any",
  "read:store_statement:any",
  "read:studio_sale:any",
  "read:platform_ledger:any",
  "read:payout_account:any",
  "update:payout_account:status:any",
];

const ADMIN_FEATURES = [...ACTIVATED_USER_FEATURES, ...ADMIN_ONLY_FEATURES];

// The feature set granted to a logged-out visitor (see
// infra/controller.ts's injectAnonymousUser, which imports this instead of
// hardcoding it, same reasoning as ACTIVATED_USER_FEATURES above).
const ANONYMOUS_USER_FEATURES = [
  "read:activation_token",
  "create:session",
  "create:otp",
  "create:user",
  "read:public_game",
  "read:wishlist",
  "read:store_follow_status",
  "read:review",
  "read:public_store",
  "read:public_studio",
];

// What a disabled user is left with: the same public-read access as an
// anonymous visitor, minus the session/account-bootstrap features
// (create:session, create:otp, create:user, read:activation_token) — so
// they can't log back in or sign up again. There is no separate "disabled"
// flag on User; disabling a user just overwrites their `features` with
// this list, which the existing authorization.can()/canRequest() check
// already enforces on every request.
const SESSION_BOOTSTRAP_FEATURES = [
  "create:session",
  "create:otp",
  "create:user",
  "read:activation_token",
];
const DISABLED_USER_FEATURES = ANONYMOUS_USER_FEATURES.filter(
  (feature) => !SESSION_BOOTSTRAP_FEATURES.includes(feature),
);

function can(user: Partial<User>, feature: string, resource?: unknown) {
  validateUser(user);
  validateFeature(feature);

  let authorized = false;

  if (user.features?.includes(feature)) {
    authorized = true;
  }

  if (feature === "update:user" && resource) {
    authorized = false;
    const userResource = resource as User;

    if (user.id === userResource.id || can(user, "update:user:others")) {
      authorized = true;
    }
  }

  if (
    (feature === "update:game" ||
      feature === "create:game_file" ||
      feature === "delete:game_file" ||
      feature === "create:game_release" ||
      feature === "create:game_artifact" ||
      feature === "read:game_price" ||
      feature === "update:game_price") &&
    resource
  ) {
    authorized = false;
    const gameResource = resource as GameWithStudio;
    const studioResource = gameResource.studio;

    const isOwner = Boolean(
      studioResource && user.id === studioResource.owner_id,
    );
    const isPermittedMember = studioResource?.members.some(
      (member) =>
        member.user_id === user.id && member.permissions.includes(feature),
    );

    if (isOwner || isPermittedMember || can(user, "update:game:any")) {
      authorized = true;
    }
  }

  if (feature === "create:game" && resource) {
    authorized = false;
    const studioResource = resource as StudioWithMembers;

    const isOwner = user.id === studioResource.owner_id;
    const isPermittedMember = studioResource.members?.some(
      (member) =>
        member.user_id === user.id &&
        member.permissions.includes("create:game"),
    );

    if (isOwner || isPermittedMember || can(user, "create:game:any")) {
      authorized = true;
    }
  }

  if (
    (feature === "create:game_ownership_claim" ||
      feature === "read:game_ownership_claim") &&
    resource
  ) {
    authorized = false;
    const studioResource = resource as StudioWithMembers;
    const isOwner = user.id === studioResource.owner_id;
    const isPermittedMember = studioResource.members?.some(
      (member) =>
        member.user_id === user.id && member.permissions.includes(feature),
    );

    if (isOwner || isPermittedMember) authorized = true;
  }

  if (
    (feature === "update:store" ||
      feature === "manage:store_featured_games" ||
      feature === "manage:store_members" ||
      feature === "read:store_statement") &&
    resource
  ) {
    authorized = false;
    const storeResource = resource as StoreWithMembers;
    // A map rather than a ternary: with three features a nested conditional
    // stops being readable, and a fourth would be added to the wrong branch.
    const anyFeature = {
      "update:store": "update:store:any",
      "manage:store_members": "manage:store_members:any",
      "read:store_statement": "read:store_statement:any",
    }[feature] as string | undefined;

    const isOwner = user.id === storeResource.owner_id;
    const isPermittedMember = storeResource.members?.some(
      (member) =>
        member.user_id === user.id && member.permissions.includes(feature),
    );

    if (
      isOwner ||
      isPermittedMember ||
      (anyFeature !== undefined && can(user, anyFeature))
    ) {
      authorized = true;
    }
  }

  // Kept out of the store branch above despite resolving ownership identically,
  // because it is the one place where the :any escape hatch is not symmetric and
  // folding it into a shared map would hide that.
  //
  // read:payout_account:any exists so support can see which rail an outlet is
  // on. There is deliberately no manage:payout_account:any: an admin
  // redirecting an outlet's payout destination is the exact failure the
  // outlet-as-payee design exists to bound, and it is not something support ever
  // needs to do on someone's behalf. What an admin can do instead is decide the
  // outlet is verified — update:payout_account:status:any, which is a global
  // backoffice feature rather than a resource-scoped one, and audit-logged.
  if (
    (feature === "read:payout_account" ||
      feature === "manage:payout_account") &&
    resource
  ) {
    authorized = false;
    const storeResource = resource as StoreWithMembers;
    const anyFeature = {
      "read:payout_account": "read:payout_account:any",
    }[feature];

    const isOwner = user.id === storeResource.owner_id;
    const isPermittedMember = storeResource.members?.some(
      (member) =>
        member.user_id === user.id && member.permissions.includes(feature),
    );

    // The anyFeature guard is load-bearing: manage:payout_account has no entry
    // in the map above, and can(user, undefined) throws from validateFeature.
    if (isOwner || isPermittedMember || (anyFeature && can(user, anyFeature))) {
      authorized = true;
    }
  }

  // The one :any pair whose base feature is not universal. Every other escape
  // hatch guards a feature that sits in ACTIVATED_USER_FEATURES, so an admin
  // clears canRequest on the base and only needs :any once the resource is in
  // hand. read:studio_sale is granted on studio creation instead, so an admin
  // holds no studio features at all and canRequest — which always runs without
  // a resource — would refuse them before the branch below is ever reached.
  //
  // Deliberately not solved by adding read:studio_sale to ADMIN_ONLY_FEATURES:
  // models/feature_backfill treats "holds any admin-only feature" as "is an
  // admin", so a non-exclusive entry in that list would promote every studio
  // owner to full admin on the next reconcile.
  if (feature === "read:studio_sale" && !resource) {
    if (can(user, "read:studio_sale:any")) {
      authorized = true;
    }
  }

  if (
    (feature === "update:studio" ||
      feature === "manage:studio_members" ||
      feature === "read:studio_sale") &&
    resource
  ) {
    authorized = false;
    const studioResource = resource as StudioWithMembers;
    // A map rather than a ternary, matching the store branch: with three
    // features a nested conditional stops being readable, and read:studio_sale
    // would have silently resolved to the members escape hatch.
    const anyFeature = {
      "update:studio": "update:studio:any",
      "manage:studio_members": "manage:studio_members:any",
      "read:studio_sale": "read:studio_sale:any",
    }[feature] as string;

    const isOwner = user.id === studioResource.owner_id;
    const isPermittedMember = studioResource.members?.some(
      (member) =>
        member.user_id === user.id && member.permissions.includes(feature),
    );

    if (isOwner || isPermittedMember || can(user, anyFeature)) {
      authorized = true;
    }
  }

  return authorized;
}

function filterOutput(user: Partial<User>, feature: string, resource: unknown) {
  validateUser(user);
  validateFeature(feature);

  if (
    feature === "create:game_ownership_claim" ||
    feature === "read:game_ownership_claim" ||
    feature === "read:game_ownership_claim:any" ||
    feature === "decide:game_ownership_claim:any"
  ) {
    type ClaimOutput = GameOwnershipClaim & {
      game: {
        id: string;
        slug: string;
        title: string;
        status: string;
        studio_id: string | null;
      };
      studio: { id: string; slug: string; name: string };
      requested_by: { id: string; username: string };
      decided_by: { id: string; username: string } | null;
    };
    const claim = resource as ClaimOutput;
    return {
      id: claim.id,
      status: claim.status,
      game: claim.game,
      studio: claim.studio,
      requested_by: claim.requested_by,
      decided_by: claim.decided_by,
      terms: {
        version: claim.rights_attestation_version,
        locale: claim.rights_attestation_locale,
        text: claim.rights_attestation_text,
        accepted_at: claim.rights_attested_at,
      },
      decision: {
        reason: claim.decision_reason,
        decided_at: claim.decided_at,
      },
      created_at: claim.created_at,
      updated_at: claim.updated_at,
    };
  }

  if (feature === "read:user") {
    const userOutput = resource as User;
    return {
      id: userOutput.id,
      username: userOutput.username,
      features: userOutput.features,
      created_at: userOutput.created_at,
      updated_at: userOutput.updated_at,
    };
  }

  if (feature === "read:user:self") {
    const userOutput = resource as User;
    if (user.id === userOutput.id) {
      return {
        id: userOutput.id,
        username: userOutput.username,
        email: userOutput.email,
        features: userOutput.features,
        created_at: userOutput.created_at,
        updated_at: userOutput.updated_at,
      };
    }
  }

  if (feature === "read:user:any" || feature === "update:user:status:any") {
    const userOutput = resource as User;
    return {
      id: userOutput.id,
      username: userOutput.username,
      email: userOutput.email,
      features: userOutput.features,
      created_at: userOutput.created_at,
      updated_at: userOutput.updated_at,
    };
  }

  if (feature === "read:session") {
    const sessionOutput = resource as Session;
    if (user.id === sessionOutput.user_id) {
      return {
        id: sessionOutput.id,
        token: sessionOutput.token,
        user_id: sessionOutput.user_id,
        created_at: sessionOutput.created_at,
        updated_at: sessionOutput.updated_at,
        expires_at: sessionOutput.expires_at,
      };
    }
  }

  if (feature === "read:activation_token") {
    const activationOutput = resource as UserActivationToken;
    if (user.id === activationOutput.user_id) {
      return {
        id: activationOutput.id,
        user_id: activationOutput.user_id,
        used_at: activationOutput.used_at,
        created_at: activationOutput.created_at,
        updated_at: activationOutput.updated_at,
        expires_at: activationOutput.expires_at,
      };
    }
  }

  if (feature === "read:status") {
    interface StatusOutput {
      updated_at: string;
      dependencies: {
        database: {
          version: string;
          max_connections: number;
          open_connections: number;
        };
      };
    }

    const statusOutput = resource as StatusOutput;
    const output = {
      updated_at: statusOutput.updated_at,
      dependencies: {
        database: {
          max_connections: statusOutput.dependencies.database.max_connections,
          open_connections: statusOutput.dependencies.database.open_connections,
        },
      },
    };

    if (can(user, "read:status:all")) {
      output.dependencies.database["version"] =
        statusOutput.dependencies.database.version;
    }

    return output;
  }

  if (
    feature === "create:game" ||
    feature === "import:steam_game" ||
    feature === "read:public_game" ||
    feature === "update:game" ||
    feature === "read:game:any" ||
    feature === "update:game:status:any"
  ) {
    const gameOutput = resource as Game;
    const steamPage =
      gameOutput.social_links &&
      typeof gameOutput.social_links === "object" &&
      !Array.isArray(gameOutput.social_links) &&
      "steam_page" in gameOutput.social_links &&
      typeof gameOutput.social_links.steam_page === "string"
        ? gameOutput.social_links.steam_page
        : null;
    const purchaseMode =
      gameOutput.status === "ACTIVE"
        ? "PLATFORM"
        : steamPage
          ? "STEAM_ONLY"
          : "UNAVAILABLE";

    return {
      id: gameOutput.id,
      slug: gameOutput.slug,
      title: gameOutput.title,
      description: gameOutput.description,
      detailed_description: gameOutput.detailed_description,
      launch_date: gameOutput.launch_date,
      // Display-only catalogue entries deliberately expose no local price.
      price:
        gameOutput.status === "ONLY_DISPLAY"
          ? null
          : gameOutput.price.toFixed(2),
      developer_name: gameOutput.developer_name,
      publisher_name: gameOutput.publisher_name,
      tags: gameOutput.tags,
      meta_tags: gameOutput.meta_tags,
      media: gameOutput.media,
      social_links: gameOutput.social_links,
      requirements: gameOutput.requirements,
      studio_id: gameOutput.studio_id,
      publisher_id: gameOutput.publisher_id,
      steam_app_id: gameOutput.steam_app_id,
      status: gameOutput.status,
      positive_reviews: gameOutput.positive_reviews,
      negative_reviews: gameOutput.negative_reviews,
      review_score: gameOutput.review_score,
      base_price: gameOutput.base_price?.toFixed(2) ?? null,
      ownership_status: gameOutput.studio_id ? "CLAIMED" : "UNCLAIMED",
      purchase_mode: purchaseMode,
      external_offer:
        purchaseMode === "STEAM_ONLY" && steamPage
          ? {
              provider: "STEAM",
              amount: gameOutput.steam_price?.toFixed(2) ?? null,
              original_amount:
                gameOutput.steam_original_price?.toFixed(2) ?? null,
              discount_percent: gameOutput.steam_discount_percent,
              currency: gameOutput.steam_price_currency,
              url: steamPage,
              captured_at:
                gameOutput.steam_price_captured_at?.toISOString() ?? null,
            }
          : null,
      discount_label: gameOutput.discount_label,
      created_at: gameOutput.created_at,
      updated_at: gameOutput.updated_at,
    };
  }

  if (feature === "read:review") {
    const reviewOutput = resource as Review & { user: { username: string } };
    return {
      id: reviewOutput.id,
      message: reviewOutput.message,
      recommended: reviewOutput.recommended,
      created_at: reviewOutput.created_at,
      updated_at: reviewOutput.updated_at,
      user: {
        username: reviewOutput.user?.username,
      },
    };
  }

  if (feature === "read:game_file" || feature === "create:game_file") {
    interface GameFileOutput {
      id: string;
      game_id: string;
      display_name: string;
      platform: string;
      size_bytes: string | bigint;
      version: string;
      created_at: Date;
      updated_at: Date;
    }
    const fileOutput = resource as GameFileOutput;
    return {
      id: fileOutput.id,
      game_id: fileOutput.game_id,
      display_name: fileOutput.display_name,
      platform: fileOutput.platform,
      size_bytes: fileOutput.size_bytes.toString(),
      version: fileOutput.version,
      created_at: fileOutput.created_at,
      updated_at: fileOutput.updated_at,
    };
  }

  if (feature === "create:game_release") {
    const release = resource as GameRelease;
    return {
      id: release.id,
      game_id: release.game_id,
      version: release.version,
      release_number: release.release_number,
      status: release.status,
      release_notes: release.release_notes,
      published_at: release.published_at,
      created_at: release.created_at,
      updated_at: release.updated_at,
    };
  }

  if (feature === "create:game_artifact") {
    if (
      typeof resource === "object" &&
      resource !== null &&
      "source_release_id" in resource &&
      "patch_size_bytes" in resource
    ) {
      const patch = resource as Omit<
        GameReleasePatch,
        "patch_size_bytes" | "signature_size_bytes" | "generation_duration_ms"
      > & {
        patch_size_bytes: string | bigint;
        signature_size_bytes: string | bigint;
        generation_duration_ms: string | bigint;
      };
      return releasePatchSchema.parse({
        id: patch.id,
        source_release_id: patch.source_release_id,
        target_release_id: patch.target_release_id,
        target: {
          platform: patch.platform,
          architecture: patch.architecture,
        },
        algorithm: patch.algorithm,
        format_version: patch.format_version,
        status: patch.status,
        patch: {
          size_bytes: patch.patch_size_bytes.toString(),
          sha256: patch.patch_sha256,
        },
        signature: {
          size_bytes: patch.signature_size_bytes.toString(),
          sha256: patch.signature_sha256,
        },
        expected_installation_sha256: patch.expected_installation_sha256,
        generation_duration_ms: patch.generation_duration_ms.toString(),
        created_at: patch.created_at.toISOString(),
        updated_at: patch.updated_at.toISOString(),
      });
    }

    interface GameArtifactUploadOutput {
      id: string;
      release_id: string;
      platform: string;
      architecture: string;
      archive_format: string;
      compressed_size_bytes: string | bigint | null;
      installed_size_bytes: string | bigint | null;
      sha256: string | null;
      manifest: unknown;
      status: string;
      created_at: Date;
      updated_at: Date;
    }
    const artifact = resource as GameArtifactUploadOutput;
    return {
      id: artifact.id,
      release_id: artifact.release_id,
      platform: artifact.platform,
      architecture: artifact.architecture,
      archive_format: artifact.archive_format,
      compressed_size_bytes: artifact.compressed_size_bytes?.toString() ?? null,
      installed_size_bytes: artifact.installed_size_bytes?.toString() ?? null,
      sha256: artifact.sha256,
      manifest: artifact.manifest,
      status: artifact.status,
      created_at: artifact.created_at,
      updated_at: artifact.updated_at,
    };
  }

  if (
    feature === "read:library" &&
    typeof resource === "object" &&
    resource !== null &&
    "strategy" in resource &&
    "fallback_artifact_id" in resource
  ) {
    return updatePlanSchema.parse(resource);
  }

  if (
    feature === "read:library" &&
    typeof resource === "object" &&
    resource !== null &&
    "patch" in resource &&
    "signature" in resource &&
    typeof resource.patch === "object" &&
    resource.patch !== null &&
    "url" in resource.patch
  ) {
    return patchDownloadAuthorizationsSchema.parse(resource);
  }

  if (
    feature === "read:library" &&
    typeof resource === "object" &&
    resource !== null &&
    "release" in resource &&
    "artifact" in resource
  ) {
    const result = resource as {
      release: GameRelease;
      artifact: Omit<
        GameArtifact,
        "compressed_size_bytes" | "installed_size_bytes"
      > & {
        compressed_size_bytes: string | bigint;
        installed_size_bytes: string | bigint;
      };
    };

    return releaseSummarySchema.parse({
      id: result.release.id,
      version: result.release.version,
      release_number: result.release.release_number,
      published_at: result.release.published_at?.toISOString(),
      artifact_id: result.artifact.id,
      target: {
        platform: result.artifact.platform,
        architecture: result.artifact.architecture,
      },
      compressed_size_bytes: result.artifact.compressed_size_bytes.toString(),
      installed_size_bytes: result.artifact.installed_size_bytes.toString(),
      sha256: result.artifact.sha256,
      manifest_schema_version: result.artifact.manifest_schema_version,
    });
  }

  if (
    feature === "read:library" &&
    typeof resource === "object" &&
    resource !== null &&
    "schema_version" in resource &&
    "release_id" in resource &&
    "artifact_id" in resource
  ) {
    return installManifestSchema.parse(resource);
  }

  if (
    feature === "read:library" &&
    typeof resource === "object" &&
    resource !== null &&
    "artifact_id" in resource &&
    "url" in resource &&
    "expires_at" in resource &&
    "total_size_bytes" in resource
  ) {
    return downloadAuthorizationSchema.parse(resource);
  }

  if (
    feature === "create:store" ||
    feature === "read:public_store" ||
    feature === "update:store"
  ) {
    const storeOutput = resource as Store;
    return {
      id: storeOutput.id,
      slug: storeOutput.slug,
      name: storeOutput.name,
      description: storeOutput.description,
      logo_url: storeOutput.logo_url,
      owner_id: storeOutput.owner_id,
      created_at: storeOutput.created_at,
      updated_at: storeOutput.updated_at,
    };
  }

  if (
    feature === "create:store_follow" ||
    feature === "read:store_follow" ||
    feature === "delete:store_follow" ||
    feature === "read:store_follow_status"
  ) {
    const statusOutput = resource as { is_followed: boolean };
    return { is_followed: statusOutput.is_followed };
  }

  // The admin view of a store, kept separate from the branch above because that
  // one also serves read:public_store — commission_rate must not be visible to
  // anyone browsing, and the owner-facing paths deliberately do not show it
  // either while the rate is admin-set.
  if (
    feature === "read:store:any" ||
    feature === "update:store_commission:any"
  ) {
    const storeOutput = resource as Store;
    return {
      id: storeOutput.id,
      slug: storeOutput.slug,
      name: storeOutput.name,
      description: storeOutput.description,
      logo_url: storeOutput.logo_url,
      owner_id: storeOutput.owner_id,
      // Null means no bespoke rate, so the platform default applies. Serialised
      // at full scale for the same reason exchange rates are: the wire format
      // should not depend on how the driver stringifies a Decimal.
      commission_rate: storeOutput.commission_rate?.toFixed(8) ?? null,
      created_at: storeOutput.created_at,
      updated_at: storeOutput.updated_at,
    };
  }

  if (
    feature === "read:supplier_terms:any" ||
    feature === "update:supplier_terms:any"
  ) {
    const termsOutput = resource as SupplierTerms;
    return {
      id: termsOutput.id,
      supplier_type: termsOutput.supplier_type,
      supplier_id: termsOutput.supplier_id,
      cost_rate: termsOutput.cost_rate.toFixed(8),
      created_at: termsOutput.created_at,
      updated_at: termsOutput.updated_at,
    };
  }

  if (feature === "manage:store_members") {
    interface StoreMemberOutput {
      id: string;
      store_id: string;
      user_id: string;
      username?: string;
      permissions: string[];
      created_at: Date;
      updated_at: Date;
    }
    const memberOutput = resource as StoreMemberOutput;
    return {
      id: memberOutput.id,
      store_id: memberOutput.store_id,
      user_id: memberOutput.user_id,
      username: memberOutput.username,
      permissions: memberOutput.permissions,
      created_at: memberOutput.created_at,
      updated_at: memberOutput.updated_at,
    };
  }

  if (feature === "read:store_tag_filter") {
    const tagFilterOutput = resource as StoreTagFilter;
    return {
      id: tagFilterOutput.id,
      store_id: tagFilterOutput.store_id,
      tag: tagFilterOutput.tag,
      mode: tagFilterOutput.mode,
      created_at: tagFilterOutput.created_at,
      updated_at: tagFilterOutput.updated_at,
    };
  }

  if (feature === "read:store_game_override") {
    const overrideOutput = resource as StoreGameOverride & {
      game_slug: string;
    };
    return {
      id: overrideOutput.id,
      store_id: overrideOutput.store_id,
      game_id: overrideOutput.game_id,
      game_slug: overrideOutput.game_slug,
      visibility: overrideOutput.visibility,
      created_at: overrideOutput.created_at,
      updated_at: overrideOutput.updated_at,
    };
  }

  if (feature === "read:store_statement") {
    const balanceOutput = resource as {
      currency: string;
      total: { toFixed: (places: number) => string };
      payable: { toFixed: (places: number) => string };
      held: { toFixed: (places: number) => string };
    };

    return {
      currency: balanceOutput.currency,
      // Serialised at the storage scale rather than the currency's display
      // scale: this is a figure an affiliate reconciles against a payment, so
      // the fractions of a cent the ledger actually holds must not be hidden.
      total: balanceOutput.total.toFixed(4),
      payable: balanceOutput.payable.toFixed(4),
      held: balanceOutput.held.toFixed(4),
    };
  }

  // Every payout-account feature shares one branch, admin included. Nothing
  // about being an admin makes provider_account_id safe to serialise, and a
  // wider admin variant would be the obvious place for it to leak from.
  if (
    feature === "read:payout_account" ||
    feature === "read:payout_account:any" ||
    feature === "manage:payout_account" ||
    feature === "update:payout_account:status:any"
  ) {
    const accountOutput = resource as PayoutAccount;
    return {
      id: accountOutput.id,
      store_id: accountOutput.store_id,
      provider: accountOutput.provider,
      // Deliberately no provider_account_id. It is the only field in this table
      // that is not the outlet's own to see, and the whole reason a payout
      // account cannot simply be returned whole.
      payout_currency: accountOutput.payout_currency,
      label: accountOutput.label,
      payouts_enabled: accountOutput.payouts_enabled,
      created_at: accountOutput.created_at,
      updated_at: accountOutput.updated_at,
    };
  }

  if (feature === "read:store_sale") {
    const saleOutput = resource as SaleWithGame;
    return {
      id: saleOutput.id,
      // Never the buyer's id. An outlet is a marketing surface, and
      // docs/legal/business-description.md — the text handed to payment
      // processors — states that affiliates receive no consumer personal data.
      // buyerRefFor is salted per outlet so repeat customers are still
      // countable without anyone learning who they are.
      buyer_ref: buyerRefFor(saleOutput.user_id, saleOutput.store_id),
      game_id: saleOutput.game_id,
      game_title: saleOutput.game_title,
      game_slug: saleOutput.game_slug,
      store_id: saleOutput.store_id,
      price_at_sale: saleOutput.price_at_sale.toFixed(2),
      // Without the currency the amount above is a number with no unit, which
      // for an outlet reading its own sales is worse than showing nothing.
      currency: saleOutput.currency,
      created_at: saleOutput.created_at,
    };
  }

  // A studio sees sales of its own games. No buyer field at all, not even the
  // pseudonym: a studio has no legitimate use for distinguishing one buyer from
  // another, and the cheapest way to keep consumer data out of a second party's
  // hands is not to send it.
  if (feature === "read:studio_sale") {
    const saleOutput = resource as SaleWithGame;
    return {
      id: saleOutput.id,
      game_id: saleOutput.game_id,
      game_title: saleOutput.game_title,
      game_slug: saleOutput.game_slug,
      // Which outlet referred the sale, so a studio can see where its games
      // move. Null means the global storefront.
      store_id: saleOutput.store_id,
      price_at_sale: saleOutput.price_at_sale.toFixed(2),
      currency: saleOutput.currency,
      created_at: saleOutput.created_at,
    };
  }

  // A buyer's own purchase history — the one audience entitled to the whole
  // row, because it is about them. This is also the only place price_at_sale
  // and the currency they were actually charged in are shown back to them;
  // read:library deliberately shows the game's current list price instead.
  if (feature === "read:own_sale") {
    const saleOutput = resource as SaleWithGame;
    return {
      id: saleOutput.id,
      game_id: saleOutput.game_id,
      game_title: saleOutput.game_title,
      game_slug: saleOutput.game_slug,
      store_id: saleOutput.store_id,
      store_name: saleOutput.store_name,
      store_slug: saleOutput.store_slug,
      store_logo_url: saleOutput.store_logo_url,
      price_at_sale: saleOutput.price_at_sale.toFixed(2),
      currency: saleOutput.currency,
      created_at: saleOutput.created_at,
    };
  }

  // One currency's worth of the platform's income statement.
  if (feature === "read:platform_ledger:any") {
    const totalsOutput = resource as {
      currency: string;
      gross: { toFixed: (places: number) => string };
      supplier_cost: { toFixed: (places: number) => string };
      affiliate_commission: { toFixed: (places: number) => string };
      platform_revenue: { toFixed: (places: number) => string };
      payouts: { toFixed: (places: number) => string };
    };

    return {
      currency: totalsOutput.currency,
      // Storage scale, not display scale — same reasoning as the statement
      // branch above. These are figures reconciled against a bank, and the
      // platform revenue line is a residual, so hiding sub-cent fractions is
      // exactly what would make the columns stop adding up.
      gross: totalsOutput.gross.toFixed(4),
      supplier_cost: totalsOutput.supplier_cost.toFixed(4),
      affiliate_commission: totalsOutput.affiliate_commission.toFixed(4),
      platform_revenue: totalsOutput.platform_revenue.toFixed(4),
      payouts: totalsOutput.payouts.toFixed(4),
    };
  }

  if (
    feature === "create:studio" ||
    feature === "read:public_studio" ||
    feature === "update:studio" ||
    feature === "read:studio:any"
  ) {
    const studioOutput = resource as Studio;
    return {
      id: studioOutput.id,
      slug: studioOutput.slug,
      name: studioOutput.name,
      description: studioOutput.description,
      logo_url: studioOutput.logo_url,
      is_publisher: studioOutput.is_publisher,
      owner_id: studioOutput.owner_id,
      created_at: studioOutput.created_at,
      updated_at: studioOutput.updated_at,
    };
  }

  if (feature === "manage:studio_members") {
    interface StudioMemberOutput {
      id: string;
      studio_id: string;
      user_id: string;
      username?: string;
      permissions: string[];
      created_at: Date;
      updated_at: Date;
    }
    const memberOutput = resource as StudioMemberOutput;
    return {
      id: memberOutput.id,
      studio_id: memberOutput.studio_id,
      user_id: memberOutput.user_id,
      username: memberOutput.username,
      permissions: memberOutput.permissions,
      created_at: memberOutput.created_at,
      updated_at: memberOutput.updated_at,
    };
  }

  if (feature === "read:library") {
    interface LibraryItemOutput {
      id: string;
      item_id: string;
      item_type: string;
      acquired_at: Date;
      game: unknown;
    }
    const libraryOutput = resource as LibraryItemOutput;
    return {
      id: libraryOutput.id,
      item_id: libraryOutput.item_id,
      item_type: libraryOutput.item_type,
      acquired_at: libraryOutput.acquired_at,
      game: libraryOutput.game
        ? filterOutput(user, "read:public_game", libraryOutput.game)
        : null,
    };
  }

  if (feature === "read:dashboard:any") {
    interface DashboardOutput {
      games: {
        pending_count: number;
        oldest_pending: {
          id: string;
          slug: string;
          title: string;
          created_at: Date;
        }[];
        by_status: Record<string, number>;
      };
      users: {
        total: number;
        signups_last_7_days: number;
        signups_previous_7_days: number;
      };
      studios: { total: number };
      stores: { total: number };
    }
    const dashboardOutput = resource as DashboardOutput;
    return {
      games: dashboardOutput.games,
      users: dashboardOutput.users,
      studios: dashboardOutput.studios,
      stores: dashboardOutput.stores,
    };
  }

  if (feature === "update:user:features:any") {
    interface PassResult {
      scanned: number;
      updated: number;
      skipped_ineligible: number;
    }
    interface BackfillReportOutput {
      baseline: PassResult;
      admins: PassResult;
      studio_owners: PassResult;
      studio_members: PassResult;
      store_owners: PassResult;
      store_members: PassResult;
      total_unique_users_updated: number;
    }
    return resource as BackfillReportOutput;
  }

  if (
    feature === "read:currency:any" ||
    feature === "create:currency:any" ||
    feature === "update:currency:any"
  ) {
    const currencyOutput = resource as Currency;
    return {
      id: currencyOutput.id,
      code: currencyOutput.code,
      symbol: currencyOutput.symbol,
      decimal_places: currencyOutput.decimal_places,
      enabled: currencyOutput.enabled,
      created_at: currencyOutput.created_at,
      updated_at: currencyOutput.updated_at,
    };
  }

  if (feature === "read:game_price" || feature === "update:game_price") {
    interface GamePriceOutput {
      currency: string;
      amount: string | null;
      source: "BASE" | "OVERRIDE" | "CONVERTED" | null;
      exchange_rate: string | null;
      is_override: boolean;
    }
    const priceOutput = resource as GamePriceOutput;
    return {
      currency: priceOutput.currency,
      amount: priceOutput.amount,
      source: priceOutput.source,
      exchange_rate: priceOutput.exchange_rate,
      is_override: priceOutput.is_override,
    };
  }

  if (
    feature === "read:exchange_rate:any" ||
    feature === "create:exchange_rate:any"
  ) {
    const rateOutput = resource as ExchangeRate;
    return {
      id: rateOutput.id,
      base_currency: rateOutput.base_currency,
      quote_currency: rateOutput.quote_currency,
      // Decimal is serialised here so the wire format is a fixed string at the
      // rate's full 8-decimal scale, independent of how the driver stringifies.
      rate: rateOutput.rate.toFixed(8),
      source: rateOutput.source,
      effective_at: rateOutput.effective_at,
      created_at: rateOutput.created_at,
    };
  }

  return {};
}

function validateUser(user: Partial<User>) {
  if (!user || !user?.features) {
    throw new InternalServerError({
      cause: "User should be defined and have features property",
    });
  }
}

function validateFeature(feature: string) {
  if (!feature || !AVAILABLE_FEATURES.includes(feature)) {
    throw new InternalServerError({
      cause: `Feature ${feature} not found in available features`,
    });
  }
}

const authorization = {
  can,
  filterOutput,
  ACTIVATED_USER_FEATURES,
  ADMIN_ONLY_FEATURES,
  ADMIN_FEATURES,
  ANONYMOUS_USER_FEATURES,
  DISABLED_USER_FEATURES,
};

export default authorization;
