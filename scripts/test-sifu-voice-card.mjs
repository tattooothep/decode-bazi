#!/usr/bin/env node
/**
 * 🎙 ด่านตรวจบัตรดวงห้องคุยสดซินแส (5 ส.ค. 2569)
 *
 * ทำไมต้องมีด่านนี้ — บทเรียน 2 รอบ:
 *   รอบ 1: ห้องเสียง 503 ทุกสายทั้งวัน โดยฝั่งผู้ให้บริการตอบ 200 ปกติ
 *          ต้นเหตุ = เพดานคำตอบฝั่งเราตรึงไว้ 16KB แต่ผู้ให้บริการสะท้อนคำสั่งทั้งก้อนกลับมา
 *   รอบ 2: ตัวคัดหมวดผูกกับ prefix `[probe] ` ที่ **ไม่มีจริงบน production**
 *          (ของจริงคือ `[<ชื่อผู้ใช้>·<8 ตัวแรก uuid>] ` จาก chart-packet.ts)
 *          → ตัวคัดหมวดถูกข้ามทั้งชุด บัตรกลายเป็นการตัดหัวดิบ และบรรทัดกติกาหายเงียบ ๆ
 *
 * ด่านนี้จึงตรวจ 6 ชั้น:
 *   1) หมวดแกนครบ — เทียบแบบ **ยึดหัวบรรทัด** (หลังถอดป้ายชื่อ) ไม่ใช่ includes ทั้งบัตร
 *   2) ขนาดไม่เกินงบ + ทุกบรรทัดมาจากผังจริง (ไม่แต่งเนื้อดวง)
 *   3) ก้อนยักษ์ถูกตัดจริง + บรรทัดกติกา [ตัดตามงบ] ต้องอยู่เสมอ
 *   4) **ทนทานต่อป้ายชื่อทุกแบบ** — production / ไม่มีป้าย / ชื่อมีอักขระแปลก
 *   5) **เส้นทางตัดทั้งหมวดตอนผังเกินงบ** (ของเดิมไม่เคยถูกทดสอบเพราะ fixture ไม่เคยเกิน)
 *      + ด่านพื้นฐานฝั่งวิหาร
 *   6) ยิง client_secrets จริงต้องได้ 200 และคำตอบเล็กกว่าเพดานที่โค้ดคำนวณ
 *      (ข้ามได้ด้วย SKIP_LIVE=1 · ชั้น 1-5 ยังบังคับเสมอ)
 *
 * ไม่ผ่าน = exit 1
 *
 * รัน: node scripts/test-sifu-voice-card.mjs
 * ผังตัวอย่าง: ค่าตั้งต้นใช้ผัง "สังเคราะห์" (วันเกิดสมมติ) ที่ scripts/fixtures/
 *              สร้างใหม่ได้ด้วย scripts/make-sifu-voice-fixture.mjs
 *              ถ้าจะทดสอบกับผังจริง ให้ชี้ SIFU_VOICE_CARD_FIXTURE ไปที่ไฟล์นอก repo
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SIFU_SOURCE = path.join(ROOT, "src/lib/sifu-realtime-session.ts");
const SHRINE_SOURCE = path.join(ROOT, "src/lib/shrine-realtime-session.ts");
const FIXTURE = process.env.SIFU_VOICE_CARD_FIXTURE
  || path.join(ROOT, "scripts/fixtures/sifu-voice-chart-packet.txt");

/* โหลดโค้ดจริงจากไฟล์ TypeScript ที่ deploy โดยไม่ต้อง build ทั้งโปรเจกต์
   (type stripping ของ node 22.6+) — ด่านต้องตรวจตัวจริง ไม่ใช่สำเนาที่เพี้ยนตามกันไม่ทัน */
if (!process.execArgv.some((flag) => flag.includes("strip-types"))) {
  const { spawnSync } = await import("node:child_process");
  const child = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--no-warnings",
      fileURLToPath(import.meta.url),
      ...process.argv.slice(2),
    ],
    { stdio: "inherit" },
  );
  process.exit(child.status ?? 1);
}

const failures = [];
const notes = [];
function check(ok, label, detail = "") {
  const line = `${label}${detail ? ` — ${detail}` : ""}`;
  if (ok) notes.push(`  ✅ ${line}`);
  else failures.push(`  ❌ ${line}`);
  return ok;
}

/** ถอดป้ายชื่อเจ้าของดวง — ต้องตรงกับ cardLabel() ในโค้ดจริงเป๊ะ (2 ชั้น) */
const LINE_LABEL_ID = /^\[[^\n]{0,110}·[0-9a-z]{4,12}\] /u;
const LINE_LABEL_PLAIN = /^\[[^\]\n]{1,120}\] /u;
const labelOf = (line) =>
  (LINE_LABEL_ID.exec(line)?.[0] ?? LINE_LABEL_PLAIN.exec(line)?.[0]) ?? "";
