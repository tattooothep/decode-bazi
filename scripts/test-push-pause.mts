/**
 * ทดสอบ: พักการแจ้งเตือนชั่วคราว + ปุ่ม "วันนี้พอ"
 *
 * ทำไมต้องมีเทสนี้: ช่วงพักคือกฎที่ตัดใบทิ้งเงียบๆ
 * ถ้ามันเพี้ยน ผู้ใช้จะไม่ได้รับอะไรเลยโดยไม่มีใครรู้ว่าเพราะอะไร
 */
import guard from "../src/lib/push-guard.cjs";

let pass = 0;
let fail = 0;
function check(name: string, got: unknown, want: unknown) {
  if (JSON.stringify(got) === JSON.stringify(want)) { pass += 1; return; }
  fail += 1;
  console.error(`❌ ${name}\n   ได้ ${JSON.stringify(got)}\n   ควรได้ ${JSON.stringify(want)}`);
}

const NOON = new Date("2026-08-01T05:00:00Z"); // เที่ยงตรงเวลาไทย — พ้นช่วงห้ามรบกวนแน่นอน
const base = {
  yam_enabled: true, auspicious_enabled: true, daily_enabled: true,
  quiet_start: 22, quiet_end: 7, max_per_day: 2, timezone: "Asia/Bangkok",
};

// ① ไม่ได้พัก → ส่งได้
check("ไม่ได้พัก",
  guard.mayNotify({ category: "yam", prefs: { ...base, paused_until: null }, sentToday: 0, at: NOON }).allow, true);

// ② พักอยู่ (อีก 3 วัน) → ไม่ส่ง ทุกหมวด
for (const category of ["yam", "auspicious", "daily"]) {
  const v = guard.mayNotify({
    category,
    prefs: { ...base, paused_until: new Date(NOON.getTime() + 3 * 86_400_000).toISOString() },
    sentToday: 0, at: NOON,
  });
  check(`พักอยู่ ตัดหมวด ${category}`, v.allow, false);
}

// ③ พักหมดอายุแล้ว → กลับมาส่งเอง ไม่ต้องให้ผู้ใช้มากดเปิดใหม่
check("พักหมดอายุแล้วกลับมาเอง",
  guard.mayNotify({
    category: "yam",
    prefs: { ...base, paused_until: new Date(NOON.getTime() - 60_000).toISOString() },
    sentToday: 0, at: NOON,
  }).allow, true);

// ④ รับค่าที่เป็น Date ตรงๆ ได้ด้วย (ไดรเวอร์ฐานข้อมูลคืน Date ไม่ใช่ข้อความ)
check("รับค่าแบบ Date จากฐานข้อมูล",
  guard.mayNotify({
    category: "yam",
    prefs: { ...base, paused_until: new Date(NOON.getTime() + 3_600_000) },
    sentToday: 0, at: NOON,
  }).allow, false);

// ⑤ ค่าเสียหาย → ต้องไม่ตัดใบทิ้ง (ตีความว่าไม่ได้พัก) และต้องไม่ล้ม
check("ค่าพักเสียหาย ไม่ตัดใบทิ้ง",
  guard.mayNotify({
    category: "yam", prefs: { ...base, paused_until: "ไม่ใช่วันที่" }, sentToday: 0, at: NOON,
  }).allow, true);

// ⑥ พักชนะทุกอย่าง — แม้เปิดหมวดไว้และยังไม่ถึงเพดาน
check("พักชนะแม้ยังไม่ถึงเพดาน",
  guard.mayNotify({
    category: "daily",
    prefs: { ...base, max_per_day: 10, paused_until: new Date(NOON.getTime() + 86_400_000).toISOString() },
    sentToday: 0, at: NOON,
  }).reason.startsWith("ผู้ใช้พักการแจ้งเตือนถึง"), true);

console.log(`[test-push-pause] ผ่าน ${pass} ตก ${fail}`);
process.exit(fail === 0 ? 0 : 1);
