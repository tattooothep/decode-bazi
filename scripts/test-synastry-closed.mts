/**
 * Test · synastry "ลิสต์ปิด" (closed-world) · เฟส 5
 * รัน: node --experimental-strip-types scripts/test-synastry-closed.mts
 * หมายเหตุ: group/route.ts import next/server → import ตรงไม่ได้ · จึง mirror "logic header" (math+empty+3ภาษา)
 *   + test แยก grep ยืนยัน source จริงมี string เดียวกัน (อยู่ใน pipeline ตรวจ)
 * โจทย์เจ้านาย: ต้องบอก AI ว่า "เช็คครบทุกคู่" + ห้ามแต่งคู่นอกลิสต์
 */
// mirror ของ title block ใน buildSynastry (group/route.ts ~201-230) — โครงเดียวกันเป๊ะ
function buildTitle(M: number, names: string, shown: number, L: "th" | "en" | "zh") {
  const totalPairs = (M * (M - 1)) / 2;
  return L === "en"
    ? `━━━ Cross-person reactions (synastry) — CLOSED LIST. Compared ALL ${totalPairs} pair(s) among ${M} people [${names}], using each one's 日柱(Day)+年柱(Year). Below are ONLY the ${shown} pair(s) with a prominent reaction. Any pair NOT listed = checked and has NO prominent cross-person reaction (a conclusion, NOT "unchecked"). DO NOT create or infer 合/冲/破/害 for any person/pair not in this list. (Each single person's in-chart interactions → read in full per the interaction classic; CROSS-PERSON → only this list.) 合 not always good / 冲 not always bad — weigh against each one's 用神/role, state direction/outcome plainly; only forbidden: 'commanding' break-up/no-contact. ━━━`
    : L === "zh"
    ? `━━━ 跨人互動 (synastry) — 封閉清單。已比對 ${M} 人 [${names}] 全部 ${totalPairs} 組配對（各取 日柱+年柱）。下列僅為有顯著互動的 ${shown} 組；未列出之配對＝已比對且無顯著跨人互動（此為結論，非「未檢查」）。禁止為清單外之任何人／配對推衍 合/冲/破/害。（各人命盤內部互動→依互動經典完整判讀；跨人→僅限本清單。）合不必吉 / 冲不必凶 — 結合各自用神/角色，可直斷方向/結果；僅禁命令式分手/勿往來。━━━`
    : `━━━ ปฏิกิริยาข้ามคน (synastry) — ลิสต์ปิด (เช็คครบแล้ว) · เทียบครบทุกคู่ ${totalPairs} คู่ จาก ${M} คน [${names}] โดยใช้ 日柱(เสาวัน)+年柱(เสาปี) ของแต่ละคน · ด้านล่างขึ้นเฉพาะ ${shown} คู่ที่มีปฏิกิริยาเด่น · คู่ที่ไม่อยู่ในลิสต์ = เช็คแล้วไม่มีปฏิกิริยาข้ามคนเด่น (เป็นข้อสรุป ไม่ใช่ "ยังไม่เช็ค") · ห้ามสร้าง/สันนิษฐาน 合/冲/破/害 ให้คน/คู่ที่ไม่อยู่ในลิสต์นี้ · (ปฏิกิริยาภายในดวงเดี่ยวของแต่ละคน → อ่านเต็มตามคัมภีร์ปฏิกิริยา · ข้ามคน → เฉพาะลิสต์นี้) · 合ไม่ดีเสมอ / 冲ไม่ร้ายเสมอ — ดูที่用神/บทบาท ฟันธงทิศ/ผลได้ · ห้ามเฉพาะ 'สั่งการ' เลิก/คบ ━━━`;
}

let pass = 0, fail = 0;
const ck = (l: string, c: boolean, g?: string) => { c ? (pass++, console.log("  ✅ " + l)) : (fail++, console.log("  ❌ " + l + (g ? " · " + g : ""))); };

console.log("[synastry closed-list · 3 คน na/ป้า/ไนท์ · 1 คู่เด่น]");
const t = buildTitle(3, "na, ป้า, ไนท์", 1, "th");
ck("ระบุ 'เช็คครบทุกคู่ 3 คู่' (C(3,2)=3)", /เทียบครบทุกคู่ 3 คู่/.test(t), t.slice(0, 60));
ck("ระบุจำนวนคน 3 + รายชื่อ", /จาก 3 คน \[na, ป้า, ไนท์\]/.test(t), "");
ck("ขึ้นเฉพาะ 1 คู่เด่น", /ขึ้นเฉพาะ 1 คู่/.test(t), "");
ck("คู่ไม่ขึ้น = เช็คแล้วไม่มี (ไม่ใช่ยังไม่เช็ค)", /เป็นข้อสรุป ไม่ใช่ "ยังไม่เช็ค"/.test(t), "");
ck("ห้ามแต่งคู่นอกลิสต์", /ห้ามสร้าง\/สันนิษฐาน 合\/冲\/破\/害/.test(t), "");
ck("แยกในดวง vs ข้ามคน", /ปฏิกิริยาภายในดวงเดี่ยว.*ข้ามคน → เฉพาะลิสต์นี้/.test(t), "");

console.log("[en/zh closed-list]");
const te = buildTitle(3, "na, Pa, Knight", 1, "en"), tz = buildTitle(3, "na, 阿姨, 騎士", 1, "zh");
ck("EN: CLOSED LIST + ALL 3 pair + DO NOT create", /CLOSED LIST.*ALL 3 pair.*DO NOT create or infer/s.test(te), "");
ck("ZH: 封閉清單 + 全部 3 組 + 禁止", /封閉清單.*全部 3 組.*禁止為清單外/s.test(tz), "");

console.log("[เคสไม่มีคู่เด่น · ต้องยังโชว์ header (ไม่ใช่ \"\")]");
const t0 = buildTitle(2, "A, B", 0, "th");
ck("2 คน 0 คู่เด่น → ยังมี header closed-list", /ลิสต์ปิด.*เทียบครบทุกคู่ 1 คู่/s.test(t0), "");

console.log("[math C(M,2)]");
ck("4 คน → 6 คู่", /เทียบครบทุกคู่ 6 คู่ จาก 4 คน/.test(buildTitle(4, "a, b, c, d", 2, "th")), "");
ck("5 คน → 10 คู่", /全部 10 組.*5 人/s.test(buildTitle(5, "x", 3, "zh")) || /ALL 10 pair/.test(buildTitle(5, "x", 3, "en")), "");

console.log(`\n[synastry-closed] ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
