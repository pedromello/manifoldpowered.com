import { ExternalLink, Gift, Info } from "lucide-react";
import type { ReactNode } from "react";
import { AffiliateMerchantIcon } from "components/store/AffiliateMerchantIcon";
import {
  AFFILIATE_MERCHANT_LABELS,
  AFFILIATE_PLATFORM_LABELS,
  isAffiliateUrl,
  type AffiliateLink,
} from "contracts/outlet-affiliates";
import type { StoreContext } from "components/storefront/types";
import { useI18n } from "lib/i18n";
import { trackAffiliateLink } from "lib/product-events-client";

type DestinationProps = {
  link: AffiliateLink;
  storeSlug: string;
  gameSlug?: string;
  publishedRevisionId?: string | null;
  placement: "outlet_links" | "purchase_primary" | "purchase_alternative";
  isPreview: boolean;
  className: string;
  children: ReactNode;
};

/** A native external link: analytics never participates in the navigation path. */
function AffiliateDestination({
  link,
  storeSlug,
  gameSlug,
  publishedRevisionId,
  placement,
  isPreview,
  className,
  children,
}: DestinationProps) {
  const { locale, t } = useI18n();
  if (isPreview) {
    return (
      <button
        type="button"
        disabled
        className={`${className} cursor-not-allowed opacity-60`}
        title={t("Affiliate links are disabled in preview.")}
      >
        {children}
      </button>
    );
  }
  const track = () => {
    if (!publishedRevisionId) return;
    trackAffiliateLink({
      storeSlug,
      gameSlug,
      link,
      publishedRevisionId,
      placement,
      locale,
    });
  };
  return (
    <a
      href={link.url}
      target="_blank"
      rel="sponsored noopener noreferrer"
      onClick={track}
      onAuxClick={(event) => {
        if (event.button === 1) track();
      }}
      className={className}
    >
      {children}
      <span className="sr-only">{t("(opens in a new tab)")}</span>
    </a>
  );
}

export function OutletAffiliateLinks({
  store,
  isPreview = false,
  align = "start",
}: {
  store: StoreContext;
  isPreview?: boolean;
  align?: "start" | "center";
}) {
  const { t } = useI18n();
  const links = (store.affiliate_links ?? []).filter(
    (link) =>
      link.kind === "storefront" && isAffiliateUrl(link.merchant, link.url),
  );
  if (!links.length) return null;
  return (
    <section
      data-storefront="affiliate-links"
      aria-label={t("Affiliate links")}
      className={`mt-4 border-t border-sf-border pt-4 ${align === "center" ? "text-center" : ""}`}
    >
      <h2 className="mb-2 text-xs font-bold text-sf-fg">
        {t("Affiliate links")}
      </h2>
      <div
        className={`flex flex-wrap gap-2 ${align === "center" ? "justify-center" : ""}`}
      >
        {links.map((link) => (
          <AffiliateDestination
            key={link.id}
            link={link}
            storeSlug={store.slug}
            publishedRevisionId={store.affiliate_revision_id}
            placement="outlet_links"
            isPreview={isPreview}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-sf-border bg-sf-surface px-3 py-2 text-xs font-bold text-sf-fg transition hover:border-sf-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sf-accent motion-reduce:transition-none"
          >
            <AffiliateMerchantIcon merchant={link.merchant} size={22} />
            {AFFILIATE_MERCHANT_LABELS[link.merchant]}
            <ExternalLink
              size={13}
              aria-hidden="true"
              className="text-sf-muted"
            />
          </AffiliateDestination>
        ))}
      </div>
      <p className="mt-2 text-xs leading-5 text-sf-muted">
        {t("The creator may earn a commission on qualifying purchases.")}
      </p>
    </section>
  );
}

