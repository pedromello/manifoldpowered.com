import { homeUpdateSchema } from "contracts/home-editorial";
import {
  configuredSelections,
  resolveHomeSelections,
} from "models/home_editorial";
import { publicSelectionViews } from "models/home_selection_views";
import { discoverSelections } from "models/store_selection_discovery";
import { prisma } from "infra/database";
import { selectionFixture } from "tests/unit/_fixtures/selection";
import type { NextApiRequest } from "next";

jest.mock("infra/database", () => ({
  prisma: { storeSelection: { findMany: jest.fn() } },
}));
jest.mock("models/home_selection_views", () => ({
  publicSelectionViews: jest.fn(),
}));
jest.mock("models/store_selection_discovery", () => ({
  discoverSelections: jest.fn(),
}));
jest.mock("models/store", () => ({ __esModule: true, default: {} }));
const req = {
  context: { user: {} },
  query: {},
  headers: {},
} as unknown as NextApiRequest;
beforeEach(() => jest.resetAllMocks());

test("retains manual order without filling missing slots or requiring different outlets", async () => {
  const first = selectionFixture();
  first.selection.id = "first";
  const last = selectionFixture();
  last.selection.id = "last";
  jest.mocked(prisma.storeSelection.findMany).mockResolvedValue([]);
  jest.mocked(publicSelectionViews).mockResolvedValue([last, first] as never);
  const result = await resolveHomeSelections(req, [
    "first",
    "unpublished",
    "last",
  ]);
  expect(result.mode).toBe("manual");
  expect(result.selections.map((entry) => entry.selection.id)).toEqual([
    "first",
    "last",
  ]);
  expect(discoverSelections).not.toHaveBeenCalled();
});

test.each([{ ids: [] }, { ids: ["unpublished"] }])(
  "uses automatic discovery when no manual item survives: %j",
  async ({ ids }) => {
    jest.mocked(prisma.storeSelection.findMany).mockResolvedValue([]);
    jest.mocked(publicSelectionViews).mockResolvedValue([]);
    jest
      .mocked(discoverSelections)
      .mockResolvedValue([selectionFixture()] as never);
    expect((await resolveHomeSelections(req, ids)).mode).toBe("automatic");
    expect(discoverSelections).toHaveBeenCalledWith(
      req,
      3,
      expect.any(Function),
    );
  },
);

test("falls back to catalog when no selection can be displayed", async () => {
  jest.mocked(discoverSelections).mockResolvedValue([]);
  expect(await resolveHomeSelections(req, [])).toEqual({
    mode: "catalog",
    selections: [],
  });
  expect(await configuredSelections(req, [])).toEqual([]);
});

test("rejects duplicate IDs, invalid IDs and more than three selections", () => {
  const id = "1028473f-fd92-49d4-90c2-c132f52f2202";
  expect(
    homeUpdateSchema.safeParse({
      selection_ids: [id, id],
      expected_revision: 0,
    }).success,
  ).toBe(false);
  expect(
    homeUpdateSchema.safeParse({
      selection_ids: ["invalid"],
      expected_revision: 0,
    }).success,
  ).toBe(false);
  expect(
    homeUpdateSchema.safeParse({
      selection_ids: Array(4).fill(id),
      expected_revision: 0,
    }).success,
  ).toBe(false);
  expect(
    homeUpdateSchema.safeParse({ selection_ids: [], expected_revision: -1 })
      .success,
  ).toBe(false);
});
