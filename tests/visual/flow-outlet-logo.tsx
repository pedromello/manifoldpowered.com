/** Live public-data smoke check: npx tsx tests/visual/flow-outlet-logo.tsx OUTPUT_DIR */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { NextRequest } from "next/server";
import handler, { loadImageData } from "pages/api/og/[...segments]";

const origin = "https://www.manifoldpowered.com";
const output = process.argv[2];
assert.ok(output, "Provide a private output directory");
await mkdir(output, { recursive: true });
const store = await fetch(`${origin}/api/v1/stores/comunidade-flow-games`).then(
  (r) => r.json(),
);
assert.equal(store.name, "Comunidade Flow Games");
const avatar = await loadImageData(store.logo_url, origin);
assert.ok(avatar, "The real published Flow Games logo must be accepted");
for (const [kind, path] of [
  ["outlet", "outlet/comunidade-flow-games"],
  ["selection", "selection/comunidade-flow-games/top-10-nintendo-bruno-micali"],
] as const) {
  const response = await handler(
    new NextRequest(`${origin}/api/og/${path}?locale=pt-BR`),
  );
  assert.equal(response.status, 200);
  const png = Buffer.from(await response.arrayBuffer());
  const metadata = await sharp(png).metadata();
  assert.equal(metadata.width, 1200);
  assert.equal(metadata.height, 630);
  const file = join(output, `flow-${kind}-logo.png`);
  await writeFile(file, png);
  console.log(
    JSON.stringify({
      kind,
      file,
      logo: store.logo_url,
      width: metadata.width,
      height: metadata.height,
    }),
  );
}
