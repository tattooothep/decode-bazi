/**
 * ตีความดาวจริงรายยาม — ตัวประกอบข้อมูลจริงให้ generateAstronomyInterpretation (18 ก.ย. 2569)
 *
 * ต่อเป็น deps.interpret ของ dispatch: รับ occurrenceId + admission → ประกอบ
 *  · facts ของยาม (snapshot ใน occurrences — ตัวเลข engine ล้วน)
 *  · ดวงกำเนิดย่อ (ดาว 7+4 องศา/ถอยหลัง/สถานะ + ลัคนา + 用神 จาก /api/mobile/v1/tianxing)
 *  · น้ำเสียงสรุปดวงเช้าของวัน (mobile_daily_ai_summaries th)
 * → AI แปล 3 ภาษา → เก็บ mobile_astronomy_interpretations_r8 → คืน title/body ตาม locale
 * ทุกทางล้ม = null (dispatch ใช้ข้อความคงที่ — การส่งไม่หยุด · เขียนซ้ำไม่ได้: มีแถวแล้วอ่านคืน)
 */
import type { Pool } from "pg";
import type { AstronomyDispatchAdmissionRow } from "./mobile-astronomy-dispatch-r8";

type Copy = Readonly<{ title: string; body: string }>;
type Locales = Readonly<Record<"th" | "en" | "zh", Readonly<{ title: string; body: string; meaning: string; doList: readonly string[]; avoidList: readonly string[] }>>>;

export type InterpretRuntimeDeps = Readonly<{
  pool: Pool;
  /** base ของ API ภายใน เช่น http://127.0.0.1:3350 */
  base: string;
  /** สร้าง JWT ของ user แบบเดียวกับ cron รายวัน (signSession) */
  signSession: (user: { id: string; email: string; current_org_id: string | null; session_version: number | null }) => string;
  /** ตัวสร้างคำตีความ (ฉีดได้เพื่อเทส) */
  generate: (input: { facts: unknown; natal: unknown; dailyTone: unknown; profileName: string }) => Promise<{ locales: Locales; model: string; factsDigest: string }>;
  fetchImpl?: typeof fetch;
}>;

export function pickLocale(subscriptionLocale: string): "th" | "en" | "zh" {
  const l = String(subscriptionLocale || "th").toLowerCase();
  if (l.startsWith("th")) return "th";
  if (l.startsWith("zh") || l.startsWith("cn")) return "zh";
  return "en";
}

