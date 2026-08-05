#!/usr/bin/env node
/**
 * 🧪 สร้างผังดวง "สังเคราะห์" ไว้ใช้เป็นตัวอย่างของด่านตรวจบัตรดวงห้องเสียง
 *
 * ทำไมต้องสังเคราะห์: ตัวอย่างเดิมเป็นผังดวงจริงของเจ้าของแอพ (มีสุขภาพ/อาชีพ/คู่ครอง/
 * ญาติ/ไทม์ไลน์ทั้งชีวิต) เอาขึ้น git ไม่ได้ · ไฟล์นี้ปั้นผังจากวันเกิดสมมติด้วยเครื่องยนต์จริง
 * จึงได้โครงสร้างเหมือนของจริงทุกบรรทัด โดยไม่มีข้อมูลส่วนตัวของใคร
 *
 * สำคัญ: ใช้ป้ายชื่อแบบเดียวกับ production (`[ชื่อ·8ตัวแรกของ uuid] `) ไม่ใช่ `[probe] `
 * เพราะตัวคัดหมวดในห้องเสียงต้องทำงานกับ prefix จริงให้ได้
 *
 * รัน: node --experimental-strip-types --loader ./scripts/ts-loader.mjs scripts/make-sifu-voice-fixture.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { calcBazi } from "../src/lib/bazi-calc.ts";
import { buildChartExtensions } from "../src/lib/chart-extensions.ts";
import { buildStructuredChartPacket, renderChartPrompt } from "../src/lib/chart-packet.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "scripts/fixtures/sifu-voice-chart-packet.txt");

/* วันเกิดสมมติล้วน — ไม่ใช่ของผู้ใช้คนไหน · ป้ายชื่อเป็นรูปแบบ production */
const BIRTH = Object.freeze({
  date: "1990-06-15",
  gender: "M",
  gmtOffsetHours: 7,
  latitude: 13.7563,
  longitude: 100.5018,
  time: "09:30",
});
const SUBJECT_LABEL = "ทดสอบ·00000000";
const NOW = new Date("2026-08-05T12:00:00+07:00");

const calc = await calcBazi({
  birthTimeKnown: true,
  date: BIRTH.date,
  dayBoundary: "23:00",
  gender: BIRTH.gender,
  gmtOffsetHours: BIRTH.gmtOffsetHours,
  longitude: BIRTH.longitude,
  time: BIRTH.time,
});

const birthDate = new Date(`${BIRTH.date}T${BIRTH.time}:00+07:00`);
const ageNow = Math.floor((NOW.getTime() - birthDate.getTime()) / (365.25 * 86_400_000));
const ext = buildChartExtensions(
  calc.pillars,
  NOW,
  BIRTH.gender,
  birthDate,
  ageNow,
  calc.geJu.structure,
  calc.strength.percent,
  calc.yongshen[0]?.element,
  calc.yongshen.map((entry) => entry.element),
);
const packet = buildStructuredChartPacket(
  calc,
  ext,
  calc.dayMaster,
  ageNow,
  {},
  null,
  BIRTH.gender,
  null,
  { dayBoundary: "23:00", dayBoundarySource: "explicit" },
);

const rendered = renderChartPrompt(packet, {
  includeTransitDrilldown: true,
  includeTransitMonthlyDrilldown: true,
  subjectLabel: SUBJECT_LABEL,
});
const body = rendered.slice(rendered.indexOf("CHART PACKET"));

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, body);
console.log(`✅ เขียนผังตัวอย่างสังเคราะห์: ${OUT}`);
console.log(`   วันเกิดสมมติ ${BIRTH.date} ${BIRTH.time} · ป้ายชื่อ [${SUBJECT_LABEL}]`);
console.log(`   ${body.length.toLocaleString()} ตัวอักษร · ${body.split("\n").length} บรรทัด`);
const prefixed = body.split("\n").filter((line) => line.startsWith(`[${SUBJECT_LABEL}] `)).length;
console.log(`   บรรทัดที่มีป้ายชื่อนำหน้า: ${prefixed}`);
