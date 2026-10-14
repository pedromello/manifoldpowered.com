import { CliError } from "./errors";
export type ApiResponse = {
  body: Record<string, unknown>;
  status: number;
  headers: Headers;
};
export class ApiClient {
  constructor(
    public origin: string,
    public token: string | null = null,
    private requestFetch: typeof fetch = fetch,
    public locale = "pt-BR",
  ) {}
  async request(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      anonymous?: boolean;
      revision?: number;
      signal?: AbortSignal;
      arrayResponse?: boolean;
    } = {},
  ): Promise<ApiResponse> {
    const mutation = options.method !== undefined && options.method !== "GET";
    const url = new URL(`/api/v1${path}`, this.origin);
    if (url.origin !== this.origin || !url.pathname.startsWith("/api/v1/"))
      throw new CliError("INVALID_ROUTE", "Rota da API inválida.", 2);
    if (!url.searchParams.has("locale"))
      url.searchParams.set("locale", this.locale);
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Accept-Language": this.locale,
      "User-Agent": "Manifold-CLI/1.0.0",
    };
    if (options.body !== undefined)
      headers["Content-Type"] = "application/json";
    if (this.token && !options.anonymous)
      headers.Cookie = `session_id=${this.token}`;
    if (options.revision !== undefined)
      headers["If-Match"] = `"${options.revision}"`;
    let response: Response;
    try {
      response = await this.requestFetch(url, {
        method: options.method ?? "GET",
        headers,
        body:
          options.body === undefined ? undefined : JSON.stringify(options.body),
        redirect: "manual",
        signal: options.signal ?? AbortSignal.timeout(15000),
      });
    } catch {
      throw new CliError(
        "NETWORK_ERROR",
        "A API não respondeu. Verifique o ambiente e consulte o recurso antes de tentar novamente.",
        1,
        mutation ? { mutation_outcome: "unknown" } : undefined,
        !mutation,
      );
    }
    if (response.status >= 300 && response.status < 400)
      throw new CliError(
        "REDIRECT_REJECTED",
        "A API tentou redirecionar a requisição. Configure a origem final do ambiente.",
        1,
        mutation ? { mutation_outcome: "unknown" } : undefined,
      );
    let body: Record<string, unknown>;
    try {
      const parsed: unknown = await response.json();
      body =
        options.arrayResponse && Array.isArray(parsed)
          ? { items: parsed }
          : (parsed as Record<string, unknown>);
    } catch {
      throw new CliError(
        "INVALID_API_RESPONSE",
        "A API não retornou JSON compatível.",
        1,
        mutation ? { mutation_outcome: "unknown" } : undefined,
        false,
        response.status,
      );
    }
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new CliError("INVALID_API_RESPONSE", "Resposta inesperada da API.");
    if (response.ok && options.arrayResponse && !Array.isArray(body.items))
      throw new CliError(
        "INVALID_API_RESPONSE",
        "A API não retornou a lista esperada.",
      );
    if (!response.ok) {
      const code =
        (
          {
            400: "VALIDATION_ERROR",
            401: "SESSION_EXPIRED",
            403: "FORBIDDEN",
            404: "NOT_FOUND",
            409: "REVISION_CONFLICT",
            412: "PRECONDITION_FAILED",
            429: "RATE_LIMITED",
          } as Record<number, string>
        )[response.status] ?? "API_ERROR";
      throw new CliError(
        code,
        mutation && response.status === 412
          ? "A resposta de pré-condição não confirmou a alteração. Consulte o rascunho antes de repetir."
          : typeof body.message === "string"
            ? body.message
            : "A API recusou o comando.",
        1,
        {
          context: response.status >= 500 ? undefined : body.context,
          action: body.action,
          retry_after: response.headers.get("retry-after"),
          mutation_outcome:
            mutation && (response.status >= 500 || response.status === 412)
              ? "unknown"
              : undefined,
          next_command:
            mutation && response.status === 412 ? "outlets get" : undefined,
        },
        response.status === 429 || (!mutation && response.status >= 500),
        response.status,
      );
    }
    return { body, status: response.status, headers: response.headers };
  }
}
export function sessionToken(response: ApiResponse): string {
  const session = response.body.session as Record<string, unknown> | undefined;
  const token =
    response.body.token ??
    session?.token ??
    /(?:^|[,;]\s*)session_id=([^;,\s]+)/.exec(
      response.headers.get("set-cookie") ?? "",
    )?.[1];
  if (typeof token !== "string" || !/^[a-f0-9]{96}$/.test(token))
    throw new CliError(
      "INVALID_API_RESPONSE",
      "A API não emitiu uma sessão válida.",
    );
  return token;
}
