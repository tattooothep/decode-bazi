/**
 * เลขศาสตร์พีทาโกรัส (Pythagorean) — สายตะวันตก · อักษรอังกฤษ→เลข 1–9 วนซ้ำ (A=1..I=9,J=1..)
 * ตำรา: data/library/naming-canon/western/pythagorean-numerology.md
 *   §1 ตารางอักษร 1–9 · §2 วิธีคำนวณ (Expression/Soul Urge/Personality, คง Master 11/22/33) · §3 ความหมาย
 * ⛔ คนละระบบกับคาลเดียน (1–8) — ห้ามปนตาราง
 */
import { NamingEngineResult, fail, Evidence, BreakdownItem, NotAvailableItem } from "./types";
import { readCanon, quoteLine } from "./canon";

const FILE = "western/pythagorean-numerology.md";
const DISCLAIMER =
  "ระบบพีทาโกรัส A=1..I=9 วนซ้ำ (มี 9) · นโยบาย hourkey: ถือ Y เป็นพยัญชนะ (ตำราไม่ฟันธง Y) · ตำราไม่ให้เกณฑ์ดี/ร้ายเป็นคะแนน จึงเป็นคำบรรยายเชิงคุณลักษณะ";
const VOWELS = new Set(["A", "E", "I", "O", "U"]);

type Tables = { letter: Map<string, number>; meaning: Map<number, { title: string; text: string }> };
let cached: Tables | null = null;

function parseTables(): Tables {
  if (cached) return cached;
  const text = readCanon(FILE);
  const letter = new Map<string, number>();
  const meaning = new Map<number, { title: string; text: string }>();

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    // §1 ตารางอักษร: | 1 | A · J · S |
    if (line.startsWith("|")) {
      const cells = line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
      if (cells.length >= 2 && /^\d$/.test(cells[0]) && /[A-Z]/.test(cells[1]) && !/ตัวอักษร/.test(cells[1])) {
        const num = parseInt(cells[0], 10);
        for (const L of cells[1].match(/[A-Z]/g) || []) letter.set(L, num);
      }
    }
    // §3 ความหมาย: **1 — ผู้บุกเบิก:** ...  หรือ  **11 (ทวีจาก 2) — ผู้จุดประกาย:** ...
    const mm = line.match(/^\*\*(\d+)(?:\s*\([^)]*\))?\s*—\s*(.+?):\*\*\s*(.+)$/);
    if (mm) meaning.set(parseInt(mm[1], 10), { title: mm[2].trim(), text: mm[3].trim() });
  }
  cached = { letter, meaning };
  return cached;
}

function reduceMaster(n: number): number {
  while (n > 9 && n !== 11 && n !== 22 && n !== 33) n = String(n).split("").reduce((a, c) => a + Number(c), 0);
  return n;
}

export type PythagoreanInput = { name: string };

export function analyzePythagorean(input: PythagoreanInput): NamingEngineResult {
  const SYS = "pythagorean";
  const raw = String(input.name || "").trim();
  if (!raw) return fail(SYS, FILE, "กรุณาส่งชื่อ (สะกดอังกฤษ) ที่ต้องการวิเคราะห์");

  const t = parseTables();
  const notAvailable: NotAvailableItem[] = [];
  const letters: { ch: string; val: number; vowel: boolean }[] = [];
  let nonLatin = false;

  for (const ch of Array.from(raw.toUpperCase())) {
    if (/[A-Z]/.test(ch)) {
      const v = t.letter.get(ch);
      if (typeof v === "number") letters.push({ ch, val: v, vowel: VOWELS.has(ch) });
    } else if (/[฀-๿ऀ-ॿ]/.test(ch)) nonLatin = true;
  }
  if (nonLatin) notAvailable.push({ field: "อักษรไม่ใช่อังกฤษ", reason: "ระบบพีทาโกรัสในตำรานี้ให้ค่าเฉพาะ A–Z — นับเฉพาะตัวอักษรอังกฤษ" });
  if (!letters.length) return fail(SYS, FILE, "ไม่พบตัวอักษรอังกฤษในชื่อที่ส่งมา", notAvailable);

  const sumAll = letters.reduce((a, l) => a + l.val, 0);
  const sumVowel = letters.filter((l) => l.vowel).reduce((a, l) => a + l.val, 0);
  const sumCons = letters.filter((l) => !l.vowel).reduce((a, l) => a + l.val, 0);
  const expression = reduceMaster(sumAll);
  const soulUrge = reduceMaster(sumVowel);
  const personality = reduceMaster(sumCons);

  const exprMeta = t.meaning.get(expression) || null;
  const soulMeta = t.meaning.get(soulUrge) || null;
  const persMeta = t.meaning.get(personality) || null;

  const breakdown: BreakdownItem[] = [
    { label: "ค่าอักษรรายตัว (พีทาโกรัส 1–9)", value: letters.map((l) => `${l.ch}=${l.val}`).join(" ") },
    { label: "Expression/Destiny (ทุกตัว)", value: expression, note: exprMeta ? `${exprMeta.title}: ${exprMeta.text}` : null },
    { label: "Soul Urge (เฉพาะสระ)", value: soulUrge, note: soulMeta ? `${soulMeta.title}: ${soulMeta.text}` : null },
    { label: "Personality (เฉพาะพยัญชนะ)", value: personality, note: persMeta ? `${persMeta.title}: ${persMeta.text}` : null },
  ];

  const verdict = exprMeta
    ? `เลข Expression = ${expression} "${exprMeta.title}" — ${exprMeta.text.split("·")[0].trim()}`
    : `เลข Expression = ${expression}`;
  if (!exprMeta) notAvailable.push({ field: `ความหมายเลข ${expression}`, reason: "ไม่พบคำบรรยายเลขนี้ในตำรา (§3 ครอบคลุม 1–9 + Master 11/22/33)" });

  const evidence: Evidence[] = [];
  const tblNote = quoteLine(readCanon(FILE), "A=1 … I=9");
  if (tblNote) evidence.push({ canonFile: FILE, quote: tblNote });
  if (exprMeta) {
    const q = quoteLine(readCanon(FILE), `**${expression} `) || quoteLine(readCanon(FILE), `**${expression} —`);
    if (q) evidence.push({ canonFile: FILE, quote: q });
  }

  return { ok: true, system: SYS, score: null, verdict, breakdown, evidence, notAvailable, disclaimer: DISCLAIMER, canonRef: FILE };
}
