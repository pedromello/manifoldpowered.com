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
} from "lucide-react";
import { CreatorWorkspaceLayout } from "components/creator/CreatorWorkspaceLayout";
import { OutletCustomizationForm } from "components/store/OutletCustomizationForm";
import { GameAutocomplete } from "components/store/GameAutocomplete";
import { type GameApi, type StoreManagementApi } from "components/store/types";
import { Pagination, type PaginationApi } from "components/Pagination";
import { formatMoney } from "lib/price";
import { useI18n } from "lib/i18n";

interface TagFilterApi {
  id: string;
  tag: string;
  mode: "WHITELIST" | "BLACKLIST";
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

export default function StoreManagePage() {
  const router = useRouter();
  const { t } = useI18n();
  const slug = router.query.slug as string | undefined;
  const managementStoreKey = slug ? `/api/v1/stores/${slug}?preview=1` : null;
  const [tab, setTab] = useState<Tab>("featured");

  const {
    data: storeData,
    isLoading: isStoreLoading,
    error: storeError,
  } = useSWR<StoreManagementApi>(managementStoreKey, fetcher);

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
            href={`/store/${storeData.slug}${
              storeData.publication_status === "PUBLISHED" ? "" : "?preview=1"
            }`}
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
              ["featured", "Featured"],
              ["curation", "Curation"],
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

        {tab === "featured" && (
          <FeaturedTab storeSlug={storeData.slug} storeName={storeData.name} />
        )}
        {tab === "curation" &&
          (tagFiltersError ? (
            <p className="text-rose-300 font-bold text-sm">
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
  const { mutate: mutateCache } = useSWRConfig();
  const featuredKey = `/api/v1/stores/${storeSlug}/featured?preview=1`;
  const {
    data,
    isLoading,
    error,
    mutate: mutateFeatured,
  } = useSWR<FeaturedResponse>(featuredKey, fetcher);
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
      await Promise.all([
        mutateFeatured(),
        mutateCache(`/api/v1/stores/${storeSlug}?preview=1`),
      ]);
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
      await Promise.all([
        mutateFeatured(),
        mutateCache(`/api/v1/stores/${storeSlug}?preview=1`),
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOverridesOpen, setIsOverridesOpen] = useState(false);

  const tagFiltersKey = `/api/v1/stores/${storeSlug}/tag-filters`;

  async function handleAddTag(event: React.FormEvent) {
    event.preventDefault();
    if (!tag.trim()) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch(tagFiltersKey, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag: tag.trim(), mode }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(translateError(body?.message, "Failed to add tag filter."));
        return;
      }
      setTag("");
      await Promise.all([
        mutate(tagFiltersKey),
        mutate(`/api/v1/stores/${storeSlug}?preview=1`),
      ]);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleToggleMode(filter: TagFilterApi) {
    const newMode = filter.mode === "WHITELIST" ? "BLACKLIST" : "WHITELIST";
    await fetch(`${tagFiltersKey}/${encodeURIComponent(filter.tag)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: newMode }),
    });
    await Promise.all([
      mutate(tagFiltersKey),
      mutate(`/api/v1/stores/${storeSlug}?preview=1`),
    ]);
  }

  async function handleRemoveTag(filter: TagFilterApi) {
    await fetch(`${tagFiltersKey}/${encodeURIComponent(filter.tag)}`, {
      method: "DELETE",
    });
    await Promise.all([
      mutate(tagFiltersKey),
      mutate(`/api/v1/stores/${storeSlug}?preview=1`),
    ]);
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-black">{t("Tag rules")}</h2>
          <p className="text-white/50 text-sm font-bold mt-1">
            {t(
              "Choose tags to show matching games or hide games from the selection.",
            )}
          </p>
        </div>

        <form onSubmit={handleAddTag} className="flex flex-wrap gap-2">
          <input
            type="text"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder={t("e.g. RPG")}
            className="w-full sm:w-auto sm:flex-1 sm:min-w-[160px] rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-white placeholder:text-white/30 outline-none focus:bg-white/10 focus:border-white/20"
          />
          <select
            value={mode}
            onChange={(e) =>
              setMode(e.target.value as "WHITELIST" | "BLACKLIST")
            }
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-white outline-none focus:bg-white/10 focus:border-white/20"
          >
            <option value="WHITELIST">{t("Show games with this tag")}</option>
            <option value="BLACKLIST">{t("Hide games with this tag")}</option>
          </select>
          <button
            type="submit"
            disabled={isSubmitting || !tag.trim()}
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
          {isTagFiltersLoading ? (
            <Loader2 className="animate-spin text-white/30" size={20} />
          ) : tagFilters.length === 0 ? (
            <p className="text-white/30 text-sm font-bold italic">
              {t("No tag rules yet. Add one to define the selection.")}
            </p>
          ) : (
            tagFilters.map((filter) => (
              <div
                key={filter.id}
                className={`flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-xl border text-sm font-bold ${
                  filter.mode === "WHITELIST"
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                    : "border-rose-500/30 bg-rose-500/10 text-rose-300"
                }`}
              >
                <button
                  onClick={() => handleToggleMode(filter)}
                  className="hover:underline"
                  title={t("Switch between show and hide")}
                >
                  {filter.mode === "WHITELIST" ? "✓" : "✕"} {filter.tag}
                </button>
                <button
                  onClick={() => handleRemoveTag(filter)}
                  className="text-white/40 hover:text-white transition-colors"
                  aria-label={t("Remove {tag} filter", { tag: filter.tag })}
                >
                  <X size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      <section>
        <button
          onClick={() => setIsOverridesOpen((open) => !open)}
          className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-white/60 hover:text-white transition-colors"
        >
          <ChevronDown
            size={16}
            className={`transition-transform ${isOverridesOpen ? "rotate-180" : ""}`}
          />
          {t("Advanced: individual games")}
        </button>

        {isOverridesOpen && <GameOverridesPanel storeSlug={storeSlug} />}
      </section>
    </div>
  );
}

function GameOverridesPanel({ storeSlug }: { storeSlug: string }) {
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
    if (!selectedGame) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch(overridesKey, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game_slug: selectedGame.slug, visibility }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(translateError(body?.message, "Failed to add game override."));
        return;
      }
      setSelectedGame(null);
      await Promise.all([
        mutate(overridesKey),
        mutate(`/api/v1/stores/${storeSlug}?preview=1`),
      ]);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRemoveOverride(override: GameOverrideApi) {
    await fetch(`${overridesKey}/${encodeURIComponent(override.game_slug)}`, {
      method: "DELETE",
    });
    await Promise.all([
      mutate(overridesKey),
      mutate(`/api/v1/stores/${storeSlug}?preview=1`),
    ]);
  }

  return (
    <div className="mt-4 pl-6 border-l border-white/10 flex flex-col gap-4">
      <p className="text-white/50 text-sm font-bold">
        {t("Show or hide a specific game regardless of the tag rules.")}
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
          <option value="SHOW">{t("Show")}</option>
          <option value="HIDE">{t("Hide")}</option>
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
            {t("No individual game rules yet.")}
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

function SettingsTab({ store }: { store: StoreManagementApi }) {
  return <OutletCustomizationForm store={store} />;
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
