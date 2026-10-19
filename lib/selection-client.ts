import type { SelectionSummary } from "contracts/outlet-selections";
import type { GameApi, StoreApi } from "components/store/types";

export type SelectionPageApi = {
  selection: SelectionSummary;
  outlet: Pick<
    StoreApi,
    "id" | "slug" | "name" | "logo_url" | "brand_tokens" | "theme_key"
  >;
  games: GameApi[];
  currency: string;
};

export async function selectionRequest<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.message || "Could not load the selection.");
  return body as T;
}
