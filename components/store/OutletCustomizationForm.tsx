import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ExternalLink,
  Globe,
  Monitor,
  Save,
  Smartphone,
} from "lucide-react";
import Link from "next/link";
import { useSWRConfig } from "swr";

import type {
  OutletBrandTokens,
  OutletLayoutPreset,
  OutletSocialLinks,
  StoreManagementApi,
} from "components/store/types";
import { useI18n } from "lib/i18n";
import { isBespokeThemeKey } from "storefronts/bespoke";

const PRESET_OPTIONS: Array<{
  value: OutletLayoutPreset;
  label: string;
  description: string;
}> = [
  {
    value: "channel",
    label: "Channel / Streamer",
    description:
      "A cover-led introduction, a primary recommendation, and a visual game grid.",
  },
  {
    value: "editorial",
    label: "Editorial / Curation",
    description:
      "A magazine masthead, a lead recommendation, and story-like catalog rows.",
  },
  {
    value: "community",
    label: "Community / Club",
    description:
      "A member-first welcome, club picks, and a denser shelf for group discovery.",
  },
];

const PALETTE_OPTIONS: Array<{
  value: OutletBrandTokens["palette"];
  label: string;
  swatches: [string, string, string];
}> = [
  {
    value: "manifold",
    label: "Manifold Violet",
    swatches: ["#0b0812", "#c4b5fd", "#ffffff"],
  },
  {
    value: "ember",
    label: "Warm Ember",
    swatches: ["#100b09", "#fb923c", "#fffdfc"],
  },
  {
    value: "ocean",
    label: "Deep Ocean",
    swatches: ["#071014", "#22d3ee", "#f7fcfd"],
  },
];

const TYPOGRAPHY_OPTIONS: Array<{
  value: OutletBrandTokens["typography"];
  label: string;
}> = [
  { value: "modern", label: "Modern" },
  { value: "editorial", label: "Editorial" },
  { value: "rounded", label: "Friendly" },
];

const SHAPE_OPTIONS: Array<{
  value: OutletBrandTokens["shape"];
  label: string;
}> = [
  { value: "soft", label: "Soft" },
  { value: "crisp", label: "Crisp" },
  { value: "pill", label: "Rounded" },
];

const SOCIAL_FIELDS: Array<{
  key: keyof OutletSocialLinks;
  label: string;
  placeholder: string;
}> = [
  { key: "website", label: "Website", placeholder: "https://your-site.com" },
  {
    key: "youtube",
    label: "YouTube",
    placeholder: "https://youtube.com/@your-channel",
  },
  {
    key: "twitch",
    label: "Twitch",
    placeholder: "https://twitch.tv/your-channel",
  },
  {
    key: "instagram",
    label: "Instagram",
    placeholder: "https://instagram.com/your-profile",
  },
  { key: "tiktok", label: "TikTok", placeholder: "https://tiktok.com/@you" },
  { key: "x", label: "X", placeholder: "https://x.com/your-profile" },
];

const FIELD_CONTROL_CLASS =
  "w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white outline-none placeholder:text-white/25 focus:border-violet-300/65 focus:ring-2 focus:ring-violet-500/15";

function handleRadioArrow(event: React.KeyboardEvent<HTMLButtonElement>) {
  const supportedKeys = [
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
    "Home",
    "End",
  ];
  if (!supportedKeys.includes(event.key)) return;

  const group = event.currentTarget.closest('[role="radiogroup"]');
  const radios = group
    ? Array.from(
        group.querySelectorAll<HTMLButtonElement>(
          'button[role="radio"]:not(:disabled)',
        ),
      )
    : [];
  if (radios.length === 0) return;

  event.preventDefault();
  const currentIndex = radios.indexOf(event.currentTarget);
  const nextIndex =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? radios.length - 1
        : (currentIndex +
            (event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1) +
            radios.length) %
          radios.length;

  radios[nextIndex].focus();
  radios[nextIndex].click();
}

