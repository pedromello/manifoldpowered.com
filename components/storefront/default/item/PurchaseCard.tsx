import { useRouter } from "next/router";
import {
  Users,
  User,
  Gamepad2,
  Globe,
  ExternalLink,
  MessageSquare,
  Heart,
} from "lucide-react";
import { IconBrandX, IconBrandSteam } from "@tabler/icons-react";

import { DiscountBadge } from "components/store/DiscountBadge";
import { MetaTag } from "components/store/MetaTag";
import { SocialLink } from "components/store/SocialLink";
import { discountBadgeColor } from "components/store/constants";
import {
  catalogDiscountLabel,
  formatCatalogBasePrice,
  formatCatalogPrice,
  isCatalogFree,
} from "lib/price";
import type { GameDetailApi } from "components/store/types";
import type { ItemWishlist } from "components/storefront/useItemController";
import { useI18n } from "lib/i18n";

export function PurchaseCard({
  game,
  isFreeGame,
  isInLibrary,
  isCheckingLibrary,
  isRedeeming,
  acquisitionError,
  onRedeem,
  wishlist,
  visitorPreview = false,
}: {
  game: GameDetailApi;
  isFreeGame: boolean;
  isInLibrary: boolean;
  isCheckingLibrary: boolean;
  isRedeeming: boolean;
  acquisitionError: string | null;
  onRedeem: () => void;
  wishlist: ItemWishlist;
  visitorPreview?: boolean;
}) {
  const router = useRouter();
  const { locale, t } = useI18n();
  const isPlatformPurchase = game.purchase_mode === "PLATFORM";
  const free = isCatalogFree(game);
  const basePrice = formatCatalogBasePrice(game);
  const discountLabel = catalogDiscountLabel(game);
  const hasDisplayedPrice =
    isPlatformPurchase || game.external_offer?.amount !== null;

  return (
    <div className="sticky top-24 rounded-xl border border-white/10 bg-[#14101c] p-6">
      <div className="flex flex-col gap-6">
        {hasDisplayedPrice && (
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              {!free && basePrice && (
                <span className="text-sm font-semibold text-white/35 line-through">
                  {basePrice}
                </span>
              )}
              <span
                className="text-3xl font-black uppercase tracking-tight"
                style={{ color: discountBadgeColor }}
              >
                {free ? t("Free") : formatCatalogPrice(game)}
              </span>
            </div>
            {!free && discountLabel && <DiscountBadge label={discountLabel} />}
          </div>
        )}

        {visitorPreview && (
          <p
            role="status"
            className="rounded-lg border border-violet-300/20 bg-violet-300/[0.07] px-4 py-3 text-sm font-semibold leading-5 text-violet-100"
          >
            {t("Purchases and account actions are disabled in preview.")}
          </p>
        )}

        {!visitorPreview &&
          isPlatformPurchase &&
          (isInLibrary ? (
            <button
              onClick={() => router.push("/library")}
              className="w-full rounded-lg border border-violet-400/30 bg-violet-500/15 px-5 py-3.5 text-sm font-bold text-violet-200 transition-colors hover:bg-violet-500/25"
            >
              {t("In Library")}
            </button>
          ) : (
            <button
              onClick={onRedeem}
              disabled={isCheckingLibrary || isRedeeming}
              className="w-full rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-500 px-5 py-3.5 text-sm font-black uppercase tracking-[0.08em] text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isCheckingLibrary
                ? t("Checking library...")
                : isRedeeming
                  ? isFreeGame
                    ? t("Adding...")
                    : t("Processing...")
                  : isFreeGame
                    ? t("Add to Library")
                    : t("Buy now · {price}", {
                        price: formatCatalogPrice(game),
                      })}
            </button>
          ))}

        {!visitorPreview && isPlatformPurchase && acquisitionError && (
          <p
            role="alert"
            className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm font-semibold leading-5 text-rose-200"
          >
            {acquisitionError}
          </p>
        )}

        {!visitorPreview &&
          (game.social_links.steam_page ? (
            <a
              href={game.social_links.steam_page}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex w-full items-center justify-center gap-3 rounded-lg border border-white/10 bg-white/[0.035] px-5 py-3 text-xs font-bold uppercase tracking-[0.08em] text-white/75 transition-colors hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
            >
              <IconBrandSteam size={24} className="text-white/65" />
              <span>{t("View on Steam")}</span>
              <ExternalLink
                size={16}
                className="opacity-60 group-hover:opacity-100 transition-opacity"
              />
            </a>
          ) : (
            <button
              onClick={wishlist.toggle}
              disabled={wishlist.isToggling}
              className={`flex w-full items-center justify-center gap-3 rounded-lg border px-5 py-3 text-xs font-bold uppercase tracking-[0.08em] transition-colors disabled:cursor-not-allowed ${
                wishlist.isWishlisted
                  ? "border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/15"
                  : "border-white/10 bg-white/[0.035] text-white/75 hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
              }`}
            >
              <Heart
                size={20}
                fill={wishlist.isWishlisted ? "currentColor" : "none"}
                className={wishlist.isToggling ? "opacity-50" : ""}
              />
              {wishlist.isWishlisted ? t("On Wishlist") : t("Add to Wishlist")}
            </button>
          ))}

        <div className="h-px bg-white/10" />

        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/35">
              {t("Developer")}
            </span>
            <span className="text-right text-sm font-semibold text-white/80">
              {game.developer_name}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/35">
              {t("Release Date")}
            </span>
            <span className="text-sm font-semibold text-white/80">
              {new Date(game.launch_date).toLocaleDateString(locale, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <h4 className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/30">
            {t("Features")}
          </h4>
          <div className="grid grid-cols-1 gap-2">
            {/* TODO: these three are hardcoded rather than read from
                game.meta_tags. Left as-is here because changing them changes
                what customers see, which does not belong in a refactor. */}
            <MetaTag icon={User} label={t("Single Player")} active={true} />
            <MetaTag icon={Users} label={t("Multiplayer")} active={false} />
            <MetaTag
              icon={Gamepad2}
              label={t("Controller Support")}
              active={true}
            />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <h4 className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/30">
            {t("Stay Connected")}
          </h4>
          <div className="grid grid-cols-2 gap-2">
            <SocialLink
              icon={IconBrandX}
              href={game.social_links.twitter}
              label="X"
            />
            <SocialLink
              icon={IconBrandSteam}
              href={game.social_links.steam_page}
              label="Steam"
            />
            <SocialLink
              icon={MessageSquare}
              href={game.social_links.discord}
              label="Discord"
            />
            <SocialLink
              icon={Globe}
              href={game.social_links.website}
              label={t("Website")}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