export function createAstronomyInterpretDep(deps: InterpretRuntimeDeps) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  return async (occurrenceId: string, admission: AstronomyDispatchAdmissionRow): Promise<Copy | null> => {
    const locale = pickLocale(admission.locale);
    const { pool } = deps;
    // มีแล้ว = ใช้เดิม (snapshot ต่อยามต้องเสถียร ไม่แปลซ้ำทุกครั้งที่ retry)
    try {
      const existing = await pool.query<{ locales: Locales }>(
        `SELECT locales FROM mobile_astronomy_interpretations_r8 WHERE occurrence_id=$1::uuid AND user_id=$2::uuid`,
        [occurrenceId, admission.userId],
      );
      const found = existing.rows[0]?.locales;
      if (found && found[locale]) return { title: found[locale].title, body: found[locale].body };
    } catch (error) {
      if ((error as { code?: string })?.code !== "42P01") return null;
      return null; // ตารางยังไม่ apply — ข้อความคงที่ไปก่อน
    }

    // facts ของยามนี้
    const occ = await pool.query<{ snapshot: { facts?: unknown } }>(
      `SELECT snapshot FROM mobile_science_notification_occurrences WHERE id=$1::uuid`,
      [occurrenceId],
    );
    const facts = occ.rows[0]?.snapshot?.facts;
    if (!facts || typeof facts !== "object") return null;

    // user + โปรไฟล์ดวงตัวเอง (ตรรกะเดียวกับ cron รายวัน)
    const userRow = await pool.query<{ id: string; email: string; current_org_id: string | null; session_version: number | null; profile_id: string | null; profile_name: string | null }>(
      `SELECT u.id, u.email, u.current_org_id, u.session_version,
              (SELECT p.id FROM profiles p WHERE p.created_by_user_id = u.id AND p.org_id = u.current_org_id
                 AND COALESCE(p.is_archived,false)=false
                 ORDER BY (p.relationship_type IS NULL OR btrim(p.relationship_type::text)='') DESC, p.created_at ASC LIMIT 1) AS profile_id,
              (SELECT COALESCE(p.nickname, p.name) FROM profiles p WHERE p.created_by_user_id = u.id AND p.org_id = u.current_org_id
                 AND COALESCE(p.is_archived,false)=false
                 ORDER BY (p.relationship_type IS NULL OR btrim(p.relationship_type::text)='') DESC, p.created_at ASC LIMIT 1) AS profile_name
         FROM users u WHERE u.id=$1::uuid`,
      [admission.userId],
    );
    const user = userRow.rows[0];
    if (!user || !user.profile_id) return null;

    // ดวงกำเนิดย่อจาก tianxing (ดาวจริงกำเนิด · ลัคนา · 用神)
    let natal: unknown = null;
    try {
      const token = deps.signSession(user);
      const res = await fetchImpl(`${deps.base}/api/mobile/v1/tianxing?profileId=${user.profile_id}`, {
        headers: { Authorization: `Bearer ${token}`, Cookie: `decode_auth=${token}` },
        signal: AbortSignal.timeout(15_000),
      });
      const data = res.ok ? await res.json().catch(() => null) : null;
      const reading = data && data.ok !== false ? data.reading : null;
      if (reading && typeof reading === "object") {
        const stars = Array.isArray(reading.stars) ? reading.stars : [];
        natal = {
          bodies: stars
            .filter((s: { key?: unknown; lonTrop?: unknown }) => typeof s?.key === "string" && Number.isFinite(Number(s?.lonTrop)))
            .map((s: { key: string; lonTrop: number; retro?: boolean; signTh?: string; statusTh?: string; th?: string }) => ({
              key: s.key, th: s.th, lon: Math.round(Number(s.lonTrop) * 10) / 10, signTh: s.signTh, retro: s.retro === true, statusTh: s.statusTh,
            })),
          ascendant: reading.ascendant ? { signTh: reading.ascendant.signTh, lon: reading.ascendant.lonTrop } : null,
          yongshen: reading.yongshen ? { key: reading.yongshen.key, th: reading.yongshen.th, statusTh: reading.yongshen.statusTh } : null,
          helpfulStars: Array.isArray(reading.en_stars) ? reading.en_stars.map((s: { key: string }) => s.key) : [],
          harmfulStars: Array.isArray(reading.nan_stars) ? reading.nan_stars.map((s: { key: string }) => s.key) : [],
          level: reading.level ?? null,
          verdictTh: reading.verdictTh?.th ?? null,
        };
      }
    } catch {
      natal = null;
    }
    if (!natal) natal = { bodies: [] };

    // น้ำเสียงสรุปดวงเช้าของวันนี้ (ถ้ามี)
    let dailyTone: unknown = null;
    try {
      const localDate = String((facts as { localBoundary?: string }).localBoundary || "").slice(0, 10);
      const tone = await pool.query<{ summary: { th?: { pushTitle?: string; verdict?: string } } }>(
        `SELECT summary FROM mobile_daily_ai_summaries WHERE user_id=$1::uuid AND forecast_date=$2::date AND status='ready' LIMIT 1`,
        [admission.userId, localDate],
      );
      const th = tone.rows[0]?.summary?.th;
      if (th) dailyTone = { pushTitle: th.pushTitle, verdict: th.verdict };
    } catch {
      dailyTone = null;
    }

    let generated: { locales: Locales; model: string; factsDigest: string };
    try {
      generated = await deps.generate({ facts, natal, dailyTone, profileName: user.profile_name || "" });
    } catch {
      return null;
    }
    try {
      await pool.query(
        `INSERT INTO mobile_astronomy_interpretations_r8 (occurrence_id, user_id, locales, model, facts_digest)
         VALUES ($1::uuid, $2::uuid, $3::jsonb, $4, $5)
         ON CONFLICT (occurrence_id) DO NOTHING`,
        [occurrenceId, admission.userId, JSON.stringify(generated.locales), generated.model, generated.factsDigest],
      );
    } catch {
      /* เก็บไม่ได้ก็ยังส่งข้อความตีความได้ในรอบนี้ */
    }
    const entry = generated.locales[locale];
    return entry ? { title: entry.title, body: entry.body } : null;
  };
}
