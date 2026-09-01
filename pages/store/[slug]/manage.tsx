import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Link from "next/link";
import useSWR, { useSWRConfig } from "swr";
import {
  Loader2,
  ExternalLink,
  X,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  Trash2,
  RotateCcw,
  Sparkles,
  Check,
} from "lucide-react";
import { CreatorWorkspaceLayout } from "components/creator/CreatorWorkspaceLayout";
import { CatalogCurationWorkspace } from "components/creator/CatalogCurationWorkspace";
import { GameAutocomplete } from "components/store/GameAutocomplete";
import { type GameApi } from "components/store/types";
import { Pagination, type PaginationApi } from "components/Pagination";
import { formatMoney } from "lib/price";
import { useI18n } from "lib/i18n";

interface StoreApi {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  owner_id: string;
  catalog_mode: "UNDECIDED" | "ALL" | "SELECTED";
}

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

type Tab = "games" | "settings" | "sales" | "earnings";

export default function StoreManagePage() {
  const router = useRouter();
  const { t } = useI18n();
  const slug = router.query.slug as string | undefined;
  const [tab, setTab] = useState<Tab>("games");

  const {
    data: storeData,
    isLoading: isStoreLoading,
    error: storeError,
  } = useSWR<StoreApi>(slug ? `/api/v1/stores/${slug}` : null, fetcher);

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
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-[#0b0812]">
        <Loader2 className="animate-spin text-white/30" size={32} />
      </div>
    );
  }

  if (storeError || !storeData) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-[#0b0812]">
        <p className="text-rose-300 font-bold">{t("Outlet not found.")}</p>
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
          <Link
            href={`/store/${storeData.slug}`}
            className="flex w-fit items-center gap-2 px-4 py-2 rounded-xl border border-white/10 bg-white/5 text-sm font-bold text-white/80 hover:bg-white/10 transition-colors shrink-0"
          >
            {t("View my Outlet")}
            <ExternalLink size={14} />
          </Link>
        </div>

        {/* Scrollable and shrink-proof, the same idiom BackofficeTopNav uses.
            Four tabs do not fit a 390px viewport: without this the row pushes
            the page into horizontal scroll and the last tab sits off-screen
            where it cannot be tapped at all. */}
        <div className="-mx-4 flex items-center gap-2 overflow-x-auto border-b border-white/10 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {(
            [
              ["games", "Your Games"],
              ["settings", "Settings"],
              ["sales", "Sales"],
              ["earnings", "Earnings"],
            ] as [Tab, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setTab(value)}
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

        {tab === "games" &&
          (tagFiltersError ? (
            <p className="text-rose-300 font-bold text-sm">
              {t(
                "You do not have permission to manage this Outlet's catalog curation.",
              )}
            </p>
          ) : (
            <CurationTab
              storeSlug={storeData.slug}
              storeName={storeData.name}
              tagFilters={tagFilters ?? []}
              isTagFiltersLoading={isTagFiltersLoading}
            />
          ))}
        {tab === "settings" && <SettingsTab store={storeData} />}
        {tab === "sales" && <SalesTab storeSlug={storeData.slug} />}
        {tab === "earnings" && <EarningsTab storeSlug={storeData.slug} />}
      </div>
    </div>
  );
}

StoreManagePage.getLayout = function getLayout(page: React.ReactElement) {
  return <CreatorWorkspaceLayout>{page}</CreatorWorkspaceLayout>;
};

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
  const featuredKey = `/api/v1/stores/${storeSlug}/featured`;
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
    setIsSubmitting(true);
    setFormError(null);
    setSuccess(null);
    try {
      const response = await fetch(featuredKey, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recommendations: recommendations.map(
            ({ game, recommendationReason }) => ({
              game_slug: game.slug,
              recommendation_reason: recommendationReason,
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
      await mutate();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleReset() {
    setIsSubmitting(true);
    setFormError(null);
    setSuccess(null);
    try {
      const response = await fetch(featuredKey, { method: "DELETE" });
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
      await mutate();
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
            endpoint={`/api/v1/stores/${storeSlug}/search`}
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
                      {t("Why do you recommend it?")}{" "}
                      <span className="normal-case">({t("optional")})</span>
                    </span>
                    <textarea
                      value={entry.recommendationReason}
                      onChange={(event) =>
                        updateReason(index, event.target.value)
                      }
                      maxLength={240}
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
          disabled={isSubmitting || recommendations.length === 0}
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
  storeName,
  tagFilters,
  isTagFiltersLoading,
}: {
  storeSlug: string;
  storeName: string;
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
      await mutate(tagFiltersKey);
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
      await mutate(tagFiltersKey);
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

      <section
        aria-labelledby="editorial-highlights-heading"
        className="rounded-3xl border border-white/[0.09] bg-[#100c17] p-5 sm:p-7"
      >
        <div className="mb-7 flex items-start gap-3 border-b border-white/[0.08] pb-5">
          <div className="rounded-xl border border-amber-300/20 bg-amber-300/10 p-2.5 text-amber-200">
            <Sparkles size={18} />
          </div>
          <div>
            <h2
              id="editorial-highlights-heading"
              className="text-xl font-black"
            >
              {t("Editorial highlights")}
            </h2>
            <p className="mt-1 max-w-2xl text-sm font-semibold leading-relaxed text-white/45">
              {t(
                "Add your voice to up to three games. These picks appear in the most prominent positions of your Outlet.",
              )}
            </p>
          </div>
        </div>
        <FeaturedTab storeSlug={storeSlug} storeName={storeName} />
      </section>

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
      ]);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRemoveOverride(override: GameOverrideApi) {
    if (draftRevision === null) return;
    await fetch(`${overridesKey}/${encodeURIComponent(override.game_slug)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expected_draft_revision: draftRevision }),
    });
    await Promise.all([
      mutate(overridesKey),
      mutate(
        (key) =>
          typeof key === "string" &&
          key.startsWith(`/api/v1/stores/${storeSlug}/curation-catalog?`),
      ),
    ]);
  }

  return (
    <div className="mt-4 pl-6 border-l border-white/10 flex flex-col gap-4">
      <p className="text-white/50 text-sm font-bold">
        {t(
          "Force-show or force-hide a specific game, regardless of tag filters.",
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
            onSelect={(game) => setSelectedGame(game)}
            placeholder={t("Search games...")}
          />
        )}
        <select
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as "SHOW" | "HIDE")}
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-white outline-none focus:bg-white/10 focus:border-white/20"
        >
          <option value="SHOW">{t("Force show")}</option>
          <option value="HIDE">{t("Force hide")}</option>
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

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(false);
    setIsSubmitting(true);
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
      mutate(`/api/v1/stores/${store.slug}`);
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
