/**
 * invite.ts · วงจรเชิญเพื่อน (เวฟ 4 · 24 ก.ค. 2569)
 *
 * วงจร (ตามที่เจ้านายเคาะ):
 *   1. ผู้ใช้กด "เชิญเพื่อน" ในแอพ → ได้ลิงก์ + การ์ดแชร์
 *   2. เพื่อนเปิดลิงก์บนเว็บ → หน้ารับเชิญ "คุณถูกเชิญโดย ○○"
 *   3. เพื่อน **กรอกวันเกิดของตัวเอง** (คนเชิญกรอกแทนไม่ได้)
 *   4. เพื่อนได้ดวงตัวเองฟรีทันที
 *   5. ผลไหลกลับเข้าเครือข่ายของคนเชิญ (แทนที่วันเกิดที่เคยเดา · เก็บค่าเดิมไว้ย้อนได้)
 *   6. ยามฟรี "ทั้งสองฝ่าย" ออกได้ก็ต่อเมื่ออีกฝ่ายยืนยันวันเกิดตัวเองแล้วเท่านั้น
 *
 * ⚠️ ห้ามจ่ายยามตอน "สร้างลิงก์" หรือ "ส่งลิงก์" — ปั่นได้
 * ⚠️ ไม่มีกลไกเงินใหม่: จ่ายยามผ่าน users.hour_balance + hour_transactions ของเดิม
 *    (ตัวเดียวกับ /api/mobile/v1/checkin และ payment/credit.ts)
 *    กันจ่ายซ้ำด้วย index UNIQUE เดิม `uq_hour_tx_ref_payment` บน ref_payment_id
 */
import crypto from "node:crypto";
import { q, q1, pool } from "@/lib/db";

/* ────────────────────────────────────────────────────────────────
 * ส่วนบริสุทธิ์ (ไม่แตะ DB) — ทดสอบตรงได้
 * ──────────────────────────────────────────────────────────────── */

/** ตัวอักษรโค้ด: Crockford base32 ตัดตัวที่อ่านสับสน (I L O U) ออก */
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const INVITE_CODE_LENGTH = 14;

/**
 * โค้ดเชิญ: สุ่มแบบเข้ารหัส (crypto.randomBytes) 14 ตัว ≈ 70 บิต
 * ห้ามผูกกับ user id / email / เวลา — เดาไม่ได้ ไล่ยิงไม่คุ้ม
 */
export function generateInviteCode(length = INVITE_CODE_LENGTH): string {
  const size = Math.max(10, Math.floor(length));
  const out: string[] = [];
  // rejection sampling · กัน modulo bias (256 % 32 = 0 อยู่แล้ว แต่กันเหนียวถ้าเปลี่ยน alphabet)
  const limit = Math.floor(256 / CODE_ALPHABET.length) * CODE_ALPHABET.length;
  while (out.length < size) {
    const buf = crypto.randomBytes(size * 2);
    for (const byte of buf) {
      if (byte >= limit) continue;
      out.push(CODE_ALPHABET[byte % CODE_ALPHABET.length]);
      if (out.length >= size) break;
    }
  }
  return out.join("");
}

/** ล้างโค้ดที่รับจาก URL/ผู้ใช้ · ตัวใหญ่ล้วน · เฉพาะตัวอักษรใน alphabet */
export function normalizeInviteCode(raw: unknown): string | null {
  const cleaned = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "");
  if (cleaned.length < 10 || cleaned.length > 32) return null;
  for (const ch of cleaned) if (!CODE_ALPHABET.includes(ch)) return null;
  return cleaned;
}

/** ฐาน URL ของเว็บ (ตั้งผ่าน env ได้ · ปลายทาง = หน้ารับเชิญบน referral.html) */
export function inviteBaseUrl(): string {
  const raw = process.env.PUBLIC_WEB_ORIGIN || process.env.NEXT_PUBLIC_SITE_URL || "https://hourkey.io";
  return String(raw).replace(/\/+$/, "");
}

export function inviteUrl(code: string, base = inviteBaseUrl()): string {
  return `${base}/referral?invite=${encodeURIComponent(code)}`;
}

