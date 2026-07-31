/**
 * ทดสอบท่อนทิศ+องค์เทพในใบแจ้งเตือนยามดี (31 ก.ค. 69)
 *
 * เจ้าของสั่ง "เพิ่มชื่อเทพไปหน่อยสิ ว่าฤกษ์นี้เทพอะไร รองรับทุกภาษานะ"
 * 🔴 ก่อนหน้านี้ใบยามไม่มีฉีเหมินเลยสักบรรทัด ข้อความเป็นคำตายตัวเหมือนกันทุกใบ
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass += 1; else { fail += 1; console.error(`❌ ${n}`); } };

const cron = readFileSync("scripts/mobile-yam-push-cron.cjs", "utf8");

// ── ① ตัวยิงต่อฉีเหมินจริง ──
ok("มีตัวดึงผังฉีเหมิน", cron.includes("fetchQimenHighlight"));
ok("ขอผังของเวลาที่ยามเริ่ม ไม่ใช่เวลาปัจจุบัน", cron.includes("startTime") && cron.includes("ไม่ใช่เวลาปัจจุบัน"));
ok("อ่านชื่อองค์เทพครบ 3 ภาษา",
  cron.includes("deity_name_th") && cron.includes("deity_name_en") && cron.includes("deity_zh"));
ok("อ่านคำแนะนำครบ 3 ภาษา",
  cron.includes("door_action_advice_th") && cron.includes("door_action_advice_en") && cron.includes("door_action_advice_zh"));
ok("ชื่อทิศครบ 8 ทิศ", ["N:", "NE:", "E:", "SE:", "S:", "SW:", "W:", "NW:"].every((k) => cron.includes(k)));
ok("ส่งตามภาษาของแต่ละเครื่อง", cron.includes("raw.locale") && cron.includes("qimenLine(highlight, loc)"));

// 🔴 ไม่มีผัง = ส่งใบเดิม ไม่ใช่เดาทิศให้ (ผู้ใช้จะหันหน้าไปจริง)
ok("ไม่มีผังแล้วไม่บอกทิศ", cron.includes('if (highlight === null) return ""'));
ok("คะแนนต่ำแล้วไม่บอกทิศ", cron.includes("best.score < 50"));
ok("ตัดกังกลางออก ไม่มีทิศตามตำรา", cron.includes("ตัดกังกลางออก"));
ok("ล้มแล้วไม่เงียบ", cron.includes("ขอผังฉีเหมินไม่สำเร็จ"));

// ── ② ชื่อเทพในฐานข้อมูลต้องครบ 3 ภาษา ──
const row = execFileSync("docker", ["exec", "-i", "decode-postgres", "psql", "-U", "decode_user", "decode_db",
  "-tAF|", "-c", `SELECT count(*), count(*) FILTER (WHERE btrim(coalesce(name_th,''))<>''),
   count(*) FILTER (WHERE btrim(coalesce(name_en,''))<>''),
   count(*) FILTER (WHERE btrim(coalesce(zh,''))<>'') FROM ref_qimen_deities_dict`],
  { encoding: "utf8" }).trim().split("|").map(Number);
ok(`เทพครบ 10 องค์ (พบ ${row[0]})`, row[0] === 10);
ok(`ชื่อไทยครบ (${row[1]}/10)`, row[1] === 10);
ok(`ชื่ออังกฤษครบ (${row[2]}/10)`, row[2] === 10);
ok(`ชื่อจีนครบ (${row[3]}/10)`, row[3] === 10);

// 🔴 ชื่ออังกฤษห้ามเป็นพินอินเปล่าๆ ที่คนอ่านไม่รู้ว่าคืออะไร
const names = execFileSync("docker", ["exec", "-i", "decode-postgres", "psql", "-U", "decode_user", "decode_db",
  "-tAF|", "-c", "SELECT name_en FROM ref_qimen_deities_dict"], { encoding: "utf8" }).trim().split("\n");
ok("ชื่ออังกฤษมีคำแปล ไม่ใช่พินอินเปล่า", names.every((n) => n.includes("(")));
ok("ชื่ออังกฤษไม่มีอักษรไทยปน", names.every((n) => !/[฀-๿]/.test(n)));

// ── ③ ท่อนข้อความครบ 3 ภาษา ──
ok("ท่อนไทยมี", cron.includes("ทิศดีสุดของยามนี้"));
ok("ท่อนอังกฤษมี", cron.includes("Best direction this hour"));
ok("ท่อนจีนมี", cron.includes("此時最吉方"));

// ── ④ เครื่องมือตรวจสอบ ──
ok("มีโหมดแกล้งเวลาไว้ตรวจ", cron.includes("--force-time="));
ok("แกล้งเวลาใช้ได้เฉพาะตอนยิงแห้ง", cron.includes("DRY && /^\\d{2}:\\d{2}$/.test(FORCE_TIME)"));

console.log(`[test-yam-qimen-line] ผ่าน ${pass} ตก ${fail}`);
process.exit(fail === 0 ? 0 : 1);
