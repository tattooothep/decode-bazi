import { computeQiyunLock } from "../src/lib/bazi-qiyun.ts";
import { calcBazi } from "../src/lib/bazi-calc.ts";
import { buildChartExtensions } from "../src/lib/chart-extensions.ts";
import { buildStructuredChartPacket, renderChartPrompt } from "../src/lib/chart-packet.ts";

let pass = 0;
let fail = 0;

function ok(name: string, cond: unknown) {
  if (cond) {
    pass += 1;
    console.log(`✓ ${name}`);
  } else {
    fail += 1;
    console.error(`✗ ${name}`);
  }
}

const mother = await computeQiyunLock({
  date: "1970-11-14",
  gender: "F",
  birthTimeKnown: false,
  lng: 100.5018,
  targetYear: 2026,
});

ok("mother 3p emits HK_QIYUN_LOCK_V1", mother.tag === "HK_QIYUN_LOCK_V1");
ok("mother 3p uses full-day range, not exact fake time", mother.mode === "3p_range" && mother.authority === "full_day_interval");
ok("mother qiyun range is around age 2, not hard-coded 10", !!mother.startAgeRange && mother.startAgeRange.min > 1.5 && mother.startAgeRange.max < 2.8);
ok("mother direction is reverse/backward for yang year female", mother.direction === "backward");
ok("mother first luck pillar is 丙戌", mother.scenarios[0]?.luckSequence[0]?.stem === "丙" && mother.scenarios[0]?.luckSequence[0]?.branch === "戌");
ok("mother 2026 target candidates include 辛巳 and not 壬午", mother.targetYearDayun.candidates.some((c) => c.stem === "辛" && c.branch === "巳") && !mother.targetYearDayun.candidates.some((c) => c.stem === "壬" && c.branch === "午"));

const child = await computeQiyunLock({
  date: "1996-05-05",
  gender: "M",
  birthTimeKnown: false,
  lng: 100.5018,
  targetYear: 2026,
});

const childMonths = new Set(child.scenarios.map((s) => s.monthPillar));
ok("child 1996-05-05 no-time emits scenario lock on Lixia day", child.mode === "3p_scenario" && child.scenarios.length >= 2);
ok("child scenarios include before/after month pillars 壬辰 and 癸巳", childMonths.has("壬辰") && childMonths.has("癸巳"));
ok("child qiyun overall range spans near-zero and around-ten branches, not a single 10 fallback", !!child.startAgeRange && child.startAgeRange.min < 0.5 && child.startAgeRange.max > 9.5);
ok("child target year is not falsely collapsed when candidates differ", child.targetYearDayun.status === "ambiguous" || child.targetYearDayun.status === "locked");

const exact = await computeQiyunLock({
  date: "1970-11-14",
  time: "12:00",
  gender: "F",
  birthTimeKnown: true,
  lng: 100.5018,
  targetYear: 2026,
});

ok("4p exact keeps tyme4ts ChildLimit authority", exact.mode === "4p_exact" && exact.authority === "tyme4ts_childlimit");
ok("4p exact does not fallback to startAge 10", exact.representativeStartAge !== 10 && exact.startAgeRange?.min === exact.startAgeRange?.max);

const motherCalc = await calcBazi({
  date: "1970-11-14",
  longitude: 100.5018,
  gmtOffsetHours: 7,
  gender: "F",
  birthTimeKnown: false,
});
const motherExt = buildChartExtensions(
  motherCalc.pillars,
  new Date("2026-06-16T12:00:00+07:00"),
  "F",
  new Date("1970-11-14T12:00:00+07:00"),
  mother.representativeStartAge ?? 0,
  motherCalc.geJu.structure,
  motherCalc.strength.percent,
  motherCalc.yongshen[0]?.element,
  motherCalc.yongshen.map((x) => x.element),
);
const motherPacket = buildStructuredChartPacket(
  motherCalc,
  motherExt,
  motherCalc.dayMaster,
  56,
  {},
  null,
  "F",
  null,
  { qiyunLock: mother },
);
const motherPrompt = renderChartPrompt(motherPacket);
ok("rendered prompt exposes HK_QIYUN_LOCK_V1", motherPrompt.includes("HK_QIYUN_LOCK_V1"));
ok("rendered prompt exposes qiyun target candidate 辛巳", /HK_QIYUN_LOCK_V1[\s\S]*candidates=s1:辛巳/.test(motherPrompt));
ok("rendered prompt labels 3p representative as not exact birth time", motherPrompt.includes("ค่าตัวแทนสำหรับเรียง engine 3p ไม่ใช่เวลาเกิดจริง"));

console.log(`\n=== ${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"} ===`);
process.exit(fail ? 1 : 0);
