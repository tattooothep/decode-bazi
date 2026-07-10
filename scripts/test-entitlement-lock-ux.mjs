import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const caps = read("public/js/hk-product-caps.js");
const pages = [
  "comparison", "palmistry", "calendar", "chart", "fengshui", "forecast",
  "qimen", "yongsennetwork", "luopan", "today", "master", "datepick",
];

assert.doesNotMatch(caps, /window\.confirm\(/, "locked controls use the Hourkey dialog");
assert.doesNotMatch(caps, /hk-lock-badge/, "individual datepick lock glyphs were removed");
assert.doesNotMatch(caps, /#qm-search-panel button|#qm-sifu-panel button/, "Qi Men locks whole workflow panels");
assert.match(caps, /page === "today"/, "Today has an explicit open-current-day branch");
assert.match(caps, /hk-access-modal/, "shared plan-access dialog exists");
assert.match(caps, /upgrade_title/, "shared dialog is localized");

for (const page of pages) {
  assert.match(read(`public/${page}.html`), /hk-product-caps\.js\?v=6/, `${page} uses current lock UX`);
}

console.log("entitlement UX PASS · grouped locks · shared dialog · Today open · 12 pages on v6");
