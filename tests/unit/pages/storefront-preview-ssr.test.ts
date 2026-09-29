import type { GetServerSidePropsContext } from "next";

import { getServerSideProps as getItemServerSideProps } from "pages/item/[slug]";
import { getServerSideProps as getStoreServerSideProps } from "pages/store/[slug]";

jest.mock("components/storefront/default/item/DefaultItemPage", () => ({
  DefaultItemPage: () => null,
}));

jest.mock("storefronts/registry", () => ({
  resolveStorefront: jest.fn(),
}));

function previewContext() {
  const headers = new Map<string, string | number | readonly string[]>();
  headers.set("Vary", "Accept-Encoding");

  const setHeader = jest.fn(
    (name: string, value: string | number | readonly string[]) => {
      headers.set(name, value);
    },
  );
  const getHeader = jest.fn((name: string) => headers.get(name));

  return {
    context: {
      query: { preview: "1" },
      params: {},
      req: { headers: {} },
      res: { setHeader, getHeader },
      locale: "en",
      resolvedUrl: "/",
    } as unknown as GetServerSidePropsContext,
    headers,
  };
}

describe("storefront preview SSR response policy", () => {
  test.each([
    ["Outlet", getStoreServerSideProps],
    ["item", getItemServerSideProps],
  ])(
    "marks an unauthorized %s preview private before its early 404",
    async (_, getProps) => {
      const { context, headers } = previewContext();

      await expect(getProps(context)).resolves.toEqual({ notFound: true });
      expect(headers.get("Cache-Control")).toBe("private, no-store");
      expect(headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
      expect(headers.get("Vary")).toBe("Accept-Encoding, Cookie");
    },
  );
});
