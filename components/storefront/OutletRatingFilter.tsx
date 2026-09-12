import {
  outletRatingSchema,
  type OutletRatingScale,
} from "contracts/outlet-rating";
import { OutletRatingInput } from "components/store/OutletRatingInput";
import {
  EMPTY_OUTLET_RATING_FILTER,
  hasOutletRatingFilter,
  validOutletRatingFilter,
  type OutletRatingFilter as RatingFilter,
} from "lib/outlet-rating-filter";
import { useI18n } from "lib/i18n";

export function OutletRatingFilter({
  scale,
  filter = EMPTY_OUTLET_RATING_FILTER,
  onChange,
}: {
  scale: OutletRatingScale | null;
  filter?: RatingFilter;
  onChange?: (filter: RatingFilter) => void;
}) {
  const { t } = useI18n();
  const hasFilter = hasOutletRatingFilter(filter);
  const valid = validOutletRatingFilter(filter, scale);
  if ((!scale && !hasFilter) || !onChange) return null;

  const parsed = outletRatingSchema.safeParse({
    scale,
    value: scale === "TIER" ? filter.rating_value : Number(filter.rating_value),
  });

  return (
    <section
      aria-label={t("Filter by creator rating")}
      data-storefront="rating-filter"
      className="my-5 rounded-xl border border-sf-border bg-sf-surface p-4 text-sf-fg"
    >
      {!valid ? (
        <p role="status" className="text-sm leading-6">
          {t(
            "This rating filter does not match the Outlet's current system. Clear it to browse the catalog.",
          )}
        </p>
      ) : scale ? (
        <div className="flex flex-wrap items-end gap-4">
          <label className="block text-sm font-bold">
            {t("Rating match")}
            <select
              aria-label={t("Rating match")}
              value={filter.rating_op ?? "eq"}
              onChange={(event) => {
                if (hasFilter)
                  onChange({ ...filter, rating_op: event.target.value });
                else
                  onChange({
                    rating_scale: scale,
                    rating_op: event.target.value,
                    rating_value: scale === "TIER" ? "F" : "0",
                  });
              }}
              className="mt-2 block min-h-11 rounded-lg border border-white/20 bg-[#17121f] px-3 py-2 text-white outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
            >
              <option value="eq">{t("Exactly")}</option>
              <option value="gte">{t("At least")}</option>
            </select>
          </label>
          <OutletRatingInput
            scale={scale}
            value={hasFilter && parsed.success ? parsed.data : null}
            label={t("Creator rating")}
            emptyLabel={t("All ratings")}
            onChange={(rating) =>
              onChange(
                rating
                  ? {
                      rating_scale: rating.scale,
                      rating_op: filter.rating_op ?? "eq",
                      rating_value: String(rating.value),
                    }
                  : EMPTY_OUTLET_RATING_FILTER,
              )
            }
          />
        </div>
      ) : null}
      {hasFilter && (
        <button
          type="button"
          onClick={() => onChange(EMPTY_OUTLET_RATING_FILTER)}
          className="mt-3 min-h-10 rounded px-1 text-sm font-bold underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sf-accent"
        >
          {t("Clear rating filter")}
        </button>
      )}
    </section>
  );
}
