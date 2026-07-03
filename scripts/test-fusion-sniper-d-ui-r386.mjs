// r386 · ทดสอบการ์ด 🎯 ชั้นเข็ม D (จุดกึ่งกลาง Uranian) + หน้าต่างพีค บน master-fusion.html
//   (1) data ไม่มี d/windows → การ์ดเดิม "เป๊ะ" (เทียบ byte กับฟังก์ชันจาก backup ก่อน r386)
//   (2) มี windows → แถบ 🎯 พีค บนสุด (เฉพาะหน้าต่างเด่น ≤2) · มี d → ท้ายเหตุผลวันเด่น "ชี้ชัด ±1 วัน"
//   (3) i18n 3 ภาษา ไม่มีคีย์ดิบหลุด · orb <1′ ไม่กลายเป็น 0′
// หมายเหตุ: ไม่มี jsdom → extract ฟังก์ชันจริงจาก HTML มารันกับ stub (แนวเดียวกับ test-fusion-hist-sniper-r384.mjs)
// run: node scripts/test-fusion-sniper-d-ui-r386.mjs
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import os from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(path.join(ROOT, "public", "master-fusion.html"), "utf8");
const BACKUP_PATH = "/root/backups/day-sniper-zoom-20260703-204603.html"; // สภาพก่อน r386 (การ์ดเดิม)
const srcOld = fs.existsSync(BACKUP_PATH) ? fs.readFileSync(BACKUP_PATH, "utf8") : null;

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { if (cond) { pass++; console.log(`✅ ${name}`); } else { fail++; console.log(`❌ ${name} ${detail}`); } };

function extractFrom(source, name) {
  const idx = source.indexOf(`function ${name}(`);
  if (idx < 0) throw new Error(`missing function ${name}`);
  let depth = 0;
  for (let j = source.indexOf("{", idx); j < source.length; j++) {
    if (source[j] === "{") depth++;
    else if (source[j] === "}") { depth--; if (!depth) return source.slice(idx, j + 1); }
  }
  throw new Error(`unbalanced ${name}`);
}
function extractI18NFrom(source) {
  const at = source.indexOf("var I18N = {");
  let depth = 0;
  for (let j = source.indexOf("{", at); j < source.length; j++) {
    if (source[j] === "{") depth++;
    else if (source[j] === "}") { depth--; if (!depth) return new Function(source.slice(at, j + 1) + "\nreturn I18N;")(); }
  }
  throw new Error("unbalanced I18N");
}

const mkClassList = () => {
  const s = new Set();
  return { add: (c) => s.add(c), remove: (c) => s.delete(c), toggle: (c, f) => { if (f === undefined) f = !s.has(c); f ? s.add(c) : s.delete(c); return f; }, contains: (c) => s.has(c) };
};

function makeSandbox(source, { mobile = false, locale = "th" } = {}) {
  const I18N = extractI18NFrom(source);
  const t = (k) => (I18N[locale] && I18N[locale][k] != null) ? I18N[locale][k] : (I18N.th[k] != null ? I18N.th[k] : k);
  const state = { locale, resonance: null };
  const els = { sniper: { innerHTML: "", classList: mkClassList() }, resonance: { innerHTML: "", classList: mkClassList() } };
  const store = new Map();
  const sessionStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const isMobileFold = () => !!mobile;
  const prelude = "var FOLD_PREF_KEY = 'hk_fusion5_fold';\nvar foldJobKey = '';\nvar SNP_FLAG = { red:'\u{1F534}', yellow:'\u{1F7E1}', green:'\u{1F7E2}' };\n";
  const code = prelude + [
    extractFrom(source, "esc"), extractFrom(source, "loadFoldPref"), extractFrom(source, "cardFoldState"), extractFrom(source, "applyCardFold"),
    extractFrom(source, "sniperFoldSummary"), extractFrom(source, "sniperHasContent"), extractFrom(source, "sniperStripHtml"),
    extractFrom(source, "sniperPersonHtml"), extractFrom(source, "renderDaySniper"),
  ].join("\n");
  const factory = new Function("t", "state", "els", "sessionStorage", "isMobileFold",
    code + "\nreturn { renderDaySniper, sniperPersonHtml };");
  return { fns: factory(t, state, els, sessionStorage, isMobileFold), els };
}

const mkDay = (dateISO, flag, needles, extra = {}) => Object.assign({ dateISO, ganzhi: "甲子", flag, needles, a: [], b: [], c: [], context: [] }, extra);
const D_HIT = { mid: "Sun/Mars", midTh: "อาทิตย์/อังคาร", transiter: "Saturn", transiterTh: "เสาร์", orbArcmin: 4.4, applying: true };

