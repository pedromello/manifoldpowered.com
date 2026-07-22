import { useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Link from "next/link";
import useSWR, { useSWRConfig } from "swr";
import { Loader2, ExternalLink, X, ChevronDown } from "lucide-react";

interface StoreApi {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  owner_id: string;
}

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
  game_id: string;
  game_title: string;
  store_id: string | null;
  price_at_sale: string;
  created_at: string;
}

const fetcher = (url: string) =>
  fetch(url).then(async (res) => {
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.message || "Request failed");
    }
    return res.json();
  });

type Tab = "curation" | "settings" | "sales";

export default function StoreManagePage() {
  const router = useRouter();
  const slug = router.query.slug as string | undefined;
  const [tab, setTab] = useState<Tab>("curation");

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
      <div className="min-h-screen bg-[#1D0F3B] flex items-center justify-center">
        <Loader2 className="animate-spin text-white/30" size={32} />
      </div>
    );
  }

  if (storeError || !storeData) {
    return (
      <div className="min-h-screen bg-[#1D0F3B] flex items-center justify-center">
        <p className="text-rose-300 font-bold">Store not found.</p>
      </div>
    );
  }

  if (tagFiltersError) {
    return (
      <div className="min-h-screen bg-[#1D0F3B] flex items-center justify-center px-4 text-center">
        <p className="text-rose-300 font-bold">
          You do not have permission to manage this store.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1D0F3B] text-white pb-24">
      <Head>
        <title>Manage {storeData.name} | Manifold</title>
      </Head>

      <div className="max-w-3xl mx-auto px-6 pt-16 flex flex-col gap-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black">Manage {storeData.name}</h1>
            <p className="text-white/50 text-sm font-bold mt-1">
              Curate your storefront and track your sales.
            </p>
          </div>
          <Link
            href={`/store/${storeData.slug}`}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 bg-white/5 text-sm font-bold text-white/80 hover:bg-white/10 transition-colors shrink-0"
          >
            View my storefront
            <ExternalLink size={14} />
          </Link>
        </div>

        <div className="flex items-center gap-2 border-b border-white/10">
          {(
            [
              ["curation", "Curation"],
              ["settings", "Settings"],
              ["sales", "Sales"],
            ] as [Tab, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={`px-4 py-3 text-sm font-black uppercase tracking-wider transition-colors border-b-2 ${
                tab === value
                  ? "text-white border-white"
                  : "text-white/40 border-transparent hover:text-white/70"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "curation" && (
          <CurationTab
            storeSlug={storeData.slug}
            tagFilters={tagFilters ?? []}
            isTagFiltersLoading={isTagFiltersLoading}
          />
        )}
        {tab === "settings" && <SettingsTab store={storeData} />}
        {tab === "sales" && <SalesTab storeSlug={storeData.slug} />}
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
        setError(body?.message || "Failed to add tag filter.");
        return;
      }
      setTag("");
      mutate(tagFiltersKey);
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
    mutate(tagFiltersKey);
  }

  async function handleRemoveTag(filter: TagFilterApi) {
    await fetch(`${tagFiltersKey}/${encodeURIComponent(filter.tag)}`, {
      method: "DELETE",
    });
    mutate(tagFiltersKey);
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-black">Tag Filters</h2>
          <p className="text-white/50 text-sm font-bold mt-1">
            Whitelist tags to show only matching games, or blacklist tags to
            hide them. With no filters, your store shows the full catalog.
          </p>
        </div>

        <form onSubmit={handleAddTag} className="flex flex-wrap gap-2">
          <input
            type="text"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="e.g. RPG"
            className="flex-1 min-w-[160px] rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-white placeholder:text-white/30 outline-none focus:bg-white/10 focus:border-white/20"
          />
          <select
            value={mode}
            onChange={(e) =>
              setMode(e.target.value as "WHITELIST" | "BLACKLIST")
            }
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-white outline-none focus:bg-white/10 focus:border-white/20"
          >
            <option value="WHITELIST">Whitelist</option>
            <option value="BLACKLIST">Blacklist</option>
          </select>
          <button
            type="submit"
            disabled={isSubmitting || !tag.trim()}
            className="px-4 py-2.5 rounded-xl bg-emerald-500 text-black font-black text-sm uppercase tracking-wider hover:bg-emerald-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Add
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
              No tag filters yet — showing the full catalog.
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
                  title="Toggle whitelist/blacklist"
                >
                  {filter.mode === "WHITELIST" ? "✓" : "✕"} {filter.tag}
                </button>
                <button
                  onClick={() => handleRemoveTag(filter)}
                  className="text-white/40 hover:text-white transition-colors"
                  aria-label={`Remove ${filter.tag} filter`}
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
          Advanced: Per-Game Overrides
        </button>

        {isOverridesOpen && <GameOverridesPanel storeSlug={storeSlug} />}
      </section>
    </div>
  );
}

function GameOverridesPanel({ storeSlug }: { storeSlug: string }) {
  const { mutate } = useSWRConfig();
  const overridesKey = `/api/v1/stores/${storeSlug}/game-overrides`;

  const { data: overrides, isLoading } = useSWR<GameOverrideApi[]>(
    overridesKey,
    fetcher,
  );

  const [gameSlug, setGameSlug] = useState("");
  const [visibility, setVisibility] = useState<"SHOW" | "HIDE">("SHOW");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleAddOverride(event: React.FormEvent) {
    event.preventDefault();
    if (!gameSlug.trim()) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch(overridesKey, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game_slug: gameSlug.trim(), visibility }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.message || "Failed to add game override.");
        return;
      }
      setGameSlug("");
      mutate(overridesKey);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRemoveOverride(override: GameOverrideApi) {
    await fetch(`${overridesKey}/${encodeURIComponent(override.game_slug)}`, {
      method: "DELETE",
    });
    mutate(overridesKey);
  }

  return (
    <div className="mt-4 pl-6 border-l border-white/10 flex flex-col gap-4">
      <p className="text-white/50 text-sm font-bold">
        Force-show or force-hide a specific game, regardless of tag filters.
      </p>

      <form onSubmit={handleAddOverride} className="flex flex-wrap gap-2">
        <input
          type="text"
          value={gameSlug}
          onChange={(e) => setGameSlug(e.target.value)}
          placeholder="game-slug"
          className="flex-1 min-w-[160px] rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-white placeholder:text-white/30 outline-none focus:bg-white/10 focus:border-white/20"
        />
        <select
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as "SHOW" | "HIDE")}
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-white outline-none focus:bg-white/10 focus:border-white/20"
        >
          <option value="SHOW">Force show</option>
          <option value="HIDE">Force hide</option>
        </select>
        <button
          type="submit"
          disabled={isSubmitting || !gameSlug.trim()}
          className="px-4 py-2.5 rounded-xl bg-emerald-500 text-black font-black text-sm uppercase tracking-wider hover:bg-emerald-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Add
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
            No per-game overrides yet.
          </p>
        ) : (
          overrides.map((override) => (
            <div
              key={override.id}
              className={`flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-xl border text-sm font-bold ${
                override.visibility === "SHOW"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : "border-rose-500/30 bg-rose-500/10 text-rose-300"
              }`}
            >
              <span>
                {override.visibility === "SHOW" ? "Shown" : "Hidden"}:{" "}
                {override.game_slug}
              </span>
              <button
                onClick={() => handleRemoveOverride(override)}
                className="text-white/40 hover:text-white transition-colors"
                aria-label={`Remove override for ${override.game_slug}`}
              >
                <X size={14} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function SettingsTab({ store }: { store: StoreApi }) {
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
        setError(body?.message || "Failed to update store.");
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
          Store name
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
          Description
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
          Logo URL
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
          Saved.
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting || !name.trim()}
        className="px-4 py-3 rounded-xl bg-emerald-500 text-black font-black text-sm uppercase tracking-wider hover:bg-emerald-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed w-fit"
      >
        {isSubmitting ? "Saving..." : "Save Changes"}
      </button>
    </form>
  );
}

function SalesTab({ storeSlug }: { storeSlug: string }) {
  const { data, isLoading, error } = useSWR<{
    sales: SaleApi[];
    pagination: { total: number };
  }>(`/api/v1/stores/${storeSlug}/sales`, fetcher);

  if (isLoading) {
    return <Loader2 className="animate-spin text-white/30" size={24} />;
  }

  if (error) {
    return (
      <p className="text-rose-300 font-bold text-sm">Failed to load sales.</p>
    );
  }

  const sales = data?.sales ?? [];

  return (
    <div className="flex flex-col gap-4">
      <p className="text-white/50 text-sm font-bold">
        {data?.pagination.total ?? 0} sale
        {data?.pagination.total === 1 ? "" : "s"} attributed to this store.
      </p>

      {sales.length === 0 ? (
        <p className="text-white/30 text-sm font-bold italic">
          No sales yet. Share your storefront link to start tracking sales.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {sales.map((sale) => (
            <div
              key={sale.id}
              className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl border border-white/10 bg-white/5"
            >
              <span className="font-bold text-sm text-white truncate">
                {sale.game_title}
              </span>
              <span className="text-white/40 text-xs font-bold shrink-0">
                {new Date(sale.created_at).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