function PresetDiagram({ preset }: { preset: OutletLayoutPreset }) {
  if (preset === "editorial") {
    return (
      <div aria-hidden="true" className="grid h-16 grid-cols-5 gap-1.5">
        <div className="col-span-3 bg-white/20" />
        <div className="col-span-2 flex flex-col gap-1.5">
          <div className="h-2 bg-white/35" />
          <div className="h-1.5 w-4/5 bg-white/15" />
          <div className="mt-auto h-5 border-t border-white/15" />
        </div>
      </div>
    );
  }

  if (preset === "community") {
    return (
      <div aria-hidden="true" className="flex h-16 flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-full bg-white/25" />
          <div className="h-2 w-1/2 bg-white/25" />
        </div>
        <div className="grid flex-1 grid-cols-3 gap-1.5">
          <div className="rounded-lg bg-white/20" />
          <div className="rounded-lg bg-white/20" />
          <div className="rounded-lg bg-white/20" />
        </div>
      </div>
    );
  }

  return (
    <div aria-hidden="true" className="grid h-16 grid-cols-4 gap-1.5">
      <div className="col-span-3 rounded-lg bg-white/20" />
      <div className="flex flex-col gap-1.5">
        <div className="flex-1 rounded bg-white/15" />
        <div className="flex-1 rounded bg-white/15" />
      </div>
    </div>
  );
}

