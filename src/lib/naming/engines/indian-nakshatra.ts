/**
 * นักษัตร นามการณะ (อินเดีย) — เลือก "พยางค์ต้น" ของชื่อจาก นักษัตร+ปาทะ ของดวงจันทร์ตอนเกิด
 * ตำรา: data/library/naming-canon/indian/nakshatra-namakarana.md (§2 ตาราง 108 ปาทะ→พยางค์)
 * ต้องรู้ตำแหน่งจันทร์ (moonLongitude นิรายนะ 0–360) หรือ นักษัตร+ปาทะ โดยตรง
 * ถ้าไม่มีข้อมูลจันทร์ = notAvailable (ตำราทำนายไม่ได้ · ห้ามเดา)
 */
import { NamingEngineResult, fail, Evidence, BreakdownItem } from "./types";
import { readCanon } from "./canon";

const FILE = "indian/nakshatra-namakarana.md";
const DISCLAIMER = "ยึดพยางค์ตามอักษรเทวนาครีเป็นตัวชี้ขาด (การถอดเสียงโรมันต่างสำนักได้) · ต้องมีตำแหน่งจันทร์จากดวงเกิด";

type PadaCell = { roman: string; dev: string };
type NakRow = { index: number; roman: string; dev: string; padas: PadaCell[]; rashi: string };
let cached: NakRow[] | null = null;

function splitSyllable(cell: string): PadaCell {
  const dev = (cell.match(/[ऀ-ॿ]+/g) || []).join("");
  const roman = cell.replace(/\([^)]*\)/g, "").trim();
  return { roman, dev };
}

function parseTable(): NakRow[] {
  if (cached) return cached;
  const text = readCanon(FILE);
  const rows: NakRow[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("|")) continue;
    const cells = line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
    if (cells.length < 7) continue;
    if (!/^\d{1,2}$/.test(cells[0])) continue; // ข้าม header
    const idx = parseInt(cells[0], 10);
    if (idx < 1 || idx > 27) continue;
    const roman = cells[1].replace(/\([^)]*\)/g, "").trim();
    const dev = (cells[1].match(/[ऀ-ॿ]+/g) || []).join("");
    rows.push({
      index: idx,
      roman,
      dev,
      padas: [splitSyllable(cells[2]), splitSyllable(cells[3]), splitSyllable(cells[4]), splitSyllable(cells[5])],
      rashi: cells[6],
    });
  }
  cached = rows;
  return cached;
}

export type NakshatraInput = { name?: string; moonLongitude?: number | null; nakshatra?: string | number | null; pada?: number | null };

export function analyzeNakshatra(input: NakshatraInput): NamingEngineResult {
  const SYS = "indian_nakshatra";
  const rows = parseTable();
  if (!rows.length) return fail(SYS, FILE, "อ่านตารางนักษัตรจากตำราไม่สำเร็จ");

  let row: NakRow | undefined;
  let pada: number | null = input.pada && input.pada >= 1 && input.pada <= 4 ? input.pada : null;

  // 1) จาก moonLongitude (นิรายนะ)
  if (typeof input.moonLongitude === "number" && isFinite(input.moonLongitude)) {
    const lon = ((input.moonLongitude % 360) + 360) % 360;
    const nakSpan = 360 / 27; // 13°20'
    const padaSpan = nakSpan / 4; // 3°20'
    const nakIdx = Math.floor(lon / nakSpan); // 0..26
    pada = Math.floor((lon % nakSpan) / padaSpan) + 1; // 1..4
    row = rows.find((r) => r.index === nakIdx + 1);
  }

  // 2) จาก นักษัตร (ชื่อ หรือ เลข 1–27) โดยตรง
  if (!row && input.nakshatra != null) {
    const nk = input.nakshatra;
    if (typeof nk === "number" || /^\d{1,2}$/.test(String(nk))) {
      row = rows.find((r) => r.index === parseInt(String(nk), 10));
    } else {
      const key = String(nk).trim().toLowerCase();
      row = rows.find((r) => r.roman.toLowerCase() === key) || rows.find((r) => r.roman.toLowerCase().startsWith(key));
    }
  }

  if (!row) {
    return fail(SYS, FILE, "นักษัตรต้องใช้ตำแหน่งดวงจันทร์ — ยังทำนายไม่ได้", [
      {
        field: "moonLongitude / nakshatra",
        reason: "ศาสตร์นักษัตรต้องรู้ว่าดวงจันทร์ตอนเกิดอยู่นักษัตร+ปาทะไหน จอต้องส่ง moonLongitude (นิรายนะ) หรือ nakshatra(+pada) มา ถ้าดวงไม่มีข้อมูลจันทร์ = ทำไม่ได้",
      },
    ]);
  }

  const breakdown: BreakdownItem[] = [
    { label: "นักษัตร", value: `${row.roman} (${row.dev}) #${row.index}` },
    { label: "ราศีจันทร์ (Rashi)", value: row.rashi },
  ];

  let verdict: string;
  if (pada) {
    const p = row.padas[pada - 1];
    breakdown.push({ label: `ปาทะ ${pada} → พยางค์ต้น`, value: `${p.roman} (${p.dev})` });
    verdict = `ชื่อควรขึ้นต้นด้วยพยางค์ "${p.roman}" (${p.dev}) — นักษัตร ${row.roman} ปาทะ ${pada}, ราศี ${row.rashi}`;
  } else {
    const all = row.padas.map((p, i) => `ป.${i + 1}=${p.roman}(${p.dev})`).join(" · ");
    breakdown.push({ label: "พยางค์ต้นที่เหมาะ(ทั้ง 4 ปาทะ)", value: all });
    verdict = `ชื่อควรขึ้นต้นด้วยพยางค์ชุดนักษัตร ${row.roman}: ${row.padas.map((p) => p.roman).join(", ")} (ยังไม่ระบุปาทะ จึงให้ครบทั้ง 4)`;
  }

  // ตรวจเทียบชื่อที่ส่งมา (ถ้ามี) แบบเบาๆ
  const name = String(input.name || "").trim();
  if (name && pada) {
    const p = row.padas[pada - 1];
    const rn = p.roman.replace(/[aeiou]+$/i, "").toLowerCase();
    const match = name.toLowerCase().startsWith(p.roman.toLowerCase()) || (rn && name.toLowerCase().startsWith(rn));
    breakdown.push({ label: "ชื่อที่ส่งมาขึ้นต้นตรงพยางค์มงคลไหม", value: match ? "ตรง ✅" : "ไม่ตรง (พิจารณาพยางค์ต้นตามตาราง)" });
  }

  const evidence: Evidence[] = [
    { canonFile: FILE, quote: `#${row.index} ${row.roman} (${row.dev}) → ป.1 ${row.padas[0].roman} · ป.2 ${row.padas[1].roman} · ป.3 ${row.padas[2].roman} · ป.4 ${row.padas[3].roman} · ราศี ${row.rashi}` },
  ];

  return { ok: true, system: SYS, score: null, verdict, breakdown, evidence, notAvailable: [], disclaimer: DISCLAIMER, canonRef: FILE };
}
