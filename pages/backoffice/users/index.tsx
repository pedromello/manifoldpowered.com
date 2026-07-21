import { useState } from "react";
import Head from "next/head";
import Link from "next/link";
import useSWR, { mutate } from "swr";
import { Ban, CheckCircle2, Loader2, Search } from "lucide-react";
import {
  BackofficeLayout,
  useBackofficeAccess,
} from "components/backoffice/BackofficeLayout";

interface BackofficeUser {
  id: string;
  username: string;
  email: string;
  features: string[];
  created_at: string;
  updated_at: string;
}

interface UsersResponse {
  users: BackofficeUser[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

// Mirrors models/user.ts's isDisabled(): a disabled user's features never
// include read:session (part of the activated set, stripped on disable).
// Purely a display heuristic - the real gate is server-side.
function isDisabled(user: BackofficeUser) {
  return !user.features.includes("read:session");
}

export default function BackofficeUsersPage() {
  const { user: currentAdmin } = useBackofficeAccess();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [disableTarget, setDisableTarget] = useState<BackofficeUser | null>(
    null,
  );
  const [disableReason, setDisableReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const queryParams = new URLSearchParams();
  if (query.trim()) queryParams.set("q", query.trim());
  queryParams.set("page", String(page));
  queryParams.set("limit", "20");

  const key = `/api/v1/backoffice/users?${queryParams.toString()}`;
  const { data, isLoading, error } = useSWR<UsersResponse>(key, fetcher);

  const users = data?.users ?? [];
  const pagination = data?.pagination;

  async function submitDisable() {
    if (!disableTarget) return;
    setActionError(null);
    const response = await fetch(
      `/api/v1/backoffice/users/${disableTarget.id}/disable`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          disableReason.trim() ? { reason: disableReason.trim() } : {},
        ),
      },
    );
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setActionError(body?.message || "Failed to disable user.");
      return;
    }
    setDisableTarget(null);
    setDisableReason("");
    mutate(key);
  }

  async function enableUser(targetUser: BackofficeUser) {
    const confirmed = window.confirm(
      `Re-enable "${targetUser.username}"? They'll get back exactly the access they had before being disabled.`,
    );
    if (!confirmed) return;

    setActionError(null);
    const response = await fetch(
      `/api/v1/backoffice/users/${targetUser.id}/enable`,
      { method: "PATCH" },
    );
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setActionError(body?.message || "Failed to enable user.");
      return;
    }
    mutate(key);
  }

  return (
    <>
      <Head>
        <title>Users | Manifold Admin</title>
      </Head>

      <div className="flex flex-col gap-6">
        <h1 className="text-3xl font-black">Users</h1>

        {actionError && (
          <div className="px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm font-bold">
            {actionError}
          </div>
        )}

        <div className="relative max-w-sm">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30"
          />
          <input
            type="text"
            placeholder="Search by username or email..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            className="w-full rounded-xl border border-white/10 bg-white/5 pl-9 pr-4 py-2 text-sm font-bold text-white placeholder:text-white/30 outline-none focus:bg-white/10 focus:border-white/20"
          />
        </div>

        <div className="rounded-2xl border border-white/10 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-white/50 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 text-left">Username</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Joined</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center">
                    <Loader2 className="animate-spin inline-block text-white/30" />
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-12 text-center text-rose-300 font-bold"
                  >
                    Failed to load users.
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-12 text-center text-white/40 font-bold"
                  >
                    No users found.
                  </td>
                </tr>
              ) : (
                users.map((targetUser) => {
                  const disabled = isDisabled(targetUser);
                  const isSelf = targetUser.id === currentAdmin?.id;
                  return (
                    <tr key={targetUser.id} className="border-t border-white/5">
                      <td className="px-4 py-3 font-bold text-white">
                        <Link
                          href={`/backoffice/users/${targetUser.id}`}
                          className="hover:underline"
                        >
                          {targetUser.username}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-white/60">
                        {targetUser.email}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-1 rounded-md text-xs font-black uppercase tracking-wider ${
                            disabled
                              ? "bg-rose-500/20 text-rose-300"
                              : "bg-emerald-500/20 text-emerald-300"
                          }`}
                        >
                          {disabled ? "Disabled" : "Active"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-white/40">
                        {new Date(targetUser.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {isSelf ? (
                            <span className="text-xs text-white/30 font-bold uppercase tracking-wider">
                              You
                            </span>
                          ) : disabled ? (
                            <button
                              onClick={() => enableUser(targetUser)}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 text-xs font-black uppercase tracking-wider transition-colors"
                            >
                              <CheckCircle2 size={14} />
                              Enable
                            </button>
                          ) : (
                            <button
                              onClick={() => setDisableTarget(targetUser)}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 text-xs font-black uppercase tracking-wider transition-colors"
                            >
                              <Ban size={14} />
                              Disable
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
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

      {disableTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1D0F3B] p-6 shadow-2xl">
            <h2 className="text-xl font-black mb-1">
              Disable &quot;{disableTarget.username}&quot;?
            </h2>
            <p className="text-sm text-white/50 font-bold mb-4">
              They&apos;ll be signed out of any real access immediately -
              existing sessions degrade to logged-out-visitor level and they
              can&apos;t log back in. This can be undone at any time.
            </p>
            <textarea
              value={disableReason}
              onChange={(e) => setDisableReason(e.target.value)}
              placeholder="Reason (optional)"
              rows={3}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white placeholder:text-white/30 outline-none focus:bg-white/10 focus:border-white/20 resize-none"
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => {
                  setDisableTarget(null);
                  setDisableReason("");
                }}
                className="px-4 py-2 rounded-xl text-white/60 hover:text-white font-bold text-sm"
              >
                Cancel
              </button>
              <button
                onClick={submitDisable}
                className="px-4 py-2 rounded-xl bg-rose-500 text-black font-black text-sm uppercase tracking-wider hover:bg-rose-400 transition-colors"
              >
                Disable User
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

BackofficeUsersPage.getLayout = function getLayout(page: React.ReactElement) {
  return <BackofficeLayout>{page}</BackofficeLayout>;
};
