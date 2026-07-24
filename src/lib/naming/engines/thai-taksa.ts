/**
 * ทักษาปกรณ์ (ไทย) — จัดอักษรของชื่อลง 8 ภูมิ ตามวันเกิด + ชี้อักษรกาลกิณี (ต้องห้าม)
 * ตำรา: data/library/naming-canon/thai/taksa-pakorn.md (§2 ผัง 8 หมู่ · §3 ผังวันเกิด→ภูมิ · §5 สรุปกาลกิณี)
 * ต้องใช้ "วันเกิด" — ถ้าไม่มี = notAvailable (ห้ามเดา)
 */
import { NamingEngineResult, fail, Evidence, BreakdownItem } from "./types";
import { readCanon, quoteLine, isThaiConsonant, isThaiVowelSign } from "./canon";

const FILE = "thai/taksa-pakorn.md";

// heading ของแต่ละวันใน §3 (ตรงตามไฟล์ตำรา)
const DAY_HEADINGS: Record<string, { heading: string; label: string }> = {
  sun: { heading: "### วันอาทิตย์", label: "อาทิตย์" },
  mon: { heading: "### วันจันทร์", label: "จันทร์" },
  tue: { heading: "### วันอังคาร", label: "อังคาร" },
  wed: { heading: "### วันพุธ (กลางวัน)", label: "พุธ (กลางวัน)" },
  wed_night: { heading: "### วันพุธกลางคืน (ราหู)", label: "พุธกลางคืน (ราหู)" },
  thu: { heading: "### วันพฤหัสบดี", label: "พฤหัสบดี" },
  fri: { heading: "### วันศุกร์", label: "ศุกร์" },
  sat: { heading: "### วันเสาร์", label: "เสาร์" },
};

function normalizeDay(input: string | undefined | null): keyof typeof DAY_HEADINGS | null {
  if (input == null) return null;
  const s = String(input).trim().toLowerCase();
  if (["อาทิตย์", "sunday", "sun", "0", "7"].includes(s)) return "sun";
  if (["จันทร์", "monday", "mon", "1"].includes(s)) return "mon";
  if (["อังคาร", "tuesday", "tue", "2"].includes(s)) return "tue";
  if (["พุธ", "wednesday", "wed", "3", "พุธกลางวัน"].includes(s)) return "wed";
  if (["พุธกลางคืน", "ราหู", "rahu", "wed_night"].includes(s)) return "wed_night";
  if (["พฤหัสบดี", "พฤหัส", "thursday", "thu", "4"].includes(s)) return "thu";
  if (["ศุกร์", "friday", "fri", "5"].includes(s)) return "fri";
  if (["เสาร์", "saturday", "sat", "6"].includes(s)) return "sat";
  return null;
}

/** ยกเนื้อ section ของวันนั้น (ระหว่าง heading กับ heading/--- ถัดไป) */
function daySectionBody(text: string, heading: string): string {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l.trim() === heading);
  if (start < 0) return "";
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith("### ") || t.startsWith("## ") || t === "---") break;
    out.push(lines[i]);
  }
  return out.join("\n");
}

type PhumiRow = { phumi: string; consonants: string[]; hasVowels: boolean; isKalakini: boolean };

/** parse ตารางภูมิ→หมู่อักษรของวันนั้น จาก §3 */
function parseDayTable(body: string): PhumiRow[] {
  const rows: PhumiRow[] = [];
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("|")) continue;
    if (/^\|[\s:|-]+\|?$/.test(line)) continue;
    const cells = line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
    if (cells.length < 2) continue;
    const phumiRaw = cells[0];
    if (phumiRaw.includes("ภูมิ") && cells[1].includes("หมู่อักษร")) continue; // header
    const isKalakini = phumiRaw.includes("กาลกิณี");
    const phumi = phumiRaw.replace(/\*\*/g, "").replace(/🚫/g, "").trim();
    const lettersCell = cells[1];
    const hasVowels = lettersCell.includes("สระ");
    // ⚠️ เซลล์กลุ่มสระเขียนบรรยายว่า "อ + สระทั้งหมด" — คำว่า "สระทั้งหมด" มีพยัญชนะ ส ร ท ง ห ม ด ปนอยู่
    //    ต้องสแกนเฉพาะส่วนก่อนคำ "สระ" (= "อ +") กันหยิบพยัญชนะจากคำบรรยายผิด
    const scanText = hasVowels ? lettersCell.split("สระ")[0] : lettersCell;
    const consonants: string[] = [];
    for (const ch of Array.from(scanText)) if (isThaiConsonant(ch) && !consonants.includes(ch)) consonants.push(ch);
    rows.push({ phumi, consonants, hasVowels, isKalakini });
  }
  return rows;
}