// fixture เดิมแบบ r384 (ไม่มี d/windows — jsonb เก่า)
function buildLegacyDS() {
  return {
    version: "day_sniper_v1", topicKey: "money", topicTh: "การเงิน", fromISO: "2026-07-01", toISO: "2026-09-30",
    perPerson: [{
      name: "เอี๊ยว", skippedNote: null, totals: { red: 2, yellow: 1, green: 1 }, droppedCount: 0, scannedDays: 92,
      days: [
        mkDay("2026-07-19", "red", ["A", "B"], { a: [{ rule: "沖", strength: "strong_warning", pillarKey: "day", detail: "流日辛巳 沖(巳亥) เสาวัน(己亥)", canonRef: "x" }] }),
        mkDay("2026-07-25", "red", ["A", "C"], { c: [{ transit: "Saturn", natal: "Moon", aspect: "square", polarity: "warning", dateISO: "2026-07-25", detail: "เสาร์เหลี่ยมกดจันทร์กำเนิด (exact 2026-07-25)" }] }),
        mkDay("2026-08-02", "yellow", ["A"]),
        mkDay("2026-08-06", "green", ["A", "B"], { b: [{ targetTh: "ดาวศุภเคราะห์", targetName: "Jupiter", aspect: "trine", polarity: "benefic", timeTH: "", detail: "จันทร์△พฤหัสกำเนิด (มุมดี)" }] }),
      ],
    }],
    notes: [],
  };
}
// fixture r386: วันแดงตัวแรกมี d + windows 3 หน้าต่าง (เด่น 2 + เหลืองไม่เด่น 1)
function buildDS386() {
  const ds = buildLegacyDS();
  const p = ds.perPerson[0];
  p.days[0].d = { hits: [D_HIT, { ...D_HIT, mid: "Moon/MC", midTh: "จันทร์/กลางฟ้า", transiter: "Neptune", transiterTh: "เนปจูน", orbArcmin: 9.8 }], score: 10.8 };
  p.days[1].d = { hits: [], score: 0 };
  p.windows = [
    { fromISO: "2026-07-19", toISO: "2026-07-19", peakISO: "2026-07-19", peakFlag: "red", plusMinusDays: 1, reasonTh: "จุดกึ่งกลาง อาทิตย์/อังคาร ถูกเสาร์จรกระตุ้น เป๊ะ 4′", peakHit: { mid: "Sun/Mars", midTh: "อาทิตย์/อังคาร", transiter: "Saturn", transiterTh: "เสาร์", orbArcmin: 4.4 } },
    { fromISO: "2026-07-25", toISO: "2026-07-25", peakISO: "2026-07-25", peakFlag: "red", plusMinusDays: 1, reasonTh: "เข็มอิสระ ≥2 เรือนชี้ช่วงเดียวกัน", peakHit: null },
    { fromISO: "2026-08-02", toISO: "2026-08-02", peakISO: "2026-08-02", peakFlag: "yellow", plusMinusDays: 1, reasonTh: "สัญญาณแรงเดี่ยว", peakHit: null },
  ];
  return ds;
}

// ===== 1) ไม่มี d/windows → การ์ดเดิมเป๊ะ (byte เทียบกับ backup ก่อน r386) =====
{
  const now = makeSandbox(src);
  now.fns.renderDaySniper(buildLegacyDS());
  const htmlNow = now.els.sniper.innerHTML;
  ok("data เก่า (ไม่มี d/windows): ไม่มีแถบพีค/ชี้ชัด โผล่", !htmlNow.includes("snp-win") && !htmlNow.includes("ชี้ชัด ±1 วัน") && !htmlNow.includes("🎯 พีค"));
  if (srcOld) {
    const old = makeSandbox(srcOld);
    old.fns.renderDaySniper(buildLegacyDS());
    ok("byte-identical กับการ์ดก่อน r386 (backup)", htmlNow === old.els.sniper.innerHTML, "diff at " + [...htmlNow].findIndex((c, i) => c !== old.els.sniper.innerHTML[i]));
  } else {
    ok("backup ก่อน r386 หาย — ข้ามเทียบ byte (ต้องมีไฟล์ backup)", false, BACKUP_PATH);
  }
}

// ===== 2) มี windows + d → แถบพีคบนสุด + ท้ายเหตุผล "ชี้ชัด ±1 วัน" =====
{
  const s = makeSandbox(src);
  s.fns.renderDaySniper(buildDS386());
  const html = s.els.sniper.innerHTML;
  ok("แถบ 🎯 พีค ขึ้น (snp-wins)", html.includes("snp-wins") && html.includes("🎯 พีค"));
  ok("พีคใช้วันที่แบบมนุษย์ + (±1 วัน)", html.includes("19 ก.ค.") && html.includes("(±1 วัน)"));
  ok("เหตุผลพีค = ข้อเท็จจริงเรขาคณิต (มี D)", html.includes("จุดกึ่งกลาง อาทิตย์/อังคาร ถูกเสาร์จรกระตุ้น เป๊ะ 4′"));
  ok("หน้าต่างแดงไม่มี D → เหตุผลกลุ่มสัญญาณ (winMulti)", html.includes("หลายสัญญาณเกาะกลุ่มช่วงนี้"));
  ok("หน้าต่างเด่นจำกัด ≤2 (เหลืองไม่เด่นถูกกรอง)", (html.match(/class="snp-win"/g) || []).length === 2);
  ok("แถบพีคอยู่บนสุด (มาก่อนบรรทัดอธิบาย)", html.indexOf("snp-wins") < html.indexOf("snp-explain"));
  ok("วันเด่นที่มี D → ท้ายเหตุผล ชี้ชัด ±1 วัน (จุดกึ่งกลางเป๊ะ 4′)", html.includes("ชี้ชัด ±1 วัน (จุดกึ่งกลางเป๊ะ 4′)"));
  const whys = [...html.matchAll(/class="snp-day-why">([^<]*)</g)].map((m) => m[1]);
  ok("วันแดงที่ d.hits ว่าง → ไม่มี ชี้ชัด (ไม่โกหกความคม)", whys.some((w) => w.includes("เสาร์เหลี่ยมกดจันทร์กำเนิด") && !w.includes("ชี้ชัด")));
  ok("วันเขียว (ไม่มี d ตาม cascade) → ไม่มี ชี้ชัด", whys.some((w) => w.includes("จันทร์จริงทำมุมดีกับดาวศุภเคราะห์") && !w.includes("ชี้ชัด")));
  ok("ไม่มีศัพท์เข็มดิบ/คีย์ i18n ดิบหลุด", !/ds\.[a-zA-Z]/.test(html) && !/[>"\s](A\+B|B\+C|A\+C|A\+B\+C)[<"\s]/.test(html));
}