function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
  disabled = false,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-black/20 p-1"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          onClick={() => onChange(option.value)}
          onKeyDown={handleRadioArrow}
          disabled={disabled}
          aria-checked={value === option.value}
          tabIndex={value === option.value ? 0 : -1}
          className={`min-h-10 rounded-lg px-2 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none ${
            value === option.value
              ? "bg-white text-[#0b0812]"
              : "text-white/50 hover:bg-white/[0.06] hover:text-white"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function OutletCustomizationForm({
  store,
}: {
  store: StoreManagementApi;
}) {
  const { t, translateError } = useI18n();
  const { mutate } = useSWRConfig();
  const [name, setName] = useState(store.name);
  const [tagline, setTagline] = useState(store.tagline ?? "");
  const [description, setDescription] = useState(store.description ?? "");
  const [logoUrl, setLogoUrl] = useState(store.logo_url ?? "");
  const [coverUrl, setCoverUrl] = useState(store.cover_url ?? "");
  const [socialLinks, setSocialLinks] = useState<OutletSocialLinks>(
    store.social_links ?? {},
  );
  const [layoutPreset, setLayoutPreset] = useState<OutletLayoutPreset>(
    store.layout_preset ?? "channel",
  );
  const [hasSelectedPreset, setHasSelectedPreset] = useState(
    store.layout_preset !== null,
  );
  const [brandTokens, setBrandTokens] = useState<OutletBrandTokens>(
    store.brand_tokens ?? {
      palette: "manifold",
      typography: "modern",
      shape: "soft",
    },
  );
  const [previewViewport, setPreviewViewport] = useState<"desktop" | "mobile">(
    "desktop",
  );
  const [previewRevision, setPreviewRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [draftRevision, setDraftRevision] = useState(store.draft_revision);
  const [publicationStatus, setPublicationStatus] = useState(
    store.publication_status,
  );
  const [hasUnpublishedChanges, setHasUnpublishedChanges] = useState(
    store.has_unpublished_changes,
  );
  const [publicationReadiness, setPublicationReadiness] = useState(
    store.publication_readiness,
  );

  useEffect(() => {
    setName(store.name);
    setTagline(store.tagline ?? "");
    setDescription(store.description ?? "");
    setLogoUrl(store.logo_url ?? "");
    setCoverUrl(store.cover_url ?? "");
    setSocialLinks(store.social_links ?? {});
    setLayoutPreset(store.layout_preset ?? "channel");
    setHasSelectedPreset(store.layout_preset !== null);
    setBrandTokens(
      store.brand_tokens ?? {
        palette: "manifold",
        typography: "modern",
        shape: "soft",
      },
    );
    setDraftRevision(store.draft_revision);
    setPublicationStatus(store.publication_status);
    setHasUnpublishedChanges(store.has_unpublished_changes);
    setPublicationReadiness(store.publication_readiness);
    setPreviewRevision((current) => current + 1);
  }, [store]);

  const cleanedSocialLinks = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(socialLinks)
          .map(([key, value]) => [key, value?.trim()])
          .filter((entry): entry is [string, string] => Boolean(entry[1])),
      ) as OutletSocialLinks,
    [socialLinks],
  );

  const draftPayload = useMemo(
    () => ({
      name: name.trim(),
      tagline: tagline.trim() || null,
      description: description.trim() || null,
      logo_url: logoUrl.trim() || null,
      cover_url: coverUrl.trim() || null,
      social_links: cleanedSocialLinks,
      ...(hasSelectedPreset ? { layout_preset: layoutPreset } : {}),
      brand_tokens: brandTokens,
    }),
    [
      brandTokens,
      cleanedSocialLinks,
      coverUrl,
      description,
      hasSelectedPreset,
      layoutPreset,
      logoUrl,
      name,
      tagline,
    ],
  );

  const savedPayload = useMemo(
    () => ({
      name: store.name.trim(),
      tagline: store.tagline?.trim() || null,
      description: store.description?.trim() || null,
      logo_url: store.logo_url?.trim() || null,
      cover_url: store.cover_url?.trim() || null,
      social_links: store.social_links ?? {},
      layout_preset: store.layout_preset,
      brand_tokens: store.brand_tokens,
    }),
    [store],
  );

  const currentComparablePayload = {
    name: draftPayload.name,
    tagline: draftPayload.tagline,
    description: draftPayload.description,
    logo_url: draftPayload.logo_url,
    cover_url: draftPayload.cover_url,
    social_links: draftPayload.social_links,
    layout_preset: hasSelectedPreset ? layoutPreset : null,
    brand_tokens: draftPayload.brand_tokens,
  };
  const isDirty =
    JSON.stringify(currentComparablePayload) !== JSON.stringify(savedPayload);
  const managementKey = `/api/v1/stores/${store.slug}?preview=1`;

  function applyManagementResponse(body: StoreManagementApi) {
    setDraftRevision(body.draft_revision);
    setPublicationStatus(body.publication_status);
    setHasUnpublishedChanges(body.has_unpublished_changes);
    setPublicationReadiness(body.publication_readiness);
    void mutate(managementKey, body, { revalidate: false });
  }

  useEffect(() => {
    if (!isDirty) return;

    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [isDirty]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/v1/stores/${store.slug}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "If-Match": `"${draftRevision}"`,
        },
        body: JSON.stringify(draftPayload),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 409) {
          await mutate(managementKey);
          setError(
            t("This draft changed elsewhere. We reloaded the latest version."),
          );
          return;
        }
        setError(translateError(body?.message, "Failed to update Outlet."));
        return;
      }

      applyManagementResponse(body as StoreManagementApi);
      setSuccess(t("Draft saved. The public Outlet has not changed."));
    } catch {
      setError(t("Could not save these changes. Try again."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePublish() {
    if (isDirty) {
      setError(t("Save the draft before publishing it."));
      return;
    }
    if (!publicationReadiness.ready) {
      setError(t("Complete the publication checklist before publishing."));
      return;
    }

    setError(null);
    setSuccess(null);
    setIsPublishing(true);

    try {
      const response = await fetch(`/api/v1/stores/${store.slug}/publish`, {
        method: "POST",
        headers: { "If-Match": `"${draftRevision}"` },
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 409) {
          await mutate(managementKey);
          setError(
            t("This draft changed elsewhere. We reloaded the latest version."),
          );
          return;
        }
        setError(translateError(body?.message, "Failed to publish Outlet."));
        return;
      }

      applyManagementResponse(body as StoreManagementApi);
      setSuccess(t("Published. Visitors now see this version."));
    } catch {
      setError(t("Could not publish this Outlet. Try again."));
    } finally {
      setIsPublishing(false);
    }
  }

  function handlePreviewTabKey(
    event: React.KeyboardEvent<HTMLButtonElement>,
    currentViewport: "desktop" | "mobile",
  ) {
    const viewports = ["desktop", "mobile"] as const;
    const currentIndex = viewports.indexOf(currentViewport);
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? viewports.length - 1
          : event.key === "ArrowRight" || event.key === "ArrowDown"
            ? (currentIndex + 1) % viewports.length
            : event.key === "ArrowLeft" || event.key === "ArrowUp"
              ? (currentIndex - 1 + viewports.length) % viewports.length
              : null;
    if (nextIndex === null) return;

    event.preventDefault();
    const nextViewport = viewports[nextIndex];
    setPreviewViewport(nextViewport);
    document.getElementById(`preview-${nextViewport}-tab`)?.focus();
  }

  const bespoke = isBespokeThemeKey(store.theme_key);
  const pendingPublication = hasUnpublishedChanges || isDirty;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-10">
      <div
        aria-live="polite"
        className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"
      >
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
              publicationStatus === "PUBLISHED"
                ? "bg-emerald-400/10 text-emerald-300"
                : "bg-amber-300/10 text-amber-200"
            }`}
          >
            <Globe size={17} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-black">
              {publicationStatus === "PUBLISHED"
                ? t("Published Outlet")
                : t("Private draft")}
            </p>
            <p className="mt-0.5 text-xs font-semibold leading-5 text-white/45">
              {publicationStatus !== "PUBLISHED"
                ? t("Only you can see this Outlet until you publish it.")
                : isDirty
                  ? t(
                      "You have unsaved changes. Visitors still see the published version.",
                    )
                  : hasUnpublishedChanges
                    ? t(
                        "Saved draft changes are private until you publish them.",
                      )
                    : t("The public page matches this draft.")}
            </p>
          </div>
        </div>
        <span
          className={`w-fit shrink-0 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${
            pendingPublication
              ? "border-amber-300/20 bg-amber-300/[0.07] text-amber-200"
              : "border-emerald-300/20 bg-emerald-300/[0.07] text-emerald-200"
          }`}
        >
          {pendingPublication ? t("Not live yet") : t("Up to date")}
        </span>
      </div>

      <section
        aria-labelledby="publication-checklist-heading"
        className="rounded-2xl border border-white/10 bg-black/15 p-4 sm:p-5"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-violet-300">
              {t("Publication checklist")}
            </p>
            <h2
              id="publication-checklist-heading"
              className="mt-1 text-lg font-black"
            >
              {publicationReadiness.ready
                ? t("Ready to publish")
                : t("Complete these steps to publish")}
            </h2>
          </div>
          <p className="text-xs font-semibold text-white/40">
            {t(
              "Publishing switches identity, selection, and Featured together.",
            )}
          </p>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <ReadinessItem
            ready={publicationReadiness.checks.identity_complete}
            label={t("Complete identity")}
          />
          <ReadinessItem
            ready={publicationReadiness.checks.strategy_chosen}
            label={t("Selection strategy")}
          />
          <ReadinessItem
            ready={
              publicationReadiness.checks.selected_games >=
              publicationReadiness.checks.minimum_games
            }
            label={t("Selected games")}
            detail={t("{selected} of {minimum}", {
              selected: publicationReadiness.checks.selected_games,
              minimum: publicationReadiness.checks.minimum_games,
            })}
          />
          <ReadinessItem
            ready={publicationReadiness.checks.featured_games >= 1}
            label={t("Featured recommendation")}
            detail={t("{count} selected", {
              count: publicationReadiness.checks.featured_games,
            })}
          />
        </div>
      </section>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,0.8fr)_minmax(540px,1.2fr)]">
        <div className="flex min-w-0 flex-col gap-8">
          <section aria-labelledby="identity-heading">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-violet-300">
              {t("Identity")}
            </p>
            <h2
              id="identity-heading"
              className="mt-2 text-2xl font-black tracking-[-0.02em]"
            >
              {t("Make the Outlet recognizable")}
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-white/45">
              {t(
                "Use hosted image URLs for your logo and cover. Game uploads and downloads stay in Manifold Desktop.",
              )}
            </p>

            <div className="mt-6 grid gap-4">
              <Field label={t("Outlet name")}>
                <input
                  type="text"
                  value={name}
                  maxLength={255}
                  onChange={(event) => setName(event.target.value)}
                  className={FIELD_CONTROL_CLASS}
                />
              </Field>
              <Field label={t("Tagline")} hint={`${tagline.length}/160`}>
                <input
                  type="text"
                  value={tagline}
                  maxLength={160}
                  onChange={(event) => setTagline(event.target.value)}
                  placeholder={t("A short promise to your audience")}
                  className={FIELD_CONTROL_CLASS}
                />
              </Field>
              <Field label={t("About")} hint={`${description.length}/2000`}>
                <textarea
                  value={description}
                  maxLength={2000}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={5}
                  placeholder={t("Tell people what guides your curation.")}
                  className={`${FIELD_CONTROL_CLASS} resize-y`}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("Logo URL")}>
                  <input
                    type="url"
                    pattern="https://.*"
                    title={t("Use an HTTPS URL.")}
                    value={logoUrl}
                    onChange={(event) => setLogoUrl(event.target.value)}
                    placeholder="https://example.com/logo.png"
                    className={FIELD_CONTROL_CLASS}
                  />
                </Field>
                <Field label={t("Cover URL")}>
                  <input
                    type="url"
                    pattern="https://.*"
                    title={t("Use an HTTPS URL.")}
                    value={coverUrl}
                    onChange={(event) => setCoverUrl(event.target.value)}
                    placeholder="https://example.com/cover.jpg"
                    className={FIELD_CONTROL_CLASS}
                  />
                </Field>
              </div>
            </div>
          </section>

          <section aria-labelledby="social-heading">
            <h2 id="social-heading" className="text-lg font-black">
              {t("Social links")}
            </h2>
            <p className="mt-1 text-sm text-white/40">
              {t("Only the links you provide will appear on your Outlet.")}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {SOCIAL_FIELDS.map((field) => (
                <Field key={field.key} label={field.label}>
                  <input
                    type="url"
                    pattern="https://.*"
                    title={t("Use an HTTPS URL.")}
                    value={socialLinks[field.key] ?? ""}
                    onChange={(event) =>
                      setSocialLinks((current) => ({
                        ...current,
                        [field.key]: event.target.value,
                      }))
                    }
                    placeholder={field.placeholder}
                    className={FIELD_CONTROL_CLASS}
                  />
                </Field>
              ))}
            </div>
          </section>

          <fieldset className="min-w-0" disabled={bespoke}>
            <legend className="sr-only">{t("Page layout")}</legend>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-violet-300">
              {t("Layout")}
            </p>
            <h2 id="preset-heading" className="mt-2 text-2xl font-black">
              {t("Choose how your curation reads")}
            </h2>
            {bespoke && (
              <div className="mt-4 rounded-xl border border-amber-300/25 bg-amber-300/[0.07] px-4 py-3 text-sm leading-6 text-amber-100/80">
                {t(
                  "This Outlet has a custom storefront maintained by Manifold. Page layout controls are unavailable here.",
                )}
              </div>
            )}
            {!bespoke && !hasSelectedPreset && (
              <div className="mt-4 rounded-xl border border-sky-300/20 bg-sky-300/[0.06] px-4 py-3 text-sm leading-6 text-sky-100/80">
                {t(
                  "This Outlet keeps its classic layout until you choose and save one of the new layouts.",
                )}
              </div>
            )}
            <div
              role="radiogroup"
              aria-labelledby="preset-heading"
              className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3"
            >
              {PRESET_OPTIONS.map((preset) => {
                const selected =
                  hasSelectedPreset && layoutPreset === preset.value;
                return (
                  <button
                    key={preset.value}
                    type="button"
                    role="radio"
                    onClick={() => {
                      setHasSelectedPreset(true);
                      setLayoutPreset(preset.value);
                    }}
                    onKeyDown={handleRadioArrow}
                    aria-checked={selected}
                    tabIndex={
                      selected ||
                      (!hasSelectedPreset && preset.value === "channel")
                        ? 0
                        : -1
                    }
                    className={`min-w-0 border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none ${
                      selected
                        ? "border-violet-300/60 bg-violet-300/[0.1]"
                        : "border-white/10 bg-white/[0.025] hover:border-white/25"
                    } rounded-xl`}
                  >
                    <PresetDiagram preset={preset.value} />
                    <span className="mt-3 flex items-center justify-between gap-2 text-sm font-black">
                      {t(preset.label)}
                      {selected && (
                        <Check size={15} className="text-violet-300" />
                      )}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-white/40">
                      {t(preset.description)}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="min-w-0" disabled={bespoke}>
            <legend id="brand-heading" className="text-lg font-black">
              {t("Brand style")}
            </legend>
            <p className="mt-1 text-sm leading-6 text-white/40">
              {t(
                "Every combination is predefined, responsive, and checked for readable contrast.",
              )}
            </p>
            <div className="mt-4 grid gap-5">
              <div>
                <p className="mb-2 text-xs font-black uppercase tracking-wider text-white/40">
                  {t("Palette")}
                </p>
                <div
                  role="radiogroup"
                  aria-label={t("Palette")}
                  className="grid gap-2 sm:grid-cols-3"
                >
                  {PALETTE_OPTIONS.map((palette) => (
                    <button
                      key={palette.value}
                      type="button"
                      role="radio"
                      onClick={() => {
                        setHasSelectedPreset(true);
                        setBrandTokens((current) => ({
                          ...current,
                          palette: palette.value,
                        }));
                      }}
                      aria-checked={brandTokens.palette === palette.value}
                      onKeyDown={handleRadioArrow}
                      tabIndex={brandTokens.palette === palette.value ? 0 : -1}
                      className={`flex min-h-12 items-center gap-3 rounded-xl border px-3 text-left text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none ${
                        brandTokens.palette === palette.value
                          ? "border-white/45 bg-white/[0.08] text-white"
                          : "border-white/10 text-white/50 hover:border-white/25"
                      }`}
                    >
                      <span className="flex -space-x-1">
                        {palette.swatches.map((swatch) => (
                          <span
                            key={swatch}
                            className="h-5 w-5 rounded-full border border-white/25"
                            style={{ backgroundColor: swatch }}
                          />
                        ))}
                      </span>
                      {t(palette.label)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-black uppercase tracking-wider text-white/40">
                    {t("Typography")}
                  </p>
                  <SegmentedControl
                    value={brandTokens.typography}
                    options={TYPOGRAPHY_OPTIONS}
                    label={t("Typography")}
                    onChange={(typography) => {
                      setHasSelectedPreset(true);
                      setBrandTokens((current) => ({ ...current, typography }));
                    }}
                  />
                </div>
                <div>
                  <p className="mb-2 text-xs font-black uppercase tracking-wider text-white/40">
                    {t("Shape")}
                  </p>
                  <SegmentedControl
                    value={brandTokens.shape}
                    options={SHAPE_OPTIONS}
                    label={t("Shape")}
                    onChange={(shape) => {
                      setHasSelectedPreset(true);
                      setBrandTokens((current) => ({ ...current, shape }));
                    }}
                  />
                </div>
              </div>
            </div>
          </fieldset>

          {error && (
            <div
              role="alert"
              className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-bold text-rose-300"
            >
              {error}
            </div>
          )}
          {success && (
            <div
              role="status"
              className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-300"
            >
              <Check size={16} /> {success}
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center">
            <button
              type="submit"
              disabled={
                isSubmitting || isPublishing || !name.trim() || !isDirty
              }
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-5 text-sm font-black text-white transition hover:bg-white/[0.1] focus:outline-none focus:ring-2 focus:ring-violet-300 focus:ring-offset-2 focus:ring-offset-[#0b0812] disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
            >
              <Save size={17} />
              {isSubmitting ? t("Saving...") : t("Save draft")}
            </button>
            <button
              type="button"
              onClick={handlePublish}
              disabled={
                isSubmitting ||
                isPublishing ||
                isDirty ||
                !publicationReadiness.ready ||
                (publicationStatus === "PUBLISHED" && !hasUnpublishedChanges)
              }
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-5 text-sm font-black text-white transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-violet-300 focus:ring-offset-2 focus:ring-offset-[#0b0812] disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
            >
              <Globe size={17} />
              {isPublishing
                ? t("Publishing...")
                : publicationStatus === "PUBLISHED"
                  ? t("Publish changes")
                  : t("Publish Outlet")}
            </button>
          </div>
        </div>

        <section
          aria-labelledby="preview-heading"
          className="min-w-0 xl:sticky xl:top-24 xl:self-start"
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-violet-300">
                {t("Faithful preview")}
              </p>
              <h2 id="preview-heading" className="mt-2 text-xl font-black">
                {t("The same public page on desktop and mobile")}
              </h2>
            </div>
            <div
              role="tablist"
              aria-label={t("Preview viewport")}
              aria-orientation="horizontal"
              className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.035] p-1"
            >
              <button
                id="preview-desktop-tab"
                type="button"
                role="tab"
                onClick={() => setPreviewViewport("desktop")}
                onKeyDown={(event) => handlePreviewTabKey(event, "desktop")}
                aria-selected={previewViewport === "desktop"}
                aria-controls="outlet-preview-panel"
                tabIndex={previewViewport === "desktop" ? 0 : -1}
                className={`flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-bold ${
                  previewViewport === "desktop"
                    ? "bg-white text-[#0b0812]"
                    : "text-white/45 hover:text-white"
                }`}
              >
                <Monitor size={15} /> {t("Desktop")}
              </button>
              <button
                id="preview-mobile-tab"
                type="button"
                role="tab"
                onClick={() => setPreviewViewport("mobile")}
                onKeyDown={(event) => handlePreviewTabKey(event, "mobile")}
                aria-selected={previewViewport === "mobile"}
                aria-controls="outlet-preview-panel"
                tabIndex={previewViewport === "mobile" ? 0 : -1}
                className={`flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-bold ${
                  previewViewport === "mobile"
                    ? "bg-white text-[#0b0812]"
                    : "text-white/45 hover:text-white"
                }`}
              >
                <Smartphone size={15} /> {t("Mobile")}
              </button>
            </div>
          </div>

          <p className="mt-2 text-xs leading-5 text-white/35">
            {t(
              "Save to show identity and design changes in the private preview.",
            )}
          </p>

          <div
            id="outlet-preview-panel"
            role="tabpanel"
            aria-labelledby={`preview-${previewViewport}-tab`}
            className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-[#050407] p-2 shadow-2xl shadow-black/40"
          >
            <div className="mb-2 flex items-center justify-between gap-3 rounded-lg bg-white/[0.045] px-3 py-2">
              <span className="truncate text-[11px] font-bold text-white/35">
                manifoldpowered.com/store/{store.slug}
              </span>
              <span className="flex shrink-0 items-center gap-3">
                {publicationStatus === "PUBLISHED" && (
                  <Link
                    href={`/store/${store.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t("{label} (opens in a new tab)", {
                      label: t("View live"),
                    })}
                    className="text-[11px] font-bold text-white/45 hover:text-white"
                  >
                    {t("View live")}
                  </Link>
                )}
                <Link
                  href={`/store/${store.slug}?preview=1`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t("{label} (opens in a new tab)", {
                    label: t("Open preview"),
                  })}
                  className="flex items-center gap-1 text-[11px] font-bold text-violet-300 hover:text-violet-200"
                >
                  {t("Open preview")}
                  <ExternalLink size={12} />
                </Link>
              </span>
            </div>
            <div className="flex min-h-[680px] justify-center overflow-auto bg-black/30 py-2">
              <iframe
                key={previewRevision}
                title={t("Outlet public preview")}
                src={`/store/${store.slug}?preview=1&revision=${previewRevision}`}
                sandbox="allow-forms allow-popups allow-same-origin allow-scripts"
                referrerPolicy="no-referrer"
                className={`h-[660px] shrink-0 border-0 bg-[#0b0812] transition-[width] duration-300 motion-reduce:transition-none ${
                  previewViewport === "mobile" ? "w-[390px]" : "w-[1280px]"
                }`}
              />
            </div>
          </div>
        </section>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-2">
      <span className="flex items-center justify-between gap-3 text-xs font-black uppercase tracking-wider text-white/40">
        {label}
        {hint && <span className="normal-case tracking-normal">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function ReadinessItem({
  ready,
  label,
  detail,
}: {
  ready: boolean;
  label: string;
  detail?: string;
}) {
  const { t } = useI18n();
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border px-3 py-3 ${
        ready
          ? "border-emerald-300/20 bg-emerald-300/[0.06]"
          : "border-white/10 bg-white/[0.025]"
      }`}
    >
      <span
        aria-hidden="true"
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black ${
          ready
            ? "bg-emerald-300 text-[#07120d]"
            : "border border-white/20 text-white/35"
        }`}
      >
        {ready ? "✓" : "·"}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-black text-white/80">
          {label}
          <span className="sr-only">
            {`: ${ready ? t("Complete") : t("Incomplete")}`}
          </span>
        </span>
        {detail && (
          <span className="mt-0.5 block text-[11px] font-semibold text-white/40">
            {detail}
          </span>
        )}
      </span>
    </div>
  );
}
