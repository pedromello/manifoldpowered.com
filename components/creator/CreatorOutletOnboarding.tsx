import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import useSWR, { mutate as mutateGlobal } from "swr";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  Sparkles,
  Store,
  Target,
  X,
} from "lucide-react";

import { GameAutocomplete } from "components/store/GameAutocomplete";
import type { GameApi } from "components/store/types";
import { CATEGORIES } from "lib/categories";
import {
  CREATOR_OUTLET_FUNNEL_VERSION,
  creatorFunnelAnalytics,
} from "lib/creator-funnel-analytics";
import {
  CreatorOutletRequestError,
  fetchOutletPublication,
  previewExplicitOutletSelection,
  saveExplicitOutletSelection,
  updateOutletPublication,
} from "lib/creator-outlet-client";
import {
  CREATOR_ONBOARDING_STEPS,
  completeCreatorOutletDraft,
  createCreatorOutletDraft,
  earliestIncompleteStep,
  getOnboardingProgress,
  isCreatorFeaturedComplete,
  isCreatorIdentityComplete,
  isCreatorSelectionComplete,
  listCreatorOutletDraftArchives,
  loadCreatorOutletDraft,
  outletPreviewHref,
  removeCreatorOutletDraftArchive,
  restoreCreatorOutletDraft,
  saveCreatorOutletDraft,
  startNewCreatorOutletDraft,
  type CreatorGameSummary,
  type CreatorOnboardingStep,
  type CreatorOutletDraft,
  type CreatorSelectionStrategy,
  type OutletReadinessKey,
} from "lib/creator-lifecycle";
import { useI18n } from "lib/i18n";

interface CurrentUser {
  id: string;
  username: string;
}

interface StoreCreateResponse {
  slug: string;
  draft_revision: number;
}

type AutosaveState = "idle" | "saving" | "saved" | "error";

const stepLabels: Record<CreatorOnboardingStep, string> = {
  IDENTITY: "Identity",
  SELECTION: "Your games",
  FEATURED: "Featured",
  PREVIEW: "Preview",
  PUBLISH: "Publish & share",
};

const readinessLabels: Record<OutletReadinessKey, string> = {
  brand_complete: "Your Outlet has a clear identity",
  catalog_intentional: "You chose what your audience will see",
  catalog_has_games: "Your selection has games",
  editorial_highlight: "Your Featured pick has a personal reason",
};

const userFetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new UserRequestError(
      response.status === 401 ? "Not logged in" : "Could not load your account",
      response.status,
    );
  }
  return (await response.json()) as CurrentUser;
};

class UserRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "UserRequestError";
  }
}

