// helpers ล้วน (pure) ของเส้น "เป้าหมายส่วนตัว + ฤกษ์มงคล" — แยกไฟล์เพื่อเทสได้โดยไม่แตะ DB/AI
// ใช้โดย route.ts ข้างกัน + scripts/test-custom-goals-unit.mts
// ⚠️ ห้าม import DB/fetch/next ในไฟล์นี้ — ต้อง pure เท่านั้น

export const MAX_GOALS = 8;
export const MAX_TITLE_LEN = 60;

/** ชื่อเป้าหมาย: trim + ตัดตัวควบคุม · 1..60 ตัวอักษร (นับ code point กัน emoji/สระไทยเพี้ยน) · เกิน/ว่าง = null */
export function cleanGoalTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const text = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (Array.from(text).length > MAX_TITLE_LEN) return null;
  return text;
}

/** uuid v1-v5 (แบบเดียวกับ datepick/input.ts) · ไม่ตรง = null */
export function cleanGoalUuid(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim().replace(/^hk_/, "") : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text.toLowerCase()
    : null;
}

/** วันตามเวลาไทย tz+7 (สัญญาเดียวกับ checkin/route.ts) */
export function thaiDay(offsetDays = 0, nowMs = Date.now()): string {
  return new Date(nowMs + 7 * 3600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

/** Local civil date for notification/API adapters; invalid zones fail closed. */
export function localCivilDay(timezone: string, instant: Date, offsetDays = 0): string | null {
  try {
    const shifted = new Date(instant.valueOf() + offsetDays * 86_400_000);
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(shifted);
  } catch {
    return null;
  }
}

/* ── จำแนกประเภท: map ผลจาก /api/activity-classify → activity ของ engine ── */

export type ClassifyResponse = {
  activity?: unknown;
  profile_key?: unknown;
  source?: unknown;
  confidence?: unknown;
};

/** โครงย่อของ ActivityProfile (src/lib/luck-engine/activity-profiles.ts) ที่ helper นี้ใช้ */
export type ActivityProfileLite = {
  key: string;
  labelTh: string;
  labelZh: string;
  baseActivityType: string;
};

export type GoalActivity = {
  activityKey: string; // = activityProfileKey ของ engine เช่น debt_followup
  baseActivityType: string; // ตัวจีนที่ /api/auspicious ต้องการ เช่น 求財
  label: { th: string; zh: string; en: string };
  classify: { key: string | null; source: string | null; confidence: number | null };
};

/**
 * map ผล classify → activity ของ engine
 * lookup = getActivityProfile (ฉีดเข้ามาให้เทส mock ได้) · labelEn = profileLabelEn
 * profile_key ไม่รู้จัก/ไม่มี = null (ห้ามปั้นเอง — ให้ caller ตอบ classify_failed)
 */
export function mapClassifyToActivity<P extends ActivityProfileLite>(
  resp: ClassifyResponse | null | undefined,
  lookup: (key: unknown) => P | null,
  labelEn: (profile: P) => string
): GoalActivity | null {
  if (!resp || typeof resp !== "object") return null;
  const profileKey = typeof resp.profile_key === "string" ? resp.profile_key.trim() : "";
  const profile = profileKey ? lookup(profileKey) : null;
  if (!profile) return null;
  const conf = Number(resp.confidence);
  return {
    activityKey: profile.key,
    baseActivityType: profile.baseActivityType,
    label: { th: profile.labelTh, zh: profile.labelZh, en: labelEn(profile) },
    classify: {
      key: typeof resp.activity === "string" ? resp.activity : null,
      source: typeof resp.source === "string" ? resp.source : null,
      confidence: Number.isFinite(conf) ? conf : null,
    },
  };
}

/* ── อ่านผลจาก /api/auspicious (LOCKED · เรียกอย่างเดียว) — ทุกค่าจาก engine จริง หาไม่ได้ = null ── */

/** โครงย่อ candidate ของ /api/auspicious (rowToCandidate + combineScores) */
export type EngineCandidate = {
  datetime?: { start?: unknown; end?: unknown } | null;
  calendar?: { gregorianDate?: unknown } | null;
  scoring?: { finalScore?: unknown } | null;
};

const TH_WEEKDAYS = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** ป้ายวันไทยจาก YYYY-MM-DD (แค่ format วันที่ของ engine · ไม่ใช่ค่าปั้น) เช่น "พ. 22 ก.ค." */
export function formatThaiDayLabel(date: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || "");
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== date) return null;
  return `${TH_WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${TH_MONTHS[d.getUTCMonth()]}`;
}

