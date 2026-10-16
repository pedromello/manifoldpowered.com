import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { CliError, invalid } from "./errors";

export type Environment = "local" | "hml" | "prod";
export const PRODUCTION_ORIGIN = "https://www.manifoldpowered.com";
const productionOrigins = ["https://manifoldpowered.com", PRODUCTION_ORIGIN];
export type Account = {
  alias: string;
  origin: string;
  email?: string;
  user_id?: string;
  username?: string;
  requested_at?: string;
  mailcatcher_after_id?: number;
  pending?: "activation" | "otp";
};
export interface CredentialStore {
  get(key: string): Promise<string | null>;
  set(key: string, token: string): Promise<void>;
  delete(key: string): Promise<void>;
}
export class KeyringStore implements CredentialStore {
  private async entry(key: string) {
    try {
      const { Entry } = await import("@napi-rs/keyring");
      return new Entry("com.manifoldpowered.cli", key, {
        linux: { store: "secret-service" },
      });
    } catch {
      throw new CliError(
        "CREDENTIAL_STORE_UNAVAILABLE",
        "Cofre indisponível. Use MANIFOLD_SESSION_TOKEN com MANIFOLD_SESSION_ORIGIN e MANIFOLD_SESSION_ACCOUNT para uma sessão sem persistência.",
      );
    }
  }
  async get(key: string) {
    const entry = await this.entry(key);
    try {
      return entry.getPassword();
    } catch {
      throw new CliError(
        "CREDENTIAL_STORE_UNAVAILABLE",
        "Não foi possível ler a sessão no cofre.",
      );
    }
  }
  async set(key: string, token: string) {
    try {
      (await this.entry(key)).setPassword(token);
    } catch {
      throw new CliError(
        "CREDENTIAL_STORE_UNAVAILABLE",
        "Não foi possível guardar a sessão no cofre.",
      );
    }
  }
  async delete(key: string) {
    const entry = await this.entry(key);
    try {
      entry.deletePassword();
    } catch {
      throw new CliError(
        "CREDENTIAL_STORE_UNAVAILABLE",
        "Não foi possível remover a sessão do cofre.",
      );
    }
  }
}
export function environment(value: unknown): Environment {
  if (value !== "local" && value !== "hml" && value !== "prod")
    invalid("Informe --env local, hml ou prod.");
  return value;
}
export function alias(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(value))
    invalid("Informe --account usando letras, números, hífen ou sublinhado.");
  return value;
}
export function validateOrigin(value: string, env: Environment): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return invalid("Origem inválida.");
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !["/", "/api/v1", "/api/v1/"].includes(url.pathname)
  )
    invalid(
      "Use apenas a origem do ambiente, sem credenciais, parâmetros ou caminho adicional.",
    );
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    url.protocol !== "https:" &&
    !(env === "local" && loopback && url.protocol === "http:")
  )
    invalid("HTTP é permitido apenas no ambiente local em loopback.");
  if (env === "prod" && !productionOrigins.includes(url.origin))
    invalid(`Produção usa ${PRODUCTION_ORIGIN}.`);
  if (env !== "prod" && productionOrigins.includes(url.origin))
    invalid("A origem de produção exige --env prod.");
  return env === "prod" ? PRODUCTION_ORIGIN : url.origin;
}
export class State {
  constructor(
    public directory = process.env.MANIFOLD_CLI_HOME ||
      join(homedir(), ".manifold-cli"),
    public credentials: CredentialStore = new KeyringStore(),
    public profileName?: string,
    public fixedContext?: {
      environment: Environment;
      origin: string;
      account: string;
    },
  ) {}
  private path(name: string) {
    return join(this.directory, name);
  }
  async read<T>(name: string, fallback: T): Promise<T> {
    try {
      return JSON.parse(await readFile(this.path(name), "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
      throw new CliError(
        "CONFIG_ERROR",
        "Configuração local inválida ou inacessível.",
      );
    }
  }
  async write(name: string, value: unknown) {
    await mkdir(dirname(this.path(name)), { recursive: true, mode: 0o700 });
    const temporary = this.path(
      `${name}.${process.pid}.${crypto.randomUUID()}.tmp`,
    );
    try {
      await writeFile(temporary, JSON.stringify(value, null, 2), {
        mode: 0o600,
      });
      await rename(temporary, this.path(name));
    } finally {
      await rm(temporary, { force: true });
    }
  }
  async origin(env: Environment) {
    if (this.fixedContext) {
      if (env !== this.fixedContext.environment)
        throw new CliError(
          "PROFILE_CONTEXT_MISMATCH",
          "O ambiente não corresponde ao perfil.",
        );
      return validateOrigin(this.fixedContext.origin, env);
    }
    const configured = await this.read<string | null>(`env-${env}.json`, null);
    if (configured) return validateOrigin(configured, env);
    if (env === "hml")
      return invalid(
        "Configure hml com env connect --env hml --url https://seu-ambiente.",
      );
    return env === "local" ? "http://localhost:3000" : PRODUCTION_ORIGIN;
  }
  key(env: Environment, origin: string, account: string) {
    return createHash("sha256")
      .update(
        `${this.profileName ? `profile:${this.profileName}\0` : ""}${env}\0${origin}\0${account}`,
      )
      .digest("hex");
  }
  async account(env: Environment, origin: string, account: string) {
    return this.read<Account | null>(
      `account-${this.key(env, origin, account)}.json`,
      null,
    );
  }
  async saveAccount(env: Environment, account: Account) {
    await this.write(
      `account-${this.key(env, account.origin, account.alias)}.json`,
      account,
    );
  }
  async token(env: Environment, origin: string, account: string) {
    if (process.env.MANIFOLD_SESSION_TOKEN) {
      if (
        process.env.MANIFOLD_SESSION_ORIGIN !== origin ||
        process.env.MANIFOLD_SESSION_ACCOUNT !== account ||
        process.env.MANIFOLD_SESSION_ENV !== env ||
        (process.env.MANIFOLD_SESSION_PROFILE || undefined) !== this.profileName
      )
        throw new CliError(
          "SESSION_CONTEXT_MISMATCH",
          "A sessão do processo não corresponde ao perfil, ambiente, origem e conta selecionados.",
        );
      if (!/^[a-f0-9]{96}$/.test(process.env.MANIFOLD_SESSION_TOKEN))
        invalid("MANIFOLD_SESSION_TOKEN inválido.");
      return process.env.MANIFOLD_SESSION_TOKEN;
    }
    return this.credentials.get(this.key(env, origin, account));
  }
  async storeToken(
    env: Environment,
    origin: string,
    account: string,
    token: string,
  ) {
    await this.credentials.set(this.key(env, origin, account), token);
  }
  async forgetToken(env: Environment, origin: string, account: string) {
    await this.credentials.delete(this.key(env, origin, account));
  }
}
