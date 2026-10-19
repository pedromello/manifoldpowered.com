import type { GameApi } from "components/store/types";
import { DiscountBadge } from "components/store/DiscountBadge";
import { catalogOffer } from "lib/catalog-offer";
import { formatCatalogPrice, formatCatalogBasePrice } from "lib/price";
import { useI18n } from "lib/i18n";

export function GamePriceBlock({
  game,
  compact = false,
}: {
  game: GameApi;
  compact?: boolean;
}) {
  const { t, locale } = useI18n();
  const offer = catalogOffer(game);
  const recorded = offer.state === "stale" || offer.state === "unknown";
  const provider =
    game.purchase_mode === "STEAM_ONLY"
      ? "Steam"
      : game.purchase_mode === "NINTENDO_ONLY"
        ? "Nintendo eShop"
        : game.purchase_mode === "PLATFORM"
          ? "Manifold"
          : null;
  const price =
    offer.state === "unavailable"
      ? t("Price unavailable")
      : t(formatCatalogPrice(game));
  return (
    <div
      data-catalog-price
      className={`flex min-w-0 flex-col gap-1 ${compact ? "text-right" : ""}`}
    >
      <div
        className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${compact ? "justify-end" : ""}`}
      >
        {offer.discount_percent !== null && (
          <>
            <span className="whitespace-nowrap text-xs text-sf-muted line-through">
              {formatCatalogBasePrice(game)}
            </span>
            <DiscountBadge label={`-${offer.discount_percent}%`} flat />
          </>
        )}
        <span
          className={`whitespace-nowrap font-black text-sf-fg ${compact ? "text-base" : "text-xl"}`}
        >
          {price}
        </span>
      </div>
      {provider && (
        <span className="text-xs text-sf-muted">
          {provider}
          {recorded && <> · {t("Recorded price")}</>}
        </span>
      )}
      {recorded &&
        offer.captured_at &&
        Number.isFinite(Date.parse(offer.captured_at)) && (
          <time dateTime={offer.captured_at} className="text-xs text-sf-muted">
            {t("Checked {date}", {
              date: new Intl.DateTimeFormat(locale, {
                dateStyle: "short",
                timeZone: "UTC",
              }).format(new Date(offer.captured_at)),
            })}
          </time>
        )}
    </div>
  );
}
