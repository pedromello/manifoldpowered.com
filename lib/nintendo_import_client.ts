import type { NintendoRefreshInfo } from "lib/nintendo_refresh";

export interface NintendoImportResponse {
  slug?: string;
  message?: string;
  refresh?: NintendoRefreshInfo | null;
}

export function nintendoImportErrorMessage(error: unknown) {
  if (error instanceof Error && error.name === "TimeoutError")
    return "The update is still pending. Try again shortly.";
  return error instanceof Error ? error.message : "Nintendo import failed.";
}

export async function requestNintendoImport(
  url: string,
  locale: string,
  progress: (info: NintendoRefreshInfo) => void,
  signal: AbortSignal,
) {
  const deadline = Date.now() + 30000;
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(30000)]);
  let response = await fetch(
    `/api/v1/items/games/nintendo-import?locale=${locale}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eshop_url: url }),
      signal: requestSignal,
    },
  );
  while (true) {
    const body: NintendoImportResponse = await response.json();
    if (!response.ok)
      throw new Error(body.message || "Nintendo import failed.");
    if (body.refresh) progress(body.refresh);
    if (body.refresh?.state === "failed")
      throw new Error(body.refresh.message || "Nintendo import failed.");
    if (body.refresh?.state !== "in_progress") {
      if (!body.slug)
        throw new Error(body.message || "Nintendo import failed.");
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
      `/api/v1/items/games/nintendo-import?operation_id=${encodeURIComponent(body.refresh.operation_id)}&eshop_url=${encodeURIComponent(url)}&locale=${locale}`,
      { signal: requestSignal },
    );
  }
}
