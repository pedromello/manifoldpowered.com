import {
  selectionLibraryQuerySchema,
  type SelectionLibraryQuery,
  type SelectionSummary,
} from "contracts/outlet-selections";

export function selectionLibraryPath(
  storeSlug: string,
  query: Partial<SelectionLibraryQuery> = {},
  preview = false,
) {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.order && query.order !== "newest") params.set("order", query.order);
  if (query.page && query.page !== 1) params.set("page", String(query.page));
  if (preview) params.set("preview", "1");
  const suffix = params.size ? `?${params}` : "";
  return `/store/${encodeURIComponent(storeSlug)}/selections${suffix}`;
}

export function selectionLibraryItemPath(
  selection: SelectionSummary,
  query: SelectionLibraryQuery,
  preview = false,
) {
  const params = new URLSearchParams({ source: "selections" });
  if (query.q) params.set("library_q", query.q);
  params.set("library_order", query.order);
  params.set("library_page", String(query.page));
  if (preview) params.set("preview", "1");
  return `${selection.public_path}?${params}`;
}

export function selectionLibraryReturnPath(
  storeSlug: string,
  selectionSlug: string,
  query: Record<string, string | string[] | undefined>,
  preview: boolean,
) {
  if (query.source !== "selections") return undefined;
  const result = selectionLibraryQuerySchema.safeParse({
    q: query.library_q,
    order: query.library_order,
    page: query.library_page,
  });
  if (!result.success) return undefined;
  return `${selectionLibraryPath(storeSlug, result.data, preview)}#selection-${encodeURIComponent(selectionSlug)}`;
}
