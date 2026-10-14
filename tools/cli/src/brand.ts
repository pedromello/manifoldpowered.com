// Ported from manifold-desktop/src-tauri/src/debug.rs (brand_header and logo geometry).
// https://github.com/pedromello/manifold-desktop/blob/dc6abbc4158231d808e9237cfa75fdbdb7816c4b/src-tauri/src/debug.rs
const WIDTH = 22;
const HEIGHT = 18;
type Color = readonly [number, number, number];
const TOP: Color = [224, 39, 246];
const BOTTOM: Color = [105, 54, 238];
const BACKGROUND: Color = [8, 8, 10];
const WHITE: Color = [252, 250, 255];
const MAGENTA: Color = [255, 43, 178];
const RESET = "\x1b[0m";
const WORDMARK = [
  "███╗   ███╗ █████╗ ███╗   ██╗██╗███████╗ ██████╗ ██╗     ██████╗ ",
  "████╗ ████║██╔══██╗████╗  ██║██║██╔════╝██╔═══██╗██║     ██╔══██╗",
  "██╔████╔██║███████║██╔██╗ ██║██║█████╗  ██║   ██║██║     ██║  ██║",
  "██║╚██╔╝██║██╔══██║██║╚██╗██║██║██╔══╝  ██║   ██║██║     ██║  ██║",
  "██║ ╚═╝ ██║██║  ██║██║ ╚████║██║██║     ╚██████╔╝███████╗██████╔╝",
  "╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝╚═╝      ╚═════╝ ╚══════╝╚═════╝ ",
];
const CURVES = [
  [
    [5.7, 2.7],
    [8, 5],
    [10.2, 9],
    [10.7, 14.7],
  ],
  [
    [16.3, 2.7],
    [14, 5],
    [11.8, 9],
    [11.3, 14.7],
  ],
  [
    [2.7, 6.4],
    [5.2, 8.3],
    [6.8, 11],
    [7, 14.7],
  ],
  [
    [19.3, 6.4],
    [16.8, 8.3],
    [15.2, 11],
    [15, 14.7],
  ],
];
function gradient(row: number, maximum: number): Color {
  return TOP.map(
    (start, channel) =>
      start + Math.trunc(((BOTTOM[channel] - start) * row) / maximum),
  ) as unknown as Color;
}
function pixel(
  column: number,
  row: number,
): { color: Color; mark: boolean } | null {
  const x = column + 0.5,
    y = row + 0.5;
  if (((x - WIDTH / 2) / 10.2) ** 2 + ((y - HEIGHT / 2) / 8.3) ** 2 > 1)
    return null;
  const mark = CURVES.some((curve) => {
    for (let step = 0; step <= 36; step++) {
      const t = step / 36,
        inverse = 1 - t;
      const point = [0, 1].map(
        (axis) =>
          inverse ** 3 * curve[0][axis] +
          3 * inverse ** 2 * t * curve[1][axis] +
          3 * inverse * t ** 2 * curve[2][axis] +
          t ** 3 * curve[3][axis],
      );
      if ((x - point[0]) ** 2 + (y - point[1]) ** 2 <= 0.78 ** 2) return true;
    }
    return false;
  });
  return { color: mark ? WHITE : gradient(row, HEIGHT - 1), mark };
}
function ansi(color: Color, depth: number, background = false): string {
  if (depth >= 24) return `\x1b[${background ? 48 : 38};2;${color.join(";")}m`;
  const levels = [0, 95, 135, 175, 215, 255];
  const indexes = color.map((channel) =>
    levels.reduce(
      (best, level, index) =>
        Math.abs(channel - level) < Math.abs(channel - levels[best])
          ? index
          : best,
      0,
    ),
  );
  return `\x1b[${background ? 48 : 38};5;${16 + 36 * indexes[0] + 6 * indexes[1] + indexes[2]}m`;
}
function logoRow(row: number, depth: number): string {
  let output = "";
  for (let column = 0; column < WIDTH; column++) {
    const top = pixel(column, row * 2),
      bottom = pixel(column, row * 2 + 1);
    if (depth < 8)
      output +=
        top && bottom
          ? top.mark || bottom.mark
            ? "█"
            : "▓"
          : top
            ? "▀"
            : bottom
              ? "▄"
              : " ";
    else
      output +=
        ansi(top?.color ?? BACKGROUND, depth) +
        ansi(bottom?.color ?? BACKGROUND, depth, true) +
        "▀";
  }
  return output + (depth >= 8 ? RESET : "");
}
function wordmarkRow(row: number, depth: number): string {
  if (depth < 8) return WORDMARK[row];
  const color = gradient(row, WORDMARK.length - 1);
  return (
    Array.from(WORDMARK[row], (character) =>
      character === " "
        ? character
        : ansi(
            character === "█"
              ? color
              : (color.map((channel) =>
                  Math.trunc(channel * 0.56),
                ) as unknown as Color),
            depth,
          ) + character,
    ).join("") + RESET
  );
}
export type BannerOptions = {
  columns: number;
  colorDepth: number;
  noColor?: boolean;
  dumb?: boolean;
  version: string;
  environment?: string;
};
export function renderBanner(options: BannerOptions): string {
  const columns = Math.max(1, Math.floor(options.columns || 80));
  const depth = options.noColor ? 1 : options.colorDepth;
  const subtitle = `CLI PARA AGENTES | v${options.version}${options.environment ? ` | ${options.environment}` : ""}`;
  const lines: string[] = [];
  if (options.dumb || columns < WIDTH) lines.push("MANIFOLD".slice(0, columns));
  else if (columns >= 88) {
    for (let row = 0; row < HEIGHT / 2; row++)
      lines.push(
        logoRow(row, depth) +
          " " +
          (row >= 2 && row < 8
            ? wordmarkRow(row - 2, depth)
            : row === 8
              ? subtitle.slice(0, columns - WIDTH - 1)
              : ""),
      );
  } else {
    for (let row = 0; row < HEIGHT / 2; row++) lines.push(logoRow(row, depth));
    if (columns >= 65)
      for (let row = 0; row < WORDMARK.length; row++)
        lines.push(wordmarkRow(row, depth));
    else lines.push("MANIFOLD");
  }
  if (columns < 88)
    for (let offset = 0; offset < subtitle.length; offset += columns)
      lines.push(subtitle.slice(offset, offset + columns));
  const separator = (options.dumb ? "-" : "─").repeat(Math.min(columns, 108));
  lines.push(
    depth >= 8 && !options.dumb
      ? ansi(MAGENTA, depth) + separator + RESET
      : separator,
  );
  return lines.join("\n") + "\n";
}
export function bannerEnabled(options: {
  json: boolean;
  noBanner: boolean;
  stdoutTTY: boolean;
  stderrTTY: boolean;
}) {
  return (
    !options.json && !options.noBanner && options.stdoutTTY && options.stderrTTY
  );
}