/** ความหมายย่อของแต่ละภูมิ (parse จาก §1 บรรทัด "ความหมายของแต่ละภูมิ") */
function parsePhumiMeanings(text: string): Record<string, string> {
  const line = quoteLine(text, "ความหมายของแต่ละภูมิ");
  const map: Record<string, string> = {};
  for (const part of line.split("·")) {
    const m = part.match(/([฀-๿]+)\s*=\s*([฀-๿\s]+)/);
    if (m) map[m[1].trim()] = m[2].trim();
  }
  return map;
}

export type TaksaInput = { name: string; birthDay?: string | null };

export function analyzeThaiTaksa(input: TaksaInput): NamingEngineResult {
  const SYS = "thai_taksa";
  const name = String(input.name || "").trim();
  if (!name) return fail(SYS, FILE, "กรุณาส่งชื่อภาษาไทยที่ต้องการวิเคราะห์");

  const day = normalizeDay(input.birthDay);
  if (!day) {
    return fail(SYS, FILE, "ทักษาต้องใช้วันเกิด — ยังทำนายไม่ได้", [
      { field: "birthDay", reason: "ศาสตร์ทักษาต้องรู้วันเกิด (จันทร์..อาทิตย์) เพื่อวางจักรทักษา จอต้องส่งวันเกิดมาด้วย" },
    ]);
  }

  const text = readCanon(FILE);
  const { heading, label } = DAY_HEADINGS[day];
  const body = daySectionBody(text, heading);
  const table = parseDayTable(body);
  if (!table.length) return fail(SYS, FILE, "อ่านผังทักษาของวันนี้จากตำราไม่สำเร็จ");

  const phumiMeanings = parsePhumiMeanings(text);

  // จำแนกอักษรในชื่อลงภูมิ
  const chars = Array.from(name);
  const placement: Record<string, string[]> = {};
  const kalakiniHits: string[] = [];
  const vowelPhumi = table.find((r) => r.hasVowels);
  const kalakiniRow = table.find((r) => r.isKalakini);

  for (const ch of chars) {
    if (isThaiConsonant(ch)) {
      const row = table.find((r) => r.consonants.includes(ch));
      if (row) {
        (placement[row.phumi] ||= []).push(ch);
        if (row.isKalakini && !kalakiniHits.includes(ch)) kalakiniHits.push(ch);
      }
    } else if (isThaiVowelSign(ch) && vowelPhumi) {
      (placement[vowelPhumi.phumi] ||= []).push(ch);
      if (vowelPhumi.isKalakini && !kalakiniHits.includes(ch)) kalakiniHits.push(ch);
    }
    // วรรณยุกต์/ไม้ไต่คู้/การันต์ ไม่อยู่ในผัง 8 หมู่ (ตำรา §2 ระบุว่าไม่ใช่ส่วนของทักษา) → ข้าม
  }

  const breakdown: BreakdownItem[] = [];
  for (const r of table) {
    const used = placement[r.phumi];
    if (!used || !used.length) continue;
    breakdown.push({
      label: r.phumi,
      value: used.join(" "),
      luck: r.isKalakini ? "กาลกิณี (ต้องห้าม)" : "มงคล",
      note: phumiMeanings[r.phumi] ? `ภูมิ${r.phumi} = ${phumiMeanings[r.phumi]}` : null,
    });
  }

  const hasKalakini = kalakiniHits.length > 0;
  const score = Math.max(0, 100 - 30 * kalakiniHits.length);
  const verdict = hasKalakini
    ? `⚠️ ชื่อนี้มีอักษรกาลกิณีของคนเกิดวัน${label}: ${kalakiniHits.join(" ")} — ตามหลักทักษาถือเป็นอักษรอัปมงคล ควรเลี่ยง`
    : `✅ ชื่อนี้ไม่มีอักษรกาลกิณีของคนเกิดวัน${label} ผ่านเกณฑ์ทักษา`;

  const evidence: Evidence[] = [];
  if (kalakiniRow) {
    evidence.push({ canonFile: FILE, quote: `${heading} → กาลกิณี = ${kalakiniRow.consonants.join(" ")}${kalakiniRow.hasVowels ? " + สระทั้งหมด" : ""}` });
  }
  const sumLine = quoteLine(text, `| ${label} |`);
  if (sumLine) evidence.push({ canonFile: FILE, quote: sumLine });
  evidence.push({ canonFile: FILE, quote: quoteLine(text, "ช่องต้องห้าม") || "ช่องต้องห้าม: กาลกิณี — อักษรในหมู่นี้ถือเป็นอักษรอัปมงคลของคนเกิดวันนั้น" });

  return {
    ok: true,
    system: SYS,
    score,
    verdict,
    breakdown,
    evidence,
    notAvailable: [],
    disclaimer: "อ้างอิงหลักทักษาปกรณ์ตามตำราพรหมชาติ (โหราศาสตร์ไทย) · วรรณยุกต์/การันต์ไม่นับในผัง 8 หมู่ตามตำรา",
    canonRef: FILE,
  };
}
