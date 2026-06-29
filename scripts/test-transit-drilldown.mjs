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
const promptNoTransit = renderChartPrompt(packet, { includeTransitDrilldown: false });
const promptGroupCompact = renderChartPrompt(packet, { includeTransitDrilldown: true, includeTransitMonthlyDrilldown: false, subjectLabel: "group-test" });
const cd = packet.transitDrilldown?.currentDecade;
const firstMonth = cd?.years?.[0]?.months?.[0];
const yearly = packet.yearlyLiuNianDrilldown;
const y2027 = yearly?.years?.find((y) => y.year === 2027);

ok("packet has current decade drilldown", !!cd);
ok("current decade has annual entries covering real DaYun date range", (cd?.years?.length || 0) >= 10 && !!cd?.startDate && !!cd?.endDate);
ok("each annual entry has 12 monthly entries", cd?.years?.every((y) => y.months.length === 12));
ok("month pillars are Jieqi-based, not AI-calculated", firstMonth?.monthMethod === "jieqi_major_term" && !!firstMonth?.jieqiStart?.date);
ok("month entries compare both day branch and luck branch", Array.isArray(firstMonth?.vsDayBranch) && Array.isArray(firstMonth?.vsLuckBranch));
ok("annual/month entries include target impacts", Array.isArray(cd?.years?.[0]?.impacts) && Array.isArray(firstMonth?.impacts));
ok("annual/month entries include hidden stems", (cd?.years?.[0]?.hiddenStems?.length || 0) > 0 && (firstMonth?.hiddenStems?.length || 0) > 0);
ok("prompt tells AI transit pillars are precomputed", prompt.includes("ไม่ต้องคำนวณเสาเอง"));
ok("prompt includes Jieqi method note", prompt.includes("เดือนจรใช้節氣หลักจริง"));
ok("packet has HK_LIUNIAN_YEAR_DRILLDOWN_V1 yearly compact drilldown", yearly?.tag === "HK_LIUNIAN_YEAR_DRILLDOWN_V1" && yearly.years.length >= 80);
ok("yearly compact rows bind LiuNian to DaYun and natal hits", !!y2027?.luck?.stem && Array.isArray(y2027?.natalBranchHits) && Array.isArray(y2027?.hiddenStems));
ok("prompt renders HK_LIUNIAN_YEAR_DRILLDOWN_V1 marker", prompt.includes("HK_LIUNIAN_YEAR_DRILLDOWN_V1"));
ok("prompt renders HK_LUCK_PILLAR_LOCK_V1 marker", prompt.includes("HK_LUCK_PILLAR_LOCK_V1"));
ok("prompt renders HK_QUERY_YEAR_LUCK_LOCK_V1 marker", prompt.includes("HK_QUERY_YEAR_LUCK_LOCK_V1"));
ok("prompt renders HK_YEAR_DAYUN_MAP_V2 marker", prompt.includes("HK_YEAR_DAYUN_MAP_V2"));
ok("prompt renders HK_YEAR_PILLAR_CALENDAR_LOCK_V1 marker", prompt.includes("HK_YEAR_PILLAR_CALENDAR_LOCK_V1"));
ok("prompt renders HK_LICHUN_YEAR_BOUNDARY_LOCK_V1 marker", prompt.includes("HK_LICHUN_YEAR_BOUNDARY_LOCK_V1"));
ok("prompt renders HK_JIAOYUN_BOUNDARY_LOCK_V1 marker", prompt.includes("HK_JIAOYUN_BOUNDARY_LOCK_V1"));
ok("prompt renders HK_BAZI_TIMING_LOCK_V1 marker", prompt.includes("HK_BAZI_TIMING_LOCK_V1"));
ok("prompt renders HK_BAZI_READ_ORDER_LOCK_V1 marker", prompt.includes("HK_BAZI_READ_ORDER_LOCK_V1"));
ok("prompt renders HK_MONTHLY_DRILLDOWN_SCOPE_V1 marker", prompt.includes("HK_MONTHLY_DRILLDOWN_SCOPE_V1"));
ok("prompt renders HK_SIFU_PREFLIGHT_V1 marker", prompt.includes("HK_SIFU_PREFLIGHT_V1"));
ok("prompt renders HK_CURRENT_LUCK_RESOLVED_V1 marker with exactly one current luck", prompt.includes("HK_CURRENT_LUCK_RESOLVED_V1") && prompt.includes("current_count=1"));
ok("prompt renders HK_SANHE_CANDIDATE_LOCK_V1 marker", prompt.includes("HK_SANHE_CANDIDATE_LOCK_V1"));
ok("prompt renders HK_TWO_SCENARIOS_V1 marker", prompt.includes("HK_TWO_SCENARIOS_V1"));
ok("prompt renders HK_SYNASTRY_RESOLVED_V1 guard marker", prompt.includes("HK_SYNASTRY_RESOLVED_V1"));
ok("prompt forbids AI from calculating yearly pillars itself", prompt.includes("ห้ามคำนวณ/ทดเสาปีเอง"));
ok("prompt maps queried Gregorian/Buddhist year to DaYun", /HK_QUERY_YEAR_LUCK_LOCK_V1[\s\S]*2027\/2570->/.test(prompt));
ok("prompt maps queried year to DaYun V2 with BaZi year boundary", /HK_YEAR_DAYUN_MAP_V2[\s\S]*2027\/2570:[\s\S]*dayun=/.test(prompt));
ok("prompt has explicit year calendar lock with Buddhist year", /HK_YEAR_PILLAR_CALENDAR_LOCK_V1[\s\S]*2027\/2570=/.test(prompt));
ok("prompt has explicit Li Chun boundary lock with Buddhist year", /HK_LICHUN_YEAR_BOUNDARY_LOCK_V1[\s\S]*2027\/2570:/.test(prompt));
ok("prompt preflight orders year calendar before year-luck map", prompt.indexOf("HK_YEAR_PILLAR_CALENDAR_LOCK_V1") > 0 && prompt.indexOf("HK_YEAR_PILLAR_CALENDAR_LOCK_V1") < prompt.indexOf("HK_QUERY_YEAR_LUCK_LOCK_V1"));
ok("no-transit render explicitly says LiuNian drilldown is omitted", promptNoTransit.includes("includeTransitDrilldown=false") && promptNoTransit.includes("ห้ามอ้างว่าตรวจปีจรครบ"));
ok("no-transit render keeps monthly scope unavailable lock", /HK_MONTHLY_DRILLDOWN_SCOPE_V1:[\s\S]*available=false/.test(promptNoTransit));
ok("no-transit render does not claim current-decade yearly scope", !promptNoTransit.includes("วัยจรปัจจุบัน+ปีจร 10 ปีรอบวัยจรนี้"));
ok("group compact render keeps year/luck/timing locks", promptGroupCompact.includes("HK_YEAR_PILLAR_CALENDAR_LOCK_V1") && promptGroupCompact.includes("HK_QUERY_YEAR_LUCK_LOCK_V1") && promptGroupCompact.includes("HK_YEAR_DAYUN_MAP_V2") && promptGroupCompact.includes("HK_BAZI_TIMING_LOCK_V1") && promptGroupCompact.includes("HK_SANHE_CANDIDATE_LOCK_V1"));
ok("group compact render omits monthly drilldown block", !promptGroupCompact.includes("เดือนจร=") && !promptGroupCompact.includes("เดือนจรใช้節氣หลักจริง"));
ok("group compact render explicitly marks monthly drilldown unavailable", /HK_MONTHLY_DRILLDOWN_SCOPE_V1:[\s\S]*available=false/.test(promptGroupCompact));

console.log(`\n=== ${pass}/${pass + fail} ${fail ? "❌ FAIL" : "✅ PASS"} ===`);
process.exit(fail ? 1 : 0);
