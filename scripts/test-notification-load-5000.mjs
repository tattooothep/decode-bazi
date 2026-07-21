import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const root = process.cwd();
const env = {};
for (const line of fs.readFileSync(path.join(root, ".env.local"), "utf8").split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match) env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
}
const db = new pg.Client({
  host: env.PGHOST || "127.0.0.1",
  port: Number(env.PGPORT || 5433),
  database: env.PGDATABASE || "decode_db",
  user: env.PGUSER,
  password: env.PGPASSWORD,
});
const runId = `load-${Date.now()}`;
const total = 5_000;
const started = performance.now();

function check(condition, message) {
  if (!condition) throw new Error(`FAIL ${message}`);
  console.log(`PASS ${message}`);
}

try {
  await db.connect();
  await db.query("BEGIN");
  const usersAt = performance.now();
  await db.query(
    `INSERT INTO users
      (id,email,password_hash,name,locale,timezone,theme,email_verified,is_active,tier,hour_balance,session_version,created_at)
     SELECT gen_random_uuid(),$1||'-'||n||'@example.test','test-only','Load fixture',
            (ARRAY['th','en','zh','cn','vi','ja','ru','ko','es'])[(n % 9)+1],
            'Asia/Bangkok','dark',true,true,'free',1000,0,now()
       FROM generate_series(1,$2::int) n`,
    [runId, total]
  );
  const usersMs = performance.now() - usersAt;

  const eventsAt = performance.now();
  await db.query(
    `INSERT INTO notification_events
      (event_type,severity,audience_kind,recipient_user_id,dedupe_key,target_url,payload)
     SELECT 'support_admin_reply','info','user',u.id,$1||':'||u.id::text,'/support',jsonb_build_object('load_test',$1)
       FROM users u WHERE u.email LIKE $1||'-%@example.test'`,
    [runId]
  );
  const eventsMs = performance.now() - eventsAt;

  const fanoutAt = performance.now();
  await db.query(
    `INSERT INTO notification_deliveries(event_id,recipient_user_id)
     SELECT e.id,e.recipient_user_id FROM notification_events e WHERE e.payload->>'load_test'=$1
     ON CONFLICT(event_id,recipient_user_id) DO NOTHING`,
    [runId]
  );
  const fanoutMs = performance.now() - fanoutAt;

  const inboxAt = performance.now();
  const inboxSql =
    `INSERT INTO notification_inbox
      (event_id,recipient_user_id,event_type,severity,title,body,target_url)
     SELECT e.id,e.recipient_user_id,e.event_type,e.severity,'Load test','Load test',e.target_url
       FROM notification_events e WHERE e.payload->>'load_test'=$1
     ON CONFLICT(event_id,recipient_user_id) DO NOTHING`;
  await db.query(inboxSql, [runId]);
  await db.query(inboxSql, [runId]);
  const inboxMs = performance.now() - inboxAt;

  const counts = (await db.query(
    `SELECT
       (SELECT count(*)::int FROM users WHERE email LIKE $1||'-%@example.test') AS users,
       (SELECT count(*)::int FROM notification_events WHERE payload->>'load_test'=$1) AS events,
       (SELECT count(*)::int FROM notification_deliveries d JOIN notification_events e ON e.id=d.event_id WHERE e.payload->>'load_test'=$1) AS deliveries,
       (SELECT count(*)::int FROM notification_inbox i JOIN notification_events e ON e.id=i.event_id WHERE e.payload->>'load_test'=$1) AS inbox`,
    [runId]
  )).rows[0];
  check(counts.users === total, "5,000 fixture users created inside the rollback transaction");
  check(counts.events === total, "5,000 per-user outbox events accepted");
  check(counts.deliveries === total, "fan-out produces exactly 5,000 delivery records");
  check(counts.inbox === total, "replayed inbox insert remains exactly-once for all 5,000 users");

  console.log(JSON.stringify({
    users: total,
    users_ms: Math.round(usersMs),
    events_ms: Math.round(eventsMs),
    fanout_ms: Math.round(fanoutMs),
    inbox_and_replay_ms: Math.round(inboxMs),
    total_ms: Math.round(performance.now() - started),
  }));
} finally {
  await db.query("ROLLBACK").catch(() => null);
  await db.end().catch(() => null);
}
