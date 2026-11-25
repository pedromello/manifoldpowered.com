import Image from "next/image";
import { Gift } from "lucide-react";
import { useI18n } from "lib/i18n";

export const giftCardArtwork: Record<
  string,
  { title: string; platform: string; image: string; imageClass: string }
> = {
  "sandbox-brl-25": {
    title: "Nintendo eShop",
    platform: "Nintendo Switch",
    image: "/gift-cards/nintendo-eshop.webp",
    imageClass: "!left-[-260%] !top-[-100%] !h-auto !w-[500%] !max-w-none",
  },
  "sandbox-brl-50": {
    title: "PlayStation Store",
    platform: "PlayStation",
    image: "/gift-cards/playstation.jpg",
    imageClass: "object-cover object-right",
  },
  "sandbox-brl-100": {
    title: "Steam",
    platform: "PC · Mac · Linux",
    image: "/gift-cards/steam-logo.png",
    imageClass: "object-contain p-5",
  },
};

export function GiftCardArtwork({
  productCode,
  sizes,
}: {
  productCode: string;
  sizes: string;
}) {
  const { t } = useI18n();
  const artwork = giftCardArtwork[productCode];
  return artwork ? (
    <Image
      src={artwork.image}
      alt={t("Illustrative gift card artwork") + " · " + artwork.title}
      fill
      sizes={sizes}
      className={artwork.imageClass}
    />
  ) : (
    <div className="flex h-full items-center justify-center text-white/40">
      <Gift size={48} aria-hidden="true" />
    </div>
  );
}
