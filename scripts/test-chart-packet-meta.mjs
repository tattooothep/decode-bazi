/* Chart packet meta regression — dayBoundary/timePillarConfidence + interactionConflictSummary render ถึง prompt
   รัน: node --experimental-strip-types --loader ./scripts/ts-loader.mjs scripts/test-chart-packet-meta.mjs */
import { renderChartPrompt } from "../src/lib/chart-packet.ts";

const packet = {
  packetVersion: "hourkey-chart-packet-lite-v1.0",
  packetLevel: "step1_lite",
  meta: {
    mode: "4p",
    dayMaster: "丙",
    dmElement: "fire",
    dmPolarity: "yang",
    ageNow: 30,
    readingOrder: "",
    dayBoundary: "00:00",
    dayBoundarySource: "explicit",
    timePillarConfidence: {
      level: "boundary_sensitive",
      reason: "เวลาจริงหลัง TST=23:30 อยู่แถบขอบวัน · ใช้ขอบวัน 00:00 จึงต้องระวังเสาวัน/Day Master",
    },
  },
  pillars: [],
  structure: { label: "印綬格", special: null, confidence: null },
  trueSolarTime: null,
  startLuckAge: null,
  rootedness: null,
  fivePalaces: null,
  sixRelatives: null,
  xiangShen: null,
  chengBaiNow: null,
  usefulGods: { yong: [], xi: [], ji: [], method: "derived_from_engine_top3_useful_elements", confidence: "engine_derived_not_sifu_final" },
  elementProfile: { counts: { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 }, voytekLevel: "กลาง" },
  currentLuck: null,
  luckTimeline: [],
  annualPillar: { stem: "丙", branch: "寅" },
  interactions: { status: "none_detected", raw: [] },
  luckInteractions: [],
  annualInteractions: [],
  interactionConflictSummary: [{
    scope: "natal",
    participantKey: "year↔hour",
    types: ["反吟", "六沖"],
    affectedPalaces: ["年", "時"],
    affectedTopicsLite: ["ภาพรวม"],
    note: "反吟เต็มเสาครอบแรงก้าน/กิ่งคู่เดียวกัน · อ่านเป็นชั้นเดียวก่อน ห้ามบวกผลซ้ำ",
  }],
  profile: {},
  kongWang: { dayVoids: [], yearVoids: [] },
  timeline: [],
  aiResponsePolicy: { sourceOfTruth: "chartPacket", noPercent: true, noPillarGuess: true, selectEvidence: { min: 3, max: 5 }, showFullChecklist: false },
};

const out = renderChartPrompt(packet);
const checks = [
  ["dayBoundary render", out.includes("ขอบวัน/Day boundary ที่ใช้คำนวณ: 00:00")],
  ["explicit source render", out.includes("ผู้ใช้/endpoint ส่งมาโดยตรง")],
  ["time confidence render", out.includes("ไวต่อขอบวัน/เที่ยงคืน")],
  ["conflict summary render", out.includes("สรุปปฏิกิริยาซ้อน") && out.includes("反吟+六沖")],
];

let fail = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? "✓" : "✗"} ${name}`);
  if (!ok) fail++;
}
console.log(`\n[chart packet meta] ${checks.length - fail}/${checks.length} passed`);
process.exit(fail ? 1 : 0);
