/**
 * เลขศาสตร์ไทย — ถอดอักษร→เลข → ผลรวม → ความหมาย (ตามตำรา)
 * ตำรา: data/library/naming-canon/thai/lek-sart-values.md
 *   §1 ตารางค่าอักษร 1–9 (นพเคราะห์) · §2.1 ความหมายเลขราก 1–9 · §2.2 ความหมายผลรวม (เฉพาะเลขที่ยืนยันได้)
 * ⚠️ ตำราระบุเอง: "ไม่มีคัมภีร์ต้นฉบับเล่มเดียว" → ผลจึงกำกับที่มาแบบนี้เสมอ ไม่อ้างเป็นคัมภีร์
 * ผลรวมที่ไม่มีคำบรรยายในตำรา → notAvailable (ห้ามเดา) · อักษรที่ตำราไม่ให้ค่า → notAvailable
 */
import { NamingEngineResult, fail, Evidence, BreakdownItem, NotAvailableItem } from "./types";
import { readCanon, quoteLine, isThaiConsonant, isThaiVowelSign, isThaiToneOrMark } from "./canon";

const FILE = "thai/lek-sart-values.md";
const DISCLAIMER =
  "เลขศาสตร์ไทยไม่มีคัมภีร์ต้นฉบับเล่มเดียว/ผู้แต่งคนเดียว เป็น 'ระบบมาตรฐานที่หลายสำนักใช้ตรงกัน' (theluckyname + ซินแส.com) ไม่ใช่คัมภีร์เล่มเดียว";

function sectionBody(text: string, startNeedle: string): string {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => /^#{1,3}\s/.test(l) && l.includes(startNeedle));
  if (start < 0) return "";
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) break; // หยุดที่ section ## ถัดไป
    out.push(lines[i]);
  }
  return out.join("\n");
}

type Tables = {
  consonant: Map<string, number>;
  vowel: Map<string, number>;
  tone: Map<string, number>;
  sumMeaning: Map<number, { label: string; luck: string; source: string }>;
  rootMeaning: Map<number, { planet: string; meaning: string; luck: string }>;
};

let cached: Tables | null = null;

function parseTables(): Tables {
  if (cached) return cached;
  const text = readCanon(FILE);
  const consonant = new Map<string, number>();
  const vowel = new Map<string, number>();
  const tone = new Map<string, number>();

  // §1 ตารางค่าอักษร
  const body1 = sectionBody(text, "1. ตารางค่าอักษร");
  for (const raw of body1.split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("|")) continue;
    if (/^\|[\s:|-]+\|?$/.test(line)) continue;
    const cells = line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
    if (cells.length < 4) continue;
    const numMatch = cells[0].match(/\d+/);
    if (!numMatch) continue;
    const num = parseInt(numMatch[0], 10);
    if (num < 1 || num > 9) continue;
    // คอลัมน์ 2 = พยัญชนะ, 3 = สระ, 4 = วรรณยุกต์/อื่นๆ
    for (const ch of Array.from(cells[2] || "")) if (isThaiConsonant(ch)) consonant.set(ch, num);
    for (const ch of Array.from(cells[3] || "")) if (isThaiVowelSign(ch)) vowel.set(ch, num);
    // วรรณยุกต์: เอาเฉพาะอักขระในวงเล็บ ( ่ ) กันไปหยิบ ้ จากคำว่า "ไม้..." ผิด
    const paren = (cells[4] || "").match(/\(([^)]*)\)/);
    if (paren) for (const ch of Array.from(paren[1])) if (isThaiToneOrMark(ch)) tone.set(ch, num);
  }

  // §2.2 ความหมายผลรวม (เฉพาะที่ยืนยันได้)
  const sumMeaning = new Map<number, { label: string; luck: string; source: string }>();
  const body22 = sectionBody(text, "2.2");
  for (const raw of body22.split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("|")) continue;
    const cells = line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
    if (cells.length < 3) continue;
    if (!/^\d+$/.test(cells[0])) continue; // ข้าม header
    sumMeaning.set(parseInt(cells[0], 10), { label: cells[1], luck: cells[2], source: cells[3] || "" });
  }

  // §2.1 ความหมายเลขราก 1–9
  const rootMeaning = new Map<number, { planet: string; meaning: string; luck: string }>();
  const body21 = sectionBody(text, "2.1");
  for (const raw of body21.split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("|")) continue;
    const cells = line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
    if (cells.length < 4) continue;
    if (!/^\d+$/.test(cells[0])) continue;
    rootMeaning.set(parseInt(cells[0], 10), { planet: cells[1], meaning: cells[2], luck: cells[3] });
  }

  cached = { consonant, vowel, tone, sumMeaning, rootMeaning };
  return cached;
}

