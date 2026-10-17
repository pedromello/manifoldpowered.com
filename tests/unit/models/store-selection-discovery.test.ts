import type { NextApiRequest } from "next";
import storeSelection, {
  type SelectionDiscoveryCandidate,
} from "models/store_selection";
import { selectionView, type SelectionView } from "models/store_selection_view";
import {
  discoverSelections,
  SELECTION_DISCOVERY_SCAN_LIMIT,
} from "models/store_selection_discovery";
import { selectionFixture } from "tests/unit/_fixtures/selection";

jest.mock("models/store_selection", () => ({
  __esModule: true,
  default: { discoveryCandidates: jest.fn() },
}));
jest.mock("models/store_selection_view", () => ({ selectionView: jest.fn() }));

const request = {
  headers: { "x-vercel-ip-country": "BR" },
  query: { locale: "pt-BR" },
  context: { user: {} },
} as unknown as NextApiRequest;
function candidate(
  index: number,
  outlet = `outlet-${index}`,
  slug = `selection-${index}`,
): SelectionDiscoveryCandidate {
  return {
    id: String(index).padStart(4, "0"),
    published_at: new Date("2026-10-16T12:00:00Z"),
    store_slug: outlet,
    selection_slug: slug,
  };
}
function view(outlet: string, slug: string, usable = true): SelectionView {
  const fixture = selectionFixture();
  fixture.outlet.slug = outlet;
  fixture.selection.slug = slug;
  fixture.selection.public_path = `/store/${outlet}/selections/${slug}`;
  if (!usable) fixture.games = [];
  return fixture as unknown as SelectionView;
}
beforeEach(() => jest.resetAllMocks());

test("uses an older usable selection when the newest selection in the same outlet is unavailable", async () => {
  jest
    .mocked(storeSelection.discoveryCandidates)
    .mockResolvedValueOnce([
      candidate(1, "cozy", "newest"),
      candidate(2, "cozy", "older"),
    ]);
  jest
    .mocked(selectionView)
    .mockImplementation(async (_req, outlet, slug) =>
      view(outlet, slug, slug === "older"),
    );
  const result = await discoverSelections(request, 3);
  expect(result.map((entry) => entry.selection.slug)).toEqual(["older"]);
});

test("continues past a full batch of unusable newest selections to find another outlet", async () => {
  const first = Array.from({ length: 6 }, (_, index) => candidate(index));
  const older = candidate(6, "available-outlet", "available-selection");
  jest
    .mocked(storeSelection.discoveryCandidates)
    .mockResolvedValueOnce(first)
    .mockResolvedValueOnce([older]);
  jest
    .mocked(selectionView)
    .mockImplementation(async (_req, outlet, slug) =>
      view(outlet, slug, outlet === "available-outlet"),
    );
  const result = await discoverSelections(request, 1);
  expect(result.map((entry) => entry.outlet.slug)).toEqual([
    "available-outlet",
  ]);
  expect(storeSelection.discoveryCandidates).toHaveBeenNthCalledWith(
    2,
    6,
    first[5],
  );
});

test("keeps only the newest usable selection per outlet and caps game projections at three", async () => {
  jest
    .mocked(storeSelection.discoveryCandidates)
    .mockResolvedValueOnce([
      candidate(1, "cozy", "newest"),
      candidate(2, "cozy", "older"),
      candidate(3, "mystery", "mysteries"),
    ]);
  jest.mocked(selectionView).mockImplementation(async (_req, outlet, slug) => {
    const result = view(outlet, slug);
    result.games = Array.from({ length: 5 }, (_, index) => ({
      ...result.games[0],
      id: `game-${index}`,
    }));
    return result;
  });
  const result = await discoverSelections(request, 3);
  expect(result.map((entry) => entry.selection.slug)).toEqual([
    "newest",
    "mysteries",
  ]);
  expect(result.every((entry) => entry.games.length === 3)).toBe(true);
});

test("passes the original visitor request into every eligibility read", async () => {
  jest
    .mocked(storeSelection.discoveryCandidates)
    .mockResolvedValueOnce([
      candidate(1, "cozy", "unavailable-in-brazil"),
      candidate(2, "cozy", "available-in-brazil"),
    ]);
  jest.mocked(selectionView).mockImplementation(async (req, outlet, slug) => {
    expect(req).toBe(request);
    expect(req.headers["x-vercel-ip-country"]).toBe("BR");
    expect(req.query.locale).toBe("pt-BR");
    return view(outlet, slug, slug === "available-in-brazil");
  });
  const result = await discoverSelections(request, 1);
  expect(result[0].selection.slug).toBe("available-in-brazil");
});

test("skips a concurrent withdrawal but propagates infrastructure failures", async () => {
  const candidates = [candidate(1), candidate(2)];
  jest.mocked(storeSelection.discoveryCandidates).mockResolvedValue(candidates);
  jest
    .mocked(selectionView)
    .mockRejectedValueOnce({ statusCode: 404 })
    .mockResolvedValueOnce(view("outlet-2", "selection-2"));
  await expect(discoverSelections(request, 1)).resolves.toHaveLength(1);
  jest
    .mocked(selectionView)
    .mockRejectedValue(new Error("Database unavailable"));
  await expect(discoverSelections(request, 1)).rejects.toThrow(
    "Database unavailable",
  );
});

test("bounds scans and advances the cursor even when every selection is unusable", async () => {
  let next = 0;
  jest
    .mocked(storeSelection.discoveryCandidates)
    .mockImplementation(async (take, after) => {
      if (next === 0) expect(after).toBeUndefined();
      else expect(after?.id).toBe(String(next - 1).padStart(4, "0"));
      return Array.from({ length: take }, () => candidate(next++));
    });
  jest
    .mocked(selectionView)
    .mockImplementation(async (_req, outlet, slug) =>
      view(outlet, slug, false),
    );
  await expect(discoverSelections(request, 3)).resolves.toEqual([]);
  expect(next).toBe(SELECTION_DISCOVERY_SCAN_LIMIT);
  expect(selectionView).toHaveBeenCalledTimes(SELECTION_DISCOVERY_SCAN_LIMIT);
  expect(storeSelection.discoveryCandidates).toHaveBeenCalledTimes(20);
});
