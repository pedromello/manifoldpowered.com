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
  isDemo,
  isInLibrary,
  isRedeeming,
  onRedeem,
  wishlist,
}: {
  game: GameDetailApi;
  isDemo: boolean;
  isInLibrary: boolean;
  isRedeeming: boolean;
  onRedeem: () => void;
  wishlist: ItemWishlist;
}) {
  const router = useRouter();

  return (
    <div className="p-8 rounded-[2.5rem] bg-white/5 border border-white/10 backdrop-blur-xl sticky top-28 shadow-2xl">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            {!isDemo && formatBasePrice(game) && (
              <span className="text-xl font-bold text-white/30 line-through">
                {formatBasePrice(game)}
              </span>
            )}
            <span
              className="text-4xl md:text-5xl font-black uppercase"
              style={{ color: discountBadgeColor }}
            >
              {isDemo ? "Free" : formatPrice(game)}
            </span>
          </div>
          {!isDemo && game.discount_label && (
            <DiscountBadge label={game.discount_label} />
          )}
        </div>

        {isInLibrary ? (
          <button
            onClick={() => router.push("/library")}
            className="w-full py-5 rounded-2xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 text-xl font-black uppercase tracking-wider hover:bg-indigo-500/30 cursor-pointer transition-all shadow-[0_20px_40px_rgba(99,102,241,0.1)]"
          >
            In Library
          </button>
        ) : (
          <button
            onClick={onRedeem}
            disabled={isRedeeming}
            className="w-full py-5 rounded-2xl bg-white text-black text-xl font-black uppercase tracking-wider hover:bg-white/90 hover:scale-[1.02] active:scale-[0.98] cursor-pointer disabled:cursor-not-allowed transition-all shadow-[0_20px_40px_rgba(255,255,255,0.1)] disabled:opacity-70 disabled:hover:scale-100"
          >
            {isRedeeming ? "Redeeming..." : isDemo ? "Redeem Demo" : "Redeem"}
          </button>
        )}

        {game.social_links.steam_page ? (
          <a
            href={game.social_links.steam_page}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-4 rounded-2xl flex items-center justify-center gap-3 border border-[#3b5e78]/50 bg-gradient-to-r from-[#2a475e] to-[#171d24] text-white hover:from-[#3b5e78] hover:to-[#1b2838] hover:scale-[1.02] active:scale-[0.98] cursor-pointer transition-all duration-300 font-bold uppercase tracking-wider group shadow-[0_10px_30px_rgba(0,0,0,0.3)]"
          >
            <IconBrandSteam
              size={24}
              className="group-hover:scale-110 transition-transform"
            />
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
            className={`w-full py-4 rounded-2xl flex items-center justify-center gap-3 border transition-all duration-300 font-bold uppercase tracking-wider cursor-pointer disabled:cursor-not-allowed ${
              wishlist.isWishlisted
                ? "bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20"
                : "bg-white/5 border-white/10 text-white hover:bg-white/10 hover:border-white/20"
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
            <span className="text-white/40 font-bold uppercase tracking-widest">
              Developer
            </span>
            <span className="text-white font-black">{game.developer_name}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/40 font-bold uppercase tracking-widest">
              Release Date
            </span>
            <span className="text-white font-black">
              {new Date(game.launch_date).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <h4 className="text-xs font-black uppercase tracking-widest text-white/30 mb-1">
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
          <h4 className="text-xs font-black uppercase tracking-widest text-white/30 mb-1">
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
