/**
 * Test · synastry "ลิสต์ปิด" (closed-world) · เฟส 0+5
 * รัน: node --experimental-strip-types scripts/test-synastry-closed.mts
 * เฟส 0: import buildSynastry "ตัวจริง" จาก src/lib/bazi-synastry.ts (self-contained · ไม่ติด next/server แล้ว)
 *   → test output จริง ไม่ใช่ mirror (แก้ตาม Codex ติง)
 * โจทย์: AI ต้องรู้ว่า "เช็คครบทุกคู่" + ห้ามแต่งคู่นอกลิสต์
 */
import { buildSynastry, type PersonSyn } from "../src/lib/bazi-synastry.ts";

let pass = 0, fail = 0;
const ck = (l: string, c: boolean, g?: string) => { c ? (pass++, console.log("  ✅ " + l)) : (fail++, console.log("  ❌ " + l + (g ? " · " + g : ""))); };

const P = (name: string, dmEl: string, yong: string[], dayB: string, yearB: string, mode: "3p" | "4p" = "4p"): PersonSyn => ({
  name, role: "x", isSelf: false, text: "", mode, dmEl, yongEls: yong,
  pillars: { year: { stem: "甲", branch: yearB }, day: { stem: "壬", branch: dayB } },
});

console.log("[synastry closed-list · 3 คน · มีคู่เด่น (na↔ป้า มี 子午冲)]");
// fixture: na(day寅/year子) ป้า(day午/year午) ไนท์(day巳/year卯) — มีหลายคู่เด่น (子午冲/寅巳害/午卯破) · assert closed-list+คู่ na↔ป้า
const out = buildSynastry([P("na", "water", ["wood"], "寅", "子"), P("ป้า", "earth", ["fire"], "午", "午"), P("ไนท์", "earth", ["fire"], "巳", "卯")], "th");
ck("ระบุ 'เทียบครบทุกคู่ 3 คู่' (C(3,2)=3)", /เทียบครบทุกคู่ 3 คู่/.test(out), out.slice(0, 60));
ck("ระบุจำนวนคน 3 + รายชื่อ na/ป้า/ไนท์", /จาก 3 คน \[na, ป้า, ไนท์\]/.test(out), "");
ck("คู่ไม่ขึ้น = เช็คแล้วไม่มี (ไม่ใช่ยังไม่เช็ค)", /เป็นข้อสรุป ไม่ใช่ "ยังไม่เช็ค"/.test(out), "");
ck("ห้ามแต่งคู่นอกลิสต์", /ห้ามสร้าง\/สันนิษฐาน 合\/冲\/破\/害/.test(out), "");
ck("แยกในดวง vs ข้ามคน", /ปฏิกิริยาภายในดวงเดี่ยว.*ข้ามคน → เฉพาะลิสต์นี้/.test(out), "");
ck("คู่ na↔ป้า ขึ้นจริง (มี 六沖)", /na ↔ ป้า/.test(out) && /ปะทะ\(冲\)/.test(out), "");

console.log("[en/zh closed-list · import จริง]");
const oe = buildSynastry([P("na", "water", [], "子", "子"), P("B", "fire", [], "午", "午")], "en");
const oz = buildSynastry([P("na", "water", [], "子", "子"), P("B", "fire", [], "午", "午")], "zh");
ck("EN: CLOSED LIST + ALL 1 pair + DO NOT create", /CLOSED LIST.*ALL 1 pair.*DO NOT create or infer/s.test(oe), "");
ck("ZH: 封閉清單 + 全部 1 組 + 禁止", /封閉清單.*全部 1 組.*禁止為清單外/s.test(oz), "");

console.log("[เคสไม่มีคู่เด่น · ยังโชว์ header (ไม่ใช่ \"\")]");
// 2 คน กิ่งไม่สัมพันธ์ (寅×寅 = ไม่ 合冲害破) + yongEls ว่าง → ไม่มี hit
const o0 = buildSynastry([P("A", "wood", [], "寅", "寅"), P("B", "metal", [], "寅", "寅")], "th");
ck("ไม่มีคู่เด่น → ยังมี header closed-list", /ลิสต์ปิด.*เทียบครบทุกคู่ 1 คู่/s.test(o0), "");
ck("ไม่มีคู่เด่น → ข้อความ 'เช็คทุกคู่แล้ว ไม่มีเด่น'", /เช็คทุกคู่แล้ว · ไม่มีคู่ใดมีปฏิกิริยาข้ามคนเด่น/.test(o0), "");

console.log("[< 2 คน → \"\"]");
ck("1 คน → คืน \"\"", buildSynastry([P("solo", "water", [], "子", "子")], "th") === "", "");

console.log("[math C(M,2)]");
const mk = (n: number) => Array.from({ length: n }, (_, i) => P("p" + i, "water", [], "寅", "辰"));
ck("4 คน → 6 คู่", /เทียบครบทุกคู่ 6 คู่ จาก 4 คน/.test(buildSynastry(mk(4), "th")), "");
ck("5 คน → 10 組 (zh)", /5 人.*全部 10 組/s.test(buildSynastry(mk(5), "zh")), "");

console.log(`\n[synastry-closed · import จริง] ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
