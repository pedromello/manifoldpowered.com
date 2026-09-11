import { z } from "zod";
import { Prisma } from "generated/prisma/client";
import { prisma } from "infra/database";
import nintendo, { type NintendoProduct } from "infra/nintendo";
import {
  NotFoundError,
  ServiceError,
  TooManyRequestsError,
  UnsupportedContentError,
  ValidationError,
} from "infra/errors";
import { parseNintendoUrl, type NintendoCountry } from "lib/nintendo";
import { mergeGameFeatures, nintendoFeatures } from "lib/game_features";
import * as refresh from "models/nintendo_refresh";

export interface NintendoGateway {
  fetchProduct(
    slug: string,
    country: NintendoCountry,
  ): Promise<NintendoProduct>;
}

function label(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  const parsed = z
    .object({ label: z.string().optional(), name: z.string().optional() })
    .safeParse(value);
  return parsed.success ? (parsed.data.label ?? parsed.data.name) : undefined;
}

function imageUrl(asset: { publicId: string } | null | undefined) {
  const id = asset?.publicId.replace(/^\//, "");
  if (!id || !/^store\/software\/(switch|switch2)\/[a-zA-Z0-9/_-]+$/.test(id))
    return undefined;
  return `https://assets.nintendo.com/image/upload/q_auto/f_auto/${id}`;
}

function localization(product: NintendoProduct) {
  return {
    locale: product.country === "BR" ? "pt-BR" : "en",
    title: product.name,
    description: (
      product.headline ||
      product.description ||
      product.name
    ).slice(0, 300),
    // Plain text only; imported HTML never reaches the Markdown renderer.
    detailed_description: (product.description || product.name)
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;"),
    source: "NINTENDO" as const,
  };
}

export async function importGame({
  userId,
  eshopUrl,
  isAdmin = false,
  gateway = nintendo,
}: {
  userId: string;
  eshopUrl: string;
  isAdmin?: boolean;
  gateway?: NintendoGateway;
}) {
  const input = parseNintendoUrl(eshopUrl);
  if (!input)
    throw new ValidationError({
      message: "Invalid Nintendo eShop link.",
      action: "Copy a Brazilian or US product page link from www.nintendo.com.",
    });
  const attempt = await prisma.$transaction(async (tx) => {
    if (!isAdmin) {
      await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${`nintendo-user:${userId}`}))) AS user_lock`;
      const count = await tx.nintendoImportAttempt.count({
        where: {
          user_id: userId,
          created_at: { gte: new Date(Date.now() - 3600000) },
        },
      });
      if (count >= 20)
        throw new TooManyRequestsError({
          message: "Nintendo import limit exceeded.",
          action: "Wait before importing another Nintendo game.",
        });
    }
    return tx.nintendoImportAttempt.create({
      data: { user_id: userId, url: input.url },
    });
  });
  const reservation = await refresh
    .reserve(input.slug, input.country)
    .catch(async (error: unknown) => {
      await prisma.nintendoImportAttempt.update({
        where: { id: attempt.id },
        data: { outcome: "CAPACITY_UNAVAILABLE" },
      });
      throw error;
    });
  if (!reservation.acquired) {
    await prisma.nintendoImportAttempt.update({
      where: { id: attempt.id },
      data: {
        outcome:
          reservation.row.state === "RUNNING"
            ? "SHARED_IN_PROGRESS"
            : reservation.row.state === "FAILED"
              ? "CACHED_FAILURE"
              : "CACHE_HIT",
      },
    });
    if (reservation.row.state === "FAILED")
      throw refresh.failure(reservation.row);
    return {
      game: reservation.game,
      created: false,
      refresh: refresh.metadata(reservation.row, true),
    };
  }
  const countries: NintendoCountry[] = [
    input.country,
    input.country === "BR" ? "US" : "BR",
  ];
  const results = await Promise.allSettled(
    countries.map((country) => gateway.fetchProduct(input.slug, country)),
  );
  const outcomes: Record<string, string> = {};
  results.forEach((result, index) => {
    outcomes[countries[index]] =
      result.status === "fulfilled"
        ? "SUCCESS"
        : result.reason instanceof ServiceError &&
            typeof result.reason.context === "string"
          ? result.reason.context
          : result.reason instanceof Error
            ? result.reason.name
            : "ServiceError";
  });
  try {
    // Never turn a submitted DLC/upgrade into a different product in another region.
    if (
      results[0].status === "rejected" &&
      results[0].reason instanceof UnsupportedContentError
    )
      throw results[0].reason;
    const products = results.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );
    if (!products.length) {
      const first = results.find(
        (result) =>
          result.status === "rejected" &&
          !(result.reason instanceof NotFoundError),
      );
      if (first?.status === "rejected") throw first.reason;
      throw new NotFoundError({
        message: "Nintendo game not found.",
        action: "Check the product link and try again.",
      });
    }
    const selected = products[0];
    const matching = products.filter((product) => {
      if (product.nsuid === selected.nsuid) return true;
      outcomes[product.country] = "IDENTITY_MISMATCH";
      return false;
    });
    const primary =
      matching.find((product) => product.country === "BR") ?? selected;
    const imported = await prisma.$transaction(async (tx) => {
      await refresh.fence(tx, reservation.row);
      await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${`nintendo-game:${selected.nsuid}`}))) AS game_lock`;
      const existing = await tx.game.findUnique({
        where: { nintendo_nsuid: selected.nsuid },
      });
      const copy = localization(primary);
      const banner = imageUrl(primary.productImage);
      const screenshots = (primary.productGallery ?? [])
        .filter((asset) => asset.resourceType === "image")
        .flatMap((asset) => (imageUrl(asset) ? [imageUrl(asset)!] : []));
      const data = {
        title: copy.title,
        description: copy.description,
        detailed_description: copy.detailed_description,
        launch_date: primary.releaseDate
          ? new Date(primary.releaseDate)
          : (existing?.launch_date ?? null),
        developer_name: (
          label(primary.softwareDeveloper) ||
          label(primary.softwarePublisher) ||
          "Unknown developer"
        ).slice(0, 255),
        publisher_name: label(primary.softwarePublisher)?.slice(0, 255) ?? null,
        tags: [
          ...new Set([
            primary.platform.label,
            ...(primary.tags?.genres ?? []).map((genre) => genre.label),
          ]),
        ],
        meta_tags: {
          features: matching
            .filter((product) => product !== primary)
            .concat(primary)
            .reduce(
              (features, product) =>
                mergeGameFeatures(
                  { features },
                  nintendoFeatures(product.numberOfPlayers),
                ),
              mergeGameFeatures(existing?.meta_tags, {}),
            ),
          platforms: [primary.platform.label],
          languages: primary.supportedLanguages ?? [],
          ...(label(primary.contentRating)
            ? { rating: label(primary.contentRating) }
            : {}),
        },
        media: {
          ...(banner ? { banner, icon: banner } : {}),
          screenshots,
          videos: [],
        },
      };
      const slugBase =
        primary.name
          .toLowerCase()
          .normalize("NFKD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 200) || "nintendo-game";
      const saved = existing
        ? await tx.game.update({ where: { id: existing.id }, data })
        : await tx.game.create({
            data: {
              ...data,
              nintendo_nsuid: selected.nsuid,
              slug: `${slugBase}-${primary.platform.code === "NINTENDO_SWITCH_2" ? "switch-2" : "switch"}-${selected.nsuid}`,
              status: "ONLY_DISPLAY",
              studio_id: null,
              publisher_id: null,
              price: 0,
              base_price: null,
            },
          });
      for (const product of matching) {
        const copy = localization(product);
        await tx.gameLocalization.upsert({
          where: { game_id_locale: { game_id: saved.id, locale: copy.locale } },
          create: { ...copy, game_id: saved.id },
          update: copy,
        });
        const key = {
          game_id: saved.id,
          provider: "NINTENDO",
          country: product.country,
        };
        const existingOffer = await tx.gameExternalOffer.findUnique({
          where: { game_id_provider_country: key },
        });
        // A missing price is not free, and must not erase the last valid capture.
        if (!product.prices && existingOffer) continue;
        const amount = product.prices
          ? new Prisma.Decimal(product.prices.finalPrice.toString())
          : null;
        const original = product.prices
          ? new Prisma.Decimal(product.prices.regularPrice.toString())
          : null;
        const offer = {
          ...key,
          url: product.url,
          currency: product.country === "BR" ? "BRL" : "USD",
          amount,
          original_amount: original,
          captured_at: new Date(),
          discount_percent:
            amount && original?.gt(0) && amount.lt(original)
              ? original.minus(amount).div(original).mul(100).round().toNumber()
              : null,
        };
        await tx.gameExternalOffer.upsert({
          where: { game_id_provider_country: key },
          create: offer,
          update: offer,
        });
      }
      // Alphabetical catalog queries use localization rows. Keep a fallback
      // row for missing languages without replacing a previously fetched text.
      for (const locale of ["en", "pt-BR"]) {
        if (matching.some((product) => localization(product).locale === locale))
          continue;
        await tx.gameLocalization.upsert({
          where: { game_id_locale: { game_id: saved.id, locale } },
          create: { ...copy, locale, source: "FALLBACK", game_id: saved.id },
          update: {},
        });
      }
      const completed = await refresh.complete(
        tx,
        reservation.row,
        saved,
        outcomes,
        input.slug,
        input.country,
      );
      return {
        game: saved,
        created: !existing,
        refresh: refresh.metadata(completed),
      };
    });
    await prisma.nintendoImportAttempt.update({
      where: { id: attempt.id },
      data: { outcome: "SUCCESS", regional_outcomes: outcomes },
    });
    return imported;
  } catch (error) {
    const reported =
      error instanceof NotFoundError ||
      error instanceof ServiceError ||
      error instanceof UnsupportedContentError ||
      error instanceof ValidationError
        ? error
        : new ServiceError({
            message: "Nintendo import failed.",
            action: "Try again later.",
            cause: error,
          });
    await refresh.fail(reservation.row, reported, outcomes);
    await prisma.nintendoImportAttempt.update({
      where: { id: attempt.id },
      data: {
        outcome:
          error instanceof Error ? error.name.slice(0, 32) : "ServiceError",
        regional_outcomes: outcomes,
      },
    });
    throw reported;
  }
}

const nintendoImport = { importGame };
export default nintendoImport;
