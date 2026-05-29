/**
 * test wrapper-8 化氣格 promote (Gap 3 · 29 พ.ค.)
 *
 * รัน: node --experimental-strip-types --loader ./scripts/ts-loader.mjs scripts/test-huaqi-promote.mjs
 *
 * เกณฑ์ผ่าน 8/8 ต้องตรง proto v2 (scripts/proto-huaqi-gate-v2.cjs)
 * + assert: verdict + transformElement + dmRootLabel + packet field huaQi + render block
 */
import { createRequire } from "node:module";
import { buildStructuredChartPacket, renderChartPrompt } from "../src/lib/chart-packet.ts";

const require = createRequire(import.meta.url);
const W3 = require("../data/library/wrappers/3-ge-ju.js");
const W8 = require("../data/library/wrappers/8-huahe.js");

let pass = 0, fail = 0;
function t(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  ✓ ${label}${detail ? " · " + detail : ""}`); }
  else    { fail++; console.log(`  ✗ ${label}${detail ? " · " + detail : ""}`); }
}

const P = (y, m, d, h) => ({
  year:  { stem: y[0], branch: y[1] },
  month: { stem: m[0], branch: m[1] },
  day:   { stem: d[0], branch: d[1] },
  hour:  h ? { stem: h[0], branch: h[1] } : null,
});

/* ── golden 8 cases (ตาม proto v2) ────────────────────────────── */
const CASES = [
  { name: "Fixture C · 真化",            natal: P("戊辰","己未","甲戌","己巳"), verdict: "真化",       el: "earth", dmRoot: "no_root" },
  { name: "Fixture D · 合而不化 (隔位)", natal: P("甲子","丙子","己酉","乙亥"), verdict: "合而不化",   el: "earth", dmRoot: null },
  { name: "ไนท์ · 合而不化 (隔位)",       natal: P("甲子","丙子","己亥","庚午"), verdict: "合而不化",   el: "earth", dmRoot: null },
  { name: "Aeaw · 合而不化 (隔位)",      natal: P("甲子","丙子","己亥","庚午"), verdict: "合而不化",   el: "earth", dmRoot: null },
  { name: "Mai · null (ไม่มีคู่ 五合)",    natal: P("丙寅","壬辰","丙戌","丙申"), verdict: null,         el: null,    dmRoot: null },
  { name: "F7 · 真化 妒合 override",      natal: P("戊辰","己未","甲戌","己巳"), verdict: "真化",       el: "earth", dmRoot: "no_root" },
  { name: "F8 · 假化",                     natal: P("乙卯","甲辰","己卯","乙亥"), verdict: "假化",       el: "earth", dmRoot: "token_root" },
  { name: "F9 · 合而不化",                 natal: P("丙午","甲子","己卯", null), verdict: "合而不化",   el: "earth", dmRoot: null },
];

/* ── A · wrapper-8 analyzeHuaQi ระดับ engine ────────────────── */
console.log("\n[A] wrapper-8 analyzeHuaQi (proto v2 parity)");
for (const c of CASES) {
  const r = W8.analyzeHuaQi(c.natal);
  const got = r ? r.verdict : null;
  const ok = got === c.verdict;
  let detail = `got=${got} expect=${c.verdict}`;
  if (ok && r) {
    detail += ` · el=${r.transformElement} · dmRoot=${r.dmRootLabel}`;
    if (c.el !== null && r.transformElement !== c.el) {
      detail += ` ⚠ el mismatch (expect=${c.el})`;
      t(`[A] ${c.name}`, false, detail);
      continue;
    }
    if (c.dmRoot && r.dmRootLabel !== c.dmRoot) {
      detail += ` ⚠ dmRoot mismatch (expect=${c.dmRoot})`;
      t(`[A] ${c.name}`, false, detail);
      continue;
    }
  }
  t(`[A] ${c.name}`, ok, detail);
}

/* ── B · wrapper-3 analyzeHuaQiVerdict + findTransformation contract ── */
console.log("\n[B] wrapper-3 expose analyzeHuaQiVerdict (chart-packet caller)");
for (const c of CASES) {
  const r = W3.analyzeHuaQiVerdict(c.natal);
  const got = r ? r.verdict : null;
  const ok = got === c.verdict;
  let detail = `got=${got}`;
  if (ok && r) {
    // dm fill back ที่ wrapper-3 layer
    if (r.stems && r.stems.dm !== c.natal.day.stem) {
      detail += ` ⚠ dm fill mismatch (got=${r.stems.dm} expect=${c.natal.day.stem})`;
      t(`[B] ${c.name}`, false, detail);
      continue;
    }
  }
  t(`[B] ${c.name}`, ok, detail);
}

/* ── C · contract wrapper-3 findTransformation เดิมยังคืน 真化 เท่านั้น
       (กัน wrapper-7 push 化神 ผิดสำหรับ 假化/合而不化) ── */
console.log("\n[C] wrapper-3 findTransformation contract (เฉพาะ 真化 → wrapper-7 isTransformation=true)");
const G = W3.inferGeJu;
for (const c of CASES) {
  const r = G(c.natal);
  const isTrueHua = r && r.type === "transformation";
  const expectTrue = c.verdict === "真化";
  const ok = !!isTrueHua === expectTrue;
  t(`[C] ${c.name}`, ok, `geju.type=${r?.type || "-"} structure=${r?.structure || "-"}`);
}

/* ── D · ChartPacket field huaQi + render block ────────────────
   ทดสอบกับ Fixture C (真化) เพื่อยืนยัน wire-up packet + render */
console.log("\n[D] ChartPacket huaQi field + renderChartPrompt block");

/* mock calc/ext เบาๆ ตามที่ buildStructuredChartPacket ต้องการ
 *   (ใช้เฉพาะ field ที่ wire-up เข้า huaQi · ไม่ต้องครบทุก field) */
const mkMockCalc = (natal, dm) => ({
  mode: "4p",
  pillars: natal,
  geJu: { structure: "化土格", confidence: "high" },
  yongshen: [],
  tst: null,
  strength: { level: "กลาง" },
  climate: null,
});
const mkMockExt = () => ({
  ten_gods_map: { year: { ten_god: "正官" }, month: { ten_god: "正印" }, day: { ten_god: "日主" }, hour: { ten_god: "正印" } },
  three_phases: { year: null, month: null, day: null, hour: null },
  palace_readings: { year: { zh: "祖宮" }, month: { zh: "父母宮" }, day: { zh: "夫妻宮" }, hour: { zh: "子女宮" } },
  nayin: { year: { zh: "大林木" }, month: { zh: "天上火" }, day: { zh: "山頭火" }, hour: { zh: "大林木" } },
  special_stars: { year: [], month: [], day: [], hour: [] },
  element_counts: { wood: 1, fire: 0, earth: 5, metal: 1, water: 1 },
  voytek_strength: { level: "กลาง" },
  interactions: [], stem_interactions: [],
  combinations: { san_he: [], san_hui: [], ban_he: [] },
  punishments: [], fan_yin_fu_yin: [],
  jishen: { elements: [] },
  kong_wang: { void_branches: [], year_xun_voids: [] },
  luck_pillars: [{ age_start: 8 }], luck_periods_zh: [], current_luck: null,
  special_chart: { applicable: false },
});

const fixtureC = CASES[0]; // 真化
const calc = mkMockCalc(fixtureC.natal, fixtureC.natal.day.stem);
const ext = mkMockExt();
const g = { READING_ORDER: "" };

let packet;
try {
  packet = buildStructuredChartPacket(calc, ext, fixtureC.natal.day.stem, 30, g, null, null, null, {});
} catch (e) {
  console.log(`  build error: ${e.message}`);
}

t("[D] packet.huaQi exists",                  !!packet?.huaQi, packet?.huaQi ? `verdict=${packet.huaQi.verdict}` : "null");
t("[D] packet.huaQi.verdict = 真化",          packet?.huaQi?.verdict === "真化");
t("[D] packet.huaQi.transformElement = earth", packet?.huaQi?.transformElement === "earth");
t("[D] packet.huaQi.dmRootLabel = no_root",    packet?.huaQi?.dmRootLabel === "no_root");
t("[D] packet.huaQi.stems.dm = 甲",             packet?.huaQi?.stems?.dm === "甲");
t("[D] packet.huaQi.monthSupport = true",      packet?.huaQi?.monthSupport === true);
t("[D] packet.huaQi.sourceRuleIds มี ZPZQ-HUA-001", Array.isArray(packet?.huaQi?.sourceRuleIds) && packet.huaQi.sourceRuleIds.includes("ZPZQ-HUA-001"));

let rendered = "";
try { rendered = renderChartPrompt(packet); } catch (e) { console.log(`  render error: ${e.message}`); }

t("[D] render มี '化氣格 verdict'",            rendered.includes("化氣格 verdict"));
t("[D] render มี '真化'",                       rendered.includes("真化"));
t("[D] render มี '化氣格 สรุป'",                rendered.includes("化氣格 สรุป"));

/* Mai = ไม่มีคู่ → packet.huaQi = null + ไม่มี block render */
const mai = CASES[4];
const calcMai = mkMockCalc(mai.natal, mai.natal.day.stem);
calcMai.geJu = { structure: "雜氣正印格", confidence: "moderate" };
let packetMai;
try { packetMai = buildStructuredChartPacket(calcMai, mkMockExt(), mai.natal.day.stem, 40, g, null, null, null, {}); } catch (e) {}
t("[D] Mai (no 五合) → packet.huaQi = null",    packetMai?.huaQi === null);
const renderedMai = packetMai ? renderChartPrompt(packetMai) : "";
t("[D] Mai render ไม่มี '化氣格 verdict'",      !renderedMai.includes("化氣格 verdict"));

/* ── สรุป ── */
console.log(`\n[wrapper-8 化氣格 promote] ${pass} pass · ${fail} fail · รวม ${pass + fail}`);
if (fail > 0) process.exit(1);
process.exit(0);