const stripLabel = (line) => line.slice(labelOf(line).length);
const cardKeys = (card) => card.split("\n").map(stripLabel);

/** เปลี่ยนป้ายชื่อในผังทั้งก้อน เพื่อจำลองผู้ใช้คนอื่น / ผังที่ไม่มีป้าย */
function relabel(packet, label) {
  return packet
    .split("\n")
    .map((line) => {
      const bare = stripLabel(line);
      if (bare === line) return line; // บรรทัดนี้ไม่มีป้ายอยู่แล้ว
      return label === null ? bare : `[${label}] ${bare}`;
    })
    .join("\n");
}

/* หมวดแกน: [หัวบรรทัดที่ต้องเจอ, ชื่อที่อ่านเข้าใจ, ชั้น] — เทียบด้วย startsWith หลังถอดป้าย
 *
 * 🔴 5 ส.ค. 69: แยก 2 ชั้นเพราะงบบัตรถูกล็อกด้วย "โควตาโทเคน/นาที" ของบัญชี ไม่ใช่ความอยาก
 *   "พูด" = หมวดที่ซินแสหยิบมาพูดทุกสาย → หายเมื่อไหร่ = ด่านตกทันที ไม่มีข้อแม้
 *   "รอง" = หมวดที่อยากได้ครบ แต่ถ้างบไม่พอต้องยอมหลุด → ด่านรายงานเป็น ⚠️ ให้เห็นชัด ๆ
 *           (ห้ามเงียบ · ตัวเลขที่หลุดต้องโผล่บนจอทุกครั้งที่รัน)
 */
const REQUIRED_HEADS = [
  ["CHART PACKET", "หัวผัง", "พูด"],
  ["เสาปี ", "เสาปี", "พูด"],
  ["เสาเดือน ", "เสาเดือน", "พูด"],
  ["เสาวัน ", "เสาวัน", "พูด"],
  ["เสายาม ", "เสายาม", "พูด"],
  ["โครงดวง:", "โครงดวง 格局", "พูด"],
  ["用神分層", "用神 ทุกชั้น", "พูด"],
  ["ธาตุรวมการ์ด", "ธาตุรวม", "พูด"],
  ["ราก 5 ธาตุ", "ราก 5 ธาตุ", "พูด"],
  ["เรือนคู่ ", "เรือนคู่", "พูด"],
  ["วัยจรปัจจุบัน", "วัยจรปัจจุบัน", "พูด"],
  ["ปีจรปัจจุบัน:", "ปีจรปัจจุบัน", "พูด"],
  ["ปฏิกิริยาในดวง", "ปฏิกิริยาในดวง", "พูด"],
  ["ปฏิกิริยาวัยจร×ดวงเกิด", "ปฏิกิริยาวัยจร×ดวงเกิด", "พูด"],
  ["สรุปปฏิกิริยาซ้อน", "สรุปปฏิกิริยาซ้อน", "พูด"],
  ["ตัวตนหลัก:", "ตัวตนหลัก", "พูด"],
  ["📿 ตัวตนเชิงลึก", "ตัวตนเชิงลึก", "พูด"],
  ["💼 อาชีพ", "อาชีพ", "พูด"],
  ["🩺 สุขภาพ", "สุขภาพ", "พูด"],
  ["timeline 10 ปี", "timeline 10 ปี", "พูด"],
  ["胎元 ", "เรือนปฏิสนธิ", "รอง"],
  ["命宮 ", "เรือนชีวิต", "รอง"],
  ["身宮 ", "เรือนกาย", "รอง"],
  ["司令 ", "ธาตุบัญชาฤดู", "รอง"],
  ["小運 ", "วัยจรเล็ก", "รอง"],
  ["起運 ", "起運", "รอง"],
  ["วัยจรทั้งชีวิต", "วัยจรทั้งชีวิต", "รอง"],
  ["交運 ", "交運 รอยต่อวัยจร", "รอง"],
  ["ดาวประจำตัว", "ดาวประจำตัว", "รอง"],
  ["六親 ญาติ", "六親 ญาติ", "รอง"],
  ["空亡ตกที่เสา", "空亡", "รอง"],
  ["病藥 ", "病藥", "รอง"],
  ["透出ก้านฟ้า", "透干", "รอง"],
  ["通根/รากของก้านที่透", "รากของก้านที่透", "รอง"],
];

/** หมวดชั้น "พูด" ที่หายไปจากบัตร — หายแม้หมวดเดียว = ด่านตก */
function missingSpokenHeads(card) {
  const keys = cardKeys(card);
  return REQUIRED_HEADS
    .filter(([head, , tier]) => tier === "พูด" && !keys.some((line) => line.startsWith(head)))
    .map(([, label]) => label);
}

