import { useEffect, useId, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  OUTLET_RATING_SCALES,
  outletRatingSchema,
  type OutletRatingScale,
  type RatingSystemPreview,
} from "contracts/outlet-rating";
import { OutletRatingInput } from "components/store/OutletRatingInput";
import { useI18n } from "lib/i18n";

type AppliedRatingSystem = {
  rating_scale: OutletRatingScale;
  draft_revision: number;
  converted_count: number;
};

const SCALE_LABELS: Record<OutletRatingScale, string> = {
  STARS: "Stars (0–5)",
  NUMERIC_10: "Score (0–10)",
  TIER: "Tiers (F–S+)",
};

async function ratingSystemRequest<T>(
  url: string,
  method: "POST" | "PUT",
  input: object,
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(input),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 409) {
      throw new Error(
        "This draft changed. Reload the latest draft and calculate the conversion again.",
      );
    }
    throw new Error(
      body &&
        typeof body === "object" &&
        "message" in body &&
        typeof body.message === "string"
        ? body.message
        : "The rating system could not be updated.",
    );
  }
  return body as T;
}

export function OutletRatingSystemSettings({
  slug,
  scale,
  draftRevision,
  disabled = false,
  onApplied,
  onReload,
}: {
  slug: string;
  scale: OutletRatingScale | null;
  draftRevision: number;
  disabled?: boolean;
  onApplied: (result: AppliedRatingSystem) => Promise<void>;
  onReload: () => Promise<void>;
}) {
  const { t, translateError, locale } = useI18n();
  const id = useId();
  const [target, setTarget] = useState<OutletRatingScale>(scale ?? "STARS");
  const [preview, setPreview] = useState<RatingSystemPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setPreview(null);
  }, [draftRevision, scale]);

  async function calculatePreview() {
    setBusy(true);
    setError(null);
    setSuccess(false);
    try {
      const result = await ratingSystemRequest<RatingSystemPreview>(
        `/api/v1/stores/${slug}/rating-system/preview`,
        "POST",
        {
          target_scale: target,
          expected_draft_revision: draftRevision,
        },
      );
      setPreview(result);
    } catch (failure) {
      setPreview(null);
      setError(
        translateError(
          failure instanceof Error ? failure.message : undefined,
          "The rating system could not be updated.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function applyToDraft() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const result = await ratingSystemRequest<AppliedRatingSystem>(
        `/api/v1/stores/${slug}/rating-system`,
        "PUT",
        {
          target_scale: preview.target_scale,
          expected_draft_revision: preview.draft_revision,
          mapping: preview.mapping.map(({ from, to }) => ({ from, to })),
        },
      );
      await onApplied(result);
      setPreview(null);
      setSuccess(true);
    } catch (failure) {
      setPreview(null);
      setError(
        translateError(
          failure instanceof Error ? failure.message : undefined,
          "The rating system could not be updated.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby={id}
      className="rounded-2xl border border-violet-300/25 bg-violet-300/[0.05] p-5 sm:p-6"
    >
      <h2 id={id} className="text-xl font-black">
        {t("Rating system")}
      </h2>
      <p className="mt-2 text-sm leading-6 text-white/70">
        {t(
          "Choose one scale for this Outlet. Reviews can include text, a rating, or both.",
        )}
      </p>
      <p className="mt-2 text-sm text-white/70">
        {t("Current system: {system}", {
          system: scale ? t(SCALE_LABELS[scale]) : t("Not configured"),
        })}
      </p>
      <label className="mt-5 block text-sm font-bold">
        {t("New rating system")}
        <select
          aria-label={t("New rating system")}
          value={target}
          disabled={disabled || busy}
          onChange={(event) => {
            setTarget(event.target.value as OutletRatingScale);
            setPreview(null);
            setError(null);
            setSuccess(false);
          }}
          className="mt-2 min-h-11 w-full rounded-lg border border-white/20 bg-[#17121f] px-3 py-2 text-white outline-none focus-visible:ring-2 focus-visible:ring-violet-300 disabled:opacity-50"
        >
          {OUTLET_RATING_SCALES.map((value) => (
            <option key={value} value={value}>
              {t(SCALE_LABELS[value])}
            </option>
          ))}
        </select>
      </label>
      {disabled && (
        <p className="mt-3 text-sm text-amber-200">
          {t("Save your other changes before changing the rating system.")}
        </p>
      )}
      {!preview && (
        <button
          type="button"
          disabled={disabled || busy || target === scale}
          onClick={() => void calculatePreview()}
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg border border-violet-300/50 px-4 py-2 text-sm font-bold text-violet-200 focus-visible:ring-2 focus-visible:ring-violet-300 disabled:opacity-40"
        >
          {busy && (
            <Loader2
              size={16}
              className="animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          )}
          {t("Preview rating system")}
        </button>
      )}
      {preview && (
        <div className="mt-5">
          <h3 className="font-bold">
            {t("{source} → {target}", {
              source: preview.source_scale
                ? t(SCALE_LABELS[preview.source_scale])
                : t("Not configured"),
              target: t(SCALE_LABELS[preview.target_scale]),
            })}
          </h3>
          <p className="mt-2 text-sm leading-6 text-white/70">
            {t(
              "{rated} rated games will be converted. {unrated} reviews without a rating remain unchanged.",
              { rated: preview.rated_count, unrated: preview.unrated_count },
            )}
          </p>
          {preview.rated_count > 0 && (
            <>
              <p className="mt-3 text-sm leading-6 text-amber-100">
                {t(
                  "Some scores merge or round. Converting back may not restore the original score. Tier filter order stays the same.",
                )}
              </p>
              <div className="mt-4 max-h-96 overflow-y-auto rounded-xl border border-white/15">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">
                    {t("Editable score conversion")}
                  </caption>
                  <thead className="sticky top-0 z-10 bg-[#17121f] text-white/70">
                    <tr>
                      <th className="p-3">{t("Original")}</th>
                      <th className="p-3">{t("Games")}</th>
                      <th className="p-3">{t("New rating")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.mapping.map((entry, index) => {
                      const parsed = outletRatingSchema.safeParse({
                        scale: preview.target_scale,
                        value: entry.to,
                      });
                      const fromLabel =
                        typeof entry.from === "number"
                          ? entry.from.toLocaleString(locale)
                          : entry.from.replace("-", "−");
                      return (
                        <tr
                          key={entry.from}
                          className="border-t border-white/10"
                        >
                          <th className="p-3 font-bold">{fromLabel}</th>
                          <td className="p-3">{entry.count}</td>
                          <td className="p-3">
                            <OutletRatingInput
                              scale={preview.target_scale}
                              value={parsed.success ? parsed.data : null}
                              label={t("Convert {rating} to", {
                                rating: fromLabel,
                              })}
                              allowEmpty={false}
                              disabled={busy || disabled}
                              onChange={(rating) => {
                                if (!rating) return;
                                setPreview({
                                  ...preview,
                                  mapping: preview.mapping.map(
                                    (row, rowIndex) =>
                                      rowIndex === index
                                        ? { ...row, to: rating.value }
                                        : row,
                                  ),
                                });
                              }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <p className="mt-3 text-sm leading-6 text-white/70">
            {t(
              "Applying only updates the draft, including hidden games. Review your games, then publish separately.",
            )}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy || disabled}
              onClick={() => void applyToDraft()}
              className="min-h-11 rounded-lg bg-violet-200 px-4 py-2 text-sm font-black text-[#17121f] focus-visible:ring-2 focus-visible:ring-white disabled:opacity-50"
            >
              {t("Apply to draft")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setPreview(null)}
              className="min-h-11 rounded-lg px-4 py-2 text-sm font-bold underline focus-visible:ring-2 focus-visible:ring-violet-300"
            >
              {t("Cancel")}
            </button>
          </div>
        </div>
      )}
      {error && (
        <div role="alert" className="mt-4 text-sm text-rose-200">
          <p>{error}</p>
          <button
            type="button"
            disabled={busy || disabled}
            onClick={() => void onReload()}
            className="mt-2 min-h-10 font-bold underline"
          >
            {t("Reload latest draft")}
          </button>
        </div>
      )}
      {success && (
        <p role="status" className="mt-4 text-sm text-emerald-200">
          {t("Rating system applied to the draft. Publish when you are ready.")}
        </p>
      )}
    </section>
  );
}
