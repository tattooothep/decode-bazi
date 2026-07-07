import crypto from "crypto";
import { NextResponse } from "next/server";
import { calcBazi, type BaziAnalysis } from "@/lib/bazi-calc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

const STEM_ELEMENT_TH: Record<string, string> = {
  "甲": "ไม้หยาง",
  "乙": "ไม้หยิน",
  "丙": "ไฟหยาง",
  "丁": "ไฟหยิน",
  "戊": "ดินหยาง",
  "己": "ดินหยิน",
  "庚": "ทองหยาง",
  "辛": "ทองหยิน",
  "壬": "น้ำหยาง",
  "癸": "น้ำหยิน",
};

type AskPreviewBody = {
  birthDate?: unknown;
  birthTime?: unknown;
  unknownTime?: unknown;
  gender?: unknown;
  displayName?: unknown;
  question?: unknown;
};

function asCleanText(value: unknown, max: number): string {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function parseGender(value: unknown): "M" | "F" | undefined {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "f" || raw === "female" || raw === "หญิง") return "F";
  if (raw === "m" || raw === "male" || raw === "ชาย") return "M";
  return undefined;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00+07:00`);
  if (Number.isNaN(d.getTime())) return false;
  const normalized = new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
  if (normalized !== value) return false;
  const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  return value <= today;
}

function validTime(value: string): boolean {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  if (!m) return false;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  return Number.isInteger(hour) && Number.isInteger(minute) && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function formatThaiDate(value: string): string {
  try {
    return new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "long", year: "numeric" }).format(
      new Date(`${value}T00:00:00+07:00`)
    );
  } catch {
    return value;
  }
}

function draftId(input: Record<string, unknown>): string {
  return crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 16);
}

function profileLine(calc: BaziAnalysis): string {
  const dm = calc.dayMaster;
  const element = STEM_ELEMENT_TH[dm] || "ไม่ระบุธาตุ";
  const mode = calc.mode === "4p" ? "อ่านครบ 4 เสา" : "อ่าน 3 เสาเพราะยังไม่ล็อกเวลาเกิด";
  const strength = calc.strength?.level ? `ระดับแรงดวง ${calc.strength.level}` : "ยังต้องอ่านน้ำหนักต่อ";
  const structure = calc.geJu?.structure ? `โครงสร้าง ${calc.geJu.structure}` : "โครงสร้างต้องเปิดอ่านเต็ม";
  return `${mode} · Day Master ${dm} (${element}) · ${strength} · ${structure}`;
}

function questionTone(question: string): string {
  if (/เงิน|รายได้|ลงทุน|หนี้|ธุรกิจ|ยอด|กำไร/.test(question)) return "โจทย์นี้เอนไปทางทรัพย์ งาน และความเสี่ยงเชิงตัวเลข";
  if (/รัก|แฟน|คู่|แต่ง|เลิก|สัมพันธ์|ครอบครัว/.test(question)) return "โจทย์นี้เอนไปทางความสัมพันธ์และการจัดระยะกับคนสำคัญ";
  if (/งาน|อาชีพ|โปรเจกต์|ย้าย|สมัคร|เลื่อน|บริษัท/.test(question)) return "โจทย์นี้เอนไปทางงาน ตำแหน่ง และจังหวะการตัดสินใจ";
  if (/สุขภาพ|ป่วย|พัก|เครียด|ใจ|นอน/.test(question)) return "โจทย์นี้เอนไปทางสมดุลกายใจและการลดแรงกดดัน";
  return "โจทย์นี้ควรอ่านร่วมกันทั้งพื้นดวง จังหวะเวลา และบริบทปัจจุบัน";
}

function lockedSections() {
  return [
    "แกนพื้นดวงที่เกี่ยวกับคำถามนี้",
    "จุดกังวลจริงใต้คำถาม",
    "จังหวะ 30 / 60 / 90 วัน",
    "เหตุผลจาก BaZi, QiMen, Zi Wei, ฤกษ์ และเลนส์เสริม",
    "สิ่งที่ควรทำทันที",
    "สิ่งที่ควรเลี่ยง",
    "คำถามต่อเนื่องกับ AI Sifu",
    "สรุปแผนตัดสินใจ",
  ].map((title, index) => ({ index: index + 1, title, locked: true }));
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as AskPreviewBody;
  const birthDate = asCleanText(body.birthDate, 10);
  const birthTime = asCleanText(body.birthTime, 5);
  const birthTimeKnown = body.unknownTime !== true;
  const displayName = asCleanText(body.displayName, 48) || "คุณ";
  const question = asCleanText(body.question, 360);
  const gender = parseGender(body.gender);

  if (!validDate(birthDate)) {
    return NextResponse.json({ error: "invalid_birth_date" }, { status: 400, headers: NO_STORE_HEADERS });
  }
  if (birthTimeKnown && !validTime(birthTime)) {
    return NextResponse.json({ error: "invalid_birth_time" }, { status: 400, headers: NO_STORE_HEADERS });
  }
  if (question.length < 8) {
    return NextResponse.json({ error: "question_too_short" }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const inputForId = { birthDate, birthTime: birthTimeKnown ? birthTime : null, birthTimeKnown, gender, displayName, question };
  const id = draftId(inputForId);

  try {
    const calc = birthTimeKnown
      ? await calcBazi({
          date: birthDate,
          time: birthTime,
          longitude: 100.5018,
          gmtOffsetHours: 7,
          gender,
          dayBoundary: "23:00",
          birthTimeKnown: true,
        })
      : await calcBazi({
          date: birthDate,
          longitude: 100.5018,
          gmtOffsetHours: 7,
          gender,
          birthTimeKnown: false,
        });

    const timeText = birthTimeKnown ? birthTime : "ยังไม่ล็อกเวลาเกิด";
    const genderText = gender === "F" ? "หญิง" : gender === "M" ? "ชาย" : "ไม่ระบุ";
    const yongshen = calc.yongshen?.[0];
    const yongshenText = yongshen ? `สัญญาณหนุนหลักเริ่มที่ ${yongshen.stem}/${yongshen.element}` : "สัญญาณหนุนหลักต้องเปิดอ่านเต็ม";

    return NextResponse.json(
      {
        ok: true,
        draftId: id,
        generatedAt: new Date().toISOString(),
        inputSummary: {
          birthDate,
          birthDateText: formatThaiDate(birthDate),
          birthTime: timeText,
          birthTimeKnown,
          gender: genderText,
          displayName,
          question,
        },
        chartPreview: {
          mode: calc.mode,
          pillarsZh: calc.pillarsZh,
          dayMaster: calc.dayMaster,
          dayMasterElement: STEM_ELEMENT_TH[calc.dayMaster] || null,
          strength: calc.strength,
          structure: calc.geJu?.structure || null,
          yongshen: yongshen || null,
          climate: calc.climate || null,
        },
        preview: {
          title: `ผลอ่านเบื้องต้นของ ${displayName}`,
          intro: "นี่คือ preview จาก backend ของ Hourkey ส่วนเหตุผลลึก จังหวะเวลา และคำถามต่อเนื่องจะเปิดหลังปลดล็อก",
          birthSummary: `${formatThaiDate(birthDate)} · ${timeText} · ${genderText}`,
          questionSummary: question,
          summary: `${profileLine(calc)} · ${questionTone(question)} · ${yongshenText}`,
        },
        lockedSections: lockedSections(),
        checkout: { packageCode: "master_1m", returnPath: "/ask" },
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (e) {
    console.error("[ask/preview]", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: "preview_failed", draftId: id }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
