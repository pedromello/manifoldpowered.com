import { track } from "@vercel/analytics";

type AnalyticsPrimitive = string | number | boolean | null;
type AnalyticsProperties = Record<string, AnalyticsPrimitive>;

export type CreatorFunnelEventName =
  | "creator_outlet_create_started"
  | "creator_outlet_draft_created"
  | "creator_outlet_first_game_added"
  | "creator_outlet_brand_complete"
  | "creator_outlet_previewed"
  | "creator_outlet_published"
  | "creator_outlet_link_copied";

export const CREATOR_OUTLET_FUNNEL_VERSION = 1 as const;
export type CreatorOutletFunnelVersion = typeof CREATOR_OUTLET_FUNNEL_VERSION;

export const CREATOR_FUNNEL_ENTRY_SURFACES = [
  "creator_workspace",
  "create_outlet",
  "manage_outlet",
  "outlet_preview",
] as const;

export type CreatorFunnelEntrySurface =
  (typeof CREATOR_FUNNEL_ENTRY_SURFACES)[number];

export type CreatorFunnelContext<
  Surface extends CreatorFunnelEntrySurface = CreatorFunnelEntrySurface,
> = {
  funnelVersion: CreatorOutletFunnelVersion;
  entrySurface: Surface;
};

export type CreatorFunnelTransport = (
  event: CreatorFunnelEventName,
  properties: AnalyticsProperties,
) => void;

export interface CreatorFunnelAnalytics {
  /** The creator made the first explicit attempt to create an Outlet. */
  createStarted(
    context: CreatorFunnelContext<"creator_workspace" | "create_outlet">,
  ): void;

  /** The create request completed and returned a draft Outlet. */
  draftCreated(
    input: CreatorFunnelContext<"create_outlet"> & {
      hasDescription: boolean;
      hasLogo: boolean;
    },
  ): void;

  /** The Outlet crossed from zero to at least one explicit game selection. */
  firstGameAdded(
    input: CreatorFunnelContext<"manage_outlet"> & {
      selectionSurface: "featured" | "curation";
    },
  ): void;

  /** The Outlet first satisfied the current brand-completeness predicate. */
  brandComplete(
    context: CreatorFunnelContext<"create_outlet" | "manage_outlet">,
  ): void;

  /** An authorized creator successfully opened an Outlet preview. */
  previewed(
    input: CreatorFunnelContext<"manage_outlet" | "outlet_preview"> & {
      outletState: "draft" | "published";
    },
  ): void;

  /** A draft-to-published lifecycle transition completed successfully. */
  published(context: CreatorFunnelContext<"manage_outlet">): void;

  /** The browser confirmed that an Outlet link was copied. */
  linkCopied(
    input: CreatorFunnelContext<"manage_outlet" | "outlet_preview"> & {
      copyContext: "manage" | "publish_success";
    },
  ): void;
}

const BRAND_CRITERIA_VERSION = 1;
export const CREATOR_OUTLET_PUBLISH_READINESS_VERSION = 2 as const;
const SELECTION_SURFACES = ["featured", "curation"] as const;
const OUTLET_STATES = ["draft", "published"] as const;
const COPY_CONTEXTS = ["manage", "publish_success"] as const;

function isAllowedValue<Value extends string>(
  value: unknown,
  allowedValues: readonly Value[],
): value is Value {
  return (
    typeof value === "string" &&
    allowedValues.some((allowedValue) => allowedValue === value)
  );
}

/**
 * Builds the creator-funnel analytics adapter around an injectable transport.
 *
 * This is intentionally a closed API: every method reconstructs a flat,
 * low-cardinality payload instead of forwarding caller-owned objects. Never
 * add Outlet/user/game identifiers, slugs, names, URLs, free-form copy, query
 * strings, or error messages here. Every event requires the versioned funnel
 * context and a compile-time allow-listed entry surface. Analytics is
 * best-effort product telemetry, not the audit log for lifecycle transitions.
 */
export function createCreatorFunnelAnalytics(
  transport: CreatorFunnelTransport,
): CreatorFunnelAnalytics {
  function emit(
    event: CreatorFunnelEventName,
    context: CreatorFunnelContext,
    properties: AnalyticsProperties = {},
  ) {
    try {
      if (
        context.funnelVersion !== CREATOR_OUTLET_FUNNEL_VERSION ||
        !isAllowedValue(context.entrySurface, CREATOR_FUNNEL_ENTRY_SURFACES)
      ) {
        return;
      }

      transport(event, {
        funnel_version: context.funnelVersion,
        entry_surface: context.entrySurface,
        ...properties,
      });
    } catch {
      // A telemetry failure must never prevent the creator action from
      // succeeding. The transport remains deliberately best-effort.
    }
  }

  return {
    createStarted(context) {
      emit("creator_outlet_create_started", context);
    },

    draftCreated(input) {
      emit("creator_outlet_draft_created", input, {
        has_description: input.hasDescription === true,
        has_logo: input.hasLogo === true,
      });
    },

    firstGameAdded(input) {
      if (!isAllowedValue(input.selectionSurface, SELECTION_SURFACES)) return;
      emit("creator_outlet_first_game_added", input, {
        selection_surface: input.selectionSurface,
      });
    },

    brandComplete(context) {
      emit("creator_outlet_brand_complete", context, {
        criteria_version: BRAND_CRITERIA_VERSION,
      });
    },

    previewed(input) {
      if (!isAllowedValue(input.outletState, OUTLET_STATES)) return;
      emit("creator_outlet_previewed", input, {
        outlet_state: input.outletState,
      });
    },

    published(context) {
      emit("creator_outlet_published", context, {
        readiness_version: CREATOR_OUTLET_PUBLISH_READINESS_VERSION,
      });
    },

    linkCopied(input) {
      if (!isAllowedValue(input.copyContext, COPY_CONTEXTS)) return;
      emit("creator_outlet_link_copied", input, {
        copy_context: input.copyContext,
      });
    },
  };
}

const vercelTransport: CreatorFunnelTransport = (event, properties) => {
  // This adapter is consumed by client interaction handlers. Keep accidental
  // SSR calls inert; server-side analytics has a separate Vercel entry point.
  if (typeof window === "undefined") return;
  track(event, properties);
};

export const creatorFunnelAnalytics =
  createCreatorFunnelAnalytics(vercelTransport);
