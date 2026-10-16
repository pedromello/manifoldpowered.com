import { test } from "node:test";
import assert from "node:assert/strict";
import { renderBanner, bannerEnabled } from "../src/brand";
import { run } from "../src/index";
import { capture, fixture } from "./helpers";
const strip = (text: string) => text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
for (const columns of [120, 88, 80, 65, 40, 20])
  test(`banner fits ${columns} columns`, () => {
    const banner = renderBanner({
      columns,
      colorDepth: 24,
      version: "1.0.0",
      environment: "prod",
    });
    assert.ok(
      strip(banner)
        .trimEnd()
        .split("\n")
        .every((line) => Array.from(line).length <= columns),
    );
    assert.ok(banner.includes("\x1b[38;2;"));
    if (columns >= 88) {
      assert.equal(banner.split("\n").length - 1, 10);
      assert.ok(strip(banner).includes("███╗   ███╗"));
    }
  });
test("desktop geometry and color treatment remain recognizable", () => {
  const banner = renderBanner({
    columns: 120,
    colorDepth: 24,
    version: "1.0.0",
  });
  assert.ok(banner.includes("252;250;255"));
  assert.ok(banner.includes("224;39;246"));
  assert.ok(banner.includes("58;30;133"));
  assert.ok(banner.includes("125;21;137"));
  assert.ok(banner.includes("255;43;178"));
  const mono = renderBanner({
    columns: 88,
    colorDepth: 24,
    noColor: true,
    version: "1.0.0",
  });
  assert.ok(!mono.includes("\x1b"));
  assert.ok(mono.includes("▓") && mono.includes("█"));
});
test("256-color and dumb terminals have appropriate fallbacks", () => {
  assert.ok(
    renderBanner({ columns: 120, colorDepth: 8, version: "1" }).includes(
      "\x1b[38;5;",
    ),
  );
  const dumb = renderBanner({
    columns: 40,
    colorDepth: 24,
    dumb: true,
    version: "1",
  });
  assert.ok(!dumb.includes("\x1b"));
  assert.ok(!/[^\x00-\x7f]/.test(dumb));
});
test("JSON, redirected streams and --no-banner never enable branding", () => {
  for (const option of [
    { json: true },
    { noBanner: true },
    { stdoutTTY: false },
    { stderrTTY: false },
  ])
    assert.equal(
      bannerEnabled({
        json: false,
        noBanner: false,
        stdoutTTY: true,
        stderrTTY: true,
        ...option,
      }),
      false,
    );
});
test("startup prints a banner once and JSON schema remains clean", async () => {
  const terminal = capture("", true);
  assert.equal(await run([], terminal.io), 0);
  assert.equal((terminal.stderr.match(/CLI PARA AGENTES/g) ?? []).length, 1);
  assert.ok(terminal.stdout.includes("env connect --env local"));
  const automation = capture("", true);
  assert.equal(
    await run(["schema", "users", "register", "--json"], automation.io),
    0,
  );
  assert.equal(automation.stderr, "");
  assert.ok(automation.json.data.input.properties.password);
  assert.ok(!automation.stdout.includes("\x1b"));
});
test("startup includes the saved selected environment", async () => {
  const f = await fixture();
  try {
    await f.state.write("selection-env.json", { env: "hml" });
    const output = capture("", true);
    assert.equal(await run([], output.io, { state: f.state }), 0);
    assert.ok(output.stderr.includes("CLI PARA AGENTES | v1.0.0 | hml"));
  } finally {
    await f.cleanup();
  }
});
