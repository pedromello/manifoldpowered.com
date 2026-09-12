import {
  outletRatingSchema,
  type OutletRatingScale,
} from "contracts/outlet-rating";

export type OutletRatingFilter = {
  rating_scale: string | null;
  rating_op: string | null;
  rating_value: string | null;
};

export const EMPTY_OUTLET_RATING_FILTER: OutletRatingFilter = {
  rating_scale: null,
  rating_op: null,
  rating_value: null,
};

export function writeOutletRatingFilter(
  params: URLSearchParams,
  filter: OutletRatingFilter,
) {
  for (const [key, value] of Object.entries(filter)) {
    if (value === null) params.delete(key);
    else params.set(key, value);
  }
}

export function hasOutletRatingFilter(filter: OutletRatingFilter) {
  return Object.values(filter).some((value) => value !== null);
}

export function validOutletRatingFilter(
  filter: OutletRatingFilter,
  scale: OutletRatingScale | null | undefined,
) {
  if (!hasOutletRatingFilter(filter)) return true;
  if (
    !scale ||
    filter.rating_scale !== scale ||
    !["eq", "gte"].includes(filter.rating_op ?? "") ||
    filter.rating_value === null ||
    filter.rating_value.trim() === ""
  )
    return false;
  if (scale !== "TIER" && !/^\d+(?:\.\d+)?$/.test(filter.rating_value))
    return false;
  return outletRatingSchema.safeParse({
    scale,
    value: scale === "TIER" ? filter.rating_value : Number(filter.rating_value),
  }).success;
}
