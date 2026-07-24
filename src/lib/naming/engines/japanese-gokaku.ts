/**
 * 姓名判断 (ญี่ปุ่น) — 五格 จากจำนวนขีดคันจิ + จำแนก 吉/凶 ตามตาราง 81 แบบญี่ปุ่น
 * ตำรา: data/library/naming-canon/japanese/seimei-handan.md (§5 จำแนก 7 ระดับ 1–81 · §6 เลขร้ายเฉพาะหญิง)
 * - สูตร 五格 reuse จาก engine จีน (computeWuge) เพราะสูตรตรงกัน (ตำรา §6)
 * - นับขีดจากตาราง 康煕字典/ตัวเต็ม (strokes.json) ร่วมกับจีน · gokaku 霊数(+1) ชื่อ/สกุลตัวเดียว = computeWuge จัดการแล้ว
 * ⚠️ ห้ามใช้ชื่อทางการค้าที่จดทะเบียน (เครื่องหมายการค้า) เป็นชื่อฟีเจอร์ (ตำรา §7)
 */
import { NamingEngineResult, fail, Evidence, BreakdownItem, NotAvailableItem } from "./types";
import { readCanon, quoteLine, extractInts } from "./canon";
import { computeWuge } from "../engine";
import strokesRaw from "../data/strokes.json";

const FILE = "japanese/seimei-handan.md";
const STROKES = strokesRaw as Record<string, number>;
const DISCLAIMER =
  "五格 ใช้สูตรร่วมกับ 姓名學 จีน · นับขีดตัวเต็มตาม 康煕字典 · ตาราง 81 ระดับ 吉/凶 ยึดตามตำราญี่ปุ่นสำนักหนึ่ง (บางเลขต่างตามสำนัก) · ไม่อ้างชื่อทางการค้าที่จดทะเบียน";

const LEVELS = ["最大吉", "大吉", "吉", "吉凶", "凶", "大凶", "最大凶"];
const LEVEL_TH: Record<string, string> = {
  最大吉: "มงคลสูงสุด",
  大吉: "มงคลใหญ่",
  吉: "ดี",
  吉凶: "ปนกัน (ครึ่งๆ)",
  凶: "ร้าย",
  大凶: "ร้ายใหญ่",
  最大凶: "ร้ายสุด",
};
const LEVEL_SCORE: Record<string, number> = { 最大吉: 100, 大吉: 85, 吉: 75, 吉凶: 55, 凶: 35, 大凶: 20, 最大凶: 10 };

type Tables = { numberLevel: Map<number, string>; femaleBad: Set<number> };
let cached: Tables | null = null;

function parseTables(): Tables {
  if (cached) return cached;
  const text = readCanon(FILE);
  const numberLevel = new Map<number, string>();
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("|")) continue;
    const cells = line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
    if (cells.length < 2) continue;
    const boldMatch = cells[0].match(/\*\*([^*]+)\*\*/);
    if (!boldMatch) continue;
    const level = boldMatch[1].trim();
    if (!LEVELS.includes(level)) continue; // ต้องตรงชื่อระดับเป๊ะ (กัน 最大吉 ชนกับ 吉)
    for (const n of extractInts(cells[1])) numberLevel.set(n, level);
  }
  // §6 เลขร้ายเฉพาะหญิง (寡婦運)
  const femaleBad = new Set<number>();
  const femLine = text.split("\n").find((l) => l.includes("寡婦運") && /\*\*[\d,\s]+\*\*/.test(l));
  if (femLine) {
    const g = femLine.match(/\*\*([\d,\s]+)\*\*/);
    if (g) for (const n of extractInts(g[1])) femaleBad.add(n);
  }
  cached = { numberLevel, femaleBad };
  return cached;
}

export type GokakuInput = { surname: string; given: string; gender?: string | null };

