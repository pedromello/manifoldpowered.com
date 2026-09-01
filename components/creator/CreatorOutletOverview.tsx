import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Check,
  Circle,
  Copy,
  Eye,
  ExternalLink,
  Loader2,
  Palette,
  RefreshCw,
  Rocket,
  Sparkles,
} from "lucide-react";

import { useI18n } from "lib/i18n";
import {
  CREATOR_OUTLET_FUNNEL_VERSION,
  creatorFunnelAnalytics,
} from "lib/creator-funnel-analytics";
import type { OutletPublicationContract } from "lib/creator-lifecycle";

export interface CreatorOutletOverviewStore {
  slug: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  status?: "DRAFT" | "PUBLISHED" | "draft" | "published";
}

export type CreatorOutletReadinessChecks = OutletPublicationContract["checks"];

export type CreatorOutletPublication = OutletPublicationContract;

export interface CreatorOutletOverviewProps {
  store: CreatorOutletOverviewStore;
  publication: CreatorOutletPublication | null;
  loading?: boolean;
  error?: string | Error | null;
  retry?: () => void;
  previewedAt?: string | null;
  onPreview?: () => void;
  onPublish?: () => void | Promise<void>;
  isPublishing?: boolean;
  publishError?: string | null;
  canEdit?: boolean;
  canEditIdentity?: boolean;
  canCurate?: boolean;
  canManageFeatured?: boolean;
  canPublish?: boolean;
  canUnpublish?: boolean;
  onUnpublish?: () => void | Promise<void>;
  isUnpublishing?: boolean;
}

type ChecklistItem = {
  key: keyof CreatorOutletReadinessChecks;
  label: string;
  detail: string;
  href: string;
  actionLabel: string;
  canAct?: boolean;
};

type PrimaryAction = {
  kind:
    | "identity"
    | "selection"
    | "featured"
    | "preview"
    | "publish"
    | "share"
    | "refresh";
  eyebrow: string;
  title: string;
  detail: string;
  label: string;
  href?: string;
};

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300";

/**
 * The creator workspace landing view. Publication readiness is intentionally
 * supplied by the server: this component never guesses that an Outlet is ready
 * or marks it as published locally.
 */
