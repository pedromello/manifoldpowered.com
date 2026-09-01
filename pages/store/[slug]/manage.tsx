import { type KeyboardEvent, useEffect, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Link from "next/link";
import useSWR, { useSWRConfig } from "swr";
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  Copy,
  Eye,
  Globe2,
  Loader2,
  LockKeyhole,
  Rocket,
  X,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  Trash2,
  RotateCcw,
  Check,
} from "lucide-react";
import { CreatorWorkspaceLayout } from "components/creator/CreatorWorkspaceLayout";
import { CatalogCurationWorkspace } from "components/creator/CatalogCurationWorkspace";
import { GameAutocomplete } from "components/store/GameAutocomplete";
import { type GameApi } from "components/store/types";
import { Pagination, type PaginationApi } from "components/Pagination";
import { formatMoney } from "lib/price";
import { useI18n } from "lib/i18n";
import {
  CREATOR_OUTLET_FUNNEL_VERSION,
  creatorFunnelAnalytics,
} from "lib/creator-funnel-analytics";

interface StoreApi {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  owner_id: string;
  status?: "DRAFT" | "PUBLISHED";
  published_at?: string | null;
  catalog_mode?: "UNDECIDED" | "ALL" | "SELECTED";
}

type PublicationCheck =
  | "brand_complete"
  | "catalog_intentional"
  | "catalog_has_games"
  | "editorial_highlight";

type PublicationBlockerCode =
  | "BRAND_INCOMPLETE"
  | "CATALOG_MODE_UNDECIDED"
  | "SELECTED_CATALOG_WITHOUT_INCLUSIONS"
  | "CATALOG_TOO_SMALL"
  | "FEATURED_COUNT_INVALID"
  | "FEATURED_OUTSIDE_CATALOG"
  | "FEATURED_REASON_MISSING";

interface PublicationBlocker {
  code: PublicationBlockerCode;
  message: string;
  details?: {
    minimum?: number;
    maximum?: number;
    actual?: number;
    game_ids?: string[];
  };
}

interface PublicationApi {
  status: "DRAFT" | "PUBLISHED";
  published_at: string | null;
  last_published_at: string | null;
  draft_revision: number;
  catalog_mode: "UNDECIDED" | "ALL" | "SELECTED";
  published_revision: {
    id: string;
    revision: number;
    source_draft_revision: number;
  } | null;
  readiness: {
    version: 2;
    ready: boolean;
    catalog_game_count: number;
    checks: Record<PublicationCheck, boolean>;
    blockers: PublicationBlocker[];
  };
}

const publicationEndpoint = (storeSlug: string) =>
  `/api/v1/stores/${storeSlug}/publication`;

interface TagFilterApi {
  id: string;
  tag: string;
  mode: "WHITELIST" | "BLACKLIST";
}

interface TagFilterImpactApi {
  draft_revision: number;
  current_count: number;
  result_count: number;
  shown_count: number;
  hidden_count: number;
  unchanged_count: number;
}

interface GameOverrideApi {
  id: string;
  game_slug: string;
  visibility: "SHOW" | "HIDE";
}

interface SaleApi {
  id: string;
  // A per-outlet pseudonym, never the buyer's id. Stable within this outlet so
  // repeat customers are countable, different at every other outlet so two
  // operators cannot work out that they share one. See models/authorization.
  buyer_ref: string;
  game_id: string;
  game_title: string;
  game_slug: string | null;
  store_id: string | null;
  price_at_sale: string;
  currency: string;
  created_at: string;
}

interface StatementBalanceApi {
  currency: string;
  total: string;
  payable: string;
  held: string;
}

interface StatementApi {
  balances: StatementBalanceApi[];
  hold_days: number;
}

const fetcher = (url: string) =>
  fetch(url).then(async (res) => {
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.message || "Request failed");
    }
    return res.json();
  });

type Tab = "featured" | "curation" | "settings" | "sales" | "earnings";

function isManageTab(value: string): value is Tab {
  return ["featured", "curation", "settings", "sales", "earnings"].includes(
    value,
  );
}

