// Idempotent CLI to bootstrap or promote a platform admin. Safe to re-run:
// finds-or-creates the user by email, activates it if needed, and grants
// only whatever admin features it doesn't already have.
//
// Usage: npm run admin:grant -- --email=<email>

import { User } from "generated/prisma/client";
import { NotFoundError } from "infra/errors";
import activation from "models/activation";
import authorization from "models/authorization";
import user from "models/user";

async function main() {
  const email = parseEmailArg(process.argv.slice(2));

  const targetUser = await findOrCreateUser(email);
  const activatedUser = await ensureActivated(targetUser);
  const adminUser = await ensureAdminFeatures(activatedUser);

  console.log(
    `Admin access granted to ${adminUser.email} (${adminUser.username}).`,
  );
  console.log(`Features: ${adminUser.features.join(", ")}`);
}

function parseEmailArg(args: string[]): string {
  const emailArg = args.find((arg) => arg.startsWith("--email="));
  const email = emailArg?.split("=")[1]?.trim();

  if (!email) {
    console.error("Usage: npm run admin:grant -- --email=<email>");
    process.exit(1);
  }

  return email;
}

async function findOrCreateUser(email: string): Promise<User> {
  try {
    return await user.findOneByEmail(email);
  } catch (error) {
    if (!(error instanceof NotFoundError)) {
      throw error;
    }
  }

  const username = await generateUniqueUsername(email);
  console.log(`No user found for ${email}. Creating one as "${username}".`);
  return user.create({ username, email, password: null });
}

async function generateUniqueUsername(email: string): Promise<string> {
  const base =
    email
      .split("@")[0]
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 24) || "admin";

  let candidate = base;
  let suffix = 0;

  while (await usernameTaken(candidate)) {
    suffix += 1;
    candidate = `${base}${suffix}`;
  }

  return candidate;
}

async function usernameTaken(username: string): Promise<boolean> {
  try {
    await user.findOneByUsername(username);
    return true;
  } catch (error) {
    if (error instanceof NotFoundError) {
      return false;
    }
    throw error;
  }
}

async function ensureActivated(targetUser: User): Promise<User> {
  if (!authorization.can(targetUser, "read:activation_token")) {
    return targetUser;
  }

  console.log(`Activating ${targetUser.email}...`);
  return activation.activateUserByUserId(targetUser.id);
}

async function ensureAdminFeatures(targetUser: User): Promise<User> {
  const missingFeatures = authorization.ADMIN_ONLY_FEATURES.filter(
    (feature) => !targetUser.features.includes(feature),
  );

  if (missingFeatures.length === 0) {
    console.log(`${targetUser.email} already has admin access.`);
    return targetUser;
  }

  return user.addFeatures(targetUser.id, missingFeatures);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Failed to grant admin access:", error);
    process.exit(1);
  });
