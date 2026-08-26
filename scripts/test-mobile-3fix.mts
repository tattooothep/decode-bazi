/**
 * ด่านตรวจ 3 จุดที่แก้ฝั่งเครื่องแม่ข่าย 23 ก.ค. 2569
 *  1) เขตเวลาเกิด — จื่อเวยต้องรับ ?tz= และส่งออฟเซ็ตจริงให้ engine (เดิมปล่อยให้ engine เดาจากลองจิจูด)
 *  2) กรองก้อน "งานอะไร" ก่อนเข้าคำสั่งซินแส (เดิมส่งดิบ → แทรกข้อความสั่งซินแสได้)
 *  3) เพดานสมาชิกทีมตามแพ็กเกจจริง + ต้องบอกจำนวน ไม่ใช่ตัดรายชื่อทิ้งเงียบ
 *
 * รัน: npx tsx scripts/test-mobile-3fix.mts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_BIRTH_TZ_OFFSET_MIN,
  birthTimezoneMeta,
  parseTz,
  resolveBirthTz,
  tzOffsetHoursAt,
  wallClockToUtc,
} from "../src/lib/birth-timezone";
import { PRODUCT_PAGE_ENTITLEMENTS } from "../src/lib/product-entitlement";

const root = join(import.meta.dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
let checks = 0;
const ok = (cond: unknown, msg: string) => { assert.ok(cond, msg); checks += 1; };

/* ── 1) เขตเวลาเกิด ───────────────────────────────────────────── */
ok(parseTz(null) === null, "ไม่ส่ง tz มา = ไม่มีเขตเวลาระบุ");
ok(parseTz("")?.label === undefined, "ค่าว่าง = ไม่มีเขตเวลาระบุ");
ok(parseTz("+08:00")?.offsetMin === 480, "อ่านออฟเซ็ต +08:00 ได้");
ok(parseTz("8")?.offsetMin === 480, "อ่านออฟเซ็ตแบบตัวเลขชั่วโมงได้");
ok(parseTz("-05:30")?.offsetMin === -330, "อ่านออฟเซ็ตติดลบพร้อมนาทีได้");
ok(parseTz("+15:00") === null, "ออฟเซ็ตเกินจริงต้องถูกปฏิเสธ");
ok(parseTz("+14:59") === null, "ออฟเซ็ตต้องไม่เกิน +14:00 รวมทั้งนาที");
ok(parseTz("Asia/Taipei")?.kind === "zone", "อ่านชื่อโซนได้");
ok(parseTz("asia/bangkok")?.label === "Asia/Bangkok", "ชื่อ IANA ตัวพิมพ์เล็กต้องถูก canonicalize");
ok(parseTz("US/Eastern")?.label === "America/New_York", "IANA alias ต้องถูก canonicalize");
ok(parseTz("Etc/UTC")?.label === "UTC", "Etc/UTC ต้องถูก canonicalize เป็น UTC");
ok(parseTz("CET")?.label === "Europe/Brussels", "ชื่อโซนแบบไม่มี slash ที่ Intl รองรับต้อง canonicalize");
ok(parseTz("'; DROP TABLE") === null, "ข้อความแปลกปลอมต้องถูกปฏิเสธ");

// เกิดไทเป 1990-05-05 06:30 → เวลาสากลต้องเป็น 22:30 ของวันก่อนหน้า (+08:00)
const taipei = wallClockToUtc("1990-05-05T06:30:00", parseTz("Asia/Taipei")!);
ok(taipei?.toISOString() === "1990-05-04T22:30:00.000Z", "เวลาเกิดไทเปแปลงเป็นเวลาสากลถูกต้อง");
// เกิดลอนดอนกลางฤดูร้อน = BST (+01:00) ต้องคิด DST ให้ถูก
const london = wallClockToUtc("1990-07-05T06:30:00", parseTz("Europe/London")!);
ok(london?.toISOString() === "1990-07-05T05:30:00.000Z", "เวลาเกิดลอนดอนหน้าร้อนคิด DST ถูกต้อง");
// ไม่ส่ง tz = พฤติกรรมเดิม +07:00 เป๊ะ (ห้ามเปลี่ยนผลของดวงเดิมที่มีอยู่แล้ว)
const bangkokDefault = wallClockToUtc("1990-05-05T06:30:00", resolveBirthTz(null));
ok(bangkokDefault?.toISOString() === "1990-05-04T23:30:00.000Z", "ไม่ส่ง tz = ยังเป็นเวลาไทยเหมือนเดิม");
ok(resolveBirthTz(null).offsetMin === DEFAULT_BIRTH_TZ_OFFSET_MIN, "ค่าตั้งต้นคือเวลาไทย");

