/**
 * test 化氣格 guard (option A · ระดับ1+2 · 27 พ.ค.)
 * รัน: node --experimental-strip-types --loader ./scripts/ts-loader.mjs scripts/test-geju-huaqi.mjs
 * กัน over-declare 化:
 *   • ตัวตนมีราก (partial/rooted/strong) → flag "合而不化" (ไม่แปร · เบื้องต้น)
 *   • ตัวตนรากบางมาก (token_root/微根) → flag "假化" (แปรปลอม · ไม่มั่นคง)
 *   • ไร้รากเลย (no_root) → 真化ได้จริง → ไม่ flag
 * test ผ่าน renderChartPrompt จริง (mock ChartPacket) · เช็คข้อความ flag ใน prompt
 */
import { renderChartPrompt } from "../src/lib/chart-packet.ts";

let pass = 0, fail = 0;
const HEHUA = "化氣格 หลักฐาน 3 ทาง";     // 合而不化 flag (ตัวตนมีราก)
const JIAHUA = "化氣格 หลักฐาน假化"; // 假化 flag (รากบางมาก)

function makePacket({ label = "ปกติ", special = null, rootedness = null } = {}) {
  return {
    packetVersion: "hourkey-chart-packet-lite-v1.0",
    packetLevel: "step1_lite",
    meta: { mode: "4p", dayMaster: "壬", dmElement: "water", dmPolarity: "yang", ageNow: 30, readingOrder: "" },
    pillars: [],
    structure: { label, special, confidence: null },
    trueSolarTime: null, startLuckAge: null, rootedness, fivePalaces: null,
    usefulGods: { yong: [], xi: [], ji: [], method: "derived_from_engine_top3_useful_elements", confidence: "engine_derived_not_sifu_final" },
    elementProfile: { counts: { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 }, voytekLevel: "กลาง" },
    currentLuck: null, luckTimeline: [], annualPillar: { stem: "甲", branch: "辰" },
    interactions: { status: "none_detected", raw: [] }, luckInteractions: [], annualInteractions: [],
    profile: {}, kongWang: { dayVoids: [], yearVoids: [] }, timeline: [],
    aiResponsePolicy: { sourceOfTruth: "classics_first_packet_evidence", noPercent: true, noPillarGuess: true, selectEvidence: { min: 3, max: 5 }, showFullChecklist: false },
  };
}
function root(dmLabel) {
  return { dmElement: "water", dmLabel, isExtremelyWeak: dmLabel === "no_root", isTokenOnly: dmLabel === "token_root",
    all: { wood: "no_root", fire: "no_root", earth: "no_root", metal: "no_root", water: dmLabel } };
}
const render = (o) => renderChartPrompt(makePacket(o));
const hasHe = (out) => out.includes(HEHUA);
const hasJia = (out) => out.includes(JIAHUA);
const anyFlag = (out) => hasHe(out) || hasJia(out);
function t(label, got, exp) { const ok = got === exp; console.log(`  ${ok ? "✅" : "❌"} ${label}: ${got}`); ok ? pass++ : fail++; }

/* ── ตัวตนมีราก → 合而不化 flag (ระดับ 1) ── */
t("化木格 + rooted → flag 合而不化", hasHe(render({ label: "化木格", rootedness: root("rooted") })), true);
t("化火格 + strong_root → flag 合而不化", hasHe(render({ label: "化火格", rootedness: root("strong_root") })), true);
t("化水格 + partial_root → flag 合而不化", hasHe(render({ label: "化水格", rootedness: root("partial_root") })), true);
t("化木格 + rooted → ไม่ใช่ 假化", hasJia(render({ label: "化木格", rootedness: root("rooted") })), false);

/* ── ตัวตนรากบางมาก(微根) → 假化 flag (ระดับ 2 · ใหม่) ── */
t("化木格 + token_root → flag 假化", hasJia(render({ label: "化木格", rootedness: root("token_root") })), true);
t("化木格 + token_root → ไม่ใช่ 合而不化", hasHe(render({ label: "化木格", rootedness: root("token_root") })), false);
t("special 化火格 + token_root → flag 假化", hasJia(render({ label: "ปกติ", special: { typeZh: "化火格", friendly: [] }, rootedness: root("token_root") })), true);

/* ── ไร้รากเลย → 真化 → ไม่ flag เลย ── */
t("化木格 + no_root → ไม่ flag (真化)", anyFlag(render({ label: "化木格", rootedness: root("no_root") })), false);

/* ── false-positive guard ── */
t("正財格 + rooted → ไม่ flag", anyFlag(render({ label: "正財格", rootedness: root("rooted") })), false);
t("從財格 + no_root → ไม่ flag", anyFlag(render({ label: "從財格", rootedness: root("no_root") })), false);
t("化木格 + rootedness=null → ไม่ flag", anyFlag(render({ label: "化木格", rootedness: null })), false);
t("special 化火格 + rooted → flag 合而不化", hasHe(render({ label: "ปกติ", special: { typeZh: "化火格", friendly: [] }, rootedness: root("rooted") })), true);

console.log(`\n[化氣格 guard ระดับ1+2] ${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
