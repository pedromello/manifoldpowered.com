import {
  requestExternalImport,
  externalImportErrorMessage,
} from "lib/external_import_client";
import type { ExternalRefreshInfo } from "lib/external_refresh";
export type { ExternalImportResponse as NintendoImportResponse } from "lib/external_import_client";
export const nintendoImportErrorMessage = (error: unknown) =>
  externalImportErrorMessage(error, "nintendo");
export function requestNintendoImport(
  url: string,
  locale: string,
  progress: (info: ExternalRefreshInfo) => void,
  signal: AbortSignal,
) {
  return requestExternalImport("nintendo", url, locale, progress, signal);
}
