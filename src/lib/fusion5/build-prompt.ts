/**
 * fusion5 · สร้าง prompt ต่อศาสตร์ (engine packet + คัมภีร์ + คำถาม + guard กันมั่ว)
 * แต่ละศาสตร์ render ผังของตัวเอง → ป้อน AI · ห้ามปนผัง/ศัพท์ข้ามศาสตร์
 */
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { buildQizhengPacket } from "../astro/qizheng/packet";
import { renderQizhengPrompt } from "../astro/qizheng/render";
import { westernChart } from "../astro/western/engine";
import { buildWesternPacket } from "../astro/western/packet";
import { renderWesternPrompt } from "../astro/western/render";
import { vedicChart } from "../astro/vedic/engine";
import { buildVedicPacket } from "../astro/vedic/packet";
import { renderVedicPrompt } from "../astro/vedic/render";
import { buildZiweiPacket } from "../astro/ziwei/packet";
import { renderZiweiPrompt } from "../astro/ziwei/render";
import { DISCIPLINES, type ScienceId } from "./disciplines";

export type BirthData = { name: string; dtUTC: Date; lat: number; lng: number; hasTime: boolean; gender: "M" | "F" };

const CANON_DIR = join(process.cwd(), "data/library/astro-canon");
const canonCache = new Map<string, string>();

/** โหลดคัมภีร์ศาสตร์ (data/library/astro-canon/<science>/*.md) · best-effort · cap ขนาด */
export function loadCanon(science: ScienceId, maxChars = 38000): string {
  if (canonCache.has(science)) return canonCache.get(science)!;
  let text = "";
  try {
    const dir = join(CANON_DIR, science);
    if (existsSync(dir)) {
      for (const f of readdirSync(dir).filter((x) => x.endsWith(".md")).sort()) {
        text += readFileSync(join(dir, f), "utf8") + "\n\n";
        if (text.length > maxChars) break;
      }
    }
  } catch { /* ไม่มีคัมภีร์ = ใช้ packet + guard ในตัว */ }
  text = text.slice(0, maxChars);
  canonCache.set(science, text);
  return text;
}

/** render ผังของศาสตร์ (เฉพาะ astro · bazi ไปทาง /api/sifu เดิม) */
export function renderChartForScience(science: ScienceId, b: BirthData, refDate: Date): string {
  if (science === "qizheng") return renderQizhengPrompt(buildQizhengPacket(b.dtUTC, b.lat, b.lng, b.hasTime));
  if (science === "western") return renderWesternPrompt(buildWesternPacket(westernChart(b.dtUTC, b.lat, b.lng, b.hasTime)));
  if (science === "vedic") return renderVedicPrompt(buildVedicPacket(vedicChart(b.dtUTC, b.lat, b.lng, b.hasTime, refDate)));
  if (science === "ziwei") return renderZiweiPrompt(buildZiweiPacket(b.dtUTC, b.lat, b.lng, b.gender, b.hasTime));
  return "";
}

const LANG_NAME: Record<string, string> = { th: "ไทย", en: "อังกฤษ", zh: "จีน" };

/** prompt 1 panel ศาสตร์ (รองรับ 1-2 ดวง) */
export function buildSciencePrompt(science: ScienceId, births: BirthData[], question: string, lang = "th", refDate = new Date("2026-06-30T00:00:00Z")): string {
  const bind = DISCIPLINES[science];
  const canon = loadCanon(science);
  const L: string[] = [];
  L.push(`คุณคือซินแสผู้เชี่ยวชาญ "${bind.labelTh}" (${bind.labelZh})`);
  L.push(`อ่านดวงจาก "ผังที่ระบบคำนวณ" ด้านล่างเท่านั้น · ⚠️ ${bind.termGuard}`);
  L.push(`ห้ามเดาตำแหน่งดาว/เรือน/ดวง · field ไหนไม่มีให้บอกว่าไม่มี · ตอบภาษา${LANG_NAME[lang] || "ไทย"}นำ`);
  if (canon) { L.push(`\n=== คัมภีร์ ${bind.labelTh} (หลักการตีความ — ใช้เป็นฐาน) ===`); L.push(canon); L.push(`=== จบคัมภีร์ ===`); }
  births.forEach((b, i) => {
    L.push(`\n=== ผังดวง${births.length > 1 ? ` คนที่ ${i + 1}: ${b.name}` : ` ${b.name}`} ===`);
    if (!b.hasTime) L.push(`⚠️ ดวงนี้ไม่ทราบเวลาเกิด — ส่วนที่ต้องลัคนา/เรือนอ่านไม่ได้ (อ่านเท่าที่มี)`);
    L.push(renderChartForScience(science, b, refDate));
  });
  if (births.length > 1) L.push(`\n=== ดูคู่ ===\nวิเคราะห์ทั้ง ${births.length} ดวง + ความเข้ากัน/ปฏิกิริยาระหว่างกัน ตามหลัก ${bind.labelTh} (ส่งคำตอบครบทุกดวง)`);
  L.push(`\n=== คำถามผู้ถาม ===\n${question}`);
  L.push(`\nรูปแบบตอบ: ฟันธงก่อน → หลักฐานจากผัง 3-5 จุด → ความหมายเชิงปฏิบัติ · ห้ามพูดคำว่า packet/engine/prompt/CLI/คัมภีร์ในคำตอบ`);
  return L.join("\n");
}

/** prompt judge หลอมรวมทุก panel */
export function buildJudgePrompt(panels: { science: ScienceId; reply: string }[], births: BirthData[], question: string, lang = "th"): string {
  const L: string[] = [];
  L.push(`คุณคือ "ซินแสใหญ่" ผู้หลอมรวมคำพยากรณ์จากหลายศาสตร์เป็นคำตอบเดียว`);
  L.push(`มี ${panels.length} ศาสตร์อ่านดวง${births.length > 1 ? "คู่" : ""}เดียวกัน · หน้าที่: หา "จุดตรงกัน = ฟันธงหนัก" + "จุดต่าง = เงื่อนไข/ข้อระวัง" + สรุปคำแนะนำ`);
  L.push(`⚠️ ห้ามคำนวณดวงเอง · ใช้เฉพาะคำพยากรณ์ของแต่ละศาสตร์ด้านล่าง · ติดป้ายชื่อศาสตร์ทุกครั้งที่อ้างอิง · ตอบภาษา${LANG_NAME[lang] || "ไทย"}`);
  panels.forEach((p) => { L.push(`\n=== ศาสตร์ ${DISCIPLINES[p.science].labelTh} ว่า ===\n${p.reply}`); });
  L.push(`\n=== คำถาม ===\n${question}`);
  L.push(`\nรูปแบบตอบ: 1) ฟันธงรวม 2) ศาสตร์ที่เห็นตรงกัน (น้ำหนักสูง) 3) จุดที่ต่างกัน 4) คำแนะนำปฏิบัติ`);
  return L.join("\n");
}
