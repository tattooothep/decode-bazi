/**
 * ด่านตรวจวันไหว้เจ้า / เทศกาลจีน
 *
 * 🔴 วันไหว้ผูกกับปฏิทินจันทรคติ ซึ่งเลื่อนทุกปีและมีเดือนอธิกมาส
 * ตารางที่พิมพ์ไว้ตายตัวจะผิดทันทีที่ข้ามปีโดยไม่มีใครรู้ตัว
 * ด่านนี้จึงตรวจกับวันจริงหลายปี ไม่ใช่ปีเดียว
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const F = require("../src/lib/festival-days.cjs");

let passed = 0;
function check(label: string, run: () => void): void {
  run();
  passed += 1;
  console.log(`  ✅ ${label}`);
}

console.log("── วันไหว้ต้องตรงปฏิทินจริง ──");

check("🔴 ตรุษจีนต้องตรงทุกปี (เลื่อนทุกปี ตารางตายตัวจะผิด)", () => {
  // วันตรุษจีนจริง — ตรวจได้จากปฏิทินสากล
  const known: Record<string, string> = {
    "2026-02-17": "春节",
    "2027-02-06": "春节",
    "2028-01-26": "春节",
  };
  for (const [date, zh] of Object.entries(known)) {
    const list = F.festivalsOn(date);
    assert.ok(list.some((f: {zh:string}) => f.zh === zh), `${date} ควรเป็นตรุษจีน ได้ ${JSON.stringify(list)}`);
  }
});

check("🔴 สารทจีนกับไหว้พระจันทร์ต้องถูก", () => {
  assert.ok(F.festivalsOn("2026-08-27").some((f: {zh:string}) => f.zh === "中元节"), "สารทจีน");
  assert.ok(F.festivalsOn("2026-09-25").some((f: {zh:string}) => f.zh === "中秋节"), "ไหว้พระจันทร์");
});

check("🔴 ไหว้ฟ้าดิน (เทียนกง) ต้องมี — ตัวคำนวณไม่มีให้ ต้องเติมเอง", () => {
  // 正月初九 · ปี 2026 ตรุษจีน 17 ก.พ. → ขึ้น 9 ค่ำ = 25 ก.พ.
  const list = F.festivalsOn("2026-02-25");
  assert.ok(list.some((f: {zh:string}) => f.zh === "天公生"),
    `25 ก.พ. 2026 ควรเป็นไหว้ฟ้าดิน ได้ ${JSON.stringify(list)}`);
});

check("วันพระจีนต้องมีเดือนละสองครั้ง (ขึ้น 1 ค่ำ กับ 15 ค่ำ)", () => {
  let temple = 0;
  let festival = 0;
  for (let m = 1; m <= 12; m += 1) {
    for (let d = 1; d <= 31; d += 1) {
      const s = `2026-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      for (const f of F.festivalsOn(s)) {
        if (f.zh === "初一十五") temple += 1; else festival += 1;
      }
    }
  }
  console.log(`     วันพระจีน ${temple} วัน · เทศกาล ${festival} วัน`);
  // 24 วันพระ/ปี ลบวันที่ชนเทศกาลใหญ่ออกไป
  assert.ok(temple >= 14 && temple <= 24, `วันพระจีนได้ ${temple} วัน ผิดปกติ`);
  assert.ok(festival >= 10, `เทศกาลได้แค่ ${festival} วัน`);
});

check("🔴 วันพระจีนต้องไม่ขึ้นซ้อนวันเทศกาลใหญ่", () => {
  // ตรุษจีนเป็นขึ้น 1 ค่ำ ถ้าไม่กันจะขึ้นสองใบซ้อนกัน
  const list = F.festivalsOn("2026-02-17");
  assert.equal(list.length, 1, `ตรุษจีนขึ้น ${list.length} ใบ`);
  assert.equal(list[0].zh, "春节");
});

console.log("── ชื่อ 3 ภาษา ──");

check("🔴 ทุกวันไหว้ต้องมีชื่อครบ 3 ภาษา", () => {
  for (let m = 1; m <= 12; m += 1) {
    for (let d = 1; d <= 31; d += 1) {
      const s = `2026-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      for (const f of F.festivalsOn(s)) {
        assert.ok(f.th && f.th.length > 0, `${s}: ไม่มีชื่อไทย`);
        assert.ok(f.en && f.en.length > 0, `${s}: ไม่มีชื่ออังกฤษ`);
        assert.ok(f.zh && f.zh.length > 0, `${s}: ไม่มีชื่อจีน`);
      }
    }
  }
});

check("ชื่อไทยต้องเป็นคำที่คนไทยเชื้อสายจีนเรียกจริง ไม่ใช่แปลตรงตัว", () => {
  const names = F.FESTIVAL_NAMES;
  assert.equal(names["清明节"].th, "เช็งเม้ง", "ไม่ใช่คำที่คนเรียกจริง");
  assert.equal(names["中元节"].th, "สารทจีน");
  assert.equal(names["冬至节"].th, "ตังโจ่ย");
});

console.log("── เตือนล่วงหน้า ──");

check("🔴 ต้องเตือนล่วงหน้า ไม่ใช่เตือนวันนั้น (ของไหว้ต้องเตรียม)", () => {
  const ahead = F.upcomingFestival("2026-08-26", 1);
  assert.notEqual(ahead, null, "ไม่เจอวันไหว้พรุ่งนี้");
  assert.equal(ahead.date, "2026-08-27");
  assert.equal(ahead.daysAhead, 1);
  assert.ok(ahead.festivals.some((f: {zh:string}) => f.zh === "中元节"));
});

check("วันธรรมดาต้องไม่เตือนอะไร", () => {
  assert.equal(F.upcomingFestival("2026-08-05", 1), null);
});

check("วันที่รูปแบบผิดต้องไม่ล้ม", () => {
  assert.deepEqual(F.festivalsOn("ไม่ใช่วันที่"), []);
  assert.deepEqual(F.festivalsOn(""), []);
  assert.equal(F.upcomingFestival("31/07/2026", 1), null);
});

console.log("── 🔴 ห้ามทำนายผลลัพธ์ ──");

const LIB = readFileSync("src/lib/festival-days.cjs", "utf8");
const CRON = readFileSync("scripts/mobile-auspicious-push-cron.cjs", "utf8");

check("🔴 ข้อความต้องไม่ทำนายผลและไม่ขู่", () => {
  // ผู้ใช้กลุ่มนี้เชื่อจริงและทำตามจริง ขู่เมื่อไรเขาทำตามจริง
  const banned = ["จะได้", "จะเสีย", "ห้ามพลาด", "ไม่ไหว้แล้ว", "เคราะห์", "ซวย", "อันตราย"];
  for (const word of banned) {
    assert.ok(!CRON.includes(`"${word}`), `มีคำต้องห้าม: ${word}`);
  }
  assert.ok(/ห้ามทำนายผลลัพธ์/.test(LIB), "ไม่ได้เขียนขอบเขตไว้ในโค้ด");
});

check("🔴 ทุกข้อความต้องบอกว่าทำอะไรได้ ไม่ใช่บอกแต่ว่าเป็นวันอะไร", () => {
  // กติกาที่หน่วยตรวจตำราวางไว้: ไม่มีบรรทัด "แล้วทำอะไรได้" = ห้ามส่ง
  for (const key of ["ancestor", "worship"]) {
    const m = new RegExp(`${key}: "([^"]+)"`).exec(CRON);
    assert.ok(m, `ไม่มีข้อความหมวด ${key}`);
    assert.ok(/เตรียม|prepare|備/.test(m[1]), `${key} ไม่ได้บอกว่าทำอะไรได้: ${m[1]}`);
  }
});

check("🔴 ต้องผ่านตัวคุมและใช้ตัวส่งกลาง", () => {
  assert.ok(/guard\.mayNotify\(/.test(CRON), "ไม่ได้ผ่านตัวคุม");
  assert.ok(/delivery\.deliver\(/.test(CRON), "ไม่ได้ใช้ตัวส่งกลาง");
  assert.ok(/category: "shrine"/.test(CRON), "ใช้หมวดผิด");
  assert.ok(!/exp\.host/.test(CRON), "ยังยิงไปบริการกลางที่ไม่เคยสำเร็จ");
});

console.log(`\n✅ ผ่านทั้งหมด ${passed} ข้อ`);
