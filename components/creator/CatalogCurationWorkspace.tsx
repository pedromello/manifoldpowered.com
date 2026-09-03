import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import {
  Check,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  Flame,
  Loader2,
  MessageSquareText,
  Pin,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import { Pagination, type PaginationApi } from "components/Pagination";
import type { GameApi } from "components/store/types";
import { useI18n } from "lib/i18n";
import { revalidateOutletDraftCaches } from "lib/outlet-draft-cache";
import { formatCatalogPrice } from "lib/price";
import { itemHref } from "lib/store-context";

type CatalogMode = "UNDECIDED" | "ALL" | "SELECTED";
type CatalogStatus =
  | "ALL"
  | "IN_OUTLET"
  | "OUTSIDE_OUTLET"
  | "EDITORIAL"
  | "NEW_RELEASES"
  | "BEST_SELLERS";
type BulkAction = "SHOW" | "HIDE" | "PIN_SHOW";
type CatalogOrder = "TITLE_ASC" | "NEWEST" | "BEST_SELLING";

type CurationGame = GameApi & {
  in_outlet: boolean;
  visibility_source: "ALWAYS_VISIBLE" | "HIDDEN_MANUALLY" | "RULE_OR_CATALOG";
  is_editorial: boolean;
  editorial_position: number | null;
  sales_count: number;
  is_new_release: boolean;
};

type CatalogResponse = {
  games: CurationGame[];
  pagination: PaginationApi;
  currency: string;
  catalog_mode: CatalogMode;
  draft_revision: number;
  totals: {
    all: number;
    in_outlet: number;
    outside_outlet: number;
    editorial: number;
    new_releases: number;
    best_sellers: number;
  };
  facets: Array<{ tag: string; count: number }>;
  readiness: {
    result_count: number;
    minimum_count: number;
    has_minimum_catalog: boolean;
    featured_count: number;
    featured_outside_count: number;
    featured_inside: boolean;
    ready: boolean;
  };
};

type Feedback = {
  tone: "success" | "error" | "neutral";
  message: string;
  batchId?: string;
};

const PAGE_SIZE = 12;

async function fetcher(url: string) {
  const response = await fetch(url);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.message || "Request failed");
  return body;
}

