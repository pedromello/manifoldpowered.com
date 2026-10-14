import { readdir, writeFile, mkdir, link, rm } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  State,
  alias,
  environment,
  validateOrigin,
  PRODUCTION_ORIGIN,
} from "./state";
import { CliError, invalid } from "./errors";

export const profileSchema = z
  .object({
    name: z.string(),
    environment: z.enum(["local", "hml", "prod"]),
    origin: z.string(),
    account: z.string(),
  })
  .strict();
export type Profile = z.infer<typeof profileSchema>;
export async function getProfile(state: State, name: string): Promise<Profile> {
  const value = await state.read<unknown>(`profile-${alias(name)}.json`, null);
  const parsed = profileSchema.safeParse(value);
  if (!parsed.success)
    throw new CliError(
      "PROFILE_NOT_FOUND",
      "Perfil inexistente ou inválido. Consulte profiles list.",
    );
  const profile = parsed.data;
  if (
    alias(profile.name) !== name ||
    alias(profile.account) !== profile.account ||
    validateOrigin(profile.origin, profile.environment) !== profile.origin
  )
    invalid("O perfil contém contexto inválido.");
  return profile;
}
export async function listProfiles(state: State) {
  const files = await readdir(state.directory).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [];
      throw error;
    },
  );
  return Promise.all(
    files
      .filter((file) => /^profile-[a-zA-Z0-9_-]{1,64}\.json$/.test(file))
      .sort()
      .map((file) => getProfile(state, file.slice(8, -5))),
  );
}
export async function createProfile(
  state: State,
  name: string,
  envValue: unknown,
  accountValue: unknown,
  url?: string,
) {
  const env = environment(envValue);
  const profile: Profile = {
    name: alias(name),
    environment: env,
    account: alias(accountValue),
    origin: validateOrigin(
      url ??
        (env === "local"
          ? "http://localhost:3000"
          : env === "prod"
            ? PRODUCTION_ORIGIN
            : ""),
      env,
    ),
  };
  await mkdir(state.directory, { recursive: true, mode: 0o700 });
  const temporary = join(
    state.directory,
    `.profile-${process.pid}-${crypto.randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporary, JSON.stringify(profile, null, 2), {
      flag: "wx",
      mode: 0o600,
    });
    // Publish a complete immutable file atomically; a concurrent creator cannot
    // overwrite another profile or observe partially written JSON.
    await link(
      temporary,
      join(state.directory, `profile-${profile.name}.json`),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const existing = await getProfile(state, profile.name);
    if (
      ["name", "environment", "origin", "account"].some(
        (key) =>
          existing[key as keyof Profile] !== profile[key as keyof Profile],
      )
    )
      throw new CliError(
        "PROFILE_EXISTS",
        "O nome já está vinculado a outro contexto. Use um novo nome de perfil.",
      );
  } finally {
    await rm(temporary, { force: true });
  }
  // The immutable definition is authoritative; mutable selections are never shared.
  return profile;
}
export function profileState(root: State, profile: Profile) {
  return new State(
    join(root.directory, "profiles", profile.name),
    root.credentials,
    profile.name,
    profile,
  );
}