function missingHeads(card) {
  const keys = cardKeys(card);
  return REQUIRED_HEADS
    .filter(([head]) => !keys.some((line) => line.startsWith(head)))
    .map(([, label]) => label);
}

/** หมวดที่ผังนี้ไม่มีตั้งแต่แรก ไม่นับว่าด่านตก (ผังแต่ละดวงมีหมวดไม่เท่ากัน) */
function headsPresentIn(packet) {
  const keys = cardKeys(packet);
  return new Set(
    REQUIRED_HEADS
      .filter(([head]) => keys.some((line) => line.startsWith(head)))
      .map(([, label]) => label),
  );
}

const MONTHLY_LABEL = /^เดือนจรของปีจร \d{4} \(ปีปัจจุบัน\) · (เดือนจร=.+)$/u;
/** หัวบรรทัดกติกาที่ต้องอยู่ต้นบัตรเสมอ — ต้องตรงกับ CARD_CUT_NOTE ในโค้ดจริง */
const CUT_NOTE_HEAD = "⚠️ ผังชุดนี้คือผังเต็ม";
/** ตัวบทสำหรับเครื่อง ห้ามหลุดเข้าบัตรเสียง — ต้องตรงกับตัวกรองในโค้ดจริง */
const MACHINE_LINE =
  /^HK_|precompute|source=|provenance|canonical|resolver|raw_only|candidate|annualNatalBranchHits|transitHehua|crossLayerCombos/u;
/** หมวดแกนที่ "หัวข้อ" มีคำเครื่องติดมาในวงเล็บ แต่เนื้อข้างในคือของที่ต้องใช้พูด */
const MACHINE_ALLOWED_HEADS = [
  "ธาตุรวมการ์ด",
  "ปฏิกิริยาในดวง",
  "ปฏิกิริยาวัยจร×ดวงเกิด",
  "สรุปปฏิกิริยาซ้อน",
  "ปีจร/เดือนจรในวัยจรปัจจุบัน",
  "通根/รากของก้านที่透",
];

