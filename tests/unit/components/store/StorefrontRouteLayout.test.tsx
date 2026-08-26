import { renderToStaticMarkup } from "react-dom/server";

import { StorefrontRouteLayout } from "components/store/StorefrontRouteLayout";
import type { StoreContext } from "components/storefront/types";

jest.mock("components/store/StoreHomeLayout", () => ({
  StoreHomeLayout: ({ children }) => (
    <div data-testid="platform-layout">{children}</div>
  ),
}));

jest.mock("components/store/StoreLayout", () => ({
  StoreLayout: ({ children, store }) => (
    <div data-testid="custom-layout" data-store-slug={store?.slug}>
      {children}
    </div>
  ),
}));

function store(slug: string): StoreContext {
  return {
    id: `id-${slug}`,
    slug,
    name: slug,
    description: null,
    logo_url: null,
  };
}

describe("StorefrontRouteLayout", () => {
  test("renders an ordinary Outlet inside the same platform shell as /store", () => {
    const markup = renderToStaticMarkup(
      <StorefrontRouteLayout store={store("outlet-teste-1")}>
        <span>ordinary Outlet</span>
      </StorefrontRouteLayout>,
    );

    expect(markup).toContain('data-testid="platform-layout"');
    expect(markup).not.toContain('data-testid="custom-layout"');
  });

  test("keeps an explicitly registered Outlet inside the custom shell", () => {
    const markup = renderToStaticMarkup(
      <StorefrontRouteLayout store={store("strategos-void")}>
        <span>custom Outlet</span>
      </StorefrontRouteLayout>,
    );

    expect(markup).toContain('data-testid="custom-layout"');
    expect(markup).toContain('data-store-slug="strategos-void"');
    expect(markup).not.toContain('data-testid="platform-layout"');
  });
});
