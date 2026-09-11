import type { ExternalRefreshInfo } from "lib/external_refresh";
import {
  externalImportStatusUrl,
  getExternalStore,
  type ExternalStoreProvider,
} from "lib/external_stores";

export interface ExternalImportResponse {
  slug?: string;
  message?: string;
  refresh?: ExternalRefreshInfo | null;
}

export function externalImportErrorMessage(
  error: unknown,
  provider: ExternalStoreProvider,
) {
  const isError = error instanceof Error || error instanceof DOMException;
  if (isError && error.name === "TimeoutError")
    return "The update is still pending. Try again shortly.";
  return isError ? error.message : getExternalStore(provider).messages.failure;
}

export async function requestExternalImport(
  provider: ExternalStoreProvider,
  value: string,
  locale: string,
  progress: (info: ExternalRefreshInfo) => void,
  signal: AbortSignal,
) {
  const store = getExternalStore(provider);
  const fallback = store.messages.failure;
  const deadline = Date.now() + 30000;
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(30000)]);
  let response = await fetch(
    `${store.endpoint}?locale=${encodeURIComponent(locale)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [store.requestField]: value }),
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
      externalImportStatusUrl(provider, value, {
        operationId: body.refresh.operation_id,
        locale,
      }),
      { signal: requestSignal },
    );
  }
}
