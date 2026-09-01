import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import useSWR, { mutate } from "swr";
import {
  BadgeCheck,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Gamepad2,
  Loader2,
  Search,
  ShieldAlert,
  XCircle,
} from "lucide-react";

import { CreatorWorkspaceLayout } from "components/creator/CreatorWorkspaceLayout";
import type {
  OwnershipClaimApi,
  OwnershipClaimStatus,
  StudioOwnershipClaimResponse,
} from "components/ownership/types";
import type { GameApi } from "components/store/types";
import { useI18n } from "lib/i18n";

interface StudioApi {
  id: string;
  slug: string;
  name: string;
}

interface StudiosResponse {
  studios: StudioApi[];
}

interface GamesResponse {
  games: GameApi[];
}

const fetcher = async <Response,>(url: string): Promise<Response> => {
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message || "Failed to load ownership claims.");
  }
  return response.json();
};

const STATUS_STYLES: Record<OwnershipClaimStatus, string> = {
  PENDING: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  APPROVED: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  REJECTED: "border-rose-400/30 bg-rose-400/10 text-rose-200",
};

export default function StudioOwnershipClaimsPage() {
  const router = useRouter();
  const { locale, t, translateError } = useI18n();
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [selectedGame, setSelectedGame] = useState<GameApi | null>(null);
  const [studioId, setStudioId] = useState("");
  const [acceptedRightsTerms, setAcceptedRightsTerms] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [createdClaim, setCreatedClaim] = useState<OwnershipClaimApi | null>(
    null,
  );

  const requestedGameSlug =
    typeof router.query.game === "string" ? router.query.game : null;
  const { data: requestedGame } = useSWR<GameApi>(
    requestedGameSlug ? `/api/v1/items/games/${requestedGameSlug}` : null,
    fetcher,
  );

  const {
    data: studiosData,
    isLoading: isLoadingStudios,
    error: studiosError,
  } = useSWR<StudiosResponse>("/api/v1/studios", fetcher, {
    shouldRetryOnError: false,
  });

  useEffect(() => {
    if (!isLoadingStudios && studiosError) {
      router.replace(`/login?callbackUrl=${encodeURIComponent(router.asPath)}`);
    }
  }, [isLoadingStudios, router, studiosError]);

  useEffect(() => {
    if (!requestedGame || requestedGame.ownership_status !== "UNCLAIMED") {
      return;
    }
    setSelectedGame(requestedGame);
    setQuery(requestedGame.title);
    setAcceptedRightsTerms(false);
    setCreatedClaim(null);
    setFormError(null);
  }, [requestedGame]);

  const searchParams = new URLSearchParams({
    q: submittedQuery,
    limit: "20",
    order: "title_asc",
    locale,
    ownership_status: "UNCLAIMED",
  });
  const gamesKey = submittedQuery
    ? `/api/v1/games?${searchParams.toString()}`
    : null;
  const {
    data: gamesData,
    isLoading: isLoadingGames,
    error: gamesError,
  } = useSWR<GamesResponse>(gamesKey, fetcher);

  const claimParams = new URLSearchParams({ studio_id: studioId, locale });
  const claimKey =
    selectedGame && studioId
      ? `/api/v1/games/${selectedGame.slug}/ownership-claims?${claimParams.toString()}`
      : null;
  const {
    data: claimData,
    isLoading: isLoadingClaims,
    error: claimsError,
  } = useSWR<StudioOwnershipClaimResponse>(claimKey, fetcher);

  const studios = studiosData?.studios ?? [];
  const unclaimedGames = useMemo(() => {
    const searchResults = gamesData?.games ?? [];
    if (
      requestedGame?.ownership_status === "UNCLAIMED" &&
      !searchResults.some((game) => game.id === requestedGame.id)
    ) {
      return [requestedGame, ...searchResults];
    }
    return searchResults;
  }, [gamesData, requestedGame]);
  const selectedStudio = studios.find((studio) => studio.id === studioId);
  const latestStudioClaim = claimData?.claims[0] ?? null;
  const selectedStudioClaim =
    latestStudioClaim?.status === "PENDING" ||
    latestStudioClaim?.status === "APPROVED"
      ? latestStudioClaim
      : null;
  const currentTerms = claimData?.current_terms;

  function selectGame(game: GameApi) {
    setSelectedGame(game);
    setAcceptedRightsTerms(false);
    setCreatedClaim(null);
    setFormError(null);
  }

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    const normalizedQuery = query.trim();
    setSelectedGame(null);
    setCreatedClaim(null);
    setSubmittedQuery(normalizedQuery);
  }

  async function submitClaim(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedGame || !studioId || !acceptedRightsTerms || !currentTerms) {
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    try {
      const response = await fetch(
        `/api/v1/games/${selectedGame.slug}/ownership-claims`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            studio_id: studioId,
            accepted_rights_terms: true,
            terms_locale: locale,
            terms_version: currentTerms.version,
            terms_digest: currentTerms.digest,
          }),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setAcceptedRightsTerms(false);
        setFormError(
          translateError(body?.message, "Failed to submit ownership claim."),
        );
        if (claimKey) await mutate(claimKey);
        return;
      }

      setCreatedClaim(body.claim ?? body);
      setAcceptedRightsTerms(false);
      if (claimKey) await mutate(claimKey);
    } catch {
      setFormError(
        translateError(undefined, "Failed to submit ownership claim."),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <Head>
        <title>{t("Game ownership claims | Manifold")}</title>
      </Head>

      <div className="min-h-[calc(100vh-4rem)] bg-[#0b0812] px-4 py-10 text-white sm:px-6 lg:px-10 lg:py-14">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
          <header className="max-w-3xl">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300">
              <BadgeCheck size={23} />
            </div>
            <h1 className="text-3xl font-black">
              {t("Claim a game for your Studio")}
            </h1>
            <p className="mt-2 text-sm font-bold leading-relaxed text-white/50">
              {t(
                "Find an unclaimed catalog game, choose the Studio you represent, and submit a rights declaration for administrator review.",
              )}
            </p>
          </header>

          {isLoadingStudios ? (
            <Loader2 className="animate-spin text-white/30" />
          ) : studios.length === 0 ? (
            <section className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-5">
              <h2 className="font-black text-amber-100">
                {t("You need a Studio before claiming a game.")}
              </h2>
              <Link
                href="/onboarding/create"
                className="mt-3 inline-flex rounded-xl bg-white px-4 py-2 text-xs font-black uppercase tracking-wider text-black"
              >
                {t("Create Studio")}
              </Link>
            </section>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.9fr)]">
              <section className="flex flex-col gap-4 rounded-xl border border-white/[0.08] bg-[#14101c] p-5 sm:p-6">
                <div>
                  <h2 className="text-xl font-black">
                    {t("1. Find the game")}
                  </h2>
                  <p className="mt-1 text-sm font-bold text-white/45">
                    {t(
                      "Only games that have not been claimed can be selected.",
                    )}
                  </p>
                </div>

                <form onSubmit={submitSearch} className="flex gap-2">
                  <label className="relative flex-1">
                    <span className="sr-only">{t("Search games")}</span>
                    <Search
                      size={17}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30"
                    />
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder={t("Search by game title...")}
                      className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-10 pr-4 text-sm font-bold outline-none placeholder:text-white/30 focus:border-violet-400/40 focus:bg-white/[0.08]"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={!query.trim()}
                    className="rounded-xl bg-white px-4 py-3 text-sm font-black text-black disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {t("Find")}
                  </button>
                </form>

                <div className="flex min-h-52 flex-col gap-2">
                  {isLoadingGames ? (
                    <div className="flex flex-1 items-center justify-center">
                      <Loader2 className="animate-spin text-white/30" />
                    </div>
                  ) : gamesError ? (
                    <p className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm font-bold text-rose-200">
                      {t("Failed to search games.")}
                    </p>
                  ) : !submittedQuery && !requestedGame ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-white/30">
                      <Search size={28} />
                      <p className="text-sm font-bold">
                        {t("Search the catalog to begin.")}
                      </p>
                    </div>
                  ) : unclaimedGames.length === 0 ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-white/35">
                      <Gamepad2 size={30} />
                      <p className="text-sm font-bold">
                        {t("No unclaimed games found for this search.")}
                      </p>
                    </div>
                  ) : (
                    unclaimedGames.map((game) => (
                      <button
                        key={game.id}
                        type="button"
                        onClick={() => selectGame(game)}
                        className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                          selectedGame?.id === game.id
                            ? "border-violet-400/50 bg-violet-500/10"
                            : "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]"
                        }`}
                      >
                        <div
                          className="h-14 w-24 shrink-0 rounded-lg bg-white/5 bg-cover bg-center"
                          style={
                            game.media.banner
                              ? { backgroundImage: `url(${game.media.banner})` }
                              : undefined
                          }
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-black">{game.title}</p>
                          <p className="truncate text-xs font-bold text-white/40">
                            {game.developer_name}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-md bg-violet-500/15 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-violet-200">
                          {t("Unclaimed")}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </section>

              <section className="flex flex-col gap-5 rounded-xl border border-white/[0.08] bg-[#14101c] p-5 sm:p-6">
                <div>
                  <h2 className="text-xl font-black">
                    {t("2. Declare your rights")}
                  </h2>
                  <p className="mt-1 text-sm font-bold text-white/45">
                    {t("Your confirmation is stored with this request.")}
                  </p>
                </div>

                {!selectedGame ? (
                  <div className="flex min-h-72 flex-col items-center justify-center gap-2 text-center text-white/30">
                    <ShieldAlert size={30} />
                    <p className="max-w-xs text-sm font-bold">
                      {t("Select an unclaimed game to review the declaration.")}
                    </p>
                  </div>
                ) : studioId && isLoadingClaims ? (
                  <div className="flex min-h-72 items-center justify-center">
                    <Loader2 className="animate-spin text-white/30" />
                  </div>
                ) : studioId && claimsError ? (
                  <div className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm font-bold text-rose-200">
                    {translateError(
                      claimsError.message,
                      "Failed to load ownership claims.",
                    )}
                  </div>
                ) : createdClaim || selectedStudioClaim ? (
                  <ClaimStatusCard
                    claim={createdClaim ?? selectedStudioClaim!}
                    locale={locale}
                    t={t}
                  />
                ) : (
                  <form onSubmit={submitClaim} className="flex flex-col gap-5">
                    <label className="flex flex-col gap-2">
                      <span className="text-xs font-black uppercase tracking-wider text-white/40">
                        {t("Studio requesting ownership")}
                      </span>
                      <select
                        value={studioId}
                        onChange={(event) => {
                          setStudioId(event.target.value);
                          setAcceptedRightsTerms(false);
                          setFormError(null);
                        }}
                        className="rounded-xl border border-white/10 bg-[#1b1624] px-4 py-3 text-sm font-bold text-white outline-none focus:border-violet-400/40"
                      >
                        <option value="">{t("Select a Studio...")}</option>
                        {studios.map((studio) => (
                          <option key={studio.id} value={studio.id}>
                            {studio.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.07] p-4">
                      <p className="text-xs font-black uppercase tracking-wider text-amber-200/70">
                        {t("Rights declaration")}
                      </p>
                      {selectedStudio && currentTerms ? (
                        <>
                          <p className="mt-2 text-sm font-bold leading-relaxed text-amber-50/90">
                            {currentTerms.text}
                          </p>
                          <p className="mt-3 text-[10px] font-black uppercase tracking-wider text-amber-100/35">
                            {t("Version {version}", {
                              version: currentTerms.version,
                            })}
                          </p>
                        </>
                      ) : selectedStudio ? (
                        <div className="mt-3 flex items-center gap-2 text-sm font-bold text-amber-100/60">
                          <Loader2 size={14} className="animate-spin" />
                          {t("Loading declaration...")}
                        </div>
                      ) : (
                        <p className="mt-2 text-sm font-bold leading-relaxed text-amber-50/90">
                          {t(
                            "Select a Studio to load the declaration for this specific game.",
                          )}
                        </p>
                      )}
                    </div>

                    <label
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
                        acceptedRightsTerms
                          ? "border-violet-400/40 bg-violet-500/10"
                          : "border-white/10 bg-white/[0.03]"
                      } ${!selectedStudio ? "cursor-not-allowed opacity-50" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={acceptedRightsTerms}
                        disabled={!selectedStudio || !currentTerms}
                        onChange={(event) =>
                          setAcceptedRightsTerms(event.target.checked)
                        }
                        className="mt-0.5 h-4 w-4 shrink-0 accent-violet-500"
                      />
                      <span className="text-sm font-bold leading-relaxed text-white/75">
                        {t(
                          "I have read this declaration, confirm it is true, and understand that Manifold will store my acceptance for review.",
                        )}
                      </span>
                    </label>

                    {formError && (
                      <p className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-sm font-bold text-rose-200">
                        {formError}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={
                        isSubmitting ||
                        !studioId ||
                        !acceptedRightsTerms ||
                        !selectedGame ||
                        !currentTerms
                      }
                      className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-3 text-sm font-black uppercase tracking-wider text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {isSubmitting && (
                        <Loader2 size={15} className="animate-spin" />
                      )}
                      {isSubmitting
                        ? t("Submitting...")
                        : t("Submit ownership claim")}
                    </button>

                    {latestStudioClaim?.status === "REJECTED" && (
                      <div className="rounded-xl border border-rose-400/20 bg-rose-400/[0.07] p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs font-black uppercase tracking-wider text-rose-200/70">
                            {t("Previous request rejected")}
                          </p>
                          <StatusBadge status="REJECTED" t={t} />
                        </div>
                        {latestStudioClaim.decision.reason && (
                          <p className="mt-2 text-sm font-bold text-rose-100/80">
                            {latestStudioClaim.decision.reason}
                          </p>
                        )}
                        <p className="mt-2 text-xs font-bold text-white/35">
                          {t(
                            "You may submit a new request after reviewing the administrator note.",
                          )}
                        </p>
                      </div>
                    )}
                  </form>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

StudioOwnershipClaimsPage.getLayout = function getLayout(
  page: React.ReactElement,
) {
  return <CreatorWorkspaceLayout>{page}</CreatorWorkspaceLayout>;
};

function StatusBadge({
  status,
  t,
}: {
  status: OwnershipClaimStatus;
  t: (message: string, values?: Record<string, string | number>) => string;
}) {
  const Icon =
    status === "APPROVED"
      ? CheckCircle2
      : status === "REJECTED"
        ? XCircle
        : Clock3;

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-black uppercase tracking-wider ${STATUS_STYLES[status]}`}
    >
      <Icon size={12} /> {t(status)}
    </span>
  );
}

