/**
 * test identity-lock helper (27 พ.ค.) · รัน: node --experimental-strip-types scripts/test-identity-lock.mjs
 * ตัวล็อก 日干 กันอ่านผิดคนละดวง (己→壬)
 */
import { parseIdLine, stripIdLine, validateIdentity, extractExpectedDM } from "../src/lib/identity-lock.ts";
let pass = 0, fail = 0;
function t(label, got, exp) { const ok = JSON.stringify(got) === JSON.stringify(exp); console.log(`  ${ok ? '✅' : '❌'} ${label}: ${JSON.stringify(got)}`); ok ? pass++ : fail++; }

t("parse ⟦ID⟧日干=己⟧", parseIdLine("⟦ID⟧日干=己⟧\nเนื้อ"), "己");
t("parse มีช่องว่าง", parseIdLine("⟦ID⟧ 日干 = 壬 ⟧\n..."), "壬");
t("parse ไม่มี", parseIdLine("วันเจ้าคือ己..."), null);
t("parse ก้านมั่ว(ไม่ใช่10ก้าน)", parseIdLine("⟦ID⟧日干=X⟧"), null);
t("strip ID line", stripIdLine("⟦ID⟧日干=己⟧\nคำตอบจริง"), "คำตอบจริง");
t("strip ไม่มี ID (คงเดิม)", stripIdLine("คำตอบปกติ"), "คำตอบปกติ");
t("strip ก้านต่างคน (group 甲)", stripIdLine("⟦ID⟧日干=甲⟧\nกลุ่ม..."), "กลุ่ม...");
t("strip greeting ก่อน ID (ไม่ตัด · คงเดิม)", stripIdLine("สวัสดี ⟦ID⟧日干=己⟧\n..."), "สวัสดี ⟦ID⟧日干=己⟧\n...");
t("strip \\n นำหน้า ID (group delta ว่าง)", stripIdLine("\n⟦ID⟧日干=己⟧\nเนื้อ"), "เนื้อ");
t("ตรง (己=己)", validateIdentity("⟦ID⟧日干=己⟧\n...", "己").reason, "ok");
t("ผิด (壬≠己) = mismatch", validateIdentity("⟦ID⟧日干=壬⟧\n...", "己").reason, "dm_mismatch");
t("ไม่มี ID + มี expected = fail", validateIdentity("ดวงนี้...", "己").reason, "no_id_line");
t("greeting ก่อน ID (anchor) = fail ไม่ leak", validateIdentity("สวัสดีครับ ⟦ID⟧日干=己⟧\n...", "己").reason, "no_id_line");
t("ID ขึ้นต้น+มี \\n นำ = ผ่าน", validateIdentity("\n⟦ID⟧日干=己⟧\n...", "己").reason, "ok");
t("ไม่มี expected (ทั่วไป) = skip PASS", validateIdentity("อะไรก็ได้", null).ok, true);
t("extract DM จาก FACT LOCK", extractExpectedDM("ชื่อ:\nFACT LOCK: Day Master = 己 · polarity = yin · element = earth"), "己");
t("extract ไม่มี FACT LOCK", extractExpectedDM("(ไม่มี profileId · ตอบทั่วไป)"), null);

console.log(`\n[identity-lock] ${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
