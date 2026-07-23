// GET /api/mobile/v1/tianxing — 七政四餘/天星 ผังดาวจริงสำหรับแอพ (21 ก.ค. 2569 · ⑫ ใน 15 งาน)
// engine เดิม src/lib/tianxing (astronomy-engine · ใช้ในเว็บ /tianxing แล้ว) — deterministic · ไม่หักยาม
// รับ profileId (คิดจากเวลาเกิด) หรือ dtUTC ตรง (ดูฟ้าเวลาอื่น เช่น ตอนนี้/ฤกษ์ที่จะใช้)
import { NextResponse } from "next/server";
import { getMobileSession } from "@/lib/mobile-auth";
import { q1 } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { tianxingReading } from "@/lib/tianxing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cleanId(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim().replace(/^hk_/, "") : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
}

/* ── เขตเวลาเกิด (23 ก.ค. 2569) ─────────────────────────────────────────────
 * ตรวจ DB แล้ว: ตาราง profiles **ไม่มี** คอลัมน์เขตเวลาเลย (ไม่มี tz/timezone/offset)
 *   birth_datetime เป็น timestamptz ที่ตอนบันทึกถูกตรึงเป็นเวลาไทย
 *   (profile/create: `($5 || ' ' || $6 || ':00 Asia/Bangkok')::timestamptz` · calcBazi ส่ง gmtOffsetHours: 7)
 *   ทุกเส้น (chart/bazi/ziwei/fusion) จึงอ่านกลับด้วย
 *   `to_char(birth_datetime AT TIME ZONE 'Asia/Bangkok', ...)` แล้วต่อ '+07:00' — เป็นวงกลมปิดของ "เวลาไทย"
 *   ⇒ ทำเหมือนกันทุกเส้น (ห้ามคิดสูตรใหม่) แต่ **ห้ามเงียบ**: ถ้าเวลาที่กรอกมาไม่ใช่เวลาไทยจริง
 *      (คนเกิดต่างประเทศ) ผังฟ้าจะคลาด ⇒ ต้องแจ้งธงกลับไปให้แอพเสมอ
 * ทางลงที่ซื่อสัตย์: รับ ?tz= (ชื่อโซน IANA เช่น Asia/Tokyo หรือออฟเซ็ต +09:00 / 9)
 *   ใช้ตีความ "เวลานาฬิกาที่กรอกไว้" ให้เป็นเวลาสากลจริง · ไม่ส่งมา = ใช้ +07:00 ตั้งต้น + ธง isDefault
 * หมายเหตุ: users.timezone มีอยู่ แต่นั่นคือโซนของ "บัญชีผู้ใช้" ไม่ใช่โซนสถานที่เกิดของโปรไฟล์
 *   (ค่าในระบบตอนนี้ = Asia/Bangkok ทุกแถว) → ห้ามเอามาสวมเป็นเขตเวลาเกิด
 */
const DEFAULT_TZ = "Asia/Bangkok";
const DEFAULT_TZ_OFFSET_MIN = 7 * 60;

/** ออฟเซ็ต (นาที) ของโซน IANA ณ ช่วงเวลา utcMs — วิธีมาตรฐานผ่าน Intl (รองรับ DST/เวลาในอดีต) */
function zoneOffsetMinutes(utcMs: number, zone: string): number | null {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: zone, hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    const p: Record<string, number> = {};
    for (const part of dtf.formatToParts(new Date(utcMs))) {
      if (part.type !== "literal") p[part.type] = Number(part.value);
    }
    if (!p.year || !p.month || !p.day) return null;
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour === 24 ? 0 : p.hour, p.minute, p.second);
    return Math.round((asUtc - utcMs) / 60000);
  } catch { return null; }
}

type TzSpec = { label: string; kind: "zone" | "offset"; offsetMin?: number };

