import { useId } from "react";
import {
  outletRatingSchema,
  ratingValues,
  type OutletRating,
  type OutletRatingScale,
} from "contracts/outlet-rating";
import { OutletRatingBadge } from "components/store/OutletRatingBadge";
import { useI18n } from "lib/i18n";

export function OutletRatingInput({
  scale,
  value,
  onChange,
  label,
  allowEmpty = true,
  emptyLabel,
  disabled = false,
}: {
  scale: OutletRatingScale;
  value: OutletRating | null;
  onChange: (rating: OutletRating | null) => void;
  label: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const { t, locale } = useI18n();
  const options = ratingValues(scale);
  if (scale === "TIER") options.reverse();

  function selectValue(raw: string) {
    if (raw === "") {
      onChange(null);
      return;
    }
    const parsed = outletRatingSchema.safeParse({
      scale,
      value: scale === "TIER" ? raw : Number(raw),
    });
    if (parsed.success) onChange(parsed.data);
  }

  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-2 block text-sm font-bold">
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <select
          id={id}
          value={value?.value ?? ""}
          onChange={(event) => selectValue(event.target.value)}
          disabled={disabled}
          className="min-h-11 min-w-24 max-w-full rounded-lg border border-white/20 bg-[#17121f] px-3 py-2 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-violet-300 disabled:opacity-50"
        >
          {allowEmpty && (
            <option value="">{emptyLabel ?? t("No rating")}</option>
          )}
          {options.map((option) => (
            <option key={option} value={option}>
              {typeof option === "string"
                ? option.replace("-", "−")
                : `${option.toLocaleString(locale)}/${scale === "STARS" ? 5 : 10}`}
            </option>
          ))}
        </select>
        <OutletRatingBadge rating={value} />
      </div>
    </div>
  );
}
