import type { NextApiRequest, NextApiResponse } from "next";

import { prepareStorefrontPreview } from "lib/storefront-preview";

function request(preview?: string | string[]): NextApiRequest {
  return { query: preview === undefined ? {} : { preview } } as NextApiRequest;
}

describe("storefront preview request policy", () => {
  test("marks an exact preview request private before authorization", () => {
    const setHeader = jest.fn();
    const getHeader = jest.fn().mockReturnValue("Accept-Encoding");

    expect(
      prepareStorefrontPreview(request("1"), {
        setHeader,
        getHeader,
      } as unknown as NextApiResponse),
    ).toBe(true);
    expect(setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      "private, no-store",
    );
    expect(setHeader).toHaveBeenCalledWith(
      "X-Robots-Tag",
      "noindex, nofollow",
    );
    expect(setHeader).toHaveBeenCalledWith(
      "Vary",
      "Accept-Encoding, Cookie",
    );
  });

  test.each([undefined, "0", "true", ["1", "0"]])(
    "does not treat %p as preview",
    (value) => {
      const setHeader = jest.fn();

      expect(
        prepareStorefrontPreview(request(value), {
          setHeader,
        } as unknown as NextApiResponse),
      ).toBe(false);
      expect(setHeader).not.toHaveBeenCalled();
    },
  );
});
