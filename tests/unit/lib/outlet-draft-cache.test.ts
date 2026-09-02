import {
  outletDraftCacheKeys,
  revalidateOutletDraftCaches,
} from "lib/outlet-draft-cache";

describe("Outlet draft cache revalidation", () => {
  test("keeps management, preview, and publication views in lockstep", async () => {
    const mutate = jest.fn().mockResolvedValue(undefined);

    await revalidateOutletDraftCaches(mutate, "lantern-club");

    expect(outletDraftCacheKeys("lantern-club")).toEqual([
      "/api/v1/stores/lantern-club",
      "/api/v1/stores/lantern-club?preview=1",
      "/api/v1/stores/lantern-club/publication",
    ]);
    expect(mutate.mock.calls.map(([key]) => key)).toEqual(
      outletDraftCacheKeys("lantern-club"),
    );
  });

  test("attempts every authoritative view even when one revalidation fails", async () => {
    const mutate = jest
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("offline");
      })
      .mockResolvedValue(undefined);

    await expect(
      revalidateOutletDraftCaches(mutate, "lantern-club"),
    ).resolves.toBeUndefined();
    expect(mutate).toHaveBeenCalledTimes(3);
  });
});
