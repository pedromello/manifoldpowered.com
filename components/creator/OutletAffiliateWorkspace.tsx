import { useEffect, useState, type FormEvent } from "react";
import useSWR, { useSWRConfig } from "swr";
import { ExternalLink, Link2, Pencil, Trash2 } from "lucide-react";
import {
  AFFILIATE_MERCHANTS,
  AFFILIATE_MERCHANT_LABELS,
  AFFILIATE_PLATFORMS,
  AFFILIATE_PLATFORM_LABELS,
  affiliateLinkInputSchema,
  type AffiliateKind,
  type AffiliateLink,
  type AffiliateLinkInput,
} from "contracts/outlet-affiliates";
import { GameAutocomplete } from "components/store/GameAutocomplete";
import { useI18n } from "lib/i18n";
import { revalidateOutletDraftCaches } from "lib/outlet-draft-cache";
import {
  fetchOutletPublication,
  updateOutletPublication,
} from "lib/creator-outlet-client";
import {
  affiliateEndpoint,
  fetchAffiliateDraft,
  saveAffiliateLink,
  deleteAffiliateLink,
} from "lib/outlet-affiliate-client";

const kinds: [AffiliateKind, string][] = [
  ["storefront", "General"],
  ["gift_card", "Gift cards"],
  ["game", "By game"],
];
const control =
  "w-full rounded-xl border border-white/15 bg-[#17121f] px-3 py-3 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-violet-400";
const button =
  "rounded-lg border border-white/15 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400 disabled:opacity-40 disabled:cursor-not-allowed";

function emptyLink(kind: AffiliateKind): AffiliateLinkInput {
  return {
    kind,
    merchant: "amazon",
    platform: kind === "storefront" ? null : "steam",
    media_type: kind === "game" ? "digital" : null,
    country: "BR",
    game_slug: null,
    url: "",
    label: null,
  };
}

export type AffiliateEditState = { dirty: boolean; pending: boolean };

