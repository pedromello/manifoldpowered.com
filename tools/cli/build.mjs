import { build } from "esbuild";
import { chmod } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const output = new URL("./dist/index.js", import.meta.url);
const result = await build({
  entryPoints: [fileURLToPath(new URL("./src/index.ts", import.meta.url))],
  outfile: fileURLToPath(output),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  external: ["@napi-rs/keyring"],
  banner: { js: "#!/usr/bin/env node" },
  metafile: true,
});
if (
  Object.keys(result.metafile.inputs).some((path) =>
    /(^|[\\/])(models|infra)[\\/]/.test(path),
  )
)
  throw new Error("The CLI bundle must not include backend modules.");
await chmod(output, 0o755);
