/* Test HK_SIFU_CRITICAL_EVIDENCE_GATE_V1
 * รัน: node --experimental-strip-types --loader ./scripts/ts-loader.mjs scripts/test-sifu-critical-evidence-gate.mjs */
import { checkSifuCriticalEvidence } from "../src/lib/sifu-critical-evidence-gate.ts";

let pass = 0, fail = 0;
function ok(label, cond, detail = "") {
  console.log(`${cond ? "✓" : "✗"} ${label}${detail ? `\n  ${detail}` : ""}`);
  cond ? pass++ : fail++;
}

const ctx = [
  "ฮะก้านจร五合 ข้ามชั้น: 丙辛(ปีจร2026(丙午)↔เสาเดือน·辛) → 合而不化 ◆ 丁壬(ปีจร2027(丁未)↔เสาวัน·壬) → 本身之合",
  "ปฏิกิริยาข้ามชั้น วัยจร+ปีจร+ดวงเกิด: 四庫全 ครบเมื่อปีจร 2027 มาเติม · แหล่งกิ่ง: 辰=วัยจร甲辰 · 戌=เสาวัน · 丑=เสาเดือน · 未=ปีจร2027",
  "ปีจรเทียบครบทุกเสา: ปีจร2026丙午 ↔ เสาเดือน丑 = 六害/午丑 · เทียบครบทุกเสา",
  "ปฏิกิริยาข้ามชั้น วัยจร+ปีจร+ดวงเกิด: 巳酉丑三合→ธาตุทอง ครบด้วยวัยจรถัดไป乙巳(อายุ35-45)",
].join("\n");

let r = checkSifuCriticalEvidence("ปีนี้มี丙壬冲 ต้องตั้งรับ", "ดูปี 2026", ctx, { hasPacket: true, nowYear: 2026 });
ok("2026 ขาด 丙辛/午丑 → fail", !r.ok && r.missing.some((m) => m.code === "2026:丙辛") && r.missing.some((m) => m.code === "2026:午丑害"), JSON.stringify(r.missing));

r = checkSifuCriticalEvidence("ปีนี้มี丙辛合 และ午丑害 จึงไม่ใช่冲ล้วน", "ดูปี 2026", ctx, { hasPacket: true, nowYear: 2026 });
ok("2026 เอ่ยครบ → pass", r.ok, JSON.stringify(r.missing));

r = checkSifuCriticalEvidence("ปีหน้าเป็นปีตั้งรับทั่วไป", "ดูปี 2027", ctx, { hasPacket: true, nowYear: 2026 });
ok("2027 ขาด 丁壬/四庫 → fail", !r.ok && r.missing.some((m) => m.code === "2027:丁壬") && r.missing.some((m) => m.code === "2027:四庫全"), JSON.stringify(r.missing));

r = checkSifuCriticalEvidence("ปี 2027 มี丁壬合และสี่คลัง辰戌丑未ครบ", "ดูปี 2027", ctx, { hasPacket: true, nowYear: 2026 });
ok("2027 เอ่ยครบ → pass", r.ok, JSON.stringify(r.missing));

r = checkSifuCriticalEvidence("วัย乙巳มี巳酉丑三合金", "ดูวัย 35-45", ctx, { hasPacket: true, nowYear: 2026 });
ok("วัย 35-45 เอ่ย乙巳/巳酉丑 → pass", r.ok, JSON.stringify(r.missing));

r = checkSifuCriticalEvidence("ตอบเรื่องระบบ", "ระบบใช้คัมภีร์กี่เล่ม", ctx, { hasPacket: true, nowYear: 2026 });
ok("คำถามระบบ → skip", r.ok && r.skipped, JSON.stringify(r));

console.log(`\n=== ${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"} ===`);
process.exit(fail ? 1 : 0);
