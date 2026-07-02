/**
 * รัน sifu source-governance tests ทั้งชุดด้วยคำสั่งเดียว.
 * ใช้ resolver เดิมของโปรเจกต์ (scripts/_ts-resolver.mjs) ตามที่ header
 * ในไฟล์ test-sifu-*.mts ระบุไว้ — ไม่สร้าง resolver ใหม่ซ้ำซ้อน.
 *
 * ใช้: npm run test:sifu
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const resolver = join(here, "_ts-resolver.mjs");
const tests = readdirSync(here)
  .filter((f) => (f.startsWith("test-sifu-") || f.startsWith("test-fusion5-")) && f.endsWith(".mts"))
  .sort();

let failed = 0;
for (const t of tests) {
  const r = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--import", resolver, join(here, t)],
    { stdio: "inherit" },
  );
  if (r.status !== 0) {
    failed += 1;
    console.error(`✗ ${t} exited ${r.status}`);
  }
}

if (failed) {
  console.error(`\n[run-sifu-tests] ${failed}/${tests.length} test files FAILED`);
  process.exit(1);
}
console.log(`\n[run-sifu-tests] all ${tests.length} sifu test files passed`);