ok(tzOffsetHoursAt(parseTz("Asia/Taipei")!, new Date("1990-05-04T22:30:00Z")) === 8, "ออฟเซ็ตไทเป = 8 ชั่วโมง");
ok(tzOffsetHoursAt(parseTz("Europe/London")!, new Date("1990-07-05T05:30:00Z")) === 1, "ออฟเซ็ตลอนดอนหน้าร้อน = 1 ชั่วโมง");
ok(tzOffsetHoursAt(resolveBirthTz(null), new Date()) === 7, "ค่าตั้งต้น = 7 ชั่วโมง");

// ธงบอกผู้ใช้ต้องตรงไปตรงมา และครบ 3 ภาษา (zh ห้ามมีอักษรไทย)
const metaDefault = birthTimezoneMeta(null);
ok(metaDefault.isDefault === true && metaDefault.source === "default_bangkok", "ไม่ส่ง tz ต้องติดธงว่าเป็นค่าตั้งต้น");
const metaQuery = birthTimezoneMeta(parseTz("Asia/Taipei"));
ok(metaQuery.isDefault === false && metaQuery.used === "Asia/Taipei", "ส่ง tz มาแล้วต้องบอกว่าใช้ของจริง");
for (const meta of [metaDefault, metaQuery]) {
  for (const lang of ["th", "en", "zh"] as const) {
    ok(meta.note[lang].trim().length > 10, `คำอธิบายเขตเวลาต้องมีภาษา ${lang}`);
  }
  ok(!/[฀-๿]/u.test(meta.note.zh), "ข้อความจีนห้ามมีอักษรไทยปน");
}