// ===== 3) orb <1′ ไม่กลายเป็น 0′ =====
{
  const s = makeSandbox(src);
  const ds = buildDS386();
  ds.perPerson[0].days[0].d.hits[0] = { ...D_HIT, orbArcmin: 0.2 };
  ds.perPerson[0].windows[0].peakHit.orbArcmin = 0.2;
  s.fns.renderDaySniper(ds);
  const html = s.els.sniper.innerHTML;
  ok("orb 0.2′ แสดง 0.2′ ไม่ใช่ 0′", html.includes("เป๊ะ 0.2′") && !html.includes("เป๊ะ 0′"));
}

// ===== 4) i18n en/zh =====
{
  const en = makeSandbox(src, { locale: "en" });
  en.fns.renderDaySniper(buildDS386());
  const htmlEn = en.els.sniper.innerHTML;
  ok("en: Peak + pinpoint ±1 day + ชื่อดาวอังกฤษจาก mid key", htmlEn.includes("🎯 Peak") && htmlEn.includes("pinpoint ±1 day (midpoint exact 4′)") && htmlEn.includes("midpoint Sun/Mars triggered by transiting Saturn, exact 4′"));
  const zh = makeSandbox(src, { locale: "zh" });
  zh.fns.renderDaySniper(buildDS386());
  const htmlZh = zh.els.sniper.innerHTML;
  ok("zh: 峰值 + 可鎖定±1天 + 中點", htmlZh.includes("🎯 峰值") && htmlZh.includes("可鎖定±1天（中點精準4′）") && htmlZh.includes("中點 Sun/Mars 受行運Saturn觸發 精準4′"));
  ok("en/zh: ไม่มีคีย์ ds. ดิบหลุด", ![htmlEn, htmlZh].some((h) => /ds\.[a-zA-Z]/.test(h)));
  // คีย์ใหม่ครบ 3 ภาษา (source-level)
  const KEYS = ["'ds.peak'", "'ds.dPin'", "'ds.dWhy'", "'ds.winMulti'"];
  const th = src.slice(src.indexOf("th:{"), src.indexOf("en:{"));
  const enS = src.slice(src.indexOf("en:{"), src.indexOf("zh:{"));
  const zhS = src.slice(src.indexOf("zh:{"));
  ok("i18n r386 ครบ 3 ภาษา (4 คีย์)", KEYS.every((k) => th.includes(k) && enS.includes(k) && zhS.includes(k)), KEYS.filter((k) => !(th.includes(k) && enS.includes(k) && zhS.includes(k))).join(","));
}

// ===== 5) มือถือพับ (r382) ยังทำงานกับการ์ดที่มีแถบพีค + CSS 2 ธีม =====
{
  const s = makeSandbox(src, { mobile: true });
  s.fns.renderDaySniper(buildDS386());
  ok("มือถือ: การ์ดเริ่มพับ (hk-fold) เหมือนเดิม", s.els.sniper.classList.contains("hk-fold"));
  ok("CSS .snp-win มี + ธีมสว่าง override", src.includes(".snp-win{") && src.includes('[data-theme="light"] .snp-win'));
}

// ===== 6) script ทั้งก้อน parse ผ่าน (node --check) =====
{
  const blocks = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  let allOk = blocks.length > 0;
  blocks.forEach((b, i) => {
    const f = path.join(os.tmpdir(), `mf-r386-${process.pid}-${i}.js`);
    fs.writeFileSync(f, b[1]);
    try { execFileSync(process.execPath, ["--check", f], { stdio: "pipe" }); } catch { allOk = false; }
    fs.unlinkSync(f);
  });
  ok(`script block ทุกก้อน parse ผ่าน (${blocks.length} ก้อน)`, allOk);
}

console.log(`\nผล: ${pass} ผ่าน · ${fail} ไม่ผ่าน`);
process.exit(fail ? 1 : 0);
