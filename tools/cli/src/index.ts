import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { commands, globalOptions, parseOptions } from "./registry";
import { execute, type Dependencies, type Options } from "./engine";
import { asCliError, invalid, sanitize } from "./errors";
import { bannerEnabled, renderBanner } from "./brand";
import { State, environment, alias } from "./state";
import { getProfile, profileState } from "./profiles";
import {
  recordExecution,
  summarizeExecution,
  mergeExecutionSummary,
  type Execution,
} from "./journal";

export const CLI_VERSION = "1.0.0";
export type IO = {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  stdin: () => Promise<string>;
  stdoutTTY: boolean;
  stderrTTY: boolean;
  columns: number;
  colorDepth: number;
  env: Readonly<Record<string, string | undefined>>;
};
async function stdin() {
  let text = "";
  for await (const chunk of process.stdin) {
    text += chunk;
    if (Buffer.byteLength(text) > 1024 * 1024)
      invalid("A entrada excede 1 MiB.");
  }
  return text;
}
const defaultIO: IO = {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  stdin,
  stdoutTTY: !!process.stdout.isTTY,
  stderrTTY: !!process.stderr.isTTY,
  columns: process.stderr.columns || 80,
  colorDepth: process.stderr.getColorDepth?.() ?? 1,
  env: process.env,
};
function help(prefix = "") {
  return (
    "Manifold CLI — operação por contas e ambientes\n\n" +
    Object.entries(commands)
      .filter(([name]) => name.startsWith(prefix))
      .map(([name, command]) => `  ${name.padEnd(25)} ${command.description}`)
      .join("\n") +
    "\n\nInício: env connect --env local\nAlterações: --env local|hml|prod --account ALIAS\nEntrada: --input arquivo.json ou --input - (stdin)\nSegredos: somente JSON por stdin; nunca por flags ou arquivo.\nDescoberta: schema outlets create --json\nAutomação: --json --no-banner\n"
  );
}
function startupGuide() {
  return (
    "Conecte: manifold env connect --env local|hml|prod\n" +
    "Agentes: profiles create --name NOME --env AMBIENTE --account CONTA\n" +
    "Operação: --profile NOME --json\n" +
    "Descubra os comandos: manifold --help\n" +
    "Contrato de entrada: manifold schema outlets create --json\n"
  );
}
function flagValue(key: string, value: string | boolean): unknown {
  if (typeof value === "boolean") return value;
  if (["page", "limit", "expected_draft_revision"].includes(key))
    return Number(value);
  if (
    [
      "recommendations",
      "games",
      "social_links",
      "brand_tokens",
      "rating",
      "mapping",
    ].includes(key)
  ) {
    try {
      return JSON.parse(value);
    } catch {
      return invalid(`--${key.replaceAll("_", "-")} exige JSON válido.`);
    }
  }
  if (["game_slugs", "tags"].includes(key)) {
    try {
      return value.startsWith("[")
        ? JSON.parse(value)
        : value
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
    } catch {
      return invalid(`--${key.replaceAll("_", "-")} exige uma lista válida.`);
    }
  }
  return value === "null" &&
    [
      "description",
      "logo_url",
      "layout_preset",
      "tagline",
      "cover_url",
      "headline",
    ].includes(key)
    ? null
    : value;
}
export async function run(
  argv: string[],
  io: IO = defaultIO,
  deps: Dependencies = {},
): Promise<number> {
  const secrets: string[] = [];
  let name = "help",
    env: string | null = null,
    account: string | null = null;
  const json = argv.includes("--json");
  let profile: string | null = null,
    execution: Execution | undefined,
    executionState: State | undefined;
  const emit = (value: unknown) =>
    io.stdout(JSON.stringify(sanitize(value, secrets)) + "\n");
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      options: parseOptions,
      allowPositionals: true,
      strict: true,
    });
    let state = deps.state ?? new State();
    const prefix = positionals.join(" ");
    name = prefix || "help";
    if (values.profile) {
      if (name.startsWith("profiles "))
        invalid("profiles gerencia definições na raiz; omita --profile.");
      const binding = await getProfile(state, values.profile);
      if (
        (values.env && values.env !== binding.environment) ||
        (values.account && values.account !== binding.account)
      )
        invalid("--env ou --account não corresponde ao perfil.");
      profile = binding.name;
      state = profileState(state, binding);
    }
    const selected = await state
      .read<{ env?: string }>("selection-env.json", {})
      .catch(() => ({}) as { env?: string });
    env =
      values.env ??
      state.fixedContext?.environment ??
      (selected.env && ["local", "hml", "prod"].includes(selected.env)
        ? selected.env
        : null);
    account = values.account ?? state.fixedContext?.account ?? null;
    if (values.version) {
      if (json)
        emit({
          contract_version: 1,
          cli_version: CLI_VERSION,
          command: "version",
          environment: env,
          account,
          state: "completed",
          data: { version: CLI_VERSION },
        });
      else io.stdout(`${CLI_VERSION}\n`);
      return 0;
    }
    if (
      bannerEnabled({
        json,
        noBanner: !!values["no-banner"],
        stdoutTTY: io.stdoutTTY,
        stderrTTY: io.stderrTTY,
      })
    )
      io.stderr(
        renderBanner({
          columns: io.columns,
          colorDepth: io.colorDepth,
          noColor: io.env.NO_COLOR !== undefined,
          dumb: io.env.TERM === "dumb",
          version: CLI_VERSION,
          environment:
            env && ["local", "hml", "prod"].includes(env) ? env : undefined,
        }),
      );
    if (!positionals.length || values.help) {
      const content =
        !positionals.length && !values.help ? startupGuide() : help(prefix);
      if (json)
        emit({
          contract_version: 1,
          cli_version: CLI_VERSION,
          command: "help",
          environment: env,
          account,
          state: "completed",
          data: {
            commands: Object.entries(commands)
              .filter(([command]) => command.startsWith(prefix))
              .map(([command, value]) => ({
                command,
                description: value.description,
              })),
            help: content,
          },
        });
      else io.stdout(content);
      return 0;
    }
    if (positionals[0] === "schema") {
      const commandName = positionals.slice(1).join(" ");
      const command = commands[commandName];
      if (!command) invalid("Informe um comando válido após schema.");
      emit({
        contract_version: 1,
        cli_version: CLI_VERSION,
        command: "schema",
        environment: env,
        account,
        state: "completed",
        data: {
          command: commandName,
          description: command.description,
          requires_explicit_context: !!command.mutation,
          authenticated: !!command.authenticated,
          stdin_only_fields: command.secrets ?? [],
          input: z.toJSONSchema(command.schema, {
            io: "input",
            unrepresentable: "any",
          }),
          global_options: Object.keys(globalOptions),
        },
      });
      return 0;
    }
    const command = commands[name];
    if (!command) invalid("Comando desconhecido. Consulte --help.");
    let payload: Record<string, unknown> = {};
    if (values.input) {
      let text: string;
      if (values.input === "-") text = await io.stdin();
      else {
        try {
          text = await readFile(values.input, "utf8");
        } catch {
          return invalid("Não foi possível ler --input.");
        }
      }
      if (Buffer.byteLength(text) > 1024 * 1024)
        invalid("A entrada excede 1 MiB.");
      try {
        payload = JSON.parse(text);
      } catch {
        return invalid("--input deve conter JSON válido.");
      }
      if (!payload || typeof payload !== "object" || Array.isArray(payload))
        invalid("--input deve conter um objeto JSON.");
      for (const field of command.secrets ?? [])
        if (payload[field] != null) {
          if (typeof payload[field] === "string") secrets.push(payload[field]);
          if (values.input !== "-")
            invalid("Segredos devem ser fornecidos por stdin (--input -).");
        }
    }
    for (const [option, value] of Object.entries(values)) {
      if (option in globalOptions || value === undefined) continue;
      let key = option.replaceAll("-", "_");
      if (key === "revision") key = "expected_draft_revision";
      if (
        name.startsWith("games import") &&
        (key === "app_id" || key === "url")
      )
        key = "reference";
      if (
        key === "tags" &&
        ["games list", "outlets catalog public"].includes(name)
      )
        payload[key] = value;
      else if (["palette", "typography", "shape"].includes(key))
        payload.brand_tokens = {
          ...(payload.brand_tokens as Record<string, unknown> | undefined),
          [key]: value,
        };
      else payload[key] = flagValue(key, value);
    }
    const options: Options = {
      env: values.env ?? state.fixedContext?.environment,
      account: values.account ?? state.fixedContext?.account,
      wait: values.wait,
      timeout:
        values.timeout === undefined ? undefined : Number(values.timeout),
      mailcatcher: values.mailcatcher,
      locale: values.locale,
    };
    if (options.locale && !["pt-BR", "en"].includes(options.locale))
      invalid("--locale aceita pt-BR ou en.");
    const parsed = command.schema.safeParse(payload);
    if (!parsed.success)
      invalid(
        "Entrada inválida. Consulte schema para os campos aceitos.",
        parsed.error.issues.map(({ path, message }) => ({ path, message })),
      );
    if (
      command.mutation &&
      !["auth ", "users ", "profiles "].some((prefix) =>
        name.startsWith(prefix),
      )
    ) {
      if (!options.env || !options.account)
        invalid(
          "Alterações exigem --env e --account explícitos, ou --profile vinculado.",
        );
      const boundEnv = environment(options.env);
      executionState = state;
      execution = {
        execution_id: crypto.randomUUID(),
        command: name,
        environment: boundEnv,
        origin: await state.origin(boundEnv),
        account: alias(options.account),
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        state: "started",
      };
      await recordExecution(state, execution);
    }
    const outcome = await execute(name, payload, options, {
      ...deps,
      state,
      secrets,
      checkpoint: async (data, nextAction) => {
        if (execution && executionState) {
          const summary = mergeExecutionSummary(
            execution,
            summarizeExecution(data, nextAction, secrets),
          );
          execution = {
            ...execution,
            ...summary,
            updated_at: new Date().toISOString(),
            state: summary.next_actions.length ? "pending" : "started",
          };
          await recordExecution(executionState, execution).catch(() =>
            io.stderr(
              "O checkpoint não pôde ser salvo; consulte os recursos antes de repetir.\n",
            ),
          );
        }
        await deps.checkpoint?.(data, nextAction);
      },
      progress: (message) =>
        io.stderr(String(sanitize(message, secrets)) + "\n"),
    });
    const envelope = {
      contract_version: 1,
      cli_version: CLI_VERSION,
      command: name,
      environment: outcome.environment,
      account: outcome.account,
      state: outcome.state,
      data: outcome.data,
      error: null,
      next_action: outcome.next_action ?? null,
      profile,
      execution_id: execution?.execution_id ?? null,
    };
    if (execution && executionState) {
      const summary = mergeExecutionSummary(
        execution,
        summarizeExecution(outcome.data, outcome.next_action, secrets),
      );
      await recordExecution(executionState, {
        ...execution,
        ...summary,
        state: outcome.state,
        updated_at: new Date().toISOString(),
      }).catch(() => {
        io.stderr(
          "A ação retornou resultado, mas o registro final não pôde ser atualizado. Consulte os recursos antes de repetir.\n",
        );
      });
    }
    if (json) emit(envelope);
    else io.stdout(JSON.stringify(sanitize(envelope, secrets), null, 2) + "\n");
    return outcome.exitCode ?? 0;
  } catch (error) {
    const failure = (error as { code?: string }).code?.startsWith(
      "ERR_PARSE_ARGS",
    )
      ? {
          code: "INVALID_INPUT",
          message:
            "Opção inválida. Consulte --help; segredos devem entrar por stdin.",
          exitCode: 2,
          retryable: false,
          details: undefined,
          httpStatus: undefined,
        }
      : asCliError(error);
    const envelope = {
      contract_version: 1,
      cli_version: CLI_VERSION,
      command: name,
      environment: env,
      account,
      state: "failed",
      data: null,
      error: {
        code: failure.code,
        message: failure.message,
        retryable: failure.retryable,
        http_status: failure.httpStatus,
        details: failure.details,
      },
      next_action: null,
      profile,
      execution_id: execution?.execution_id ?? null,
    };
    if (execution && executionState) {
      await recordExecution(executionState, {
        ...execution,
        state: "failed",
        updated_at: new Date().toISOString(),
        error: {
          code: failure.code,
          mutation_outcome: (
            failure.details as { mutation_outcome?: string } | undefined
          )?.mutation_outcome,
        },
        ...mergeExecutionSummary(
          execution,
          summarizeExecution(failure.details, null, secrets),
        ),
      }).catch(() => undefined);
    }
    if (json) emit(envelope);
    else io.stdout(JSON.stringify(sanitize(envelope, secrets), null, 2) + "\n");
    return failure.exitCode;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  void run(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  });
