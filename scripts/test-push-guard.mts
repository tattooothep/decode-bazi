/**
 * ด่านตรวจตัวคุมกลางก่อนส่งแจ้งเตือน
 *
 * ทุกข้อในไฟล์นี้คือกฎที่ระบบเคยละเมิดจริงมาแล้ว ไม่ใช่การเดาเผื่อ
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const G = require("../src/lib/push-guard.cjs");

let passed = 0;
function check(label: string, run: () => void): void {
  run();
  passed += 1;
  console.log(`  ✅ ${label}`);
}

const OPEN = {
  yam_enabled: true, auspicious_enabled: true, daily_enabled: true,
  saved_date_enabled: true, qimen_enabled: true, shrine_enabled: true, goal_enabled: true,
  security_enabled: true, service_enabled: true,
  quiet_start: 22, quiet_end: 7, max_per_day: 2, timezone: null,
};
/** 14:00 เวลาไทย = ช่วงตื่น */
const DAY = new Date("2026-07-31T07:00:00Z");
/** 03:00 เวลาไทย = กลางดึก */
const NIGHT = new Date("2026-07-30T20:00:00Z");

console.log("── ยังไม่ยินยอม ห้ามส่ง ──");

check("🔴 ไม่มีแถวตั้งค่า = ยังไม่ยินยอม ห้ามส่ง", () => {
  // ของเดิมเขียน COALESCE(yam_enabled, true) = คนไม่มีแถวถือว่าเปิด
  // ผู้ใช้จึงได้รับแจ้งเตือนโดยไม่เคยกดยินยอมสักครั้ง
  const r = G.mayNotify({ category: "yam", prefs: null, sentToday: 0, at: DAY });
  assert.equal(r.allow, false, "ส่งให้คนที่ยังไม่เคยตั้งค่า");
});

check("ปิดหมวดนั้น = ไม่ส่ง", () => {
  const r = G.mayNotify({
    category: "yam", prefs: { ...OPEN, yam_enabled: false }, sentToday: 0, at: DAY,
  });
  assert.equal(r.allow, false);
});

check("เปิดหมวดนั้น + ช่วงตื่น + ยังไม่ถึงเพดาน = ส่งได้", () => {
  const r = G.mayNotify({ category: "yam", prefs: OPEN, sentToday: 0, at: DAY });
  assert.equal(r.allow, true, r.reason);
});

console.log("── ช่วงห้ามรบกวน ──");

check("🔴 กลางดึกห้ามส่ง (ตัวยิงยามดีวิ่งทุก 30 นาทีตลอด 24 ชม.)", () => {
  const r = G.mayNotify({ category: "yam", prefs: OPEN, sentToday: 0, at: NIGHT });
  assert.equal(r.allow, false, "ยิงตอนตีสาม");
});

check("🔴 ช่วงคร่อมเที่ยงคืนต้องคิดถูก (22:00–07:00)", () => {
  for (const h of [22, 23, 0, 3, 6]) {
    assert.equal(G.inQuietHours(h, 22, 7), true, `${h}:00 ควรอยู่ในช่วงห้าม`);
  }
  for (const h of [7, 12, 18, 21]) {
    assert.equal(G.inQuietHours(h, 22, 7), false, `${h}:00 ไม่ควรอยู่ในช่วงห้าม`);
  }
});

check("ช่วงไม่คร่อมเที่ยงคืนก็ต้องถูก (01:00–06:00)", () => {
  assert.equal(G.inQuietHours(3, 1, 6), true);
  assert.equal(G.inQuietHours(7, 1, 6), false);
  assert.equal(G.inQuietHours(0, 1, 6), false);
});

check("เริ่ม = จบ ถือว่าไม่มีช่วงห้าม", () => {
  assert.equal(G.inQuietHours(3, 0, 0), false);
});

check("🔴 ไม่รู้เวลา = ไม่ส่ง (ฝั่งปลอดภัย)", () => {
  assert.equal(G.inQuietHours(null as never, 22, 7), true);
});

