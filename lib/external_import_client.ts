import type { ExternalRefreshInfo } from "lib/external_refresh";

export interface ExternalImportResponse {
  slug?: string;
  message?: string;
  refresh?: ExternalRefreshInfo | null;
}

export function externalImportErrorMessage(
  error: unknown,
  provider: "nintendo" | "steam",
) {
  if (error instanceof Error && error.name === "TimeoutError")
    return "The update is still pending. Try again shortly.";
  return error instanceof Error
    ? error.message
    : provider === "steam"
      ? "Steam import failed."
      : "Nintendo import failed.";
}

export async function requestExternalImport(
  provider: "nintendo" | "steam",
  value: string,
  locale: string,
  progress: (info: ExternalRefreshInfo) => void,
  signal: AbortSignal,
) {
  const parameter = provider === "steam" ? "steam_app_id" : "eshop_url";
  const fallback =
    provider === "steam" ? "Steam import failed." : "Nintendo import failed.";
  const deadline = Date.now() + 30000;
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(30000)]);
  let response = await fetch(
    `/api/v1/items/games/${provider}-import?locale=${locale}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [parameter]: value }),
      signal: requestSignal,
    },
  );
  while (true) {
    const body: ExternalImportResponse = await response.json();
    if (!response.ok) throw new Error(body.message || fallback);
    if (body.refresh) progress(body.refresh);
    if (body.refresh?.state === "failed")
      throw new Error(body.refresh.message || fallback);
    if (body.refresh?.state !== "in_progress") {
      if (!body.slug) throw new Error(body.message || fallback);
      return body;
    }
    if (Date.now() + 2500 >= deadline)
      throw new Error("The update is still pending. Try again shortly.");
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer);
        reject(new Error("The update is still pending. Try again shortly."));
      };
      const timer = setTimeout(
        () => {
          requestSignal.removeEventListener("abort", abort);
          resolve();
        },
        2000 + Math.random() * 500,
      );
      if (requestSignal.aborted) abort();
      else requestSignal.addEventListener("abort", abort, { once: true });
    });
    response = await fetch(
      `/api/v1/items/games/${provider}-import?operation_id=${encodeURIComponent(body.refresh.operation_id)}&${parameter}=${encodeURIComponent(value)}&locale=${locale}`,
      { signal: requestSignal },
    );
  }
}
