/* Audit 子平真詮評註 81 命例 against current engine outputs.
   Conservative by design:
   - Uses wrapper-3 inferGeJu + chart-packet buildXiangShen.
   - Corpus has raw ctext only, no normalized expected verdict fields.
   - Therefore this reports coverage + heuristic polarity alignment, not a hard 81/81 claim.

   Run:
     node --experimental-strip-types --loader ./scripts/ts-loader.mjs scripts/audit-zpzq-81.mjs
*/
import fs from "node:fs";
import { createRequire } from "node:module";
import { buildXiangShen } from "../src/lib/chart-packet.ts";

const require = createRequire(import.meta.url);
const { inferGeJu } = require("../data/library/wrappers/3-ge-ju.js");

const corpus = JSON.parse(fs.readFileSync("data/library/sifu-extra/zpzq-mingli-golden.json", "utf8"));

const POSITIVE_RE = /(大貴|貴格|皆貴|為貴|甚美|無減福|有情|最利|美|取清|用清|有成|富貴)/;
const NEGATIVE_RE = /(救死之不暇|不暇|不利|寒貧|小富|破格|貧|不貴|無取|不美|不甚美|不相能)/;

// Guard oracle v1: corpus is still raw ctext, so this is not a full "81/81 matches
// the commentary" claim. It only asserts the executable policy stable enough for
// regression:
// - known special/fallback cases are not judged by 相神 8格.
// - ZPZQ-cited usable cases must not be returned as 破格.
// - selected resolver cases must carry the resolver phrase in reason.
const SPECIAL_OR_FALLBACK = new Set([2,10,11,25,34,37,39,40,41,47,49,52,61,68,72,73,74,76,78,80]);
const REASON_MUST_CONTAIN = new Map([
  [7, "合煞留官"],
  [15, "合煞存財"],
  [20, "印制傷護官"],
  [21, "印制食傷護官"],
  [33, "食神帶煞印"],
  [58, "印護"],
  [63, "祿劫用財"],
  [67, "合煞存財"],
  [70, "印護"],
]);

function P([y, m, d, h]) {
  const one = (x) => ({ stem: x[0], branch: x[1] });
  return { year: one(y), month: one(m), day: one(d), hour: h ? one(h) : null };
}

function polarity(ctext) {
  const pos = POSITIVE_RE.test(ctext);
  const neg = NEGATIVE_RE.test(ctext);
  if (pos && neg) return "MIXED_REVIEW";
  // Many ZPZQ notes cite one valid chart, then contrast it with a hypothetical bad chart:
  // "X命也，若..." / "X命是也，然..." etc. Without normalized fields this must be reviewed,
  // otherwise a contrast sentence becomes a false engine failure.
  if (neg && /命(是)?也/.test(ctext) && /(若|然|反|則|而)/.test(ctext)) return "MIXED_REVIEW";
  if (pos) return "POSITIVE";
  if (neg) return "NEGATIVE";
  return "UNLABELED";
}

function aligns(pol, verdict) {
  if (pol === "POSITIVE") return verdict === "成格" || verdict === "救應" || verdict === "合格普通";
  if (pol === "NEGATIVE") return verdict === "破格";
  return null;
}

function classifyNull(ge) {
  if (!ge) return "NO_GE";
  if (/^(假)?(從|化)/.test(ge) || /曲直|炎上|稼穡|從革|潤下|魁罡/.test(ge)) return "SPECIAL_NOT_XIANGSHEN";
  return "UNMAPPED_OR_GAP";
}

function hardExpected(no) {
  if (SPECIAL_OR_FALLBACK.has(no)) return { scope: "special_or_fallback", verdict: "SKIP_XIANGSHEN_ASSERT" };
  const must = REASON_MUST_CONTAIN.get(no);
  return { scope: "xiangShen", verdict: "NOT_破格", reasonMustContain: must || null };
}

function hardAlign(no, xs) {
  const exp = hardExpected(no);
  if (exp.scope === "special_or_fallback") return { ok: true, expected: exp, note: "special/fallback case; not asserted against 相神 8格" };
  if (!xs) return { ok: false, expected: exp, note: "expected xiangShen result, got null" };
  if (xs.verdict === "破格") return { ok: false, expected: exp, note: `expected not 破格, got ${xs.reason}` };
  if (exp.reasonMustContain && !(xs.reason || "").includes(exp.reasonMustContain)) {
    return { ok: false, expected: exp, note: `reason missing ${exp.reasonMustContain}` };
  }
  return { ok: true, expected: exp, note: "" };
}

