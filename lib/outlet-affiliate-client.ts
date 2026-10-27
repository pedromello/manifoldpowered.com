import type {
  AffiliateLink,
  AffiliateLinkInput,
} from "contracts/outlet-affiliates";

export type AffiliateDraft = { links: AffiliateLink[]; draft_revision: number };

export class AffiliateRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AffiliateRequestError";
  }
}

export function affiliateEndpoint(slug: string) {
  return `/api/v1/stores/${encodeURIComponent(slug)}/affiliate-links`;
}

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new AffiliateRequestError(
      response.status === 409
        ? "The Outlet changed. Reload the latest draft before saving again."
        : body?.message || "Could not save the affiliate link.",
      response.status,
    );
  }
  return body as T;
}

export async function fetchAffiliateDraft(
  slug: string,
): Promise<AffiliateDraft> {
  return readResponse(await fetch(`${affiliateEndpoint(slug)}?draft=1`));
}

export async function saveAffiliateLink(
  slug: string,
  link: AffiliateLinkInput,
  expectedDraftRevision: number,
  request: typeof fetch = fetch,
) {
  return readResponse<{ draft_revision: number }>(
    await request(affiliateEndpoint(slug), {
      method: link.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        expected_draft_revision: expectedDraftRevision,
        link,
      }),
    }),
  );
}

export async function deleteAffiliateLink(
  slug: string,
  id: string,
  expectedDraftRevision: number,
  request: typeof fetch = fetch,
) {
  return readResponse<{ draft_revision: number }>(
    await request(affiliateEndpoint(slug), {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        expected_draft_revision: expectedDraftRevision,
        id,
      }),
    }),
  );
}
