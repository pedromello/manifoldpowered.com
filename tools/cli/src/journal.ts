import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { State, type Environment } from "./state";
import { sanitize, CliError } from "./errors";

export type Execution = {
  execution_id: string;
  command: string;
  environment: Environment;
  origin: string;
  account: string;
  started_at: string;
  updated_at: string;
  state: string;
  // Deliberately omit inputs, emails, passwords, content bodies and session responses.
  resources?: Record<string, unknown>[];
  next_actions?: Record<string, unknown>[];
  error?: { code: string; mutation_outcome?: string };
};
function id(value: string) {
  if (!z.uuid().safeParse(value).success)
    throw new CliError("INVALID_INPUT", "execution_id inválido.", 2);
  return value;
}
export async function recordExecution(state: State, entry: Execution) {
  await state.write(`runs/${id(entry.execution_id)}.json`, entry);
}
export async function getExecution(state: State, executionId: string) {
  const entry = await state.read<Execution | null>(
    `runs/${id(executionId)}.json`,
    null,
  );
  if (!entry || entry.execution_id !== executionId)
    throw new CliError(
      "RUN_NOT_FOUND",
      "Execução não encontrada neste perfil.",
    );
  return entry;
}
export async function listExecutions(
  state: State,
  env: Environment,
  origin: string,
  account: string | null,
  limit: number,
) {
  const files = await readdir(join(state.directory, "runs")).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [];
      throw error;
    },
  );
  const entries = await Promise.all(
    files
      .filter(
        (file) =>
          z.uuid().safeParse(file.slice(0, -5)).success &&
          file.endsWith(".json"),
      )
      .map((file) => getExecution(state, file.slice(0, -5))),
  );
  return entries
    .filter(
      (entry) =>
        entry.environment === env &&
        entry.origin === origin &&
        entry.account === account,
    )
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
    .slice(0, limit);
}
export function summarizeExecution(
  data: unknown,
  nextAction: unknown,
  secrets: string[],
) {
  const resources: Record<string, unknown>[] = [],
    next_actions: Record<string, unknown>[] = [];
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const record = value as Record<string, unknown>;
    const resource = Object.fromEntries(
      [
        "slug",
        "game_slug",
        "selection_slug",
        "id",
        "operation_id",
        "public_url",
        "preview_url",
        "draft_revision",
        "provider",
        "reference",
        "state",
        "batch_id",
        "affiliate_link_id",
        "resource_status",
      ]
        .filter(
          (key) =>
            record[key] !== undefined &&
            ["string", "number"].includes(typeof record[key]),
        )
        .map((key) => [key, record[key]]),
    );
    const refresh = record.refresh as { state?: string } | undefined;
    if (typeof refresh?.state === "string") resource.state = refresh.state;
    if (
      Object.keys(resource).some((key) =>
        ["slug", "id", "operation_id", "public_url", "batch_id"].includes(key),
      )
    )
      resources.push(resource);
    if (
      record.command === "games import status" &&
      ["steam", "nintendo"].includes(String(record.provider)) &&
      typeof record.reference === "string"
    ) {
      next_actions.push(
        Object.fromEntries(
          ["command", "provider", "reference", "operation_id"]
            .filter((key) => record[key] !== undefined)
            .map((key) => [key, record[key]]),
        ),
      );
    }
    for (const key of [
      "results",
      "data",
      "next_action",
      "failure",
      "selection",
      "selections",
    ])
      visit(record[key]);
  };
  visit(data);
  visit(nextAction);
  return sanitize({ resources, next_actions }, secrets) as {
    resources: Record<string, unknown>[];
    next_actions: Record<string, unknown>[];
  };
}
export function mergeExecutionSummary(
  previous: Execution,
  next: ReturnType<typeof summarizeExecution>,
) {
  const resourceKey = (entry: Record<string, unknown>) =>
    entry.affiliate_link_id
      ? `${entry.slug ?? ""}/affiliate/${entry.affiliate_link_id}`
      : entry.provider && entry.reference
        ? `${entry.provider}:${entry.reference}`
        : String(
            entry.slug
              ? `${entry.slug}${entry.game_slug ? `/${entry.game_slug}` : ""}`
              : (entry.id ??
                  entry.public_url ??
                  entry.operation_id ??
                  entry.batch_id),
          );
  const resources = new Map(
    (previous.resources ?? []).map((entry) => [resourceKey(entry), entry]),
  );
  for (const entry of next.resources)
    resources.set(resourceKey(entry), {
      ...resources.get(resourceKey(entry)),
      ...entry,
    });
  const actions = new Map(
    (previous.next_actions ?? []).map((entry) => [resourceKey(entry), entry]),
  );
  for (const entry of next.next_actions) actions.set(resourceKey(entry), entry);
  for (const entry of resources.values())
    if (
      entry.provider &&
      entry.reference &&
      entry.state &&
      entry.state !== "in_progress"
    )
      actions.delete(resourceKey(entry));
  return {
    resources: [...resources.values()],
    next_actions: [...actions.values()],
  };
}