export function CreatorOutletOverview({
  store,
  publication,
  loading = false,
  error = null,
  retry,
  previewedAt = null,
  onPreview,
  onPublish,
  isPublishing = false,
  publishError = null,
  canEdit = true,
  canEditIdentity = canEdit,
  canCurate = canEdit,
  canManageFeatured = canEdit,
  canPublish = true,
  canUnpublish = false,
  onUnpublish,
  isUnpublishing = false,
}: CreatorOutletOverviewProps) {
  const { locale, t } = useI18n();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const previewFrameRef = useRef<HTMLIFrameElement>(null);
  const [justCopied, setJustCopied] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const safeSlug = encodeURIComponent(store.slug);
  const manageHref = `/store/${safeSlug}/manage`;
  const previewHref = `/store/${safeSlug}?preview=1`;
  const liveHref = `/store/${safeSlug}`;

  useEffect(() => {
    if (!previewOpen) return;
    const timeout = window.setTimeout(() => setPreviewError(true), 10000);
    const handleMessage = (event: MessageEvent) => {
      const isOwnPreview =
        event.origin === window.location.origin &&
        event.source === previewFrameRef.current?.contentWindow &&
        isRecord(event.data) &&
        event.data.slug === store.slug;
      if (!isOwnPreview) return;
      if (event.data.type === "manifold:outlet-preview-ready") {
        window.clearTimeout(timeout);
        setPreviewLoaded(true);
        setPreviewError(false);
      } else if (event.data.type === "manifold:outlet-preview-error") {
        window.clearTimeout(timeout);
        setPreviewLoaded(false);
        setPreviewError(true);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("message", handleMessage);
    };
  }, [previewAttempt, previewOpen, store.slug]);

  if (loading) {
    return <OverviewLoading label={t("Loading your Outlet overview...")} />;
  }

  if (error) {
    const message = typeof error === "string" ? error : error.message;
    return (
      <OverviewError
        title={t("We couldn't load your Outlet overview")}
        message={message || t("Your work is safe. Try loading it again.")}
        retryLabel={t("Try again")}
        retry={retry}
      />
    );
  }

  if (!publication) {
    return (
      <OverviewError
        title={t("Your launch status isn't available yet")}
        message={t("Your work is safe. Try loading it again.")}
        retryLabel={t("Try again")}
        retry={retry}
      />
    );
  }

  const isPublished = publication.status.toUpperCase() === "PUBLISHED";
  const hasPendingChanges =
    isPublished &&
    publication.publishedRevision !== null &&
    publication.draftRevision >
      publication.publishedRevision.sourceDraftRevision;
  const checklist: ChecklistItem[] = [
    {
      key: "brand_complete",
      label: t("Give your Outlet its identity"),
      detail: t(
        "Introduce your point of view and what your audience can expect.",
      ),
      href: `${manageHref}?tab=settings`,
      actionLabel: t("Edit identity"),
      canAct: canEditIdentity,
    },
    {
      key: "catalog_intentional",
      label: t("Choose a clear selection"),
      detail: t(
        "Pick a focus instead of showing the entire catalog by default.",
      ),
      href: `${manageHref}?tab=curation`,
      actionLabel: t("Choose selection"),
      canAct: canCurate,
    },
    {
      key: "catalog_has_games",
      label: t("Add games your audience will care about"),
      detail: t(
        "Make sure your intentional selection has something to explore.",
      ),
      href: `${manageHref}?tab=curation`,
      actionLabel: t("Add games"),
      canAct: canCurate,
    },
    {
      key: "editorial_highlight",
      label: t("Lead with a personal recommendation"),
      detail: t("Feature a standout game and tell people why you chose it."),
      href: `${manageHref}?tab=featured`,
      actionLabel: t("Create Featured pick"),
      canAct: canManageFeatured,
    },
  ];
  const completedCount = checklist.filter(
    (item) => publication.checks[item.key],
  ).length;
  const firstIncomplete = checklist.find(
    (item) => !publication.checks[item.key] && item.canAct,
  );
  const primaryAction = getPrimaryAction({
    firstIncomplete,
    isPublished,
    hasPendingChanges,
    previewedAt,
    ready: publication.ready,
    t,
  });
  const publishedDate = formatPublishedDate(publication.publishedAt, locale);
  const initials = getInitials(store.name);

  async function copyLiveLink() {
    setShareError(null);
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}${liveHref}`,
      );
      creatorFunnelAnalytics.linkCopied({
        funnelVersion: CREATOR_OUTLET_FUNNEL_VERSION,
        entrySurface: "manage_outlet",
        copyContext: "manage",
      });
      setJustCopied(true);
      window.setTimeout(() => setJustCopied(false), 3000);
    } catch {
      setShareError(
        t(
          "We couldn't copy the link. Open the Outlet and copy it from your browser.",
        ),
      );
    }
  }

  return (
    <section aria-labelledby="creator-outlet-overview-title" className="w-full">
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] lg:items-start">
        <div className="min-w-0 space-y-6">
          <header className="overflow-hidden rounded-2xl border border-white/[0.09] bg-[#14101c]">
            <div className="relative px-5 py-6 sm:px-7 sm:py-8">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-violet-500/15 blur-3xl"
              />
              <div className="relative flex min-w-0 flex-col gap-5 sm:flex-row sm:items-center">
                <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-violet-500/30 to-fuchsia-500/15 text-2xl font-black tracking-tight text-white shadow-xl shadow-black/20">
                  <span aria-hidden="true">{initials}</span>
                  {store.logo_url ? (
                    <span
                      aria-hidden="true"
                      className="absolute inset-0 bg-[#21152f] bg-cover bg-center bg-no-repeat"
                      style={{
                        backgroundImage: `url(${JSON.stringify(store.logo_url)})`,
                      }}
                    />
                  ) : null}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      role="status"
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${
                        isPublished
                          ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
                          : "border-violet-300/20 bg-violet-300/10 text-violet-200"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          isPublished ? "bg-emerald-300" : "bg-violet-300"
                        }`}
                      />
                      {isPublished ? t("Published") : t("Draft")}
                    </span>
                    {isPublished && publishedDate ? (
                      <span className="text-xs font-semibold text-white/35">
                        {t("Live since {date}", { date: publishedDate })}
                      </span>
                    ) : null}
                  </div>
                  <h1
                    id="creator-outlet-overview-title"
                    className="mt-3 break-words text-2xl font-black tracking-tight text-white sm:text-3xl"
                  >
                    {store.name}
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-white/50">
                    {store.description?.trim() ||
                      t("Your corner of Manifold is taking shape.")}
                  </p>
                </div>
              </div>
            </div>
          </header>

          <article className="rounded-2xl border border-violet-300/15 bg-gradient-to-br from-violet-500/[0.14] via-[#171020] to-fuchsia-500/[0.08] p-5 shadow-2xl shadow-black/20 sm:p-7">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-xl">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-violet-200/80">
                  {primaryAction.eyebrow}
                </p>
                <h2 className="mt-2 text-xl font-black tracking-tight text-white sm:text-2xl">
                  {primaryAction.title}
                </h2>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-white/50">
                  {primaryAction.detail}
                </p>
              </div>
              <PrimaryActionControl
                action={
                  primaryAction.kind === "share" && justCopied
                    ? { ...primaryAction, label: t("Link copied") }
                    : primaryAction
                }
                isPublishing={isPublishing}
                onPreview={() => {
                  setPreviewLoaded(false);
                  setPreviewError(false);
                  setPreviewOpen(true);
                }}
                onPublish={canPublish ? onPublish : undefined}
                onShare={copyLiveLink}
                retry={retry}
                publishingLabel={t("Publishing...")}
                unavailableLabel={t("Publishing is unavailable right now.")}
              />
            </div>
            {publishError ? (
              <p
                role="alert"
                className="mt-4 rounded-xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm font-bold text-rose-200"
              >
                {publishError}
              </p>
            ) : null}
            {shareError ? (
              <p role="alert" className="mt-4 text-sm font-bold text-rose-200">
                {shareError}
              </p>
            ) : null}
          </article>

          {previewOpen ? (
            <article className="overflow-hidden rounded-2xl border border-white/[0.09] bg-[#14101c]">
              <div className="flex flex-col gap-3 border-b border-white/[0.08] p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-black text-white">
                    {t("Preview your Outlet")}
                  </h2>
                  <p className="mt-1 text-xs font-semibold text-white/40">
                    {t("Confirm only after the preview finishes loading.")}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link
                    href={previewHref}
                    target="_blank"
                    className={focusRing}
                  >
                    {t("Open full preview")}
                  </Link>
                  <button
                    type="button"
                    disabled={!previewLoaded}
                    onClick={onPreview}
                    className="min-h-11 rounded-xl bg-violet-500 px-4 text-sm font-black text-white disabled:opacity-40"
                  >
                    {previewLoaded
                      ? t("I reviewed the preview")
                      : t("Loading preview...")}
                  </button>
                </div>
              </div>
              <iframe
                key={previewAttempt}
                ref={previewFrameRef}
                src={previewHref}
                title={t("Preview of {name}", { name: store.name })}
                className="h-[34rem] w-full bg-[#0b0812]"
              />
              {previewError ? (
                <div
                  role="alert"
                  className="flex flex-wrap items-center gap-3 border-t border-rose-400/20 bg-rose-400/[0.08] px-5 py-4 text-sm font-bold text-rose-200"
                >
                  <span>
                    {t("The preview did not confirm that it loaded.")}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewLoaded(false);
                      setPreviewError(false);
                      setPreviewAttempt((attempt) => attempt + 1);
                    }}
                    className={focusRing}
                  >
                    {t("Try again")}
                  </button>
                </div>
              ) : null}
            </article>
          ) : null}

          <article className="rounded-2xl border border-white/[0.09] bg-[#14101c] p-5 sm:p-7">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/35">
                  {t("Launch checklist")}
                </p>
                <h2 className="mt-2 text-xl font-black text-white">
                  {isPublished
                    ? t("Your Outlet is live")
                    : publication.ready
                      ? t("Everything is in place")
                      : t("Build a place worth following")}
                </h2>
              </div>
              <p className="text-sm font-black text-white/45">
                {t("{completed} of {total} complete", {
                  completed: completedCount,
                  total: checklist.length,
                })}
              </p>
            </div>

            <div
              className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/[0.07]"
              aria-hidden="true"
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-400 to-fuchsia-400 transition-[width]"
                style={{
                  width: `${Math.round(
                    (completedCount / checklist.length) * 100,
                  )}%`,
                }}
              />
            </div>

            <ol
              aria-label={t("Outlet launch checklist")}
              className="mt-3 divide-y divide-white/[0.07]"
            >
              {checklist.map((item) => {
                const complete = publication.checks[item.key];
                return (
                  <li
                    key={item.key}
                    data-readiness-check={item.key}
                    data-readiness-complete={complete ? "true" : "false"}
                    className="flex gap-3 py-4 first:pt-3 last:pb-0"
                  >
                    <span
                      className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                        complete
                          ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
                          : "border-white/10 bg-white/[0.04] text-white/25"
                      }`}
                      aria-hidden="true"
                    >
                      {complete ? <Check size={14} /> : <Circle size={12} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                        <div>
                          <h3
                            className={`text-sm font-black ${
                              complete ? "text-white/65" : "text-white"
                            }`}
                          >
                            {item.label}
                            <span className="sr-only">
                              {` — ${complete ? t("Complete") : t("Not complete")}`}
                            </span>
                          </h3>
                          <p className="mt-1 text-xs font-semibold leading-relaxed text-white/35">
                            {item.detail}
                          </p>
                        </div>
                        {!complete && item.canAct ? (
                          <Link
                            href={item.href}
                            className={`mt-1 inline-flex min-h-9 shrink-0 items-center gap-1 self-start rounded-lg px-2 text-xs font-black text-violet-200 transition-colors hover:bg-white/[0.06] hover:text-white sm:mt-0 ${focusRing}`}
                          >
                            {item.actionLabel}
                            <ArrowRight size={13} aria-hidden="true" />
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </article>
        </div>

        <aside className="min-w-0 space-y-5 lg:sticky lg:top-24">
          <section
            aria-labelledby="creator-overview-shortcuts"
            className="rounded-2xl border border-white/[0.09] bg-[#14101c] p-5"
          >
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/35">
              {t("Workspace")}
            </p>
            <h2
              id="creator-overview-shortcuts"
              className="mt-2 text-lg font-black text-white"
            >
              {t("Keep shaping your Outlet")}
            </h2>
            <nav
              aria-label={t("Outlet editing shortcuts")}
              className="mt-4 space-y-2"
            >
              {canEditIdentity || canCurate || canManageFeatured ? (
                <>
                  {canEditIdentity && (
                    <ShortcutLink
                      href={`${manageHref}?tab=settings`}
                      icon={<Palette size={17} aria-hidden="true" />}
                      label={t("Identity and story")}
                    />
                  )}
                  {canCurate && (
                    <ShortcutLink
                      href={`${manageHref}?tab=curation`}
                      icon={<Sparkles size={17} aria-hidden="true" />}
                      label={t("Your selection")}
                    />
                  )}
                  {canManageFeatured && (
                    <ShortcutLink
                      href={`${manageHref}?tab=featured`}
                      icon={<Rocket size={17} aria-hidden="true" />}
                      label={t("Featured recommendation")}
                    />
                  )}
                </>
              ) : (
                <p className="text-xs font-semibold text-white/40">
                  {t(
                    "You can view this Outlet, but you do not have editing permission.",
                  )}
                </p>
              )}
              {isPublished && canUnpublish && onUnpublish ? (
                <button
                  type="button"
                  onClick={onUnpublish}
                  disabled={isUnpublishing}
                  className="mt-3 min-h-11 w-full rounded-xl border border-white/10 px-3 text-xs font-black text-white/50 transition hover:bg-white/[0.05] hover:text-white disabled:opacity-40"
                >
                  {isUnpublishing
                    ? t("Unpublishing...")
                    : t("Unpublish Outlet")}
                </button>
              ) : null}
            </nav>
          </section>

          <section className="rounded-2xl border border-white/[0.09] bg-white/[0.035] p-5">
            <h2 className="text-sm font-black text-white">
              {isPublished
                ? t("Your Outlet is public")
                : t("See it as your audience will")}
            </h2>
            <p className="mt-2 text-xs font-semibold leading-relaxed text-white/40">
              {isPublished
                ? t(
                    "Open the live page whenever you want to check or share it.",
                  )
                : t("Preview is private until you choose to publish.")}
            </p>
            {isPublished ? (
              <Link
                href={liveHref}
                className={`mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 text-sm font-black text-white/75 transition-colors hover:bg-white/10 hover:text-white ${focusRing}`}
              >
                <ExternalLink size={15} aria-hidden="true" /> {t("View live")}
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => setPreviewOpen(true)}
                className={`mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 text-sm font-black text-white/75 transition-colors hover:bg-white/10 hover:text-white ${focusRing}`}
              >
                <Eye size={16} aria-hidden="true" /> {t("Preview")}
              </button>
            )}
          </section>
        </aside>
      </div>
    </section>
  );
}

function PrimaryActionControl({
  action,
  isPublishing,
  onPreview,
  onPublish,
  onShare,
  retry,
  publishingLabel,
  unavailableLabel,
}: {
  action: PrimaryAction;
  isPublishing: boolean;
  onPreview?: () => void;
  onPublish?: () => void | Promise<void>;
  onShare?: () => void | Promise<void>;
  retry?: () => void;
  publishingLabel: string;
  unavailableLabel: string;
}) {
  const className = `inline-flex min-h-12 w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-5 text-sm font-black uppercase tracking-[0.08em] text-white shadow-lg shadow-violet-950/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto ${focusRing}`;

  if (action.href) {
    return (
      <Link
        href={action.href}
        onClick={action.kind === "preview" ? onPreview : undefined}
        data-creator-primary-action={action.kind}
        className={className}
      >
        {action.label}
        {action.kind === "preview" ? (
          <Eye size={16} aria-hidden="true" />
        ) : (
          <ArrowRight size={16} aria-hidden="true" />
        )}
      </Link>
    );
  }

  const isPublish = action.kind === "publish";
  const isShare = action.kind === "share";
  const isPreview = action.kind === "preview";
  const onClick = isPublish
    ? onPublish
    : isShare
      ? onShare
      : isPreview
        ? onPreview
        : retry;
  const disabled = isPublish
    ? isPublishing || !onPublish
    : isShare
      ? !onShare
      : isPreview
        ? !onPreview
        : !retry;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={isPublishing && isPublish ? "true" : undefined}
      title={isPublish && !onPublish ? unavailableLabel : undefined}
      data-creator-primary-action={action.kind}
      className={className}
    >
      {isPublishing && isPublish ? (
        <Loader2 size={16} className="animate-spin" aria-hidden="true" />
      ) : isPublish ? (
        <Rocket size={16} aria-hidden="true" />
      ) : isShare ? (
        <Copy size={16} aria-hidden="true" />
      ) : isPreview ? (
        <Eye size={16} aria-hidden="true" />
      ) : (
        <RefreshCw size={16} aria-hidden="true" />
      )}
      {isPublishing && isPublish ? publishingLabel : action.label}
    </button>
  );
}

function ShortcutLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={`flex min-h-11 items-center gap-3 rounded-xl border border-transparent px-3 text-sm font-bold text-white/55 transition-colors hover:border-white/[0.07] hover:bg-white/[0.05] hover:text-white ${focusRing}`}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-violet-200">
        {icon}
      </span>
      <span className="min-w-0 flex-1">{label}</span>
      <ArrowRight
        size={14}
        className="shrink-0 text-white/20"
        aria-hidden="true"
      />
    </Link>
  );
}

function OverviewLoading({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]"
    >
      <span className="sr-only">{label}</span>
      <div className="space-y-6">
        <div className="h-48 animate-pulse rounded-2xl border border-white/[0.07] bg-white/[0.035]" />
        <div className="h-44 animate-pulse rounded-2xl border border-white/[0.07] bg-white/[0.035]" />
        <div className="h-80 animate-pulse rounded-2xl border border-white/[0.07] bg-white/[0.035]" />
      </div>
      <div className="h-72 animate-pulse rounded-2xl border border-white/[0.07] bg-white/[0.035]" />
    </div>
  );
}

function OverviewError({
  title,
  message,
  retryLabel,
  retry,
}: {
  title: string;
  message: string;
  retryLabel: string;
  retry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-rose-400/20 bg-rose-400/[0.08] px-5 py-8 text-center sm:px-8"
    >
      <h2 className="text-lg font-black text-white">{title}</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm font-semibold leading-relaxed text-white/50">
        {message}
      </p>
      {retry ? (
        <button
          type="button"
          onClick={retry}
          className={`mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-4 text-sm font-black text-white transition-colors hover:bg-white/10 ${focusRing}`}
        >
          <RefreshCw size={15} aria-hidden="true" />
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}

function getPrimaryAction({
  firstIncomplete,
  isPublished,
  hasPendingChanges,
  previewedAt,
  ready,
  t,
}: {
  firstIncomplete?: ChecklistItem;
  isPublished: boolean;
  hasPendingChanges: boolean;
  previewedAt: string | null;
  ready: boolean;
  t: (message: string, values?: Record<string, string | number>) => string;
}): PrimaryAction {
  if (firstIncomplete) {
    return {
      kind:
        firstIncomplete.key === "brand_complete"
          ? "identity"
          : firstIncomplete.key === "editorial_highlight"
            ? "featured"
            : "selection",
      eyebrow: t("Your next move"),
      title: firstIncomplete.label,
      detail: t("One focused step keeps your Outlet moving toward launch."),
      label: t("Continue building"),
      href: firstIncomplete.href,
    };
  }

  if (!ready) {
    return {
      kind: "refresh",
      eyebrow: t("Checking your launch"),
      title: t("Your checklist is complete"),
      detail: t("Refresh the launch status before taking the next step."),
      label: t("Refresh status"),
    };
  }

  if (isPublished && !hasPendingChanges) {
    return {
      kind: "share",
      eyebrow: t("Your next move"),
      title: t("Share your Outlet with your audience"),
      detail: t(
        "Copy the live link and put your selection where your community already follows you.",
      ),
      label: t("Copy Outlet link"),
    };
  }

  if (!previewedAt) {
    return {
      kind: "preview",
      eyebrow: t("Your next move"),
      title: t("Take one final look"),
      detail: t("See the complete experience before sharing it with anyone."),
      label: t("Preview"),
    };
  }

  return {
    kind: "publish",
    eyebrow: t("Ready when you are"),
    title: isPublished
      ? t("Publish your latest changes")
      : t("Bring your Outlet to your audience"),
    detail: t(
      isPublished
        ? "Players keep seeing the current live snapshot until you publish these changes."
        : "Publishing makes this page live. Nothing changes until you choose it.",
    ),
    label: isPublished ? t("Publish changes") : t("Publish Outlet"),
  };
}

function formatPublishedDate(value: string | null, locale: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "M";
  return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
