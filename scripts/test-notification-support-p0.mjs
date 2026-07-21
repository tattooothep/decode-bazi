import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { SignJWT } from "jose";
import pg from "pg";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const env = {};
for (const line of fs.readFileSync(path.join(root, ".env.local"), "utf8").split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match) env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
}
Object.assign(process.env, env);

const base = process.env.BASE_URL || "http://127.0.0.1:3322";
const db = new pg.Client({
  host: env.PGHOST || "127.0.0.1",
  port: Number(env.PGPORT || 5433),
  database: env.PGDATABASE || "decode_db",
  user: env.PGUSER,
  password: env.PGPASSWORD,
});
const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const ids = { userA: crypto.randomUUID(), userB: crypto.randomUUID(), admin: crypto.randomUUID() };
const emails = {
  userA: `support-a-${runId}@example.test`,
  userB: `support-b-${runId}@example.test`,
  admin: `support-admin-${runId}@example.test`,
};
const suppressedEventTypes = ["support_report_new", "support_user_reply"];
let reportId = null;
let originalPrefs = [];
let suppressedAdminIds = [];
let passes = 0;

function check(condition, message) {
  if (!condition) throw new Error(`FAIL ${message}`);
  passes++;
  console.log(`PASS ${message}`);
}

async function token(userId, email) {
  return new SignJWT({ userId, email, orgId: null, sv: 0 })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("20m")
    .sign(new TextEncoder().encode(env.AUTH_SECRET));
}

async function api(route, authToken, options = {}) {
  return fetch(`${base}${route}`, {
    ...options,
    headers: {
      cookie: `decode_auth=${authToken}`,
      "content-type": "application/json",
      "x-test-run": runId,
      ...(options.headers || {}),
    },
  });
}

async function post(route, authToken, body) {
  return api(route, authToken, { method: "POST", body: JSON.stringify(body) });
}

async function runWorker() {
  const result = await execFileAsync(process.execPath, ["scripts/workers/admin-notify-watcher.mjs", "--once", "--outbox-only"], {
    cwd: root,
    env: { ...process.env, ADMIN_NOTIFY_BATCH_SIZE: "100" },
    timeout: 60_000,
  });
  if (result.stderr) process.stderr.write(result.stderr);
}