export function analyzeJapaneseGokaku(input: GokakuInput): NamingEngineResult {
  const SYS = "japanese_gokaku";
  const surname = String(input.surname || "").trim();
  const given = String(input.given || "").trim();
  if (!surname || !given) return fail(SYS, FILE, "กรุณาส่งนามสกุล + ชื่อ (คันจิ)");

  const sChars = Array.from(surname);
  const gChars = Array.from(given);
  const missing: string[] = [];
  const sStrokes: number[] = [];
  const gStrokes: number[] = [];
  for (const ch of sChars) {
    const n = STROKES[ch];
    if (typeof n === "number" && n > 0) sStrokes.push(n);
    else missing.push(ch);
  }
  for (const ch of gChars) {
    const n = STROKES[ch];
    if (typeof n === "number" && n > 0) gStrokes.push(n);
    else missing.push(ch);
  }
  if (missing.length) {
    return fail(SYS, FILE, `นับขีดไม่ได้: ${missing.join(" ")} — ยังทำนายไม่ได้`, [
      {
        field: `ขีดของอักษร ${missing.join(" ")}`,
        reason: "ไม่พบจำนวนขีดในตาราง 康煕字典 (strokes.json) · คานะ ひらがな/カタカナ ตำรา §8 ระบุว่ายังไม่มีตารางขีดครบ จึงยังทำนายอักษรนี้ไม่ได้ (ไม่เดา)",
      },
    ]);
  }

  const t = parseTables();
  const [tiange, renge, dige, waige, zongge] = computeWuge(sStrokes, gStrokes);
  const grids: { key: string; jp: string; num: number }[] = [
    { key: "天格", jp: "ฟ้า/วงศ์ตระกูล", num: tiange },
    { key: "人格", jp: "คน (สำคัญสุด)", num: renge },
    { key: "地格", jp: "ดิน (ต้นชีวิต)", num: dige },
    { key: "外格", jp: "นอก (สังคม)", num: waige },
    { key: "総格", jp: "รวม (ตลอดชีวิต)", num: zongge },
  ];

  const notAvailable: NotAvailableItem[] = [];
  const breakdown: BreakdownItem[] = grids.map((g) => {
    const level = t.numberLevel.get(g.num) || null;
    if (!level) notAvailable.push({ field: `ระดับของเลข ${g.num} (${g.key})`, reason: "เลขนี้อยู่นอกช่วง 1–81 ในตารางตำรา" });
    return { label: `${g.key} ${g.jp}`, value: g.num, luck: level ? `${level} (${LEVEL_TH[level]})` : null };
  });

  const genderF = String(input.gender || "").trim().toLowerCase().charAt(0) === "f";
  const femaleHits: number[] = [];
  if (genderF) {
    for (const g of grids) if ((g.key === "人格" || g.key === "総格") && t.femaleBad.has(g.num)) femaleHits.push(g.num);
    if (femaleHits.length) breakdown.push({ label: "⚠️ 寡婦運 (เลขร้ายเฉพาะหญิง)", value: femaleHits.join(", "), luck: "ร้ายสำหรับหญิง" });
  }

  const rengeLevel = t.numberLevel.get(renge);
  const zongLevel = t.numberLevel.get(zongge);
  // คะแนนถ่วงน้ำหนักตามลำดับสำคัญ 人格>総格>地格/外格>天格
  const w: Record<string, number> = { 人格: 0.4, 総格: 0.3, 地格: 0.15, 外格: 0.1, 天格: 0.05 };
  let score = 0;
  let wsum = 0;
  for (const g of grids) {
    const lv = t.numberLevel.get(g.num);
    if (lv) {
      score += LEVEL_SCORE[lv] * w[g.key];
      wsum += w[g.key];
    }
  }
  const finalScore = wsum > 0 ? Math.round(score / wsum) : null;

  let verdict = `人格(คน)=${renge}${rengeLevel ? ` [${LEVEL_TH[rengeLevel]}]` : ""} · 総格(รวม)=${zongge}${zongLevel ? ` [${LEVEL_TH[zongLevel]}]` : ""}`;
  if (femaleHits.length) verdict += ` · ⚠️ เลข ${femaleHits.join(",")} เป็น寡婦運 (พลังแกร่งเกิน ร้ายต่อดวงหญิง)`;

  const evidence: Evidence[] = [];
  if (rengeLevel) {
    const q = quoteLine(readCanon(FILE), `**${rengeLevel}**`);
    if (q) evidence.push({ canonFile: FILE, quote: q });
  }
  evidence.push({ canonFile: FILE, quote: quoteLine(readCanon(FILE), "人格 (สูงสุด)") || "ลำดับความสำคัญ: 人格 (สูงสุด) > 総格 > 地格/外格 > 天格" });
  if (femaleHits.length) {
    const q = readCanon(FILE).split("\n").find((l) => l.includes("寡婦運") && /\*\*[\d,\s]+\*\*/.test(l));
    if (q) evidence.push({ canonFile: FILE, quote: q.trim().slice(0, 200) });
  }

  return { ok: true, system: SYS, score: finalScore, verdict, breakdown, evidence, notAvailable, disclaimer: DISCLAIMER, canonRef: FILE };
}
