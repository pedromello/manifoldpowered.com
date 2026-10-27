export type OutboundDestination = {
  provider: string;
  kind: "official" | "storefront" | "game" | "gift_card";
  platform: string | null;
  country: string;
  placement: string;
  clicks: number;
  visits: number;
};

/** Aggregate observations only: no buyer identity, external URLs or individual events. */
export type OutboundAnalytics = {
  window: { from: string; to: string };
  collection_enabled: boolean;
  retention_days: number;
  totals: {
    clicks: number;
    visits: number;
    official: number;
    affiliate: number;
  };
  daily: Array<{
    date: string;
    clicks: number;
    official: number;
    affiliate: number;
  }>;
  destinations: OutboundDestination[];
  games: Array<{
    game_id: string | null;
    game_slug: string | null;
    game_title: string | null;
    clicks: number;
    official: number;
    affiliate: number;
  }>;
  outlets: Array<{
    store_id: string | null;
    store_slug: string | null;
    store_name: string | null;
    clicks: number;
  }>;
};

export const OUTBOUND_PLACEMENTS = [
  "purchase_card",
  "social_store_link",
  "outlet_links",
  "purchase_primary",
  "purchase_alternative",
  "legacy",
] as const;