const rows = [];
const stats = {
  total: corpus.length,
  xiangShen: 0,
  null: 0,
  positive: 0,
  negative: 0,
  mixed: 0,
  unlabeled: 0,
  strictPass: 0,
  strictFail: 0,
  review: 0,
  guardPass: 0,
  guardFail: 0,
};

function pct(n, d) {
  return d ? `${Math.round(n / d * 100)}%` : "0%";
}

function countBy(rows, getKey) {
  const out = new Map();
  for (const row of rows) {
    const key = getKey(row) || "-";
    out.set(key, (out.get(key) || 0) + 1);
  }
  return [...out.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

for (let i = 0; i < corpus.length; i++) {
  const rec = corpus[i];
  const natal = P(rec.pillars);
  const dm = natal.day.stem;
  const ge = inferGeJu(natal);
  const geLabel = ge?.structure || null;
  const xs = buildXiangShen(natal, dm, geLabel || "");
  const pol = polarity(rec.ctext || "");
  const ok = xs ? aligns(pol, xs.verdict) : null;
  const hard = hardAlign(i + 1, xs);

  if (xs) stats.xiangShen++; else stats.null++;
  if (pol === "POSITIVE") stats.positive++;
  else if (pol === "NEGATIVE") stats.negative++;
  else if (pol === "MIXED_REVIEW") stats.mixed++;
  else stats.unlabeled++;
  if (ok === true) stats.strictPass++;
  else if (ok === false) stats.strictFail++;
  else stats.review++;
  if (hard.ok) stats.guardPass++;
  else stats.guardFail++;

  rows.push({
    no: i + 1,
    name: rec.name || "",
    pillars: rec.pillars.join(" "),
    dm,
    ge: geLabel,
    geType: ge?.type || "",
    xiangShen: xs ? xs.verdict : null,
    subLabel: xs?.subLabel ?? null,
    reason: xs?.reason ?? classifyNull(geLabel),
    textPolarity: pol,
    align: ok === null ? "REVIEW" : ok ? "PASS" : "FAIL",
    guardAlign: hard.ok ? "PASS" : "FAIL",
    guardExpected: hard.expected,
    guardNote: hard.note,
    ctext: rec.ctext,
  });
}

console.log("=== ZPZQ 81 命例 audit — current engine ===");
console.log(`total: ${stats.total}`);
console.log(`xiangShen coverage: ${stats.xiangShen}/${stats.total} (${pct(stats.xiangShen, stats.total)}) · null=${stats.null}`);
console.log(`text polarity: positive=${stats.positive} · negative=${stats.negative} · mixed=${stats.mixed} · unlabeled=${stats.unlabeled}`);
console.log(`strict heuristic alignment: PASS=${stats.strictPass} · FAIL=${stats.strictFail} · REVIEW=${stats.review}`);
console.log(`guard oracle v1 (not full 81 hard-label): PASS=${stats.guardPass}/${stats.total} · FAIL=${stats.guardFail}`);

if (stats.guardFail) {
  console.log("\n=== GUARD FAIL rows ===");
  for (const r of rows.filter((x) => x.guardAlign === "FAIL")) {
    console.log(`${String(r.no).padStart(2, "0")}. ${r.name || "-"} · ${r.pillars} · ge=${r.ge || "-"} · xs=${r.xiangShen || "-"}${r.subLabel ? "/" + r.subLabel : ""} · expected=${r.guardExpected.verdict}${r.guardExpected.reasonMustContain ? "/" + r.guardExpected.reasonMustContain : ""} · ${r.guardNote}`);
  }
}

console.log("\n=== FAIL / REVIEW headline rows ===");
for (const r of rows.filter((x) => x.align !== "PASS").slice(0, 80)) {
  console.log(`${String(r.no).padStart(2, "0")}. ${r.align} ${r.name || "-"} · ${r.pillars} · ge=${r.ge || "-"} · xs=${r.xiangShen || "-"}${r.subLabel ? "/" + r.subLabel : ""} · text=${r.textPolarity} · ${r.reason}`);
}

const out = {
  generatedAt: new Date().toISOString(),
  note: "Heuristic polarity audit. Corpus lacks normalized expected verdict fields; MIXED_REVIEW/UNLABELED require human labeling before hard regression.",
  stats,
  buckets: {
    byGe: Object.fromEntries(countBy(rows, (r) => r.ge || r.reason)),
    byXiangShen: Object.fromEntries(countBy(rows, (r) => r.xiangShen ? `${r.xiangShen}${r.subLabel ? "/" + r.subLabel : ""}` : r.reason)),
    reviewReasons: Object.fromEntries(countBy(rows.filter((r) => r.align === "REVIEW"), (r) => r.reason)),
  },
  rows,
};
fs.mkdirSync("/tmp/hourkey-audit", { recursive: true });
fs.writeFileSync("/tmp/hourkey-audit/zpzq-81-audit.json", JSON.stringify(out, null, 2));
fs.writeFileSync(
  "/tmp/hourkey-audit/zpzq-81-audit.tsv",
  [
    ["no","align","textPolarity","name","pillars","dm","ge","geType","xiangShen","subLabel","reason","ctext"].join("\t"),
    ...rows.map((r) => [r.no,r.align,r.textPolarity,r.name,r.pillars,r.dm,r.ge,r.geType,r.xiangShen,r.subLabel,r.reason,r.ctext]
      .map((v) => String(v ?? "").replace(/\t/g, " ").replace(/\n/g, " ")).join("\t")),
  ].join("\n"),
);
const md = [
  "# ZPZQ 81 Mingli Audit",
  "",
  `Generated: ${out.generatedAt}`,
  "",
  "## Scope",
  "",
  "- Audit-only runner. It does not change runtime, prompt, stream, packet, or AI Sifu behavior.",
  "- Corpus is still raw ctext/commentary, so this is a baseline guard and review queue, not a final 81/81 doctrinal proof.",
  "- `guard oracle v1` is intentionally narrow: known special/fallback cases are skipped from 相神 assertion; cited usable cases must not become 破格; selected resolver phrases must stay present.",
  "",
  "## Summary",
  "",
  `- total: ${stats.total}`,
  `- xiangShen coverage: ${stats.xiangShen}/${stats.total} (${pct(stats.xiangShen, stats.total)})`,
  `- null/special/fallback: ${stats.null}/${stats.total} (${pct(stats.null, stats.total)})`,
  `- text polarity: positive=${stats.positive}, negative=${stats.negative}, mixed=${stats.mixed}, unlabeled=${stats.unlabeled}`,
  `- strict heuristic alignment: PASS=${stats.strictPass}, FAIL=${stats.strictFail}, REVIEW=${stats.review}`,
  `- guard oracle v1: PASS=${stats.guardPass}/${stats.total}, FAIL=${stats.guardFail}`,
  "",
  "## Review Buckets",
  "",
  "| Bucket | Count |",
  "|---|---:|",
  ...countBy(rows.filter((r) => r.align === "REVIEW"), (r) => r.reason).slice(0, 25).map(([k, v]) => `| ${String(k).replace(/\|/g, "/")} | ${v} |`),
  "",
  "## Guard Failures",
  "",
  ...(stats.guardFail
    ? rows.filter((r) => r.guardAlign === "FAIL").map((r) => `- ${r.no}. ${r.name || "-"} · ${r.pillars} · ${r.guardNote}`)
    : ["- none"]),
  "",
  "## Next Safe Steps",
  "",
  "1. Normalize expected labels for the 69 REVIEW cases in a separate data file; do not edit engine behavior during labeling.",
  "2. Split special/fallback cases into explicit buckets: 從/化/專旺, 雜氣, fallback geju, and normal 8格.",
  "3. Only after human-reviewed labels exist, convert selected rows into hard regression tests.",
  "4. Keep all future resolver work evidence-only until the audit shows which rules are stable.",
  "",
].join("\n");
fs.writeFileSync("/tmp/hourkey-audit/zpzq-81-audit.md", md);
console.log("\noutputs:");
console.log("  /tmp/hourkey-audit/zpzq-81-audit.json");
console.log("  /tmp/hourkey-audit/zpzq-81-audit.tsv");
console.log("  /tmp/hourkey-audit/zpzq-81-audit.md");

process.exit(stats.strictFail || stats.guardFail ? 1 : 0);