console.log("── เขตเวลา ห้ามตรึง +7 ──");

check("🔴 คนละเขตเวลาต้องได้ผลต่างกัน", () => {
  // กับดักจริงของระบบ: users.timezone เป็น Asia/Bangkok ทั้ง 16 แถว
  // และตัวยิงบวก 7 ชั่วโมงตายตัว คนลอนดอนได้สรุปเช้าตอนตีหนึ่ง
  const bkk = G.localHour("Asia/Bangkok", DAY);
  const london = G.localHour("Europe/London", DAY);
  assert.notEqual(bkk, london, "สองเขตเวลาให้ชั่วโมงเท่ากัน = ยังตรึงอยู่");
  assert.equal(bkk, 14, `กรุงเทพควรเป็น 14 ได้ ${bkk}`);
});

check("🔴 คนลอนดอนต้องไม่โดนปลุกด้วยเวลาไทย", () => {
  // เวลาไทย 08:00 = ลอนดอน 02:00 → ต้องไม่ส่ง
  const morningTH = new Date("2026-07-31T01:00:00Z");
  const th = G.mayNotify({
    category: "daily", prefs: OPEN, timezone: "Asia/Bangkok", sentToday: 0, at: morningTH,
  });
  const uk = G.mayNotify({
    category: "daily", prefs: OPEN, timezone: "Europe/London", sentToday: 0, at: morningTH,
  });
  assert.equal(th.allow, true, "คนไทยควรได้ตอน 8 โมงเช้า");
  assert.equal(uk.allow, false, "คนลอนดอนโดนส่งตอนตีสอง");
});

check("เขตเวลาที่ระบบไม่รู้จักต้องไม่ทำทั้งรอบล้ม", () => {
  const h = G.localHour("Mars/Olympus", DAY);
  assert.ok(Number.isInteger(h), "คืนค่าไม่ได้เลย");
});

console.log("── เพดานต่อวัน ──");

check("🔴 ถึงเพดานแล้วห้ามส่งเพิ่ม", () => {
  const r = G.mayNotify({ category: "yam", prefs: OPEN, sentToday: 2, at: DAY });
  assert.equal(r.allow, false, "ส่งเกินเพดาน");
});

check("ผู้ใช้ตั้งเพดานเองได้", () => {
  const wide = { ...OPEN, max_per_day: 5 };
  assert.equal(G.mayNotify({ category: "yam", prefs: wide, sentToday: 3, at: DAY }).allow, true);
  const none = { ...OPEN, max_per_day: 0 };
  assert.equal(G.mayNotify({ category: "yam", prefs: none, sentToday: 0, at: DAY }).allow, false);
});

console.log("── ปิดที่ไหนก็ถือว่าปิด ──");

check("🔴 ฝั่งเว็บปิด ฝั่งแอพเปิด = ไม่ส่ง (ฝั่งเข้มกว่าชนะ)", () => {
  const r = G.mayNotify({
    category: "daily", prefs: OPEN, webPrefs: { daily_enabled: false },
    sentToday: 0, at: DAY,
  });
  assert.equal(r.allow, false, "ผู้ใช้ปิดที่เว็บแล้วยังได้รับ");
});

console.log("── ค่าเริ่มต้นต้องเป็นปิด ──");

check("🔴 หมวดคำแนะนำทั้งหกต้องปิดจนกว่าผู้ใช้ยินยอม", () => {
  for (const k of ["saved_date_enabled", "daily_enabled", "yam_enabled", "qimen_enabled", "shrine_enabled", "goal_enabled"]) {
    assert.equal(G.DEFAULTS[k], false, `${k} ค่าเริ่มต้นเป็นเปิด`);
  }
});

check("เฉพาะความปลอดภัย/บริการที่ประกาศเป็นธุรกรรมจึงข้าม quiet/cap", () => {
  for (const category of ["security", "service"]) {
    const ordinary = G.mayNotify({ category, prefs: null, sentToday: 99, at: NIGHT });
    assert.equal(ordinary.allow, false, `${category} ที่ไม่ประกาศธุรกรรมข้ามกฎผู้ใช้`);
    const result = G.mayNotify({ category, transactional: true, prefs: null, sentToday: 99, at: NIGHT });
    assert.equal(result.allow, true, `${category} ถูกปิดด้วยกฎของข้อความคำแนะนำ`);
  }
});