function reduceDigits(n: number): number {
  while (n > 9) n = String(n).split("").reduce((a, c) => a + Number(c), 0);
  return n;
}

function luckToScore(luck: string): number {
  if (/ดีมาก/.test(luck)) return 90;
  if (/ร้าย/.test(luck)) return 30;
  if (/ปานกลาง/.test(luck)) return 60;
  if (/มงคล|ดี/.test(luck)) return 75;
  return 50;
}

export type LekSartInput = { name: string };

export function analyzeThaiLekSart(input: LekSartInput): NamingEngineResult {
  const SYS = "thai_leksart";
  const name = String(input.name || "").trim();
  if (!name) return fail(SYS, FILE, "กรุณาส่งชื่อภาษาไทยที่ต้องการวิเคราะห์");

  const t = parseTables();
  const perChar: { ch: string; val: number }[] = [];
  const notAvailable: NotAvailableItem[] = [];
  let total = 0;

  for (const ch of Array.from(name)) {
    if (ch.trim() === "") continue;
    let v: number | undefined;
    if (isThaiConsonant(ch)) v = t.consonant.get(ch);
    else if (isThaiVowelSign(ch)) v = t.vowel.get(ch);
    else if (isThaiToneOrMark(ch)) v = t.tone.get(ch);
    else continue; // อักขระที่ไม่ใช่ไทย (เว้นวรรค ฯลฯ)
    if (typeof v === "number") {
      total += v;
      perChar.push({ ch, val: v });
    } else {
      notAvailable.push({ field: `อักษร "${ch}"`, reason: "ตำราเลขศาสตร์ที่มี (theluckyname/ซินแส.com) ยังไม่ระบุค่าเลขของอักขระนี้ จึงไม่นับ (ไม่เดา)" });
    }
  }

  if (!perChar.length) {
    return fail(SYS, FILE, "ไม่พบอักษรไทยที่มีค่าเลขในตำราจากชื่อที่ส่งมา", notAvailable);
  }

  const root = reduceDigits(total);
  const rootMeta = t.rootMeaning.get(root) || null;
  const sumMeta = t.sumMeaning.get(total) || null;

  const breakdown: BreakdownItem[] = [
    { label: "ค่าอักษรรายตัว", value: perChar.map((p) => `${p.ch}(${p.val})`).join(" ") },
    { label: "ผลรวม", value: total },
    { label: "เลขราก (ดาวประธาน)", value: root, luck: rootMeta?.luck ?? null, note: rootMeta ? `${rootMeta.planet}: ${rootMeta.meaning}` : null },
  ];

  let verdict: string;
  let score: number;
  if (sumMeta) {
    verdict = `ผลรวม ${total} = "${sumMeta.label}" (${sumMeta.luck})`;
    score = luckToScore(sumMeta.luck);
    breakdown.push({ label: `ความหมายผลรวม ${total}`, value: sumMeta.label, luck: sumMeta.luck, note: `ที่มา: ${sumMeta.source}` });
  } else if (rootMeta) {
    verdict = `ผลรวม ${total} ยังไม่มีคำบรรยายรายเลขในตำราที่ยืนยันได้ · เลขราก ${root} = ${rootMeta.planet} (${rootMeta.meaning})`;
    score = luckToScore(rootMeta.luck);
    notAvailable.push({ field: `ความหมายผลรวม ${total}`, reason: "ตำราให้คำบรรยายรายเลขเฉพาะบางเลข (§2.2) เลขนี้ยังไม่มีในชุดที่ยืนยันได้ จึงใช้ความหมายเลขราก (§2.1) แทน" });
  } else {
    verdict = `ผลรวม ${total} (เลขราก ${root}) — ตำรายังไม่มีคำบรรยายที่ยืนยันได้`;
    score = 50;
    notAvailable.push({ field: `ความหมายผลรวม ${total}`, reason: "ไม่พบทั้งความหมายผลรวมและเลขรากในตำรา" });
  }

  const evidence: Evidence[] = [];
  const tableNote = quoteLine(readCanon(FILE), "1–9 ตามกลุ่มดาวนพเคราะห์");
  if (tableNote) evidence.push({ canonFile: FILE, quote: tableNote });
  if (sumMeta) {
    const q = quoteLine(readCanon(FILE), `| ${total} |`);
    if (q) evidence.push({ canonFile: FILE, quote: q });
  }
  if (rootMeta) {
    const q = quoteLine(readCanon(FILE), `| ${root} | ${rootMeta.planet}`);
    if (q) evidence.push({ canonFile: FILE, quote: q });
  }

  return { ok: true, system: SYS, score, verdict, breakdown, evidence, notAvailable, disclaimer: DISCLAIMER, canonRef: FILE };
}
