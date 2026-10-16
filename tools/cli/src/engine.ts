import { readdir } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { z } from "zod";
import { commands } from "./registry";
import {
  State,
  alias,
  environment,
  validateOrigin,
  PRODUCTION_ORIGIN,
  type Account,
  type Environment,
} from "./state";
import { ApiClient, sessionToken, type ApiResponse } from "./client";
import { asCliError, CliError, invalid } from "./errors";
import { readVerificationEmail, mailcatcherWatermark } from "./mailcatcher";
import { extractSteamAppId } from "../../../contracts/game-reference";
import { parseNintendoUrl } from "../../../lib/nintendo";
import {
  steamImportRequestSchema,
  nintendoImportRequestSchema,
  requestOtpSchema,
  verifyOtpSchema,
  storePublicationActionSchema,
} from "../../../contracts/creator-requests";
import {
  STORE_LAYOUT_PRESETS,
  STORE_PALETTES,
  STORE_TYPOGRAPHIES,
  STORE_SHAPES,
  STORE_SOCIAL_PLATFORMS,
} from "../../../contracts/store-presentation";
import { createProfile, getProfile, listProfiles } from "./profiles";
import {
  getExecution,
  listExecutions,
  recordExecution,
  summarizeExecution,
  mergeExecutionSummary,
} from "./journal";
import { curatorAction, completeOutletChange } from "./curation";
import type { probeImage } from "./image-probe";

export type Options = {
  env?: string;
  account?: string;
  wait?: boolean;
  timeout?: number;
  mailcatcher?: boolean;
  locale?: string;
};
export type Outcome = {
  state: "completed" | "pending" | "partial";
  data: unknown;
  exitCode?: number;
  next_action?: unknown;
  environment?: Environment;
  account?: string | null;
};
export type Dependencies = {
  state?: State;
  fetch?: typeof fetch;
  imageProbe?: typeof probeImage;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<unknown>;
  progress?: (message: string) => void;
  secrets?: string[];
  checkpoint?: (data: unknown, nextAction: unknown) => Promise<void>;
};
type ImportReference = {
  provider: "steam" | "nintendo";
  reference: string;
  original_reference?: string;
};

function matchesAccount(
  saved: Account | null,
  identity: Record<string, unknown>,
): boolean {
  if (saved?.user_id) return saved.user_id === identity.id;
  return (
    !saved?.email ||
    (typeof identity.email === "string" &&
      saved.email.toLowerCase() === identity.email.toLowerCase())
  );
}