async function main() {
  if (!fs.existsSync(FIXTURE)) {
    console.error(`❌ ไม่พบผังตัวอย่างที่ ${FIXTURE}`);
    console.error("   สร้างใหม่: node --experimental-strip-types --loader ./scripts/ts-loader.mjs scripts/make-sifu-voice-fixture.mjs");
    process.exit(1);
  }
  const packet = fs.readFileSync(FIXTURE, "utf8");
  const { buildVoiceChartCard, VOICE_CHART_CARD_MAX_CHARS } = await import(
    pathToFileURL(SIFU_SOURCE).href
  );
  /* เวลาอ้างอิงตายตัว — ด่านต้องให้ผลเดิมทุกวัน ไม่แกว่งตามวันที่รัน */
  const NOW = new Date("2026-08-05T12:00:00+07:00");
  const expected = headsPresentIn(packet);
  const packetLines = packet.split("\n");
  const packetKeys = new Set(packetLines.map(stripLabel));

  console.log("🎙 ด่านตรวจบัตรดวงห้องคุยสดซินแส");
  console.log(`   ผังตัวอย่าง: ${FIXTURE}`);
  console.log(`   ผังเต็ม: ${packet.length.toLocaleString()} ตัวอักษร · ${packetLines.length} บรรทัด`);
  console.log(`   งบบัตร: ${VOICE_CHART_CARD_MAX_CHARS.toLocaleString()} ตัวอักษร`);
  console.log(`   หมวดแกนที่ผังนี้มีจริง: ${expected.size}/${REQUIRED_HEADS.length}\n`);

  /* ── ชั้น 0: ผังตัวอย่างต้องเป็น "ของสังเคราะห์" เท่านั้น ──
     .gitignore กันได้แค่ชื่อไฟล์ ถ้าใครเขียนทับไฟล์นี้ด้วยผังดวงจริงของผู้ใช้
     ด่านต้องตกทันที ไม่ใช่ปล่อยผ่านแล้วข้อมูลส่วนตัวหลุดเข้า git */
  check(
    packet.includes("[ทดสอบ·00000000] "),
    "ผังตัวอย่างใช้ป้ายชื่อสังเคราะห์ [ทดสอบ·00000000]",
  );
  const SYNTHETIC_PILLARS = [
    ["เสาปี 年: ฟ้า=ทองหยาง", "庚午"],
    ["เสาเดือน 月: ฟ้า=น้ำหยาง", "壬午"],
    ["เสาวัน 日: ฟ้า=ทองหยิน", "辛亥"],
    ["เสายาม 時: ฟ้า=น้ำหยิน", "癸巳"],
  ];
  const wrongPillars = SYNTHETIC_PILLARS
    .filter(([head]) => !packet.split("\n").some((line) => stripLabel(line).startsWith(head)))
    .map(([, zh]) => zh);
  check(
    wrongPillars.length === 0,
    "ผังตัวอย่างเป็นดวงสังเคราะห์ 庚午/壬午/辛亥/癸巳 (วันเกิดสมมติ ไม่ใช่ของผู้ใช้จริง)",
    wrongPillars.length ? `เสาไม่ตรง: ${wrongPillars.join(",")} — ห้ามใช้ผังดวงจริงเป็น fixture` : "",
  );

  const card = buildVoiceChartCard(packet, NOW);
  if (!check(typeof card === "string" && card.length > 0, "สร้างบัตรได้")) {
    console.log(failures.join("\n"));
    process.exit(1);
  }

  /* ── ชั้น 1: หมวดแกนครบ (ยึดหัวบรรทัด) ── */
  const missingSpoken = missingSpokenHeads(card).filter((label) => expected.has(label));
  check(
    missingSpoken.length === 0,
    "หมวดที่ซินแสใช้พูดครบทุกหมวด (ชั้นบังคับ)",
    missingSpoken.length ? `ขาด: ${missingSpoken.join(", ")}` : `${expected.size} หมวดที่ผังมี`,
  );
  /* ชั้นรอง: ไม่ตกด่าน แต่ต้องขึ้นจอทุกครั้ง ห้ามหายเงียบ */
  const missingSecondary = missingHeads(card)
    .filter((label) => expected.has(label) && !missingSpoken.includes(label));
  notes.push(
    missingSecondary.length
      ? `  ⚠️  หมวดรองที่งบไม่พอจะใส่ (${VOICE_CHART_CARD_MAX_CHARS.toLocaleString()} ตัวอักษร): ${missingSecondary.join(", ")}`
      : "  ✅ หมวดรองครบด้วย — งบพอใส่ทุกหมวดที่ผังมี",
  );

  /* ── ชั้น 2: ขนาด + ไม่แต่งเนื้อดวง ── */
  check(
    card.length <= VOICE_CHART_CARD_MAX_CHARS,
    "บัตรไม่เกินงบ",
    `${card.length.toLocaleString()} / ${VOICE_CHART_CARD_MAX_CHARS.toLocaleString()}`,
  );
  const foreign = foreignLines(card, packetKeys, packetLines);
  check(
    foreign.length === 0,
    "ทุกบรรทัดมาจากผังจริง ไม่มีการแต่งเนื้อดวงเพิ่ม",
    foreign.length ? `เจอ ${foreign.length}: ${foreign[0]}` : "",
  );
  check(!card.split("\n").some((line) => line.length === 0), "ไม่มีบรรทัดว่างค้าง");

  /* ── ชั้น 3: ก้อนยักษ์ถูกตัด + บรรทัดกติกาต้องอยู่ ── */
  check(
    !cardKeys(card).some((line) => /^HK_[A-Z0-9_]+\[\d+\/\d+\]/u.test(line)),
    "ตัดตารางล็อกรายปีทั้งชีวิตออกแล้ว",
  );
  check(card.startsWith(CUT_NOTE_HEAD), "บรรทัดกติกาอยู่หัวบัตร (ตำแหน่งที่ตัดไม่ถึง)");
  /* เจ้าของสั่ง "ส่งข้อมูลดิบให้มากที่สุด" → ปีจร/เดือนจรของปีอื่นไม่ถูกห้ามอีกแล้ว
     แต่ต้องเป็นลำดับท้ายสุดเสมอ: มีที่เหลือค่อยเข้า ห้ามเบียดหมวดแกน */
  check(
    cardKeys(card).some((line) => line.startsWith("流年2026(")),
    "ปีจรของปีปัจจุบันอยู่ในบัตรเสมอ (ตัวที่ผู้ใช้ถามบ่อยสุด)",
  );
  check(
    card.length >= Math.min(6_000, VOICE_CHART_CARD_MAX_CHARS - 500),
    "บัตรอัดแน่นพอ — ใช้งบที่มีเกือบเต็ม ไม่เหลือที่ว่างทิ้งเปล่า",
    `${card.length.toLocaleString()} / ${VOICE_CHART_CARD_MAX_CHARS.toLocaleString()} ตัวอักษร`,
  );

  /* ── ชั้น 3ข (ใหม่ 5 ส.ค. รอบ 4): บัตรต้องเป็น "ของที่พูดออกเสียงได้" เท่านั้น ──
     ก่อนหน้านี้ 64% ของบัตรเป็นตัวบทสำหรับเครื่อง → ซินแสเสียงไล่ขั้นตอน อ่านรหัส และกั๊ก */
  check(
    !cardKeys(card).some((line) => line.startsWith("HK_")),
    "ไม่มีบล็อกสั่งงานเครื่อง HK_ หลงเข้าบัตร (ต้นเหตุ 'ไล่ 13 ขั้นก่อนตอบ')",
  );
  /* หมวดแกนบางหัวข้อมีคำเครื่องติดมาในวงเล็บ (canonical/raw_only/precomputed) — ยอมได้
     เพราะเนื้อข้างในคือของที่ต้องใช้พูด · ที่เหลือห้ามมีคำเครื่องแม้แต่บรรทัดเดียว */
  const machineLines = cardKeys(card).filter(
    (line) => MACHINE_LINE.test(line) && !MACHINE_ALLOWED_HEADS.some((h) => line.startsWith(h)),
  );
  check(
    machineLines.length === 0,
    "ไม่มีตัวบทสำหรับเครื่องหลงเข้าบัตร (precompute / source= / provenance / resolver ฯลฯ)",
    machineLines.length ? `เจอ ${machineLines.length}: ${machineLines[0].slice(0, 50)}` : "",
  );
  const labelled = card.split("\n").filter((line) => labelOf(line) !== "");
  check(
    labelled.length === 0,
    "ป้ายชื่อ [ชื่อ·รหัส] ถูกถอดออกจากตัวบทที่ส่งจริง (ไม่ให้ซินแสอ่านรหัสออกเสียง)",
    labelled.length ? `เหลือ ${labelled.length} บรรทัด` : "",
  );
  const otherYears = cardKeys(card)
    .filter((line) => /^流年(\d{4})\(/u.test(line) && !line.startsWith("流年2026("));
  check(otherYears.length === 0, "เหลือ 流年 เฉพาะปีปัจจุบัน", `ปีอื่น ${otherYears.length} แถว`);

  /* ── ชั้น 4: ทนทานต่อป้ายชื่อทุกแบบ (บั๊กรอบ 2) ── */
  const LABEL_CASES = [
    ["ป้าย production", "สมชาย·1a2b3c4d"],
    /* promptSafe (route.ts:1167) ตัดชื่อที่ 80 ตัว → ป้ายจริงยาวได้ถึง 89
       ของเดิมพังตั้งแต่ป้าย 81 (ชื่อ 72 ตัว) — ต้องคุมทั้งช่วง */
    ["ชื่อ 71 ตัว (ป้าย 80)", `${"ก".repeat(71)}·1a2b3c4d`],
    ["ชื่อ 72 ตัว (ป้าย 81)", `${"ก".repeat(72)}·1a2b3c4d`],
    ["ชื่อ 75 ตัว (ป้าย 84)", `${"ก".repeat(75)}·1a2b3c4d`],
    ["ชื่อ 80 ตัว (ป้าย 89 = สูงสุดจริง)", `${"ก".repeat(80)}·1a2b3c4d`],
    ["ชื่อ 90 ตัว (เกินของจริง)", `${"ก".repeat(90)}·1a2b3c4d`],
    ["ชื่อมี \"] \" ข้างใน", "คุณ ก.] ลูกค้า·deadbeef"],
    /* ชื่อเล่นที่ผู้ใช้กรอกเองได้จริง — "] " กลางชื่อเคยทำให้ตัวถอดป้ายตัดผิดตำแหน่ง
       (ฝั่งต้นทาง route.ts promptSafe ถอด [ ] ทิ้งแล้ว · ด่านนี้กันฝั่งรับซ้ำอีกชั้น) */
    ["ชื่อเล่นมี \"] \" กลางชื่อ", "อา] ก๋ง·1a2b3c4d"],
    ["ชื่อมี [ ] หลายชั้น", "[VIP] คุณ ก.] x·00ff11aa"],
    ["ป้าย guest (fusion5)", "สมหญิง·guest"],
    ["ไม่มีป้ายชื่อ", null],
    ["ป้ายภาษาอังกฤษ", "John Doe·00ff11aa"],
  ];
  for (const [label, value] of LABEL_CASES) {
    const variant = relabel(packet, value);
    const variantCard = buildVoiceChartCard(variant, NOW);
    if (!variantCard) {
      check(false, `ป้ายชื่อ: ${label}`, "สร้างบัตรไม่ได้");
      continue;
    }
    const variantMissing = missingSpokenHeads(variantCard).filter((x) => expected.has(x));
    const bulkLeft = cardKeys(variantCard)
      .filter((line) => /^HK_[A-Z0-9_]+\[\d+\/\d+\]/u.test(line)).length;
    const monthly = (variantCard.match(/เดือนจร=/gu) ?? []).length;
    /* กันบั๊กเดิมกลับมา: บัตรต้องไม่ใช่ "หัวผังดิบ N ตัวอักษรแรก" */
    const rawHeadCut = variantCard === variant.slice(0, variantCard.length);
    check(
      variantMissing.length === 0 && bulkLeft === 0 && monthly <= 1
        && variantCard.startsWith(CUT_NOTE_HEAD) && !rawHeadCut,
      `ป้ายชื่อ: ${label}`,
      `ขาด=${variantMissing.length} ตารางเหลือ=${bulkLeft} เดือนจร=${monthly}`
        + `${rawHeadCut ? " ← ตัดหัวดิบ!" : ""} ขนาด=${variantCard.length.toLocaleString()}`,
    );
  }

  /* ── ชั้น 5: ผังเกินงบ → ต้องเดินเส้นทางตัดทั้งหมวด และหมวดแกนต้องรอด ── */
  for (const [label, doublings] of [["ผังโต 2 เท่า", 1], ["ผังโต 8 เท่า", 3]]) {
    let big = packet;
    for (let i = 0; i < doublings; i += 1) {
      const filler = big.split("\n").map((line, j) => `[ถม·${i}${j}] ${stripLabel(line)}`).join("\n");
      big = `${big}\n${filler}`;
    }
    const bigCard = buildVoiceChartCard(big, NOW);
    const bigMissing = missingSpokenHeads(bigCard ?? "").filter((x) => expected.has(x));
    const halfLines = foreignLines(bigCard ?? "", packetKeys, packetLines);
    check(
      typeof bigCard === "string"
        && bigCard.length <= VOICE_CHART_CARD_MAX_CHARS
        && bigMissing.length === 0
        && halfLines.length === 0
        && !bigCard.split("\n").some((line) => line.length === 0),
      `ผังเกินงบ: ${label} (${big.length.toLocaleString()} ตัวอักษร)`,
      `บัตร=${(bigCard?.length ?? 0).toLocaleString()} ขาดหมวดแกน=${bigMissing.length}`
        + ` บรรทัดถูกตัดครึ่ง=${halfLines.length}`,
    );
  }

  /* ── ผังกลุ่มหลายคน: เคสจริงที่ทำให้บรรทัดกติกาหายในรอบก่อน ── */
  let group = packet;
  for (let people = 2; people <= 6; people += 1) {
    const extra = packet.split("\n").map((line) => `[คนที่${people}·0000000${people}] ${stripLabel(line)}`).join("\n");
    group = `${group}\n${extra}`;
    const groupCard = buildVoiceChartCard(group, NOW);
    const groupMissing = missingSpokenHeads(groupCard ?? "").filter((x) => expected.has(x));
    check(
      typeof groupCard === "string"
        && groupCard.length <= VOICE_CHART_CARD_MAX_CHARS
        && groupCard.startsWith(CUT_NOTE_HEAD)
        && groupMissing.length === 0
        && foreignLines(groupCard, packetKeys, packetLines).length === 0,
      `ผังกลุ่ม ${people} คน (${group.length.toLocaleString()} ตัวอักษร)`,
      `บัตร=${(groupCard?.length ?? 0).toLocaleString()} ขาดหมวดแกน=${groupMissing.length}`,
    );
  }

  /* ── หมวดแกนล้วนเกินงบ: กรณีที่ไม่มีหมวดชั้นล่างให้ตัดแล้ว บรรทัดกติกาก็ยังต้องอยู่ ── */
  const coreLines = packetLines.filter((line) => {
    const key = stripLabel(line);
    return REQUIRED_HEADS.some(([head]) => key.startsWith(head));
  });
  const coreHeavy = `${packet}\n${Array.from({ length: 40 }, (_, i) =>
    coreLines.map((line) => `[ถม${i}·1a2b3c4d] ${stripLabel(line)}`).join("\n")).join("\n")}`;
  const coreCard = buildVoiceChartCard(coreHeavy, NOW);
  check(
    typeof coreCard === "string"
      && coreCard.length <= VOICE_CHART_CARD_MAX_CHARS
      && coreCard.startsWith(CUT_NOTE_HEAD)
      && !coreCard.split("\n").some((line) => line.length === 0),
    `หมวดแกนล้วนเกินงบ (${coreHeavy.length.toLocaleString()} ตัวอักษร) บรรทัดกติกายังอยู่หัวบัตร`,
    `บัตร=${(coreCard?.length ?? 0).toLocaleString()}`,
  );

  /* เร็วพอที่จะไม่บล็อก event loop: ผัง 20,000 บรรทัดต้องเสร็จเร็ว (เคยเป็น O(n²) 9.6 วินาที) */
  const wide = Array.from({ length: 20_000 }, (_, i) => `[ถม·${i}] บรรทัดถ่วง ${"ก".repeat(60)}`).join("\n");
  const t0 = Date.now();
  buildVoiceChartCard(`${packet}\n${wide}`, NOW);
  const elapsed = Date.now() - t0;
  check(elapsed < 1_000, "ผัง 20,000 บรรทัดสร้างบัตรได้เร็ว (ไม่บล็อก event loop)", `${elapsed} มิลลิวินาที`);

  /* ── ฝั่งวิหาร ── */
  const shrine = await import(pathToFileURL(SHRINE_SOURCE).href);
  check(
    typeof shrine.createShrineRealtimeSessionHandler === "function",
    "ฝั่งวิหาร: โมดูลโหลดได้ (ไม่มีตัวแปรอ้างลอย)",
  );
  const shrineSrc = fs.readFileSync(SHRINE_SOURCE, "utf8");
  const sifuSrc = fs.readFileSync(SIFU_SOURCE, "utf8");
  check(
    /providerResponseBudget\(instructions\)/u.test(shrineSrc)
      && /instructions = sessionInstructions\(input\)/u.test(shrineSrc),
    "ฝั่งวิหาร: เพดานคำตอบผูกกับคำสั่งก้อนเดียวกับที่ส่งจริง",
  );
  check(
    shrineSrc.indexOf("instructions = sessionInstructions(input)")
      < shrineSrc.indexOf("const timeout = setTimeout(() => timeoutController.abort()"),
    "ฝั่งวิหาร: ประกอบคำสั่งก่อนตั้งนาฬิกา (ไม่ทิ้ง timer ค้าง)",
  );
  for (const [src, name] of [[sifuSrc, "ซินแส"], [shrineSrc, "วิหาร"]]) {
    check(
      /Math\.min\(\s*\n?\s*Buffer\.byteLength\(instructions, "utf8"\) \+ 64 \* 1024/u.test(src),
      `${name}: เพดานคำตอบ = ขนาดคำสั่ง + 64KB และมีเพดานตายตัวปิดท้าย`,
    );
    check(!/\[probe\]/u.test(src), `${name}: ไม่ผูกกับ prefix ทดสอบ [probe]`);
        /* ผิดเมื่อมี session.userId โผล่ในบล็อก console.error โดยไม่ผ่าน sha256() ก่อน */
    const rawUuidLog = /console\.error\((?:(?!sha256\()[\s\S]){0,300}session\.userId/u;
    check(!rawUuidLog.test(src), `${name}: ล็อกไม่บันทึก uuid ผู้ใช้ตรง ๆ`);
  }

  /* ── ชั้น 6: ยิงจริง ── */
  if (process.env.SKIP_LIVE === "1") {
    notes.push("  ⏭  ข้ามการยิงจริง (SKIP_LIVE=1)");
  } else {
    const apiKey = readApiKey();
    if (!apiKey) {
      failures.push("  ❌ ไม่พบ OPENAI_API_KEY (ตั้ง env หรือ SKIP_LIVE=1 ถ้าตั้งใจข้าม)");
    } else {
      const instructions = wrapInstructions(card);
      const instructionBytes = Buffer.byteLength(instructions, "utf8");
      const budget = Math.min(instructionBytes + 64 * 1024, 2 * 1024 * 1024);
      const result = await fireClientSecrets(apiKey, instructions);
      check(result.status === 200, "ยิง client_secrets จริงได้ 200", `http=${result.status}`);
      check(result.hasSecret, "ได้ตั๋วจริงกลับมา (มี value)");
      check(
        result.responseBytes <= budget,
        "คำตอบเล็กกว่าเพดานที่โค้ดคำนวณ",
        `${result.responseBytes.toLocaleString()} ≤ ${budget.toLocaleString()} ไบต์`,
      );
      notes.push(
        `  ℹ️  คำสั่ง ${instructions.length.toLocaleString()} ตัวอักษร / `
        + `${instructionBytes.toLocaleString()} ไบต์ · คำตอบ ${result.responseBytes.toLocaleString()} ไบต์ `
        + `· ส่วนเกิน ${(result.responseBytes - instructionBytes).toLocaleString()} ไบต์ `
        + `· เพดานเก่า 16KB ${result.responseBytes > 16 * 1024 ? "จะพัง" : "ผ่าน"}`,
      );
    }
  }

  console.log(notes.join("\n"));
  if (failures.length) {
    console.log("\n" + failures.join("\n"));
    console.log(`\n❌ ไม่ผ่าน ${failures.length} ข้อ`);
    process.exit(1);
  }
  console.log("\n✅ ผ่านทุกข้อ");
}

/**
 * บรรทัดในบัตรที่ไม่ตรงกับตัวบทในผังเลย = ถูกตัดครึ่งหรือถูกแต่งขึ้น
 *
 * ห้ามใช้ includes() เป็นทางออกกว้าง ๆ — บรรทัดที่ถูกตัดครึ่งจะผ่านฉลุย ด่านจะไม่มีฟัน
 * รูปแบบที่ยอมรับได้มีแค่ 3 อย่าง และต้องตรงเป๊ะทุกอย่าง:
 *   1) บรรทัดเต็มของผัง
 *   2) หัวบรรทัด 流年 ที่ตัดตรงรอยต่อ "; เดือนจร=" พอดี (ตัวสร้างบัตรแยกเดือนจรออกไป)
 *   3) ก้อนเดือนจรที่เป็น "ท้ายบรรทัด" 流年 ของผังพอดี
 */
function foreignLines(card, packetKeys, packetLines) {
  const packetKeyList = packetLines.map(stripLabel);
  const liuNianHeads = new Set();
  for (const key of packetKeyList) {
    const cut = key.indexOf("; เดือนจร=");
    if (cut > 0) liuNianHeads.add(key.slice(0, cut));
  }
  const out = [];
  for (const line of card.split("\n")) {
    if (!line) continue;
    if (line.startsWith(CUT_NOTE_HEAD)) continue;
    const key = stripLabel(line);
    const monthly = MONTHLY_LABEL.exec(key);
    if (monthly) {
      if (packetKeyList.some((full) => full.endsWith(monthly[1]))) continue;
    } else if (packetKeys.has(key) || liuNianHeads.has(key)) continue;
    out.push(key.slice(0, 60));
  }
  return out;
}

function readApiKey() {
  const direct = (process.env.OPENAI_API_KEY ?? "").trim();
  if (direct) return direct;
  for (const file of [path.join(ROOT, ".env.local"), "/root/releases/current/.env.local"]) {
    try {
      const found = /^OPENAI_API_KEY=(.*)$/mu
        .exec(fs.readFileSync(file, "utf8"))?.[1]
        ?.trim()
        .replace(/^["']|["']$/gu, "");
      if (found) return found;
    } catch { /* ไฟล์ไม่มีก็ข้าม */ }
  }
  return "";
}

/** ซองคำสั่งโหมด relay แบบเดียวกับ buildRelayInstructions (ย่อกติกาให้พอวัดขนาดจริง) */
function wrapInstructions(card) {
  return [
    "คุณคือ 'เสียงพูด' ของซินแสใหญ่ hourkey ในห้องคุยสด",
    "⟦ID⟧日干=辛⟧",
    "FACT LOCK: เสาวัน 辛亥 · เสาเดือน 壬午 · เสาปี 庚午 · เสายาม 癸巳",
    "PILLAR LOCK: 年柱庚午 月柱壬午 日柱辛亥 時柱癸巳",
    "── ผังดวงจริงของผู้ใช้ (คัดตรงจากเครื่องยนต์ ห้ามแก้ตัวเลข ห้ามเดาเพิ่ม) ──",
    card,
    "── จบผังดวง (บางหมวดลึกถูกตัดตามงบ — ถ้าต้องใช้ ให้เรียก ask_sifu) ──",
    "กติกาเด็ดขาด: ข้อเท็จจริงในผังตอบได้ทันที · คำตัดสิน/พยากรณ์ต้องเรียก ask_sifu ก่อน",
    "พูดภาษาไทยเท่านั้น น้ำเสียงซินแสอาวุโสใจดี กระชับ",
  ].join("\n");
}

async function fireClientSecrets(apiKey, instructions) {
  const body = JSON.stringify({
    session: {
      audio: {
        input: {
          format: { rate: 24_000, type: "audio/pcm" },
          noise_reduction: { type: "near_field" },
          transcription: { language: "th", model: "gpt-4o-mini-transcribe" },
          turn_detection: {
            create_response: true,
            interrupt_response: true,
            prefix_padding_ms: 300,
            silence_duration_ms: 700,
            threshold: 0.7,
            type: "server_vad",
          },
        },
        output: { format: { rate: 24_000, type: "audio/pcm" }, voice: "ash" },
      },
      instructions,
      model: "gpt-realtime-2.1",
      output_modalities: ["audio"],
      tool_choice: "auto",
      tools: [{
        description: "ถามซินแสตัวเต็ม",
        name: "ask_sifu",
        parameters: {
          properties: { question: { description: "คำถาม", type: "string" } },
          required: ["question"],
          type: "object",
        },
        type: "function",
      }],
      type: "realtime",
    },
  });
  const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    body,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    method: "POST",
  });
  const text = await response.text();
  let hasSecret = false;
  try { hasSecret = typeof JSON.parse(text)?.value === "string"; } catch { /* ไม่ใช่ JSON */ }
  return { hasSecret, responseBytes: Buffer.byteLength(text, "utf8"), status: response.status };
}

main().catch((error) => {
  console.error("❌ ด่านล้ม:", error instanceof Error ? error.message : error);
  process.exit(1);
});