/** "YYYY-MM-DD HH:MM:SS" (Asia/Bangkok · จาก aj_ephemeris_cache) → epoch ms · เพี้ยน = null */
export function parseBangkokDatetime(value: unknown): number | null {
  const text = typeof value === "string" ? value.trim() : "";
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2})?/.exec(text);
  if (!m) return null;
  const ms = Date.parse(`${m[1]}T${m[2]}:00+07:00`);
  return Number.isFinite(ms) ? ms : null;
}

function hhmm(value: unknown): string | null {
  const m = /[T ](\d{2}:\d{2})/.exec(typeof value === "string" ? value : "");
  return m ? m[1] : null;
}

export type NextAuspicious = {
  date: string;
  dayLabel: string | null;
  hourRange: string | null;
  score: number;
};

/**
 * ฤกษ์ดีถัดไป = slot ที่ engine แนะนำ (ผ่าน hard filter + veto แล้ว) ที่ "ยังไม่ผ่านไป" และเร็วที่สุด
 * candidates จาก /api/auspicious (เรียงคะแนน) → กรอง start >= nowMs → เลือก start เร็วสุด
 * ไม่มีเลย/ข้อมูลขาด = null (ห้ามปั้น)
 */
export function pickNextAuspicious(candidates: unknown, nowMs: number): NextAuspicious | null {
  if (!Array.isArray(candidates)) return null;
  let best: { startMs: number; out: NextAuspicious } | null = null;
  for (const raw of candidates as EngineCandidate[]) {
    if (!raw || typeof raw !== "object") continue;
    const startMs = parseBangkokDatetime(raw.datetime?.start);
    if (startMs == null || startMs < nowMs) continue;
    const score = Number(raw.scoring?.finalScore);
    if (!Number.isFinite(score)) continue; // ไม่มีคะแนนจริงจาก engine = ไม่เอา
    const date =
      typeof raw.calendar?.gregorianDate === "string" && /^\d{4}-\d{2}-\d{2}/.test(raw.calendar.gregorianDate)
        ? raw.calendar.gregorianDate.slice(0, 10)
        : String(raw.datetime?.start).slice(0, 10);
    const start = hhmm(raw.datetime?.start);
    const end = hhmm(raw.datetime?.end);
    const out: NextAuspicious = {
      date,
      dayLabel: formatThaiDayLabel(date),
      hourRange: start && end ? `${start}-${end}` : null,
      score,
    };
    if (!best || startMs < best.startMs) best = { startMs, out };
  }
  return best ? best.out : null;
}

/**
 * คะแนนวันนี้ = finalScore สูงสุดของ slot วันนี้ที่ engine ให้ผ่าน (จาก call ช่วงวันนี้วันเดียว)
 * ไม่มี slot ผ่านเลย (โดนตัด/veto ทั้งวัน) = null
 */
export function todayScoreFrom(candidates: unknown, today: string): number | null {
  if (!Array.isArray(candidates)) return null;
  let best: number | null = null;
  for (const raw of candidates as EngineCandidate[]) {
    if (!raw || typeof raw !== "object") continue;
    const date =
      typeof raw.calendar?.gregorianDate === "string"
        ? raw.calendar.gregorianDate.slice(0, 10)
        : typeof raw.datetime?.start === "string"
          ? raw.datetime.start.slice(0, 10)
          : "";
    if (date !== today) continue;
    const score = Number(raw.scoring?.finalScore);
    if (!Number.isFinite(score)) continue;
    if (best == null || score > best) best = score;
  }
  return best;
}

/** key cache ใน memory · ตามสเปค: activity + profile + วัน (TTL 1 ชม. จัดการที่ route) */
export function goalCacheKey(activityKey: string, profileId: string | null, day: string): string {
  return `${activityKey}|${profileId || "universal"}|${day}`;
}
