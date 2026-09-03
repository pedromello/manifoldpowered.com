import Head from "next/head";
import Link from "next/link";
import { useState } from "react";
import useSWR, { mutate } from "swr";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  Scale,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { BackofficeLayout } from "components/backoffice/BackofficeLayout";
import type {
  OwnershipClaimApi,
  OwnershipClaimsResponse,
  OwnershipClaimStatus,
} from "components/ownership/types";
import { useI18n } from "lib/i18n";

type StatusFilter = OwnershipClaimStatus | "";
type Decision = "APPROVED" | "REJECTED";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "", label: "All" },
];

const fetcher = async (url: string): Promise<OwnershipClaimsResponse> => {
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message || "Failed to load ownership claims.");
  }
  return response.json();
};

export default function BackofficeOwnershipClaimsPage() {
  const { locale, t, translateError } = useI18n();
  const [status, setStatus] = useState<StatusFilter>("PENDING");
  const [page, setPage] = useState(1);
  const [decisionTarget, setDecisionTarget] =
    useState<OwnershipClaimApi | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const params = new URLSearchParams({ page: String(page), limit: "20" });
  if (status) params.set("status", status);
  const key = `/api/v1/backoffice/ownership-claims?${params.toString()}`;
  const { data, isLoading, error } = useSWR<OwnershipClaimsResponse>(
    key,
    fetcher,
  );

  const claims = data?.claims ?? [];
  const pagination = data?.pagination;

  function openDecision(claim: OwnershipClaimApi, nextDecision: Decision) {
    setDecisionTarget(claim);
    setDecision(nextDecision);
    setReason("");
    setActionError(null);
  }

  function closeDecision() {
    if (isSubmitting) return;
    setDecisionTarget(null);
    setDecision(null);
    setReason("");
  }

  async function submitDecision(event: React.FormEvent) {
    event.preventDefault();
    if (!decisionTarget || !decision) return;

    setIsSubmitting(true);
    setActionError(null);
    try {
      const response = await fetch(
        `/api/v1/backoffice/ownership-claims/${decisionTarget.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision,
            ...(reason.trim() ? { reason: reason.trim() } : {}),
          }),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setActionError(
          translateError(body?.message, "Failed to review ownership claim."),
        );
        return;
      }

      setDecisionTarget(null);
      setDecision(null);
      setReason("");
      await mutate(key);
    } catch {
      setActionError(
        translateError(undefined, "Failed to review ownership claim."),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <Head>
        <title>{t("Ownership claims | Manifold Admin")}</title>
      </Head>

      <div className="flex flex-col gap-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black">{t("Ownership claims")}</h1>
            <p className="mt-1 max-w-2xl text-sm font-bold text-white/45">
              {t(
                "Review the Studio, requester, and stored rights declaration before assigning a game.",
              )}
            </p>
          </div>
          {pagination && (
            <span className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-black uppercase tracking-wider text-white/50">
              {t("{count} requests", { count: pagination.total })}
            </span>
          )}
        </header>

        {actionError && (
          <p className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm font-bold text-rose-200">
            {actionError}
          </p>
        )}

        <div className="flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-white/5 p-1">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.value || "all"}
              type="button"
              onClick={() => {
                setStatus(filter.value);
                setPage(1);
              }}
              className={`shrink-0 rounded-lg px-3 py-2 text-xs font-black uppercase tracking-wider transition-colors ${
                status === filter.value
                  ? "bg-white text-black"
                  : "text-white/55 hover:text-white"
              }`}
            >
              {t(filter.label)}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex min-h-64 items-center justify-center">
            <Loader2 className="animate-spin text-white/30" />
          </div>
        ) : error ? (
          <p className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm font-bold text-rose-200">
            {t("Failed to load ownership claims.")}
          </p>
        ) : claims.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] text-center text-white/35">
            <Scale size={32} />
            <p className="text-sm font-bold">
              {t("No ownership claims in this state.")}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {claims.map((claim) => (
              <article
                key={claim.id}
                className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-5"
              >
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill status={claim.status} t={t} />
                      <span className="text-xs font-bold text-white/35">
                        {new Date(claim.created_at).toLocaleString(locale)}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <h2 className="text-xl font-black">{claim.game.title}</h2>
                      <Link
                        href={`/item/${claim.game.slug}`}
                        className="inline-flex items-center gap-1 text-xs font-bold text-white/45 hover:text-white"
                      >
                        {t("View game")} <ExternalLink size={12} />
                      </Link>
                    </div>

                    <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                      <EvidenceItem
                        label={t("Requesting Studio")}
                        value={claim.studio.name}
                      />
                      <EvidenceItem
                        label={t("Requester")}
                        value={claim.requested_by.username}
                      />
                      <EvidenceItem
                        label={t("Accepted by")}
                        value={claim.requested_by.username}
                      />
                      <EvidenceItem
                        label={t("Accepted at")}
                        value={new Date(claim.terms.accepted_at).toLocaleString(
                          locale,
                        )}
                      />
                    </dl>
                  </div>

                  {claim.status === "PENDING" && (
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => openDecision(claim, "APPROVED")}
                        className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/15 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-emerald-200 transition hover:bg-emerald-500/25"
                      >
                        <CheckCircle2 size={15} /> {t("Approve")}
                      </button>
                      <button
                        type="button"
                        onClick={() => openDecision(claim, "REJECTED")}
                        className="inline-flex items-center gap-2 rounded-xl bg-rose-500/15 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-rose-200 transition hover:bg-rose-500/25"
                      >
                        <XCircle size={15} /> {t("Reject")}
                      </button>
                    </div>
                  )}
                </div>

                <div className="mt-5 rounded-xl border border-amber-400/15 bg-amber-400/[0.06] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-amber-200/70">
                      <ShieldCheck size={14} /> {t("Stored rights declaration")}
                    </p>
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-100/35">
                      {t("Version {version}", {
                        version: claim.terms.version,
                      })}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-bold leading-relaxed text-amber-50/85">
                    {claim.terms.text}
                  </p>
                </div>

                {claim.decision.reason && (
                  <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
                    <p className="text-xs font-black uppercase tracking-wider text-white/35">
                      {t("Decision note")}
                    </p>
                    <p className="mt-1 text-sm font-bold text-white/70">
                      {claim.decision.reason}
                    </p>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}

        {pagination && pagination.pages > 1 && (
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-white/70 disabled:opacity-30"
            >
              {t("Previous")}
            </button>
            <span className="text-sm font-bold text-white/45">
              {t("Page {current} of {total}", {
                current: pagination.page,
                total: pagination.pages,
              })}
            </span>
            <button
              type="button"
              disabled={page >= pagination.pages}
              onClick={() => setPage((current) => current + 1)}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-white/70 disabled:opacity-30"
            >
              {t("Next")}
            </button>
          </div>
        )}
      </div>

      {decisionTarget && decision && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <form
            onSubmit={submitDecision}
            className="w-full max-w-lg rounded-xl border border-white/[0.08] bg-[#14101c] p-6 shadow-2xl"
          >
            <h2 className="text-xl font-black">
              {decision === "APPROVED"
                ? t("Approve ownership claim?")
                : t("Reject ownership claim?")}
            </h2>
            <p className="mt-2 text-sm font-bold leading-relaxed text-white/50">
              {decision === "APPROVED"
                ? t(
                    "This assigns {game} to {studio}, keeps it display-only, enables uploads for that Studio, and rejects competing pending claims.",
                    {
                      game: decisionTarget.game.title,
                      studio: decisionTarget.studio.name,
                    },
                  )
                : t(
                    "This request will be rejected without assigning the game.",
                  )}
            </p>

            <label className="mt-5 flex flex-col gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-white/40">
                {decision === "REJECTED"
                  ? t("Rejection reason")
                  : t("Decision note (optional)")}
              </span>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={4}
                maxLength={1000}
                placeholder={t("Add context for the requesting Studio...")}
                className="resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white outline-none placeholder:text-white/25 focus:border-violet-400/40"
              />
            </label>

            {actionError && (
              <p className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-sm font-bold text-rose-200">
                {actionError}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={closeDecision}
                className="rounded-xl px-4 py-2.5 text-sm font-bold text-white/55 hover:text-white disabled:opacity-40"
              >
                {t("Cancel")}
              </button>
              <button
                type="submit"
                disabled={
                  isSubmitting || (decision === "REJECTED" && !reason.trim())
                }
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black uppercase tracking-wider text-black disabled:opacity-40 ${
                  decision === "APPROVED"
                    ? "bg-emerald-400 hover:bg-emerald-300"
                    : "bg-rose-400 hover:bg-rose-300"
                }`}
              >
                {isSubmitting && <Loader2 size={15} className="animate-spin" />}
                {isSubmitting
                  ? t("Processing...")
                  : decision === "APPROVED"
                    ? t("Confirm approval")
                    : t("Confirm rejection")}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

BackofficeOwnershipClaimsPage.getLayout = function getLayout(
  page: React.ReactElement,
) {
  return <BackofficeLayout>{page}</BackofficeLayout>;
};

function StatusPill({
  status,
  t,
}: {
  status: OwnershipClaimStatus;
  t: (message: string) => string;
}) {
  const styles: Record<OwnershipClaimStatus, string> = {
    PENDING: "border-amber-400/25 bg-amber-400/10 text-amber-200",
    APPROVED: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
    REJECTED: "border-rose-400/25 bg-rose-400/10 text-rose-200",
  };
  return (
    <span
      className={`rounded-md border px-2 py-1 text-[10px] font-black uppercase tracking-wider ${styles[status]}`}
    >
      {t(status)}
    </span>
  );
}

function EvidenceItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 py-2">
      <dt className="text-[10px] font-black uppercase tracking-wider text-white/30">
        {label}
      </dt>
      <dd className="mt-0.5 break-words text-sm font-bold text-white/75">
        {value}
      </dd>
    </div>
  );
}
