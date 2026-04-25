import { Session, User, UserActivationToken } from "generated/prisma/client";
import { InternalServerError } from "infra/errors";

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

  // Activation Token
  "read:activation_token",

  // Status
  "read:status",
  "read:status:all",

  // Games
  "create:game",
];

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
};

export default authorization;
