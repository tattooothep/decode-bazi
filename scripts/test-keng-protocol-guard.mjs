/* Regression: Keng 戊未 hot/dry chart guard
   - 大運 must be 辛亥 current, 庚戌 previous (not 庚辰 contamination)
   - 戊日未月 strict調候 must expose 癸 first
   - 財(水) is useful/regulator, so BY-08 must not become primary "guard against water"
   รัน: node --experimental-strip-types --loader ./scripts/ts-loader.mjs scripts/test-keng-protocol-guard.mjs */
import { calcBazi, getSolarTimeAtTST } from "../src/lib/bazi-calc.ts";
import { buildChartExtensions } from "../src/lib/chart-extensions.ts";
import { buildStructuredChartPacket, renderChartPrompt, validateChartPacket } from "../src/lib/chart-packet.ts";
import { computeSiLingDays } from "../src/lib/chart-table.ts";

let pass = 0, fail = 0;
function ok(desc, cond) {
  console.log(`${cond ? "✓" : "✗"} ${desc}`);
  cond ? pass++ : fail++;
}

const date = "1987-07-28", time = "22:00", lng = 100.5018, gender = "F";
const calc = await calcBazi({ date, time, longitude: lng, gmtOffsetHours: 7, gender, dayBoundary: "23:00", birthTimeKnown: true });
const tyme = await import("tyme4ts");
const { st } = await getSolarTimeAtTST({ date, time, longitude: lng, gmtOffsetHours: 7, birthTimeKnown: true });
const cl = tyme.ChildLimit.fromSolarTime(st, tyme.Gender.WOMAN);
const startAge = Math.round((cl.getYearCount() + cl.getMonthCount() / 12 + cl.getDayCount() / 365.25) * 100) / 100;
const today = new Date("2026-05-29T12:00:00+07:00");
const birth = new Date(`${date}T${time}:00+07:00`);
const ext = buildChartExtensions(
  calc.pillars,
  today,
  gender,
  birth,
  startAge,
  calc.geJu.structure || null,
  calc.strength.percent,
  calc.yongshen[0]?.element || null,
  calc.yongshen.map((x) => x.element),
);
const w7 = await import("../data/library/wrappers/7-yongshen-v2.js");
const dmR = w7.dmRootProfile(calc.pillars);
const allR = w7.rootednessAll(calc.pillars);
const lab = (e) => allR[e]?.rootedness_label || "no_root";
const rootedness = {
  dmElement: dmR.dm_element,
  dmLabel: dmR.rootedness_label,
  isExtremelyWeak: dmR.is_extremely_weak,
  isTokenOnly: dmR.is_token_only,
  all: { wood: lab("wood"), fire: lab("fire"), earth: lab("earth"), metal: lab("metal"), water: lab("water") },
};
const [yy, mm, dd] = date.split("-").map(Number);
const [hh, mi] = time.split(":").map(Number);
const packet = buildStructuredChartPacket(
  calc,
  ext,
  calc.dayMaster,
  39,
  {},
  rootedness,
  gender,
  computeSiLingDays(yy, mm, dd, hh, mi),
  { dayBoundary: "23:00", dayBoundarySource: "explicit" },
);
const prompt = renderChartPrompt(packet, { subjectLabel: "เค็ง·06c97193" });
const curIdx = packet.luckTimeline.findIndex((x) => x.isCurrent);
const prev = curIdx > 0 ? packet.luckTimeline[curIdx - 1] : null;

ok("pillars are Keng fixture 丁卯 丁未 戊寅 癸亥", `${calc.pillarsZh.year}${calc.pillarsZh.month}${calc.pillarsZh.day}${calc.pillarsZh.hour}` === "丁卯丁未戊寅癸亥");
ok("current luck is 辛亥", packet.currentLuck?.stem === "辛" && packet.currentLuck?.branch === "亥");
ok("previous luck is 庚戌, not 庚辰", prev?.stem === "庚" && prev?.branch === "戌");
ok("strict tiao hou 戊未 exposes 癸 first", packet.yongShenProtocols?.tiaoHou.strict?.dmStem === "戊" && packet.yongShenProtocols.tiaoHou.strict.monthBranch === "未" && packet.yongShenProtocols.tiaoHou.strict.primaryStems.includes("癸"));
ok("water remains engine yong", packet.usefulGods.yong.includes("water"));
ok("BY-08 flips to 印多用財 variant", packet.bingYao?.primary?.id === "BY-08P" && packet.bingYao.primary.diseaseElements.includes("fire") && packet.bingYao.primary.medicineElements.includes("water"));
ok("prompt prefixes luck lines with subject label", prompt.includes("[เค็ง·06c97193] LUCK LOCK"));
ok("prompt references current/previous luck", prompt.includes("大運ปัจจุบัน=辛亥") && prompt.includes("大運อดีต=庚戌"));
ok("prompt highlights climate turning point", prompt.includes("大運氣候轉折") && prompt.includes("ปี 2021"));
ok("prompt does not render removed Patch5 final verdict", !prompt.includes("FINAL VERDICT 用神ใช้จริงในชีวิต"));
ok("prompt labels month pillars as 流月", prompt.includes("流月03:庚辰"));
ok("prompt no longer renders old primary BY-08 medicine earth", !prompt.includes("病藥=BY-08 · 藥=ดิน"));
ok("validateChartPacket clean", validateChartPacket(packet).ok === true);

console.log(`\n=== ${pass}/${pass + fail} ${fail ? "❌ FAIL" : "✅ PASS"} ===`);
process.exit(fail ? 1 : 0);
