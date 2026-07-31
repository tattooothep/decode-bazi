import { NextResponse } from "next/server";
import { getMobileSession, mobileBearerToken } from "@/lib/mobile-auth";
import { internalAppOrigin } from "@/lib/internal-app-origin";
import { publicAiPayload } from "@/lib/public-ai-response";
import { buildBlessingSentences } from "@/lib/qimen-blessing-sentence";
import { computeFlyingLayers } from "@/lib/fengshui-luxing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * กังฉีเหมิน 1-9 คู่กับทิศตามลั่วซู
 *
 * ── ทำไมต้องมีตรงนี้ (30 ก.ค. 69) ───────────────────────────
 * เจ้าของสั่งเอาดาวจื่อไป๋มาแสดงคู่องค์เทพในหน้าทิศเทพ
 * ดาวเหินจรของเราคืนค่าเป็น **ทิศ** ส่วนฉีเหมินคิดเป็น **กัง**
 * ทั้งสองศาสตร์เดินบนลั่วซู 9 กังชุดเดียวกัน จึงจับคู่กันได้ตรงตัว
 *
 * มีที่มาในคัมภีร์ของเราเอง — 奇門統宗 เขียนเทียบสองศาสตร์ไว้ว่า
 * 「年家紫白亦陰遁，用逆。紫白之用，重在白宮…奇門之用，重在八宮，
 *   故上元甲子一白起坎」
 * แปลว่าตั้งต้นที่ 上元甲子 = 一白 เข้ากังข่านเหมือนกันทั้งคู่
 * ต่างกันที่ให้น้ำหนักคนละจุด ไม่ใช่คนละกระดาน
 *
 * 🔴 ดาวเป็น **ชั้นข้อมูลเพิ่ม ไม่ใช่ตัวตัดสิน**
 * เจ้าของเคาะแล้วว่า "ไม่เตือน แค่โชว์ · คำเตือนคงไว้ที่ทิศดีฉีเหมิน
 * ผู้ใช้ตัดสินใจเอง" — ห้ามเอาดาวไปเปลี่ยนอันดับทิศของฉีเหมินเด็ดขาด
 */
const PALACE_TO_DIRECTION: Readonly<Record<number, string>> = Object.freeze({
  1: "N",   // 坎
  2: "SW",  // 坤
  3: "E",   // 震
  4: "SE",  // 巽
  5: "C",   // 中宮 — ไม่มีทิศตามตำรา
  6: "NW",  // 乾
  7: "W",   // 兌
  8: "NE",  // 艮
  9: "S",   // 離
});

const SCHOOLS = new Set(["chaibu", "zhirun", "yinpan"]);
const SYSTEM_TYPES = new Set(["hour", "day", "month", "year"]);

