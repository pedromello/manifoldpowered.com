import type { NextApiRequest } from "next";
import storeSelection, {
  type SelectionDiscoveryCursor,
} from "models/store_selection";
import { selectionView, type SelectionView } from "models/store_selection_view";

export const SELECTION_DISCOVERY_SCAN_LIMIT = 120;
const BATCH_SIZE = 6;

export async function discoverSelections(
  req: NextApiRequest,
  limit: number,
  loadBatch?: (
    candidates: import("models/store_selection").SelectionDiscoveryCandidate[],
  ) => Promise<Array<SelectionView | null>>,
) {
  const results: SelectionView[] = [];
  const outlets = new Set<string>();
  let after: SelectionDiscoveryCursor | undefined;
  let scanned = 0;
  // Choose one *usable* selection per outlet after applying current catalog
  // and regional visibility. A newer unavailable selection must not shadow an
  // older usable one. Keyset paging bounds the work without repeatedly
  // scanning skipped rows or loading every selection into memory.
  while (results.length < limit && scanned < SELECTION_DISCOVERY_SCAN_LIMIT) {
    const take = Math.min(BATCH_SIZE, SELECTION_DISCOVERY_SCAN_LIMIT - scanned);
    const candidates = await storeSelection.discoveryCandidates(take, after);
    if (!candidates.length) break;
    scanned += candidates.length;
    const views = loadBatch
      ? await loadBatch(candidates)
      : await Promise.all(
          candidates.map(async (candidate) => {
            if (outlets.has(candidate.store_slug)) return null;
            try {
              const view = await selectionView(
                req,
                candidate.store_slug,
                candidate.selection_slug,
              );
              return view.games.length ? view : null;
            } catch (error) {
              // A publication can be withdrawn between the candidate and detail reads.
              if (
                error &&
                typeof error === "object" &&
                "statusCode" in error &&
                error.statusCode === 404
              )
                return null;
              throw error;
            }
          }),
        );
    for (const view of views) {
      if (!view || outlets.has(view.outlet.slug)) continue;
      outlets.add(view.outlet.slug);
      results.push({ ...view, games: view.games.slice(0, 3) });
      if (results.length === limit) break;
    }
    after = candidates[candidates.length - 1];
    if (candidates.length < take) break;
  }
  return results;
}
