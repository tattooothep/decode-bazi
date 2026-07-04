/**
 * GET /api/uranian-dial · ศาสตร์ที่ 6 ยูเรเนียน — ส่ง structured JSON ให้หน้าวงล้อ 90° (public/uranian.html)
 * ════════════════════════════════════════════════════════════════════════
 * additive ล้วน · display-only · ไม่แตะ engine (Layer 0-2 คงเดิม) · ไม่แตะ /api/sifu/fusion5 (LOCKED)
 *  - อ่าน engine อย่างเดียว: uranianChart() + buildUranianPacket() (import read-only)
 *  - รับ profileId (org-scoped · getSession guard) หรือ birth params ดวงชั่วคราว (guest)
 *  - คืน { points(dial90), personalPoints, halbsummen, planetaryPictures, sensitivePoints, witteTransneptunians }
 *  - rate limit + cache ต่อดวง (natal ไม่เปลี่ยน → cache ปลอดภัย) ตามกฎ scale 5,000 user
 *  - ⛔ TNP: ส่งเฉพาะชื่อ/เจ้าราศี/แหล่ง (Cupido/Hades/Kronos/Zeus) · ไม่มีตำแหน่ง (เฟส 1) · ห้ามหลุด Lefeldt/Sieggrün
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { q1 } from "@/lib/db";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { uranianChart, type Gender } from "@/lib/astro/uranian/engine";
import { buildUranianPacket } from "@/lib/astro/uranian/packet";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const DEFAULT_LAT = 13.7563;   // กรุงเทพ (convention เดียวกับ loadBirth/guest-birth)
const DEFAULT_LNG = 100.5018;

/* ── cache ต่อดวง (natal deterministic ไม่เปลี่ยน) · in-memory · TTL 10 นาที ── */
type CacheEntry = { at: number; payload: unknown };
const CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60_000;
const CACHE_MAX = 500;
function cacheGet(key: string): unknown | null {
  const e = CACHE.get(key);
  if (!e) return null;
  if (Date.now() - e.at > CACHE_TTL_MS) { CACHE.delete(key); return null; }
  return e.payload;
}
function cacheSet(key: string, payload: unknown) {
  if (CACHE.size >= CACHE_MAX) {
    // ตัด entry เก่าสุด (กัน memory โต · single-node)
    let oldestK: string | null = null; let oldestT = Infinity;
    for (const [k, v] of CACHE) { if (v.at < oldestT) { oldestT = v.at; oldestK = k; } }
    if (oldestK) CACHE.delete(oldestK);
  }
  CACHE.set(key, { at: Date.now(), payload });
}

type BirthInput = {
  dtUTC: Date;
  lat: number;
  lng: number;
  hasTime: boolean;
  gender: Gender;
  name: string;
  birthDate: string;   // YYYY-MM-DD (Asia/Bangkok · แสดงผล)
  birthTime: string;   // HH:MM (Asia/Bangkok · "12:00" เมื่อไม่ทราบเวลา)
  source: "profile" | "guest";
  profileId: string | null;
};