function cleanDate(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const parsed = new Date(`${text}T00:00:00Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === text ? text : null;
}

function cleanTime(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  if (!/^\d{2}:\d{2}$/.test(text)) return null;
  const [hour, minute] = text.split(":").map(Number);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? text : null;
}

function cleanCoordinate(value: unknown, min: number, max: number): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function cleanText(value: unknown, max: number): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text.slice(0, max) : undefined;
}


/**
 * ชื่อช่องที่อาจใช้เก็บแต่ละชิ้นส่วน — ลองตามลำดับ เจอตัวแรกที่มีค่าใช้เลย
 *
 * 🔴 ทำไมต้องลองหลายชื่อ
 * ผังต้นทางประกอบจากหลายตาราง ชื่อช่องไม่ตรงกันทุกกัง
 * ถ้าเจาะจงชื่อเดียวแล้วกังไหนใช้ชื่ออื่น กังนั้นจะไม่มีคำอวยพรเงียบๆ
 * ซึ่งคือสิ่งที่เจ้าของเจอเอง 31 ก.ค. ("เสียงยาวไม่ทุกทิศ")
 */
const BLESSING_FIELDS = {
  deity: {
    th: ["deity_name_th", "deity_th"],
    en: ["deity_name_en", "deity_en"],
    zh: ["deity_name_zh", "deity_zh", "deity"],
  },
  direction: {
    th: ["direction_th", "direction_name_th", "trigram_name_th"],
    en: ["direction_en", "direction_name_en"],
    zh: ["direction_zh", "direction_name_zh", "trigram_zh"],
  },
  words: {
    th: ["door_action_advice_th", "deity_description_th", "deity_advice_th"],
    en: ["door_action_advice_en", "deity_description_en", "deity_advice_en"],
    zh: ["door_action_advice_zh", "deity_description_zh", "deity_advice_zh"],
  },
} as const;

/**
 * ชื่อทิศ 3 ภาษาจากรหัสทิศ
 *
 * 🔴 ผังเก็บทิศเป็นรหัสสองตัว ("SE") ไม่มีชื่อภาษาไหนเลย
 * ตัวประกอบประโยคจึงถอยไปอ่านแต่คำดิบ ได้ประโยคสั้น 28 ตัวอักษร
 * แทนที่จะเป็นคำอวยพรเต็ม 325 ตัวอักษร — นี่คือสิ่งที่เจ้าของเจอ 31 ก.ค.
 */
const DIRECTION_NAMES: Record<string, { th: string; en: string; zh: string }> = {
  N: { th: "เหนือ", en: "north", zh: "北方" },
  NE: { th: "ตะวันออกเฉียงเหนือ", en: "northeast", zh: "東北方" },
  E: { th: "ตะวันออก", en: "east", zh: "東方" },
  SE: { th: "ตะวันออกเฉียงใต้", en: "southeast", zh: "東南方" },
  S: { th: "ใต้", en: "south", zh: "南方" },
  SW: { th: "ตะวันตกเฉียงใต้", en: "southwest", zh: "西南方" },
  W: { th: "ตะวันตก", en: "west", zh: "西方" },
  NW: { th: "ตะวันตกเฉียงเหนือ", en: "northwest", zh: "西北方" },
  C: { th: "กังกลาง", en: "centre", zh: "中宮" },
};

function directionName(row: Record<string, unknown>, locale: "th" | "en" | "zh"): string {
  const code = typeof row.direction === "string" ? row.direction.trim().toUpperCase() : "";
  const known = DIRECTION_NAMES[code];
  return known ? known[locale] : "";
}

function pickText(row: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return "";
}

/**
 * เติมคำอวยพรฉบับเต็มลงทุกกัง — เพิ่มช่องใหม่เฉยๆ ไม่แตะของเดิมสักช่อง
 *
 * ทำที่นี่เพราะกฎเดิมของระบบคือ **แอพห้ามแต่งคำอวยพรเอง**
 * เนื้อความยังมาจากผังทุกคำ เปลี่ยนแค่โครงประโยคซึ่งเป็นถ้อยคำพิธี
 *
 * คืนจำนวนกังที่เติมสำเร็จด้วย เพื่อให้เห็นทันทีว่ามีกังไหนตกหล่น
 */
function attachBlessings(data: unknown): { filled: number; total: number } {
  /**
   * 🔴 กับดักที่พลาดมาแล้วสองครั้ง (ดาวจื่อไป๋ 30 ก.ค. · คำอวยพร 31 ก.ค.)
   * ผังจริงอยู่ใต้ชั้น `data` ไม่ใช่ชั้นบนสุด อ่านผิดชั้นแล้วได้ศูนย์เงียบๆ
   * จึงลองทั้งสองชั้น และคืนจำนวนจริงออกไปให้เห็น ไม่ปล่อยให้เดา
   */
  const root = data as { palaces?: unknown; data?: { palaces?: unknown } };
  const palaces = Array.isArray(root?.data?.palaces)
    ? root.data.palaces
    : Array.isArray(root?.palaces) ? root.palaces : null;
  if (palaces === null) return { filled: 0, total: 0 };

  let filled = 0;
  for (const entry of palaces) {
    if (entry === null || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const parts = {
      th: null as null | { deity: string; direction: string; words: string },
      en: null as null | { deity: string; direction: string; words: string },
      zh: null as null | { deity: string; direction: string; words: string },
    };
    for (const locale of ["th", "en", "zh"] as const) {
      const words = pickText(row, BLESSING_FIELDS.words[locale]);
      // ไม่มีคำจากผัง = ไม่มีพร ไม่ใช่แต่งพรลอยๆ ให้
      if (words === "") continue;
      parts[locale] = {
        deity: pickText(row, BLESSING_FIELDS.deity[locale]),
        /**
         * ใช้ชื่อทิศบนเข็มทิศก่อนเสมอ (ตะวันออกเฉียงใต้ / 東南方)
         * ชื่อกว้า (ซวิ่น / 巽) ถูกตามตำราแต่คนทั่วไปไม่รู้ว่าอยู่ทางไหน
         * และคำอวยพรนี้มีไว้ให้คนหันหน้าไปทางนั้นจริง ต้องบอกทางที่หันได้
         */
        direction: directionName(row, locale) || pickText(row, BLESSING_FIELDS.direction[locale]),
        words,
      };
    }
    const sentences = buildBlessingSentences(parts);
    if (Object.keys(sentences).length > 0) {
      row.blessing_sentence = sentences;
      filled += 1;
    }
  }
  return { filled, total: palaces.length };
}

export async function POST(req: Request) {
  const session = await getMobileSession(req);
  const bearer = mobileBearerToken(req);
  if (!session || !bearer) {
    return NextResponse.json({ ok: false, error: "not_logged_in" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const date = cleanDate(body.date);
  const time = cleanTime(body.time);
  const latitude = cleanCoordinate(body.latitude ?? body.lat, -90, 90);
  const longitude = cleanCoordinate(body.longitude ?? body.lng, -180, 180);
  const school = String(body.school || "chaibu").toLowerCase();
  const systemType = String(body.system_type || "hour").toLowerCase();
  if (!date || !time) return NextResponse.json({ ok: false, error: "bad_date_or_time" }, { status: 400 });
  if (latitude === null || longitude === null) {
    return NextResponse.json({ ok: false, error: "location_required" }, { status: 422 });
  }
  if (!SCHOOLS.has(school)) return NextResponse.json({ ok: false, error: "unsupported_school" }, { status: 400 });
  if (!SYSTEM_TYPES.has(systemType)) return NextResponse.json({ ok: false, error: "unsupported_system_type" }, { status: 400 });

  const upstream = await fetch(`${internalAppOrigin(req)}/api/qimen`, {
    body: JSON.stringify({
      date,
      time,
      lat: latitude,
      lng: longitude,
      school,
      system_type: systemType,
      question: cleanText(body.question, 600),
      purpose: cleanText(body.purpose, 120),
      use_case: cleanText(body.use_case, 80),
    }),
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Cookie: `decode_auth=${bearer}`,
    },
    method: "POST",
  });
  const data = await upstream.json().catch(() => ({ ok: false, error: "invalid_qimen_response" }));

  /**
   * ดาวเหินจร 紫白 ต่อกัง — เพิ่มเข้ามาเฉยๆ ไม่แตะของเดิมสักช่อง
   *
   * คำนวณจากเวลาชุดเดียวกับที่ขอผังฉีเหมิน จึงเป็นยามเดียวกันแน่นอน
   * ล้มแล้วต้องไม่ลากผังฉีเหมินไปด้วย — ผังคือของหลัก ดาวคือของแถม
   */
  let flying: Record<string, unknown> | null = null;
  try {
    const [yy, mm, dd] = date.split("-").map(Number);
    const [hh, mi] = time.split(":").map(Number);
    const layers = computeFlyingLayers(yy, mm, dd, hh, mi);
    const byPalace: Record<number, { hour: number; day: number; month: number }> = {};
    for (const [palace, dir] of Object.entries(PALACE_TO_DIRECTION)) {
      const key = dir as keyof typeof layers.hour_stars.palaces;
      byPalace[Number(palace)] = {
        hour: layers.hour_stars.palaces[key],
        day: layers.day_stars.palaces[key],
        month: layers.month_stars.palaces[key],
      };
    }
    flying = {
      by_palace: byPalace,
      hour_center: layers.hour_stars.center,
      hour_direction: layers.hour_stars.direction,
      day_center: layers.day_stars.center,
      month_center: layers.month_stars.center,
      note: layers.luxing_note,
    };
  } catch (error) {
    // 🔴 ห้ามเงียบ — ดาวหายแล้วไม่มีใครรู้ว่าเพราะอะไร
    console.error(
      "[mobile-qimen] คำนวณดาวเหินจรไม่สำเร็จ",
      String((error as Error)?.message ?? error),
    );
  }

  /**
   * คำอวยพรฉบับเต็มต่อกัง — ต้องมีครบทุกทิศ ไม่ใช่บางทิศ
   * นับผลไว้ในคำตอบด้วย จะได้เห็นทันทีว่ากังไหนตกหล่น ไม่ต้องเดา
   */
  const blessing = attachBlessings(data);

  return NextResponse.json(publicAiPayload({
    ...data,
    flying_stars: flying,
    blessing_coverage: blessing,
    ok: upstream.ok,
    request_context: {
      date,
      time,
      latitude,
      longitude,
      location_source: "mobile_explicit",
      school,
      system_type: systemType,
    },
  }), {
    headers: { "Cache-Control": "no-store, max-age=0" },
    status: upstream.status,
  });
}
