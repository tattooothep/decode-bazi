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
};

for (let i = 0; i < corpus.length; i++) {
  const rec = corpus[i];
  const natal = P(rec.pillars);
  const dm = natal.day.stem;
  const ge = inferGeJu(natal);
  const geLabel = ge?.structure || null;
  const xs = buildXiangShen(natal, dm, geLabel || "");
  const pol = polarity(rec.ctext || "");
  const ok = xs ? aligns(pol, xs.verdict) : null;

  if (xs) stats.xiangShen++; else stats.null++;
  if (pol === "POSITIVE") stats.positive++;
  else if (pol === "NEGATIVE") stats.negative++;
  else if (pol === "MIXED_REVIEW") stats.mixed++;
  else stats.unlabeled++;
  if (ok === true) stats.strictPass++;
  else if (ok === false) stats.strictFail++;
  else stats.review++;

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
    ctext: rec.ctext,
  });
}

console.log("=== ZPZQ 81 命例 audit — current engine ===");
console.log(`total: ${stats.total}`);
console.log(`xiangShen coverage: ${stats.xiangShen}/${stats.total} (${Math.round(stats.xiangShen / stats.total * 100)}%) · null=${stats.null}`);
console.log(`text polarity: positive=${stats.positive} · negative=${stats.negative} · mixed=${stats.mixed} · unlabeled=${stats.unlabeled}`);
console.log(`strict heuristic alignment: PASS=${stats.strictPass} · FAIL=${stats.strictFail} · REVIEW=${stats.review}`);

console.log("\n=== FAIL / REVIEW headline rows ===");
for (const r of rows.filter((x) => x.align !== "PASS").slice(0, 80)) {
  console.log(`${String(r.no).padStart(2, "0")}. ${r.align} ${r.name || "-"} · ${r.pillars} · ge=${r.ge || "-"} · xs=${r.xiangShen || "-"}${r.subLabel ? "/" + r.subLabel : ""} · text=${r.textPolarity} · ${r.reason}`);
}

const out = {
  generatedAt: new Date().toISOString(),
  note: "Heuristic polarity audit. Corpus lacks normalized expected verdict fields; MIXED_REVIEW/UNLABELED require human labeling before hard regression.",
  stats,
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
console.log("\noutputs:");
console.log("  /tmp/hourkey-audit/zpzq-81-audit.json");
console.log("  /tmp/hourkey-audit/zpzq-81-audit.tsv");

process.exit(stats.strictFail ? 1 : 0);