// เส้นจื่อเวยต้องต่อท่อจริง ไม่ใช่มีแต่ไลบรารี
const ziweiRoute = read("src/app/api/mobile/v1/ziwei/route.ts");
ok(/parseTz\(url\.searchParams\.get\("tz"\)\)/u.test(ziweiRoute), "เส้นจื่อเวยต้องรับ ?tz=");
ok(/gmtOffsetHours: tzOffsetHoursAt\(tz, dtUTC\)/u.test(ziweiRoute), "ต้องส่งออฟเซ็ตจริงให้ engine ไม่ปล่อยให้เดาจากลองจิจูด");
ok(/timezone: birthTimezoneMeta\(tzParam/u.test(ziweiRoute), "ต้องส่งธงเขตเวลากลับให้แอพแสดง");
ok(!/new Date\(`\$\{row\.birth_datetime\}\+07:00`\)/u.test(ziweiRoute), "ห้ามกลับไปตรึง +07:00 ตายตัว");

/* ── 2) กรอง "งานอะไร" ก่อนเข้าคำสั่งซินแส ───────────────────── */
const sifuRoute = read("src/app/api/mobile/v1/network/sifu/route.ts");
ok(/activity: cleanActivity\(/u.test(sifuRoute), "ก้อนกิจกรรมต้องผ่านตัวกรองก่อนเข้าคำสั่งซินแส");
ok(!/activity: \(body as \{ activity\?: unknown \}\)\.activity \|\| null/u.test(sifuRoute), "ห้ามส่งกิจกรรมดิบเข้าคำสั่งอีก");
ok(/ELEMENT_WHITELIST/u.test(sifuRoute), "ธาตุต้องผ่านรายการที่อนุญาต");
ok(/\\u0000-\\u001F/u.test(sifuRoute) || /u0000/u.test(sifuRoute), "ต้องตัดอักขระควบคุม (ช่องทางแทรกคำสั่งหลัก)");
for (const field of ["summary", "roles", "manual", "priority", "required", "support"]) {
  ok(new RegExp(`${field}`).test(sifuRoute), `ตัวกรองต้องครอบคลุมฟิลด์ ${field} ที่ไหลเข้าคำสั่ง`);
}

/* ── 3) เพดานสมาชิกทีมตามแพ็กเกจ ─────────────────────────────── */
ok(/const MAX_TEAM_MEMBERS = 12;/u.test(sifuRoute), "เพดานแข็งของระบบต้องเป็น 12 ไม่ใช่ 8");
ok(/team_limit_exceeded/u.test(sifuRoute), "ส่งเกินเพดานต้องตอบผิดพลาดพร้อมจำนวน");
ok(/getProductAccess\(session\.userId\)/u.test(sifuRoute), "เพดานต้องอ่านจากแพ็กเกจจริงของผู้ใช้");
ok(!/teamIds\.slice\(0, 8\)/u.test(sifuRoute), "ห้ามตัดรายชื่อทิ้งเงียบ");
ok(PRODUCT_PAGE_ENTITLEMENTS.master.network.team_people === 12, "แพ็กสูงสุดให้ทีม 12 คน");
ok(PRODUCT_PAGE_ENTITLEMENTS.free.network.team_people === 0, "แพ็กฟรียังไม่เปิดจัดทีม");
/* 24 ก.ค. เจ้านายเคาะ: เปิดจัดทีมให้พรีเมียม 8 คน (เดิม 0 = คนจ่าย ฿399 กดแล้วโดนปฏิเสธ) */
ok(PRODUCT_PAGE_ENTITLEMENTS.premium.network.team_people === 8, "พรีเมียมจัดทีมได้ 8 คน");
ok(PRODUCT_PAGE_ENTITLEMENTS.premium.network.team_ai === true, "พรีเมียมต้องถามซินแสเรื่องทีมได้ ไม่งั้นเปิดเพดานไปก็กดไม่ได้");
ok(PRODUCT_PAGE_ENTITLEMENTS.trial.network.team_people === 0, "แพ็กทดลองยังไม่เปิดจัดทีม");

/* ── 4) คอลัมน์เขตเวลาเกิดใน DB (24 ก.ค.) — โปรไฟล์ต้องมาก่อนค่าที่หน้าจอส่ง ─── */
const createRoute = read("src/app/api/profile/create/route.ts");
ok(/birthTz: birthTzRaw/u.test(createRoute), "เส้นสร้างโปรไฟล์ต้องรับเขตเวลาเกิด");
ok(/parseTz\(typeof birthTzRaw === "string"/u.test(createRoute), "เขตเวลาที่รับมาต้องผ่านตัวอ่านกลาง (รูปผิด = เก็บ NULL)");
ok(/birth_tz, birth_tz_source/u.test(createRoute), "ต้องบันทึกลงคอลัมน์จริง");
ok(/birthTz \? "user_input" : null/u.test(createRoute), "ต้องบันทึกที่มาของค่า (ห้ามเดาแทนผู้ใช้)");

for (const [file, label] of [
  ["src/app/api/mobile/v1/ziwei/route.ts", "จื่อเวย"],
  ["src/app/api/mobile/v1/tianxing/route.ts", "ดาวจริง"],
] as const) {
  const src = read(file);
  ok(/birth_tz/u.test(src), `เส้น${label}ต้องอ่านเขตเวลาเกิดจากโปรไฟล์`);
  ok(/parseTz\(row\.birth_tz\)/u.test(src), `เส้น${label}ต้องตีความเขตเวลาด้วยตัวอ่านกลาง`);
  ok(/tzFromProfile/u.test(src), `เส้น${label}ต้องให้ค่าจากโปรไฟล์มาก่อนค่าที่หน้าจอส่ง`);
}
ok(birthTimezoneMeta(parseTz("Asia/Taipei"), true).source === "profile", "ธงต้องบอกได้ว่าเขตเวลามาจากโปรไฟล์");
ok(birthTimezoneMeta(parseTz("Asia/Taipei"), false).source === "query", "ธงต้องแยกกรณีที่หน้าจอส่งมาเอง");
ok(birthTimezoneMeta(null).isDefault === true, "ไม่มีเขตเวลาที่ไหนเลย = ยังต้องติดธงค่าตั้งต้น");

console.log(`MOBILE_3FIX_OK (${checks} assertions) birth-tz(profile-column) + activity-sanitize + team-cap-by-plan`);
