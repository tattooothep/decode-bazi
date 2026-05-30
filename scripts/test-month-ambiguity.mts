/**
 * Functional test · 月柱ก้ำกึ่ง propagation เข้า packet (เฟส 1+2)
 * รัน: node --experimental-strip-types --import ./scripts/_ts-resolver.mjs scripts/test-month-ambiguity.mts
 * acceptance (เจ้านายล็อก): suffix "อ่าน 2 ทาง" ต้องอยู่ "บรรทัดเดียวกับ" 格局(โครงดวง:) และ 司令 — ไม่ใช่แค่มีในไฟล์
 */
import { calcBazi } from "../src/lib/bazi-calc.ts";
import { buildChartExtensions } from "../src/lib/chart-extensions.ts";
import { buildStructuredChartPacket, renderChartPrompt } from "../src/lib/chart-packet.ts";
import { monthPillarBoundary } from "../src/lib/bazi-boundary.ts";

let pass = 0, fail = 0;
const ck = (l: string, c: boolean, g?: string) => { c ? (pass++, console.log("  ✅ " + l)) : (fail++, console.log("  ❌ " + l + (g ? " · got: " + g : ""))); };

function mkExt(calc: any, date: string, time: string, gender: "M" | "F") {
  return buildChartExtensions(calc.pillars, new Date(), gender, new Date(`${date}T${time}:00+07:00`),
    10, calc.geJu.structure || null, calc.strength.percent, calc.yongshen[0]?.element || null);
}
async function render3p(date: string) {
  const calc = await calcBazi({ date, longitude: 100.5018, gmtOffsetHours: 7, birthTimeKnown: false } as any);
  const ext = mkExt(calc, date, "12:00", "M");
  const packet = buildStructuredChartPacket(calc as any, ext as any, calc.dayMaster, 29, {} as any, null, "M", null, { monthBoundary: monthPillarBoundary(date) });
  return renderChartPrompt(packet, { subjectLabel: "test" });
}
async function render4p(date: string, time: string) {
  const calc = await calcBazi({ date, time, longitude: 100.5018, gmtOffsetHours: 7, birthTimeKnown: true } as any);
  const ext = mkExt(calc, date, time, "F");
  const packet = buildStructuredChartPacket(calc as any, ext as any, calc.dayMaster, 40, {} as any, null, "F", null, { monthBoundary: monthPillarBoundary(date) });
  return renderChartPrompt(packet, { subjectLabel: "test" });
}

console.log("[month-ambiguity · na 1996-05-05 · 3 เสา · คาบ立夏]");
const na = (await render3p("1996-05-05")).split("\n");
const gejuLine = na.find(l => l.includes("โครงดวง:")) || "";
const siLingLine = na.find(l => l.includes("司令 ธาตุบัญชาฤดู")) || "";
const blockLine = na.find(l => l.includes("月柱ก้ำกึ่ง")) || "";
ck("มีบล็อกสรุป 月柱ก้ำกึ่ง + 壬辰/癸巳 + used", /壬辰/.test(blockLine) && /癸巳/.test(blockLine) && /engine ใช้/.test(blockLine), blockLine.slice(0, 80));
ck("suffix 'อ่าน 2 ทาง' อยู่บรรทัดเดียวกับ 格局(โครงดวง:)", /อ่าน 2 ทาง/.test(gejuLine), gejuLine.slice(0, 80));
ck("suffix 'อ่าน 2 ทาง' อยู่บรรทัดเดียวกับ 司令", /อ่าน 2 ทาง/.test(siLingLine), siLingLine.slice(0, 80));
ck("suffix มีก้านกิ่ง 2 ทาง บนบรรทัด 格局", /壬辰\/癸巳/.test(gejuLine), gejuLine.slice(0, 80));

console.log("\n[regression · Aeaw 1984-12-31 13:15 · 4 เสา · ไม่ใช่วันคาบ節氣]");
const aeaw = (await render4p("1984-12-31", "13:15")).split("\n");
ck("4 เสา → ไม่มีบล็อก 月柱ก้ำกึ่ง", !aeaw.some(l => l.includes("月柱ก้ำกึ่ง")), "");
ck("4 เสา → ไม่มี suffix 'อ่าน 2 ทาง' หลุดมา", !aeaw.some(l => l.includes("เสาเดือนก้ำกึ่ง")), "");

console.log("\n[regression · วันปกติ 3 เสา 1996-05-15 · ไม่คาบ節氣]");
const norm = (await render3p("1996-05-15")).split("\n");
ck("3 เสาวันปกติ → ไม่มีบล็อก 月柱ก้ำกึ่ง", !norm.some(l => l.includes("月柱ก้ำกึ่ง")), "");

console.log(`\n[month-ambiguity] ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
