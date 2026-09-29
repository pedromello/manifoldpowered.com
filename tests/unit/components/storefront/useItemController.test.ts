import { itemAcquisitionBody } from "components/storefront/useItemController";

describe("item acquisition attribution", () => {
  test("keeps the requested Outlet candidate when no public Store was resolved", () => {
    expect(itemAcquisitionBody("signal-garden", "known-draft")).toEqual({
      slug: "signal-garden",
      store_slug: "known-draft",
    });
  });

  test("leaves a direct acquisition unattributed", () => {
    expect(JSON.stringify(itemAcquisitionBody("signal-garden"))).toBe(
      '{"slug":"signal-garden"}',
    );
  });
});
