/* test-fusion5-career-wl-r510.mjs · r510: wire ตารางอาชีพ 6 ศาสตร์ + โหมดอ่านทั้งชีวิต
 * รัน: cd /root/decode-app && node --experimental-strip-types --import ./scripts/_ts-resolver-account.mjs scripts/test-fusion5-career-wl-r510.mjs
 */
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import { readFileSync, existsSync } from "fs";

let pass = 0, fail = 0;
const ok = (c, l, d = "") => { c ? (pass++, console.log("  ✅ " + l)) : (fail++, console.log("  ❌ " + l + (d ? " · " + d : ""))); };

const { buildSciencePrompt, loadWholeLifeDirective } = await import("../src/lib/fusion5/build-prompt.ts");

const B = { name: "ทดสอบ", dtUTC: new Date("1984-12-31T06:15:00Z"), lat: 13.7563, lng: 100.5018, hasTime: true, gender: "M", birthDate: "1984-12-31", birthTime: "13:15" };
const REF = new Date("2026-07-13T00:00:00Z");
const FILES = { qizheng: "63", ziwei: "63", western: "58", vedic: "60", uranian: "91" };

for (let round = 1; round <= 3; round++) {
  console.log(`— รอบ ${round}/3 —`);

  /* [1] ไฟล์คัมภีร์ใหม่อยู่ครบ */
  for (const [sci, nn] of Object.entries(FILES)) ok(existsSync(`data/library/astro-canon/${sci}/${nn}-career-modern-bridge.md`), `[1] ไฟล์ ${sci}/${nn} อยู่จริง`);
  ok(existsSync("data/library/sifu-extra/bazi-career-modern.md"), "[1] sifu-extra/bazi-career-modern.md อยู่จริง");
  ok(existsSync("data/library/prompts/whole-life-directive.md"), "[1] prompts/whole-life-directive.md อยู่จริง");

  /* [2] ถามเรื่องอาชีพ → คัมภีร์ใหม่ถูกเลือกเข้า prompt ทุกศาสตร์ (5 ศาสตร์ selector) */
  for (const [sci, nn] of Object.entries(FILES)) {
    const p = buildSciencePrompt(sci, [B], "อาชีพอะไรเหมาะกับดวงนี้ ควรทำงานสายไหน", "th", REF);
    ok(p.includes(`${nn}-career-modern-bridge.md`) || p.includes("สะพานอาชีพยุคใหม่") || p.includes("กลุ่มอาชีพยุคใหม่"),
       `[2] ${sci}: คัมภีร์อาชีพเข้า prompt เมื่อถามอาชีพ`);
  }

  /* [2b] 3 ภาษา: EN/ZH ถามอาชีพต้องเลือกไฟล์ด้วย (กันแก้ keyword แล้วภาษาอื่นหลุดเงียบ) */
  const pEN = buildSciencePrompt("western", [B], "What career suits this chart? Which industry should I work in?", "th", REF);
  ok(pEN.includes("58-career-modern-bridge.md"), "[2b] EN: เลือกคัมภีร์อาชีพ");
  const pZH = buildSciencePrompt("western", [B], "這個命盤適合什麼職業？該做什麼工作？", "th", REF);
  ok(pZH.includes("58-career-modern-bridge.md"), "[2b] ZH: เลือกคัมภีร์อาชีพ");

  /* [2c] SIFU_EXTRA wire จริง (กันลบบรรทัดแล้วเทสต์ยังผ่าน) */
  const routeSrc = readFileSync("src/app/api/sifu/route.ts", "utf8");
  ok(/SIFU_EXTRA_FILES[\s\S]{0,2000}bazi-career-modern\.md/.test(routeSrc), "[2c] bazi-career-modern อยู่ใน SIFU_EXTRA_FILES จริง");

  /* [3] คำถามไม่เกี่ยวอาชีพ → ไม่ดันคัมภีร์อาชีพเข้าโดยไม่จำเป็น (เช็คที่ SOURCE_ROUTER list) */
  const pLove = buildSciencePrompt("western", [B], "ความรักปีนี้เป็นอย่างไร คู่ครองจะดีไหม", "th", REF);
  const router = (pLove.match(/SOURCE_ROUTER: selected_by_question=([^\n]*)/) || [])[1] || "";
  ok(!router.includes("58-career-modern-bridge.md"), "[3] ถามความรัก: router ไม่เลือกคัมภีร์อาชีพ", router.slice(0, 120));
  /* [3b] กับดัก "แต่งงาน" (มีคำว่า งาน) — ต้องไม่ดึงคัมภีร์อาชีพ (บั๊กที่ SIG-1 จับ) */
  for (const [sci, nn] of Object.entries(FILES)) {
    const pM = buildSciencePrompt(sci, [B], "ความรัก แต่งงาน คู่ครองเป็นยังไง งานแต่งควรจัดปีไหน", "th", REF);
    ok(!pM.includes(`${nn}-career-modern-bridge.md`), `[3b] ${sci}: คำถามแต่งงานไม่ดึงคัมภีร์อาชีพ`);
  }
  /* [3c] bookMode ต้องไม่ดึงคัมภีร์อาชีพ (บั๊กที่ SIG-2 จับ — กันเบียดคัมภีร์ verbatim ในหนังสือดวง) */
  for (const [sci, nn] of Object.entries(FILES)) {
    const pBk = buildSciencePrompt(sci, [B], "อ่านเต็ม", "th", REF, undefined, { bookMode: true });
    ok(!pBk.includes(`${nn}-career-modern-bridge.md`), `[3c] ${sci}: bookMode ไม่ดึงคัมภีร์อาชีพ`);
  }


  /* [4] default (ไม่ส่ง opts) = บล็อก timing เดิมอยู่ครบ + ไม่มี directive ทั้งชีวิต */
  const pDef = buildSciencePrompt("western", [B], "โครงดวง?", "th", REF);
  ok(pDef.includes("=== จังหวะเวลาที่ใช้คำนวณจร ==="), "[4] default: บล็อก timing เดิมอยู่");
  ok(!pDef.includes("โหมดอ่านทั้งชีวิต"), "[4] default: ไม่มี directive ทั้งชีวิต");

  /* [5] wholeLifeMode research/user สลับถูก */
  const pR = buildSciencePrompt("western", [B], "อ่านทั้งชีวิต", "th", REF, undefined, { wholeLifeMode: "research" });
  ok(pR.includes("โหมดอ่านทั้งชีวิต"), "[5] research: directive เข้า");
  ok(!pR.includes("=== จังหวะเวลาที่ใช้คำนวณจร ==="), "[5] research: บล็อก timing เดิมถูกแทน");
  ok(pR.includes("[research]") && !pR.includes("[user]"), "[5] research: เหลือเฉพาะบรรทัดโหมด research");
  const pU = buildSciencePrompt("western", [B], "อ่านทั้งชีวิต", "th", REF, undefined, { wholeLifeMode: "user" });
  ok(pU.includes("[user]") && !pU.includes("[research]"), "[5] user: เหลือเฉพาะบรรทัดโหมด user");
  ok(pU.includes("ทางรับมือ"), "[5] directive มีข้อบังคับทางรับมือ (เงื่อนไขผู้ตรวจ 4)");

  /* [6] bookMode เดิมยังทำงาน (ไม่ชนกัน) */
  const pB = buildSciencePrompt("western", [B], "หนังสือดวง", "th", REF, undefined, { bookMode: true });
  ok(pB.includes("=== จังหวะเวลาที่ใช้คำนวณจร ==="), "[6] bookMode เดี่ยว: timing เดิมคงอยู่");
  const pBW = buildSciencePrompt("western", [B], "หนังสือดวง", "th", REF, undefined, { bookMode: true, wholeLifeMode: "user" });
  ok(pBW.includes("โหมดอ่านทั้งชีวิต") && !pBW.includes("=== จังหวะเวลาที่ใช้คำนวณจร ==="), "[6] bookMode+wholeLife: wholeLife ชนะฝั่ง timing (ตาม precedence)");

  /* [6b] ค่าโหมดเพี้ยน → ไม่พัง และคง timing เดิม (fail-safe) */
  const pX = buildSciencePrompt("western", [B], "โครงดวง?", "th", REF, undefined, { wholeLifeMode: "x" });
  ok(pX.includes("โหมดอ่านทั้งชีวิต") || pX.includes("=== จังหวะเวลาที่ใช้คำนวณจร ==="), "[6b] ค่าเพี้ยน: ไม่พัง มีบล็อกเวลาอย่างใดอย่างหนึ่ง");

  /* [7] loader กรองโหมดถูกในระดับหน่วย */
  const dr = loadWholeLifeDirective("research"), du = loadWholeLifeDirective("user");
  ok(dr.includes("[research]") && !dr.includes("[user]") && du.includes("[user]") && !du.includes("[research]"), "[7] loader กรองบรรทัดตามโหมด");
}
console.log(`\nสรุป r510-career+wl: ${pass} ผ่าน · ${fail} ล้ม`);
process.exit(fail ? 1 : 0);
