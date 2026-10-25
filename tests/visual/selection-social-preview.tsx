/** Offline review fixtures: npx tsx tests/visual/selection-social-preview.tsx */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { NextRequest } from "next/server";
import sharp from "sharp";
import handler from "pages/api/og/[...segments]";
import { selectionFixture } from "tests/unit/_fixtures/selection";
import type { SelectionPageApi } from "lib/selection-client";
import type { StorePalette } from "contracts/store-presentation";

const origin = "https://www.manifoldpowered.com";
const sourceDirectory = "docs/seo-previews";
const directory = process.argv[2] ?? sourceDirectory;
await mkdir(directory, { recursive: true });
const source = await readFile(
  `${sourceDirectory}/selection-three-banners-pt-BR.png`,
);
// Reuse the existing review fixture's real, horizontal game banners.
const banners = await Promise.all(
  [
    [8, 8],
    [605, 8],
    [8, 320],
  ].map(([left, top]) =>
    sharp(source)
      .extract({ left, top, width: 587, height: 302 })
      .png()
      .toBuffer(),
  ),
);
// A synthetic community logo distinct from the initials fallback.
const avatar = await sharp(
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="#6D28D9"/><path d="M64 20L108 96H20Z" fill="white"/></svg>',
  ),
)
  .png()
  .toBuffer();
const originalFetch = globalThis.fetch;
let data = selectionFixture();
globalThis.fetch = (async (input) => {
  const url = String(input);
  if (url.startsWith(`${origin}/api/v1/stores/`)) return Response.json(data);
  if (
    url ===
    `${origin}/api/outlet-logo/${data.outlet.slug}?source=${encodeURIComponent(data.outlet.logo_url ?? "")}`
  )
    return new Response(new Uint8Array(avatar), {
      headers: { "content-type": "image/png" },
    });
  const index = data.games.findIndex((game) => game.media.banner === url);
  return index >= 0
    ? new Response(new Uint8Array(banners[index % 3]), {
        headers: { "content-type": "image/png" },
      })
    : new Response(null, { status: 404 });
}) as typeof fetch;

function fixture(
  palette: StorePalette = "crimson",
  count = 3,
): SelectionPageApi {
  const value = selectionFixture();
  value.outlet = {
    ...value.outlet,
    name: "Comunidade Nintendo",
    logo_url: "https://community.example/logo.png",
    brand_tokens: { palette, typography: "modern", shape: "soft" },
  };
  value.selection.title = "Lançamentos da semana (19/10/2026)";
  value.games = Array.from({ length: count }, (_, index) => ({
    ...value.games[0],
    id: `review-${index}`,
    slug: `review-${index}`,
    media: {
      ...value.games[0].media,
      banner: `https://images.unsplash.com/review-${index}.png`,
    },
  }));
  return value;
}

async function render(value: SelectionPageApi, expectedColor: string) {
  data = value;
  const response = await handler(
    new NextRequest(
      `${origin}/api/og/selection/${value.outlet.slug}/${value.selection.slug}?locale=pt-BR`,
    ),
  );
  assert.equal(response.status, 200);
  const png = Buffer.from(await response.arrayBuffer());
  const image = sharp(png);
  const metadata = await image.metadata();
  assert.equal(metadata.width, 1200);
  assert.equal(metadata.height, 630);
  const pixel = await image
    .extract({ left: 1180, top: 610, width: 1, height: 1 })
    .removeAlpha()
    .raw()
    .toBuffer();
  assert.equal(
    pixel.toString("hex").toUpperCase(),
    expectedColor.replace("#", "").toUpperCase(),
  );
  if (value.outlet.logo_url && value.games.length >= 3) {
    const avatarPixel = await sharp(png)
      .extract({ left: 640, top: 348, width: 1, height: 1 })
      .removeAlpha()
      .raw()
      .toBuffer();
    assert.equal(avatarPixel.toString("hex").toUpperCase(), "6D28D9");
  }
  return png;
}