export function AffiliatePurchaseOptions({
  links = [],
  storeSlug,
  storeName,
  gameSlug,
  publishedRevisionId,
  isPreview = false,
}: {
  links?: AffiliateLink[];
  storeSlug: string;
  storeName: string;
  gameSlug: string;
  publishedRevisionId?: string | null;
  isPreview?: boolean;
}) {
  const { t } = useI18n();
  const available = links.filter(
    (link) =>
      link.kind !== "storefront" && isAffiliateUrl(link.merchant, link.url),
  );
  const [primary, ...alternatives] = available;
  if (!primary) return null;
  const metadata = (link: AffiliateLink) =>
    [
      link.kind === "gift_card"
        ? t("Gift card")
        : link.media_type === "physical"
          ? t("Physical game")
          : t("Digital game"),
      link.platform ? AFFILIATE_PLATFORM_LABELS[link.platform] : null,
      t("Brazil"),
    ]
      .filter(Boolean)
      .join(" · ");
  const hasGiftCards = available.some((link) => link.kind === "gift_card");
  return (
    <section
      aria-label={t("Support {name}", { name: storeName })}
      data-storefront="affiliate-purchase"
      className="rounded-xl border border-violet-400/35 bg-violet-500/[0.06] p-4 sm:p-5"
    >
      <h3 className="flex items-center gap-2 text-lg font-black text-white">
        <Gift
          size={21}
          className="shrink-0 text-violet-300"
          aria-hidden="true"
        />
        {t("Support {name}", { name: storeName })}
      </h3>
      <p className="mt-2 text-xs leading-5 text-white/60">
        {t("The creator may earn a commission on qualifying purchases.")}
      </p>
      <AffiliateDestination
        link={primary}
        storeSlug={storeSlug}
        gameSlug={gameSlug}
        publishedRevisionId={publishedRevisionId}
        placement="purchase_primary"
        isPreview={isPreview}
        className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-3 py-3 text-center text-sm font-bold text-white transition hover:bg-violet-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300 motion-reduce:transition-none"
      >
        <AffiliateMerchantIcon merchant={primary.merchant} size={24} />
        <span>
          {t(
            primary.kind === "gift_card"
              ? "Buy a gift card at {store}"
              : "Buy at {store}",
            { store: AFFILIATE_MERCHANT_LABELS[primary.merchant] },
          )}
        </span>
        <ExternalLink size={15} aria-hidden="true" className="shrink-0" />
      </AffiliateDestination>
      <p className="mt-2 text-center text-xs leading-5 text-white/65">
        {metadata(primary)}
      </p>
      {primary.label && (
        <p className="mt-1 break-words text-center text-xs text-white/60">
          {primary.label}
        </p>
      )}
      {alternatives.length > 0 && (
        <div className="mt-5 space-y-2">
          <h4 className="text-xs font-bold text-white/80">
            {t("Other options")}
          </h4>
          {alternatives.map((link) => (
            <AffiliateDestination
              key={link.id}
              link={link}
              storeSlug={storeSlug}
              gameSlug={gameSlug}
              publishedRevisionId={publishedRevisionId}
              placement="purchase_alternative"
              isPreview={isPreview}
              className="flex min-h-12 w-full items-center gap-3 rounded-lg border border-white/10 bg-white/[0.035] p-3 text-white/80 transition hover:border-violet-300/40 hover:bg-white/[0.07] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300 motion-reduce:transition-none"
            >
              <AffiliateMerchantIcon merchant={link.merchant} size={23} />
              <span className="min-w-0 flex-1 text-left">
                <span className="block text-xs font-bold">
                  {AFFILIATE_MERCHANT_LABELS[link.merchant]}
                </span>
                <span className="mt-0.5 block text-[11px] leading-4 text-white/60">
                  {metadata(link)}
                </span>
                {link.label && (
                  <span className="mt-0.5 block break-words text-[11px] text-white/60">
                    {link.label}
                  </span>
                )}
              </span>
              <ExternalLink size={14} aria-hidden="true" className="shrink-0" />
            </AffiliateDestination>
          ))}
        </div>
      )}
      {hasGiftCards && (
        <p className="mt-4 flex gap-2 text-xs leading-5 text-white/60">
          <Info size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            {t("Gift card: buy credit and redeem the game later.")}{" "}
            {t(
              "Gift cards are for Brazil. Check your account region before buying.",
            )}
          </span>
        </p>
      )}
      {isPreview && (
        <p className="mt-3 text-xs text-violet-200/80">
          {t("Affiliate links are disabled in preview.")}
        </p>
      )}
    </section>
  );
}
