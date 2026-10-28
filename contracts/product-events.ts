import { z } from "zod";
import {
  AFFILIATE_KINDS,
  AFFILIATE_MERCHANTS,
  AFFILIATE_PLATFORMS,
} from "./outlet-affiliates";

import { EVENT_BATCH_SIZE } from "./product-event-constants";
export {
  EVENT_BATCH_SIZE,
  EVENT_BODY_BYTES,
  EVENT_PROPERTIES_BYTES,
  EVENT_CONTEXT_HEADER,
} from "./product-event-constants";

const slug = z.string().min(1).max(255);
const commonProperties = z
  .object({
    locale: z.enum(["en", "pt-BR"]),
    entry_surface: z.enum([
      "home",
      "catalog",
      "outlet_page",
      "selection_page",
      "game_page",
    ]),
  })
  .strict();
const base = {
  id: z.uuid(),
  schema_version: z.literal(1),
  client_occurred_at: z.iso.datetime({ offset: true }).optional(),
};
export const clientEventSchema = z.discriminatedUnion("name", [
  z
    .object({
      ...base,
      name: z.literal("public_page_viewed"),
      target: z.object({}).strict(),
      properties: commonProperties
        .extend({ page_kind: z.enum(["home", "catalog"]) })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...base,
      name: z.literal("outlet_viewed"),
      target: z.object({ store_slug: slug }).strict(),
      properties: commonProperties,
    })
    .strict(),
  z
    .object({
      ...base,
      name: z.literal("selection_viewed"),
      target: z
        .object({
          store_slug: slug,
          selection_slug: slug.max(120),
          published_revision: z.number().int().positive(),
        })
        .strict(),
      properties: commonProperties,
    })
    .strict(),
  z
    .object({
      ...base,
      name: z.literal("game_viewed"),
      target: z
        .object({ game_slug: slug, store_slug: slug.optional() })
        .strict(),
      properties: commonProperties,
    })
    .strict(),
  z
    .object({
      ...base,
      name: z.literal("external_store_clicked"),
      target: z
        .object({ game_slug: slug, store_slug: slug.optional() })
        .strict(),
      properties: commonProperties
        .extend({
          provider: z.enum(["steam", "nintendo", "playstation"]),
          placement: z
            .enum(["purchase_card", "social_store_link", "legacy"])
            .optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...base,
      name: z.literal("affiliate_link_clicked"),
      target: z
        .object({
          store_slug: slug,
          game_slug: slug.optional(),
          link_id: z.uuid(),
          published_revision_id: z.uuid(),
        })
        .strict(),
      properties: commonProperties
        .extend({
          merchant: z.enum(AFFILIATE_MERCHANTS),
          kind: z.enum(AFFILIATE_KINDS),
          platform: z.enum(AFFILIATE_PLATFORMS).nullable(),
          media_type: z.enum(["physical", "digital"]).nullable(),
          country: z.literal("BR"),
          placement: z.enum([
            "outlet_links",
            "purchase_primary",
            "purchase_alternative",
          ]),
        })
        .strict(),
    })
    .strict(),
]);
export type ClientProductEvent = z.infer<typeof clientEventSchema>;
export type ClientEventInput = ClientProductEvent extends infer E
  ? E extends ClientProductEvent
    ? Omit<E, "id" | "schema_version" | "client_occurred_at">
    : never
  : never;

export const eventEnvelopeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("bootstrap") }).strict(),
  // Semantic event validation follows the independently committed quota.
  z
    .object({
      type: z.literal("events"),
      context_generation: z.string().max(100).optional(),
      events: z.array(z.unknown()).min(1).max(EVENT_BATCH_SIZE),
    })
    .strict(),
]);
export const SERVER_EVENT_NAMES = [
  "outlet_followed",
  "outlet_unfollowed",
  "game_wishlisted",
  "game_unwishlisted",
] as const;
export type ServerEventName = (typeof SERVER_EVENT_NAMES)[number];
