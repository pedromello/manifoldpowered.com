import type { ReactNode } from "react";

import { StoreHomeLayout } from "components/store/StoreHomeLayout";
import { StoreLayout } from "components/store/StoreLayout";
import type { StoreContext } from "components/storefront/types";
import { resolveStorefront } from "storefronts/registry";

/**
 * Chooses the public route shell from the explicit storefront registration.
 *
 * Standard Outlets share Manifold's navigation and responsive shell. Only an
 * Outlet present in the custom registry keeps the theme-aware shell. Keeping
 * this decision beside the layouts prevents a route from treating the mere
 * presence of a slug as evidence that an Outlet is custom.
 */
export function StorefrontRouteLayout({
  children,
  store,
}: {
  children: ReactNode;
  store: StoreContext;
}) {
  const resolution = resolveStorefront(store);

  if (resolution.kind === "standard") {
    return <StoreHomeLayout>{children}</StoreHomeLayout>;
  }

  return (
    <StoreLayout
      store={{ slug: store.slug, name: store.name, logo_url: store.logo_url }}
    >
      {children}
    </StoreLayout>
  );
}