function validated(
  schema: z.ZodType,
  payload: unknown,
): Record<string, unknown> {
  const result = schema.safeParse(payload);
  if (!result.success)
    invalid(
      "Entrada inválida. Consulte schema para os campos aceitos.",
      result.error.issues.map(({ path, message }) => ({ path, message })),
    );
  return result.data as Record<string, unknown>;
}
function normalizeImport(
  input: ImportReference,
): ImportReference & { body: Record<string, unknown>; endpoint: string } {
  if (input.provider === "steam") {
    if (!/^[1-9]\d*$/.test(input.reference)) {
      let url: URL;
      try {
        url = new URL(input.reference);
      } catch {
        return invalid("Informe um App ID positivo ou URL Steam válida.");
      }
      if (url.username || url.password)
        invalid("A URL Steam não pode conter credenciais.");
    }
    const reference = extractSteamAppId(input.reference);
    if (
      !reference ||
      !steamImportRequestSchema.safeParse({ steam_app_id: reference }).success
    )
      invalid("Informe um App ID positivo ou URL Steam válida.");
    return {
      ...input,
      original_reference: input.original_reference ?? input.reference,
      reference,
      body: { steam_app_id: reference },
      endpoint: "/items/games/steam-import",
    };
  }
  const parsed = parseNintendoUrl(input.reference);
  if (!parsed)
    invalid(
      "Informe uma página de produto brasileira ou americana da Nintendo eShop.",
    );
  return {
    ...input,
    original_reference: input.original_reference ?? input.reference,
    reference: parsed.url,
    body: nintendoImportRequestSchema.parse({ eshop_url: parsed.url }),
    endpoint: "/items/games/nintendo-import",
  };
}
export async function execute(
  name: string,
  input: unknown,
  options: Options,
  deps: Dependencies = {},
): Promise<Outcome> {
  const command = commands[name];
  if (!command) return invalid("Comando desconhecido. Consulte --help.");
  const payload = validated(command.schema, input);
  const state = deps.state ?? new State();
  const selected = await state.read<{ env?: string }>("selection-env.json", {});
  const env = environment(options.env ?? selected.env ?? "local");
  if (command.mutation && (!options.env || !options.account))
    invalid("Alterações exigem --env e --account explícitos.");
  if (name === "env connect" && !options.env)
    invalid("Informe --env para configurar o ambiente.");
  const selectedAccount = await state.read<string | null>(
    `selection-${env}.json`,
    null,
  );
  const accountAlias = options.account
    ? alias(options.account)
    : selectedAccount;
  const now = deps.now ?? Date.now;
  const pause = deps.sleep ?? sleep;
  const timeout = options.timeout ?? 120;
  if (!Number.isFinite(timeout) || timeout < 1 || timeout > 3600)
    invalid("--timeout deve estar entre 1 e 3600 segundos.");
  if (
    options.mailcatcher &&
    (env !== "local" || !["users activate", "auth login verify"].includes(name))
  )
    invalid(
      "--mailcatcher só pode verificar ativação ou OTP no ambiente local.",
    );
  if (
    options.wait &&
    !name.startsWith("games import ") &&
    name !== "runs resume" &&
    !options.mailcatcher
  )
    invalid("--wait acompanha importações ou verificação pelo Mailcatcher.");
  const result = (data: unknown, extra: Partial<Outcome> = {}): Outcome => ({
    state: "completed",
    data:
      command.mutation &&
      data &&
      typeof data === "object" &&
      !Array.isArray(data) &&
      typeof payload.slug === "string"
        ? {
            ...data,
            slug: payload.slug,
            ...(typeof payload.game_slug === "string"
              ? { game_slug: payload.game_slug }
              : {}),
            ...(typeof payload.operation_id === "string"
              ? { operation_id: payload.operation_id }
              : {}),
          }
        : data,
    environment: env,
    account: accountAlias,
    ...extra,
  });
  if (name === "profiles create")
    return result(
      await createProfile(
        state,
        String(payload.name),
        options.env,
        options.account,
        payload.url as string | undefined,
      ),
    );
  if (name === "profiles list")
    return result({ profiles: await listProfiles(state) });
  if (name === "profiles get")
    return result(await getProfile(state, String(payload.name)));
  if (name === "env list")
    return result(
      await Promise.all(
        (["local", "hml", "prod"] as const).map(async (item) => ({
          environment: item,
          origin: await state.read(
            `env-${item}.json`,
            item === "local"
              ? "http://localhost:3000"
              : item === "prod"
                ? PRODUCTION_ORIGIN
                : null,
          ),
        })),
      ),
    );
  if (name === "outlets options")
    return result({
      layout_presets: STORE_LAYOUT_PRESETS,
      palettes: STORE_PALETTES,
      typographies: STORE_TYPOGRAPHIES,
      shapes: STORE_SHAPES,
      social_platforms: STORE_SOCIAL_PLATFORMS,
    });
  const origin =
    name === "env connect"
      ? validateOrigin(
          String(
            payload.url ??
              (env === "local"
                ? "http://localhost:3000"
                : env === "prod"
                  ? PRODUCTION_ORIGIN
                  : ""),
          ),
          env,
        )
      : await state.origin(env);
  if (
    state.fixedContext &&
    (env !== state.fixedContext.environment ||
      accountAlias !== state.fixedContext.account ||
      origin !== state.fixedContext.origin)
  )
    throw new CliError(
      "PROFILE_CONTEXT_MISMATCH",
      "O comando não corresponde ao contexto fixo do perfil.",
    );
  if (name === "runs list")
    return result({
      executions: await listExecutions(
        state,
        env,
        origin,
        accountAlias,
        Number(payload.limit),
      ),
    });
  if (name === "runs get") {
    const execution = await getExecution(state, String(payload.execution_id));
    if (
      execution.environment !== env ||
      execution.origin !== origin ||
      execution.account !== accountAlias
    )
      throw new CliError(
        "RUN_CONTEXT_MISMATCH",
        "A execução pertence a outro ambiente ou conta.",
      );
    return result(execution);
  }
  const api = new ApiClient(
    origin,
    null,
    deps.fetch,
    options.locale ?? "pt-BR",
  );
  if (name === "env connect" || name === "env status") {
    const health = await api.request("/status", { anonymous: true });
    if (name === "env connect") {
      await state.write(`env-${env}.json`, origin);
      await state.write("selection-env.json", { env });
    }
    return result({ origin, connected: true, status: health.body });
  }
  if (name === "auth accounts") {
    const files = await readdir(state.directory).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return [];
        throw error;
      },
    );
    const accounts: Account[] = [];
    for (const file of files.filter((file) =>
      /^account-[a-f0-9]{64}\.json$/.test(file),
    )) {
      const account = await state.read<Account>(file, {} as Account);
      if (
        account.origin === origin &&
        typeof account.alias === "string" &&
        file === `account-${state.key(env, origin, account.alias)}.json`
      )
        accounts.push(account);
    }
    return result({ accounts, selected: selectedAccount });
  }
  const savedAccount = accountAlias
    ? await state.account(env, origin, accountAlias)
    : null;
  if (command.authenticated) {
    if (!accountAlias)
      invalid("Informe --account ou selecione uma conta com auth use.");
    api.token = await state.token(env, origin, accountAlias);
    if (!api.token)
      throw new CliError(
        "LOGIN_REQUIRED",
        "A conta precisa de uma sessão válida. Use auth login request.",
      );
    deps.secrets?.push(api.token);
    if (command.mutation) {
      const identity = (await api.request("/user")).body;
      if (!matchesAccount(savedAccount, identity))
        throw new CliError(
          "ACCOUNT_MISMATCH",
          "A sessão não corresponde à conta salva.",
        );
    }
  }
  const requiredAccount = () => {
    if (!accountAlias) return invalid("Informe --account.");
    return accountAlias;
  };
  const saveAuthenticated = async (response: ApiResponse) => {
    const token = sessionToken(response);
    deps.secrets?.push(token);
    api.token = token;
    const identity = (await api.request("/user")).body;
    if (
      typeof identity.id !== "string" ||
      typeof identity.email !== "string" ||
      typeof identity.username !== "string"
    )
      throw new CliError(
        "INVALID_API_RESPONSE",
        "A API não confirmou a identidade autenticada.",
      );
    if (!matchesAccount(savedAccount, identity)) {
      await api.request("/sessions", { method: "DELETE" });
      throw new CliError(
        "ACCOUNT_MISMATCH",
        "Esse alias já pertence a outra conta. Escolha outro --account.",
      );
    }
    try {
      await state.storeToken(env, origin, requiredAccount(), token);
    } catch (error) {
      await api
        .request("/sessions", { method: "DELETE" })
        .catch(() => undefined);
      throw error;
    }
    await state.saveAccount(env, {
      alias: requiredAccount(),
      origin,
      email: identity.email,
      username: identity.username,
      user_id: identity.id,
    });
    return result(identity);
  };
  const verificationSecret = async (
    kind: "activation" | "otp",
    supplied: unknown,
  ): Promise<string> => {
    if (typeof supplied === "string") {
      deps.secrets?.push(supplied);
      return supplied;
    }
    if (!options.mailcatcher)
      invalid(
        kind === "activation"
          ? "Forneça activation_url por stdin ou use --mailcatcher local."
          : "Forneça code por stdin ou use --mailcatcher local.",
      );
    if (
      !savedAccount?.email ||
      !savedAccount.requested_at ||
      savedAccount.pending !== kind
    )
      invalid("Solicite primeiro a verificação para esta conta e ambiente.");
    const deadline = now() + timeout * 1000;
    do {
      const secret = await readVerificationEmail({
        email: savedAccount.email,
        requestedAt: savedAccount.requested_at,
        afterId: savedAccount.mailcatcher_after_id,
        origin,
        kind,
        fetch: deps.fetch,
      });
      if (secret) {
        deps.secrets?.push(secret);
        return secret;
      }
      if (!options.wait) break;
      await pause(Math.min(1000, Math.max(0, deadline - now())));
    } while (now() < deadline);
    throw new CliError(
      "VERIFICATION_PENDING",
      "O e-mail de verificação ainda não chegou.",
      3,
      {
        next_command:
          kind === "activation" ? "users activate" : "auth login verify",
      },
      true,
    );
  };
  if (name === "runs resume") {
    const entry = await getExecution(state, String(payload.execution_id));
    if (
      entry.environment !== env ||
      entry.origin !== origin ||
      entry.account !== requiredAccount()
    )
      throw new CliError(
        "RUN_CONTEXT_MISMATCH",
        "A execução pertence a outro ambiente ou conta.",
      );
    if (!entry.next_actions?.length)
      return result({
        ...entry,
        next_action:
          entry.state === "started"
            ? "Consulte os recursos antes de reenviar a alteração; a execução foi interrompida."
            : null,
      });
    const outcomes: Outcome[] = [];
    for (const action of entry.next_actions) {
      if (action.command !== "games import status")
        throw new CliError(
          "INVALID_RUN",
          "Execução contém uma ação de retomada inválida.",
        );
      const { command, ...input } = action;
      outcomes.push(
        await execute(
          String(command),
          input,
          { ...options, env, account: requiredAccount() },
          deps,
        ),
      );
    }
    const pending = outcomes.some((item) => item.state === "pending");
    const summaries = summarizeExecution(outcomes, null, deps.secrets ?? []);
    await recordExecution(state, {
      ...entry,
      ...mergeExecutionSummary(entry, summaries),
      updated_at: new Date(now()).toISOString(),
      state: pending ? "pending" : "completed",
    });
    return result(
      { execution_id: entry.execution_id, results: outcomes },
      {
        state: pending ? "pending" : "completed",
        exitCode: options.wait && pending ? 3 : 0,
      },
    );
  }
  const curated = await curatorAction(name, payload, api, deps.imageProbe);
  if (curated)
    return result(curated.data, {
      exitCode: curated.exitCode,
      next_action: curated.next_action,
    });
  switch (name) {
    case "users register": {
      if (
        savedAccount?.email &&
        savedAccount.email.toLowerCase() !== String(payload.email).toLowerCase()
      )
        throw new CliError(
          "ACCOUNT_MISMATCH",
          "Esse alias já pertence a outro e-mail.",
        );
      const afterId =
        env === "local" ? await mailcatcherWatermark(deps.fetch) : undefined;
      const requestedAt = new Date(now()).toISOString();
      const response = await api.request("/users", {
        method: "POST",
        body: payload,
        anonymous: true,
      });
      await state.saveAccount(env, {
        alias: requiredAccount(),
        origin,
        email: String(payload.email).trim().toLowerCase(),
        username: String(payload.username),
        requested_at: requestedAt,
        mailcatcher_after_id: afterId,
        pending: "activation",
      });
      return result(response.body, {
        state: "pending",
        next_action: {
          command: "users activate",
          email: payload.email,
          requested_at: requestedAt,
          secret_input: "activation_url via stdin",
        },
      });
    }
    case "users activate": {
      const secret = await verificationSecret(
        "activation",
        payload.activation_url,
      );
      let activationId = secret;
      if (!z.uuid().safeParse(secret).success) {
        let url: URL;
        try {
          url = new URL(secret);
        } catch {
          return invalid("Link de ativação inválido.");
        }
        const match = /^\/signup\/activate\/([a-f0-9-]{36})\/?$/i.exec(
          url.pathname,
        );
        if (
          (env === "prod" ? validateOrigin(url.origin, env) : url.origin) !==
            origin ||
          url.username ||
          url.password ||
          url.search ||
          url.hash ||
          !match ||
          !z.uuid().safeParse(match[1]).success
        )
          invalid(
            "O link de ativação não corresponde ao ambiente selecionado.",
          );
        activationId = match[1];
      }
      deps.secrets?.push(activationId);
      return saveAuthenticated(
        await api.request(`/activations/${activationId}`, {
          method: "PATCH",
          anonymous: true,
        }),
      );
    }
    case "auth login request": {
      const afterId =
        env === "local" ? await mailcatcherWatermark(deps.fetch) : undefined;
      const requestedAt = new Date(now()).toISOString();
      await api.request("/otp", {
        method: "POST",
        body: requestOtpSchema.parse(payload),
        anonymous: true,
      });
      const email =
        typeof payload.email === "string"
          ? payload.email
          : z.email().safeParse(payload.login).success
            ? String(payload.login)
            : savedAccount?.email;
      await state.saveAccount(env, {
        ...savedAccount,
        alias: requiredAccount(),
        origin,
        email,
        requested_at: requestedAt,
        mailcatcher_after_id: afterId,
        pending: "otp",
      });
      return result(
        { login: payload.login, email, requested_at: requestedAt },
        {
          state: "pending",
          next_action: {
            command: "auth login verify",
            secret_input: "code via stdin",
          },
        },
      );
    }
    case "auth login verify": {
      const code = await verificationSecret("otp", payload.code);
      return saveAuthenticated(
        await api.request("/otp/sessions", {
          method: "POST",
          body: verifyOtpSchema.parse({ ...payload, code }),
          anonymous: true,
        }),
      );
    }
    case "auth login password":
      return saveAuthenticated(
        await api.request("/sessions", {
          method: "POST",
          body: payload,
          anonymous: true,
        }),
      );
    case "auth whoami":
      return result((await api.request("/user")).body);
    case "auth use": {
      const identity = (await api.request("/user")).body;
      if (!matchesAccount(savedAccount, identity))
        throw new CliError(
          "ACCOUNT_MISMATCH",
          "A sessão não corresponde à conta salva.",
        );
      await state.write(`selection-${env}.json`, requiredAccount());
      await state.write("selection-env.json", { env });
      return result(identity);
    }
    case "auth logout": {
      let expired = false;
      try {
        await api.request("/sessions", { method: "DELETE" });
      } catch (error) {
        if (!(error instanceof CliError) || error.httpStatus !== 401)
          throw error;
        expired = true;
      }
      if (!process.env.MANIFOLD_SESSION_TOKEN)
        await state.forgetToken(env, origin, requiredAccount());
      return result({ logged_out: true, already_expired: expired });
    }
    case "studios create":
      return result(
        (await api.request("/studios", { method: "POST", body: payload })).body,
      );
    case "studios list":
      return result((await api.request("/studios")).body);
    case "studios get":
      return result((await api.request(`/studios/${payload.slug}`)).body);
    case "games list":
      return result(
        (
          await api.request(
            `/games?${new URLSearchParams(Object.entries(payload).map(([key, value]) => [key, String(value)]))}`,
          )
        ).body,
      );
    case "games get":
      return result((await api.request(`/items/games/${payload.slug}`)).body);
    case "outlets create":
      return result(
        (await api.request("/stores", { method: "POST", body: payload })).body,
      );
    case "outlets list":
      return result((await api.request("/stores")).body);
    case "outlets get":
    case "outlets preview": {
      const outlet = (await api.request(`/stores/${payload.slug}?preview=1`))
        .body;
      return result({
        ...outlet,
        preview_url: `${origin}/store/${payload.slug}?preview=1`,
      });
    }
    case "outlets readiness":
      return result(
        (await api.request(`/stores/${payload.slug}/publication`)).body,
      );
    case "outlets update": {
      const { slug, expected_draft_revision, ...body } = payload;
      return result(
        (
          await api.request(`/stores/${slug}`, {
            method: "PATCH",
            body,
            revision: Number(expected_draft_revision),
          })
        ).body,
      );
    }
    case "outlets catalog mode":
    case "outlets catalog set":
    case "outlets featured set": {
      const { slug, ...body } = payload;
      const route =
        name === "outlets catalog mode"
          ? "curation-catalog/mode"
          : name === "outlets catalog set"
            ? "selection"
            : "featured";
      const response = await api.request(`/stores/${slug}/${route}`, {
        method: name === "outlets catalog mode" ? "POST" : "PUT",
        body,
      });
      const completed = await completeOutletChange(
        String(slug),
        response.body,
        api,
      );
      return result(completed.data, { next_action: completed.next_action });
    }
    case "outlets publish": {
      const publication = (
        await api.request(`/stores/${payload.slug}/publication`)
      ).body;
      if (publication.draft_revision !== payload.expected_draft_revision)
        throw new CliError(
          "REVISION_CONFLICT",
          "O rascunho mudou. Consulte outlets readiness novamente.",
          1,
          { actual_draft_revision: publication.draft_revision },
          false,
          409,
        );
      const readiness = publication.readiness as
        | { ready?: boolean }
        | undefined;
      if (!readiness?.ready)
        throw new CliError(
          "PUBLICATION_BLOCKED",
          "O outlet ainda não está pronto para publicação.",
          1,
          publication.readiness,
        );
      const response = await api.request(
        `/stores/${payload.slug}/publication`,
        {
          method: "POST",
          body: storePublicationActionSchema.parse({
            action: "publish",
            expected_draft_revision: payload.expected_draft_revision,
          }),
        },
      );
      return result({
        ...response.body,
        public_url: `${origin}/store/${payload.slug}`,
      });
    }
  }
  const importGame = async (
    input: ImportReference,
    status = false,
    operationId?: string,
  ): Promise<Outcome> => {
    const normalized = normalizeImport(input);
    const query = () => {
      const search = new URLSearchParams(
        Object.entries(normalized.body).map(([key, value]) => [
          key,
          String(value),
        ]),
      );
      if (operationId) search.set("operation_id", operationId);
      return `${normalized.endpoint}?${search}`;
    };
    let response = await api.request(
      status ? query() : normalized.endpoint,
      status ? {} : { method: "POST", body: normalized.body },
    );
    const deadline = now() + timeout * 1000;
    while (true) {
      const refresh = response.body.refresh as
        | { state?: string; operation_id?: string; message?: string }
        | undefined;
      operationId = refresh?.operation_id ?? operationId;
      const data = {
        ...response.body,
        provider: input.provider,
        reference: normalized.reference,
        original_reference: normalized.original_reference,
        operation_id: operationId,
      };
      const next_action = {
        command: "games import status",
        provider: input.provider,
        reference: normalized.reference,
        operation_id: operationId,
      };
      await deps.checkpoint?.(
        data,
        refresh?.state === "in_progress" ? next_action : null,
      );
      if (refresh?.state === "failed")
        throw new CliError(
          "IMPORT_FAILED",
          refresh.message ?? "A importação falhou.",
          1,
          data,
          true,
        );
      if (refresh?.state !== "in_progress") {
        if (typeof response.body.slug !== "string")
          throw new CliError(
            "GAME_UNAVAILABLE",
            "O jogo não está disponível no catálogo.",
            1,
            data,
          );
        return result(data);
      }
      if (!options.wait || now() >= deadline)
        return result(data, {
          state: "pending",
          next_action,
          exitCode: options.wait ? 3 : 0,
        });
      deps.progress?.(`Importação ${input.provider} em processamento.`);
      const retry = response.headers.get("retry-after");
      const milliseconds =
        retry && /^\d+$/.test(retry)
          ? Number(retry) * 1000
          : retry && Number.isFinite(Date.parse(retry))
            ? Math.max(0, Date.parse(retry) - now())
            : 2000;
      await pause(
        Math.min(Math.max(500, milliseconds), Math.max(0, deadline - now())),
      );
      if (now() >= deadline)
        return result(data, { state: "pending", next_action, exitCode: 3 });
      try {
        response = await api.request(query());
      } catch (error) {
        const failure = asCliError(error);
        failure.details = { failure: failure.details, ...next_action };
        throw failure;
      }
    }
  };
  if (name === "games import steam" || name === "games import nintendo")
    return importGame({
      provider: name.endsWith("steam") ? "steam" : "nintendo",
      reference: String(payload.reference),
    });
  if (name === "games import status")
    return importGame(
      payload as ImportReference,
      true,
      payload.operation_id as string | undefined,
    );
  if (name === "games import batch") {
    const games = (payload.games as ImportReference[]).map(normalizeImport);
    const outcomes: unknown[] = [];
    let failures = 0,
      pending = 0;
    for (const [index, game] of games.entries()) {
      deps.progress?.(
        `Importando ${index + 1}/${games.length} (${game.provider}).`,
      );
      try {
        const outcome = await importGame(game);
        if (outcome.state === "pending") pending++;
        outcomes.push(outcome);
      } catch (error) {
        failures++;
        const failure = asCliError(error);
        outcomes.push({
          state: "failed",
          provider: game.provider,
          reference: game.reference,
          original_reference: game.original_reference,
          error: {
            code: failure.code,
            message: failure.message,
            retryable: failure.retryable,
            details: failure.details,
          },
        });
      }
    }
    return result(
      { results: outcomes, failed: failures, pending },
      {
        state: failures ? "partial" : pending ? "pending" : "completed",
        exitCode: failures ? 1 : options.wait && pending ? 3 : 0,
      },
    );
  }
  return invalid("Comando não implementado.");
}
