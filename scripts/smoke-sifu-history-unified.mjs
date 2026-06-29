import nextEnv from "@next/env";
import { Pool } from "pg";

nextEnv.loadEnvConfig(process.cwd());

const pool = new Pool({
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5433),
  database: process.env.PGDATABASE || "decode_db",
  user: process.env.PGUSER || "decode_user",
  password: process.env.PGPASSWORD,
});

const sample = await pool.query(`
  SELECT user_id, profile_id
    FROM research_ai_messages
   WHERE profile_id IS NOT NULL
     AND user_id IS NOT NULL
   ORDER BY created_at DESC
   LIMIT 1
`);

if (!sample.rows[0]) {
  console.log(JSON.stringify({ ok: true, skipped: "no sample history rows" }, null, 2));
  await pool.end();
  process.exit(0);
}

const { user_id, profile_id } = sample.rows[0];

const { rows } = await pool.query(`
  WITH unified_history AS (
    SELECT id, feature, profile_id, mode, topic, lang, question, answer,
           request_payload, response_meta, model, cached, created_at
      FROM research_ai_messages
     WHERE user_id=$1
       AND feature IN ('sifu_master','sifu_group','sifu_fusion')
       AND status='ok'
       AND answer IS NOT NULL
       AND (
         (
           feature='sifu_master'
           AND profile_id=$2::uuid
           AND COALESCE(request_payload->>'fusion_run_id','')=''
         )
         OR (
           feature='sifu_fusion'
           AND profile_id=$2::uuid
         )
         OR (
           feature='sifu_group'
           AND (
             profile_id=$2::uuid
             OR jsonb_exists(COALESCE(history_profile_ids, '[]'::jsonb), $2::text)
             OR jsonb_exists(COALESCE(request_payload->'profileIds', '[]'::jsonb), $2::text)
             OR jsonb_exists(COALESCE(request_payload->'profile_ids', '[]'::jsonb), $2::text)
           )
         )
       )
    UNION ALL
    SELECT id, 'chart_sifu' AS feature, profile_id, NULL::text AS mode, NULL::text AS topic,
           lang, question, answer,
           jsonb_build_object(
             'source', 'chart_sifu_history',
             'profileId', profile_id,
             'pillars_hash', pillars_hash,
             'daymaster_profile_key', daymaster_profile_key
           ) AS request_payload,
           jsonb_build_object(
             'source', 'chart_sifu_history',
             'daymaster_profile_key', daymaster_profile_key
           ) AS response_meta,
           NULL::text AS model, false AS cached, created_at
      FROM chart_sifu_history
     WHERE user_id=$1
       AND is_archived=false
       AND profile_id=$2::uuid
  )
  SELECT feature, count(*)::int AS n
    FROM unified_history
   GROUP BY feature
   ORDER BY feature
`, [user_id, profile_id]);

console.log(JSON.stringify({ ok: true, user_id, profile_id, features: rows }, null, 2));
await pool.end();
