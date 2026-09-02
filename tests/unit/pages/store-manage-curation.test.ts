import fs from "node:fs";
import path from "node:path";

import { parseTagRuleChangeReceipt } from "pages/store/[slug]/manage";

const managePageSource = fs.readFileSync(
  path.join(process.cwd(), "pages", "store", "[slug]", "manage.tsx"),
  "utf8",
);

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

describe("creator curation accessibility structure", () => {
  test("names the tag field and announces Featured feedback", () => {
    const tagInput = managePageSource.match(
      /<input\s+type="text"[\s\S]*?\/>/,
    )?.[0];
    expect(tagInput).toContain('aria-label={t("Tag to include or exclude")}');

    const featuredSection = managePageSource.slice(
      managePageSource.indexOf("function FeaturedTab"),
      managePageSource.indexOf("function CurationTab"),
    );
    expect(featuredSection.match(/role="alert"/g)).toHaveLength(2);
    expect(featuredSection).toContain('role="status"');
    expect(featuredSection).toContain('aria-live="polite"');
  });
});
