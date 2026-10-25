/** Live smoke check: npx tsx tests/visual/community-outlet-logo.tsx OUTPUT_DIR OUTLET_SLUG SELECTION_SLUG */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { NextRequest } from "next/server";
import handler from "pages/api/og/[...segments]";
import { loadPublicRasterImage } from "lib/public-raster-image";

const origin = "https://www.manifoldpowered.com";
const [output, slug, selection] = process.argv.slice(2);
assert.ok(
  output && slug && selection,
  "Provide a private output directory, Outlet slug, and selection slug",
);
await mkdir(output, { recursive: true });
const originalFetch = globalThis.fetch;
const store = await originalFetch(
  `${origin}/api/v1/stores/${encodeURIComponent(slug)}`,
).then((r) => r.json());
assert.equal(store.storefront_source, "REVISION");
assert.ok(store.logo_url);
// Emulate the new same-origin endpoint until deployment. Its published-source
// check is separately covered by the endpoint's unit tests.
globalThis.fetch = async (input, init) => {
  const url = new URL(String(input));
  if (
    url.origin === origin &&
    url.pathname === `/api/outlet-logo/${encodeURIComponent(slug)}`
  ) {
    assert.equal(url.searchParams.get("source"), store.logo_url);
    const image = await loadPublicRasterImage(store.logo_url);
    assert.ok(image, "The published community logo must be accepted");
    return new Response(new Uint8Array(image.bytes), {
      headers: { "content-type": image.contentType },
    });
  }
  return originalFetch(input, init);
};
try {
  for (const [kind, path] of [
    ["outlet", `outlet/${encodeURIComponent(slug)}`],
    [
      "selection",
      `selection/${encodeURIComponent(slug)}/${encodeURIComponent(selection)}`,
    ],
  ] as const) {
    const response = await handler(
      new NextRequest(`${origin}/api/og/${path}?locale=pt-BR`),
    );
    assert.equal(response.status, 200);
    const png = Buffer.from(await response.arrayBuffer());
    const metadata = await sharp(png).metadata();
    assert.equal(metadata.width, 1200);
    assert.equal(metadata.height, 630);
    const file = join(output, `${kind}-logo.png`);
    await writeFile(file, png);
    console.log(
      JSON.stringify({
        kind,
        file,
        width: metadata.width,
        height: metadata.height,
      }),
    );
  }
} finally {
  globalThis.fetch = originalFetch;
}
