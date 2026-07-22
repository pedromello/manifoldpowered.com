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
  Studio,
  StudioMember,
} from "generated/prisma/client";
import { InternalServerError } from "infra/errors";

type StoreWithMembers = Store & { members: StoreMember[] };
type StudioWithMembers = Studio & { members: StudioMember[] };
type GameWithStudio = Game & { studio: StudioWithMembers };

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
  "read:public_game",
  "update:game",
  "update:game:any",

  // Wishlists
  "create:wishlist",
  "read:wishlist",
  "delete:wishlist",

  // Reviews
  "create:review",
  "read:review",
  "delete:review",

  // Game Files
  "create:game_file",
  "read:game_file",
  "delete:game_file",

  // Library
  "read:library",
  "create:library",

  // Stores
  "create:store",
  "read:public_store",
  "update:store",
  "update:store:any",
  "manage:store_members",
  "manage:store_members:any",
  "read:store_tag_filter",
  "read:store_game_override",

  // Studios
  "create:studio",
  "read:public_studio",
  "update:studio",
  "update:studio:any",
  "manage:studio_members",
  "manage:studio_members:any",

  // Backoffice (admin)
  "read:user:any",
  "update:user:status:any",
  "read:studio:any",
  "read:store:any",
  "read:game:any",
  "update:game:status:any",
  "read:dashboard:any",
  "read:audit_log:any",
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
  "create:wishlist",
  "read:wishlist",
  "delete:wishlist",
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
  "read:studio:any",
  "read:store:any",
  "read:game:any",
  "update:game:status:any",
  "read:dashboard:any",
  "read:audit_log:any",
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
      feature === "delete:game_file") &&
    resource
  ) {
    authorized = false;
    const gameResource = resource as GameWithStudio;
    const studioResource = gameResource.studio;

    const isOwner = user.id === studioResource.owner_id;
    const isPermittedMember = studioResource.members?.some(
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
    (feature === "update:store" || feature === "manage:store_members") &&
    resource
  ) {
    authorized = false;
    const storeResource = resource as StoreWithMembers;
    const anyFeature =
      feature === "update:store"
        ? "update:store:any"
        : "manage:store_members:any";

    const isOwner = user.id === storeResource.owner_id;
    const isPermittedMember = storeResource.members?.some(
      (member) =>
        member.user_id === user.id && member.permissions.includes(feature),
    );

    if (isOwner || isPermittedMember || can(user, anyFeature)) {
      authorized = true;
    }
  }

  if (
    (feature === "update:studio" || feature === "manage:studio_members") &&
    resource
  ) {
    authorized = false;
    const studioResource = resource as StudioWithMembers;
    const anyFeature =
      feature === "update:studio"
        ? "update:studio:any"
        : "manage:studio_members:any";

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
    feature === "read:public_game" ||
    feature === "update:game" ||
    feature === "read:game:any" ||
    feature === "update:game:status:any"
  ) {
    const gameOutput = resource as Game;
    return {
      id: gameOutput.id,
      slug: gameOutput.slug,
      title: gameOutput.title,
      description: gameOutput.description,
      detailed_description: gameOutput.detailed_description,
      launch_date: gameOutput.launch_date,
      price: gameOutput.price,
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
      base_price: gameOutput.base_price,
      discount_label: gameOutput.discount_label,
      created_at: gameOutput.created_at,
      updated_at: gameOutput.updated_at,
    };
  }

  if (feature === "read:review") {
    const reviewOutput = resource as Review & { user: { username: string } };
    return {
      id: reviewOutput.id,
      game_id: reviewOutput.game_id,
      user_id: reviewOutput.user_id,
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

  if (
    feature === "create:store" ||
    feature === "read:public_store" ||
    feature === "update:store" ||
    feature === "read:store:any"
  ) {
    const storeOutput = resource as Store;
    return {
      id: storeOutput.id,
      slug: storeOutput.slug,
      name: storeOutput.name,
      description: storeOutput.description,
      owner_id: storeOutput.owner_id,
      created_at: storeOutput.created_at,
      updated_at: storeOutput.updated_at,
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
