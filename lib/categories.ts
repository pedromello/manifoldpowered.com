/**
 * The category rail shown on every storefront.
 *
 * A curated shortlist, not the full tag vocabulary: games carry free-form tags,
 * and these are the handful worth a top-level pill. "For You" is the unfiltered
 * view rather than a real tag, which is why the views map it to a null category
 * instead of sending it to the API.
 */
export const CATEGORIES = [
  "For You",
  "Action",
  "RPG",
  "Simulation",
  "Horror",
  "Strategy",
  "Racing",
  "Indie",
] as const;
