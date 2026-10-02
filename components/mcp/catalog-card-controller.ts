import { App } from "@modelcontextprotocol/ext-apps";
import {
  catalogSearchResultSchema,
  catalogDetailResultSchema,
  catalogReviewsResultSchema,
  type CatalogGame,
  type CatalogReviewsResult,
} from "contracts/public-game-catalog";
import {
  labels,
  type CardLocale,
  type ReviewFilter,
  type ReviewSort,
} from "components/mcp/CatalogCard";

const app = new App(
  { name: "Manifold game card", version: "0.1.0" },
  { availableDisplayModes: ["inline"] },
);
interface CardState {
  games: CatalogGame[] | null;
  selected: CatalogGame | null;
  reviews: CatalogReviewsResult | null;
  locale: CardLocale;
  pending: boolean;
  error: string | null;
}
let state: CardState = {
  games: null,
  selected: null,
  reviews: null,
  locale: "pt-BR",
  pending: false,
  error: null,
};
const listeners = new Set<() => void>();
let requestVersion = 0;
function update(changes: Partial<CardState>) {
  state = { ...state, ...changes };
  listeners.forEach((listener) => listener());
}
function receive(data: unknown, isError?: boolean) {
  if (isError) {
    update({ pending: false, error: labels[state.locale].error });
    return;
  }
  const reviews = catalogReviewsResultSchema.safeParse(data);
  if (reviews.success) {
    update({
      selected: reviews.data.game,
      reviews: reviews.data,
      locale: reviews.data.locale,
      error: null,
      pending: false,
    });
    return;
  }
  const detail = catalogDetailResultSchema.safeParse(data);
  if (detail.success) {
    update({
      selected: detail.data.game,
      reviews: null,
      locale: detail.data.locale,
      error: null,
      pending: false,
    });
    return;
  }
  const search = catalogSearchResultSchema.safeParse(data);
  if (search.success) {
    update({
      games: search.data.games,
      selected: null,
      reviews: null,
      locale: search.data.locale,
      error: null,
      pending: false,
    });
    return;
  }
  update({ pending: false, error: labels[state.locale].error });
}
async function call(name: string, args: Record<string, unknown>) {
  const version = ++requestVersion;
  update({ pending: true, error: null });
  try {
    const result = await app.callServerTool({ name, arguments: args });
    if (version === requestVersion)
      receive(result.structuredContent, result.isError);
  } catch {
    if (version === requestVersion)
      update({ pending: false, error: labels[state.locale].error });
  }
}
export const catalogCardController = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot() {
    return state;
  },
  selectGame(slug: string) {
    void call("get_game", { slug, locale: state.locale });
  },
  loadReviews(page: number, recommendation: ReviewFilter, sort: ReviewSort) {
    if (state.selected)
      void call("get_game_reviews", {
        slug: state.selected.slug,
        locale: state.locale,
        page,
        recommendation,
        sort,
      });
  },
  back() {
    ++requestVersion;
    update({ selected: null, reviews: null, error: null, pending: false });
  },
  async openLink(url: string) {
    const result = await app.openLink({ url });
    if (result.isError) throw new Error("Link unavailable");
  },
  connect() {
    app.ontoolresult = (result) =>
      receive(result.structuredContent, result.isError);
    app.ontoolcancelled = () => receive(null, true);
    // Initial tool notification is rendered without repeating its lookup.
    void app.connect().catch(() => receive(null, true));
  },
};
