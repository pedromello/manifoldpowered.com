import { renderToStaticMarkup } from "react-dom/server";
import { SelectionPreviewCard } from "components/social/PreviewCards";
import { selectionFixture } from "tests/unit/_fixtures/selection";
import type { StorePalette } from "contracts/store-presentation";

function luminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/../g)!
    .map((part) => {
      const channel = parseInt(part, 16) / 255;
      return channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4;
    });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

test.each<[StorePalette, string | null, string, string]>([
  ["crimson", null, "#E60013", "#FFFFFF"],
  ["burgundy", null, "#850012", "#FFFFFF"],
  ["ocean", null, "#22D3EE", "#071014"],
  ["ember", null, "#FB923C", "#100B09"],
  ["manifold", null, "#C4B5FD", "#0B0812"],
  ["crimson", "neon-alley", "#22d3ee", "#04141a"],
  ["crimson", "strategos-void", "#e04444", "#0e0e0f"],
])(
  "uses %s / %s identity with readable text",
  (palette, theme, background, foreground) => {
    const data = selectionFixture();
    // Name and address must never determine the color; published tokens do.
    data.outlet.name = "Comunidade Nintendo";
    data.outlet.brand_tokens!.palette = palette;
    data.outlet.theme_key = theme;
    const markup = renderToStaticMarkup(
      <SelectionPreviewCard
        outlet={data.outlet}
        title={data.selection.title}
        count={13}
        banners={[]}
        avatar={null}
        locale="pt-BR"
      />,
    );
    expect(markup).toContain(`background:${background};color:${foreground}`);
    expect(markup).toContain("13 jogos");
    expect(markup).toContain("via Manifold");
    const [darker, lighter] = [
      luminance(background),
      luminance(foreground),
    ].sort((a, b) => a - b);
    expect((lighter + 0.05) / (darker + 0.05)).toBeGreaterThanOrEqual(4.5);
  },
);