export default function StoreManagePage() {
  const router = useRouter();
  const { t } = useI18n();
  const slug = router.query.slug as string | undefined;
  const requestedTab =
    typeof router.query.tab === "string" ? router.query.tab : "featured";
  const tab: Tab = isManageTab(requestedTab) ? requestedTab : "featured";

  const {
    data: storeData,
    isLoading: isStoreLoading,
    error: storeError,
    mutate: mutateStore,
  } = useSWR<StoreApi>(
    slug ? `/api/v1/stores/${slug}?preview=1` : null,
    fetcher,
  );

  function selectTab(nextTab: Tab) {
    void router.replace(
      {
        pathname: router.pathname,
        query: { ...router.query, tab: nextTab },
      },
      undefined,
      { shallow: true, scroll: false },
    );
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, tab: Tab) {
    const tabs: Tab[] = [
      "featured",
      "curation",
      "settings",
      "sales",
      "earnings",
    ];
    const currentIndex = tabs.indexOf(tab);
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabs.length - 1
          : event.key === "ArrowRight"
            ? (currentIndex + 1) % tabs.length
            : event.key === "ArrowLeft"
              ? (currentIndex - 1 + tabs.length) % tabs.length
              : null;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = tabs[nextIndex];
    selectTab(nextTab);
    document.getElementById(`outlet-manage-tab-${nextTab}`)?.focus();
  }

  const {
    data: tagFilters,
    isLoading: isTagFiltersLoading,
    error: tagFiltersError,
  } = useSWR<TagFilterApi[]>(
    slug ? `/api/v1/stores/${slug}/tag-filters` : null,
    fetcher,
  );

  if (isStoreLoading || !slug) {
    return (
      <div
        role="status"
        className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-[#0b0812]"
      >
        <Loader2 className="animate-spin text-white/30" size={32} />
        <span className="sr-only">{t("Loading...")}</span>
      </div>
    );
  }

  if (storeError || !storeData) {
    return (
      <div
        role="alert"
        className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-4 bg-[#0b0812]"
      >
        <p className="font-bold text-rose-300">{t("Outlet not found.")}</p>
        <button
          type="button"
          onClick={() => void mutateStore()}
          className="rounded-lg border border-white/10 px-4 py-2 text-xs font-black uppercase tracking-wider text-white/70 hover:bg-white/5 hover:text-white"
        >
          {t("Try again")}
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#0b0812] pb-24 text-white">
      <Head>
        <title>{t("Manage {name} | Manifold", { name: storeData.name })}</title>
      </Head>

      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 pt-10 sm:px-6 lg:px-10 lg:pt-14">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black break-words">
              {t("Manage {name}", { name: storeData.name })}
            </h1>
            <p className="text-white/50 text-sm font-bold mt-1">
              {t("Curate your Outlet and track your sales.")}
            </p>
          </div>
        </div>

        <LifecyclePanel store={storeData} />

        {/* Scrollable and shrink-proof, the same idiom BackofficeTopNav uses.
            Four tabs do not fit a 390px viewport: without this the row pushes
            the page into horizontal scroll and the last tab sits off-screen
            where it cannot be tapped at all. */}
        <div
          role="tablist"
          aria-label={t("Manage {name}", { name: storeData.name })}
          className="-mx-4 flex items-center gap-2 overflow-x-auto border-b border-white/10 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {(
            [
              ["featured", "Featured"],
              ["curation", "Curation"],
              ["settings", "Settings"],
              ["sales", "Sales"],
              ["earnings", "Earnings"],
            ] as [Tab, string][]
          ).map(([value, label]) => (
            <button
              type="button"
              role="tab"
              id={`outlet-manage-tab-${value}`}
              aria-selected={tab === value}
              aria-controls={`outlet-manage-panel-${value}`}
              key={value}
              onClick={() => selectTab(value)}
              onKeyDown={(event) => handleTabKeyDown(event, value)}
              tabIndex={tab === value ? 0 : -1}
              className={`shrink-0 px-4 py-3 text-sm font-black uppercase tracking-wider transition-colors border-b-2 ${
                tab === value
                  ? "text-white border-white"
                  : "text-white/40 border-transparent hover:text-white/70"
              }`}
            >
              {t(label)}
            </button>
          ))}
        </div>

        <div
          role="tabpanel"
          id={`outlet-manage-panel-${tab}`}
          aria-labelledby={`outlet-manage-tab-${tab}`}
        >
          {tab === "featured" && (
            <FeaturedTab
              storeSlug={storeData.slug}
              storeName={storeData.name}
            />
          )}
          {tab === "curation" &&
            (tagFiltersError ? (
              <p className="text-sm font-bold text-rose-300">
                {t(
                  "You do not have permission to manage this Outlet's catalog curation.",
                )}
              </p>
            ) : (
              <CurationTab
                storeSlug={storeData.slug}
                tagFilters={tagFilters ?? []}
                isTagFiltersLoading={isTagFiltersLoading}
              />
            ))}
          {tab === "settings" && <SettingsTab store={storeData} />}
          {tab === "sales" && <SalesTab storeSlug={storeData.slug} />}
          {tab === "earnings" && <EarningsTab storeSlug={storeData.slug} />}
        </div>
      </div>
    </div>
  );
}

StoreManagePage.getLayout = function getLayout(page: React.ReactElement) {
  return <CreatorWorkspaceLayout>{page}</CreatorWorkspaceLayout>;
};

function publicationCheckReady(value: boolean | undefined) {
  return value === true;
}

function publicationBlockerCopy(
  blocker: PublicationBlocker,
  t: ReturnType<typeof useI18n>["t"],
) {
  switch (blocker.code) {
    case "BRAND_INCOMPLETE":
      return t("Add a description and logo.");
    case "CATALOG_MODE_UNDECIDED":
      return t("Choose Full catalog or Selected catalog.");
    case "SELECTED_CATALOG_WITHOUT_INCLUSIONS":
      return t(
        "Add at least one whitelist filter or shown game to the Selected catalog.",
      );
    case "CATALOG_TOO_SMALL":
      return t(
        "Add more eligible games to the catalog ({actual} of {minimum} minimum).",
        {
          actual: blocker.details?.actual ?? 0,
          minimum: blocker.details?.minimum ?? 5,
        },
      );
    case "FEATURED_COUNT_INVALID":
      return t(
        "Choose between {minimum} and {maximum} Featured games ({actual} selected).",
        {
          minimum: blocker.details?.minimum ?? 1,
          maximum: blocker.details?.maximum ?? 3,
          actual: blocker.details?.actual ?? 0,
        },
      );
    case "FEATURED_OUTSIDE_CATALOG":
      return t("Move every Featured game into the selected draft catalog.");
    case "FEATURED_REASON_MISSING":
      return t("Add a recommendation reason to every Featured game.");
    default:
      return t("Review this draft before publishing.");
  }
}

function currentConflictRevision(body: unknown): number | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const context =
    record.context && typeof record.context === "object"
      ? (record.context as Record<string, unknown>)
      : null;
  const candidates = [
    record.current_draft_revision,
    record.actual_draft_revision,
    record.draft_revision,
    context?.current_draft_revision,
    context?.actual_draft_revision,
    context?.draft_revision,
  ];
  const revision = candidates.find(
    (value) =>
      typeof value === "number" && Number.isSafeInteger(value) && value >= 0,
  );
  return typeof revision === "number" ? revision : null;
}

