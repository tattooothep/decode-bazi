#!/usr/bin/env node
import { pool } from "../src/lib/db";
import { lookupZiweiBirthTimezoneCandidate } from "../src/lib/astro/ziwei/birth-context-recovery";
import { resolveCanonicalZiweiContext } from "../src/lib/astro/ziwei/context-resolver";

type Row = {
  birth_location_name: string | null;
  birth_wall: string | null;
};

const client = await pool.connect();
try {
  await client.query("BEGIN READ ONLY");
  const result = await client.query<Row>(
    `SELECT p.birth_location_name,
            to_char(p.birth_datetime AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD"T"HH24:MI:SS') AS birth_wall
       FROM profiles p
      WHERE p.created_by_user_id IN (
        SELECT DISTINCT user_id FROM mobile_push_tokens
         WHERE enabled=true AND ziwei_payload_schema=2
      )
        AND COALESCE(p.is_archived,false)=false
        AND (p.relationship_type IS NULL OR btrim(p.relationship_type)='')
        AND p.birth_datetime IS NOT NULL AND p.birth_time_known=true
        AND p.gender IN ('M','F')`,
  );
  const serverKey = process.env.GOOGLE_MAPS_SERVER_KEY || "";
  if (!serverKey) throw new Error("server_key_missing");
  let ready = 0;
  for (const row of result.rows) {
    if (!row.birth_location_name || !row.birth_wall) throw new Error("stored_candidate_facts_missing");
    const candidate = await lookupZiweiBirthTimezoneCandidate({
      locationName: row.birth_location_name,
      birthWallClock: row.birth_wall,
      apiKey: serverKey,
    });
    const context = resolveCanonicalZiweiContext({
      mode: "strict",
      birthWallClock: row.birth_wall,
      birthTimezone: candidate.timezone,
      birthTimezoneSource: "profile",
      referenceInstant: new Date(),
      referenceTimezone: "Asia/Bangkok",
    });
    if (context.status !== "resolved") throw new Error("candidate_context_blocked");
    ready += 1;
  }
  await client.query("ROLLBACK");
  console.log(JSON.stringify({ ok: true, checked: result.rowCount, candidatesReady: ready }));
} catch (error) {
  await client.query("ROLLBACK").catch(() => null);
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message.replace(/[^a-z0-9_:-]/giu, "_").slice(0, 80) : "preflight_failed",
  }));
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
