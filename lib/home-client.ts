import type { SelectionPageApi } from "lib/selection-client";
import type { GameApi } from "components/store/types";

export type HomeCommunity = {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  cover_url: string | null;
  description: string | null;
  games: GameApi[];
};

export type PublicHome = {
  mode: "manual" | "automatic" | "catalog";
  selections: SelectionPageApi[];
  communities: HomeCommunity[];
};

export type AdminHome = {
  selection_ids: string[];
  revision: number;
  updated_by: string | null;
  updated_at: string | null;
  items: Array<{ id: string; entry: SelectionPageApi | null }>;
  resolved: PublicHome;
};
