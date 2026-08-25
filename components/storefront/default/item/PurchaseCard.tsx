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
import { formatBasePrice, formatPrice } from "lib/price";
import type { GameDetailApi } from "components/store/types";
import type { ItemWishlist } from "components/storefront/useItemController";

export function PurchaseCard({
  game,
  isFreeGame,
  isInLibrary,
  isCheckingLibrary,
  isRedeeming,
  acquisitionError,
  onRedeem,
  wishlist,
}: {
  game: GameDetailApi;
  isFreeGame: boolean;
  isInLibrary: boolean;
  isCheckingLibrary: boolean;
  isRedeeming: boolean;
  acquisitionError: string | null;
  onRedeem: () => void;
  wishlist: ItemWishlist;
}) {
  const router = useRouter();

  return (
    <div className="sticky top-24 rounded-xl border border-white/10 bg-[#14101c] p-6">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            {!isFreeGame && formatBasePrice(game) && (
              <span className="text-sm font-semibold text-white/35 line-through">
                {formatBasePrice(game)}
              </span>
            )}
            <span
              className="text-3xl font-black uppercase tracking-tight"
              style={{ color: discountBadgeColor }}
            >
              {isFreeGame ? "Free" : formatPrice(game)}
            </span>
          </div>
          {!isFreeGame && game.discount_label && (
            <DiscountBadge label={game.discount_label} />
          )}
        </div>

        {isInLibrary ? (
          <button
            onClick={() => router.push("/library")}
            className="w-full rounded-lg border border-violet-400/30 bg-violet-500/15 px-5 py-3.5 text-sm font-bold text-violet-200 transition-colors hover:bg-violet-500/25"
          >
            In Library
          </button>
        ) : (
          <button
            onClick={onRedeem}
            disabled={isCheckingLibrary || isRedeeming}
            className="w-full rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-500 px-5 py-3.5 text-sm font-black uppercase tracking-[0.08em] text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isCheckingLibrary
              ? "Checking library..."
              : isRedeeming
                ? isFreeGame
                  ? "Adding..."
                  : "Processing..."
                : isFreeGame
                  ? "Add to Library"
                  : `Buy now · ${formatPrice(game)}`}
          </button>
        )}

        {acquisitionError && (
          <p
            role="alert"
            className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm font-semibold leading-5 text-rose-200"
          >
            {acquisitionError}
          </p>
        )}

        {game.social_links.steam_page ? (
          <a
            href={game.social_links.steam_page}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex w-full items-center justify-center gap-3 rounded-lg border border-white/10 bg-white/[0.035] px-5 py-3 text-xs font-bold uppercase tracking-[0.08em] text-white/75 transition-colors hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
          >
            <IconBrandSteam size={24} className="text-white/65" />
            <span>Add to Wishlist</span>
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
            {wishlist.isWishlisted ? "On Wishlist" : "Add to Wishlist"}
          </button>
        )}

        <div className="h-px bg-white/10" />

        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/35">
              Developer
            </span>
            <span className="text-right text-sm font-semibold text-white/80">
              {game.developer_name}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/35">
              Release Date
            </span>
            <span className="text-sm font-semibold text-white/80">
              {new Date(game.launch_date).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <h4 className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/30">
            Features
          </h4>
          <div className="grid grid-cols-1 gap-2">
            {/* TODO: these three are hardcoded rather than read from
                game.meta_tags. Left as-is here because changing them changes
                what customers see, which does not belong in a refactor. */}
            <MetaTag icon={User} label="Single Player" active={true} />
            <MetaTag icon={Users} label="Multiplayer" active={false} />
            <MetaTag icon={Gamepad2} label="Controller Support" active={true} />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <h4 className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/30">
            Stay Connected
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
              label="Website"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