try {
  await db.connect();
  check(typeof env.AUTH_SECRET === "string" && env.AUTH_SECRET.length >= 16, "test uses configured session secret");

  for (const key of ["userA", "userB", "admin"]) {
    await db.query(
      `INSERT INTO users
        (id,email,password_hash,name,locale,timezone,theme,email_verified,is_active,tier,hour_balance,session_version,created_at)
       VALUES ($1,$2,'test-only',$3,$4,'Asia/Bangkok','dark',true,true,'free',1000,0,now())`,
      [ids[key], emails[key], key === "admin" ? "Support fixture" : "Support user fixture", key === "userB" ? "ja" : "th"]
    );
  }
  const supportRole = (await db.query(`SELECT id FROM admin_roles WHERE key='support' LIMIT 1`)).rows[0];
  check(!!supportRole, "support RBAC role exists");
  await db.query(
    `INSERT INTO admin_user_roles(id,user_id,role_id,granted_by,granted_at)
     VALUES (gen_random_uuid(),$1,$2,$1,now())`,
    [ids.admin, supportRole.id]
  );

  const envEmails = String(env.ADMIN_EMAILS || "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  suppressedAdminIds = (await db.query(
    `SELECT DISTINCT u.id::text
       FROM users u
       LEFT JOIN admin_user_roles ur ON ur.user_id=u.id AND ur.revoked_at IS NULL
      WHERE u.id<>$1 AND (ur.id IS NOT NULL OR lower(u.email)=ANY($2::text[]))`,
    [ids.admin, envEmails]
  )).rows.map((row) => row.id);
  if (suppressedAdminIds.length) {
    originalPrefs = (await db.query(
      `SELECT user_id::text,event_type,enabled,delivery_mode,updated_at
         FROM admin_notify_prefs WHERE user_id=ANY($1::uuid[]) AND event_type=ANY($2::text[])`,
      [suppressedAdminIds, suppressedEventTypes]
    )).rows;
    await db.query(
      `INSERT INTO admin_notify_prefs(user_id,event_type,enabled)
       SELECT u,e,false FROM unnest($1::uuid[]) u CROSS JOIN unnest($2::text[]) e
       ON CONFLICT(user_id,event_type) DO UPDATE SET enabled=false,updated_at=now()`,
      [suppressedAdminIds, suppressedEventTypes]
    );
  }

  const [userAToken, userBToken, adminToken] = await Promise.all([
    token(ids.userA, emails.userA), token(ids.userB, emails.userB), token(ids.admin, emails.admin),
  ]);
  const created = await post("/api/support/report", userAToken, {
    action: "create", category: "bug", message: "E2E support issue created by fixture", pagePath: "/luopan?lang=th", locale: "th",
  });
  const createdBody = await created.json();
  check(created.status === 201 && createdBody.ok, "user can create a support ticket");
  reportId = String(createdBody.report.id);

  const foreignRead = await api(`/api/support/report?id=${reportId}`, userBToken);
  check(foreignRead.status === 404, "another user cannot read the ticket");

  const clientMessageId = `reply-${runId}`;
  const firstReply = await post("/api/support/report", userAToken, { action: "reply", id: reportId, message: "Additional reproduction details", clientMessageId });
  const replayReply = await post("/api/support/report", userAToken, { action: "reply", id: reportId, message: "Additional reproduction details", clientMessageId });
  check(firstReply.status === 200 && (await firstReply.json()).duplicate === false, "first user reply is accepted");
  check(replayReply.status === 200 && (await replayReply.json()).duplicate === true, "replayed user reply is idempotent");
  const userReplyRows = await db.query(
    `SELECT count(*)::int AS n FROM support_report_messages WHERE report_id=$1 AND client_message_id=$2`, [reportId, clientMessageId]
  );
  check(userReplyRows.rows[0].n === 1, "idempotency leaves exactly one message");

  const adminDetail = await api(`/api/admin/community?report_id=${reportId}`, adminToken);
  check(adminDetail.status === 200 && (await adminDetail.json()).messages.length === 2, "support admin can read the conversation");

  const adminReplyId = `admin-reply-${runId}`;
  check((await post("/api/admin/community", adminToken, { action: "reply_report", id: reportId, message: "We found the issue and are checking the fix.", clientMessageId: adminReplyId })).status === 200, "admin can send a public reply");
  check((await post("/api/admin/community", adminToken, { action: "add_internal_note", id: reportId, message: "Internal fixture note", clientMessageId: `note-${runId}` })).status === 200, "admin can add an internal note");
  check((await post("/api/admin/community", adminToken, { action: "assign_report", id: reportId, assigneeId: ids.admin })).status === 200, "admin can assign the ticket");
  check((await post("/api/admin/community", adminToken, { action: "update_report", id: reportId, status: "resolved" })).status === 200, "admin can resolve the ticket");

  const userDetailResponse = await api(`/api/support/report?id=${reportId}`, userAToken);
  const userDetail = await userDetailResponse.json();
  check(userDetailResponse.status === 200 && userDetail.messages.some((message) => message.body.includes("We found")), "user sees the public admin reply");
  check(!userDetail.messages.some((message) => message.body.includes("Internal fixture")), "internal notes never appear in the user API");
  const adminAfter = await (await api(`/api/admin/community?report_id=${reportId}`, adminToken)).json();
  check(adminAfter.messages.some((message) => message.visibility === "internal" && message.body.includes("Internal fixture")), "internal note remains visible to admins");

  await runWorker();
  const fixtureInbox = await db.query(
    `SELECT recipient_user_id::text,event_type,count(*)::int AS n
       FROM notification_inbox WHERE recipient_user_id=ANY($1::uuid[])
       GROUP BY recipient_user_id,event_type`,
    [[ids.userA, ids.admin]]
  );
  check(fixtureInbox.rows.some((row) => row.recipient_user_id === ids.admin && row.event_type === "support_report_new"), "new ticket reaches the support admin inbox");
  check(fixtureInbox.rows.some((row) => row.recipient_user_id === ids.userA && row.event_type === "support_admin_reply"), "admin reply reaches the user inbox");
  check(fixtureInbox.rows.some((row) => row.recipient_user_id === ids.userA && row.event_type === "support_status_changed"), "status change reaches the user inbox");
  const userInboxResponse = await api("/api/notifications", userAToken);
  const userInbox = await userInboxResponse.json();
  check(userInboxResponse.status === 200 && userInbox.unread >= 2, "user can load the in-app notification inbox");
  const protectedInboxId = userInbox.rows.find((row) => row.event_type === "support_admin_reply")?.id;
  check(!!protectedInboxId, "public inbox API returns the expected reply notification");
  await post("/api/notifications", userBToken, { id: protectedInboxId });
  const stillUnread = await db.query(`SELECT read_at FROM notification_inbox WHERE id=$1`, [protectedInboxId]);
  check(stillUnread.rows[0]?.read_at == null, "another user cannot mark the notification as read");
  await post("/api/notifications", userAToken, { id: protectedInboxId });
  const ownerRead = await db.query(`SELECT read_at FROM notification_inbox WHERE id=$1`, [protectedInboxId]);
  check(ownerRead.rows[0]?.read_at != null, "notification owner can mark it as read");

  const restartEvent = (await db.query(
    `INSERT INTO notification_events(event_type,severity,audience_kind,recipient_user_id,dedupe_key,target_url,payload,status)
     VALUES ('support_admin_reply','info','user',$1,$2,'/support','{}','expanded') RETURNING id`,
    [ids.userB, `test-restart:${runId}`]
  )).rows[0];
  await db.query(
    `INSERT INTO notification_deliveries(event_id,recipient_user_id,status,attempts,locked_at,locked_by)
     VALUES ($1,$2,'processing',1,now()-interval '10 minutes','dead-worker')`,
    [restartEvent.id, ids.userB]
  );
  await runWorker();
  await runWorker();
  const recovered = await db.query(
    `SELECT d.status,d.attempts,(SELECT count(*)::int FROM notification_inbox i WHERE i.event_id=d.event_id) AS inbox_count
       FROM notification_deliveries d WHERE d.event_id=$1`, [restartEvent.id]
  );
  check(recovered.rows[0].status === "sent" && recovered.rows[0].attempts === 2, "stale worker lock is recovered and retried");
  check(recovered.rows[0].inbox_count === 1, "worker restart and replay create no duplicate inbox item");

  const auditRows = await db.query(
    `SELECT action FROM audit_logs WHERE user_id=$1 AND action=ANY($2::text[])`,
    [ids.admin, ["admin.community.report.reply", "admin.community.report.internal_note", "admin.community.report.assign", "admin.community.report.update"]]
  );
  check(new Set(auditRows.rows.map((row) => row.action)).size === 4, "reply, internal note, assignment, and status are audited");
  console.log(`${passes} support/outbox E2E checks passed`);
} finally {
  if (db._connected) {
    await db.query(`DELETE FROM audit_logs WHERE user_id=$1`, [ids.admin]).catch(() => null);
    await db.query(`DELETE FROM notification_events WHERE dedupe_key LIKE $1 OR payload->>'support_report_id'=$2`, [`%${runId}%`, reportId]).catch(() => null);
    if (reportId) await db.query(`DELETE FROM support_reports WHERE id=$1`, [reportId]).catch(() => null);
    if (suppressedAdminIds.length) {
      await db.query(
        `DELETE FROM admin_notify_prefs WHERE user_id=ANY($1::uuid[]) AND event_type=ANY($2::text[])`,
        [suppressedAdminIds, suppressedEventTypes]
      ).catch(() => null);
      for (const pref of originalPrefs) {
        await db.query(
          `INSERT INTO admin_notify_prefs(user_id,event_type,enabled,delivery_mode,updated_at)
           VALUES ($1,$2,$3,$4,$5) ON CONFLICT(user_id,event_type) DO UPDATE
           SET enabled=EXCLUDED.enabled,delivery_mode=EXCLUDED.delivery_mode,updated_at=EXCLUDED.updated_at`,
          [pref.user_id, pref.event_type, pref.enabled, pref.delivery_mode, pref.updated_at]
        ).catch(() => null);
      }
    }
    await db.query(`DELETE FROM admin_user_roles WHERE user_id=$1`, [ids.admin]).catch(() => null);
    await db.query(`DELETE FROM users WHERE id=ANY($1::uuid[])`, [[ids.userA, ids.userB, ids.admin]]).catch(() => null);
    await db.end().catch(() => null);
  }
}