export function CreatorOutletOnboarding() {
  const router = useRouter();
  const { t, translateError } = useI18n();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const handledNewRequestRef = useRef<string | null>(null);
  const createStartedRef = useRef(false);
  const firstSelectionTrackedRef = useRef(false);
  const [draft, setDraft] = useState<CreatorOutletDraft | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [autosaveState, setAutosaveState] = useState<AutosaveState>("idle");
  const [flowError, setFlowError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [archivedDrafts, setArchivedDrafts] = useState<CreatorOutletDraft[]>(
    [],
  );

  const {
    data: currentUser,
    error: userError,
    isLoading: isUserLoading,
  } = useSWR<CurrentUser>("/api/v1/user", userFetcher, {
    shouldRetryOnError: false,
  });

  useEffect(() => {
    if (
      isUserLoading ||
      !(userError instanceof UserRequestError) ||
      userError.status !== 401
    )
      return;
    router.replace(`/login?callbackUrl=${encodeURIComponent(router.asPath)}`);
  }, [isUserLoading, router, userError]);

  useEffect(() => {
    if (!currentUser || isHydrated || !router.isReady || router.query.new)
      return;
    const stored = loadCreatorOutletDraft(localStorage, currentUser.id);
    const next = stored ?? createCreatorOutletDraft(currentUser.id);
    const earliest = earliestIncompleteStep(next);
    const currentIndex = CREATOR_ONBOARDING_STEPS.indexOf(next.currentStep);
    const earliestIndex = CREATOR_ONBOARDING_STEPS.indexOf(earliest);
    setDraft(
      currentIndex > earliestIndex ? { ...next, currentStep: earliest } : next,
    );
    setArchivedDrafts(
      listCreatorOutletDraftArchives(localStorage, currentUser.id),
    );
    setIsHydrated(true);
  }, [currentUser, isHydrated, router.isReady, router.query.new]);

  useEffect(() => {
    if (!currentUser || !router.isReady) return;
    const newRequest =
      typeof router.query.new === "string" ? router.query.new : null;
    if (!newRequest) {
      handledNewRequestRef.current = null;
      return;
    }
    if (handledNewRequestRef.current === newRequest) return;

    handledNewRequestRef.current = newRequest;
    const active = loadCreatorOutletDraft(localStorage, currentUser.id);
    const startNew =
      !active ||
      window.confirm(
        t(
          "Start a new Outlet? Your current setup will be archived so you can resume it later.",
        ),
      );
    setDraft(
      startNew
        ? startNewCreatorOutletDraft(localStorage, currentUser.id)
        : active,
    );
    setArchivedDrafts(
      listCreatorOutletDraftArchives(localStorage, currentUser.id),
    );
    setIsHydrated(true);
    void router.replace("/store/new", undefined, { shallow: true });
  }, [currentUser, router, router.isReady, router.query.new, t]);

  useEffect(() => {
    if (!draft || !isHydrated) return;
    setAutosaveState("saving");
    const timeout = window.setTimeout(() => {
      try {
        saveCreatorOutletDraft(localStorage, draft);
        setAutosaveState("saved");
      } catch {
        setAutosaveState("error");
      }
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [draft, isHydrated]);

  const currentStep = draft?.currentStep;
  useEffect(() => {
    if (currentStep) headingRef.current?.focus();
  }, [currentStep]);

  function updateDraft(
    update: (current: CreatorOutletDraft) => CreatorOutletDraft,
  ) {
    setDraft((current) =>
      current
        ? { ...update(current), updatedAt: new Date().toISOString() }
        : current,
    );
    setFlowError(null);
  }

  function goToStep(step: CreatorOnboardingStep) {
    updateDraft((current) => ({ ...current, currentStep: step }));
  }

  if (
    userError &&
    (!(userError instanceof UserRequestError) || userError.status !== 401)
  ) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-4 bg-[#0b0812] px-5 text-center text-white">
        <p role="alert" className="font-bold text-rose-200">
          {t("We couldn't load your creator workspace.")}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className={secondaryButtonClassName}
        >
          <RefreshCw size={16} /> {t("Try again")}
        </button>
      </div>
    );
  }

  if (isUserLoading || !isHydrated || !draft) {
    return (
      <div
        className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-[#0b0812] text-white"
        aria-busy="true"
      >
        <Loader2 className="animate-spin text-violet-300" size={28} />
        <span className="sr-only">{t("Loading your setup...")}</span>
      </div>
    );
  }

  const progress = getOnboardingProgress(draft);

  async function saveIdentity() {
    if (!isCreatorIdentityComplete(draft)) return;
    setIsSubmitting(true);
    setFlowError(null);
    try {
      let activeSlug = draft.storeSlug;
      const storePayload = {
        name: draft.identity.name.trim(),
        description: creatorDescription(draft),
        logo_url: draft.identity.logoUrl.trim(),
      };

      if (!activeSlug) {
        if (!createStartedRef.current) {
          creatorFunnelAnalytics.createStarted({
            funnelVersion: CREATOR_OUTLET_FUNNEL_VERSION,
            entrySurface: "create_outlet",
          });
          createStartedRef.current = true;
        }
        const response = await fetch("/api/v1/stores", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(storePayload),
        });
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok || !isStoreCreateResponse(body)) {
          throw new Error(responseMessage(body, "Failed to create Outlet."));
        }
        activeSlug = body.slug;
        creatorFunnelAnalytics.draftCreated({
          funnelVersion: CREATOR_OUTLET_FUNNEL_VERSION,
          entrySurface: "create_outlet",
          hasDescription: true,
          hasLogo: true,
        });
        creatorFunnelAnalytics.brandComplete({
          funnelVersion: CREATOR_OUTLET_FUNNEL_VERSION,
          entrySurface: "create_outlet",
        });
        updateDraft((current) => ({ ...current, storeSlug: body.slug }));
      } else {
        const publication = await fetchOutletPublication(activeSlug);
        const response = await fetch(
          `/api/v1/stores/${encodeURIComponent(activeSlug)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...storePayload,
              expected_draft_revision: publication.draftRevision,
            }),
          },
        );
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok || !isStoreCreateResponse(body)) {
          throw new Error(
            response.status === 409
              ? t(
                  "This Outlet changed in another session. Review the latest identity and try again.",
                )
              : responseMessage(body, "Failed to update Outlet."),
          );
        }
      }

      updateDraft((current) => ({
        ...current,
        storeSlug: activeSlug,
        currentStep: "SELECTION",
      }));
      await mutateGlobal(
        `/api/v1/stores/${encodeURIComponent(activeSlug)}/publication`,
      );
    } catch (error) {
      setFlowError(
        translateError(
          error instanceof Error ? error.message : null,
          "We couldn't save your Outlet identity. Try again.",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function saveSelection() {
    if (!draft.storeSlug || !isCreatorSelectionComplete(draft)) return;
    setIsSubmitting(true);
    setFlowError(null);

    try {
      const publication = await fetchOutletPublication(draft.storeSlug);
      if (publication.catalogMode !== "UNDECIDED") {
        await router.push(
          `/store/${encodeURIComponent(draft.storeSlug)}/manage?tab=curation`,
        );
        return;
      }

      await saveExplicitOutletSelection(draft.storeSlug, {
        strategy: draft.selection.strategy as CreatorSelectionStrategy,
        tags: draft.selection.tags,
        gameSlugs: draft.selection.games.map((game) => game.slug),
        expectedDraftRevision: publication.draftRevision,
      });
      await mutateGlobal(
        `/api/v1/stores/${encodeURIComponent(draft.storeSlug)}/publication`,
      );
      if (
        draft.selection.strategy === "HANDPICKED" &&
        !firstSelectionTrackedRef.current
      ) {
        creatorFunnelAnalytics.firstGameAdded({
          funnelVersion: CREATOR_OUTLET_FUNNEL_VERSION,
          entrySurface: "manage_outlet",
          selectionSurface: "curation",
        });
        firstSelectionTrackedRef.current = true;
      }

      updateDraft((current) => ({
        ...current,
        currentStep: "FEATURED",
      }));
    } catch (error) {
      setFlowError(
        translateError(
          error instanceof Error ? error.message : null,
          "We couldn't save your selection. Try again.",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function saveFeatured() {
    if (!draft.storeSlug || !isCreatorFeaturedComplete(draft)) return;
    setIsSubmitting(true);
    setFlowError(null);
    try {
      const publication = await fetchOutletPublication(draft.storeSlug);
      const response = await fetch(
        `/api/v1/stores/${encodeURIComponent(draft.storeSlug)}/featured`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expected_draft_revision: publication.draftRevision,
            recommendations: [
              {
                game_slug: draft.featured.gameSlug,
                recommendation_reason:
                  draft.featured.recommendationReason.trim(),
              },
            ],
          }),
        },
      );
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          response.status === 409
            ? t(
                "This Outlet changed in another session. Review the latest Featured selection and try again.",
              )
            : responseMessage(body, "Failed to save your Featured pick."),
        );
      }
      await mutateGlobal(
        `/api/v1/stores/${encodeURIComponent(draft.storeSlug)}/publication`,
      );
      if (
        draft.selection.strategy === "FOCUSED" &&
        !firstSelectionTrackedRef.current
      ) {
        creatorFunnelAnalytics.firstGameAdded({
          funnelVersion: CREATOR_OUTLET_FUNNEL_VERSION,
          entrySurface: "manage_outlet",
          selectionSurface: "featured",
        });
        firstSelectionTrackedRef.current = true;
      }
      goToStep("PREVIEW");
    } catch (error) {
      setFlowError(
        translateError(
          error instanceof Error ? error.message : null,
          "We couldn't save your Featured pick. Try again.",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function restoreArchivedDraft(draftId: string) {
    if (!currentUser) return;
    const restored = restoreCreatorOutletDraft(
      localStorage,
      currentUser.id,
      draftId,
    );
    if (!restored) return;
    setDraft(restored);
    setArchivedDrafts(
      listCreatorOutletDraftArchives(localStorage, currentUser.id),
    );
    setFlowError(null);
  }

  function removeArchivedDraft(draftId: string) {
    if (
      !currentUser ||
      !window.confirm(t("Remove this archived setup from this device?"))
    ) {
      return;
    }
    removeCreatorOutletDraftArchive(localStorage, currentUser.id, draftId);
    setArchivedDrafts(
      listCreatorOutletDraftArchives(localStorage, currentUser.id),
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#0b0812] pb-20 text-white">
      <div className="mx-auto w-full max-w-6xl px-4 pt-8 sm:px-6 lg:px-10 lg:pt-12">
        <div className="mb-8 flex flex-col gap-5 border-b border-white/[0.08] pb-7 lg:mb-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-violet-300">
                {t("Creator setup")}
              </p>
              <h1
                ref={headingRef}
                tabIndex={-1}
                className="mt-2 max-w-2xl text-3xl font-black tracking-tight outline-none sm:text-4xl"
              >
                {t("Build an Outlet your audience will recognize")}
              </h1>
            </div>
            <AutosaveStatus state={autosaveState} />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between text-xs font-bold text-white/40">
              <span>
                {t("{completed} of {total} steps complete", progress)}
              </span>
              <span>{progress.percent}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
              <div
                className="h-full rounded-full bg-violet-400 transition-[width] duration-300"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </div>

          <ol
            className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            aria-label={t("Outlet setup steps")}
          >
            {CREATOR_ONBOARDING_STEPS.map((step, index) => {
              const active = step === draft.currentStep;
              const complete = isStepComplete(draft, step);
              return (
                <li
                  key={step}
                  aria-current={active ? "step" : undefined}
                  className={`flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-black uppercase tracking-wider ${
                    active ? "bg-white/[0.09] text-white" : "text-white/35"
                  }`}
                >
                  <span
                    className={`grid h-5 w-5 place-items-center rounded-full border text-[10px] ${
                      complete
                        ? "border-emerald-300/40 bg-emerald-300/15 text-emerald-200"
                        : "border-white/15"
                    }`}
                  >
                    {complete ? <Check size={12} /> : index + 1}
                  </span>
                  {t(stepLabels[step])}
                </li>
              );
            })}
          </ol>
        </div>

        {archivedDrafts.length > 0 && (
          <details className="mb-6 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
            <summary className="min-h-11 cursor-pointer py-3 text-sm font-black text-white/70">
              {t("Archived setups ({count})", { count: archivedDrafts.length })}
            </summary>
            <div className="mt-2 grid gap-2 border-t border-white/[0.08] pt-3">
              {archivedDrafts.map((archived) => (
                <div
                  key={archived.draftId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-black/20 p-3"
                >
                  <div>
                    <p className="text-sm font-black">
                      {archived.identity.name || t("Untitled Outlet")}
                    </p>
                    <p className="text-xs font-semibold text-white/35">
                      {t("Last saved {date}", {
                        date: new Date(archived.updatedAt).toLocaleDateString(),
                      })}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => restoreArchivedDraft(archived.draftId)}
                      className="min-h-11 rounded-lg border border-violet-300/25 px-3 text-xs font-black text-violet-200"
                    >
                      {t("Restore")}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeArchivedDraft(archived.draftId)}
                      className="min-h-11 rounded-lg px-3 text-xs font-black text-rose-200"
                    >
                      {t("Remove")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </details>
        )}

        {flowError && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm font-bold text-rose-200"
          >
            {flowError}
          </div>
        )}

        {draft.currentStep === "IDENTITY" && (
          <IdentityStep
            draft={draft}
            updateDraft={updateDraft}
            onContinue={saveIdentity}
            isSubmitting={isSubmitting}
          />
        )}
        {draft.currentStep === "SELECTION" && (
          <SelectionStep
            draft={draft}
            updateDraft={updateDraft}
            onBack={() => goToStep("IDENTITY")}
            onContinue={saveSelection}
            isSubmitting={isSubmitting}
          />
        )}
        {draft.currentStep === "FEATURED" && (
          <FeaturedStep
            draft={draft}
            updateDraft={updateDraft}
            onBack={() =>
              void router.push(
                `/store/${encodeURIComponent(draft.storeSlug as string)}/manage?tab=curation`,
              )
            }
            onContinue={saveFeatured}
            isSubmitting={isSubmitting}
          />
        )}
        {draft.currentStep === "PREVIEW" && draft.storeSlug && (
          <PreviewStep
            draft={draft}
            onBack={() => goToStep("FEATURED")}
            onContinue={() => {
              creatorFunnelAnalytics.previewed({
                funnelVersion: CREATOR_OUTLET_FUNNEL_VERSION,
                entrySurface: "outlet_preview",
                outletState: "draft",
              });
              updateDraft((current) => ({
                ...current,
                previewedAt: new Date().toISOString(),
                currentStep: "PUBLISH",
              }));
            }}
          />
        )}
        {draft.currentStep === "PUBLISH" && draft.storeSlug && (
          <PublishStep draft={draft} onBack={() => goToStep("PREVIEW")} />
        )}
      </div>
    </div>
  );
}

function IdentityStep({
  draft,
  updateDraft,
  onContinue,
  isSubmitting,
}: StepProps & { onContinue: () => void; isSubmitting: boolean }) {
  const { t } = useI18n();
  const initials = outletInitials(draft.identity.name);
  const combinedDescriptionLength = creatorDescription(draft).length;

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-12">
      <section className="max-w-2xl">
        <StepHeading
          eyebrow={t("Start with your point of view")}
          title={t("Tell people who this Outlet is for")}
          description={t(
            "Add a clear name, a short promise, your niche, and a logo. These are required before your Outlet can be published.",
          )}
        />

        <div className="mt-8 flex flex-col gap-5">
          <Field label={t("Outlet name")} htmlFor="outlet-name" required>
            <input
              id="outlet-name"
              value={draft.identity.name}
              onChange={(event) =>
                updateDraft((current) => ({
                  ...current,
                  identity: { ...current.identity, name: event.target.value },
                }))
              }
              autoComplete="organization"
              required
              maxLength={255}
              placeholder={t("e.g. Save Point Club")}
              className={inputClassName}
            />
          </Field>

          <Field
            label={t("Your niche")}
            htmlFor="outlet-niche"
            description={t(
              "Write it like you would introduce your channel or community.",
            )}
            required
          >
            <input
              id="outlet-niche"
              value={draft.identity.niche}
              onChange={(event) =>
                updateDraft((current) => ({
                  ...current,
                  identity: { ...current.identity, niche: event.target.value },
                }))
              }
              maxLength={120}
              required
              aria-describedby="outlet-niche-description"
              placeholder={t("Cozy indies for slow Sunday mornings")}
              className={inputClassName}
            />
          </Field>

          <Field
            label={t("Short description")}
            htmlFor="outlet-description"
            description={t(
              "This appears on your Outlet and helps people trust your picks.",
            )}
            required
          >
            <textarea
              id="outlet-description"
              value={draft.identity.description}
              onChange={(event) =>
                updateDraft((current) => ({
                  ...current,
                  identity: {
                    ...current.identity,
                    description: event.target.value,
                  },
                }))
              }
              maxLength={1000}
              required
              aria-describedby="outlet-description-description"
              rows={4}
              placeholder={t(
                "Thoughtful recommendations for players who want memorable worlds without the rush.",
              )}
              className={`${inputClassName} resize-y`}
            />
            <p
              role={combinedDescriptionLength > 1000 ? "alert" : "status"}
              className={`mt-2 text-right text-xs font-bold ${
                combinedDescriptionLength > 1000
                  ? "text-rose-200"
                  : "text-white/30"
              }`}
            >
              {t("{count} / 1000 characters including niche", {
                count: combinedDescriptionLength,
              })}
            </p>
          </Field>

          <Field
            label={t("Logo URL")}
            htmlFor="outlet-logo"
            description={t(
              "Required for publishing. Use a direct HTTPS image URL for your Outlet logo.",
            )}
            required
          >
            <input
              id="outlet-logo"
              type="url"
              pattern="https://.*"
              maxLength={2048}
              required
              aria-describedby="outlet-logo-description"
              value={draft.identity.logoUrl}
              onChange={(event) =>
                updateDraft((current) => ({
                  ...current,
                  identity: {
                    ...current.identity,
                    logoUrl: event.target.value,
                  },
                }))
              }
              placeholder="https://example.com/logo.png"
              className={inputClassName}
            />
          </Field>
        </div>

        <div className="mt-8 flex justify-end">
          <PrimaryButton
            onClick={onContinue}
            disabled={!isCreatorIdentityComplete(draft) || isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 size={17} className="animate-spin" />
                {t("Saving identity...")}
              </>
            ) : (
              <>
                {t("Choose your games")}
                <ArrowRight size={17} />
              </>
            )}
          </PrimaryButton>
        </div>
      </section>

      <aside className="rounded-2xl border border-white/[0.08] bg-[#14101c] p-5 lg:sticky lg:top-28">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">
          {t("Identity preview")}
        </p>
        <div className="mt-5 flex items-center gap-4">
          <div
            className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-violet-300/20 bg-[#21182f] bg-cover bg-center text-xl font-black text-violet-200"
            style={
              draft.identity.logoUrl.trim()
                ? { backgroundImage: `url(${draft.identity.logoUrl.trim()})` }
                : undefined
            }
          >
            {initials}
          </div>
          <div className="min-w-0">
            <p className="truncate text-lg font-black">
              {draft.identity.name.trim() || t("Your Outlet")}
            </p>
            <p className="mt-1 line-clamp-2 text-sm font-semibold leading-5 text-white/45">
              {draft.identity.niche.trim() ||
                t("Your point of view will appear here.")}
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}

function SelectionStep({
  draft,
  updateDraft,
  onBack,
  onContinue,
  isSubmitting,
}: StepProps & {
  onBack: () => void;
  onContinue: () => void;
  isSubmitting: boolean;
}) {
  const { t } = useI18n();
  const [selectionPreview, setSelectionPreview] = useState<{
    count: number;
    minimum: number;
    canApply: boolean;
  } | null>(null);
  const [isPreviewingSelection, setIsPreviewingSelection] = useState(false);
  const [selectionPreviewError, setSelectionPreviewError] = useState<
    string | null
  >(null);
  const [existingCatalogMode, setExistingCatalogMode] = useState<
    "ALL" | "SELECTED" | null
  >(null);

  useEffect(() => {
    if (!draft.storeSlug || !isCreatorSelectionComplete(draft)) {
      setSelectionPreview(null);
      setSelectionPreviewError(null);
      setExistingCatalogMode(null);
      return;
    }
    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      setIsPreviewingSelection(true);
      setSelectionPreviewError(null);
      try {
        const publication = await fetchOutletPublication(
          draft.storeSlug as string,
        );
        if (publication.catalogMode !== "UNDECIDED") {
          if (!cancelled) {
            setExistingCatalogMode(publication.catalogMode);
            setSelectionPreview(null);
            setSelectionPreviewError(null);
          }
          return;
        }
        if (!cancelled) setExistingCatalogMode(null);
        const preview = await previewExplicitOutletSelection(
          draft.storeSlug as string,
          {
            strategy: draft.selection.strategy as CreatorSelectionStrategy,
            tags: draft.selection.tags,
            gameSlugs: draft.selection.games.map((game) => game.slug),
            expectedDraftRevision: publication.draftRevision,
          },
        );
        if (!cancelled) {
          setSelectionPreview({
            count: preview.catalogGameCount,
            minimum: preview.minimumGameCount,
            canApply: preview.canApply,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setSelectionPreview(null);
          setSelectionPreviewError(
            error instanceof Error
              ? error.message
              : "Could not preview selection.",
          );
        }
      } finally {
        if (!cancelled) setIsPreviewingSelection(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [
    draft,
    draft.selection.games,
    draft.selection.strategy,
    draft.selection.tags,
    draft.storeSlug,
  ]);

  function chooseStrategy(strategy: CreatorSelectionStrategy) {
    updateDraft((current) => ({
      ...current,
      selection:
        current.selection.strategy === strategy
          ? current.selection
          : { strategy, tags: [], games: [] },
      featured:
        current.selection.strategy === strategy
          ? current.featured
          : { gameSlug: null, recommendationReason: "" },
    }));
  }

  function toggleTag(tag: string) {
    updateDraft((current) => {
      const selected = current.selection.tags.includes(tag);
      return {
        ...current,
        selection: {
          ...current.selection,
          tags: selected
            ? current.selection.tags.filter((item) => item !== tag)
            : [...current.selection.tags, tag],
        },
      };
    });
  }

  function addGame(game: GameApi) {
    if (draft.selection.games.some((item) => item.slug === game.slug)) return;
    updateDraft((current) => ({
      ...current,
      selection: {
        ...current.selection,
        games: [...current.selection.games, gameSummary(game)],
      },
    }));
  }

  return (
    <section className="max-w-4xl">
      <StepHeading
        eyebrow={t("Make an intentional first selection")}
        title={t("How do you want to shape your shelf?")}
        description={t(
          "Nothing goes live automatically. Choose a focused niche or handpick the first games your audience should see.",
        )}
      />

      <fieldset
        role="radiogroup"
        onKeyDown={(event) => {
          if (
            !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
              event.key,
            )
          )
            return;
          event.preventDefault();
          chooseStrategy(
            draft.selection.strategy === "FOCUSED" ? "HANDPICKED" : "FOCUSED",
          );
        }}
        className="mt-8 grid gap-3 sm:grid-cols-2"
      >
        <legend className="sr-only">{t("Selection strategy")}</legend>
        <StrategyButton
          active={draft.selection.strategy === "FOCUSED"}
          onClick={() => chooseStrategy("FOCUSED")}
          icon={<Target size={20} />}
          title={t("Focused niche")}
          description={t(
            "Show games that match the themes you choose. Best for a clear genre or mood.",
          )}
        />
        <StrategyButton
          active={draft.selection.strategy === "HANDPICKED"}
          onClick={() => chooseStrategy("HANDPICKED")}
          icon={<Sparkles size={20} />}
          title={t("Handpicked shelf")}
          description={t(
            "Start with five or more specific games. Best when every recommendation is personal.",
          )}
        />
      </fieldset>

      {draft.selection.strategy === "FOCUSED" && (
        <div className="mt-8 rounded-2xl border border-white/[0.08] bg-[#14101c] p-5 sm:p-6">
          <h3 className="font-black">
            {t("Choose themes your audience expects")}
          </h3>
          <p className="mt-1 text-sm font-semibold text-white/45">
            {t("Choose at least one. You can refine this selection later.")}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {CATEGORIES.filter((category) => category !== "For You").map(
              (category) => {
                const selected = draft.selection.tags.includes(category);
                return (
                  <button
                    key={category}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleTag(category)}
                    className={`min-h-11 rounded-xl border px-4 py-2 text-sm font-bold outline-none transition focus-visible:ring-2 focus-visible:ring-violet-400 ${
                      selected
                        ? "border-violet-300/35 bg-violet-300/15 text-violet-100"
                        : "border-white/10 bg-white/[0.03] text-white/55 hover:bg-white/[0.07] hover:text-white"
                    }`}
                  >
                    {selected && <Check size={14} className="mr-1.5 inline" />}
                    {t(category)}
                  </button>
                );
              },
            )}
          </div>
          {draft.selection.tags.length > 0 && (
            <p
              className="mt-4 text-xs font-bold text-emerald-200"
              role="status"
            >
              {t(
                draft.selection.tags.length === 1
                  ? "1 theme selected"
                  : "{count} themes selected",
                { count: draft.selection.tags.length },
              )}
            </p>
          )}
        </div>
      )}

      {draft.selection.strategy === "HANDPICKED" && (
        <div className="mt-8 rounded-2xl border border-white/[0.08] bg-[#14101c] p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="font-black">{t("Pick your first five games")}</h3>
              <p className="mt-1 text-sm font-semibold text-white/45">
                {t(
                  "Search the catalog and choose the games you would recommend first.",
                )}
              </p>
            </div>
            <span
              className={`text-sm font-black ${
                draft.selection.games.length >= 5
                  ? "text-emerald-200"
                  : "text-white/45"
              }`}
            >
              {t("{count} / 5 selected", {
                count: draft.selection.games.length,
              })}
            </span>
          </div>
          <div className="mt-5">
            <GameAutocomplete
              onSelect={addGame}
              placeholder={t("Search games on Manifold")}
            />
          </div>
          {draft.selection.games.length === 0 ? (
            <div className="mt-5 rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm font-semibold text-white/35">
              {t("Your handpicked games will appear here.")}
            </div>
          ) : (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {draft.selection.games.map((game) => (
                <GameChoiceCard
                  key={game.slug}
                  game={game}
                  onRemove={() =>
                    updateDraft((current) => ({
                      ...current,
                      selection: {
                        ...current.selection,
                        games: current.selection.games.filter(
                          (item) => item.slug !== game.slug,
                        ),
                      },
                    }))
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}

      {(isPreviewingSelection || selectionPreview || selectionPreviewError) && (
        <div
          role={selectionPreviewError ? "alert" : "status"}
          aria-live="polite"
          className={`mt-6 rounded-xl border px-4 py-3 text-sm font-bold ${
            selectionPreviewError || selectionPreview?.canApply === false
              ? "border-rose-400/25 bg-rose-400/10 text-rose-200"
              : "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
          }`}
        >
          {isPreviewingSelection
            ? t("Calculating the real catalog impact...")
            : selectionPreviewError
              ? t(
                  "We couldn't preview this selection. Review it and try again.",
                )
              : t(
                  "This selection will include {count} eligible games (minimum {minimum}).",
                  {
                    count: selectionPreview?.count ?? 0,
                    minimum: selectionPreview?.minimum ?? 5,
                  },
                )}
        </div>
      )}

      {existingCatalogMode && (
        <div
          role="status"
          aria-live="polite"
          className="mt-6 rounded-xl border border-violet-300/25 bg-violet-300/10 px-4 py-4 text-sm font-bold text-violet-100"
        >
          <p>{t("This Outlet already has a saved game selection.")}</p>
          <p className="mt-1 font-semibold text-white/55">
            {t(
              "Continue in the curation workspace to review or change it without replacing existing work.",
            )}
          </p>
          <Link
            href={`/store/${encodeURIComponent(draft.storeSlug as string)}/manage?tab=curation`}
            className={`${secondaryButtonClassName} mt-4`}
          >
            {t("Open your game selection")}
            <ArrowRight size={17} />
          </Link>
        </div>
      )}

      <StepActions onBack={onBack}>
        {existingCatalogMode ? (
          <Link
            href={`/store/${encodeURIComponent(draft.storeSlug as string)}/manage?tab=curation`}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-5 py-3 text-sm font-black uppercase tracking-wider text-white transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            {t("Continue in Your games")}
            <ArrowRight size={17} />
          </Link>
        ) : (
          <PrimaryButton
            onClick={onContinue}
            disabled={
              !isCreatorSelectionComplete(draft) ||
              isSubmitting ||
              isPreviewingSelection ||
              !selectionPreview?.canApply
            }
          >
            {isSubmitting ? (
              <>
                <Loader2 size={17} className="animate-spin" />
                {t("Saving selection...")}
              </>
            ) : (
              <>
                {t("Save selection")}
                <ArrowRight size={17} />
              </>
            )}
          </PrimaryButton>
        )}
      </StepActions>
    </section>
  );
}

function FeaturedStep({
  draft,
  updateDraft,
  onBack,
  onContinue,
  isSubmitting,
}: StepProps & {
  onBack: () => void;
  onContinue: () => void;
  isSubmitting: boolean;
}) {
  const { t } = useI18n();
  const chosen = draft.selection.games.find(
    (game) => game.slug === draft.featured.gameSlug,
  );

  function chooseGame(game: CreatorGameSummary) {
    updateDraft((current) => ({
      ...current,
      featured: { ...current.featured, gameSlug: game.slug },
    }));
  }

  function addFocusedGame(game: GameApi) {
    const summary = gameSummary(game);
    updateDraft((current) => ({
      ...current,
      selection: {
        ...current.selection,
        games: current.selection.games.some((item) => item.slug === game.slug)
          ? current.selection.games
          : [...current.selection.games, summary],
      },
      featured: { ...current.featured, gameSlug: game.slug },
    }));
  }

  return (
    <section className="max-w-4xl">
      <StepHeading
        eyebrow={t("Lead with a recommendation")}
        title={t("Choose the game that opens your story")}
        description={t(
          "Your Featured pick gets the largest space. Add the personal reason you would give a friend — it is required before publishing.",
        )}
      />

      <div className="mt-8 grid gap-7 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div>
          {draft.selection.strategy === "FOCUSED" && (
            <div className="mb-5 rounded-2xl border border-white/[0.08] bg-[#14101c] p-5">
              <p className="mb-3 text-sm font-black">
                {t("Search inside your focused selection")}
              </p>
              <GameAutocomplete
                endpoint={`/api/v1/stores/${draft.storeSlug}/search?preview=1`}
                onSelect={addFocusedGame}
                placeholder={t("Search games in this Outlet...")}
              />
            </div>
          )}

          {draft.selection.games.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 px-5 py-10 text-center">
              <p className="font-black text-white/60">
                {t("No games match yet")}
              </p>
              <p className="mt-1 text-sm font-semibold text-white/35">
                {t("Go back and broaden your themes, then try again.")}
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {draft.selection.games.map((game) => {
                const active = game.slug === draft.featured.gameSlug;
                return (
                  <button
                    key={game.slug}
                    type="button"
                    onClick={() => chooseGame(game)}
                    aria-pressed={active}
                    className={`overflow-hidden rounded-2xl border text-left outline-none transition focus-visible:ring-2 focus-visible:ring-violet-400 ${
                      active
                        ? "border-violet-300/45 bg-violet-300/10"
                        : "border-white/[0.08] bg-[#14101c] hover:border-white/20"
                    }`}
                  >
                    <GameBanner game={game} />
                    <span className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 text-sm font-black">
                      <span className="truncate">{game.title}</span>
                      {active && (
                        <CheckCircle2
                          size={17}
                          className="shrink-0 text-violet-200"
                        />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <aside className="rounded-2xl border border-white/[0.08] bg-[#14101c] p-5 lg:sticky lg:top-28">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-300">
            {t("Your recommendation")}
          </p>
          {chosen ? (
            <>
              <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
                <GameBanner game={chosen} />
              </div>
              <p className="mt-3 font-black">{chosen.title}</p>
              <label
                htmlFor="featured-reason"
                className="mt-5 block text-xs font-black uppercase tracking-wider text-white/45"
              >
                {t("Why should they play it?")}
              </label>
              <textarea
                id="featured-reason"
                value={draft.featured.recommendationReason}
                onChange={(event) =>
                  updateDraft((current) => ({
                    ...current,
                    featured: {
                      ...current.featured,
                      recommendationReason: event.target.value,
                    },
                  }))
                }
                maxLength={240}
                rows={5}
                placeholder={t(
                  "It makes every small choice feel meaningful, and the soundtrack stays with you.",
                )}
                className={`${inputClassName} mt-2 resize-y`}
              />
              <p className="mt-2 text-right text-xs font-bold text-white/30">
                {draft.featured.recommendationReason.length}/240
              </p>
            </>
          ) : (
            <p className="mt-4 text-sm font-semibold leading-6 text-white/40">
              {t("Choose one game to write your recommendation.")}
            </p>
          )}
        </aside>
      </div>

      <StepActions onBack={onBack}>
        <PrimaryButton
          onClick={onContinue}
          disabled={!isCreatorFeaturedComplete(draft) || isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader2 size={17} className="animate-spin" />
              {t("Saving Featured...")}
            </>
          ) : (
            <>
              {t("See the preview")}
              <ArrowRight size={17} />
            </>
          )}
        </PrimaryButton>
      </StepActions>
    </section>
  );
}

function PreviewStep({
  draft,
  onBack,
  onContinue,
}: {
  draft: CreatorOutletDraft;
  onBack: () => void;
  onContinue: () => void;
}) {
  const { t } = useI18n();
  const previewHref = outletPreviewHref(draft.storeSlug as string);
  const [isPreviewLoaded, setIsPreviewLoaded] = useState(false);
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const [previewError, setPreviewError] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => setPreviewError(true), 10000);
    const handleMessage = (event: MessageEvent) => {
      const isOwnPreview =
        event.origin === window.location.origin &&
        event.source === iframeRef.current?.contentWindow &&
        isRecord(event.data) &&
        event.data.slug === draft.storeSlug;
      if (!isOwnPreview) return;
      if (event.data.type === "manifold:outlet-preview-ready") {
        window.clearTimeout(timeout);
        setPreviewError(false);
        setIsPreviewLoaded(true);
      } else if (event.data.type === "manifold:outlet-preview-error") {
        window.clearTimeout(timeout);
        setIsPreviewLoaded(false);
        setPreviewError(true);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("message", handleMessage);
    };
  }, [draft.storeSlug, previewAttempt]);

  return (
    <section>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <StepHeading
          eyebrow={t("Check the experience")}
          title={t("Preview your Outlet before it goes live")}
          description={t(
            "This is the same storefront your audience will see, including regional prices and attributed game links.",
          )}
        />
        <Link
          href={previewHref}
          target="_blank"
          rel="noreferrer"
          className={secondaryButtonClassName}
        >
          {t("Open full preview")}
          <ExternalLink size={16} />
        </Link>
      </div>

      <div className="mt-7 overflow-hidden rounded-2xl border border-white/10 bg-[#14101c] shadow-2xl shadow-black/20">
        <div className="flex h-11 items-center gap-2 border-b border-white/[0.08] px-4">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-300/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-300/60" />
          <span className="ml-3 truncate text-xs font-bold text-white/30">
            /store/{draft.storeSlug}?preview=1
          </span>
        </div>
        <iframe
          key={previewAttempt}
          ref={iframeRef}
          src={previewHref}
          title={t("Preview of {name}", { name: draft.identity.name })}
          className="h-[34rem] w-full bg-[#0b0812] sm:h-[42rem]"
        />
      </div>

      {previewError && (
        <div
          role="alert"
          className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm font-bold text-rose-200"
        >
          <span>{t("The preview did not confirm that it loaded.")}</span>
          <button
            type="button"
            onClick={() => {
              setIsPreviewLoaded(false);
              setPreviewError(false);
              setPreviewAttempt((attempt) => attempt + 1);
            }}
            className={secondaryButtonClassName}
          >
            <RefreshCw size={16} /> {t("Try again")}
          </button>
        </div>
      )}

      <StepActions onBack={onBack}>
        <PrimaryButton onClick={onContinue} disabled={!isPreviewLoaded}>
          {isPreviewLoaded
            ? t("I reviewed the preview")
            : t("Loading preview...")}
          <ArrowRight size={17} />
        </PrimaryButton>
      </StepActions>
    </section>
  );
}

function PublishStep({
  draft,
  onBack,
}: {
  draft: CreatorOutletDraft;
  onBack: () => void;
}) {
  const { t, translateError } = useI18n();
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [justCopied, setJustCopied] = useState(false);
  const slug = draft.storeSlug as string;
  const {
    data: publication,
    error,
    isLoading,
    mutate,
  } = useSWR(`/api/v1/stores/${slug}/publication`, () =>
    fetchOutletPublication(slug),
  );

  async function publish() {
    setIsPublishing(true);
    setActionError(null);
    try {
      const updated = await updateOutletPublication(
        slug,
        "publish",
        publication.draftRevision,
      );
      await mutate(updated, { revalidate: false });
      if (publication.status === "DRAFT" && updated.status === "PUBLISHED") {
        creatorFunnelAnalytics.published({
          funnelVersion: CREATOR_OUTLET_FUNNEL_VERSION,
          entrySurface: "manage_outlet",
        });
      }
    } catch (publishError) {
      setActionError(
        translateError(
          publishError instanceof Error ? publishError.message : null,
          "We couldn't publish your Outlet. Review the checklist and try again.",
        ),
      );
      await mutate();
    } finally {
      setIsPublishing(false);
    }
  }

  async function copyLink() {
    setIsCopying(true);
    setActionError(null);
    try {
      const url = `${window.location.origin}/store/${encodeURIComponent(slug)}`;
      await navigator.clipboard.writeText(url);
      creatorFunnelAnalytics.linkCopied({
        funnelVersion: CREATOR_OUTLET_FUNNEL_VERSION,
        entrySurface: "outlet_preview",
        copyContext: "publish_success",
      });
      setJustCopied(true);
      window.setTimeout(() => setJustCopied(false), 3000);
      const completedDraft = {
        ...draft,
        linkCopiedAt: new Date().toISOString(),
      };
      completeCreatorOutletDraft(localStorage, completedDraft);
    } catch {
      setActionError(
        t(
          "We couldn't copy the link. Open the Outlet and copy it from your browser.",
        ),
      );
    } finally {
      setIsCopying(false);
    }
  }

  if (isLoading) {
    return (
      <div
        className="flex min-h-64 items-center justify-center"
        aria-busy="true"
      >
        <Loader2 className="animate-spin text-violet-300" size={26} />
        <span className="sr-only">
          {t("Checking publication readiness...")}
        </span>
      </div>
    );
  }

  if (error || !publication) {
    const message =
      error instanceof CreatorOutletRequestError
        ? error.message
        : "We couldn't check whether this Outlet is ready.";
    return (
      <section className="max-w-2xl">
        <h2 className="text-2xl font-black">{t("Readiness unavailable")}</h2>
        <div
          role="alert"
          className="mt-5 rounded-xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm font-bold text-rose-200"
        >
          {translateError(
            message,
            "We couldn't check whether this Outlet is ready.",
          )}
        </div>
        <button
          type="button"
          onClick={() => mutate()}
          className={`${secondaryButtonClassName} mt-5`}
        >
          <RefreshCw size={16} />
          {t("Try again")}
        </button>
      </section>
    );
  }

  const isPublished = publication.status === "PUBLISHED";

  return (
    <section className="max-w-4xl">
      <StepHeading
        eyebrow={isPublished ? t("Ready to share") : t("Final check")}
        title={
          isPublished
            ? t("Your Outlet is live")
            : t("Publish when every promise is true")
        }
        description={
          isPublished
            ? t(
                "Copy your link and invite your audience into the selection you built.",
              )
            : t(
                "The server checks the real Outlet — not just this form — before it can go live.",
              )
        }
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="rounded-2xl border border-white/[0.08] bg-[#14101c] p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-black">{t("Publication checklist")}</h3>
            <span
              className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider ${
                publication.ready
                  ? "bg-emerald-300/15 text-emerald-200"
                  : "bg-amber-300/15 text-amber-200"
              }`}
            >
              {publication.ready ? t("Ready") : t("Needs attention")}
            </span>
          </div>
          <ul className="mt-5 divide-y divide-white/[0.07]">
            {(Object.keys(readinessLabels) as OutletReadinessKey[]).map(
              (key) => {
                const complete = publication.checks[key];
                return (
                  <li
                    key={key}
                    className="flex min-h-14 items-center gap-3 py-3"
                  >
                    <span
                      className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${
                        complete
                          ? "border-emerald-300/35 bg-emerald-300/10 text-emerald-200"
                          : "border-white/15 text-white/30"
                      }`}
                    >
                      {complete ? <Check size={14} /> : "·"}
                    </span>
                    <span
                      className={`text-sm font-bold ${
                        complete ? "text-white/75" : "text-white/45"
                      }`}
                    >
                      {t(readinessLabels[key])}
                    </span>
                  </li>
                );
              },
            )}
          </ul>
        </div>

        <aside className="flex flex-col rounded-2xl border border-violet-300/20 bg-violet-300/[0.08] p-5">
          <Store size={24} className="text-violet-200" />
          <p className="mt-4 text-lg font-black">{draft.identity.name}</p>
          <p className="mt-1 text-sm font-semibold leading-5 text-white/45">
            {draft.identity.niche}
          </p>
          <div className="mt-auto pt-7">
            {isPublished ? (
              <div className="flex flex-col gap-3">
                <PrimaryButton
                  onClick={copyLink}
                  disabled={isCopying}
                  fullWidth
                >
                  {isCopying ? (
                    <Loader2 size={17} className="animate-spin" />
                  ) : justCopied ? (
                    <Check size={17} />
                  ) : (
                    <Copy size={17} />
                  )}
                  {justCopied ? t("Link copied") : t("Copy Outlet link")}
                </PrimaryButton>
                <Link
                  href={`/store/${encodeURIComponent(slug)}`}
                  className={`${secondaryButtonClassName} w-full`}
                >
                  {t("View live")}
                  <ExternalLink size={16} />
                </Link>
                <Link
                  href={`/store/${encodeURIComponent(slug)}/manage`}
                  className="min-h-11 px-3 py-2 text-center text-sm font-bold text-white/50 outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-violet-400"
                >
                  {t("Go to Overview")}
                </Link>
              </div>
            ) : (
              <PrimaryButton
                onClick={publish}
                disabled={!publication.ready || isPublishing}
                fullWidth
              >
                {isPublishing ? (
                  <Loader2 size={17} className="animate-spin" />
                ) : (
                  <Sparkles size={17} />
                )}
                {isPublishing ? t("Publishing...") : t("Publish Outlet")}
              </PrimaryButton>
            )}
          </div>
        </aside>
      </div>

      {actionError && (
        <div
          role="alert"
          className="mt-5 rounded-xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm font-bold text-rose-200"
        >
          {actionError}
        </div>
      )}

      {!isPublished && (
        <StepActions onBack={onBack}>
          <Link
            href={outletPreviewHref(slug)}
            className={secondaryButtonClassName}
          >
            {t("Preview")}
            <ExternalLink size={16} />
          </Link>
        </StepActions>
      )}
    </section>
  );
}

type StepProps = {
  draft: CreatorOutletDraft;
  updateDraft: (
    update: (current: CreatorOutletDraft) => CreatorOutletDraft,
  ) => void;
};

function StepHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-[0.16em] text-white/35">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
        {title}
      </h2>
      <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-white/50">
        {description}
      </p>
    </div>
  );
}

function AutosaveStatus({ state }: { state: AutosaveState }) {
  const { t } = useI18n();
  return (
    <p
      role="status"
      aria-live="polite"
      className={`flex min-h-8 items-center gap-2 text-xs font-bold ${
        state === "error" ? "text-rose-200" : "text-white/35"
      }`}
    >
      {state === "saving" && <Loader2 size={13} className="animate-spin" />}
      {state === "saved" && <Check size={13} />}
      {state === "saving"
        ? t("Saving your progress...")
        : state === "saved"
          ? t("Progress saved on this device")
          : state === "error"
            ? t("Progress could not be saved")
            : null}
    </p>
  );
}

function Field({
  label,
  htmlFor,
  description,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  description?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="text-xs font-black uppercase tracking-[0.12em] text-white/55"
      >
        {label}
        {required && <span className="ml-1 text-violet-300">*</span>}
      </label>
      {description && (
        <p
          id={`${htmlFor}-description`}
          className="mt-1 text-xs font-semibold leading-5 text-white/35"
        >
          {description}
        </p>
      )}
      <div className="mt-2">{children}</div>
    </div>
  );
}

function StrategyButton({
  active,
  onClick,
  icon,
  title,
  description,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={`min-h-36 rounded-2xl border p-5 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-violet-400 ${
        active
          ? "border-violet-300/40 bg-violet-300/10"
          : "border-white/[0.08] bg-[#14101c] hover:border-white/20"
      }`}
    >
      <span
        className={`grid h-10 w-10 place-items-center rounded-xl ${
          active
            ? "bg-violet-300/15 text-violet-200"
            : "bg-white/[0.05] text-white/45"
        }`}
      >
        {icon}
      </span>
      <span className="mt-4 block font-black">{title}</span>
      <span className="mt-1 block text-sm font-semibold leading-5 text-white/45">
        {description}
      </span>
    </button>
  );
}

function GameChoiceCard({
  game,
  onRemove,
}: {
  game: CreatorGameSummary;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  return (
    <article className="flex min-w-0 items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
      <div className="w-24 shrink-0 overflow-hidden rounded-lg border border-white/[0.07]">
        <GameBanner game={game} />
      </div>
      <p className="min-w-0 flex-1 truncate text-sm font-black">{game.title}</p>
      <button
        type="button"
        onClick={onRemove}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-white/40 outline-none hover:bg-white/[0.07] hover:text-white focus-visible:ring-2 focus-visible:ring-violet-400"
        aria-label={t("Remove {title}", { title: game.title })}
      >
        <X size={16} />
      </button>
    </article>
  );
}

function GameBanner({ game }: { game: CreatorGameSummary }) {
  return (
    <div
      className="aspect-video w-full bg-[#21182f] bg-cover bg-center"
      style={
        game.bannerUrl
          ? { backgroundImage: `url(${game.bannerUrl})` }
          : undefined
      }
    />
  );
}

function StepActions({
  onBack,
  children,
}: {
  onBack: () => void;
  children: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="mt-8 flex flex-col-reverse gap-3 border-t border-white/[0.08] pt-6 sm:flex-row sm:items-center sm:justify-between">
      <button
        type="button"
        onClick={onBack}
        className={secondaryButtonClassName}
      >
        <ArrowLeft size={17} />
        {t("Back")}
      </button>
      <div className="flex flex-col gap-3 sm:flex-row">{children}</div>
    </div>
  );
}

function PrimaryButton({
  children,
  disabled,
  onClick,
  fullWidth,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  fullWidth?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      data-creator-primary-action="true"
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-5 py-3 text-sm font-black text-white outline-none transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0812] disabled:cursor-not-allowed disabled:opacity-40 ${
        fullWidth ? "w-full" : "w-full sm:w-auto"
      }`}
    >
      {children}
    </button>
  );
}

const inputClassName =
  "min-h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-base font-semibold text-white placeholder:text-white/25 outline-none transition focus:border-violet-300/40 focus:bg-white/[0.07] focus-visible:ring-2 focus-visible:ring-violet-400 sm:text-sm";

const secondaryButtonClassName =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-black text-white/70 outline-none transition hover:bg-white/[0.08] hover:text-white focus-visible:ring-2 focus-visible:ring-violet-400 disabled:cursor-not-allowed disabled:opacity-40";

function gameSummary(game: GameApi): CreatorGameSummary {
  return {
    id: game.id,
    slug: game.slug,
    title: game.title,
    bannerUrl: game.media.banner ?? null,
  };
}

function outletInitials(name: string) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return initials || "O";
}

function isStepComplete(
  draft: CreatorOutletDraft,
  step: CreatorOnboardingStep,
) {
  if (step === "IDENTITY") return isCreatorIdentityComplete(draft);
  if (step === "SELECTION") {
    return isCreatorSelectionComplete(draft) && !!draft.storeSlug;
  }
  if (step === "FEATURED") return isCreatorFeaturedComplete(draft);
  if (step === "PREVIEW") return !!draft.previewedAt;
  return !!draft.linkCopiedAt;
}

function isStoreCreateResponse(value: unknown): value is StoreCreateResponse {
  return (
    isRecord(value) &&
    typeof value.slug === "string" &&
    typeof value.draft_revision === "number" &&
    Number.isSafeInteger(value.draft_revision) &&
    value.draft_revision >= 1
  );
}

function responseMessage(value: unknown, fallback: string) {
  return isRecord(value) && typeof value.message === "string"
    ? value.message
    : fallback;
}

function creatorDescription(draft: CreatorOutletDraft) {
  const niche = draft.identity.niche.trim();
  const description = draft.identity.description.trim();
  return niche === description ? description : `${niche}\n\n${description}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
