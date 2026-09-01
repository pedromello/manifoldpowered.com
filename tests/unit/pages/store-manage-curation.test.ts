import { parseTagRuleChangeReceipt } from "pages/store/[slug]/manage";

describe("creator curation mutation receipts", () => {
  test("accepts a complete tag-rule receipt", () => {
    expect(
      parseTagRuleChangeReceipt({
        change_id: "change-1",
        draft_revision: 7,
      }),
    ).toEqual({ changeId: "change-1", draftRevision: 7 });
  });

  test.each([
    null,
    {},
    { draft_revision: 7 },
    { change_id: "", draft_revision: 7 },
    { change_id: "change-1", draft_revision: 0 },
    { change_id: "change-1", draft_revision: 1.5 },
  ])(
    "rejects an incomplete response so the UI re-fetches instead of offering unsafe undo: %p",
    (response) => {
      expect(parseTagRuleChangeReceipt(response)).toBeNull();
    },
  );
});