/** อ่าน ?tz= — รับชื่อโซน IANA หรือออฟเซ็ต +HH:MM / -H / ตัวเลขชั่วโมง · ไม่ถูกต้อง = null */
function parseTz(raw: string | null): TzSpec | null {
  const text = String(raw || "").trim();
  if (!text) return null;
  const m = /^([+-])?(\d{1,2})(?::?(\d{2}))?$/.exec(text);
  if (m) {
    const sign = m[1] === "-" ? -1 : 1;
    const hh = Number(m[2]), mm = Number(m[3] || 0);
    if (hh > 14 || mm > 59) return null;
    const offsetMin = sign * (hh * 60 + mm);
    const abs = Math.abs(offsetMin);
    const label = `${offsetMin < 0 ? "-" : "+"}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
    return { label, kind: "offset", offsetMin };
  }
  if (!/^[A-Za-z][A-Za-z0-9_+\-]*(\/[A-Za-z0-9_+\-]+){1,2}$/.test(text) && text !== "UTC") return null;
  if (zoneOffsetMinutes(Date.now(), text) === null) return null;
  return { label: text, kind: "zone" };
}

/** เวลานาฬิกา "YYYY-MM-DDTHH:MM:SS" + เขตเวลา → เวลาสากลจริง (สองรอบ กันช่วง DST เปลี่ยน) */
function wallClockToUtc(wall: string, tz: TzSpec): Date | null {
  const naive = Date.parse(`${wall}Z`);
  if (!Number.isFinite(naive)) return null;
  if (tz.kind === "offset") return new Date(naive - (tz.offsetMin || 0) * 60000);
  const off1 = zoneOffsetMinutes(naive, tz.label);
  if (off1 === null) return null;
  let ms = naive - off1 * 60000;
  const off2 = zoneOffsetMinutes(ms, tz.label);
  if (off2 !== null && off2 !== off1) ms = naive - off2 * 60000;
  return new Date(ms);
}

export async function GET(req: Request) {
  const session = await getMobileSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "not logged in" }, { status: 401 });
  const limited = await rateLimit(`mobile-tianxing:${clientIp(req)}:${session.userId}`, 30, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) } }
    );
  }
  const url = new URL(req.url);
  const profileId = cleanId(url.searchParams.get("profileId"));
  let dt: Date | null = null;
  let lat = 13.7563;
  let lng = 100.5018;
  let profileOut: { id: string; name: string } | null = null;
  let locationSource: "profile" | "query" | "default_bangkok" = "default_bangkok";
  const tzParam = parseTz(url.searchParams.get("tz"));
  // โหมด "ฟ้าตอนนี้/เวลาอื่น" ส่ง dtUTC เป็นเวลาสากลอยู่แล้ว → ไม่มีประเด็นเขตเวลา
  // note = 3 ภาษา (th/en/zh) ตามมาตรฐานแอพ — zh ห้ามมีไทยปน
  let timezone: {
    used: string;
    source: "query" | "default_bangkok" | "utc_input";
    isDefault: boolean;
    note: { th: string; en: string; zh: string };
  } = {
    used: "UTC", source: "utc_input", isDefault: false,
    note: {
      th: "เวลาที่ส่งมาเป็นเวลาสากลตรง ไม่ต้องแปลงเขตเวลา",
      en: "Input is already UTC — no timezone conversion applied.",
      zh: "輸入已是世界時，無需轉換時區。",
    },
  };

  if (profileId) {
    const row = await q1<{
      id: string; name: string | null; nickname: string | null; birth_datetime: string | null;
      birth_lat: string | null; birth_lng: string | null;
    }>(
      `SELECT id, name, nickname,
              to_char(birth_datetime AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD"T"HH24:MI:SS') AS birth_datetime,
              birth_lat, birth_lng
         FROM profiles WHERE id=$1 AND org_id=$2 AND is_archived=false`,
      [profileId, session.orgId]
    );
    if (!row || !row.birth_datetime) {
      return NextResponse.json({ ok: false, error: "profile not found" }, { status: 404 });
    }
    /* เวลานาฬิกาที่บันทึกไว้ (ตีความเป็นเวลาไทยตอน INSERT เหมือนทุกเส้น) → ตีเป็นเวลาสากลตามเขตเวลาที่ระบุ
     * ไม่ระบุ ?tz= → คงพฤติกรรมเดิม +07:00 แต่ **ติดธง** ว่าเป็นค่าตั้งต้น ไม่ใช่เขตเวลาเกิดจริง */
    const tz: TzSpec = tzParam || { label: DEFAULT_TZ, kind: "offset", offsetMin: DEFAULT_TZ_OFFSET_MIN };
    dt = wallClockToUtc(row.birth_datetime, tz);
    if (!dt || isNaN(dt.getTime())) {
      return NextResponse.json({ ok: false, error: "bad_birth_datetime" }, { status: 400 });
    }
    timezone = tzParam
      ? {
          used: tzParam.label, source: "query", isDefault: false,
          note: {
            th: "ใช้เขตเวลาที่แอพส่งมาเป็นเขตเวลาของสถานที่เกิด",
            en: "Birth timezone supplied by the app was used.",
            zh: "採用應用傳入的出生地時區。",
          },
        }
      : {
          used: `${DEFAULT_TZ} (+07:00)`, source: "default_bangkok", isDefault: true,
          note: {
            th: "โปรไฟล์ไม่ได้เก็บเขตเวลาเกิด จึงใช้เวลาไทย +07:00 เป็นค่าตั้งต้น ถ้าเกิดต่างประเทศให้ส่ง tz มาด้วย มิฉะนั้นลัคนาและตำแหน่งดาวจะคลาด",
            en: "Profile stores no birth timezone; Thailand +07:00 was assumed. Pass tz for births abroad, otherwise the ascendant and star positions will be off.",
            zh: "檔案未存出生時區，暫以泰國 +07:00 為預設。海外出生請傳入 tz，否則命宮與星位會偏差。",
          },
        };
    const latRow = Number(row.birth_lat), lngRow = Number(row.birth_lng);
    const hasLat = row.birth_lat != null && Number.isFinite(latRow) && latRow >= -89 && latRow <= 89;
    const hasLng = row.birth_lng != null && Number.isFinite(lngRow) && lngRow >= -180 && lngRow <= 180;
    if (hasLat && hasLng) { lat = latRow; lng = lngRow; locationSource = "profile"; }
    profileOut = { id: row.id, name: row.nickname || row.name || "" };
  } else {
    const dtRaw = String(url.searchParams.get("dtUTC") || "");
    dt = dtRaw ? new Date(dtRaw) : new Date();
    const latRaw = Number(url.searchParams.get("lat"));
    const lngRaw = Number(url.searchParams.get("lng"));
    const okLat = Number.isFinite(latRaw) && latRaw >= -89 && latRaw <= 89;
    const okLng = Number.isFinite(lngRaw) && lngRaw >= -180 && lngRaw <= 180;
    if (okLat) lat = latRaw;
    if (okLng) lng = lngRaw;
    if (okLat && okLng) locationSource = "query";
  }
  if (!dt || isNaN(dt.getTime())) {
    return NextResponse.json({ ok: false, error: "bad_dtUTC" }, { status: 400 });
  }
  const reading = tianxingReading(dt, lat, lng);
  return NextResponse.json(
    // locationSource/timezone = ธงบอกที่มาให้แอพขึ้นป้ายได้ (ห้ามเงียบว่าใช้ค่าตั้งต้น)
    { ok: true, profile: profileOut, locationSource, timezone, reading },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
