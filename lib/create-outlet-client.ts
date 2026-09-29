import {
  CREATOR_OUTLET_FUNNEL_VERSION,
  creatorFunnelAnalytics,
  type CreatorFunnelAnalytics,
} from "lib/creator-funnel-analytics";

export type CreateOutletDraftInput = {
  name: string;
  description?: string;
  logoUrl?: string;
};

export type CreateOutletDraftResponse = {
  slug?: string;
  status?: string;
  description?: string | null;
  logo_url?: string | null;
  message?: string;
};

export type CreateOutletDraftResult = {
  ok: boolean;
  status: number;
  body: CreateOutletDraftResponse | null;
};

type OutletCreationAnalytics = Pick<
  CreatorFunnelAnalytics,
  "createStarted" | "draftCreated"
>;

type CreateOutletSubmissionControllerOptions = {
  request?: typeof fetch;
  analytics?: OutletCreationAnalytics;
};

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Owns one Outlet-creation session for the create form.
 *
 * Concurrent submits share one request, a successful result is terminal, and
 * the start milestone is emitted at most once even when the creator retries a
 * failed request. No render or route visit emits a funnel event.
 */
export function createOutletSubmissionController({
  request = fetch,
  analytics = creatorFunnelAnalytics,
}: CreateOutletSubmissionControllerOptions = {}) {
  let hasTrackedStart = false;
  let inFlight: Promise<CreateOutletDraftResult> | null = null;
  let successfulResult: CreateOutletDraftResult | null = null;

  function trackStart() {
    if (hasTrackedStart) return;

    hasTrackedStart = true;
    analytics.createStarted({
      funnelVersion: CREATOR_OUTLET_FUNNEL_VERSION,
      entrySurface: "create_outlet",
    });
  }

  async function performSubmit(
    input: CreateOutletDraftInput,
  ): Promise<CreateOutletDraftResult> {
    // Submit is the fallback explicit intent for keyboard/autofill flows where
    // the form-level change event did not run first.
    trackStart();

    const response = await request("/api/v1/stores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: input.name,
        description: input.description,
        logo_url: input.logoUrl,
      }),
    });
    const body = (await response
      .json()
      .catch(() => null)) as CreateOutletDraftResponse | null;
    const result = { ok: response.ok, status: response.status, body };

    if (response.ok) {
      // Cache any accepted creation so a delayed second click cannot create a
      // second Outlet while the router is completing the navigation.
      successfulResult = result;
    }

    if (response.status === 201 && body?.status === "DRAFT") {
      analytics.draftCreated({
        funnelVersion: CREATOR_OUTLET_FUNNEL_VERSION,
        entrySurface: "create_outlet",
        hasDescription: hasText(body.description),
        hasLogo: hasText(body.logo_url),
      });
    }

    return result;
  }

  return {
    start: trackStart,

    submit(input: CreateOutletDraftInput): Promise<CreateOutletDraftResult> {
      if (successfulResult) return Promise.resolve(successfulResult);
      if (inFlight) return inFlight;

      inFlight = performSubmit(input).finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
  };
}
