import type { NextApiRequest, NextApiResponse } from "next";
import handler from "pages/api/outlet-logo/[slug]";
import store from "models/store";
import { loadPublicRasterImage } from "lib/public-raster-image";

jest.mock("models/store", () => ({
  __esModule: true,
  default: { findOnePublishedBySlug: jest.fn() },
}));
jest.mock("lib/public-raster-image", () => ({
  loadPublicRasterImage: jest.fn(),
}));
jest.mock("infra/controller", () => ({
  __esModule: true,
  default: {
    errorHandlers: {
      onError: (_error, _req, res) => res.status(404).end(),
    },
  },
}));

const logo = "https://community.example/logo.png";
const bytes = Buffer.from("public image");
beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(store.findOnePublishedBySlug)
    .mockResolvedValue({ logo_url: logo } as never);
  jest
    .mocked(loadPublicRasterImage)
    .mockResolvedValue({ bytes, contentType: "image/png" });
});

async function request(query: Record<string, unknown>) {
  const req = {
    method: "GET",
    url: "/api/outlet-logo/example-outlet",
    query,
    headers: { cookie: "session_id=private", host: "preview.example" },
  };
  const res = {
    setHeader: jest.fn(),
    status: jest.fn().mockReturnThis(),
    end: jest.fn(),
  };
  await handler(req as NextApiRequest, res as unknown as NextApiResponse);
  return res;
}

test("serves only the matching published logo, ignoring session and preview inputs", async () => {
  const res = await request({
    slug: "example-outlet",
    source: logo,
    preview: "1",
    url: "https://attacker.example/private",
  });
  expect(store.findOnePublishedBySlug).toHaveBeenCalledWith("example-outlet");
  expect(loadPublicRasterImage).toHaveBeenCalledWith(logo);
  expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
  expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "image/png");
  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.end).toHaveBeenCalledWith(bytes);
});

test.each([null, "https://other.example/logo.png"])(
  "does not fetch a missing or mismatched published logo: %s",
  async (publishedLogo) => {
    jest
      .mocked(store.findOnePublishedBySlug)
      .mockResolvedValue({ logo_url: publishedLogo } as never);
    const res = await request({ slug: "example-outlet", source: logo });
    expect(loadPublicRasterImage).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  },
);

test("does not fetch a logo from an unpublished outlet", async () => {
  jest
    .mocked(store.findOnePublishedBySlug)
    .mockRejectedValue(new Error("Not published"));
  const res = await request({
    slug: "example-outlet",
    source: logo,
    preview: "1",
  });
  expect(loadPublicRasterImage).not.toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(404);
});

test("returns a fallback response when the public image cannot be loaded", async () => {
  jest.mocked(loadPublicRasterImage).mockResolvedValue(null);
  const res = await request({ slug: "example-outlet", source: logo });
  expect(res.status).toHaveBeenCalledWith(404);
});

test.each([
  "https://www.manifoldpowered.com/api/og/outlet/example-outlet",
  "https://www.manifoldpowered.com/images/%2e%2e%2fapi/private",
  "https://preview.example/api/outlet-logo/example-outlet",
  "https://preview.example/_next/image?url=/api/private",
])("does not recursively load local dynamic routes: %s", async (source) => {
  jest
    .mocked(store.findOnePublishedBySlug)
    .mockResolvedValue({ logo_url: source } as never);
  const res = await request({ slug: "example-outlet", source });
  expect(loadPublicRasterImage).not.toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(404);
});

test("retains published same-origin static logos", async () => {
  const source =
    "https://www.manifoldpowered.com/images/brand/icon-512x512.png";
  jest
    .mocked(store.findOnePublishedBySlug)
    .mockResolvedValue({ logo_url: source } as never);
  const res = await request({ slug: "example-outlet", source });
  expect(loadPublicRasterImage).toHaveBeenCalledWith(source);
  expect(res.status).toHaveBeenCalledWith(200);
});
