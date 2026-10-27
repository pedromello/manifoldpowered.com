import {
  saveAffiliateLink,
  deleteAffiliateLink,
  AffiliateRequestError,
} from "lib/outlet-affiliate-client";
import type { AffiliateLinkInput } from "contracts/outlet-affiliates";

const link: AffiliateLinkInput = {
  kind: "gift_card",
  merchant: "amazon",
  platform: "nintendo",
  media_type: null,
  country: "BR",
  game_slug: null,
  label: null,
  url: "https://amzn.to/synthetic?tag=creator-20&extra=a%2Bb",
};
const response = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

test("creates a link with its draft revision and preserves the affiliate URL byte for byte", async () => {
  const request = jest
    .fn()
    .mockResolvedValue(response(201, { draft_revision: 8 }));
  await expect(
    saveAffiliateLink("creator club", link, 7, request),
  ).resolves.toEqual({ draft_revision: 8 });
  const [url, options] = request.mock.calls[0];
  expect(url).toBe("/api/v1/stores/creator%20club/affiliate-links");
  expect(options.method).toBe("POST");
  expect(JSON.parse(options.body)).toEqual({
    expected_draft_revision: 7,
    link,
  });
});

test("editing and removal retain the stable link identity and use optimistic concurrency", async () => {
  const request = jest
    .fn()
    .mockResolvedValue(response(200, { draft_revision: 9 }));
  const id = "42fe19be-5197-4c46-a9ae-1f414cde26d1";
  await saveAffiliateLink("creator", { ...link, id }, 8, request);
  expect(request.mock.calls[0][1].method).toBe("PATCH");
  expect(JSON.parse(request.mock.calls[0][1].body).link.id).toBe(id);
  await deleteAffiliateLink("creator", id, 9, request);
  expect(request.mock.calls[1][1].method).toBe("DELETE");
  expect(JSON.parse(request.mock.calls[1][1].body)).toEqual({
    expected_draft_revision: 9,
    id,
  });
});

test("a revision conflict is reported without retrying or silently overwriting another editor", async () => {
  const request = jest
    .fn()
    .mockResolvedValue(response(409, { message: "Changed" }));
  await expect(
    saveAffiliateLink("creator", link, 7, request),
  ).rejects.toMatchObject({ name: "AffiliateRequestError", status: 409 });
  expect(request).toHaveBeenCalledTimes(1);
  expect(new AffiliateRequestError("error", 403).status).toBe(403);
});
