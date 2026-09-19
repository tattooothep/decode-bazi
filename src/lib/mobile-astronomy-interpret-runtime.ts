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
  generate: (input: { facts: unknown; natal: unknown; dailyTone: unknown; previousPeriod?: unknown; profileName: string }) => Promise<{ locales: Locales; model: string; factsDigest: string }>;
  /** มุมดาวของยาม (ฉีด transitHits ของ lib) — ใช้ตัดสิน "ไม่มีอะไรเปลี่ยน" แบบกำหนดแน่นอน ไม่พึ่ง AI · ไม่ส่ง = ไม่มีการข้ามยาม */
  hits?: (facts: unknown, natal: unknown) => ReadonlyArray<{ transit: string; natal: string; aspect: string; pace: string }>;
  fetchImpl?: typeof fetch;
}>;

type StoredLocales = Locales & { _sig?: string; _unchanged?: boolean };
type Resolved = Readonly<{ copy: Copy | null; unchanged: boolean }>;

export function pickLocale(subscriptionLocale: string): "th" | "en" | "zh" {
  const l = String(subscriptionLocale || "th").toLowerCase();
  if (l.startsWith("th")) return "th";
  if (l.startsWith("zh") || l.startsWith("cn")) return "zh";
  return "en";
}

export function createAstronomyInterpretDep(deps: InterpretRuntimeDeps) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  // suppress() ถูกถามก่อนจองส่ง แล้ว interpret() ถูกถามอีกครั้งหลังจอง — ใช้ผลเดียวกัน ไม่ยิง AI ซ้ำ
  const inflight = new Map<string, Promise<Resolved>>();
  const resolveOnce = (occurrenceId: string, admission: AstronomyDispatchAdmissionRow): Promise<Resolved> => {
    const key = `${occurrenceId}:${admission.userId}:${pickLocale(admission.locale)}`;
    let pending = inflight.get(key);
    if (!pending) {
      pending = resolve(occurrenceId, admission).catch(() => ({ copy: null, unchanged: false }));
      inflight.set(key, pending);
    }
    return pending;
  };
  const interpret = async (occurrenceId: string, admission: AstronomyDispatchAdmissionRow): Promise<Copy | null> =>
    (await resolveOnce(occurrenceId, admission)).copy;
  const suppress = async (occurrenceId: string, admission: AstronomyDispatchAdmissionRow): Promise<boolean> =>
    (await resolveOnce(occurrenceId, admission)).unchanged;
  return Object.assign(interpret, { suppress });

  async function resolve(occurrenceId: string, admission: AstronomyDispatchAdmissionRow): Promise<Resolved> {
    const locale = pickLocale(admission.locale);
    const { pool } = deps;
    const none: Resolved = { copy: null, unchanged: false };
    // มีแล้ว = ใช้เดิม (snapshot ต่อยามต้องเสถียร ไม่แปลซ้ำทุกครั้งที่ retry)
    try {
      const existing = await pool.query<{ locales: StoredLocales }>(
        `SELECT locales FROM mobile_astronomy_interpretations_r8 WHERE occurrence_id=$1::uuid AND user_id=$2::uuid`,
        [occurrenceId, admission.userId],
      );
      const found = existing.rows[0]?.locales;
      if (found && found[locale]) return { copy: { title: found[locale].title, body: found[locale].body }, unchanged: found._unchanged === true };
    } catch {
      return none; // ตารางยังไม่ apply / DB สะดุด — ข้อความคงที่ไปก่อน ไม่เสียค่า AI
    }

    // facts ของยามนี้
    const occ = await pool.query<{ snapshot: { facts?: unknown } }>(
      `SELECT snapshot FROM mobile_science_notification_occurrences WHERE id=$1::uuid`,
      [occurrenceId],
    );
    const facts = occ.rows[0]?.snapshot?.facts;
    if (!facts || typeof facts !== "object") return none;

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
    if (!user || !user.profile_id) return none;

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
            .map((s: { key: string; lonTrop: number; th?: string }) => ({
              // ไม่ส่ง signTh ของ engine (นิรายนะ) — ตัว prompt คิดราศีสายันจาก lon เองให้ตรงระบบเดียวกับตารางฟ้า
              key: s.key, th: s.th, lon: Math.round(Number(s.lonTrop) * 10) / 10,
            })),
          // 七政 ใช้บอกแค่ "ดาวไหนคือดาวหลักของดวง" — ขั้วดี/ร้ายตัดสินด้วยมุมแบบตะวันตกอย่างเดียว (ผลตรวจ 19 ก.ย.:
          // ส่งป้าย 恩/難 ไปด้วยทำให้สองตำราขัดกัน เช่น ศุกร์เป็น 仇星 ของดาวหลักแต่คำอ่านบอกว่า "หนุน")
          keyPlanet: reading.yongshen ? { key: reading.yongshen.key, statusTh: reading.yongshen.statusTh } : null,
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
        `SELECT summary FROM mobile_daily_ai_summaries WHERE user_id=$1::uuid AND profile_id=$3::uuid AND forecast_date=$2::date AND status='ready' LIMIT 1`,
        [admission.userId, localDate, user.profile_id],
      );
      const th = tone.rows[0]?.summary?.th;
      if (th) dailyTone = { pushTitle: th.pushTitle, verdict: th.verdict };
    } catch {
      dailyTone = null;
    }

    // ── "ไม่มีอะไรเปลี่ยน = ไม่เด้ง": ไม่มีมุมจันทร์ในยามนี้ + ฉากหลัง (มุมดาวช้า) ชุดเดิมกับยามก่อนหน้า 2 ชม. ──
    // ตัดสินจากเรขาคณิตล้วน · ไม่ข้ามสองยามติดกัน (กันเงียบยาวจนดูเหมือนระบบพัง) · ยามแรกของวันส่งเสมอ (ยามก่อนเป็นช่วงเงียบ ไม่มีคำอ่าน)
    let signature = "";
    if (deps.hits && Array.isArray((natal as { bodies?: unknown[] }).bodies) && (natal as { bodies: unknown[] }).bodies.length > 0) {
      try {
        const hits = deps.hits(facts, natal);
        const fastCount = hits.filter((h) => h.pace === "fast_this_period").length;
        signature = hits.filter((h) => h.pace !== "fast_this_period").map((h) => `${h.transit}>${h.natal}:${h.aspect}`).sort().join("|");
        if (fastCount === 0 && signature) {
          const before = await pool.query<{ locales: StoredLocales }>(
            `SELECT i.locales FROM mobile_astronomy_interpretations_r8 i
               JOIN mobile_science_notification_occurrences prev ON prev.id=i.occurrence_id
               JOIN mobile_science_notification_occurrences cur ON cur.id=$2::uuid AND cur.chain_id=prev.chain_id
              WHERE i.user_id=$1::uuid AND prev.scheduled_for = cur.scheduled_for - interval '2 hours'`,
            [admission.userId, occurrenceId],
          );
          const prior = before.rows[0]?.locales;
          if (prior && prior._sig === signature && prior._unchanged !== true && prior.th && prior.en && prior.zh) {
            const carried: StoredLocales = { th: prior.th, en: prior.en, zh: prior.zh, _sig: signature, _unchanged: true };
            await pool.query(
              `INSERT INTO mobile_astronomy_interpretations_r8 (occurrence_id, user_id, locales, model, facts_digest)
               VALUES ($1::uuid, $2::uuid, $3::jsonb, 'carried-unchanged', repeat('0',64))
               ON CONFLICT (occurrence_id) DO NOTHING`,
              [occurrenceId, admission.userId, JSON.stringify(carried)],
            );
            return { copy: { title: prior[locale].title, body: prior[locale].body }, unchanged: true };
          }
        }
      } catch {
        signature = "";
      }
    }

    // ยามก่อนหน้าในวันเดียวกัน (กันซ้ำ): หัวข้อ + คำแนะนำหลัก th ของคำอ่านล่าสุดของ user ภายใน 6 ชั่วโมง
    let previousPeriod: unknown = null;
    try {
      const prev = await pool.query<{ locales: Locales }>(
        `SELECT i.locales FROM mobile_astronomy_interpretations_r8 i
          WHERE i.user_id=$1::uuid AND i.occurrence_id<>$2::uuid AND i.created_at > now() - interval '6 hours'
          ORDER BY i.created_at DESC LIMIT 1`,
        [admission.userId, occurrenceId],
      );
      const th = prev.rows[0]?.locales?.th;
      if (th) previousPeriod = { title: th.title, body: th.body, doList: th.doList, avoidList: th.avoidList };
    } catch {
      previousPeriod = null;
    }

    let generated: { locales: Locales; model: string; factsDigest: string };
    try {
      generated = await deps.generate({ facts, natal, dailyTone, previousPeriod, profileName: user.profile_name || "" });
    } catch {
      return none;
    }
    try {
      await pool.query(
        `INSERT INTO mobile_astronomy_interpretations_r8 (occurrence_id, user_id, locales, model, facts_digest)
         VALUES ($1::uuid, $2::uuid, $3::jsonb, $4, $5)
         ON CONFLICT (occurrence_id) DO NOTHING`,
        [occurrenceId, admission.userId, JSON.stringify(signature ? { ...generated.locales, _sig: signature } : generated.locales), generated.model, generated.factsDigest],
      );
    } catch {
      /* เก็บไม่ได้ก็ยังส่งข้อความตีความได้ในรอบนี้ */
    }
    const entry = generated.locales[locale];
    return { copy: entry ? { title: entry.title, body: entry.body } : null, unchanged: false };
  }
}
