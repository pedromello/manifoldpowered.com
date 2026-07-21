import { useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import useSWR, { mutate } from "swr";
import { ArrowLeft, Ban, CheckCircle2, Loader2 } from "lucide-react";
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

const fetcher = (url: string) =>
  fetch(url).then(async (res) => {
    if (!res.ok) throw new Error("Not found");
    return res.json();
  });

// Mirrors models/user.ts's isDisabled() - see pages/backoffice/users/index.tsx.
function isDisabled(user: BackofficeUser) {
  return !user.features.includes("read:session");
}

export default function BackofficeUserDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const { user: currentAdmin } = useBackofficeAccess();
  const [showDisableModal, setShowDisableModal] = useState(false);
  const [disableReason, setDisableReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const key = id ? `/api/v1/backoffice/users/${id}` : null;
  const {
    data: targetUser,
    isLoading,
    error,
  } = useSWR<BackofficeUser>(key, fetcher);

  const disabled = targetUser ? isDisabled(targetUser) : false;
  const isSelf = targetUser?.id === currentAdmin?.id;

  async function submitDisable() {
    if (!key) return;
    setActionError(null);
    const response = await fetch(`${key}/disable`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        disableReason.trim() ? { reason: disableReason.trim() } : {},
      ),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setActionError(body?.message || "Failed to disable user.");
      return;
    }
    setShowDisableModal(false);
    setDisableReason("");
    mutate(key);
  }

  async function enableUser() {
    if (!key || !targetUser) return;
    const confirmed = window.confirm(
      `Re-enable "${targetUser.username}"? They'll get back exactly the access they had before being disabled.`,
    );
    if (!confirmed) return;

    setActionError(null);
    const response = await fetch(`${key}/enable`, { method: "PATCH" });
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
        <title>
          {targetUser
            ? `${targetUser.username} | Manifold Admin`
            : "User | Manifold Admin"}
        </title>
      </Head>

      <div className="flex flex-col gap-6 max-w-2xl">
        <Link
          href="/backoffice/users"
          className="flex items-center gap-2 text-sm font-bold text-white/50 hover:text-white transition-colors w-fit"
        >
          <ArrowLeft size={14} />
          Back to Users
        </Link>

        {actionError && (
          <div className="px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm font-bold">
            {actionError}
          </div>
        )}

        {isLoading ? (
          <Loader2 className="animate-spin text-white/30" />
        ) : error || !targetUser ? (
          <p className="text-rose-300 font-bold">User not found.</p>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 flex flex-col gap-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl font-black">{targetUser.username}</h1>
                <p className="text-white/50 font-bold">{targetUser.email}</p>
              </div>
              <span
                className={`px-3 py-1 rounded-md text-xs font-black uppercase tracking-wider ${
                  disabled
                    ? "bg-rose-500/20 text-rose-300"
                    : "bg-emerald-500/20 text-emerald-300"
                }`}
              >
                {disabled ? "Disabled" : "Active"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-white/40 font-bold uppercase text-xs tracking-wider mb-1">
                  User ID
                </div>
                <div className="text-white/70 font-mono text-xs break-all">
                  {targetUser.id}
                </div>
              </div>
              <div>
                <div className="text-white/40 font-bold uppercase text-xs tracking-wider mb-1">
                  Joined
                </div>
                <div className="text-white/70 font-bold">
                  {new Date(targetUser.created_at).toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-white/40 font-bold uppercase text-xs tracking-wider mb-1">
                  Features
                </div>
                <div className="text-white/70 font-bold">
                  {targetUser.features.length}
                </div>
              </div>
              <div>
                <div className="text-white/40 font-bold uppercase text-xs tracking-wider mb-1">
                  Last Updated
                </div>
                <div className="text-white/70 font-bold">
                  {new Date(targetUser.updated_at).toLocaleString()}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {targetUser.features.map((feature) => (
                <span
                  key={feature}
                  className="px-2 py-1 rounded-md bg-white/5 border border-white/10 text-xs font-mono text-white/50"
                >
                  {feature}
                </span>
              ))}
            </div>

            <div className="border-t border-white/10 pt-5">
              {isSelf ? (
                <p className="text-sm text-white/40 font-bold">
                  This is your own account - you can&apos;t disable it.
                </p>
              ) : disabled ? (
                <button
                  onClick={enableUser}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 text-black font-black text-sm uppercase tracking-wider hover:bg-emerald-400 transition-colors"
                >
                  <CheckCircle2 size={16} />
                  Enable User
                </button>
              ) : (
                <button
                  onClick={() => setShowDisableModal(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-500 text-black font-black text-sm uppercase tracking-wider hover:bg-rose-400 transition-colors"
                >
                  <Ban size={16} />
                  Disable User
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {showDisableModal && targetUser && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1D0F3B] p-6 shadow-2xl">
            <h2 className="text-xl font-black mb-1">
              Disable &quot;{targetUser.username}&quot;?
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
                  setShowDisableModal(false);
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

BackofficeUserDetailPage.getLayout = function getLayout(
  page: React.ReactElement,
) {
  return <BackofficeLayout>{page}</BackofficeLayout>;
};
