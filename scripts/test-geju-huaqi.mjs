/**
 * test 化氣格 guard (option A · 27 พ.ค.)
 * รัน: node --experimental-strip-types --loader ./scripts/ts-loader.mjs scripts/test-geju-huaqi.mjs
 * กัน over-declare 化: ถ้า structure=化X格 + DM ยังมีราก → flag "เบื้องต้น" ให้ตรวจ真假化 ไม่ฟันธง
 * test ผ่าน renderChartPrompt จริง (mock ChartPacket) · เช็คข้อความ flag ใน prompt
 */
import { renderChartPrompt } from "../src/lib/chart-packet.ts";

let pass = 0, fail = 0;
const FLAG = "化氣格 = เบื้องต้น";

/* mock ChartPacket เต็ม (ค่าว่าง/null สำหรับ field ที่ guard ไม่ใช้) */
function makePacket({ label = "ปกติ", special = null, rootedness = null } = {}) {
  return {
    packetVersion: "hourkey-chart-packet-lite-v1.0",
    packetLevel: "step1_lite",
    meta: { mode: "4p", dayMaster: "壬", dmElement: "water", dmPolarity: "yang", ageNow: 30, readingOrder: "" },
    pillars: [],
    structure: { label, special, confidence: null },
    trueSolarTime: null,
    startLuckAge: null,
    rootedness,
    fivePalaces: null,
    usefulGods: { yong: [], xi: [], ji: [], method: "derived_from_engine_top3_useful_elements", confidence: "engine_derived_not_sifu_final" },
    elementProfile: { counts: { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 }, voytekLevel: "กลาง" },
    currentLuck: null,
    luckTimeline: [],
    annualPillar: { stem: "甲", branch: "辰" },
    interactions: { status: "none_detected", raw: [] },
    luckInteractions: [],
    annualInteractions: [],
    profile: {},
    kongWang: { dayVoids: [], yearVoids: [] },
    timeline: [],
    aiResponsePolicy: { sourceOfTruth: "chartPacket", noPercent: true, noPillarGuess: true, selectEvidence: { min: 3, max: 5 }, showFullChecklist: false },
  };
}
function root(dmLabel) {
  return { dmElement: "water", dmLabel, isExtremelyWeak: dmLabel === "no_root", isTokenOnly: dmLabel === "token_root",
    all: { wood: "no_root", fire: "no_root", earth: "no_root", metal: "no_root", water: dmLabel } };
}
function has(out) { return out.includes(FLAG); }
function t(label, got, exp) { const ok = got === exp; console.log(`  ${ok ? "✅" : "❌"} ${label}: ${got}`); ok ? pass++ : fail++; }

/* 1. 化格 + DM มีราก (rooted) → ต้อง flag */
t("化木格 + rooted → flag", has(renderChartPrompt(makePacket({ label: "化木格", rootedness: root("rooted") }))), true);
/* 2. 化格 + DM รากแข็ง → flag */
t("化火格 + strong_root → flag", has(renderChartPrompt(makePacket({ label: "化火格", rootedness: root("strong_root") }))), true);
/* 3. 化格 + รากบางส่วน (boundary) → flag */
t("化水格 + partial_root → flag", has(renderChartPrompt(makePacket({ label: "化水格", rootedness: root("partial_root") }))), true);
/* 4. 化格 + DM ไร้ราก (真化ถูก) → ไม่ flag */
t("化木格 + no_root → ไม่ flag (真化)", has(renderChartPrompt(makePacket({ label: "化木格", rootedness: root("no_root") }))), false);
/* 5. 化格 + DM รากบางมาก (token · เกือบไร้ราก = 真化) → ไม่ flag */
t("化木格 + token_root → ไม่ flag (真化)", has(renderChartPrompt(makePacket({ label: "化木格", rootedness: root("token_root") }))), false);
/* 6. ดวงปกติ (ไม่化) + rooted → ไม่ flag */
t("正財格 + rooted → ไม่ flag", has(renderChartPrompt(makePacket({ label: "正財格", rootedness: root("rooted") }))), false);
/* 7. 化格 + rootedness=null (group/ไม่ส่ง) → ไม่ flag (guard) */
t("化木格 + rootedness=null → ไม่ flag", has(renderChartPrompt(makePacket({ label: "化木格", rootedness: null }))), false);
/* 8. special.typeZh=化X格 (special_chart path) + rooted → flag */
t("special 化火格 + rooted → flag", has(renderChartPrompt(makePacket({ label: "ปกติ", special: { typeZh: "化火格", friendly: [] }, rootedness: root("rooted") }))), true);
/* 9. 從格 (ไม่ใช่化 · DM ไร้ราก) → ไม่ flag */
t("從財格 + no_root → ไม่ flag", has(renderChartPrompt(makePacket({ label: "從財格", rootedness: root("no_root") }))), false);

console.log(`\n[化氣格 guard] ${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
