import { PlatformStorefrontHome } from "components/storefront/default/PlatformStorefrontHome";
import type { DefaultStorefrontProps } from "components/storefront/types";

export type DefaultStorefrontViewProps = DefaultStorefrontProps;

/**
 * Manifold's public storefront design, shared by the platform home and every
 * Outlet without an explicit custom registration.
 *
 * It is a view: everything it renders arrives as props from
 * `useStorefrontController`. That is deliberate — it makes this file the
 * reference implementation of the storefront contract, so a custom outlet's
 * component can be read side by side with it.
 */
export function DefaultStorefront(props: DefaultStorefrontViewProps) {
  return <PlatformStorefrontHome {...props} />;
}
