/**
 * เลขศาสตร์คาลเดียน (Chaldean) — สายอินเดีย/Cheiro · อักษรอังกฤษ→เลข 1–8 (ไม่มี 9)
 * ตำรา: data/library/naming-canon/indian/chaldean-numerology.md
 *   §1 ตารางอักษร (1–8) · §2 ความหมายเลขราก 1–9 · §3 ความหมายเลขผสม 10–52
 * ⛔ คนละระบบกับพีทาโกรัส (1–9) — ห้ามปนตาราง
 */
import { NamingEngineResult, fail, Evidence, BreakdownItem, NotAvailableItem } from "./types";
import { readCanon, quoteLine } from "./canon";

const FILE = "indian/chaldean-numerology.md";
const DISCLAIMER = "ระบบคาลเดียน (Chaldean) กำหนดค่าอักษร 1–8 ไม่มี 9 · อ้างอิง Cheiro, Book of Numbers (1926) · วิเคราะห์เฉพาะชื่อสะกดอังกฤษ (ตำราไทยยังไม่เจอ)";

type Tables = {
  letter: Map<string, number>;
  root: Map<number, { planet: string; text: string }>;
  compound: Map<number, { text: string; flag: string }>;
};
let cached: Tables | null = null;

function parseTables(): Tables {
  if (cached) return cached;
  const text = readCanon(FILE);
  const letter = new Map<string, number>();
  const root = new Map<number, { planet: string; text: string }>();
  const compound = new Map<number, { text: string; flag: string }>();

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    // §1 ตารางอักษร: | 1 | A, I, J, Q, Y |
    if (line.startsWith("|")) {
      const cells = line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
      if (cells.length >= 2 && /^\d$/.test(cells[0]) && /[A-Z]/.test(cells[1]) && !/สัญลักษณ์|ธง/.test(cells[1])) {
        const num = parseInt(cells[0], 10);
        const letters = cells[1].match(/[A-Z]/g) || [];
        for (const L of letters) letter.set(L, num);
      }
      // §3 ตารางเลขผสม: | 10 | "..." | ◐ |
      if (cells.length >= 3 && /^\d{2}$/.test(cells[0]) && /[⊕⊖◐]/.test(cells[2])) {
        const num = parseInt(cells[0], 10);
        const flag = (cells[2].match(/[⊕⊖◐]/) || [""])[0];
        compound.set(num, { text: cells[1].replace(/^"|"$/g, ""), flag });
      }
    }
    // §2 ความหมายเลขราก: - **1 — อาทิตย์**: ...
    const rm = line.match(/^-\s*\*\*(\d)\s*—\s*([^*]+?)\*\*[:：]\s*(.+)$/);
    if (rm) root.set(parseInt(rm[1], 10), { planet: rm[2].trim(), text: rm[3].trim() });
  }
  cached = { letter, root, compound };
  return cached;
}

function reduceDigits(n: number): number {
  while (n > 9) n = String(n).split("").reduce((a, c) => a + Number(c), 0);
  return n;
}

const FLAG_LUCK: Record<string, string> = { "⊕": "มงคล", "⊖": "อัปมงคล/เตือน", "◐": "กลางๆ ขึ้นกับตัวคน" };
const FLAG_SCORE: Record<string, number> = { "⊕": 80, "◐": 60, "⊖": 35 };

export type ChaldeanInput = { name: string };

export function analyzeChaldean(input: ChaldeanInput): NamingEngineResult {
  const SYS = "chaldean";
  const raw = String(input.name || "").trim();
  if (!raw) return fail(SYS, FILE, "กรุณาส่งชื่อ (สะกดอังกฤษ) ที่ต้องการวิเคราะห์");

  const t = parseTables();
  const notAvailable: NotAvailableItem[] = [];
  const perChar: { ch: string; val: number }[] = [];
  let nonLatin = false;
  let compoundSum = 0;

  for (const ch of Array.from(raw.toUpperCase())) {
    if (/[A-Z]/.test(ch)) {
      const v = t.letter.get(ch);
      if (typeof v === "number") {
        compoundSum += v;
        perChar.push({ ch, val: v });
      }
    } else if (/[฀-๿ऀ-ॿ]/.test(ch)) {
      nonLatin = true;
    }
  }
  if (nonLatin) {
    notAvailable.push({ field: "อักษรไม่ใช่อังกฤษ", reason: "ตำราคาลเดียนสำหรับอักษรไทย/เทวนาครี ยังหาไม่เจอ (canon §6) — นับเฉพาะตัวอักษรอังกฤษ" });
  }
  if (!perChar.length) return fail(SYS, FILE, "ไม่พบตัวอักษรอังกฤษในชื่อที่ส่งมา", notAvailable);

  const rootNum = reduceDigits(compoundSum);
  const rootMeta = t.root.get(rootNum) || null;

  // ความหมายเลขผสม
  let compoundLabel: string | null = null;
  let flag = "";
  if (compoundSum >= 10 && compoundSum <= 52) {
    const cm = t.compound.get(compoundSum);
    if (cm) {
      flag = cm.flag;
      const refMatch = cm.text.match(/เหมือน\s*(\d+)/);
      if (refMatch) {
        const ref = parseInt(refMatch[1], 10);
        const base = t.compound.get(ref);
        compoundLabel = base ? `${base.text} (เหมือนเลข ${ref})` : cm.text;
      } else {
        compoundLabel = cm.text;
      }
    }
  } else if (compoundSum > 52) {
    notAvailable.push({ field: `ความหมายเลขผสม ${compoundSum}`, reason: "Cheiro ให้ความหมายเลขผสมถึง 52 · เลขเกิน 52 ตำราให้ลดกลับมาที่เลขราก" });
  }

  const breakdown: BreakdownItem[] = [
    { label: "ค่าอักษรรายตัว (คาลเดียน 1–8)", value: perChar.map((p) => `${p.ch}=${p.val}`).join(" ") },
    { label: "เลขผสม (Compound)", value: compoundSum },
    { label: "เลขราก (Root)", value: rootNum, luck: null, note: rootMeta ? `${rootMeta.planet}: ${rootMeta.text}` : null },
  ];
  if (compoundLabel) breakdown.push({ label: `ความหมายเลขผสม ${compoundSum}`, value: compoundLabel, luck: FLAG_LUCK[flag] ?? null });

  const verdict = compoundLabel
    ? `เลขผสม ${compoundSum} = ${compoundLabel} [${FLAG_LUCK[flag] ?? "-"}] · เลขราก ${rootNum} (${rootMeta?.planet ?? "-"})`
    : `เลขผสม ${compoundSum} · เลขราก ${rootNum}${rootMeta ? ` = ${rootMeta.planet}: ${rootMeta.text}` : ""}`;
  const score = flag ? FLAG_SCORE[flag] ?? 50 : 55;

  const evidence: Evidence[] = [];
  const noNine = quoteLine(readCanon(FILE), "ไม่มีตัวอักษรใดได้เลข 9");
  if (noNine) evidence.push({ canonFile: FILE, quote: noNine });
  if (compoundLabel) {
    const q = quoteLine(readCanon(FILE), `| ${compoundSum} |`);
    if (q) evidence.push({ canonFile: FILE, quote: q });
  }
  if (rootMeta) {
    const q = quoteLine(readCanon(FILE), `**${rootNum} — ${rootMeta.planet}`);
    if (q) evidence.push({ canonFile: FILE, quote: q });
  }

  return { ok: true, system: SYS, score, verdict, breakdown, evidence, notAvailable, disclaimer: DISCLAIMER, canonRef: FILE };
}