check("ทุกทางที่ไม่ส่งต้องบอกเหตุผล ห้ามเงียบ", () => {
  const cases = [
    { category: "yam", prefs: null, sentToday: 0, at: DAY },
    { category: "yam", prefs: OPEN, sentToday: 9, at: DAY },
    { category: "yam", prefs: OPEN, sentToday: 0, at: NIGHT },
    { category: "ไม่มีหมวดนี้", prefs: OPEN, sentToday: 0, at: DAY },
  ];
  for (const c of cases) {
    const r = G.mayNotify(c);
    assert.equal(r.allow, false);
    assert.ok(r.reason.length > 0, `ไม่บอกเหตุผล: ${JSON.stringify(c)}`);
  }
});

check("🔴 เส้นทางลงทะเบียนห้ามพิมพ์ provider token ลง log", () => {
  const route = readFileSync("src/app/api/mobile/v1/push/route.ts", "utf8");
  assert.doesNotMatch(
    route,
    /console\.(?:log|info|warn|error)[\s\S]{0,160}(?:expo_push_token|device_push_token|deviceToken|token)/iu,
  );
});


console.log("── วันที่ต้องเป็นของผู้ใช้ ไม่ใช่ของไทย ──");

check("🔴 คนละเขตเวลาต้องได้วันที่ต่างกันเมื่อคร่อมเที่ยงคืน", () => {
  // เวลาไทยข้ามวันแล้ว แต่ฮาวายยังเป็นเมื่อวาน
  // ของเดิมใช้วันของไทยกับทุกคน = คนฮาวายได้ "ดวงวันนี้" ของวันพรุ่งนี้
  const at = new Date("2026-07-31T17:30:00Z");
  assert.equal(G.localDateStr("Asia/Bangkok", at), "2026-08-01");
  assert.equal(G.localDateStr("Pacific/Honolulu", at), "2026-07-31");
  assert.equal(G.localDateStr("Europe/London", at), "2026-07-31");
});

check("นาทีนับจากเที่ยงคืนต้องตรงตามเขตเวลา", () => {
  const at = new Date("2026-07-31T17:30:00Z");
  assert.equal(G.localMinutes("Asia/Bangkok", at), 30);        // 00:30
  assert.equal(G.localMinutes("Europe/London", at), 18 * 60 + 30);
});

check("เขตเวลาที่ไม่รู้จักต้องถอยไปค่ากลาง ไม่ล้ม", () => {
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(G.localDateStr("Mars/Olympus")));
  assert.ok(Number.isInteger(G.localMinutes("Mars/Olympus")));
});

check("🔴 ห้ามเหลือการตรึงเวลาไทยในตัวยิงตัวไหนเลย", () => {
  // กับดักจริงของระบบ: users.timezone เป็น Asia/Bangkok ทั้ง 16 แถว
  // และตัวยิง 4 ตัวบวก 7 ชั่วโมงตายตัว
  const crons = [
    "scripts/mobile-yam-push-cron.cjs",
    "scripts/mobile-daily-fortune-push-cron.cjs",
    "scripts/mobile-monthly-report-push-cron.cjs",
    "scripts/mobile-network-morning-push-cron.cjs",
  ];
  for (const path of crons) {
    const src = readFileSync(path, "utf8");
    // ยอมให้พูดถึงในหมายเหตุได้ แต่ห้ามเป็นโค้ดที่ทำงานจริง
    assert.ok(
      !/=\s*new Date\(Date\.now\(\) \+ 7 \* 3600_000\)/.test(src),
      `${path}: ยังตรึงเวลาไทย`,
    );
  }
});

console.log(`\n✅ ผ่านทั้งหมด ${passed} ข้อ`);