function LifecyclePanel({ store }: { store: StoreApi }) {
  const { t, locale, translateError } = useI18n();
  const { mutate: mutateGlobal } = useSWRConfig();
  const endpoint = publicationEndpoint(store.slug);
  const { data, error, isLoading, isValidating, mutate } =
    useSWR<PublicationApi>(endpoint, fetcher);
  const [pendingAction, setPendingAction] = useState<
    "publish" | "unpublish" | "copy" | null
  >(null);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [justPublished, setJustPublished] = useState(false);

  useEffect(() => {
    setJustPublished(false);
  }, [data?.draft_revision]);

  const status = data?.status ?? store.status ?? "DRAFT";
  const isPublished = status === "PUBLISHED";
  const revisionIsValid =
    typeof data?.draft_revision === "number" &&
    Number.isSafeInteger(data.draft_revision) &&
    data.draft_revision >= 0;
  const readinessVersionIsValid = data?.readiness.version === 2;
  const hasPendingChanges =
    isPublished &&
    data?.published_revision !== null &&
    typeof data?.published_revision?.source_draft_revision === "number" &&
    data.draft_revision > data.published_revision.source_draft_revision;
  const canPublish =
    (!isPublished || hasPendingChanges) &&
    readinessVersionIsValid &&
    data?.readiness.ready === true &&
    revisionIsValid;

  async function transition(action: "publish" | "unpublish") {
    if (!data || pendingAction) return;
    if (!revisionIsValid) {
      setActionError(
        t("The draft revision is unavailable. Refresh before publishing."),
      );
      return;
    }
    if (
      action === "unpublish" &&
      !window.confirm(
        t(
          "Unpublish this Outlet? Its public page will become unavailable until you publish it again.",
        ),
      )
    ) {
      return;
    }
    if (action === "publish" && !canPublish) return;

    setPendingAction(action);
    setMessage(null);
    setActionError(null);
    try {
      const payload: {
        action: "publish" | "unpublish";
        expected_draft_revision: number;
      } = {
        action,
        // Guarded above: echo the exact safe integer received from GET.
        expected_draft_revision: data.draft_revision,
      };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => null);

      if (response.status === 409) {
        const revision = currentConflictRevision(body);
        await mutate();
        setActionError(
          revision === null
            ? t(
                "This draft changed in another session. We refreshed its readiness; review the latest version before publishing again.",
              )
            : t(
                "This draft changed in another session. We refreshed to revision {revision}; review it before publishing again.",
                { revision },
              ),
        );
        return;
      }

      if (!response.ok) {
        setActionError(
          translateError(body?.message, "Failed to update publication status."),
        );
        return;
      }

      const publication = body as PublicationApi;
      await mutate(publication, { revalidate: false });
      void Promise.all([
        mutateGlobal(`/api/v1/stores/${store.slug}?preview=1`),
        mutateGlobal("/api/v1/stores"),
      ]).catch(() => undefined);

      if (
        action === "publish" &&
        publication.status === "PUBLISHED" &&
        !isPublished
      ) {
        setJustPublished(true);
        setMessage(t("Your Outlet is published and available to players."));
        creatorFunnelAnalytics.published({
          funnelVersion: CREATOR_OUTLET_FUNNEL_VERSION,
          entrySurface: "manage_outlet",
        });
      } else if (action === "publish" && publication.status === "PUBLISHED") {
        setJustPublished(true);
        setMessage(t("Your latest changes are now published."));
      } else if (action === "unpublish" && publication.status === "DRAFT") {
        setJustPublished(false);
        setMessage(t("Your Outlet is now private and back in draft."));
      }
    } finally {
      setPendingAction(null);
    }
  }

  function openPreview() {
    const opened = window.open(`/store/${store.slug}?preview=1`, "_blank");
    if (!opened) return;
    opened.opener = null;
    creatorFunnelAnalytics.previewed({
      funnelVersion: CREATOR_OUTLET_FUNNEL_VERSION,
      entrySurface: "manage_outlet",
      outletState: isPublished ? "published" : "draft",
    });
  }

  async function copyPublicLink() {
    if (!isPublished || pendingAction) return;
    setPendingAction("copy");
    setActionError(null);
    try {
      await navigator.clipboard.writeText(
        new URL(`/store/${store.slug}`, window.location.origin).toString(),
      );
      setMessage(t("Public Outlet link copied."));
      creatorFunnelAnalytics.linkCopied({
        funnelVersion: CREATOR_OUTLET_FUNNEL_VERSION,
        entrySurface: "manage_outlet",
        copyContext: justPublished ? "publish_success" : "manage",
      });
    } catch {
      setActionError(
        t("We could not copy the link. Copy it from the preview instead."),
      );
    } finally {
      setPendingAction(null);
    }
  }

  if (isLoading) {
    return (
      <section
        aria-label={t("Publication status")}
        className="flex min-h-48 items-center justify-center rounded-2xl border border-white/10 bg-[#14101c]"
      >
        <Loader2 className="animate-spin text-white/30" size={24} />
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="rounded-2xl border border-rose-400/20 bg-rose-400/[0.06] p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 shrink-0 text-rose-300" size={20} />
          <div>
            <h2 className="font-black">
              {t("Publication status unavailable")}
            </h2>
            <p className="mt-1 text-sm font-semibold text-white/50">
              {t(
                "We could not load readiness. Publishing remains disabled until it is refreshed.",
              )}
            </p>
            <button
              type="button"
              onClick={() => void mutate()}
              className="mt-4 rounded-lg border border-white/10 px-4 py-2 text-xs font-black uppercase tracking-wider text-white/70 hover:bg-white/5 hover:text-white"
            >
              {t("Try again")}
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#14101c] shadow-[0_20px_70px_rgba(0,0,0,0.2)]">
      <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.7fr)] lg:p-7">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] ${
                isPublished
                  ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-200"
                  : "border-violet-300/25 bg-violet-400/10 text-violet-200"
              }`}
            >
              {isPublished ? <Globe2 size={13} /> : <LockKeyhole size={13} />}
              {isPublished ? t("Published") : t("Draft")}
            </span>
            {isValidating && (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-white/35">
                <Loader2 className="animate-spin" size={13} />
                {t("Refreshing readiness...")}
              </span>
            )}
          </div>

          <h2 className="mt-4 text-xl font-black sm:text-2xl">
            {isPublished
              ? hasPendingChanges
                ? data.readiness.ready
                  ? t("Changes ready to publish")
                  : t("Finish your changes before publishing")
                : t("Your Outlet is live")
              : data.readiness.ready
                ? t("Ready to publish")
                : t("Finish your Outlet before publishing")}
          </h2>
          <p className="mt-2 max-w-xl text-sm font-semibold leading-6 text-white/50">
            {isPublished
              ? t(
                  "Players see the latest published snapshot while your preview shows the working draft.",
                )
              : t(
                  "Preview the working draft at any time. Publishing creates the stable version players will see.",
                )}
          </p>
          {isPublished && data.published_at && (
            <p className="mt-3 text-xs font-bold text-white/35">
              {t("Published {date}", {
                date: new Date(data.published_at).toLocaleString(locale),
              })}
            </p>
          )}

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              onClick={openPreview}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-black text-white/80 transition hover:bg-white/[0.08] hover:text-white"
            >
              <Eye size={16} />
              {t("Preview draft")}
            </button>
            {isPublished && (
              <button
                type="button"
                onClick={() => void copyPublicLink()}
                disabled={pendingAction !== null}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-black text-white/80 transition hover:bg-white/[0.08] hover:text-white disabled:opacity-40"
              >
                {pendingAction === "copy" ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <Copy size={16} />
                )}
                {t("Copy public link")}
              </button>
            )}
            {(!isPublished || hasPendingChanges) && (
              <button
                type="button"
                onClick={() => void transition("publish")}
                disabled={pendingAction !== null || !canPublish}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-5 py-2.5 text-sm font-black uppercase tracking-wider text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-35"
              >
                {pendingAction === "publish" ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <Rocket size={16} />
                )}
                {isPublished ? t("Publish changes") : t("Publish Outlet")}
              </button>
            )}
            {isPublished && (
              <button
                type="button"
                onClick={() => void transition("unpublish")}
                disabled={pendingAction !== null || !revisionIsValid}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-rose-300/20 bg-rose-400/10 px-5 py-2.5 text-sm font-black uppercase tracking-wider text-rose-200 transition hover:bg-rose-400/15 disabled:cursor-not-allowed disabled:opacity-35"
              >
                {pendingAction === "unpublish" ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <LockKeyhole size={16} />
                )}
                {t("Unpublish")}
              </button>
            )}
          </div>

          {actionError && (
            <p
              role="alert"
              className="mt-4 rounded-xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm font-bold text-rose-200"
            >
              {actionError}
            </p>
          )}
          {message && (
            <p
              role="status"
              aria-live="polite"
              className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.08] px-4 py-3 text-sm font-bold text-emerald-200"
            >
              {message}
            </p>
          )}
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-black/15 p-4 sm:p-5">
          <h3 className="text-xs font-black uppercase tracking-[0.16em] text-white/45">
            {t("Publication readiness")}
          </h3>
          <p className="mt-3 text-sm font-bold text-white/60">
            {t(
              data.readiness.catalog_game_count === 1
                ? "{count} eligible game in the draft catalog"
                : "{count} eligible games in the draft catalog",
              { count: data.readiness.catalog_game_count },
            )}
          </p>
          {data.readiness.ready ? (
            <div className="mt-4 flex items-start gap-3 rounded-lg border border-emerald-300/15 bg-emerald-400/[0.07] p-3 text-sm font-bold text-emerald-100/80">
              <CheckCircle2
                className="mt-0.5 shrink-0 text-emerald-300"
                size={18}
              />
              <span>{t("Every publication requirement is complete.")}</span>
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {(data.readiness.blockers ?? []).map((blocker) => (
                <li
                  key={blocker.code}
                  className="flex items-start gap-3 text-sm font-bold"
                >
                  <Circle
                    className="mt-0.5 shrink-0 text-amber-200/45"
                    size={18}
                  />
                  <span className="leading-5 text-white/55">
                    {publicationBlockerCopy(blocker, t)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {!revisionIsValid && (
            <p
              role="alert"
              className="mt-4 text-xs font-bold leading-5 text-amber-200/80"
            >
              {t(
                "The draft revision is unavailable. Refresh before publishing.",
              )}
            </p>
          )}
          {!readinessVersionIsValid && (
            <p
              role="alert"
              className="mt-4 text-xs font-bold leading-5 text-amber-200/80"
            >
              {t("Readiness is out of date. Refresh before publishing.")}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

type FeaturedRecommendationDraft = {
  game: GameApi;
  recommendationReason: string;
};

type FeaturedResponse = {
  games: GameApi[];
  mode: "EDITORIAL" | "HYBRID" | "AUTOMATIC";
};

function FeaturedTab({
  storeSlug,
  storeName,
}: {
  storeSlug: string;
  storeName: string;
}) {
  const { t, translateError } = useI18n();
  const { mutate: mutateGlobal } = useSWRConfig();
  const featuredEndpoint = `/api/v1/stores/${storeSlug}/featured`;
  const featuredKey = `${featuredEndpoint}?preview=1`;
  const { data, isLoading, error, mutate } = useSWR<FeaturedResponse>(
    featuredKey,
    fetcher,
  );
  const [recommendations, setRecommendations] = useState<
    FeaturedRecommendationDraft[]
  >([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setIsInitialized(false);
    setRecommendations([]);
  }, [featuredKey]);

  useEffect(() => {
    if (!data || isInitialized) return;
    setRecommendations(
      data.mode === "EDITORIAL"
        ? data.games.map((featuredGame) => ({
            game: featuredGame,
            recommendationReason: featuredGame.recommendation_reason ?? "",
          }))
        : data.mode === "HYBRID"
          ? data.games
              .filter(
                (featuredGame) => featuredGame.featured_source === "EDITORIAL",
              )
              .map((featuredGame) => ({
                game: featuredGame,
                recommendationReason: featuredGame.recommendation_reason ?? "",
              }))
          : [],
    );
    setIsInitialized(true);
  }, [data, isInitialized]);

  function addGame(game: GameApi) {
    setFormError(null);
    setSuccess(null);
    if (recommendations.some((entry) => entry.game.slug === game.slug)) {
      setFormError(t("{title} is already in Featured.", { title: game.title }));
      return;
    }
    if (recommendations.length >= 3) {
      setFormError(t("Featured can contain up to three games."));
      return;
    }
    setRecommendations((current) => [
      ...current,
      { game, recommendationReason: "" },
    ]);
  }

  function moveGame(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= recommendations.length) return;
    setRecommendations((current) => {
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
    setSuccess(null);
  }

  function updateReason(index: number, recommendationReason: string) {
    setRecommendations((current) =>
      current.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, recommendationReason } : entry,
      ),
    );
    setSuccess(null);
  }

  async function handleSave() {
    if (recommendations.length === 0) return;
    if (
      recommendations.some(
        ({ recommendationReason }) => !recommendationReason.trim(),
      )
    ) {
      setFormError(t("Add a recommendation reason for every Featured game."));
      return;
    }
    const hadEditorialSelection =
      data?.games.some((game) => game.featured_source === "EDITORIAL") ||
      data?.mode === "EDITORIAL";
    setIsSubmitting(true);
    setFormError(null);
    setSuccess(null);
    try {
      const response = await fetch(featuredEndpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recommendations: recommendations.map(
            ({ game, recommendationReason }) => ({
              game_slug: game.slug,
              recommendation_reason: recommendationReason.trim(),
            }),
          ),
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setFormError(
          translateError(body?.message, "Failed to update Featured games."),
        );
        return;
      }
      setSuccess(t("Featured recommendations saved."));
      await Promise.all([
        mutate(),
        mutateGlobal(publicationEndpoint(storeSlug)),
      ]);
      if (!hadEditorialSelection) {
        creatorFunnelAnalytics.firstGameAdded({
          funnelVersion: CREATOR_OUTLET_FUNNEL_VERSION,
          entrySurface: "manage_outlet",
          selectionSurface: "featured",
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleReset() {
    setIsSubmitting(true);
    setFormError(null);
    setSuccess(null);
    try {
      const response = await fetch(featuredEndpoint, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setFormError(
          translateError(
            body?.message,
            "Failed to restore automatic Featured.",
          ),
        );
        return;
      }
      setRecommendations([]);
      setSuccess(t("Automatic Featured restored."));
      await Promise.all([
        mutate(),
        mutateGlobal(publicationEndpoint(storeSlug)),
      ]);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading || !isInitialized) {
    return <Loader2 className="animate-spin text-white/30" size={24} />;
  }

  if (error) {
    return (
      <p className="text-rose-300 font-bold text-sm">
        {t("Failed to load Featured recommendations.")}
      </p>
    );
  }

  return (
    <div className="flex max-w-4xl flex-col gap-7">
      <div>
        <h2 className="text-xl font-black">
          {t("Your Featured recommendations")}
        </h2>
        <p className="mt-1 max-w-2xl text-sm font-semibold leading-relaxed text-white/50">
          {t(
            "Choose up to three games and tell visitors why each one is worth playing. The first game receives the largest spot on {name}.",
            { name: storeName },
          )}
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
        {recommendations.length < 3 ? (
          <GameAutocomplete
            endpoint={`/api/v1/stores/${storeSlug}/search?preview=1`}
            onSelect={addGame}
            placeholder={t("Search games in this Outlet...")}
          />
        ) : (
          <p className="text-sm font-bold text-white/40">
            {t(
              "All three Featured spots are filled. Remove a game to choose another.",
            )}
          </p>
        )}
      </div>

      {data?.mode !== "AUTOMATIC" && recommendations.length === 0 && (
        <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm font-bold text-amber-200">
          {t(
            "This Outlet has an editorial selection, but none of its games are currently available. Reset it or choose new games.",
          )}
        </div>
      )}

      {recommendations.length === 0 && data?.mode === "AUTOMATIC" ? (
        <div className="rounded-2xl border border-dashed border-white/10 px-5 py-10 text-center">
          <p className="font-black text-white/70">
            {t("Featured is automatic")}
          </p>
          <p className="mt-1 text-sm font-semibold text-white/35">
            {t("Add a game above to turn this into an editorial selection.")}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {recommendations.map((entry, index) => (
            <article
              key={entry.game.id}
              className="overflow-hidden rounded-2xl border border-white/10 bg-[#14101c]"
            >
              <div className="flex flex-col gap-4 p-4 sm:flex-row sm:p-5">
                <div
                  className="aspect-video w-full shrink-0 rounded-xl border border-white/10 bg-[#21152f] sm:w-48"
                  style={{
                    background: entry.game.media?.banner
                      ? `url(${entry.game.media.banner}) center/cover no-repeat`
                      : undefined,
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-300/70">
                        {t("Position {position}", { position: index + 1 })}
                      </span>
                      <h3 className="truncate text-lg font-black text-white">
                        {entry.game.title}
                      </h3>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveGame(index, -1)}
                        disabled={index === 0}
                        className="rounded-lg border border-white/10 p-2 text-white/60 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-20"
                        aria-label={t("Move {title} up", {
                          title: entry.game.title,
                        })}
                      >
                        <ArrowUp size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveGame(index, 1)}
                        disabled={index === recommendations.length - 1}
                        className="rounded-lg border border-white/10 p-2 text-white/60 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-20"
                        aria-label={t("Move {title} down", {
                          title: entry.game.title,
                        })}
                      >
                        <ArrowDown size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRecommendations((current) =>
                            current.filter(
                              (_, entryIndex) => entryIndex !== index,
                            ),
                          );
                          setSuccess(null);
                        }}
                        className="rounded-lg border border-rose-400/20 p-2 text-rose-300/70 transition hover:bg-rose-400/10 hover:text-rose-200"
                        aria-label={t("Remove {title}", {
                          title: entry.game.title,
                        })}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  <label className="mt-4 block">
                    <span className="text-xs font-black uppercase tracking-wider text-white/45">
                      {t("Why do you recommend it?")}
                    </span>
                    <textarea
                      value={entry.recommendationReason}
                      onChange={(event) =>
                        updateReason(index, event.target.value)
                      }
                      maxLength={240}
                      required
                      rows={2}
                      placeholder={t(
                        "A short, personal reason this game is worth their time.",
                      )}
                      className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-base font-semibold leading-relaxed text-white outline-none placeholder:text-white/25 focus:border-violet-400/40 focus:bg-white/[0.07] sm:text-sm"
                    />
                    <span className="mt-1 block text-right text-[11px] font-bold text-white/30">
                      {entry.recommendationReason.length}/240
                    </span>
                  </label>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {formError && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-bold text-rose-300">
          {formError}
        </div>
      )}
      {success && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-300">
          {success}
        </div>
      )}

      <div className="flex flex-col-reverse gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={handleReset}
          disabled={isSubmitting}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm font-black text-white/55 transition hover:bg-white/5 hover:text-white disabled:opacity-40"
        >
          <RotateCcw size={15} />
          {t("Use automatic Featured")}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={
            isSubmitting ||
            recommendations.length === 0 ||
            recommendations.some(
              ({ recommendationReason }) => !recommendationReason.trim(),
            )
          }
          className="rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-5 py-3 text-sm font-black uppercase tracking-wider text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isSubmitting ? t("Saving...") : t("Save Featured")}
        </button>
      </div>
    </div>
  );
}

function CurationTab({
  storeSlug,
  tagFilters,
  isTagFiltersLoading,
}: {
  storeSlug: string;
  tagFilters: TagFilterApi[];
  isTagFiltersLoading?: boolean;
}) {
  const { mutate } = useSWRConfig();
  const { t, translateError } = useI18n();
  const [tag, setTag] = useState("");
  const [mode, setMode] = useState<"WHITELIST" | "BLACKLIST">("WHITELIST");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [draftRevision, setDraftRevision] = useState<number | null>(null);
  const [pendingRule, setPendingRule] = useState<{
    action: "UPSERT" | "REMOVE";
    tag: string;
    mode?: "WHITELIST" | "BLACKLIST";
    previous: TagFilterApi | null;
    impact: TagFilterImpactApi;
  } | null>(null);
  const [isPreviewingRule, setIsPreviewingRule] = useState(false);
  const [lastRuleChange, setLastRuleChange] = useState<{
    changeId: string;
    draftRevision: number;
  } | null>(null);

  const tagFiltersKey = `/api/v1/stores/${storeSlug}/tag-filters`;
  const previewKey = `${tagFiltersKey}/preview`;

  useEffect(() => {
    if (draftRevision === null) return;
    void mutate(publicationEndpoint(storeSlug));
  }, [draftRevision, mutate, storeSlug]);

  async function previewRuleChange({
    action,
    targetTag,
    targetMode,
    previous,
  }: {
    action: "UPSERT" | "REMOVE";
    targetTag: string;
    targetMode?: "WHITELIST" | "BLACKLIST";
    previous: TagFilterApi | null;
  }) {
    if (draftRevision === null) return;
    setError(null);
    setSuccess(null);
    setPendingRule(null);
    setIsPreviewingRule(true);
    try {
      const response = await fetch(previewKey, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          tag: targetTag.trim(),
          ...(targetMode && { mode: targetMode }),
          expected_draft_revision: draftRevision,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(
          translateError(body?.message, "Failed to preview tag rule impact."),
        );
        return;
      }
      setPendingRule({
        action,
        tag: targetTag.trim(),
        mode: targetMode,
        previous,
        impact: body,
      });
    } finally {
      setIsPreviewingRule(false);
    }
  }

  async function handlePreviewNewRule(event: React.FormEvent) {
    event.preventDefault();
    if (!tag.trim()) return;
    await previewRuleChange({
      action: "UPSERT",
      targetTag: tag,
      targetMode: mode,
      previous:
        tagFilters.find(
          (filter) => filter.tag.toLowerCase() === tag.trim().toLowerCase(),
        ) ?? null,
    });
  }

  async function applyRuleChange() {
    if (!pendingRule) return;
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`${tagFiltersKey}/changes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: pendingRule.action,
          tag: pendingRule.tag,
          ...(pendingRule.mode && { mode: pendingRule.mode }),
          expected_draft_revision: pendingRule.impact.draft_revision,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(translateError(body?.message, "Failed to update tag rule."));
        return;
      }
      setDraftRevision(body.draft_revision);
      setLastRuleChange(
        body.change_id
          ? { changeId: body.change_id, draftRevision: body.draft_revision }
          : null,
      );
      setSuccess(t("Tag rule saved."));
      setTag("");
      setPendingRule(null);
      await Promise.all([
        mutate(tagFiltersKey),
        mutate(publicationEndpoint(storeSlug)),
      ]);
    } finally {
      setIsSubmitting(false);
    }
  }

  const canUndoRule = Boolean(lastRuleChange);

  async function undoRuleChange() {
    if (!lastRuleChange || !canUndoRule) return;
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(
        `${tagFiltersKey}/changes/${lastRuleChange.changeId}/undo`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expected_draft_revision: lastRuleChange.draftRevision,
          }),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(translateError(body?.message, "Failed to undo tag rule."));
        return;
      }
      setSuccess(t("Last change undone."));
      setDraftRevision(body.draft_revision);
      setLastRuleChange(null);
      await Promise.all([
        mutate(tagFiltersKey),
        mutate(publicationEndpoint(storeSlug)),
      ]);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <CatalogCurationWorkspace
        storeSlug={storeSlug}
        onDraftRevisionChange={setDraftRevision}
      />

      <section className="rounded-3xl border border-white/[0.09] bg-[#100c17] p-5 sm:p-7">
        <button
          type="button"
          onClick={() => setIsAdvancedOpen((open) => !open)}
          aria-expanded={isAdvancedOpen}
          aria-controls="advanced-curation-rules"
          className="flex w-full items-center justify-between gap-3 text-left text-sm font-black uppercase tracking-wider text-white/65 transition-colors hover:text-white"
        >
          <span>
            <span className="block text-base normal-case tracking-normal text-white">
              {t("Advanced rules")}
            </span>
            <span className="mt-1 block text-xs normal-case tracking-normal text-white/35">
              {t("Tag rules and direct game overrides")}
            </span>
          </span>
          <ChevronDown
            size={18}
            className={`shrink-0 transition-transform ${isAdvancedOpen ? "rotate-180" : ""}`}
          />
        </button>

        {isAdvancedOpen && (
          <div
            id="advanced-curation-rules"
            className="mt-6 flex flex-col gap-8 border-t border-white/[0.08] pt-6"
          >
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="text-lg font-black">{t("Rules by tag")}</h3>
                <p className="mt-1 max-w-2xl text-sm font-semibold leading-relaxed text-white/45">
                  {t(
                    "Tag rules can shape the catalog automatically. You will review their exact impact before saving.",
                  )}
                </p>
              </div>

              <form
                onSubmit={handlePreviewNewRule}
                className="flex flex-wrap gap-2"
              >
                <input
                  type="text"
                  value={tag}
                  onChange={(event) => setTag(event.target.value)}
                  placeholder={t("e.g. RPG")}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-base font-bold text-white placeholder:text-white/30 outline-none focus:border-violet-400/40 focus:bg-white/10 sm:w-auto sm:min-w-[160px] sm:flex-1 sm:text-sm"
                />
                <select
                  value={mode}
                  onChange={(event) =>
                    setMode(event.target.value as "WHITELIST" | "BLACKLIST")
                  }
                  aria-label={t("Tag rule result")}
                  className="rounded-xl border border-white/10 bg-[#17121f] px-4 py-2.5 text-sm font-bold text-white outline-none focus:border-violet-400/40"
                >
                  <option value="WHITELIST">{t("Show")}</option>
                  <option value="BLACKLIST">{t("Hide")}</option>
                </select>
                <button
                  type="submit"
                  disabled={isPreviewingRule || isSubmitting || !tag.trim()}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-400/30 bg-violet-500/15 px-4 py-2.5 text-sm font-black text-violet-100 transition hover:bg-violet-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isPreviewingRule && (
                    <Loader2 size={15} className="animate-spin" />
                  )}
                  {t("Review impact")}
                </button>
              </form>

              {pendingRule && (
                <div
                  role="status"
                  aria-live="polite"
                  className="rounded-2xl border border-violet-300/20 bg-violet-400/[0.08] p-4 sm:p-5"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-violet-200/65">
                        {t("Rule impact")}
                      </p>
                      <p className="mt-1 font-black text-white">
                        {pendingRule.action === "REMOVE"
                          ? t("Remove rule for {tag}", {
                              tag: pendingRule.tag,
                            })
                          : t(
                              pendingRule.mode === "WHITELIST"
                                ? "Show games tagged {tag}"
                                : "Hide games tagged {tag}",
                              { tag: pendingRule.tag },
                            )}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-white/50">
                        {t(
                          "{before} shown now → {after} after saving · {shown} added · {hidden} removed",
                          {
                            before: pendingRule.impact.current_count,
                            after: pendingRule.impact.result_count,
                            shown: pendingRule.impact.shown_count,
                            hidden: pendingRule.impact.hidden_count,
                          },
                        )}
                      </p>
                    </div>
                    <div className="flex flex-col-reverse gap-2 sm:flex-row">
                      <button
                        type="button"
                        onClick={() => setPendingRule(null)}
                        className="rounded-xl border border-white/10 px-3.5 py-2.5 text-sm font-black text-white/55 hover:bg-white/5 hover:text-white"
                      >
                        {t("Cancel")}
                      </button>
                      <button
                        type="button"
                        onClick={applyRuleChange}
                        disabled={isSubmitting}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-black text-white transition hover:bg-violet-400 disabled:opacity-50"
                      >
                        {isSubmitting ? (
                          <Loader2 size={15} className="animate-spin" />
                        ) : (
                          <Check size={15} />
                        )}
                        {isSubmitting ? t("Saving...") : t("Apply rule")}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-bold text-rose-300"
                >
                  {error}
                </div>
              )}
              {success && (
                <div
                  role="status"
                  aria-live="polite"
                  className="flex flex-col gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-300 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span>{success}</span>
                  {canUndoRule && (
                    <button
                      type="button"
                      onClick={undoRuleChange}
                      disabled={isSubmitting}
                      className="inline-flex w-fit items-center gap-2 rounded-lg border border-emerald-300/20 px-3 py-1.5 text-xs font-black hover:bg-white/10 disabled:opacity-50"
                    >
                      <RotateCcw size={14} /> {t("Undo")}
                    </button>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {isTagFiltersLoading ? (
                  <Loader2 className="animate-spin text-white/30" size={20} />
                ) : tagFilters.length === 0 ? (
                  <p className="text-sm font-bold italic text-white/30">
                    {t("No tag rules yet — showing the full catalog.")}
                  </p>
                ) : (
                  tagFilters.map((filter) => (
                    <div
                      key={filter.id}
                      className={`flex items-center gap-1 rounded-xl border py-1.5 pl-3 pr-1.5 text-sm font-bold ${
                        filter.mode === "WHITELIST"
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                          : "border-rose-500/30 bg-rose-500/10 text-rose-300"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          previewRuleChange({
                            action: "UPSERT",
                            targetTag: filter.tag,
                            targetMode:
                              filter.mode === "WHITELIST"
                                ? "BLACKLIST"
                                : "WHITELIST",
                            previous: filter,
                          })
                        }
                        className="rounded-md px-1 py-0.5 hover:bg-white/10"
                        aria-label={t("Change {tag} rule to {action}", {
                          tag: filter.tag,
                          action: t(
                            filter.mode === "WHITELIST" ? "Hide" : "Show",
                          ),
                        })}
                      >
                        {filter.mode === "WHITELIST" ? t("Show") : t("Hide")}:{" "}
                        {filter.tag}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          previewRuleChange({
                            action: "REMOVE",
                            targetTag: filter.tag,
                            previous: filter,
                          })
                        }
                        className="rounded-md p-1.5 text-white/40 transition hover:bg-white/10 hover:text-white"
                        aria-label={t("Remove {tag} rule", {
                          tag: filter.tag,
                        })}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <GameOverridesPanel
              storeSlug={storeSlug}
              draftRevision={draftRevision}
            />
          </div>
        )}
      </section>
    </div>
  );
}

function GameOverridesPanel({
  storeSlug,
  draftRevision,
}: {
  storeSlug: string;
  draftRevision: number | null;
}) {
  const { mutate } = useSWRConfig();
  const { t, translateError } = useI18n();
  const overridesKey = `/api/v1/stores/${storeSlug}/game-overrides`;

  const { data: overrides, isLoading } = useSWR<GameOverrideApi[]>(
    overridesKey,
    fetcher,
  );

  const [selectedGame, setSelectedGame] = useState<GameApi | null>(null);
  const [visibility, setVisibility] = useState<"SHOW" | "HIDE">("SHOW");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleAddOverride(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedGame || draftRevision === null) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch(overridesKey, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          game_slug: selectedGame.slug,
          visibility,
          expected_draft_revision: draftRevision,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(translateError(body?.message, "Failed to add game override."));
        return;
      }
      setSelectedGame(null);
      await Promise.all([
        mutate(overridesKey),
        mutate(
          (key) =>
            typeof key === "string" &&
            key.startsWith(`/api/v1/stores/${storeSlug}/curation-catalog?`),
        ),
        mutate(publicationEndpoint(storeSlug)),
      ]);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRemoveOverride(override: GameOverrideApi) {
    if (draftRevision === null) return;
    setError(null);
    const response = await fetch(
      `${overridesKey}/${encodeURIComponent(override.game_slug)}`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expected_draft_revision: draftRevision }),
      },
    );
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(
        translateError(body?.message, "Failed to remove game override."),
      );
      return;
    }
    await Promise.all([
      mutate(overridesKey),
      mutate(
        (key) =>
          typeof key === "string" &&
          key.startsWith(`/api/v1/stores/${storeSlug}/curation-catalog?`),
      ),
      mutate(publicationEndpoint(storeSlug)),
    ]);
  }

  return (
    <div className="mt-4 pl-6 border-l border-white/10 flex flex-col gap-4">
      <p className="text-white/50 text-sm font-bold">
        {t(
          "Show or hide a specific game. Hide always excludes; Show overrides a hide-by-tag rule.",
        )}
      </p>

      <form onSubmit={handleAddOverride} className="flex flex-wrap gap-2">
        {selectedGame ? (
          <div className="flex-1 min-w-[160px] flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <div
              className="h-8 aspect-[16/9] rounded-md shrink-0 border border-white/5"
              style={{
                background: selectedGame.media.banner
                  ? `url(${selectedGame.media.banner}) center/cover no-repeat`
                  : "linear-gradient(135deg, var(--color-purple-dark) 0%, rgba(53,34,89,0.7) 100%)",
              }}
            />
            <span className="flex-1 font-bold text-white text-sm truncate">
              {selectedGame.title}
            </span>
            <button
              type="button"
              onClick={() => setSelectedGame(null)}
              className="text-white/40 hover:text-white transition-colors shrink-0"
              aria-label={t("Clear selected game")}
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <GameAutocomplete
            endpoint={`/api/v1/stores/${storeSlug}/search?preview=1`}
            onSelect={(game) => setSelectedGame(game)}
            placeholder={t("Search games...")}
          />
        )}
        <select
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as "SHOW" | "HIDE")}
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-white outline-none focus:bg-white/10 focus:border-white/20"
        >
          <option value="SHOW">{t("Show game")}</option>
          <option value="HIDE">{t("Hide game")}</option>
        </select>
        <button
          type="submit"
          disabled={isSubmitting || !selectedGame}
          className="rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2.5 text-sm font-black uppercase tracking-wider text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t("Add")}
        </button>
      </form>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm font-bold">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {isLoading ? (
          <Loader2 className="animate-spin text-white/30" size={20} />
        ) : !overrides || overrides.length === 0 ? (
          <p className="text-white/30 text-sm font-bold italic">
            {t("No per-game overrides yet.")}
          </p>
        ) : (
          overrides.map((override) => (
            <OverrideChip
              key={override.id}
              override={override}
              onRemove={handleRemoveOverride}
            />
          ))
        )}
      </div>
    </div>
  );
}

function OverrideChip({
  override,
  onRemove,
}: {
  override: GameOverrideApi;
  onRemove: (override: GameOverrideApi) => void;
}) {
  const { t } = useI18n();
  const { data: game } = useSWR<GameApi>(
    `/api/v1/items/games/${override.game_slug}`,
    (url) => fetch(url).then((res) => (res.ok ? res.json() : null)),
  );

  return (
    <div
      className={`flex items-center gap-2 pl-2 pr-2 py-1.5 rounded-xl border text-sm font-bold ${
        override.visibility === "SHOW"
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
          : "border-rose-500/30 bg-rose-500/10 text-rose-300"
      }`}
    >
      {game?.media.banner && (
        <div
          className="h-6 aspect-[16/9] rounded shrink-0 border border-white/10"
          style={{
            background: `url(${game.media.banner}) center/cover no-repeat`,
          }}
        />
      )}
      <span>
        {override.visibility === "SHOW" ? t("Shown") : t("Hidden")}:{" "}
        {game?.title ?? override.game_slug}
      </span>
      <button
        onClick={() => onRemove(override)}
        className="text-white/40 hover:text-white transition-colors"
        aria-label={t("Remove override for {title}", {
          title: game?.title ?? override.game_slug,
        })}
      >
        <X size={14} />
      </button>
    </div>
  );
}

function SettingsTab({ store }: { store: StoreApi }) {
  const { t, translateError } = useI18n();
  const [name, setName] = useState(store.name);
  const [description, setDescription] = useState(store.description ?? "");
  const [logoUrl, setLogoUrl] = useState(store.logo_url ?? "");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { mutate } = useSWRConfig();
  const publicationKey = publicationEndpoint(store.slug);
  const { data: publication, mutate: mutatePublication } =
    useSWR<PublicationApi>(publicationKey, fetcher);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(false);
    setIsSubmitting(true);
    const wasBrandComplete = publicationCheckReady(
      publication?.readiness.checks.brand_complete,
    );
    try {
      const response = await fetch(`/api/v1/stores/${store.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description.trim() || undefined,
          logo_url: logoUrl.trim() || undefined,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(translateError(body?.message, "Failed to update Outlet."));
        return;
      }
      setSuccess(true);
      const refreshedPublication = await mutatePublication();
      await Promise.all([
        mutate(`/api/v1/stores/${store.slug}?preview=1`),
        mutate("/api/v1/stores"),
      ]);
      if (
        publication &&
        !wasBrandComplete &&
        publicationCheckReady(
          refreshedPublication?.readiness.checks.brand_complete,
        )
      ) {
        creatorFunnelAnalytics.brandComplete({
          funnelVersion: CREATOR_OUTLET_FUNNEL_VERSION,
          entrySurface: "manage_outlet",
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-md">
      <label className="flex flex-col gap-2">
        <span className="text-xs font-black uppercase tracking-wider text-white/40">
          {t("Outlet name")}
        </span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white outline-none focus:bg-white/10 focus:border-white/20"
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-xs font-black uppercase tracking-wider text-white/40">
          {t("Description")}
        </span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white outline-none focus:bg-white/10 focus:border-white/20 resize-none"
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-xs font-black uppercase tracking-wider text-white/40">
          {t("Logo URL")}
        </span>
        <input
          type="text"
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
          placeholder="https://example.com/logo.png"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white placeholder:text-white/30 outline-none focus:bg-white/10 focus:border-white/20"
        />
      </label>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm font-bold">
          {error}
        </div>
      )}
      {success && (
        <div className="px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm font-bold">
          {t("Saved.")}
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting || !name.trim()}
        className="w-fit rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-3 text-sm font-black uppercase tracking-wider text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isSubmitting ? t("Saving...") : t("Save Changes")}
      </button>
    </form>
  );
}

function SalesTab({ storeSlug }: { storeSlug: string }) {
  const [page, setPage] = useState(1);
  const { locale, t } = useI18n();

  const { data, isLoading, error } = useSWR<{
    sales: SaleApi[];
    pagination: PaginationApi;
  }>(`/api/v1/stores/${storeSlug}/sales?page=${page}`, fetcher);

  if (isLoading) {
    return <Loader2 className="animate-spin text-white/30" size={24} />;
  }

  if (error) {
    return (
      <p className="text-rose-300 font-bold text-sm">
        {t("Failed to load sales.")}
      </p>
    );
  }

  const sales = data?.sales ?? [];
  const pagination = data?.pagination;
  const total = pagination?.total ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-white/50 text-sm font-bold">
          {t(
            total === 1
              ? "{count} sale attributed to this Outlet."
              : "{count} sales attributed to this Outlet.",
            { count: total.toLocaleString(locale) },
          )}
        </p>
        <p className="text-white/30 text-xs font-bold mt-1">
          {t(
            "Buyers are shown as an anonymous reference. The same reference is the same person returning to your Outlet.",
          )}
        </p>
      </div>

      {sales.length === 0 ? (
        <p className="text-white/30 text-sm font-bold italic">
          {t("No sales yet. Share your Outlet link to start tracking sales.")}
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {sales.map((sale) => (
              <div
                key={sale.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 rounded-xl border border-white/10 bg-white/5"
              >
                <div className="min-w-0 flex-1">
                  {sale.game_slug ? (
                    <Link
                      href={`/item/${sale.game_slug}`}
                      className="font-bold text-sm text-white truncate hover:underline"
                    >
                      {sale.game_title}
                    </Link>
                  ) : (
                    <span className="font-bold text-sm text-white truncate">
                      {sale.game_title}
                    </span>
                  )}
                  <div className="text-white/30 text-xs font-bold font-mono mt-0.5">
                    {sale.buyer_ref}
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <span className="font-black text-sm text-emerald-300">
                    {formatMoney(sale.price_at_sale, sale.currency)}
                  </span>
                  <span className="text-white/40 text-xs font-bold">
                    {new Date(sale.created_at).toLocaleDateString(locale)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <Pagination pagination={pagination} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}

// What this outlet has earned, straight from the ledger.
//
// One row per currency and never a single total: an outlet can hold a BRL
// balance and a USD balance at once and they are not addable. Amounts arrive
// already sign-flipped and at the ledger's own 4-decimal scale, so they
// reconcile against a real payment rather than against a rounded display value.
function EarningsTab({ storeSlug }: { storeSlug: string }) {
  const { t } = useI18n();
  const { data, isLoading, error } = useSWR<StatementApi>(
    `/api/v1/stores/${storeSlug}/statement`,
    fetcher,
  );

  if (isLoading) {
    return <Loader2 className="animate-spin text-white/30" size={24} />;
  }

  if (error) {
    return (
      <p className="text-rose-300 font-bold text-sm">
        {t("Failed to load earnings.")}
      </p>
    );
  }

  const balances = data?.balances ?? [];
  const holdDays = data?.hold_days ?? 30;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-black">{t("Earnings")}</h2>
        <p className="text-white/50 text-sm font-bold mt-1">
          {t(
            "Commission is held for {days} days after each sale so refunds and chargebacks can resolve. Held amounts become payable automatically.",
            { days: holdDays },
          )}
        </p>
      </div>

      {balances.length === 0 ? (
        <p className="text-white/30 text-sm font-bold italic">
          {t(
            "Nothing earned yet. Commission appears here once a sale is attributed to your Outlet.",
          )}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {balances.map((balance) => (
            <div
              key={balance.currency}
              className="flex flex-col gap-4 rounded-xl border border-white/[0.08] bg-[#14101c] p-5"
            >
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-xs font-black uppercase tracking-wider text-white/40">
                  {t("{currency} total", { currency: balance.currency })}
                </span>
                <span className="text-2xl font-black text-white">
                  {formatMoney(balance.total, balance.currency)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3">
                  <div className="text-xs font-black uppercase tracking-wider text-emerald-300/70">
                    {t("Payable now")}
                  </div>
                  <div className="text-lg font-black text-emerald-300 mt-1 break-all">
                    {formatMoney(balance.payable, balance.currency)}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                  <div className="text-xs font-black uppercase tracking-wider text-white/40">
                    {t("Held")}
                  </div>
                  <div className="text-lg font-black text-white/70 mt-1 break-all">
                    {formatMoney(balance.held, balance.currency)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-white/30 text-xs font-bold">
        {t(
          "Payments go to the account registered against this Outlet, not to whoever owns it. Transferring the Outlet does not move the balance.",
        )}
      </p>
    </div>
  );
}
