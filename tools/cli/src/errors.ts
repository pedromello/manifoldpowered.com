export class CliError extends Error {
  constructor(
    public code: string,
    message: string,
    public exitCode = 1,
    public details?: unknown,
    public retryable = false,
    public httpStatus?: number,
  ) {
    super(message);
  }
}
export function invalid(message: string, details?: unknown): never {
  throw new CliError("INVALID_INPUT", message, 2, details);
}
export function asCliError(error: unknown): CliError {
  if (error instanceof CliError) return error;
  // Native/network errors may contain credentials or local paths.
  return new CliError("CLI_ERROR", "Não foi possível concluir o comando.");
}
const secretKey =
  /^(?:password|code|token|session_id|session_token|cookie|set-cookie|authorization|activation_url|activation_id|secret|credentials?|.*_token)$/i;
export function sanitize(
  value: unknown,
  secrets: readonly string[] = [],
): unknown {
  if (typeof value === "string") {
    let clean = value
      .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
      .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "");
    for (const secret of secrets)
      if (secret) clean = clean.split(secret).join("[REDACTED]");
    return clean.replace(
      /https?:\/\/\S*\/signup\/activate\/\S+/g,
      "[REDACTED]",
    );
  }
  if (Array.isArray(value)) return value.map((item) => sanitize(item, secrets));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key, item]) => {
          if (!secretKey.test(key)) return true;
          if (
            key === "code" &&
            typeof item === "string" &&
            /^[A-Z][A-Z0-9_]+$/.test(item)
          )
            return true;
          // JSON Schema property definitions describe secrets without containing them.
          return (
            !!item &&
            typeof item === "object" &&
            !Array.isArray(item) &&
            ["type", "anyOf", "oneOf", "$ref"].some((field) => field in item)
          );
        })
        .map(([key, item]) => [key, sanitize(item, secrets)]),
    );
  return value;
}
