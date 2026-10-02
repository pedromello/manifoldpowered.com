import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const bundled = await build({
  entryPoints: ["components/mcp/catalog-card-entry.tsx"],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  target: "es2022",
  minify: true,
  define: { "process.env.NODE_ENV": '"production"' },
});
const globalStyles = await readFile("styles/global.css", "utf8");
const storefrontTokens = globalStyles.match(/@theme\s*\{([^}]+)\}/)?.[1];
if (!storefrontTokens?.includes("--color-sf-bg"))
  throw new Error("Missing storefront brand tokens");
const css = await readFile("styles/mcp-game-card.css", "utf8");
const logo = (await readFile("public/images/brand/manifold-logo.png")).toString(
  "base64",
);
const js = bundled.outputFiles[0].text
  .replaceAll("__MANIFOLD_LOGO__", `data:image/png;base64,${logo}`)
  .replaceAll("</script", "<\\/script");
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Manifold</title><style>:root{${storefrontTokens}}${css}</style></head><body><div id="root"></div><script>${js}</script></body></html>`;
await mkdir("public/mcp", { recursive: true });
await writeFile("public/mcp/game-card.html", html);
console.log("Built Manifold MCP card with existing logo and storefront tokens");