async function contactSheet(
  items: { label: string; png: Buffer }[],
  file: string,
) {
  const columns = 3,
    width = 360,
    height = 221,
    gap = 16;
  const layers = await Promise.all(
    items.flatMap(({ label, png }, index) => {
      const left = gap + (index % columns) * (width + gap);
      const top = gap + Math.floor(index / columns) * (height + gap);
      return [
        Promise.resolve({
          input: Buffer.from(
            `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="28"><text x="0" y="19" font-family="sans-serif" font-size="14" fill="#FFFFFF">${label}</text></svg>`,
          ),
          left,
          top,
        }),
        sharp(png)
          .resize(width, 189)
          .toBuffer()
          .then((input) => ({ input, left, top: top + 28 })),
      ];
    }),
  );
  await sharp({
    create: {
      width: columns * (width + gap) + gap,
      height: Math.ceil(items.length / columns) * (height + gap) + gap,
      channels: 3,
      background: "#252528",
    },
  })
    .composite(layers)
    .png()
    .toFile(`${directory}/${file}`);
}

async function mobileReview(primary: Buffer) {
  const before = await readFile(
    `${sourceDirectory}/selection-outlet-branded-before-mobile.png`,
  );
  const layers: sharp.OverlayOptions[] = [];
  let top = 16;
  for (const width of [320, 360]) {
    const height = Math.round((width * 630) / 1200);
    for (const [index, png] of [before, primary].entries()) {
      const left = 16 + index * 376;
      const label = `${index === 0 ? "Antes" : "Agora"} · ${width} px`;
      layers.push({
        input: Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="28"><text x="0" y="19" font-family="sans-serif" font-size="14" fill="white">${label}</text></svg>`,
        ),
        left,
        top,
      });
      const thumbnail = await sharp(png).resize(width, height).png().toBuffer();
      layers.push({
        input: thumbnail,
        left: left + (360 - width) / 2,
        top: top + 28,
      });
      if (index === 1) {
        await writeFile(
          `${directory}/selection-outlet-mobile-${width}.png`,
          thumbnail,
        );
      }
    }
    top += 28 + height + 16;
  }
  await sharp({
    create: { width: 768, height: top, channels: 3, background: "#252528" },
  })
    .composite(layers)
    .png()
    .toFile(`${directory}/selection-outlet-mobile-comparison.png`);
}

try {
  const primary = await render(fixture("crimson", 13), "#E60013");
  await writeFile(`${directory}/selection-outlet-branded-pt-BR.png`, primary);
  await mobileReview(primary);
  const palettes: { label: string; png: Buffer }[] = [];
  for (const [palette, color] of [
    ["crimson", "#E60013"],
    ["burgundy", "#850012"],
    ["ocean", "#22D3EE"],
    ["ember", "#FB923C"],
    ["manifold", "#C4B5FD"],
  ] as const) {
    const value = fixture(palette);
    value.outlet.name =
      palette === "crimson" ? "Comunidade Nintendo" : `Outlet ${palette}`;
    if (palette !== "crimson") value.outlet.logo_url = null;
    palettes.push({ label: palette, png: await render(value, color) });
  }
  for (const [theme, color] of [
    ["neon-alley", "#22D3EE"],
    ["strategos-void", "#E60013"],
  ]) {
    const value = fixture();
    value.outlet.theme_key = theme;
    value.outlet.name = `Outlet ${theme}`;
    value.outlet.logo_url = null;
    palettes.push({ label: theme, png: await render(value, color) });
  }
  await contactSheet(palettes, "selection-outlet-branded-palettes.png");

  const cases: { label: string; png: Buffer }[] = [];
  for (const count of [3, 2, 1, 0]) {
    const value = fixture("crimson", count);
    value.outlet.logo_url = null;
    cases.push({
      label: `${count} banners / initials`,
      png: await render(value, "#E60013"),
    });
  }
  const long = fixture();
  long.outlet.name =
    "Comunidade Nintendo e amigos que compartilham descobertas e jogos para todas as gerações";
  long.selection.title =
    "Lançamentos e descobertas da semana para compartilhar com toda a comunidade e jogar em boa companhia (19/10/2026)";
  cases.push({
    label: "Long title and Outlet name",
    png: await render(long, "#E60013"),
  });
  const legacy = fixture();
  delete legacy.outlet.brand_tokens;
  delete legacy.outlet.theme_key;
  cases.push({
    label: "Legacy identity / default palette",
    png: await render(legacy, "#C4B5FD"),
  });
  await contactSheet(cases, "selection-outlet-branded-cases.png");
  console.log(
    "Verified 14 real PNG renders: 7 palettes/themes, 0-3 banners, long text and legacy identity.",
  );
} finally {
  globalThis.fetch = originalFetch;
}
