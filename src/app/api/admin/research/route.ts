import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { q, q1 } from "@/lib/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

function cleanUuid(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return UUID_RE.test(s) ? s : null;
}

function cleanStatus(v: unknown): string {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return [
    "pending",
    "verbal_consent",
    "declined",
    "withdrawn",
    "watch",
    "done",
    "test",
    "excluded",
    /* legacy values kept readable for old rows */
    "active",
    "paused",
  ].includes(s) ? s : "pending";
}

function cleanText(v: unknown, max = 500): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

export async function GET(req: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return e instanceof Response ? e : NextResponse.json({ error: "auth" }, { status: 401 });
  }

  const url = new URL(req.url);
  const daysRaw = Number(url.searchParams.get("days") || 30);
  const days = Math.max(1, Math.min(365, Number.isFinite(daysRaw) ? Math.floor(daysRaw) : 30));
  const limitRaw = Number(url.searchParams.get("limit") || 80);
  const limit = Math.max(20, Math.min(500, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 80));
  const search = (url.searchParams.get("q") || "").trim();
  const orgParam = admin.role === "env_admin" ? cleanUuid(url.searchParams.get("org")) : null;
  const scopeOrgId = admin.role === "env_admin" ? orgParam : (admin.orgId || null);
  const searchLike = search ? `%${search}%` : null;

  try {

  const summary = await q1<{
    users_total: number;
    users_recent: number;
    participants_total: number;
    consent_pending_total: number;
    consent_granted_total: number;
    test_users_total: number;
    real_users_total: number;
    profiles_total: number;
    qna_total: number;
    qna_recent: number;
    events_recent: number;
  }>(
     `WITH scoped_users AS (
       SELECT u.id, u.email, u.phone,
              (
                u.email LIKE 'sim_%@decode.test'
                OR u.email LIKE '%@decode.local'
                OR u.email LIKE '%@test.local'
                OR u.email LIKE '%test%@hourkey.io'
                OR u.email LIKE '%@deadbeef.local'
                OR u.email LIKE 'dummy_%'
                OR u.email LIKE 'cookie_test_%'
                OR u.email LIKE 'htmlform_%'
                OR u.email LIKE 'profile-test@%'
                OR u.email LIKE '%@decode.app'
                OR COALESCE(u.phone, '') LIKE '089999999%'
              ) AS is_test_account
       FROM users u
       WHERE ($1::uuid IS NULL
          OR u.current_org_id=$1::uuid
          OR EXISTS (SELECT 1 FROM org_members om WHERE om.user_id=u.id AND om.org_id=$1::uuid AND om.status='active'))
     ),
     participant_state AS (
       SELECT
         rp.user_id,
         CASE
           WHEN rp.status='active' AND rp.notes='Backfilled from existing users on 2026-06-03' THEN 'pending'
           ELSE COALESCE(rp.status, 'pending')
         END AS normalized_status
       FROM research_participants rp
     ),
     qna AS (
       SELECT user_id, created_at FROM research_ai_messages WHERE ($1::uuid IS NULL OR org_id=$1::uuid)
       UNION ALL
       SELECT h.user_id, h.created_at FROM chart_sifu_history h JOIN scoped_users su ON su.id=h.user_id WHERE h.is_archived=false
     )
     SELECT
       (SELECT COUNT(*)::int FROM scoped_users) AS users_total,
       (SELECT COUNT(*)::int FROM users u JOIN scoped_users su ON su.id=u.id WHERE u.last_active_at >= now() - ($2::int || ' days')::interval) AS users_recent,
       (SELECT COUNT(*)::int FROM participant_state ps JOIN scoped_users su ON su.id=ps.user_id WHERE ps.normalized_status NOT IN ('excluded','test') AND NOT su.is_test_account) AS participants_total,
       (SELECT COUNT(*)::int FROM participant_state ps JOIN scoped_users su ON su.id=ps.user_id WHERE ps.normalized_status='pending' AND NOT su.is_test_account) AS consent_pending_total,
       (SELECT COUNT(*)::int FROM participant_state ps JOIN scoped_users su ON su.id=ps.user_id WHERE ps.normalized_status IN ('verbal_consent','active','watch','done') AND NOT su.is_test_account) AS consent_granted_total,
       (SELECT COUNT(*)::int FROM scoped_users su WHERE su.is_test_account) AS test_users_total,
       (SELECT COUNT(*)::int FROM scoped_users su WHERE NOT su.is_test_account) AS real_users_total,
       (SELECT COUNT(*)::int FROM profiles p WHERE ($1::uuid IS NULL OR p.org_id=$1::uuid) AND p.is_archived=false) AS profiles_total,
       (SELECT COUNT(*)::int FROM qna) AS qna_total,
       (SELECT COUNT(*)::int FROM qna WHERE created_at >= now() - ($2::int || ' days')::interval) AS qna_recent,
       (SELECT COUNT(*)::int FROM research_events e WHERE ($1::uuid IS NULL OR e.org_id=$1::uuid) AND e.created_at >= now() - ($2::int || ' days')::interval) AS events_recent`,
    [scopeOrgId, days]
  );

  const users = await q(
    `WITH scoped_users AS (
       SELECT u.*
       FROM users u
       WHERE ($1::uuid IS NULL
          OR u.current_org_id=$1::uuid
          OR EXISTS (SELECT 1 FROM org_members om WHERE om.user_id=u.id AND om.org_id=$1::uuid AND om.status='active'))
     ),
     qna_counts AS (
       SELECT user_id, COUNT(*)::int AS qna_count, MAX(created_at) AS last_qna_at
       FROM (
         SELECT user_id, created_at FROM research_ai_messages WHERE ($1::uuid IS NULL OR org_id=$1::uuid)
         UNION ALL
         SELECT h.user_id, h.created_at FROM chart_sifu_history h JOIN scoped_users su ON su.id=h.user_id WHERE h.is_archived=false
       ) x
       GROUP BY user_id
     ),
     event_counts AS (
       SELECT user_id, COUNT(*)::int AS event_count, MAX(created_at) AS last_event_at
       FROM research_events
       WHERE ($1::uuid IS NULL OR org_id=$1::uuid)
       GROUP BY user_id
     ),
     profile_counts AS (
       SELECT created_by_user_id AS user_id, COUNT(*)::int AS profile_count
       FROM profiles
       WHERE ($1::uuid IS NULL OR org_id=$1::uuid) AND is_archived=false
       GROUP BY created_by_user_id
     )
     SELECT su.id, su.email, su.name, su.phone, su.locale, su.tier, su.hour_balance,
            su.created_at, su.last_active_at,
            CASE
              WHEN su.email LIKE 'sim_%@decode.test'
                OR su.email LIKE '%@decode.local'
                OR su.email LIKE '%@test.local'
                OR su.email LIKE '%test%@hourkey.io'
                OR su.email LIKE '%@deadbeef.local'
                OR su.email LIKE 'dummy_%'
                OR su.email LIKE 'cookie_test_%'
                OR su.email LIKE 'htmlform_%'
                OR su.email LIKE 'profile-test@%'
                OR su.email LIKE '%@decode.app'
                OR COALESCE(su.phone, '') LIKE '089999999%'
                THEN 'test'
              WHEN su.email LIKE 'phone.%@hourkey.local' THEN 'phone_user'
              ELSE 'real'
            END AS account_kind,
            CASE
              WHEN rp.status='active' AND rp.notes='Backfilled from existing users on 2026-06-03' THEN 'pending'
              ELSE COALESCE(rp.status, 'pending')
            END AS research_status,
            rp.cohort, rp.consent_at, rp.notes, rp.labels,
            COALESCE(pc.profile_count, 0) AS profile_count,
            COALESCE(qc.qna_count, 0) AS qna_count,
            qc.last_qna_at,
            COALESCE(ec.event_count, 0) AS event_count,
            ec.last_event_at
       FROM scoped_users su
       LEFT JOIN research_participants rp ON rp.user_id=su.id
       LEFT JOIN qna_counts qc ON qc.user_id=su.id
       LEFT JOIN event_counts ec ON ec.user_id=su.id
       LEFT JOIN profile_counts pc ON pc.user_id=su.id
      WHERE ($3::text IS NULL OR su.email ILIKE $3 OR su.name ILIKE $3 OR su.phone ILIKE $3)
      ORDER BY COALESCE(ec.last_event_at, qc.last_qna_at, su.last_active_at, su.created_at) DESC NULLS LAST
      LIMIT $2::int`,
    [scopeOrgId, limit, searchLike]
  );

  const qna = await q(
    `WITH scoped_users AS (
       SELECT u.id
       FROM users u
       WHERE ($1::uuid IS NULL
          OR u.current_org_id=$1::uuid
          OR EXISTS (SELECT 1 FROM org_members om WHERE om.user_id=u.id AND om.org_id=$1::uuid AND om.status='active'))
     ),
     merged AS (
       SELECT
         'chart_overview'::text AS feature,
         h.id::text AS id,
         h.user_id,
         h.profile_id,
         NULL::text AS mode,
         NULL::text AS topic,
         h.lang,
         h.question,
         h.answer,
         NULL::jsonb AS history,
         NULL::jsonb AS request_payload,
         jsonb_build_object('source','chart_sifu_history','daymaster_profile_key',h.daymaster_profile_key) AS response_meta,
         NULL::jsonb AS profile_snapshot,
         NULL::jsonb AS pillars_snapshot,
         NULL::text AS packet_hash,
         NULL::jsonb AS packet_snapshot_safe,
         NULL::text AS context_hash,
         NULL::text AS prompt_hash,
         NULL::text AS prompt_version,
         NULL::jsonb AS knowledge_hashes,
         NULL::text AS fact_lock,
         NULL::text AS pillar_lock,
         NULL::text AS thread_id,
         NULL::uuid AS thread_profile_id,
         NULL::jsonb AS history_profile_ids,
         NULL::text AS identity_check_result,
         NULL::text AS prediction_phase,
         NULL::jsonb AS prediction_rows,
         NULL::int AS history_dropped_count,
         NULL::text AS profile_binding_status,
         NULL::text AS audit_quality,
         NULL::text AS model,
         'ok'::text AS status,
         h.created_at
       FROM chart_sifu_history h
       JOIN scoped_users su ON su.id=h.user_id
       WHERE h.is_archived=false
       UNION ALL
       SELECT
         m.feature,
         m.id::text,
         m.user_id,
         m.profile_id,
         m.mode,
         m.topic,
         m.lang,
         m.question,
         m.answer,
         m.history,
         m.request_payload,
         m.response_meta,
         m.profile_snapshot,
         m.pillars_snapshot,
         m.packet_hash,
         m.packet_snapshot_safe,
         m.context_hash,
         m.prompt_hash,
         m.prompt_version,
         m.knowledge_hashes,
         m.fact_lock,
         m.pillar_lock,
         m.thread_id,
         m.thread_profile_id,
         m.history_profile_ids,
         m.identity_check_result,
         m.prediction_phase,
         m.prediction_rows,
         m.history_dropped_count,
         m.profile_binding_status,
         m.audit_quality,
         m.model,
         m.status,
         m.created_at
       FROM research_ai_messages m
       WHERE ($1::uuid IS NULL OR m.org_id=$1::uuid)
     )
     SELECT merged.*, u.email, u.name AS user_name, p.name AS profile_name
       FROM merged
       LEFT JOIN users u ON u.id=merged.user_id
       LEFT JOIN profiles p ON p.id=merged.profile_id
      WHERE ($3::text IS NULL OR u.email ILIKE $3 OR u.name ILIKE $3 OR u.phone ILIKE $3 OR p.name ILIKE $3 OR merged.question ILIKE $3)
      ORDER BY merged.created_at DESC
      LIMIT $2::int`,
    [scopeOrgId, limit, searchLike]
  );

  const profiles = await q(
    `WITH scoped_users AS (
       SELECT u.id, u.email, u.name AS user_name, u.phone
       FROM users u
       WHERE ($1::uuid IS NULL
          OR u.current_org_id=$1::uuid
          OR EXISTS (SELECT 1 FROM org_members om WHERE om.user_id=u.id AND om.org_id=$1::uuid AND om.status='active'))
     )
     SELECT p.id, p.created_by_user_id, p.name, p.nickname, p.gender,
            p.relationship_type, p.network_group, p.network_group_label,
            p.day_master, p.day_master_strength, p.birth_datetime,
            p.birth_location_name, p.is_archived, p.created_at,
            su.email, su.user_name
       FROM profiles p
       JOIN scoped_users su ON su.id=p.created_by_user_id
      WHERE p.is_archived=false
        AND ($3::text IS NULL
          OR p.name ILIKE $3
          OR p.nickname ILIKE $3
          OR p.relationship_type ILIKE $3
          OR p.network_group_label ILIKE $3
          OR su.email ILIKE $3
          OR su.user_name ILIKE $3
          OR su.phone ILIKE $3)
      ORDER BY p.created_at DESC
      LIMIT $2::int`,
    [scopeOrgId, 500, searchLike]
  );

  const trafficByPath = await q(
    `SELECT COALESCE(page_path, '(unknown)') AS page_path,
            event_name,
            COUNT(*)::int AS count,
            COUNT(DISTINCT user_id)::int AS users,
            MAX(created_at) AS last_at
       FROM research_events
      WHERE ($1::uuid IS NULL OR org_id=$1::uuid)
        AND created_at >= now() - ($2::int || ' days')::interval
      GROUP BY page_path, event_name
      ORDER BY count DESC, last_at DESC
      LIMIT 40`,
    [scopeOrgId, days]
  );

  const recentEvents = await q(
    `SELECT e.id, e.user_id, e.profile_id, e.event_name, e.page_path, e.referrer, e.session_key,
            e.payload, e.created_at,
            u.email, u.name AS user_name, p.name AS profile_name
       FROM research_events e
      LEFT JOIN users u ON u.id=e.user_id
      LEFT JOIN profiles p ON p.id=e.profile_id
      WHERE ($1::uuid IS NULL OR e.org_id=$1::uuid)
      ORDER BY e.created_at DESC
      LIMIT $2::int`,
    [scopeOrgId, limit]
  );

  return NextResponse.json({
    ok: true,
    scope_org_id: scopeOrgId,
    days,
    summary: summary || {},
    users,
    qna,
    profiles,
    traffic_by_path: trafficByPath,
    recent_events: recentEvents,
  }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (e) {
    const message = e instanceof Error ? e.message : "research query failed";
    console.error("[admin/research] GET failed:", e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return e instanceof Response ? e : NextResponse.json({ error: "auth" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const userId = cleanUuid(body.userId);
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const status = cleanStatus(body.status);
  const cohort = cleanText(body.cohort, 80);
  const notes = cleanText(body.notes, 2_000);
  const labels = Array.isArray(body.labels)
    ? body.labels.map((x: unknown) => cleanText(x, 40)).filter(Boolean).slice(0, 12)
    : [];

  const row = await q1<{ user_id: string }>(
    `INSERT INTO research_participants
       (user_id, org_id, status, cohort, notes, labels, consent_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6::text[], CASE WHEN $3 <> 'excluded' THEN now() ELSE NULL END, now())
     ON CONFLICT (user_id) DO UPDATE SET
       org_id=COALESCE(EXCLUDED.org_id, research_participants.org_id),
       status=EXCLUDED.status,
       cohort=EXCLUDED.cohort,
       notes=EXCLUDED.notes,
       labels=EXCLUDED.labels,
       consent_at=COALESCE(research_participants.consent_at, EXCLUDED.consent_at),
       updated_at=now()
     RETURNING user_id`,
    [userId, admin.orgId, status, cohort, notes, labels]
  );

  return NextResponse.json({ ok: true, user_id: row?.user_id || userId });
}