function queryValue(value: string | string[] | undefined, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function validStatus(value: string): value is CatalogStatus {
  return [
    "ALL",
    "IN_OUTLET",
    "OUTSIDE_OUTLET",
    "EDITORIAL",
    "NEW_RELEASES",
    "BEST_SELLERS",
  ].includes(value);
}

function validOrder(value: string): value is CatalogOrder {
  return ["TITLE_ASC", "NEWEST", "BEST_SELLING"].includes(value);
}

export function CatalogCurationWorkspace({
  storeSlug,
  onDraftRevisionChange,
}: {
  storeSlug: string;
  onDraftRevisionChange?: (revision: number) => void;
}) {
  const router = useRouter();
  const { locale, t, translateError } = useI18n();
  const { mutate: mutateGlobal } = useSWRConfig();
  const urlQuery = queryValue(router.query.q);
  const activeTag = queryValue(router.query.tag) || null;
  const urlPage = Math.max(1, Number(queryValue(router.query.page, "1")) || 1);
  const requestedStatus = queryValue(router.query.status, "ALL");
  const status: CatalogStatus = validStatus(requestedStatus)
    ? requestedStatus
    : "ALL";
  const requestedOrder = queryValue(
    router.query.order,
    status === "BEST_SELLERS" ? "BEST_SELLING" : "TITLE_ASC",
  );
  const order: CatalogOrder = validOrder(requestedOrder)
    ? requestedOrder
    : "TITLE_ASC";
  const [queryInput, setQueryInput] = useState(urlQuery);
  const [selectedGames, setSelectedGames] = useState<
    Record<string, CurationGame>
  >({});
  const [pendingAction, setPendingAction] = useState<BulkAction | null>(null);
  const [bulkPreview, setBulkPreview] = useState<{
    changed_count: number;
    unchanged_count: number;
    request_fingerprint: string;
    draft_revision: number;
  } | null>(null);
  const [operationId, setOperationId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [reviewGame, setReviewGame] = useState<CurationGame | null>(null);
  const [reviewHeadline, setReviewHeadline] = useState("");
  const [reviewBody, setReviewBody] = useState("");
  const [isSavingReview, setIsSavingReview] = useState(false);
  const feedbackRef = useRef<HTMLDivElement>(null);

  function replaceQuery(
    patch: Record<string, string | number | null | undefined>,
  ) {
    const nextQuery = { ...router.query };
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === undefined || value === "") {
        delete nextQuery[key];
      } else {
        nextQuery[key] = String(value);
      }
    }
    void router.replace(
      { pathname: router.pathname, query: nextQuery },
      undefined,
      { shallow: true, scroll: false },
    );
  }

  useEffect(() => setQueryInput(urlQuery), [urlQuery]);
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (queryInput.trim() !== urlQuery) {
        replaceQuery({ q: queryInput.trim() || null, page: 1 });
      }
    }, 250);
    return () => window.clearTimeout(timeout);
    // replaceQuery intentionally uses the current router query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryInput, urlQuery]);
  useEffect(() => {
    if (feedback) feedbackRef.current?.focus();
  }, [feedback]);

  const catalogKey = useMemo(() => {
    const params = new URLSearchParams({
      page: String(urlPage),
      limit: String(PAGE_SIZE),
      status,
      order,
      locale,
    });
    if (urlQuery) params.set("q", urlQuery);
    if (activeTag) params.set("tag", activeTag);
    return `/api/v1/stores/${storeSlug}/curation-catalog?${params.toString()}`;
  }, [activeTag, locale, order, status, storeSlug, urlPage, urlQuery]);
  const { data, error, isLoading, isValidating, mutate } =
    useSWR<CatalogResponse>(catalogKey, fetcher, {
      keepPreviousData: true,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    });
  useEffect(() => {
    if (data) onDraftRevisionChange?.(data.draft_revision);
  }, [data, onDraftRevisionChange]);

  const games = data?.games ?? [];
  const selected = Object.values(selectedGames);
  const selectedOnPageCount = games.filter(
    (game) => selectedGames[game.slug],
  ).length;
  const pageIsSelected =
    games.length > 0 && selectedOnPageCount === games.length;
  const pageIsPartiallySelected =
    selectedOnPageCount > 0 && selectedOnPageCount < games.length;
  const impact =
    pendingAction && bulkPreview
      ? {
          selected: selected.length,
          changed: bulkPreview.changed_count,
        }
      : null;

  const filters = data
    ? [
        { value: "ALL" as const, label: "All games", count: data.totals.all },
        {
          value: "IN_OUTLET" as const,
          label: "In the Outlet",
          count: data.totals.in_outlet,
        },
        {
          value: "OUTSIDE_OUTLET" as const,
          label: "Outside",
          count: data.totals.outside_outlet,
        },
        {
          value: "EDITORIAL" as const,
          label: "Editorial",
          count: data.totals.editorial,
        },
        {
          value: "NEW_RELEASES" as const,
          label: "New releases",
          count: data.totals.new_releases,
        },
        {
          value: "BEST_SELLERS" as const,
          label: "Best sellers",
          count: data.totals.best_sellers,
        },
      ]
    : [];

  async function refreshCatalogState() {
    await Promise.allSettled([
      mutate(),
      revalidateOutletDraftCaches(mutateGlobal, storeSlug),
    ]);
  }

  function openReview(game: CurationGame) {
    setReviewGame(game);
    setReviewHeadline(game.outlet_review?.headline ?? "");
    setReviewBody(game.outlet_review?.body ?? "");
  }

  async function saveReview() {
    if (!data || !reviewGame || !reviewBody.trim()) return;
    setIsSavingReview(true);
    try {
      const response = await fetch(
        `/api/v1/stores/${storeSlug}/game-editorials/${reviewGame.slug}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            headline: reviewHeadline.trim() || null,
            body: reviewBody.trim(),
            expected_draft_revision: data.draft_revision,
          }),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.message || "Review save failed");
      await refreshCatalogState();
      setReviewGame(null);
      setFeedback({
        tone: "success",
        message: t(
          "Review saved to the draft. Publish the Outlet when it is ready for visitors.",
        ),
      });
    } catch (saveError) {
      setFeedback({
        tone: "error",
        message: translateError(
          saveError instanceof Error ? saveError.message : undefined,
          "The review could not be saved.",
        ),
      });
    } finally {
      setIsSavingReview(false);
    }
  }

  async function deleteReview() {
    if (!data || !reviewGame?.outlet_review) return;
    setIsSavingReview(true);
    try {
      const response = await fetch(
        `/api/v1/stores/${storeSlug}/game-editorials/${reviewGame.slug}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expected_draft_revision: data.draft_revision,
          }),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(body?.message || "Review delete failed");
      await refreshCatalogState();
      setReviewGame(null);
      setFeedback({
        tone: "success",
        message: t("Review removed from the draft."),
      });
    } catch (deleteError) {
      setFeedback({
        tone: "error",
        message: translateError(
          deleteError instanceof Error ? deleteError.message : undefined,
          "The review could not be removed.",
        ),
      });
    } finally {
      setIsSavingReview(false);
    }
  }

  function toggleGame(game: CurationGame) {
    setPendingAction(null);
    setBulkPreview(null);
    setOperationId(null);
    setSelectedGames((current) => {
      const next = { ...current };
      if (next[game.slug]) delete next[game.slug];
      else next[game.slug] = game;
      return next;
    });
  }

  function togglePageSelection() {
    setPendingAction(null);
    setBulkPreview(null);
    setOperationId(null);
    setSelectedGames((current) => {
      const next = { ...current };
      for (const game of games) {
        if (pageIsSelected) delete next[game.slug];
        else next[game.slug] = game;
      }
      return next;
    });
  }

  async function reviewAction(action: BulkAction) {
    if (!data || selected.length === 0) return;
    setFeedback(null);
    setIsSaving(true);
    try {
      const response = await fetch(
        `/api/v1/stores/${storeSlug}/game-overrides/bulk/preview`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            game_slugs: selected.map((game) => game.slug),
            expected_draft_revision: data.draft_revision,
          }),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.message || "Preview failed");
      setPendingAction(action);
      setBulkPreview(body);
      setOperationId(crypto.randomUUID());
    } catch (previewError) {
      setFeedback({
        tone: "error",
        message: translateError(
          previewError instanceof Error ? previewError.message : undefined,
          "The catalog impact could not be reviewed.",
        ),
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function applyAction() {
    if (!pendingAction || !operationId || !bulkPreview || selected.length === 0)
      return;
    setIsSaving(true);
    setFeedback(null);
    try {
      const response = await fetch(
        `/api/v1/stores/${storeSlug}/game-overrides/bulk`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            operation_id: operationId,
            action: pendingAction,
            game_slugs: selected.map((game) => game.slug),
            expected_draft_revision: bulkPreview.draft_revision,
            request_fingerprint: bulkPreview.request_fingerprint,
          }),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        await refreshCatalogState();
        setFeedback({
          tone: "error",
          message: translateError(
            body?.message,
            "The catalog change could not be saved. Try again safely.",
          ),
        });
        return;
      }

      await refreshCatalogState();
      setSelectedGames({});
      setPendingAction(null);
      setBulkPreview(null);
      setOperationId(null);
      setFeedback({
        tone: body.changed_count > 0 ? "success" : "neutral",
        message:
          body.changed_count > 0
            ? t("{changed} games updated · {unchanged} already matched", {
                changed: body.changed_count,
                unchanged: body.unchanged_count,
              })
            : t("No manual changes were needed."),
        ...(body.undo_available && { batchId: body.batch_id }),
      });
    } catch {
      // The request may have reached the server even when its response was
      // lost. Revalidate, but keep the operation id, preview and selection so
      // the idempotent retry remains safe.
      await refreshCatalogState();
      setFeedback({
        tone: "error",
        message: t("The catalog change could not be saved. Try again safely."),
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function undoBatch(batchId: string) {
    setIsSaving(true);
    setFeedback(null);
    try {
      const response = await fetch(
        `/api/v1/stores/${storeSlug}/game-overrides/bulk/${batchId}/undo`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expected_draft_revision: data?.draft_revision,
          }),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        await refreshCatalogState();
        setFeedback({
          tone: "error",
          message: translateError(
            body?.message,
            "This change can no longer be safely undone.",
          ),
          batchId,
        });
        return;
      }
      await refreshCatalogState();
      setFeedback({ tone: "success", message: t("Last change undone.") });
    } catch {
      // Undo is idempotent server-side. Keep the batch id visible so the
      // creator can retry after the refreshed state is inspected.
      await refreshCatalogState();
      setFeedback({
        tone: "error",
        message: t("This change can no longer be safely undone."),
        batchId,
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function chooseCatalogMode(catalogMode: "ALL" | "SELECTED") {
    if (data?.catalog_mode === catalogMode) return;
    setIsSaving(true);
    setFeedback(null);
    try {
      if (!data) return;
      const response = await fetch(
        `/api/v1/stores/${storeSlug}/curation-catalog/mode`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            catalog_mode: catalogMode,
            expected_draft_revision: data.draft_revision,
          }),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        await refreshCatalogState();
        setFeedback({
          tone: "error",
          message: translateError(
            body?.message,
            "The catalog strategy could not be saved.",
          ),
        });
        return;
      }
      await refreshCatalogState();
      setFeedback({
        tone: "success",
        message: t(
          catalogMode === "ALL"
            ? "Full catalog kept. You can hide exceptions anytime."
            : "Selection mode started. Show at least five games to get ready.",
        ),
      });
    } catch {
      // Mode changes bump the draft revision. Always re-fetch before offering
      // the still-visible selector again so a lost response cannot leave the
      // UI claiming the old default rule.
      await refreshCatalogState();
      setFeedback({
        tone: "error",
        message: t("The catalog strategy could not be saved."),
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section
      aria-labelledby="catalog-curation-heading"
      aria-busy={isLoading || isValidating}
      className="space-y-6"
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <span className="text-[11px] font-black uppercase tracking-[0.2em] text-violet-300/70">
            {t("Catalog curation")}
          </span>
          <h2
            id="catalog-curation-heading"
            className="mt-1 text-2xl font-black tracking-tight sm:text-3xl"
          >
            {t("Your Games")}
          </h2>
          <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-white/50">
            {t(
              "Find the right games, review the impact, and shape what your audience sees.",
            )}
          </p>
        </div>
        <Link
          href={`/store/${encodeURIComponent(storeSlug)}?preview=1`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex w-fit items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-black text-white/70 transition hover:border-violet-300/30 hover:bg-white/[0.08] hover:text-white"
        >
          {t("Preview draft Outlet")}
          <ExternalLink size={14} />
        </Link>
      </div>

      {data && (
        <div className="rounded-3xl border border-violet-300/20 bg-[radial-gradient(circle_at_top_left,rgba(139,92,246,0.18),transparent_52%)] p-5 sm:p-7">
          {data.catalog_mode === "UNDECIDED" ? (
            <>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-200/65">
                {t("First catalog decision")}
              </p>
              <h3 className="mt-2 text-xl font-black text-white">
                {t("How do you want to begin?")}
              </h3>
              <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-white/50">
                {t(
                  "Start with a hand-picked selection or keep the full catalog and hide only the exceptions. No hundreds of hidden rules are created.",
                )}
              </p>
            </>
          ) : (
            <p className="text-sm font-black text-white/75">
              {t("Choose Full catalog or Selected catalog.")}
            </p>
          )}
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => chooseCatalogMode("SELECTED")}
              disabled={isSaving || data.catalog_mode === "SELECTED"}
              aria-pressed={data.catalog_mode === "SELECTED"}
              className={`rounded-2xl border p-4 text-left transition disabled:cursor-default disabled:opacity-100 ${
                data.catalog_mode === "SELECTED"
                  ? "border-violet-300/45 bg-violet-400/20"
                  : "border-white/10 bg-white/[0.04] hover:bg-white/[0.07]"
              }`}
            >
              <span className="flex items-center gap-2 font-black text-violet-100">
                {data.catalog_mode === "SELECTED" ? (
                  <CheckCircle2 size={17} />
                ) : (
                  <Check size={17} />
                )}
                {t("Selected catalog")}
              </span>
              <span className="mt-1.5 block text-xs font-semibold leading-relaxed text-white/45">
                {t(
                  "Start empty. Show-tag rules and per-game Show add games; a per-game Hide always excludes.",
                )}
              </span>
            </button>
            <button
              type="button"
              onClick={() => chooseCatalogMode("ALL")}
              disabled={isSaving || data.catalog_mode === "ALL"}
              aria-pressed={data.catalog_mode === "ALL"}
              className={`rounded-2xl border p-4 text-left transition disabled:cursor-default disabled:opacity-100 ${
                data.catalog_mode === "ALL"
                  ? "border-violet-300/45 bg-violet-400/20"
                  : "border-white/10 bg-white/[0.04] hover:bg-white/[0.07]"
              }`}
            >
              <span className="flex items-center gap-2 font-black text-white/80">
                {data.catalog_mode === "ALL" ? (
                  <CheckCircle2 size={17} />
                ) : (
                  <Eye size={17} />
                )}
                {t("Full catalog")}
              </span>
              <span className="mt-1.5 block text-xs font-semibold leading-relaxed text-white/45">
                {t(
                  "Include every eligible game. A per-game Hide always excludes; a per-game Show wins a hide-by-tag rule.",
                )}
              </span>
            </button>
          </div>
        </div>
      )}

      {data && (
        <div
          className={`grid gap-3 rounded-2xl border p-4 sm:grid-cols-[1fr_auto] sm:items-center ${
            data.readiness.has_minimum_catalog && data.readiness.featured_inside
              ? "border-emerald-400/20 bg-emerald-400/[0.07]"
              : "border-amber-300/20 bg-amber-300/[0.06]"
          }`}
        >
          <div>
            <p className="text-sm font-black text-white">
              {locale === "pt-BR"
                ? "Progresso parcial da curadoria"
                : "Partial curation progress"}
            </p>
            <p className="mt-1 text-xs font-semibold text-white/45">
              {t("{count} of {minimum} games · {featured} editorial picks", {
                count: data.readiness.result_count,
                minimum: data.readiness.minimum_count,
                featured: data.readiness.featured_count,
              })}
              {data.readiness.featured_outside_count > 0 &&
                ` · ${t("{count} picks outside the Outlet", {
                  count: data.readiness.featured_outside_count,
                })}`}
            </p>
          </div>
          <Link
            href={`/store/${encodeURIComponent(storeSlug)}/manage?tab=featured`}
            className="text-xs font-black text-amber-200 underline-offset-4 hover:underline"
          >
            {t("Review Editorial")}
          </Link>
        </div>
      )}

      <div className="overflow-hidden rounded-3xl border border-white/[0.09] bg-[#100c17] shadow-[0_28px_80px_rgba(0,0,0,0.24)]">
        <div className="border-b border-white/[0.08] bg-[radial-gradient(circle_at_top_left,rgba(139,92,246,0.12),transparent_42%)] p-4 sm:p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <label className="relative flex-1">
              <span className="sr-only">{t("Search catalog games")}</span>
              <Search
                aria-hidden="true"
                size={18}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/35"
              />
              <input
                type="search"
                value={queryInput}
                onChange={(event) => setQueryInput(event.target.value)}
                placeholder={t("Search by game, studio, or description...")}
                className="h-12 w-full rounded-2xl border border-white/10 bg-black/20 pl-12 pr-11 text-base font-bold text-white outline-none placeholder:text-white/30 focus:border-violet-400/50 focus:ring-4 focus:ring-violet-500/10 sm:text-sm"
              />
              {queryInput && (
                <button
                  type="button"
                  onClick={() => setQueryInput("")}
                  aria-label={t("Clear search")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-white/35 hover:bg-white/10 hover:text-white"
                >
                  <X size={15} />
                </button>
              )}
            </label>
            <select
              value={activeTag ?? ""}
              onChange={(event) =>
                replaceQuery({ tag: event.target.value || null, page: 1 })
              }
              aria-label={t("Filter catalog by tag")}
              className="h-12 rounded-2xl border border-white/10 bg-[#17121f] px-4 text-sm font-black text-white outline-none focus:border-violet-400/50 lg:max-w-64"
            >
              <option value="">{t("All tags")}</option>
              {(data?.facets ?? []).map((facet) => (
                <option key={facet.tag} value={facet.tag}>
                  {facet.tag} ({facet.count})
                </option>
              ))}
            </select>
            <select
              value={order}
              onChange={(event) =>
                replaceQuery({ order: event.target.value, page: 1 })
              }
              aria-label={t("Sort games")}
              className="h-12 rounded-2xl border border-white/10 bg-[#17121f] px-4 text-sm font-black text-white outline-none focus:border-violet-400/50 lg:max-w-56"
            >
              <option value="TITLE_ASC">{t("Title (A-Z)")}</option>
              <option value="NEWEST">{t("Newest First")}</option>
              <option value="BEST_SELLING">{t("Best seller")}</option>
            </select>
          </div>

          <div
            role="group"
            aria-label={t("Catalog status filters")}
            className="mt-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {filters.map((filter) => (
              <button
                type="button"
                key={filter.value}
                onClick={() =>
                  replaceQuery({
                    status: filter.value === "ALL" ? null : filter.value,
                    order:
                      filter.value === "BEST_SELLERS"
                        ? "BEST_SELLING"
                        : order === "BEST_SELLING"
                          ? "TITLE_ASC"
                          : order,
                    page: 1,
                  })
                }
                aria-pressed={status === filter.value}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-black transition ${
                  status === filter.value
                    ? "border-violet-300/45 bg-violet-400/15 text-violet-100"
                    : "border-white/10 bg-white/[0.035] text-white/45 hover:bg-white/[0.07] hover:text-white/75"
                }`}
              >
                {t(filter.label)}{" "}
                <span className="ml-1 text-white/30">{filter.count}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-b border-white/[0.08] bg-white/[0.025] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <label className="flex min-h-10 cursor-pointer items-center gap-3 text-sm font-black text-white/65">
            <input
              type="checkbox"
              checked={pageIsSelected}
              aria-checked={pageIsPartiallySelected ? "mixed" : pageIsSelected}
              onChange={togglePageSelection}
              disabled={games.length === 0}
              className="h-4 w-4 rounded border-white/20 bg-white/5 accent-violet-500"
            />
            {pageIsSelected
              ? t("Deselect this page")
              : pageIsPartiallySelected
                ? t("{count} selected on this page", {
                    count: selectedOnPageCount,
                  })
                : t("Select this page")}
          </label>
          <span
            role="status"
            aria-live="polite"
            className="text-xs font-black text-white/35"
          >
            {t("{count} selected across filters", { count: selected.length })}
          </span>
        </div>

        {selected.length > 0 && (
          <div className="sticky top-16 z-20 border-b border-violet-300/20 bg-[#171121]/95 p-4 shadow-xl backdrop-blur-md sm:px-6">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-violet-200/70">
                  {t("Selection tray")} · {selected.length}
                </p>
                <button
                  type="button"
                  onClick={() => setSelectedGames({})}
                  className="inline-flex items-center gap-1.5 text-xs font-black text-white/40 hover:text-white"
                >
                  <Trash2 size={13} /> {t("Clear selection")}
                </button>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {selected.map((game) => (
                  <div
                    key={game.slug}
                    className="flex min-w-44 max-w-56 shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] p-2"
                  >
                    <div
                      className="h-9 w-14 shrink-0 rounded-lg bg-[#281d39]"
                      style={{
                        background: game.media?.banner
                          ? `url(${game.media.banner}) center/cover no-repeat`
                          : undefined,
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate text-xs font-black text-white/75">
                      {game.title}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleGame(game)}
                      aria-label={t("Remove {title} from selection", {
                        title: game.title,
                      })}
                      className="rounded-md p-1 text-white/35 hover:bg-white/10 hover:text-white"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => reviewAction("SHOW")}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-3 text-sm font-black text-emerald-200 hover:bg-emerald-400/15"
                >
                  <Eye size={16} /> {t("Show")}
                </button>
                <button
                  type="button"
                  onClick={() => reviewAction("HIDE")}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-rose-400/25 bg-rose-400/10 px-3 text-sm font-black text-rose-200 hover:bg-rose-400/15"
                >
                  <EyeOff size={16} /> {t("Hide")}
                </button>
                <button
                  type="button"
                  onClick={() => reviewAction("PIN_SHOW")}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-violet-400/25 bg-violet-400/10 px-3 text-sm font-black text-violet-200 hover:bg-violet-400/15"
                >
                  <Pin size={16} /> {t("Keep always visible")}
                </button>
              </div>
            </div>
          </div>
        )}

        {pendingAction && impact && (
          <div
            className="m-4 rounded-2xl border border-violet-300/20 bg-violet-400/[0.08] p-4 sm:m-6 sm:p-5"
            role="status"
            aria-live="polite"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-200/60">
                  {t("Change preview")}
                </p>
                <h3 className="mt-1 font-black text-white">
                  {t("{changed} of {selected} games will change", {
                    changed: impact.changed,
                    selected: impact.selected,
                  })}
                </h3>
                <p className="mt-1 text-xs font-semibold text-white/45">
                  {pendingAction === "PIN_SHOW"
                    ? t(
                        "This is different from already being visible by a catalog or tag rule.",
                      )
                    : t(
                        "Games already in the requested state will not get redundant overrides.",
                      )}
                </p>
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setPendingAction(null)}
                  className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-black text-white/55 hover:bg-white/5 hover:text-white"
                >
                  {t("Cancel")}
                </button>
                <button
                  type="button"
                  onClick={applyAction}
                  disabled={isSaving}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-black text-white hover:bg-violet-400 disabled:opacity-50"
                >
                  {isSaving ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <Check size={15} />
                  )}
                  {isSaving ? t("Saving...") : t("Apply change")}
                </button>
              </div>
            </div>
          </div>
        )}

        {feedback && (
          <div
            ref={feedbackRef}
            tabIndex={-1}
            role={feedback.tone === "error" ? "alert" : "status"}
            aria-live={feedback.tone === "error" ? undefined : "polite"}
            className={`mx-4 mt-4 flex flex-col gap-3 rounded-2xl border px-4 py-3 text-sm font-bold outline-none sm:mx-6 sm:flex-row sm:items-center sm:justify-between ${
              feedback.tone === "success"
                ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
                : feedback.tone === "error"
                  ? "border-rose-400/25 bg-rose-400/10 text-rose-200"
                  : "border-white/10 bg-white/[0.04] text-white/65"
            }`}
          >
            <span className="flex items-center gap-2">
              {feedback.tone === "success" && <CheckCircle2 size={17} />}
              {feedback.message}
            </span>
            {feedback.batchId && (
              <button
                type="button"
                onClick={() => undoBatch(feedback.batchId!)}
                disabled={isSaving}
                className="inline-flex w-fit items-center gap-2 rounded-lg border border-current/20 px-3 py-1.5 text-xs font-black hover:bg-white/10 disabled:opacity-50"
              >
                <RotateCcw size={14} /> {t("Undo")}
              </button>
            )}
          </div>
        )}

        <div className="p-4 sm:p-6">
          {isLoading ? (
            <div
              role="status"
              className="flex min-h-72 items-center justify-center"
            >
              <Loader2 className="animate-spin text-violet-300/50" size={30} />
              <span className="sr-only">{t("Loading catalog games...")}</span>
            </div>
          ) : error ? (
            <div
              role="alert"
              className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-rose-400/20 bg-rose-400/[0.06] px-6 text-center"
            >
              <EyeOff size={28} className="text-rose-300/60" />
              <p className="mt-3 font-black text-rose-200">
                {t("We could not load your catalog curation.")}
              </p>
              <button
                type="button"
                onClick={() => void mutate()}
                className="mt-4 rounded-lg border border-rose-200/25 px-4 py-2 text-xs font-black uppercase tracking-wider text-rose-100 hover:bg-rose-200/10"
              >
                {t("Try again")}
              </button>
            </div>
          ) : games.length === 0 ? (
            <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 px-6 text-center">
              <Search size={28} className="text-white/25" />
              <p className="mt-3 font-black text-white/70">
                {t("No games match these filters.")}
              </p>
              <button
                type="button"
                onClick={() => {
                  setQueryInput("");
                  replaceQuery({ q: null, tag: null, status: null, page: 1 });
                }}
                className="mt-3 text-sm font-black text-violet-300 hover:text-violet-200"
              >
                {t("Clear filters")}
              </button>
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {games.map((game) => {
                  const isSelected = Boolean(selectedGames[game.slug]);
                  return (
                    <article
                      key={game.id}
                      className={`overflow-hidden rounded-2xl border bg-[#17121f] transition ${
                        isSelected
                          ? "border-violet-400/50 shadow-[0_0_0_1px_rgba(167,139,250,0.14)]"
                          : "border-white/[0.09] hover:border-white/20"
                      }`}
                    >
                      <div
                        className="relative aspect-[16/9] overflow-hidden bg-[#241a31]"
                        style={{
                          background: game.media?.banner
                            ? `linear-gradient(to top, rgba(11,8,18,.82), transparent 58%), url(${game.media.banner}) center/cover no-repeat`
                            : "linear-gradient(135deg, #281d39, #120e19)",
                        }}
                      >
                        <label className="absolute left-3 top-3 flex cursor-pointer items-center gap-2 rounded-xl border border-white/15 bg-black/65 px-2.5 py-2 text-xs font-black text-white shadow-lg backdrop-blur-md">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleGame(game)}
                            aria-label={t(
                              isSelected
                                ? "Deselect {title}"
                                : "Select {title}",
                              { title: game.title },
                            )}
                            className="h-4 w-4 rounded border-white/30 bg-white/10 accent-violet-500"
                          />
                          {isSelected ? t("Selected") : t("Select")}
                        </label>
                        <div className="absolute right-3 top-3 flex flex-col items-end gap-2">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] backdrop-blur-md ${
                              game.in_outlet
                                ? "border-emerald-300/30 bg-emerald-950/75 text-emerald-200"
                                : "border-rose-300/30 bg-rose-950/75 text-rose-200"
                            }`}
                          >
                            {game.in_outlet ? (
                              <Eye size={12} />
                            ) : (
                              <EyeOff size={12} />
                            )}
                            {t(game.in_outlet ? "In the Outlet" : "Outside")}
                          </span>
                          <button
                            type="button"
                            onClick={() => openReview(game)}
                            className="inline-flex items-center gap-1 rounded-full border border-violet-300/30 bg-violet-950/80 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-violet-100 backdrop-blur-md hover:bg-violet-900/90"
                          >
                            <MessageSquareText size={11} />
                            {t(
                              game.outlet_review ? "Edit review" : "Add review",
                            )}
                          </button>
                          {game.is_editorial && (
                            <Link
                              href={`/store/${encodeURIComponent(storeSlug)}/manage?tab=featured`}
                              className="inline-flex items-center gap-1 rounded-full border border-amber-300/30 bg-amber-950/75 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-amber-200 backdrop-blur-md hover:bg-amber-900/80"
                            >
                              <Sparkles size={11} /> {t("Edit Featured")}
                            </Link>
                          )}
                        </div>
                      </div>
                      <div className="flex min-h-52 flex-col p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="truncate text-base font-black text-white">
                              {game.title}
                            </h3>
                            <p className="mt-1 truncate text-xs font-bold text-white/38">
                              {t("By {studio}", {
                                studio: game.developer_name,
                              })}
                            </p>
                          </div>
                          <span className="shrink-0 text-sm font-black text-white/75">
                            {formatCatalogPrice(game, t("Free"))}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {game.is_new_release && (
                            <span className="rounded-full border border-sky-300/20 bg-sky-300/10 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-sky-200">
                              {t("New release")}
                            </span>
                          )}
                          {game.sales_count > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-orange-300/20 bg-orange-300/10 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-orange-200">
                              <Flame size={10} /> {t("Best seller")}
                            </span>
                          )}
                          {(game.tags ?? []).slice(0, 3).map((tag) => (
                            <button
                              type="button"
                              key={tag}
                              onClick={() => replaceQuery({ tag, page: 1 })}
                              className="rounded-full border border-white/[0.08] bg-white/[0.035] px-2 py-1 text-[10px] font-black text-white/40 hover:bg-white/[0.07] hover:text-white/70"
                            >
                              {tag}
                            </button>
                          ))}
                        </div>
                        <div className="mt-auto flex items-end justify-between gap-3 border-t border-white/[0.07] pt-4">
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-[0.16em] text-white/25">
                              {t("Visibility source")}
                            </p>
                            <p className="mt-1 text-[11px] font-black text-white/48">
                              {t(
                                game.visibility_source === "ALWAYS_VISIBLE"
                                  ? "Always visible"
                                  : game.visibility_source === "HIDDEN_MANUALLY"
                                    ? "Hidden manually"
                                    : "Catalog or tag rule",
                              )}
                            </p>
                          </div>
                          <Link
                            href={itemHref(game.slug, storeSlug, true)}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={t("Preview {title} in this Outlet", {
                              title: game.title,
                            })}
                            className="rounded-lg border border-white/10 p-2 text-white/35 hover:bg-white/[0.07] hover:text-white"
                          >
                            <ExternalLink size={14} />
                          </Link>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
              <div className="mt-6 border-t border-white/[0.07] pt-5">
                <Pagination
                  pagination={data?.pagination}
                  onPageChange={(updater) =>
                    replaceQuery({ page: updater(urlPage) })
                  }
                />
              </div>
            </>
          )}
        </div>
      </div>
      {reviewGame && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-5"
          role="dialog"
          aria-modal="true"
          aria-labelledby="outlet-review-title"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !isSavingReview) {
              setReviewGame(null);
            }
          }}
        >
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-white/10 bg-[#17121f] p-5 shadow-2xl sm:rounded-3xl sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-300">
                  {t("Outlet review")}
                </p>
                <h2
                  id="outlet-review-title"
                  className="mt-2 text-2xl font-black text-white"
                >
                  {reviewGame.title}
                </h2>
                <p className="mt-1 text-sm font-semibold text-white/45">
                  {t(
                    "This review is independent from Featured and stays in the draft until you publish.",
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReviewGame(null)}
                disabled={isSavingReview}
                aria-label={t("Close")}
                className="rounded-xl border border-white/10 p-2 text-white/50 hover:bg-white/10 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
            <label className="mt-6 block">
              <span className="text-xs font-black uppercase tracking-wider text-white/55">
                {t("Headline (optional)")}
              </span>
              <input
                value={reviewHeadline}
                onChange={(event) => setReviewHeadline(event.target.value)}
                maxLength={120}
                className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-black/20 px-4 font-bold text-white outline-none focus:border-violet-400/60"
              />
              <span className="mt-1 block text-right text-[10px] font-bold text-white/30">
                {reviewHeadline.length}/120
              </span>
            </label>
            <label className="mt-4 block">
              <span className="text-xs font-black uppercase tracking-wider text-white/55">
                {t("Your review")}
              </span>
              <textarea
                value={reviewBody}
                onChange={(event) => setReviewBody(event.target.value)}
                maxLength={2000}
                rows={8}
                autoFocus
                className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-black/20 p-4 text-sm font-semibold leading-6 text-white outline-none focus:border-violet-400/60"
              />
              <span className="mt-1 block text-right text-[10px] font-bold text-white/30">
                {reviewBody.length}/2000
              </span>
            </label>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <div>
                {reviewGame.outlet_review && (
                  <button
                    type="button"
                    onClick={deleteReview}
                    disabled={isSavingReview}
                    className="min-h-11 rounded-xl border border-rose-300/20 px-4 text-sm font-black text-rose-200 hover:bg-rose-400/10 disabled:opacity-50"
                  >
                    {t("Remove review")}
                  </button>
                )}
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setReviewGame(null)}
                  disabled={isSavingReview}
                  className="min-h-11 rounded-xl border border-white/10 px-4 text-sm font-black text-white/60 hover:bg-white/5"
                >
                  {t("Cancel")}
                </button>
                <button
                  type="button"
                  onClick={saveReview}
                  disabled={isSavingReview || !reviewBody.trim()}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-500 px-5 text-sm font-black text-white hover:bg-violet-400 disabled:opacity-50"
                >
                  {isSavingReview && (
                    <Loader2 size={16} className="animate-spin" />
                  )}
                  {isSavingReview ? t("Saving...") : t("Save review")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
