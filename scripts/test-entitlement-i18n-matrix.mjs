import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const languages = ["th", "en", "zh", "cn", "vi", "ja", "ko", "ru", "es"];
const base = process.env.HK_MATRIX_BASE || "http://127.0.0.1:3360";

for (const lang of languages) {
  const run = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "scripts/test-entitlement-browser-matrix.mjs"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        HK_ALLOW_FIXTURE_DB: "1",
        HK_MATRIX_BASE: base,
        HK_MATRIX_LANG: lang,
        HK_MATRIX_PAGES: "pricing,account,today,qimen",
        HK_MATRIX_TIERS: "free",
        HK_MATRIX_VIEWPORTS: "mobile,desktop",
      },
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  assert.equal(run.status, 0, `language ${lang} failed:\n${run.stderr}\n${run.stdout}`);
  const summary = run.stdout.split("\n").find((line) => line.startsWith("browser matrix PASS"));
  assert.ok(summary?.includes(`lang=${lang}`), `language ${lang} has no PASS summary`);
  console.log(`LANG PASS · ${lang} · mobile+desktop · Pricing+Account+Today+Qimen`);
}

console.log("9/9 language matrix passed");
