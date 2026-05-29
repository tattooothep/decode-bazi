/* Regression: current 大運 drilldown must reach AI Sifu packet.
   รัน: node --experimental-strip-types --loader ./scripts/ts-loader.mjs scripts/test-transit-drilldown.mjs */
import { calcBazi } from "../src/lib/bazi-calc.ts";
import { buildChartExtensions } from "../src/lib/chart-extensions.ts";
import { buildStructuredChartPacket, renderChartPrompt } from "../src/lib/chart-packet.ts";

let pass = 0, fail = 0;
function ok(desc, cond) {
  console.log(`${cond ? "✓" : "✗"} ${desc}`);
  cond ? pass++ : fail++;
}

const calc = await calcBazi({
  date: "1984-12-31",
  time: "13:15",
  longitude: 100.5018,
  gmtOffsetHours: 7,
  gender: "F",
  dayBoundary: "00:00",
  birthTimeKnown: true,
});
const birthDate = new Date("1984-12-31T13:15:00+07:00");
const today = new Date("2026-05-29T12:00:00+07:00");
const ageNow = Math.floor((today.getTime() - birthDate.getTime()) / (365.25 * 86400000));
const ext = buildChartExtensions(
  calc.pillars,
  today,
  "F",
  birthDate,
  10,
  calc.geJu.structure,
  calc.strength.percent,
  calc.yongshen[0]?.element,
  calc.yongshen.map((x) => x.element),
);
const packet = buildStructuredChartPacket(
  calc,
  ext,
  calc.dayMaster,
  ageNow,
  {},
  null,
  "F",
  null,
  { dayBoundary: "00:00", dayBoundarySource: "explicit" },
);
const prompt = renderChartPrompt(packet);
const cd = packet.transitDrilldown?.currentDecade;
const firstMonth = cd?.years?.[0]?.months?.[0];

ok("packet has current decade drilldown", !!cd);
ok("current decade has annual entries covering real DaYun date range", (cd?.years?.length || 0) >= 10 && !!cd?.startDate && !!cd?.endDate);
ok("each annual entry has 12 monthly entries", cd?.years?.every((y) => y.months.length === 12));
ok("month pillars are Jieqi-based, not AI-calculated", firstMonth?.monthMethod === "jieqi_major_term" && !!firstMonth?.jieqiStart?.date);
ok("month entries compare both day branch and luck branch", Array.isArray(firstMonth?.vsDayBranch) && Array.isArray(firstMonth?.vsLuckBranch));
ok("annual/month entries include target impacts", Array.isArray(cd?.years?.[0]?.impacts) && Array.isArray(firstMonth?.impacts));
ok("annual/month entries include hidden stems", (cd?.years?.[0]?.hiddenStems?.length || 0) > 0 && (firstMonth?.hiddenStems?.length || 0) > 0);
ok("prompt tells AI transit pillars are precomputed", prompt.includes("ไม่ต้องคำนวณเสาเอง"));
ok("prompt includes Jieqi method note", prompt.includes("เดือนจรใช้節氣หลักจริง"));

console.log(`\n=== ${pass}/${pass + fail} ${fail ? "❌ FAIL" : "✅ PASS"} ===`);
process.exit(fail ? 1 : 0);
