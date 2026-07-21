import { useState } from "react";
import Head from "next/head";
import useSWR, { mutate } from "swr";
import { CheckCircle2, XCircle, Loader2, Search } from "lucide-react";
import { BackofficeLayout } from "components/backoffice/BackofficeLayout";

interface BackofficeGame {
  id: string;
  slug: string;
  title: string;
  developer_name: string;
  status: "ACTIVE" | "INACTIVE" | "PRIVATE";
  created_at: string;
}

interface GamesResponse {
  games: BackofficeGame[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

const STATUS_TABS = [
  { value: "PRIVATE", label: "Pending" },
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
  { value: "", label: "All" },
] as const;

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function BackofficeGamesPage() {
  const [status, setStatus] = useState<string>("PRIVATE");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rejectTarget, setRejectTarget] = useState<BackofficeGame | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const queryParams = new URLSearchParams();
  if (status) queryParams.set("status", status);
  if (query.trim()) queryParams.set("q", query.trim());
  queryParams.set("page", String(page));
  queryParams.set("limit", "20");

  const key = `/api/v1/backoffice/games?${queryParams.toString()}`;
  const { data, isLoading, error } = useSWR<GamesResponse>(key, fetcher);

  const games = data?.games ?? [];
  const pagination = data?.pagination;

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) =>
      prev.size === games.length
        ? new Set()
        : new Set(games.map((game) => game.id)),
    );
  }

  async function approveGame(slug: string) {
    setActionError(null);
    const response = await fetch(`/api/v1/backoffice/games/${slug}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ACTIVE" }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setActionError(body?.message || "Failed to approve game.");
      return;
    }
    mutate(key);
  }

  async function submitReject() {
    if (!rejectTarget || !rejectReason.trim()) return;
    setActionError(null);
    const response = await fetch(
      `/api/v1/backoffice/games/${rejectTarget.slug}/status`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "PRIVATE",
          reason: rejectReason.trim(),
        }),
      },
    );
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setActionError(body?.message || "Failed to reject game.");
      return;
    }
    setRejectTarget(null);
    setRejectReason("");
    mutate(key);
  }

  async function bulkApprove() {
    if (selected.size === 0) return;
    const slugs = games
      .filter((game) => selected.has(game.id))
      .map((game) => game.slug);
    const confirmed = window.confirm(
      `Approve ${slugs.length} game${slugs.length === 1 ? "" : "s"}?\n\n${slugs.join(", ")}`,
    );
    if (!confirmed) return;

    setActionError(null);
    const response = await fetch("/api/v1/backoffice/games/bulk-status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slugs, status: "ACTIVE" }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setActionError(body?.message || "Failed to approve selected games.");
      return;
    }
    setSelected(new Set());
    mutate(key);
  }

  return (
    <>
      <Head>
        <title>Games | Manifold Admin</title>
      </Head>

      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-3xl font-black">Games</h1>
          {selected.size > 0 && (
            <button
              onClick={bulkApprove}
              className="px-4 py-2 rounded-xl bg-emerald-500 text-black font-black text-sm uppercase tracking-wider hover:bg-emerald-400 transition-colors"
            >
              Approve Selected ({selected.size})
            </button>
          )}
        </div>

        {actionError && (
          <div className="px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm font-bold">
            {actionError}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-xl p-1">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => {
                  setStatus(tab.value);
                  setPage(1);
                  setSelected(new Set());
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-colors ${
                  status === tab.value
                    ? "bg-white text-black"
                    : "text-white/60 hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30"
            />
            <input
              type="text"
              placeholder="Search by title..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl border border-white/10 bg-white/5 pl-9 pr-4 py-2 text-sm font-bold text-white placeholder:text-white/30 outline-none focus:bg-white/10 focus:border-white/20"
            />
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-white/50 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 text-left w-10">
                  <input
                    type="checkbox"
                    checked={games.length > 0 && selected.size === games.length}
                    onChange={toggleSelectAll}
                    aria-label="Select all games"
                  />
                </th>
                <th className="px-4 py-3 text-left">Title</th>
                <th className="px-4 py-3 text-left">Studio</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Submitted</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <Loader2 className="animate-spin inline-block text-white/30" />
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-rose-300 font-bold"
                  >
                    Failed to load games.
                  </td>
                </tr>
              ) : games.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-white/40 font-bold"
                  >
                    No games found.
                  </td>
                </tr>
              ) : (
                games.map((game) => (
                  <tr key={game.id} className="border-t border-white/5">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(game.id)}
                        onChange={() => toggleSelected(game.id)}
                        aria-label={`Select ${game.title}`}
                      />
                    </td>
                    <td className="px-4 py-3 font-bold text-white">
                      {game.title}
                    </td>
                    <td className="px-4 py-3 text-white/60">
                      {game.developer_name}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded-md text-xs font-black uppercase tracking-wider ${
                          game.status === "ACTIVE"
                            ? "bg-emerald-500/20 text-emerald-300"
                            : game.status === "PRIVATE"
                              ? "bg-amber-500/20 text-amber-300"
                              : "bg-white/10 text-white/50"
                        }`}
                      >
                        {game.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white/40">
                      {new Date(game.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {game.status !== "ACTIVE" && (
                          <button
                            onClick={() => approveGame(game.slug)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 text-xs font-black uppercase tracking-wider transition-colors"
                          >
                            <CheckCircle2 size={14} />
                            Approve
                          </button>
                        )}
                        <button
                          onClick={() => setRejectTarget(game)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 text-xs font-black uppercase tracking-wider transition-colors"
                        >
                          <XCircle size={14} />
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {pagination && pagination.pages > 1 && (
          <div className="flex items-center justify-center gap-3">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm font-bold text-white/70 disabled:opacity-30"
            >
              Previous
            </button>
            <span className="text-sm font-bold text-white/50">
              Page {pagination.page} of {pagination.pages}
            </span>
            <button
              disabled={page >= pagination.pages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm font-bold text-white/70 disabled:opacity-30"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {rejectTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1D0F3B] p-6 shadow-2xl">
            <h2 className="text-xl font-black mb-1">
              Reject &quot;{rejectTarget.title}&quot;
            </h2>
            <p className="text-sm text-white/50 font-bold mb-4">
              This makes the game private again. The studio will see this
              reason.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Why is this game being rejected?"
              rows={4}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white placeholder:text-white/30 outline-none focus:bg-white/10 focus:border-white/20 resize-none"
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => {
                  setRejectTarget(null);
                  setRejectReason("");
                }}
                className="px-4 py-2 rounded-xl text-white/60 hover:text-white font-bold text-sm"
              >
                Cancel
              </button>
              <button
                onClick={submitReject}
                disabled={!rejectReason.trim()}
                className="px-4 py-2 rounded-xl bg-rose-500 text-black font-black text-sm uppercase tracking-wider hover:bg-rose-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Reject Game
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

BackofficeGamesPage.getLayout = function getLayout(page: React.ReactElement) {
  return <BackofficeLayout>{page}</BackofficeLayout>;
};