/** โหลดดวงจากโปรไฟล์ (org-scoped) — pattern เดียวกับ loadBirth ใน /api/sifu/fusion5 (ไม่ import เพื่อไม่ผูก LOCKED) */
async function loadProfileBirth(profileId: string, orgId: string | null): Promise<BirthInput | null> {
  const row = await q1<{
    id: string; name: string | null; nickname: string | null;
    birth_datetime: string | null; birth_lat: number | null; birth_lng: number | null;
    gender: string | null; birth_time_known: boolean | null;
  }>(
    `SELECT id, name, nickname,
            to_char(birth_datetime AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD"T"HH24:MI:SS') AS birth_datetime,
            birth_lat, birth_lng, gender, birth_time_known
     FROM profiles WHERE id=$1 AND org_id=$2 AND is_archived=false`,
    [profileId, orgId]
  );
  if (!row || !row.birth_datetime) return null;
  const dtUTC = new Date(`${row.birth_datetime}+07:00`);
  if (isNaN(dtUTC.getTime())) return null;
  const [birthDate, birthTimeRaw] = row.birth_datetime.split("T");
  const hasTime = row.birth_time_known !== false;
  return {
    dtUTC,
    lat: Number(row.birth_lat ?? DEFAULT_LAT),
    lng: Number(row.birth_lng ?? DEFAULT_LNG),
    hasTime,
    gender: (String(row.gender || "").trim().toLowerCase().charAt(0) === "f" ? "F" : "M"),
    name: (row.nickname || row.name || "โปรไฟล์").toString(),
    birthDate,
    birthTime: hasTime ? (birthTimeRaw || "12:00").slice(0, 5) : "12:00",
    source: "profile",
    profileId: row.id,
  };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
function isRealDate(s: string): boolean {
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** ดวงชั่วคราว (guest) จาก query params — validate เอง (ไม่เขียน DB · ไม่ผูก guest-birth LOCKED flow) */
function parseGuestBirth(url: URL): { ok: true; birth: BirthInput } | { ok: false; error: string } {
  const birthDate = String(url.searchParams.get("birthDate") || url.searchParams.get("birth_date") || "").trim();
  if (!ISO_DATE.test(birthDate) || !isRealDate(birthDate)) return { ok: false, error: "bad_birth_date" };
  const todayISO = new Date().toISOString().slice(0, 10);
  if (birthDate < "1900-01-01" || birthDate > todayISO) return { ok: false, error: "birth_date_out_of_range" };

  const timeRaw = String(url.searchParams.get("birthTime") || url.searchParams.get("birth_time") || "").trim();
  const hasTime = !!timeRaw && HHMM.test(timeRaw);
  const birthTime = hasTime ? timeRaw : "12:00";

  const g = String(url.searchParams.get("gender") || "").trim().toLowerCase().charAt(0);
  const gender: Gender = g === "f" ? "F" : "M";

  let lat = DEFAULT_LAT, lng = DEFAULT_LNG;
  const latRaw = url.searchParams.get("lat");
  const lngRaw = url.searchParams.get("lng");
  if (latRaw !== null && latRaw !== "") {
    const v = Number(latRaw);
    if (!Number.isFinite(v) || v < -90 || v > 90) return { ok: false, error: "bad_lat" };
    lat = v;
  }
  if (lngRaw !== null && lngRaw !== "") {
    const v = Number(lngRaw);
    if (!Number.isFinite(v) || v < -180 || v > 180) return { ok: false, error: "bad_lng" };
    lng = v;
  }
  const dtUTC = new Date(`${birthDate}T${birthTime}:00+07:00`);
  if (isNaN(dtUTC.getTime())) return { ok: false, error: "bad_datetime" };
  const name = String(url.searchParams.get("name") || "").trim().slice(0, 40) || "ดวงชั่วคราว";
  return { ok: true, birth: { dtUTC, lat, lng, hasTime, gender, name, birthDate, birthTime, source: "guest", profileId: null } };
}

function buildPayload(birth: BirthInput) {
  const chart = uranianChart(birth.dtUTC, birth.lat, birth.lng, birth.hasTime, birth.gender);
  // auslosung=null: หน้าวงล้อ = natal ล้วน (ชั้นเวลา = feature #7 · ไม่อยู่ใน scope นี้)
  const packet = buildUranianPacket(chart, null);
  return {
    ok: true as const,
    meta: {
      name: birth.name,
      source: birth.source,
      profileId: birth.profileId,
      birthDate: birth.birthDate,
      birthTime: birth.birthTime,
      hasBirthTime: packet.hasBirthTime,
      degradeLevel: packet.degradeLevel,
      gender: packet.gender,
      moonUncertainty: packet.moonUncertainty,
      dtUTC: birth.dtUTC.toISOString(),
      lat: birth.lat,
      lng: birth.lng,
    },
    orbPictureDeg: packet.orbPictureDeg,
    orbSensitiveDeg: packet.orbSensitiveDeg,
    nodeType: packet.nodeType,
    tnpPositionSource: packet.tnpPositionSource,
    excludedTransneptunians: packet.excludedTransneptunians,
    notAvailable: packet.notAvailable,
    data: {
      points: packet.data.points,
      personalPoints: packet.data.personalPoints,
      halbsummen: packet.data.halbsummen,
      planetaryPictures: packet.data.planetaryPictures,
      sensitivePoints: packet.data.sensitivePoints,
      witteTransneptunians: packet.data.witteTransneptunians,
    },
  };
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Login required" }, { status: 401, headers: NO_STORE });

  const rl = rateLimit(`uranian-dial:${session.userId}:${clientIp(req)}`, 40, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ ok: false, error: "rate_limited", retryAfterMs: rl.retryAfterMs }, { status: 429, headers: NO_STORE });
  }

  try {
    const url = new URL(req.url);
    const profileId = String(url.searchParams.get("profileId") || url.searchParams.get("profile_id") || "").trim();

    let birth: BirthInput | null = null;
    let cacheKey = "";

    if (profileId) {
      cacheKey = `p:${session.orgId || "-"}:${profileId}`;
      const cached = cacheGet(cacheKey);
      if (cached) return NextResponse.json(cached, { headers: NO_STORE });
      birth = await loadProfileBirth(profileId, session.orgId || null);
      if (!birth) return NextResponse.json({ ok: false, error: "profile_not_found" }, { status: 404, headers: NO_STORE });
    } else if (url.searchParams.get("birthDate") || url.searchParams.get("birth_date")) {
      const g = parseGuestBirth(url);
      if (!g.ok) return NextResponse.json({ ok: false, error: g.error }, { status: 400, headers: NO_STORE });
      birth = g.birth;
      cacheKey = `g:${birth.birthDate}:${birth.birthTime}:${birth.hasTime ? 1 : 0}:${birth.gender}:${birth.lat}:${birth.lng}`;
      const cached = cacheGet(cacheKey);
      if (cached) return NextResponse.json(cached, { headers: NO_STORE });
    } else {
      return NextResponse.json({ ok: false, error: "missing_profileId_or_birth" }, { status: 400, headers: NO_STORE });
    }

    const payload = buildPayload(birth);
    if (cacheKey) cacheSet(cacheKey, payload);
    return NextResponse.json(payload, { headers: NO_STORE });
  } catch (e) {
    console.error("[uranian-dial]", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ ok: false, error: "uranian_dial_failed" }, { status: 500, headers: NO_STORE });
  }
}
