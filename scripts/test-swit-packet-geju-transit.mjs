/* Golden · Swit packet/prompt must expose the corrected classic evidence.
 * รัน: node --experimental-strip-types --loader ./scripts/ts-loader.mjs scripts/test-swit-packet-geju-transit.mjs */
import * as tyme from "tyme4ts";
import { calcBazi, getSolarTimeAtTST } from "../src/lib/bazi-calc.ts";
import { buildChartExtensions } from "../src/lib/chart-extensions.ts";
import { computeSiLingDays } from "../src/lib/chart-table.ts";
import { buildStructuredChartPacket, renderChartPrompt } from "../src/lib/chart-packet.ts";
import { extractTraceFacts, validateTrace } from "../src/lib/sifu-trace-lock.ts";

let pass = 0, fail = 0;
function ok(label, cond, detail = "") {
  console.log(`${cond ? "✓" : "✗"} ${label}${detail ? `\n  ${detail}` : ""}`);
  cond ? pass++ : fail++;
}

async function computeStartAge(date, time, gender, longitude) {
  const { st } = await getSolarTimeAtTST({
    date,
    time,
    longitude,
    gmtOffsetHours: 7,
    gender,
    dayBoundary: "00:00",
    birthTimeKnown: true,
  });
  const g = gender === "F" ? tyme.Gender.WOMAN : tyme.Gender.MAN;
  const cl = tyme.ChildLimit.fromSolarTime(st, g);
  return Math.round((cl.getYearCount() + cl.getMonthCount() / 12 + cl.getDayCount() / 365.25) * 100) / 100;
}

const birth = { date: "1997-01-20", time: "17:40", longitude: 100.5018, gender: "M" };
const calc = await calcBazi({
  date: birth.date,
  time: birth.time,
  longitude: birth.longitude,
  gmtOffsetHours: 7,
  gender: birth.gender,
  dayBoundary: "00:00",
  birthTimeKnown: true,
});
const today = new Date("2026-06-13T12:00:00+07:00");
const birthDate = new Date(`${birth.date}T${birth.time}:00+07:00`);
const startAge = await computeStartAge(birth.date, birth.time, birth.gender, birth.longitude);
const ext = buildChartExtensions(
  calc.pillars,
  today,
  birth.gender,
  birthDate,
  startAge,
  calc.geJu.structure,
  calc.strength.percent,
  calc.yongshen[0]?.element,
  calc.yongshen.map((x) => x.element),
);
const [y, mo, d] = birth.date.split("-").map(Number);
const [h, mi] = birth.time.split(":").map(Number);
const ageNow = today.getUTCFullYear() - birthDate.getUTCFullYear();
const packet = buildStructuredChartPacket(
  calc,
  ext,
  calc.dayMaster,
  ageNow,
  {},
  null,
  birth.gender,
  computeSiLingDays(y, mo, d, h, mi),
  { dayBoundary: "00:00", dayBoundarySource: "explicit" },
);
const prompt = renderChartPrompt(packet);

ok("pillars lock Swit fixture", `${calc.pillarsZh.year} ${calc.pillarsZh.month} ${calc.pillarsZh.day} ${calc.pillarsZh.hour}` === "丙子 辛丑 壬戌 己酉",
  `${calc.pillarsZh.year} ${calc.pillarsZh.month} ${calc.pillarsZh.day} ${calc.pillarsZh.hour}`);
ok("strict geju promoted to 雜氣正官格", /โครงดวง: strict月令หลัก=雜氣正官格/.test(prompt), prompt.match(/^โครงดวง:.+$/m)?.[0] || "");
ok("raw 雜氣劫財 is secondary and stripped of 格 in primary line", /raw engineป้ายรอง=雜氣劫財 \(ห้ามใช้เป็น格局หลัก/.test(prompt), prompt.match(/^โครงดวง:.+$/m)?.[0] || "");
ok("TRACE accepts 雜氣正官格 after promotion", validateTrace("⟦TRACE⟧從=ไม่มี·格局=雜氣正官格·用神=ไฟ⟧", extractTraceFacts(prompt)).ok);
ok("TRACE rejects old 雜氣劫財格 after promotion", validateTrace("⟦TRACE⟧從=ไม่มี·格局=雜氣劫財格·用神=ไฟ⟧", extractTraceFacts(prompt)).reason === "geju_mismatch");
const touLine = prompt.match(/^透出ก้านฟ้า .+$/m)?.[0] || "";
const tonggenTouLine = prompt.match(/^通根\/รากของก้านที่透 .+$/m)?.[0] || "";
ok("Swit 透出 uses only four heavenly stems", /透出=丙辛壬己/.test(touLine), touLine);
ok("Swit 透出 count is capped at four", /\[รวม透=4;/.test(touLine), touLine);
ok("Swit 取格 candidates exclude day stem", /取格候選年\/月\/時=丙辛己/.test(touLine), touLine);
ok("Swit 透出 line does not describe hidden branch as pillar透", !/ซ่อนในกิ่ง.+เสา/.test(touLine), touLine);
ok("Swit 辛 root support is separated from 透 count", /辛[^·\n]*รากที่/.test(tonggenTouLine) && /酉/.test(tonggenTouLine) && /丑/.test(tonggenTouLine) && /戌/.test(tonggenTouLine), tonggenTouLine);
ok("2026 includes 丙辛合", /丙辛\(ปีจร2026/.test(prompt));
ok("2027 includes 丁壬合", /丁壬\(ปีจร2027/.test(prompt));
ok("2027 includes 四庫全", /四庫全.*2027/.test(prompt));
ok("annual all-pillar branch hits include 午丑害", /ปีจร2026丙午 ↔ เสาเดือน丑 = 六害\/午丑/.test(prompt));
ok("future luck includes 乙巳 巳酉丑三合金", /วัยจรถัดไป乙巳.*巳酉丑三合/.test(prompt));

console.log(`\n=== ${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"} ===`);
process.exit(fail ? 1 : 0);