export function OutletAffiliateWorkspace({
  storeSlug,
  canPublish,
  onEditStateChange,
}: {
  storeSlug: string;
  canPublish: boolean;
  onEditStateChange?: (state: AffiliateEditState) => void;
}) {
  const { t, translateError } = useI18n();
  const { mutate: mutateGlobal } = useSWRConfig();
  const { data, error, isLoading, mutate } = useSWR(
    `${affiliateEndpoint(storeSlug)}?draft=1`,
    () => fetchAffiliateDraft(storeSlug),
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );
  const { data: publication, mutate: mutatePublication } = useSWR(
    `/api/v1/stores/${storeSlug}/publication`,
    () => fetchOutletPublication(storeSlug),
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );
  const [kind, setKind] = useState<AffiliateKind>("storefront");
  const [draft, setDraft] = useState<AffiliateLinkInput>(() =>
    emptyLink("storefront"),
  );
  const [gameTitle, setGameTitle] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    onEditStateChange?.({ dirty, pending });
  }, [dirty, pending, onEditStateChange]);
  useEffect(
    () => () => onEditStateChange?.({ dirty: false, pending: false }),
    [onEditStateChange],
  );
  useEffect(() => {
    if (!dirty && !pending) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [dirty, pending]);

  function reset(nextKind = kind) {
    setKind(nextKind);
    setDraft(emptyLink(nextKind));
    setGameTitle("");
    setDirty(false);
    setRemoving(null);
  }
  function update(changes: Partial<AffiliateLinkInput>) {
    setDraft((value) => ({ ...value, ...changes }));
    setDirty(true);
    setMessage(null);
  }
  function edit(link: AffiliateLink) {
    setKind(link.kind);
    setDraft({
      id: link.id,
      kind: link.kind,
      merchant: link.merchant,
      platform: link.platform,
      media_type: link.media_type,
      country: link.country,
      game_slug: link.game_slug,
      url: link.url,
      label: link.label,
    });
    setGameTitle(link.game_title || link.game_slug || "");
    setDirty(false);
    setFailure(null);
    setRemoving(null);
  }
  async function refresh() {
    await mutate();
    await revalidateOutletDraftCaches(mutateGlobal, storeSlug);
    await mutatePublication();
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!data || pending) return;
    const parsed = affiliateLinkInputSchema.safeParse(draft);
    if (!parsed.success) {
      setFailure(
        t(
          "Choose the game, platform and a valid affiliate URL for the selected store.",
        ),
      );
      return;
    }
    setPending(true);
    setFailure(null);
    setMessage(null);
    try {
      await saveAffiliateLink(storeSlug, parsed.data, data.draft_revision);
      reset();
      await refresh();
      setMessage(
        t(
          "Affiliate link saved to the draft. Publish to update the public Outlet.",
        ),
      );
    } catch (reason) {
      setFailure(
        translateError(
          reason instanceof Error ? reason.message : null,
          "Could not save the affiliate link.",
        ),
      );
    } finally {
      setPending(false);
    }
  }
  async function remove(id: string) {
    if (!data || pending) return;
    setPending(true);
    setFailure(null);
    setMessage(null);
    try {
      await deleteAffiliateLink(storeSlug, id, data.draft_revision);
      if (draft.id === id) reset();
      setRemoving(null);
      await refresh();
      setMessage(
        t("Link removed from the draft. Publish to update the public Outlet."),
      );
    } catch (reason) {
      setFailure(
        translateError(
          reason instanceof Error ? reason.message : null,
          "Could not remove the affiliate link.",
        ),
      );
    } finally {
      setPending(false);
    }
  }
  async function publish() {
    if (!data || pending || dirty) return;
    setPending(true);
    setFailure(null);
    setMessage(null);
    try {
      await updateOutletPublication(storeSlug, "publish", data.draft_revision);
      await refresh();
      setMessage(t("Outlet changes published."));
    } catch (reason) {
      setFailure(
        translateError(
          reason instanceof Error ? reason.message : null,
          "Could not publish the Outlet.",
        ),
      );
    } finally {
      setPending(false);
    }
  }

  if (isLoading)
    return (
      <p role="status" className="text-white/60">
        {t("Loading affiliate links...")}
      </p>
    );
  if (error || !data)
    return (
      <div role="alert" className="space-y-3">
        <p className="text-rose-300">{t("Could not load affiliate links.")}</p>
        <button className={button} onClick={() => void mutate()}>
          {t("Try again")}
        </button>
      </div>
    );
  const links = data.links.filter((link) => link.kind === kind);
  const hasUnpublishedChanges =
    publication?.publishedRevision?.sourceDraftRevision !== data.draft_revision;

  return (
    <section
      className="space-y-6"
      aria-labelledby="affiliate-workspace-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="affiliate-workspace-heading" className="text-2xl font-black">
            {t("Affiliate links")}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">
            {t(
              "Add links from your affiliate programs. Your audience sees the last published version.",
            )}
          </p>
        </div>
        {canPublish && (
          <button
            className={`${button} bg-violet-600 hover:bg-violet-500`}
            onClick={() => void publish()}
            disabled={
              pending || dirty || !publication?.ready || !hasUnpublishedChanges
            }
          >
            {t("Publish changes")}
          </button>
        )}
      </div>
      <p className="rounded-xl border border-violet-300/20 bg-violet-400/5 p-4 text-sm leading-6 text-violet-100/85">
        {t(
          "For each store and platform, a game link takes priority. Otherwise, a compatible gift card is shown.",
        )}
      </p>
      {dirty && (
        <p className="text-sm text-amber-200" role="status">
          {t(
            "Save or cancel your changes before switching sections or publishing.",
          )}
        </p>
      )}
      {failure && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-400/25 p-4 text-sm text-rose-200"
        >
          <span>{failure}</span>
          <button className={button} onClick={() => void refresh()}>
            {t("Reload draft")}
          </button>
        </div>
      )}
      {message && (
        <p
          role="status"
          className="rounded-xl border border-emerald-400/20 p-4 text-sm text-emerald-200"
        >
          {message}
        </p>
      )}
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label={t("Affiliate link type")}
      >
        {kinds.map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={kind === value}
            disabled={pending || dirty}
            onClick={() => {
              reset(value);
              setFailure(null);
              setMessage(null);
            }}
            className={`${button} ${kind === value ? "border-violet-400/60 bg-violet-500/20 text-violet-100" : ""}`}
          >
            {t(label)}
          </button>
        ))}
      </div>
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <form
          onSubmit={(event) => void submit(event)}
          className="min-w-0 space-y-4 rounded-2xl border border-white/10 bg-white/[0.025] p-5"
        >
          <h3 className="flex items-center gap-2 text-lg font-bold">
            <Link2 size={18} aria-hidden="true" />
            {t(draft.id ? "Edit affiliate link" : "Add affiliate link")}
          </h3>
          <label className="block space-y-2 text-sm font-semibold">
            <span>{t("Store")}</span>
            <select
              className={control}
              value={draft.merchant}
              disabled={pending}
              onChange={(e) =>
                update({
                  merchant: e.target.value as AffiliateLinkInput["merchant"],
                })
              }
            >
              {AFFILIATE_MERCHANTS.map((merchant) => (
                <option key={merchant} value={merchant}>
                  {AFFILIATE_MERCHANT_LABELS[merchant]}
                </option>
              ))}
            </select>
          </label>
          {kind !== "storefront" && (
            <label className="block space-y-2 text-sm font-semibold">
              <span>{t("Platform")}</span>
              <select
                className={control}
                value={draft.platform ?? ""}
                disabled={pending}
                onChange={(e) =>
                  update({
                    platform: e.target.value as AffiliateLinkInput["platform"],
                  })
                }
              >
                {AFFILIATE_PLATFORMS.map((platform) => (
                  <option key={platform} value={platform}>
                    {AFFILIATE_PLATFORM_LABELS[platform]}
                  </option>
                ))}
              </select>
            </label>
          )}
          {kind === "game" && (
            <>
              <div className="space-y-2">
                <p className="text-sm font-semibold">{t("Game")}</p>
                <GameAutocomplete
                  placeholder="Search games..."
                  onSelect={(game) => {
                    update({ game_slug: game.slug });
                    setGameTitle(game.title);
                  }}
                />
                {draft.game_slug && (
                  <p className="rounded-lg bg-violet-500/10 px-3 py-2 text-sm text-violet-200">
                    {gameTitle}
                  </p>
                )}
              </div>
              <label className="block space-y-2 text-sm font-semibold">
                <span>{t("Media type")}</span>
                <select
                  className={control}
                  disabled={pending}
                  value={draft.media_type ?? "digital"}
                  onChange={(e) =>
                    update({
                      media_type: e.target.value as "physical" | "digital",
                    })
                  }
                >
                  <option value="digital">{t("Digital game")}</option>
                  <option value="physical">{t("Physical game")}</option>
                </select>
              </label>
            </>
          )}
          <p className="text-xs text-white/55">
            {t("Region: Brazil. Gift cards must be redeemable in Brazil.")}
          </p>
          <label className="block space-y-2 text-sm font-semibold">
            <span>{t("Affiliate URL")}</span>
            <input
              className={control}
              required
              type="url"
              maxLength={4096}
              placeholder="https://…"
              value={draft.url}
              disabled={pending}
              onChange={(e) => update({ url: e.target.value })}
            />
          </label>
          <label className="block space-y-2 text-sm font-semibold">
            <span>{t("Label (optional)")}</span>
            <input
              className={control}
              maxLength={120}
              value={draft.label ?? ""}
              disabled={pending}
              onChange={(e) => update({ label: e.target.value || null })}
            />
          </label>
          <p className="text-xs leading-5 text-white/50">
            {t(
              "Paste the link generated by your affiliate program. Manifold preserves your affiliate parameters. Commission eligibility is determined by the store.",
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={pending || !dirty}
              className={`${button} bg-violet-600 hover:bg-violet-500`}
            >
              {t(pending ? "Saving..." : "Save draft")}
            </button>
            <button
              type="button"
              disabled={pending}
              className={button}
              onClick={() => reset()}
            >
              {t("Cancel")}
            </button>
          </div>
        </form>
        <div className="min-w-0 space-y-3">
          <h3 className="font-bold">{t("Saved links")}</h3>
          {links.length === 0 && (
            <p className="rounded-xl border border-dashed border-white/15 p-6 text-sm leading-6 text-white/55">
              {t(
                "No links in this section yet. Add your first affiliate link.",
              )}
            </p>
          )}
          {links.map((link) => (
            <article
              key={link.id}
              className="min-w-0 space-y-3 rounded-xl border border-white/10 bg-white/[0.025] p-4"
            >
              <div>
                <p className="font-bold">
                  {AFFILIATE_MERCHANT_LABELS[link.merchant]}
                </p>
                {link.game_slug && (
                  <p className="mt-1 text-sm text-white/85">
                    {link.game_title || link.game_slug}
                  </p>
                )}
                <p className="mt-1 text-xs text-white/60">
                  {[
                    link.platform && AFFILIATE_PLATFORM_LABELS[link.platform],
                    link.media_type &&
                      t(
                        link.media_type === "physical"
                          ? "Physical game"
                          : "Digital game",
                      ),
                    t("Brazil"),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {link.label && (
                  <p className="mt-1 text-sm text-white/60">{link.label}</p>
                )}
              </div>
              <a
                href={link.url}
                target="_blank"
                rel="sponsored noopener noreferrer"
                className="flex min-w-0 items-center gap-2 text-sm text-violet-200 underline decoration-violet-200/30 underline-offset-4"
              >
                <span className="truncate">{link.url}</span>
                <ExternalLink
                  size={14}
                  className="shrink-0"
                  aria-hidden="true"
                />
                <span className="sr-only">{t("Opens in a new tab")}</span>
              </a>
              {removing === link.id ? (
                <div className="space-y-2">
                  <p className="text-sm text-amber-100">
                    {t("Remove this link from the draft?")}
                  </p>
                  <div className="flex gap-2">
                    <button
                      className={`${button} text-rose-200`}
                      disabled={pending}
                      onClick={() => void remove(link.id)}
                    >
                      {t("Remove link")}
                    </button>
                    <button
                      className={button}
                      disabled={pending}
                      onClick={() => setRemoving(null)}
                    >
                      {t("Cancel")}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    className={button}
                    disabled={pending || dirty}
                    onClick={() => edit(link)}
                  >
                    <Pencil
                      className="mr-2 inline"
                      size={14}
                      aria-hidden="true"
                    />
                    {t("Edit")}
                  </button>
                  <button
                    className={button}
                    disabled={pending || dirty}
                    onClick={() => setRemoving(link.id)}
                  >
                    <Trash2
                      className="mr-2 inline"
                      size={14}
                      aria-hidden="true"
                    />
                    {t("Remove")}
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
