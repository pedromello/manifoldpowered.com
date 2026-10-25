import { selectionLibraryQuerySchema } from "contracts/outlet-selections";
import {
  selectionLibraryItemPath,
  selectionLibraryPath,
  selectionLibraryReturnPath,
} from "lib/selection-library";
import { selectionFixture } from "tests/unit/_fixtures/selection";

test("library navigation round-trips filters and preview without accepting an arbitrary return URL", () => {
  const query = { q: "coop & friends", order: "title_asc" as const, page: 3 };
  const selection = selectionFixture().selection;
  const item = new URL(
    selectionLibraryItemPath(selection, query, true),
    "https://example.com",
  );
  const returned = selectionLibraryReturnPath(
    "example-outlet",
    selection.slug,
    Object.fromEntries(item.searchParams),
    true,
  );
  expect(returned).toBe(
    `/store/example-outlet/selections?q=coop+%26+friends&order=title_asc&page=3&preview=1#selection-${selection.slug}`,
  );
  expect(
    selectionLibraryReturnPath(
      "example-outlet",
      selection.slug,
      { return_to: "https://evil.example" },
      false,
    ),
  ).toBeUndefined();
  expect(
    selectionLibraryReturnPath(
      "example-outlet",
      selection.slug,
      { source: "selections", library_order: "invalid" },
      false,
    ),
  ).toBeUndefined();
});

test("library URLs omit defaults and validate repeated or excessive input", () => {
  expect(selectionLibraryPath("example-outlet")).toBe(
    "/store/example-outlet/selections",
  );
  expect(
    selectionLibraryQuerySchema.safeParse({ q: ["one", "two"] }).success,
  ).toBe(false);
  expect(
    selectionLibraryQuerySchema.safeParse({ q: "x".repeat(201) }).success,
  ).toBe(false);
  expect(selectionLibraryQuerySchema.safeParse({ page: "0" }).success).toBe(
    false,
  );
});