function ClaimStatusCard({
  claim,
  locale,
  t,
}: {
  claim: OwnershipClaimApi;
  locale: string;
  t: (message: string, values?: Record<string, string | number>) => string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <StatusBadge status={claim.status} t={t} />
        <Link
          href={`/item/${claim.game.slug}`}
          className="flex items-center gap-1 text-xs font-bold text-white/45 hover:text-white"
        >
          {t("View game")} <ExternalLink size={12} />
        </Link>
      </div>
      <div>
        <p className="text-lg font-black">{claim.game.title}</p>
        <p className="text-sm font-bold text-white/50">{claim.studio.name}</p>
      </div>
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
        <p className="text-xs font-black uppercase tracking-wider text-white/35">
          {t("Accepted declaration · version {version}", {
            version: claim.terms.version,
          })}
        </p>
        <p className="mt-2 text-sm font-bold leading-relaxed text-white/70">
          {claim.terms.text}
        </p>
        <p className="mt-3 text-xs font-bold text-white/35">
          {t("Accepted by {username} on {date}", {
            username: claim.requested_by.username,
            date: new Date(claim.terms.accepted_at).toLocaleString(locale),
          })}
        </p>
      </div>
      {claim.decision.reason && (
        <div className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-4">
          <p className="text-xs font-black uppercase tracking-wider text-rose-200/70">
            {t("Administrator note")}
          </p>
          <p className="mt-1 text-sm font-bold text-rose-100">
            {claim.decision.reason}
          </p>
        </div>
      )}
    </div>
  );
}
