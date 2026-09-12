import { Prisma, type Game } from "generated/prisma/client";
import { ValidationError } from "infra/errors";
import { mergeGameFeatures } from "lib/game_features";
import type { StoreSnapshot } from "./contracts";

type LegacyPriceColumns = Pick<
  Prisma.GameUncheckedCreateInput,
  | "steam_price"
  | "steam_original_price"
  | "steam_discount_percent"
  | "steam_price_currency"
  | "steam_price_captured_at"
>;

/** Adapters preserve deployed identity columns and price contracts without exposing them to strategies. */
export interface StorePersistenceBinding {
  source: "STEAM" | "NINTENDO";
  identity(
    externalId: string,
  ): { steam_app_id: string } | { nintendo_nsuid: string };
  lock?(tx: Prisma.TransactionClient, externalId: string): Promise<unknown>;
  canRefresh(game: Game): boolean;
  updateCondition?: Pick<Prisma.GameWhereInput, "status" | "studio_id">;
  legacyPrices?(
    snapshot: StoreSnapshot,
    previous: Game | null,
  ): LegacyPriceColumns;
  fallbackLocales: string[];
  fallbackOnRefresh: boolean;
  createUnknownOffersOnRefresh: boolean;
  preserveVideosWhenMissing?: boolean;
}

export function preserveMissingVideos(
  media: Prisma.InputJsonObject,
  previous: Prisma.JsonValue | undefined,
) {
  if (
    !Array.isArray(media.videos) ||
    media.videos.length > 0 ||
    !previous ||
    typeof previous !== "object" ||
    Array.isArray(previous)
  )
    return media;
  const videos = previous.videos;
  return Array.isArray(videos) && videos.every((url) => typeof url === "string")
    ? { ...media, videos }
    : media;
}

export function createStorePersistence(binding: StorePersistenceBinding) {
  return async function persist(
    tx: Prisma.TransactionClient,
    snapshot: StoreSnapshot,
  ) {
    await binding.lock?.(tx, snapshot.externalId);
    const identity = binding.identity(snapshot.externalId);
    const previous = await tx.game.findUnique({ where: identity });
    // Recheck decisions made while the catalog HTTP requests were in flight.
    if (previous && !binding.canRefresh(previous))
      return { game: previous, created: false };
    const fields = snapshot.fields;
    const data = {
      ...fields,
      media: binding.preserveVideosWhenMissing
        ? preserveMissingVideos(fields.media, previous?.media)
        : fields.media,
      launch_date: fields.launch_date ?? previous?.launch_date ?? null,
      meta_tags: {
        ...fields.meta_tags,
        features: mergeGameFeatures(
          previous?.meta_tags,
          fields.meta_tags.features ?? {},
        ),
      },
      ...binding.legacyPrices?.(snapshot, previous),
    };
    if (!previous) {
      const collision = await tx.game.findUnique({
        where: { slug: snapshot.suggestedSlug },
      });
      if (collision)
        throw new ValidationError({
          message: `Game with slug ${collision.slug} already exists. It's title is ${collision.title}.`,
          action: "Try a different title.",
        });
    }
    const saved = previous
      ? await tx.game.update({
          where: { id: previous.id, ...binding.updateCondition },
          data,
        })
      : await tx.game.create({
          data: {
            ...data,
            ...identity,
            slug: snapshot.suggestedSlug,
            status: "ONLY_DISPLAY",
            studio_id: null,
            publisher_id: null,
            price: 0,
            base_price: null,
          },
        });
    for (const offer of snapshot.offers) {
      const key = {
        game_id: saved.id,
        provider: binding.source,
        country: offer.country,
      };
      if (offer.amount === null) {
        if (previous && !binding.createUnknownOffersOnRefresh) continue;
        if (
          await tx.gameExternalOffer.findUnique({
            where: { game_id_provider_country: key },
          })
        )
          continue;
      }
      const data = {
        ...offer,
        ...key,
        amount: offer.amount === null ? null : new Prisma.Decimal(offer.amount),
        original_amount:
          offer.original_amount === null
            ? null
            : new Prisma.Decimal(offer.original_amount),
      };
      await tx.gameExternalOffer.upsert({
        where: { game_id_provider_country: key },
        create: data,
        update: data,
      });
    }
    for (const copy of snapshot.localizations) {
      const data = { ...copy, source: binding.source, game_id: saved.id };
      await tx.gameLocalization.upsert({
        where: { game_id_locale: { game_id: saved.id, locale: copy.locale } },
        create: data,
        update: data,
      });
    }
    if (!previous || binding.fallbackOnRefresh)
      for (const locale of binding.fallbackLocales) {
        if (snapshot.localizations.some((copy) => copy.locale === locale))
          continue;
        await tx.gameLocalization.upsert({
          where: { game_id_locale: { game_id: saved.id, locale } },
          create: {
            game_id: saved.id,
            locale,
            source: "FALLBACK",
            title: fields.title,
            description: fields.description,
            detailed_description: fields.detailed_description,
          },
          update: {},
        });
      }
    return { game: saved, created: !previous };
  };
}
