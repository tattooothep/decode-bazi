/**
 * Test · พิสูจน์คัมภีร์ฉีเหมินถูกเสียบเข้า prompt จริง (1 มิ.ย. · เจ้านายสั่งยัดคัมภีร์เข้า AI ฉีเหมิน)
 * รัน: node --experimental-strip-types scripts/test-qimen-canon-wire.mts
 * ตรวจ 2 ชั้น: (1) wiring ใน route source  (2) เนื้อคัมภีร์ 3 เล่มมีจริง+ครบ
 */
import { readFileSync, statSync } from "node:fs";
const ROUTE = readFileSync(new URL("../src/app/api/qimen/sifu/route.ts", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ck = (l: string, c: boolean, g?: string) => { c ? (pass++, console.log("  ✅ " + l)) : (fail++, console.log("  ❌ " + l + (g ? " · " + g : ""))); };

console.log("[#1 wiring · route เสียบคัมภีร์เข้า prompt]");
ck("มี loadQimenKnowledge()", /function loadQimenKnowledge\(\)/.test(ROUTE));
ck("อ่านจาก data/library/qmdj", /data\/library\/qmdj/.test(ROUTE));
ck("โหลด 3 เล่ม (釣叟歌/統宗/演義)", /yanbo-diaosou-ge\.md/.test(ROUTE) && /qimen-tongzong-clean\.md/.test(ROUTE) && /dunjia-yanyi-juan2\.md/.test(ROUTE));
ck("cache ตาม signature ครบทุกไฟล์ (name:mtime:size · กัน stale)", /_qimenSig/.test(ROUTE) && /st\.size/.test(ROUTE) && /statSync/.test(ROUTE));
ck("ไฟล์หาย = ข้ามเล่ม ไม่ทำ request ล้ม (try/catch)", /catch\s*\{[^}]*\/\* ไฟล์หาย/.test(ROUTE) || /found\.push/.test(ROUTE));
ck("เรียก loadQimenKnowledge ใน buildPrompt", /const know = loadQimenKnowledge\(\)/.test(ROUTE));
ck("ฉีดคัมภีร์ลง body (canonBlock)", /canonBlock/.test(ROUTE) && /know\.text/.test(ROUTE));
ck("คัมภีร์อยู่ก่อนผัง (ฐานตีความ · ผัง+คำถามท้าย)", ROUTE.indexOf("canonBlock}") < ROUTE.indexOf("ผังเวลา (QiMen Chart)"));
ck("กำกับ 'ห้ามมั่วนอกตำรา'", /ห้ามมั่วนอกตำรา/.test(ROUTE));
ck("ยังโหลด persona จาก qimen-sifu.md (ไม่ทับ admin)", /loadPromptMd\("prompts\/qimen-sifu\.md"/.test(ROUTE));

console.log("[#1b hardening · พ่อ flag #2 input caps + #3 in-flight (กฎ scale 5000 user)]");
ck("cap message/history/search (ส่วนผันแปร · คัมภีร์คงเต็ม)", /MAX_MSG_CHARS/.test(ROUTE) && /MAX_HIST_ITEM_CHARS/.test(ROUTE) && /MAX_SEARCH_CHARS/.test(ROUTE));
ck("clip() ใช้กับ message+history+search", /clip\(message, MAX_MSG_CHARS\)/.test(ROUTE) && /MAX_HIST_ITEM_CHARS\)/.test(ROUTE) && /clip\(fmtSearchResults/.test(ROUTE));
ck("ไม่ clip คัมภีร์ (know.text เต็ม)", !/clip\([^)]*know\.text/.test(ROUTE));
ck("in-flight limiter (MAX_INFLIGHT + _inflight)", /MAX_INFLIGHT/.test(ROUTE) && /_inflight/.test(ROUTE));
ck("เต็ม → 429 (ก่อนหัก 時)", /status: 429/.test(ROUTE) && ROUTE.indexOf("_inflight >= MAX_INFLIGHT") < ROUTE.indexOf("spendHours(8"));
ck("ปล่อย slot ใน finally (กัน leak)", /finally\s*\{\s*\n?\s*_inflight--/.test(ROUTE));

console.log("\n[#2 เนื้อคัมภีร์ 3 เล่ม มีจริง+ครบ+ชัด]");
const base = new URL("../data/library/qmdj/", import.meta.url);
const books: [string, string[]][] = [
  ["yanbo-diaosou-ge.md",     ["煙波釣叟歌", "阴阳顺逆妙难穷", "二至还归一九宫"]],
  ["qimen-tongzong-clean.md", ["奇門遁甲統宗", "三奇", "八门", "九宫", "凡例"]],
  ["dunjia-yanyi-juan2.md",   ["遁甲", "卷"]],
];
let total = 0;
for (const [f, markers] of books) {
  const t = readFileSync(new URL(f, base), "utf8");
  total += t.length;
  const sz = statSync(new URL(f, base)).size;
  ck(`${f} มีเนื้อ (${(sz/1024).toFixed(0)}KB)`, t.length > 1000);
  for (const m of markers) ck(`  ${f} มี "${m}"`, t.includes(m), "หาไม่เจอ");
}
ck(`รวมคัมภีร์ > 50KB (เนื้อพอตีความ · ปัจจุบัน ${(total/1024).toFixed(0)}KB)`, total > 50_000);

console.log(`\n[qimen-canon-wire] ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