/** ชื่อที่คนเชิญตั้งให้ตัวเอง — ห้ามดึงชื่อ/อีเมลจริงของบัญชีมาโชว์ */
export function sanitizeInviterAlias(raw: unknown): string | null {
  const cleaned = String(raw ?? "")
    .replace(/[\u0000-\u001F\u007F<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
  if (!cleaned) return null;
  if (/@/.test(cleaned)) return null; // กันเผลอใส่อีเมล
  return cleaned;
}

export type InviteSettings = {
  enabled: boolean;
  /** สร้างลิงก์ได้กี่ใบต่อวัน */
  daily_create_max: number;
  /** รับยามจากคำเชิญได้กี่ครั้งต่อวัน */
  daily_reward_max: number;
  /** รับยามจากคำเชิญได้กี่ครั้งตลอดกาล */
  lifetime_reward_max: number;
  /** ยามที่คนเชิญได้ (เมื่อเพื่อนยืนยันวันเกิดแล้ว) */
  inviter_hours: number;
  /** ยามที่เพื่อนได้ (เมื่อยืนยันวันเกิดตัวเองแล้ว + ล็อกอิน) */
  friend_hours: number;
  /** ลิงก์มีอายุกี่วัน */
  expire_days: number;
  /** กี่คำเชิญต่อ IP ต่อ 24 ชม. ถึงจะติดธง */
  ip_velocity_limit: number;
};

export const DEFAULT_INVITE_SETTINGS: InviteSettings = {
  enabled: true,
  daily_create_max: 10,
  daily_reward_max: 5,
  lifetime_reward_max: 100,
  inviter_hours: 3,
  friend_hours: 3,
  expire_days: 30,
  ip_velocity_limit: 5,
};

function intSetting(value: string | undefined, fallback: number, min = 0, max = 100000): number {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** อ่านค่าตั้งจาก app_settings (คีย์ invite_*) — ไม่มี = ใช้ค่าเริ่มต้น */
export async function getInviteSettings(): Promise<InviteSettings> {
  const rows = await q<{ key: string; value: string | null }>(
    `SELECT key, value FROM app_settings WHERE key LIKE 'invite_%'`
  ).catch(() => [] as { key: string; value: string | null }[]);
  const map = new Map(rows.map((r) => [r.key, r.value || ""]));
  return {
    enabled: (map.get("invite_enabled") || "on") === "on",
    daily_create_max: intSetting(map.get("invite_daily_create_max"), DEFAULT_INVITE_SETTINGS.daily_create_max, 0, 500),
    daily_reward_max: intSetting(map.get("invite_daily_reward_max"), DEFAULT_INVITE_SETTINGS.daily_reward_max, 0, 500),
    lifetime_reward_max: intSetting(map.get("invite_lifetime_reward_max"), DEFAULT_INVITE_SETTINGS.lifetime_reward_max, 0, 100000),
    inviter_hours: intSetting(map.get("invite_inviter_hours"), DEFAULT_INVITE_SETTINGS.inviter_hours, 0, 1000),
    friend_hours: intSetting(map.get("invite_friend_hours"), DEFAULT_INVITE_SETTINGS.friend_hours, 0, 1000),
    expire_days: intSetting(map.get("invite_expire_days"), DEFAULT_INVITE_SETTINGS.expire_days, 1, 3650),
    ip_velocity_limit: intSetting(map.get("invite_ip_velocity_limit"), DEFAULT_INVITE_SETTINGS.ip_velocity_limit, 1, 1000),
  };
}

export type CapVerdict = { ok: boolean; reason?: "daily_cap" | "lifetime_cap"; used: number; limit: number; remaining: number };

/** เพดานสร้างลิงก์ต่อวัน — บริสุทธิ์ (รับตัวเลขที่นับมาแล้ว) เพื่อทดสอบตรงได้ */
export function evaluateCreateCap(usedToday: number, settings: InviteSettings): CapVerdict {
  const limit = settings.daily_create_max;
  const used = Math.max(0, usedToday);
  const remaining = Math.max(0, limit - used);
  return used >= limit
    ? { ok: false, reason: "daily_cap", used, limit, remaining: 0 }
    : { ok: true, used, limit, remaining };
}

/** เพดานการ "จ่ายยาม" ให้คนเชิญ — ทั้งต่อวันและตลอดกาล */
export function evaluateRewardCap(rewardedToday: number, rewardedLifetime: number, settings: InviteSettings): CapVerdict {
  if (rewardedLifetime >= settings.lifetime_reward_max) {
    return {
      ok: false,
      reason: "lifetime_cap",
      used: rewardedLifetime,
      limit: settings.lifetime_reward_max,
      remaining: 0,
    };
  }
  if (rewardedToday >= settings.daily_reward_max) {
    return { ok: false, reason: "daily_cap", used: rewardedToday, limit: settings.daily_reward_max, remaining: 0 };
  }
  return {
    ok: true,
    used: rewardedToday,
    limit: settings.daily_reward_max,
    remaining: Math.max(0, settings.daily_reward_max - rewardedToday),
  };
}

export type InviteRowState = {
  status: string;
  expires_at: string | Date;
  inviter_user_id: string;
  friend_user_id: string | null;
  accepted_at: string | Date | null;
};

export type AcceptGuardVerdict =
  | { ok: true }
  | { ok: false; error: "invite_not_found" | "invite_revoked" | "invite_expired" | "already_accepted" | "self_invite" };

/**
 * ด่านตรวจก่อนรับเชิญ — บริสุทธิ์ (ทดสอบตรงได้)
 * viewerUserId = ผู้ใช้ที่ล็อกอินอยู่ตอนเปิดลิงก์ (ถ้ามี) · ใช้ตัดเคสเชิญตัวเอง
 */
export function evaluateAcceptGuard(row: InviteRowState | null, viewerUserId: string | null, now = new Date()): AcceptGuardVerdict {
  if (!row) return { ok: false, error: "invite_not_found" };
  if (row.status === "revoked") return { ok: false, error: "invite_revoked" };
  if (new Date(row.expires_at).getTime() <= now.getTime()) return { ok: false, error: "invite_expired" };
  if (row.status === "confirmed" || row.accepted_at) return { ok: false, error: "already_accepted" };
  if (viewerUserId && viewerUserId === row.inviter_user_id) return { ok: false, error: "self_invite" };
  return { ok: true };
}

export type ClaimGuardVerdict =
  | { ok: true }
  | { ok: false; error: "invite_not_found" | "not_confirmed" | "self_invite" | "already_claimed" | "friend_already_invited" };

/**
 * ด่านตรวจก่อนจ่ายยามให้ "เพื่อน" — บริสุทธิ์
 * เงื่อนไขเหล็ก: ต้อง status='confirmed' (= เพื่อนกรอกวันเกิดตัวเองแล้ว) เท่านั้น
 */
export function evaluateClaimGuard(
  row: (InviteRowState & { friend_reward_hours: number }) | null,
  claimerUserId: string,
  claimerAlreadyInvitedElsewhere: boolean
): ClaimGuardVerdict {
  if (!row) return { ok: false, error: "invite_not_found" };
  if (claimerUserId === row.inviter_user_id) return { ok: false, error: "self_invite" };
  if (row.status !== "confirmed") return { ok: false, error: "not_confirmed" };
  if (row.friend_user_id && row.friend_user_id !== claimerUserId) return { ok: false, error: "already_claimed" };
  if (row.friend_user_id === claimerUserId && row.friend_reward_hours > 0) return { ok: false, error: "already_claimed" };
  if (!row.friend_user_id && claimerAlreadyInvitedElsewhere) return { ok: false, error: "friend_already_invited" };
  return { ok: true };
}

/** วันตามเวลาไทย (ใช้สัญญาเดียวกับ checkin) */
export function thaiDay(at: Date = new Date()): string {
  return new Date(at.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
}

/* ────────────────────────────────────────────────────────────────
 * ตัวช่วยแฮช (ไม่เก็บ IP/UA ดิบ)
 * ──────────────────────────────────────────────────────────────── */

function hashAudit(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const key = process.env.AUTH_SECRET || "hourkey-invite-audit";
  return crypto.createHmac("sha256", key).update(raw).digest("hex").slice(0, 48);
}

function requestIp(req?: Request): string {
  if (!req) return "";
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  const fwd = req.headers.get("x-forwarded-for") || "";
  return (fwd.split(",")[0] || "").trim();
}

/* ────────────────────────────────────────────────────────────────
 * จ่ายยาม — ใช้กลไกเดิมล้วน (users.hour_balance + hour_transactions)
 * ──────────────────────────────────────────────────────────────── */

export type GrantResult = { ok: true; granted: number; balance_after: number } | { ok: true; granted: 0; balance_after: number; already: true } | { ok: false; error: string };

/**
 * เติมยามครั้งเดียวต่อ refId (ref_payment_id UNIQUE เดิมเป็นตัวกันซ้ำชั้นสุดท้าย)
 * ห้ามเรียกก่อนที่เงื่อนไข "อีกฝ่ายยืนยันวันเกิดแล้ว" จะเป็นจริง
 */
async function grantHoursOnce(userId: string, hours: number, refId: string, reason: string, note: string): Promise<GrantResult> {
  const amount = Math.max(0, Math.floor(hours));
  if (!userId) return { ok: false, error: "no_user" };
  if (amount === 0) {
    const cur = await q1<{ hour_balance: number }>(`SELECT hour_balance FROM users WHERE id=$1`, [userId]);
    return { ok: true, granted: 0, balance_after: Number(cur?.hour_balance ?? 0), already: true };
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const dup = await client.query(`SELECT 1 FROM hour_transactions WHERE ref_payment_id=$1 LIMIT 1`, [refId]);
    if (dup.rows[0]) {
      const cur = await client.query(`SELECT hour_balance FROM users WHERE id=$1`, [userId]);
      await client.query("COMMIT");
      return { ok: true, granted: 0, balance_after: Number(cur.rows[0]?.hour_balance ?? 0), already: true };
    }
    const bal = await client.query(
      `UPDATE users SET hour_balance = COALESCE(hour_balance,0) + $2 WHERE id=$1 RETURNING hour_balance`,
      [userId, amount]
    );
    if (!bal.rows[0]) {
      await client.query("ROLLBACK");
      return { ok: false, error: "user_not_found" };
    }
    const balanceAfter = Number(bal.rows[0].hour_balance);
    await client.query(
      `INSERT INTO hour_transactions(user_id, delta, reason, balance_after, ref_payment_id, ref_feature, note)
         VALUES ($1,$2,$3,$4,$5,'invite',$6)`,
      [userId, amount, reason, balanceAfter, refId, note.slice(0, 300)]
    );
    await client.query("COMMIT");
    return { ok: true, granted: amount, balance_after: balanceAfter };
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch { /* noop */ }
    const msg = e instanceof Error ? e.message : String(e);
    if (/uq_hour_tx_ref_payment|duplicate key/i.test(msg)) {
      const cur = await q1<{ hour_balance: number }>(`SELECT hour_balance FROM users WHERE id=$1`, [userId]);
      return { ok: true, granted: 0, balance_after: Number(cur?.hour_balance ?? 0), already: true };
    }
    return { ok: false, error: msg };
  } finally {
    client.release();
  }
}

export const inviterRewardRef = (inviteId: string) => `invite:${inviteId}:inviter`;
export const friendRewardRef = (inviteId: string) => `invite:${inviteId}:friend`;

/* ────────────────────────────────────────────────────────────────
 * สร้างคำเชิญ
 * ──────────────────────────────────────────────────────────────── */

export type CreateInviteResult =
  | { ok: true; code: string; url: string; expires_at: string; remaining_today: number }
  | { ok: false; error: string; used?: number; limit?: number; remaining?: number };

export async function createInvite(input: {
  userId: string;
  alias?: unknown;
  profileId?: unknown;
  request?: Request;
  deviceId?: unknown;
}): Promise<CreateInviteResult> {
  const settings = await getInviteSettings();
  if (!settings.enabled) return { ok: false, error: "invite_disabled" };

  const usedToday = await q1<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM invites
      WHERE inviter_user_id=$1 AND created_at >= now() - interval '24 hours'`,
    [input.userId]
  );
  const cap = evaluateCreateCap(Number(usedToday?.n || 0), settings);
  if (!cap.ok) {
    return { ok: false, error: "daily_cap_reached", used: cap.used, limit: cap.limit, remaining: 0 };
  }

  // ช่องในเครือข่ายที่จะเอาวันเกิดจริงไปแทน — ต้องเป็นดวงในองค์กรของคนเชิญ และไม่ใช่ดวงตัวเอง
  let profileId: string | null = null;
  const wantProfile = String(input.profileId ?? "").trim();
  if (wantProfile) {
    const owned = await q1<{ id: string }>(
      `SELECT p.id FROM profiles p
         JOIN users u ON u.current_org_id = p.org_id
        WHERE p.id=$1::uuid AND u.id=$2 AND p.is_archived=false
          AND COALESCE(NULLIF(btrim(p.relationship_type), ''), '') <> ''`,
      [wantProfile, input.userId]
    ).catch(() => null);
    if (!owned) return { ok: false, error: "profile_not_found_or_not_yours" };
    profileId = owned.id;
  }

  const alias = sanitizeInviterAlias(input.alias);
  const ipHash = hashAudit(requestIp(input.request));
  const deviceHash = hashAudit(input.deviceId);

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = generateInviteCode();
    try {
      const row = await q1<{ id: string; code: string; expires_at: string }>(
        `INSERT INTO invites (code, inviter_user_id, inviter_alias, inviter_profile_id,
                              created_ip_hash, created_device_hash, expires_at)
           VALUES ($1,$2,$3,$4::uuid,$5,$6, now() + ($7 || ' days')::interval)
         RETURNING id, code, expires_at`,
        [code, input.userId, alias, profileId, ipHash, deviceHash, String(settings.expire_days)]
      );
      if (row) {
        return {
          ok: true,
          code: row.code,
          url: inviteUrl(row.code),
          expires_at: new Date(row.expires_at).toISOString(),
          remaining_today: Math.max(0, cap.remaining - 1),
        };
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/ux_invites_code|duplicate key/i.test(msg)) return { ok: false, error: msg };
      // ชนโค้ดซ้ำ (โอกาสน้อยมาก) → สุ่มใหม่
    }
  }
  return { ok: false, error: "code_generation_failed" };
}

/* ────────────────────────────────────────────────────────────────
 * ดูคำเชิญแบบสาธารณะ (หน้า "คุณถูกเชิญโดย ○○")
 * ──────────────────────────────────────────────────────────────── */

export type InvitePublicView =
  | { ok: true; code: string; inviter_alias: string | null; status: string; expires_at: string; friend_hours: number }
  | { ok: false; error: string };

/** ห้ามคืนชื่อ/อีเมลจริงของบัญชี — คืนเฉพาะ alias ที่คนเชิญตั้งเอง */
export async function getInvitePublicView(rawCode: unknown, viewerUserId: string | null = null): Promise<InvitePublicView> {
  const code = normalizeInviteCode(rawCode);
  if (!code) return { ok: false, error: "invalid_code" };
  const settings = await getInviteSettings();
  const row = await q1<InviteRowState & { code: string; inviter_alias: string | null }>(
    `SELECT code, inviter_alias, status, expires_at, inviter_user_id, friend_user_id, accepted_at
       FROM invites WHERE code=$1`,
    [code]
  );
  const guard = evaluateAcceptGuard(row, viewerUserId);
  if (!guard.ok) return { ok: false, error: guard.error };
  return {
    ok: true,
    code: row!.code,
    inviter_alias: row!.inviter_alias,
    status: row!.status,
    expires_at: new Date(row!.expires_at).toISOString(),
    friend_hours: settings.friend_hours,
  };
}

/* ────────────────────────────────────────────────────────────────
 * รับเชิญ = เพื่อนกรอกวันเกิด "ของตัวเอง"
 * ──────────────────────────────────────────────────────────────── */

export type InviteBirthInput = {
  name?: unknown;
  birth_date?: unknown;   // YYYY-MM-DD
  birth_time?: unknown;   // HH:MM (ไม่มี = 3 เสา)
  birth_tz_offset?: unknown; // ชั่วโมง เช่น 7
  gender?: unknown;       // M | F
  place?: unknown;
  longitude?: unknown;
  /** ยินยอมให้ส่งวันเกิดนี้ให้ผู้เชิญไว้ดูดวงร่วมกัน (บังคับ · ด้านกฎหมาย) */
  consent?: unknown;
};

export type NormalizedBirth = {
  name: string | null;
  date: string;
  time: string | null;
  timeKnown: boolean;
  gmtOffsetHours: number;
  gender: "M" | "F" | null;
  place: string | null;
  longitude: number;
};

export type BirthParseResult = { ok: true; value: NormalizedBirth } | { ok: false; error: string };

/** ตรวจ+ล้างวันเกิดที่เพื่อนกรอกเอง (บริสุทธิ์ · ทดสอบตรงได้) */
export function parseInviteBirth(input: InviteBirthInput, now = new Date()): BirthParseResult {
  // ต้องกดยินยอมก่อน เพราะวันเกิดนี้จะไหลไปอยู่ในเครือข่ายของผู้เชิญ
  if (input.consent !== true && String(input.consent ?? "") !== "true") return { ok: false, error: "consent_required" };
  const date = String(input.birth_date ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "birth_date_required" };
  const [y, m, d] = date.split("-").map((n) => Number.parseInt(n, 10));
  if (m < 1 || m > 12 || d < 1 || d > 31) return { ok: false, error: "birth_date_invalid" };
  const asDate = new Date(Date.UTC(y, m - 1, d));
  if (asDate.getUTCFullYear() !== y || asDate.getUTCMonth() !== m - 1 || asDate.getUTCDate() !== d) {
    return { ok: false, error: "birth_date_invalid" };
  }
  if (y < 1900 || asDate.getTime() > now.getTime()) return { ok: false, error: "birth_date_out_of_range" };

  const rawTime = String(input.birth_time ?? "").trim();
  let time: string | null = null;
  if (rawTime) {
    const match = rawTime.match(/^(\d{1,2}):(\d{2})/);
    if (!match) return { ok: false, error: "birth_time_invalid" };
    const hh = Number.parseInt(match[1], 10);
    const mm = Number.parseInt(match[2], 10);
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return { ok: false, error: "birth_time_invalid" };
    time = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }

  const rawOffset = Number(input.birth_tz_offset);
  const gmtOffsetHours = Number.isFinite(rawOffset) && rawOffset >= -12 && rawOffset <= 14 ? rawOffset : 7;

  const rawGender = String(input.gender ?? "").trim().toLowerCase().charAt(0);
  const gender = rawGender === "f" ? "F" : rawGender === "m" ? "M" : null;

  const rawLng = Number(input.longitude);
  const longitude = Number.isFinite(rawLng) && rawLng >= -180 && rawLng <= 180 ? rawLng : 100.5018;

  const name = sanitizeInviterAlias(input.name);
  const place = String(input.place ?? "")
    .replace(/[\u0000-\u001F\u007F<>]/g, "")
    .trim()
    .slice(0, 160) || null;

  return {
    ok: true,
    value: { name, date, time, timeKnown: Boolean(time), gmtOffsetHours, gender, place, longitude },
  };
}

export type FreeChartView = {
  pillars: { year: string; month: string; day: string; hour: string | null };
  dayMaster: string;
  strength: { level: string; percent: number };
  structure: string | null;
  mode: "4p" | "3p";
  profile: {
    label_th: string;
    core: string;
    real_life: string;
    shadow: string;
    needs: string;
    i18n?: { en?: Record<string, string>; zh?: Record<string, string> };
  } | null;
};

/** ดวงฟรีของเพื่อน — engine เดิมล้วน (calcBazi Layer 1 + คลังโปรไฟล์วันเกิด) */
export async function buildFreeChart(birth: NormalizedBirth): Promise<FreeChartView> {
  const { calcBazi } = await import("@/lib/bazi-calc");
  const { getDaymasterProfile, attachDaymasterI18n } = await import("@/lib/daymaster-profile");
  const analysis = birth.timeKnown && birth.time
    ? await calcBazi({
        date: birth.date,
        time: birth.time,
        gmtOffsetHours: birth.gmtOffsetHours,
        longitude: birth.longitude,
        gender: birth.gender || undefined,
      })
    : await calcBazi({
        date: birth.date,
        birthTimeKnown: false,
        gmtOffsetHours: birth.gmtOffsetHours,
        longitude: birth.longitude,
        gender: birth.gender || undefined,
      });
  const rawProfile = getDaymasterProfile(analysis.dayMaster, {
    level: analysis.strength?.level,
    percent: analysis.strength?.percent,
  });
  const profile = rawProfile ? attachDaymasterI18n({ ...rawProfile }, null) : null;
  return {
    pillars: {
      year: analysis.pillarsZh.year,
      month: analysis.pillarsZh.month,
      day: analysis.pillarsZh.day,
      hour: analysis.pillarsZh.hour,
    },
    dayMaster: analysis.dayMaster,
    strength: { level: analysis.strength?.level || "", percent: Number(analysis.strength?.percent || 0) },
    structure: analysis.geJu?.structure ?? null,
    mode: analysis.mode,
    profile: profile
      ? {
          label_th: profile.label_th,
          core: profile.core,
          real_life: profile.real_life,
          shadow: profile.shadow,
          needs: profile.needs,
          i18n: profile.i18n,
        }
      : null,
  };
}

export type AcceptInviteResult =
  | {
      ok: true;
      code: string;
      chart: FreeChartView;
      /** ยามของเพื่อนรอรับหลังล็อกอิน (ยังไม่จ่ายตอนนี้) */
      friend_hours_pending: number;
      inviter_rewarded: boolean;
      flags: string[];
    }
  | { ok: false; error: string };

/**
 * เพื่อนยืนยันวันเกิดตัวเอง → บันทึก → ให้ดวงฟรี → จ่ายยาม "คนเชิญ" (ครั้งเดียว)
 * ยามฝั่งเพื่อนยังไม่จ่ายที่นี่ เพราะยังไม่มีบัญชี — รอเรียก claimInviteForUser หลังล็อกอิน
 */
export async function acceptInvite(input: {
  code: unknown;
  birth: InviteBirthInput;
  request?: Request;
  deviceId?: unknown;
  viewerUserId?: string | null;
}): Promise<AcceptInviteResult> {
  const code = normalizeInviteCode(input.code);
  if (!code) return { ok: false, error: "invalid_code" };

  const settings = await getInviteSettings();
  if (!settings.enabled) return { ok: false, error: "invite_disabled" };

  const parsed = parseInviteBirth(input.birth);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const birth = parsed.value;

  const row = await q1<InviteRowState & { id: string; inviter_profile_id: string | null }>(
    `SELECT id, status, expires_at, inviter_user_id, inviter_profile_id, friend_user_id, accepted_at
       FROM invites WHERE code=$1`,
    [code]
  );
  const guard = evaluateAcceptGuard(row, input.viewerUserId ?? null);
  if (!guard.ok) return { ok: false, error: guard.error };
  const invite = row!;

  const ipHash = hashAudit(requestIp(input.request));
  const deviceHash = hashAudit(input.deviceId) || hashAudit(`${requestIp(input.request)}|${input.request?.headers.get("user-agent") || ""}`);

  const flags: string[] = [];
  // อุปกรณ์เดียวกับตอนสร้างลิงก์ = เปิดลิงก์ตัวเอง → ยืนยันได้ แต่ไม่จ่ายยามคนเชิญ
  const created = await q1<{ created_device_hash: string | null; created_ip_hash: string | null }>(
    `SELECT created_device_hash, created_ip_hash FROM invites WHERE id=$1`,
    [invite.id]
  );
  if (deviceHash && created?.created_device_hash && deviceHash === created.created_device_hash) flags.push("same_device_as_inviter");
  if (ipHash && created?.created_ip_hash && ipHash === created.created_ip_hash) flags.push("same_ip_as_inviter");
  if (ipHash) {
    const ipCount = await q1<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM invites WHERE accepted_ip_hash=$1 AND accepted_at >= now() - interval '24 hours'`,
      [ipHash]
    );
    if (Number(ipCount?.n || 0) >= settings.ip_velocity_limit) flags.push("ip_velocity");
  }

  const birthIso = new Date(
    `${birth.date}T${birth.time || "12:00"}:00${birth.gmtOffsetHours >= 0 ? "+" : "-"}${String(Math.floor(Math.abs(birth.gmtOffsetHours))).padStart(2, "0")}:${String(Math.round((Math.abs(birth.gmtOffsetHours) % 1) * 60)).padStart(2, "0")}`
  ).toISOString();

  // บันทึกการยืนยัน (transition guard: อัปเดตได้เฉพาะแถวที่ยัง pending = กัน race รับซ้ำ)
  let confirmed: { id: string } | null = null;
  try {
    confirmed = await q1<{ id: string }>(
      `UPDATE invites
          SET status='confirmed', accepted_at=now(), accepted_ip_hash=$2, accepted_device_hash=$3,
              friend_display_name=$4, friend_birth_datetime=$5::timestamptz, friend_birth_tz=$6,
              friend_birth_time_known=$7, friend_gender=$8, friend_birth_place=$9,
              fraud_flags=$10::jsonb
        WHERE id=$1 AND status='pending' AND accepted_at IS NULL AND expires_at > now()
        RETURNING id`,
      [
        invite.id,
        ipHash,
        deviceHash,
        birth.name,
        birthIso,
        `UTC${birth.gmtOffsetHours >= 0 ? "+" : ""}${birth.gmtOffsetHours}`,
        birth.timeKnown,
        birth.gender,
        birth.place,
        JSON.stringify(flags),
      ]
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // อุปกรณ์นี้เคยยืนยันคำเชิญใบอื่นแล้ว (unique partial index)
    if (/ux_invites_accept_device/i.test(msg)) return { ok: false, error: "device_already_accepted" };
    return { ok: false, error: msg };
  }
  if (!confirmed) return { ok: false, error: "already_accepted" };

  const chart = await buildFreeChart(birth);

  // แทนที่วันเกิดที่เคยเดาในเครือข่ายของคนเชิญ (เก็บค่าเดิมไว้ย้อนได้)
  if (invite.inviter_profile_id) {
    try {
      const prev = await q1<{ birth_datetime: string; birth_source: string | null }>(
        `SELECT birth_datetime, birth_source FROM profiles WHERE id=$1`,
        [invite.inviter_profile_id]
      );
      if (prev) {
        await q(
          `UPDATE profiles
              SET birth_datetime=$2::timestamptz, birth_time_known=$3,
                  birth_source='invite_confirmed', last_verified_at=now(), updated_at=now()
            WHERE id=$1`,
          [invite.inviter_profile_id, birthIso, birth.timeKnown]
        );
        await q(
          `UPDATE invites SET prev_profile_birth_datetime=$2::timestamptz, prev_profile_birth_source=$3, profile_updated_at=now()
            WHERE id=$1`,
          [invite.id, prev.birth_datetime, prev.birth_source]
        );
      }
    } catch (e) {
      console.warn("[invite] profile backfill failed", e instanceof Error ? e.message : String(e));
    }
  }

  // จ่ายยามคนเชิญ — ถึงตรงนี้ได้แปลว่า "อีกฝ่ายยืนยันวันเกิดตัวเองแล้ว" เท่านั้น
  let inviterRewarded = false;
  if (!flags.includes("same_device_as_inviter")) {
    const rewardedToday = await q1<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM invites
        WHERE inviter_user_id=$1 AND inviter_reward_hours > 0 AND inviter_rewarded_at >= now() - interval '24 hours'`,
      [invite.inviter_user_id]
    );
    const rewardedLifetime = await q1<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM invites WHERE inviter_user_id=$1 AND inviter_reward_hours > 0`,
      [invite.inviter_user_id]
    );
    const cap = evaluateRewardCap(Number(rewardedToday?.n || 0), Number(rewardedLifetime?.n || 0), settings);
    if (cap.ok) {
      const grant = await grantHoursOnce(
        invite.inviter_user_id,
        settings.inviter_hours,
        inviterRewardRef(invite.id),
        "invite_reward_inviter",
        "invite · friend confirmed own birth"
      );
      if (grant.ok && grant.granted > 0) {
        inviterRewarded = true;
        await q(
          `UPDATE invites SET inviter_reward_hours=$2, inviter_rewarded_at=now() WHERE id=$1`,
          [invite.id, grant.granted]
        );
      }
    } else {
      flags.push(cap.reason === "lifetime_cap" ? "inviter_lifetime_cap" : "inviter_daily_cap");
      await q(`UPDATE invites SET fraud_flags=$2::jsonb WHERE id=$1`, [invite.id, JSON.stringify(flags)]).catch(() => null);
    }
  }

  return {
    ok: true,
    code,
    chart,
    friend_hours_pending: settings.friend_hours,
    inviter_rewarded: inviterRewarded,
    flags,
  };
}

/* ────────────────────────────────────────────────────────────────
 * เพื่อนล็อกอินแล้วมาขอรับยามของตัวเอง
 * ──────────────────────────────────────────────────────────────── */

export type ClaimInviteResult =
  | { ok: true; granted: number; balance_after: number; already?: true }
  | { ok: false; error: string };

export async function claimInviteForUser(input: { userId: string; code: unknown }): Promise<ClaimInviteResult> {
  const code = normalizeInviteCode(input.code);
  if (!code) return { ok: false, error: "invalid_code" };
  const settings = await getInviteSettings();
  if (!settings.enabled) return { ok: false, error: "invite_disabled" };

  const row = await q1<InviteRowState & { id: string; friend_reward_hours: number }>(
    `SELECT id, status, expires_at, inviter_user_id, friend_user_id, accepted_at, friend_reward_hours
       FROM invites WHERE code=$1`,
    [code]
  );
  // 1 บัญชี รับเชิญได้ครั้งเดียวตลอดกาล
  const already = await q1<{ id: string }>(
    `SELECT id FROM invites WHERE friend_user_id=$1 AND ($2::uuid IS NULL OR id <> $2::uuid) LIMIT 1`,
    [input.userId, row?.id ?? null]
  );
  const guard = evaluateClaimGuard(row, input.userId, Boolean(already));
  if (!guard.ok) return { ok: false, error: guard.error };
  const invite = row!;

  // ผูกบัญชีเพื่อนกับคำเชิญ (unique index กันซ้ำ) — ผูกได้ค่อยจ่าย
  if (!invite.friend_user_id) {
    try {
      const bound = await q1<{ id: string }>(
        `UPDATE invites SET friend_user_id=$2 WHERE id=$1 AND friend_user_id IS NULL RETURNING id`,
        [invite.id, input.userId]
      );
      if (!bound) return { ok: false, error: "already_claimed" };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/ux_invites_friend_user/i.test(msg)) return { ok: false, error: "friend_already_invited" };
      if (/invites_no_self_friend/i.test(msg)) return { ok: false, error: "self_invite" };
      return { ok: false, error: msg };
    }
  }

  const grant = await grantHoursOnce(
    input.userId,
    settings.friend_hours,
    friendRewardRef(invite.id),
    "invite_reward_friend",
    "invite · confirmed own birth"
  );
  if (!grant.ok) return { ok: false, error: grant.error };
  if (grant.granted > 0) {
    await q(`UPDATE invites SET friend_reward_hours=$2, friend_rewarded_at=now() WHERE id=$1`, [invite.id, grant.granted]);
  }
  return "already" in grant && grant.already
    ? { ok: true, granted: 0, balance_after: grant.balance_after, already: true }
    : { ok: true, granted: grant.granted, balance_after: grant.balance_after };
}

/* ────────────────────────────────────────────────────────────────
 * สรุปสถานะให้แอพ
 * ──────────────────────────────────────────────────────────────── */

export type InviteSummary = {
  ok: true;
  enabled: boolean;
  sent: number;
  accepted: number;
  hours_earned: number;
  remaining_today: number;
  daily_create_max: number;
  inviter_hours: number;
  friend_hours: number;
  latest: { code: string; url: string; status: string; created_at: string; expires_at: string; reward_hours: number }[];
};

export async function getInviteSummary(userId: string): Promise<InviteSummary> {
  const settings = await getInviteSettings();
  const stats = await q1<{ sent: number; accepted: number; hours_earned: number; today: number }>(
    `SELECT
       COUNT(*)::int AS sent,
       COUNT(*) FILTER (WHERE status='confirmed')::int AS accepted,
       COALESCE(SUM(inviter_reward_hours),0)::int AS hours_earned,
       COUNT(*) FILTER (WHERE created_at >= now() - interval '24 hours')::int AS today
     FROM invites WHERE inviter_user_id=$1`,
    [userId]
  );
  const latest = await q<{ code: string; status: string; created_at: string; expires_at: string; inviter_reward_hours: number }>(
    `SELECT code, status, created_at, expires_at, inviter_reward_hours
       FROM invites WHERE inviter_user_id=$1 ORDER BY created_at DESC LIMIT 20`,
    [userId]
  );
  const used = Number(stats?.today || 0);
  return {
    ok: true,
    enabled: settings.enabled,
    sent: Number(stats?.sent || 0),
    accepted: Number(stats?.accepted || 0),
    hours_earned: Number(stats?.hours_earned || 0),
    remaining_today: Math.max(0, settings.daily_create_max - used),
    daily_create_max: settings.daily_create_max,
    inviter_hours: settings.inviter_hours,
    friend_hours: settings.friend_hours,
    latest: latest.map((r) => ({
      code: r.code,
      url: inviteUrl(r.code),
      status: r.status,
      created_at: new Date(r.created_at).toISOString(),
      expires_at: new Date(r.expires_at).toISOString(),
      reward_hours: Number(r.inviter_reward_hours || 0),
    })),
  };
}

export async function revokeInvite(userId: string, rawCode: unknown): Promise<{ ok: boolean; error?: string }> {
  const code = normalizeInviteCode(rawCode);
  if (!code) return { ok: false, error: "invalid_code" };
  const row = await q1<{ id: string }>(
    `UPDATE invites SET status='revoked' WHERE code=$1 AND inviter_user_id=$2 AND status='pending' RETURNING id`,
    [code, userId]
  );
  return row ? { ok: true } : { ok: false, error: "invite_not_found" };
}
