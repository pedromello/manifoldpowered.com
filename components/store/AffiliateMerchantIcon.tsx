import { IconBrandAmazon } from "@tabler/icons-react";
import type { AffiliateMerchant } from "contracts/outlet-affiliates";

/** Merchant assets are frozen official site favicons; no third-party request on render. */
export function AffiliateMerchantIcon({
  merchant,
  size = 22,
}: {
  merchant: AffiliateMerchant;
  size?: number;
}) {
  if (merchant === "amazon")
    return (
      <IconBrandAmazon size={size} aria-hidden="true" className="shrink-0" />
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/images/affiliate-merchants/${merchant === "mercado_livre" ? "mercado-livre" : "nuuvem"}.ico`}
      alt=""
      width={size}
      height={size}
      className="shrink-0 object-contain"
    />
  );
}
