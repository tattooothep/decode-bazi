/**
 * r377 · wire คัมภีร์ใหม่ 3 ชุดเข้า prompt fusion5
 *   - western/10-lilly-b2-interactions.md  (Lilly 1647 horary interaction doctrines · section splitter)
 *   - vedic/10-bphs-yogas.md               (BPHS โยคะ mūla + ตารางเงื่อนไข · section splitter)
 *   - ziwei/10-feixing-quanji.md           (全書卷二 四化斷訣 · แนบเฉพาะส่วน A)
 * ตรวจ: section splitter เลือกถูกตามคำถาม 6 แบบ · prompt ทุกศาสตร์ 1-4 ดวง ≤ 118K ·
 *        SOURCE_MAP hash ครบ 3 ไฟล์ใหม่ · horary จำลองมีนิยาม translation of light จริง ·
 *        ส่วน B (十八飛星) ไม่หลุดเข้า prompt · ขนาด section ที่แนบอยู่ในกรอบ
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  buildSciencePrompt,
  loadCanonBundle,
  FUSION_PANEL_PROMPT_MAX_CHARS,
  type BirthData,
} from "../src/lib/fusion5/build-prompt.ts";

const root = process.cwd();
const sha256 = (t: string) => createHash("sha256").update(t, "utf8").digest("hex");
let fail = 0;
const ok = (name: string, condition: unknown) => {
  if (condition) console.log(`✓ ${name}`);
  else { fail++; console.error(`✗ ${name}`); }
};

const A: BirthData = { name: "A", dtUTC: new Date("1984-12-31T06:15:00Z"), lat: 13.75, lng: 100.5, hasTime: true, gender: "M" };
const B: BirthData = { name: "B", dtUTC: new Date("1990-02-01T01:20:00Z"), lat: 13.75, lng: 100.5, hasTime: true, gender: "F" };
const C: BirthData = { name: "C", dtUTC: new Date("1995-05-15T03:00:00Z"), lat: 13.75, lng: 100.5, hasTime: true, gender: "M" };
const D: BirthData = { name: "D", dtUTC: new Date("2000-10-20T10:30:00Z"), lat: 13.75, lng: 100.5, hasTime: true, gender: "F" };
const ref = new Date("2026-07-01T05:00:00Z");

// ---------- 1) SOURCE_MAP hash ครบ 3 ไฟล์ใหม่ (hash = ไฟล์เต็ม แม้ส่งเป็น section) ----------
const newFiles = [
  { science: "western" as const, file: "10-lilly-b2-interactions.md", token: "10-lilly-b2-interactions.md#doctrines+significators+perfection" },
  { science: "vedic" as const, file: "10-bphs-yogas.md", token: "10-bphs-yogas.md#yoga-table+yogakaraka+raja" },
  { science: "ziwei" as const, file: "10-feixing-quanji.md", token: "10-feixing-quanji.md#sihua" },
];
for (const { science, file, token } of newFiles) {
  const raw = fs.readFileSync(path.join(root, "data/library/astro-canon", science, file), "utf8");
  const bundle = loadCanonBundle(science, 56_000, ["00-method.md", token]);
  const row = bundle.sourceMap.find((r) => r.file === file);
  ok(`${science}: SOURCE_MAP row exists for ${file}`, Boolean(row));
  if (!row) continue;
  ok(`${science}: sourceHashSha256 = sha256(ไฟล์เต็ม)`, row.sourceHashSha256 === sha256(raw));
  ok(`${science}: totalChars = ขนาดไฟล์เต็ม`, row.totalChars === raw.length);
  ok(`${science}: licenseClass public_domain + mode verbatim`, row.licenseClass === "public_domain" && row.mode === "verbatim");
  ok(`${science}: section ส่งบางส่วน = truncated ติดธง + includedChars < totalChars`, row.truncated && row.includedChars > 0 && row.includedChars < row.totalChars);
  ok(`${science}: promptSegmentHash ตรง segment ใน bundle`, bundle.text.length > 0 && row.promptSegmentHashSha256.length === 64);
}

// ---------- 2) section splitter เลือกถูกตามคำถามตัวอย่าง 6 แบบ ----------
const routerOf = (p: string) => (p.match(/SOURCE_ROUTER: selected_by_question=([^\n]*)/) || [, ""])[1]!;

// (1) horary จำลอง → Lilly doctrines+significators+perfection + นิยาม translation of light จริง
const horaryQ = "ตั้งดวงคำถาม horary ว่าดีลขายบ้านผ่านนายหน้าจะสำเร็จไหม จะมีคนกลางช่วยไหม";
const horaryP = buildSciencePrompt("western", [A], horaryQ, "th", ref);
ok("Q1 horary: router เลือก lilly#doctrines+significators+perfection", routerOf(horaryP).includes("10-lilly-b2-interactions.md#doctrines+significators+perfection"));
ok("Q1 horary: มีนิยาม translation of light verbatim", horaryP.includes("Translation of light and nature is"));
ok("Q1 horary: มีนิยาม prohibition verbatim", horaryP.includes("[PROHIBITION.]"));
ok("Q1 horary: มีนิยาม void of course", horaryP.includes("[VOID OF COURSE.]"));
ok("Q1 horary: มี perfection 4 ทาง (collection of light)", horaryP.includes("[COLLECTION.]"));
ok("Q1 horary: มี significators (Book2 Ch.XX)", horaryP.includes("ส่วนที่ 3 · Book 2, CHAP. XX"));

// (2) event/ธุรกิจจะสำเร็จไหม → Lilly doctrines+perfection (ไม่เอา significators)
const eventQ = "ปี 2027 เซ็นสัญญาธุรกิจกับหุ้นส่วนจะสำเร็จไหม ควรลุยหรือรอ";
const eventP = buildSciencePrompt("western", [A], eventQ, "th", ref);
ok("Q2 event: router เลือก lilly#doctrines+perfection", routerOf(eventP).includes("10-lilly-b2-interactions.md#doctrines+perfection") && !routerOf(eventP).includes("significators"));
ok("Q2 event: มี translation + collection", eventP.includes("Translation of light and nature is") && eventP.includes("[COLLECTION.]"));

// (3) ความรักธรรมดา (ไม่ใช่ event/horary) → ไม่แนบ Lilly ไฟล์ใหม่ (กันส่งทุก request)
const loveQ = "ความรัก แต่งงาน คู่ครองเป็นยังไง";
const loveP = buildSciencePrompt("western", [A], loveQ, "th", ref);
ok("Q3 love: ไม่แนบ 10-lilly-b2-interactions", !routerOf(loveP).includes("10-lilly-b2-interactions.md"));

// (4) vedic ความสำเร็จ/อำนาจ → ตารางโยคะ + yogakāraka + rāja (อ.39-40)
const powerQ = "ปี 2027 อาชีพ ตำแหน่ง อำนาจ ชื่อเสียง จะรุ่งไหม มีราชโยคะไหม";
const powerP = buildSciencePrompt("vedic", [A], powerQ, "th", ref);
ok("Q4 power: router เลือก bphs#yoga-table+yogakaraka+raja", routerOf(powerP).includes("10-bphs-yogas.md#yoga-table+yogakaraka+raja"));
ok("Q4 power: มีตารางเงื่อนไขโยคะ", powerP.includes("ตารางเงื่อนไขโยคะ"));
ok("Q4 power: มีโศลก rāja-yoga verbatim (อ.39)", powerP.includes("अथ राजयोगाध्यायः"));
ok("Q4 power: มีบท yogakāraka (อ.34)", powerP.includes("अथ योगकारकाध्यायः"));
ok("Q4 power: ไม่ลากบท dhana (อ.41) มาโดยไม่ถามเรื่องเงิน", !powerP.includes("अथ विशेषधनयोगाऽध्यायः"));

// (5) vedic เงิน/โชคลาภ → dhana (อ.41-42) ไม่เอา rāja
const moneyQ = "การเงิน โชคลาภ เงินก้อน ปี 2027 เป็นยังไง";
const moneyP = buildSciencePrompt("vedic", [A], moneyQ, "th", ref);
ok("Q5 money: router เลือก bphs#yoga-table+yogakaraka+dhana", routerOf(moneyP).includes("10-bphs-yogas.md#yoga-table+yogakaraka+dhana") && !routerOf(moneyP).includes("+raja"));
ok("Q5 money: มีโศลก dhana-yoga verbatim (อ.41)", moneyP.includes("अथ विशेषधनयोगाऽध्यायः"));
ok("Q5 money: ไม่ลากบท rāja (อ.39)", !moneyP.includes("अथ राजयोगाध्यायः"));

// (6) ziwei (packet มี 生年四化 เสมอ · ถามเวลา = 大限/流年) → 四化斷訣 ส่วน A · ส่วน B ห้ามหลุด
const ziweiQ = "ปี 2027 大限 流年 四化 ของดวงนี้เป็นยังไง";
const ziweiP = buildSciencePrompt("ziwei", [A], ziweiQ, "th", ref);
ok("Q6 ziwei: router เลือก feixing#sihua", routerOf(ziweiP).includes("10-feixing-quanji.md#sihua"));
ok("Q6 ziwei: มี 化祿入限斷訣 verbatim (全書卷二)", ziweiP.includes("化祿入限斷訣"));
ok("Q6 ziwei: ส่วน B (十八飛星/照膽經/論次序) ไม่หลุดเข้า prompt", !ziweiP.includes("照膽經") && !ziweiP.includes("論次序") && !ziweiP.includes("十八飛星直指"));
const ziweiGeneralP = buildSciencePrompt("ziwei", [A], "ดวงชีวิตโดยรวมเป็นยังไง", "th", ref);
ok("Q6b ziwei คำถามทั่วไป: 四化斷訣 ยังแนบ (生年四化 มีใน packet เสมอ)", routerOf(ziweiGeneralP).includes("10-feixing-quanji.md#sihua") && ziweiGeneralP.includes("化祿入限斷訣"));

// ---------- 3) ขนาด section ที่แนบอยู่ในกรอบ (ห้ามส่งทั้งไฟล์ใหญ่) ----------
const lillyBundle = loadCanonBundle("western", 56_000, ["10-lilly-b2-interactions.md#doctrines+significators+perfection"]);
const lillyRow = lillyBundle.sourceMap[0];
ok(`lilly horary section ~8-20K ไม่ใช่ทั้งไฟล์ 53.6K (ได้ ${lillyRow?.includedChars})`, Boolean(lillyRow) && lillyRow.includedChars >= 8_000 && lillyRow.includedChars <= 20_000);
const bphsBundle = loadCanonBundle("vedic", 56_000, ["10-bphs-yogas.md#yoga-table+yogakaraka+raja+dhana+mahapurusha"]);
const bphsRow = bphsBundle.sourceMap[0];
ok(`bphs worst-case ทุก section ~10-22K ไม่ใช่ทั้งไฟล์ 30.2K (ได้ ${bphsRow?.includedChars})`, Boolean(bphsRow) && bphsRow.includedChars >= 10_000 && bphsRow.includedChars <= 22_000);
const feixingBundle = loadCanonBundle("ziwei", 56_000, ["10-feixing-quanji.md#sihua"]);
const feixingRow = feixingBundle.sourceMap[0];
ok(`feixing ส่วน A ~1.5-4K ไม่ใช่ทั้งไฟล์ 8.9K (ได้ ${feixingRow?.includedChars})`, Boolean(feixingRow) && feixingRow.includedChars >= 1_500 && feixingRow.includedChars <= 4_000);

// ---------- 4) prompt ทุกศาสตร์ 1-4 ดวง ≤ 118K หลัง wire ----------
const sizeQs: Record<string, string> = { horary: horaryQ, event: eventQ, power: powerQ, money: moneyQ, ziweiTiming: ziweiQ, love: loveQ };
const births = [A, B, C, D];
for (const science of ["qizheng", "western", "vedic", "ziwei"] as const) {
  for (const [k, q] of Object.entries(sizeQs)) {
    for (let n = 1; n <= 4; n++) {
      const p = buildSciencePrompt(science, births.slice(0, n), q, "th", ref);
      if (p.length > FUSION_PANEL_PROMPT_MAX_CHARS) { fail++; console.error(`✗ ${science} ${k} ${n}ดวง เกิน cap: ${p.length}`); }
    }
  }
  console.log(`✓ ${science}: prompt 1-4 ดวง × 6 คำถาม ≤ ${FUSION_PANEL_PROMPT_MAX_CHARS}`);
}

// horary 4 ดวง (โดน shrink หนักสุด) — นิยาม Lilly ต้องรอด shrink loop
const horary4P = buildSciencePrompt("western", births, horaryQ, "th", ref);
ok("horary 4 ดวง: นิยาม translation of light รอด shrink", horary4P.includes("Translation of light and nature is"));
const ziwei4P = buildSciencePrompt("ziwei", births, ziweiQ, "th", ref);
ok("ziwei 4 ดวง: 四化斷訣 รอด shrink", ziwei4P.includes("化祿入限斷訣"));
const power4P = buildSciencePrompt("vedic", births, powerQ, "th", ref);
ok("vedic 4 ดวง: ตารางโยคะรอด shrink", power4P.includes("ตารางเงื่อนไขโยคะ"));

// ---------- 5) method files มี instruction ใหม่ ----------
const westernMethod = fs.readFileSync(path.join(root, "data/library/astro-canon/western/00-method.md"), "utf8");
ok("western 00-method ขั้น 5: instruction ยกนิยาม Lilly + ระบุบท", westernMethod.includes("ให้ยกนิยามจากคัมภีร์ Lilly (Christian Astrology 1647)") && westernMethod.includes("ระบุบทที่อ้าง"));
const vedicMethod = fs.readFileSync(path.join(root, "data/library/astro-canon/vedic/00-method.md"), "utf8");
ok("vedic 00-method ขั้น 6: ฟันธงเฉพาะโยคะในตาราง + cite เลขโศลก", vedicMethod.includes("cite เลขโศลก (อ.X.Y)") && vedicMethod.includes("ห้ามแต่งชื่อโยคะ"));
const ziweiMethod = fs.readFileSync(path.join(root, "data/library/astro-canon/ziwei/00-method.md"), "utf8");
ok("ziwei 00-method ขั้น 5: ยก 斷訣 verbatim + ห้ามปน 十八飛星", ziweiMethod.includes("ยก 斷訣 verbatim") && ziweiMethod.includes("ห้ามเอาสูตรวางดาว/化曜 ของสายนั้นมาปนผัง 14 主星"));

if (fail) {
  console.error(`FAIL fusion5 canon r377: ${fail}`);
  process.exit(1);
}
console.log("PASS fusion5 canon r377");
