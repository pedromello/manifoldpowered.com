import { ApiClientError } from "lib/api-client";
import { updateOutletFollow } from "lib/store-follow-client";

describe("updateOutletFollow", () => {
  test("optimistically follows and confirms the server response", async () => {
    const applied: boolean[] = [];
    const request = jest.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({
        store_slug: "curator-outlet",
      });
      return new Response(JSON.stringify({ is_followed: true }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    await updateOutletFollow({
      storeSlug: "curator-outlet",
      isFollowed: false,
      applyStatus: (status) => applied.push(status.is_followed),
      request,
    });

    expect(applied).toEqual([true, true]);
  });

  test("uses DELETE when the optimistic state is unfollowed", async () => {
    const request = jest.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.method).toBe("DELETE");
      return new Response(JSON.stringify({ is_followed: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    await updateOutletFollow({
      storeSlug: "curator-outlet",
      isFollowed: true,
      applyStatus: jest.fn(),
      request,
    });
  });

  test("rolls the optimistic state back after a failed request", async () => {
    const applied: boolean[] = [];
    const request = jest.fn(
      async () => new Response(null, { status: 500 }),
    ) as typeof fetch;

    await expect(
      updateOutletFollow({
        storeSlug: "curator-outlet",
        isFollowed: false,
        applyStatus: (status) => applied.push(status.is_followed),
        request,
      }),
    ).rejects.toBeInstanceOf(ApiClientError);

    expect(applied).toEqual([true, false]);
  });

  test("rolls back when a successful response has an unsafe shape", async () => {
    const applied: boolean[] = [];
    const request = jest.fn(
      async () =>
        new Response(JSON.stringify({ follower_count: 9000 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    ) as typeof fetch;

    await expect(
      updateOutletFollow({
        storeSlug: "curator-outlet",
        isFollowed: true,
        applyStatus: (status) => applied.push(status.is_followed),
        request,
      }),
    ).rejects.toBeInstanceOf(ApiClientError);

    expect(applied).toEqual([false, true]);
  });
});
