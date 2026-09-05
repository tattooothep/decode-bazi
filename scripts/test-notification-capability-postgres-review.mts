import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import pg from "pg";

// Run only by explicit scoped authorization: creates a new disposable database
// and role in decode-postgres, uses no production rows, and drops only those
// exact newly created objects. A collision is an error, never an initial DROP.
const nonce = randomBytes(12).toString("hex");
const database = `hk_notif_cap4_test_${nonce}`;
const role = `hk_notif_cap4_role_${nonce}`;
const password = randomBytes(32).toString("hex");
assert.match(database, /^hk_notif_cap4_test_[a-f0-9]{24}$/u);
assert.match(role, /^hk_notif_cap4_role_[a-f0-9]{24}$/u);
let databaseCreated = false;
let roleCreated = false;
let roleOid: string | null = null;
let pool: pg.Pool | null = null;
let checks = 0;
let providerCalls = 0;
let externalFetches = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { externalFetches++; throw new Error("external network forbidden in isolated PostgreSQL review"); };
const sourcePaths = [
  "src/lib/mobile-notification-delivery.cjs", "src/lib/push-send.cjs", "scripts/mobile-push-retry-worker.cjs",
  "src/lib/qimen-three-layer-notification.cjs", "src/lib/qimen-notification-presentation.cjs",
  "scripts/fixtures/qimen-three-layer-valid-snapshot-v3.cjs", "scripts/fixtures/qimen-three-layer-valid-snapshot-v4.cjs",
  "scripts/test-notification-capability-postgres-review.mts",
];
const sourceHashes = () => Object.fromEntries(sourcePaths.map(path => [path, createHash("sha256").update(readFileSync(path)).digest("hex")]));
const loadedSourceHashes = sourceHashes();
const require = createRequire(import.meta.url);
const delivery = require("../src/lib/mobile-notification-delivery.cjs");
const worker = require("./mobile-push-retry-worker.cjs");
const push = require("../src/lib/push-send.cjs");
const runtime = require("../src/lib/qimen-three-layer-notification.cjs");
const presentation = require("../src/lib/qimen-notification-presentation.cjs");
const v3 = require("./fixtures/qimen-three-layer-valid-snapshot-v3.cjs");
const v4 = require("./fixtures/qimen-three-layer-valid-snapshot-v4.cjs");
assert.equal(Object.keys(require.cache).some(path => /[/\\]qimen-api[/\\]|mobile-qimen-push-cron/u.test(path)), false);

function admin(sql: string): string {
  return execFileSync("docker", ["exec", "-i", "decode-postgres", "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "decode_user", "-d", "postgres", "-Atq"], {
    encoding: "utf8", input: sql, stdio: ["pipe", "pipe", "pipe"], timeout: 15_000,
  }).trim();
}
function check(condition: unknown, label: string) {
  assert.ok(condition, label); checks++; console.log(`PASS ${label}`);
}
async function one(sql: string, values: any[] = []) {
  assert.ok(pool && databaseCreated && roleCreated);
  return (await pool.query(sql, values)).rows[0];
}
async function rejectsSql(sql: string, values: any[], code: string) {
  await assert.rejects(pool!.query(sql, values), (error: any) => error.code === code);
}
const upgradeFiles = [
  "migrations/20260905_mobile_qimen_schema4_compatibility.sql",
  "migrations/20260905_mobile_ziwei_schema3_compatibility.sql",
];
const migrationHashes = Object.fromEntries(upgradeFiles.map(path => [path, createHash("sha256").update(readFileSync(path)).digest("hex")]));

try {
  check(admin(`SELECT (SELECT count(*) FROM pg_database WHERE datname='${database}') + (SELECT count(*) FROM pg_roles WHERE rolname='${role}');`) === "0", "random database/role absent; never remove a pre-existing target");
  admin(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;`);
  roleCreated = true;
  roleOid = admin(`SELECT oid FROM pg_roles WHERE rolname='${role}';`);
  admin(`CREATE DATABASE ${database} OWNER ${role} TEMPLATE template0;`);
  databaseCreated = true;
  admin(`REVOKE CONNECT ON DATABASE ${database} FROM PUBLIC;`);
  pool = new pg.Pool({ host: "127.0.0.1", port: 5433, database, user: role, password, max: 6,
    connectionTimeoutMillis: 5000, idleTimeoutMillis: 1000,
    options: "-c statement_timeout=10000 -c lock_timeout=2000", application_name: "hourkey-isolated-capability-review" });
  const identity = await one("SELECT current_database() AS db,current_user AS role,rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user");
  check(identity.db === database && identity.role === role && !identity.rolsuper && !identity.rolcreatedb && !identity.rolcreaterole,
    "test pool points only at newly owned scratch DB with restricted login");

  // Reuse only the static CREATE TABLE fixture, not the old executable harness
  // (which loads .env.local and preemptively drops PID-named targets).
  const prior = readFileSync("scripts/test-mobile-push-retry-worker.mts", "utf8");
  const start = prior.indexOf("    CREATE EXTENSION IF NOT EXISTS pgcrypto;");
  const end = prior.indexOf("    INSERT INTO users(id) VALUES", start);
  assert.ok(start > 0 && end > start);
  const schema = prior.slice(start, end);
  assert.equal(schema.includes("${"), false);
  await pool.query(schema);
  await pool.query("ALTER TABLE users ADD COLUMN locale text NOT NULL DEFAULT 'th'");
  await pool.query("ALTER TABLE mobile_push_tokens ADD CONSTRAINT mobile_push_tokens_ziwei_payload_schema_check CHECK(ziwei_payload_schema IN (0,1,2))");
  for (const path of ["migrations/20260815_mobile_notification_integrity.sql", "migrations/20260821_mobile_qimen_three_layer.sql", "migrations/20260821_mobile_qimen_component_quality_v3.sql"]) {
    // Historical fixture bootstrap grants only the fresh test role. Never
    // change a production role or grant scratch privileges to hourkey_app.
    const sql = readFileSync(path, "utf8").replace(/TO hourkey_app;/gu, `TO ${role};`);
    assert.equal(sql.includes("hourkey_app"), false);
    await pool.query(sql);
  }
  const baselineOwner = randomUUID();
  await pool.query("INSERT INTO users(id,locale) VALUES($1,'th')", [baselineOwner]);
  const historicalIds: string[] = [];
  for (const qimen of [1, 2, 3]) for (const ziwei of [0, 1, 2]) {
    const id = randomUUID(); historicalIds.push(id);
    await pool.query(`INSERT INTO mobile_push_tokens(id,user_id,installation_id,expo_push_token,platform,locale,qimen_payload_schema,ziwei_payload_schema,enabled,app_version,last_registered_at)
      VALUES($1,$2,$3,$4,'android','th',$5,$6,$7,'historical-fixture',now())`, [id, baselineOwner, randomUUID(), `ExponentPushToken[${id}]`, qimen, ziwei, ziwei !== 1]);
  }
  const beforeRows = (await pool.query("SELECT row_to_json(t) AS original FROM mobile_push_tokens t ORDER BY id")).rows;
  await rejectsSql("UPDATE mobile_push_tokens SET qimen_payload_schema=4 WHERE id=$1", [historicalIds[0]], "23514");
  await rejectsSql("UPDATE mobile_push_tokens SET ziwei_payload_schema=3 WHERE id=$1", [historicalIds[0]], "23514");
  check(true, "RED baseline database rejects Qimen4 and Ziwei3 before additive migrations");
  for (const path of upgradeFiles) {
    const beforeConstraints = await one("SELECT jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid)) ORDER BY conname) AS definitions FROM pg_constraint WHERE conrelid='mobile_push_tokens'::regclass");
    const reader = await pool.connect();
    const migrator = await pool.connect();
    try {
      await reader.query("BEGIN; LOCK TABLE mobile_push_tokens IN ACCESS SHARE MODE");
      const started = performance.now();
      await assert.rejects(migrator.query(readFileSync(path, "utf8")), (error: any) => error.code === "55P03");
      const elapsedMs = performance.now() - started;
      assert.ok(elapsedMs >= 850 && elapsedMs < 3500, "actual migration honors 1-second lock timeout without an indefinite wait");
      await migrator.query("ROLLBACK");
      await reader.query("ROLLBACK");
      const afterConstraints = await one("SELECT jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid)) ORDER BY conname) AS definitions FROM pg_constraint WHERE conrelid='mobile_push_tokens'::regclass");
      assert.deepEqual(afterConstraints, beforeConstraints);
      check(true, `${path}: conflicting reader causes bounded lock timeout; rollback preserves all constraints`);
    } finally {
      await migrator.query("ROLLBACK"); await reader.query("ROLLBACK");
      migrator.release(); reader.release();
    }
  }
  for (const path of upgradeFiles) await pool.query(readFileSync(path, "utf8"));
  const afterRows = (await pool.query("SELECT row_to_json(t) AS original FROM mobile_push_tokens t ORDER BY id")).rows;
  check(JSON.stringify(afterRows) === JSON.stringify(beforeRows), "exact new migrations preserve all 9 historical capability/consent/token/timestamp rows");
  for (const path of upgradeFiles) await pool.query(readFileSync(path, "utf8"));
  check(JSON.stringify((await pool.query("SELECT row_to_json(t) AS original FROM mobile_push_tokens t ORDER BY id")).rows) === JSON.stringify(beforeRows), "new migrations are rerunnable without row writes");
  for (const qimen of [1, 2, 3, 4]) for (const ziwei of [0, 1, 2, 3]) {
    await pool.query("UPDATE mobile_push_tokens SET qimen_payload_schema=$2,ziwei_payload_schema=$3 WHERE id=$1", [historicalIds[0], qimen, ziwei]);
    const stored = await one("SELECT qimen_payload_schema,ziwei_payload_schema FROM mobile_push_tokens WHERE id=$1", [historicalIds[0]]);
    assert.equal(stored.qimen_payload_schema, qimen); assert.equal(stored.ziwei_payload_schema, ziwei);
  }
  for (const value of [-32768, -1, 0, 5, 32767]) await rejectsSql("UPDATE mobile_push_tokens SET qimen_payload_schema=$2 WHERE id=$1", [historicalIds[0], value], "23514");
  for (const value of [-32768, -1, 4, 32767]) await rejectsSql("UPDATE mobile_push_tokens SET ziwei_payload_schema=$2 WHERE id=$1", [historicalIds[0], value], "23514");
  for (const column of ["qimen_payload_schema", "ziwei_payload_schema"]) await rejectsSql(`UPDATE mobile_push_tokens SET ${column}=NULL WHERE id=$1`, [historicalIds[0]], "23502");
  check(true, "GREEN 16 valid schema combinations; Qimen0, out-of-domain bounds and null fail closed");

  async function occurrence(schema: 3 | 4, options: { capability?: number; locale?: string; provider?: "fcm" | "expo" } = {}) {
    const owner = randomUUID(), installationId = randomUUID(), tokenId = randomUUID(), occurrenceId = randomUUID();
    const locale = options.locale || "th";
    const provider = options.provider || "fcm";
    const snapshot = schema === 4 ? v4.build(owner, "STANDARD_FIVE_ELEMENT_DOOR_MONTH_V1") : v3.build(owner);
    const from = snapshot.layers.hour.validFrom, until = snapshot.layers.hour.validUntil;
    const deadline = new Date(Date.parse(from) + 10 * 60_000).toISOString();
    const key = `qimen|${createHash("sha256").update(`${owner}/${installationId}/${from}/${schema}`).digest("hex")}`;
    await pool!.query("INSERT INTO users(id,locale) VALUES($1,$2)", [owner, locale]);
    await pool!.query("INSERT INTO mobile_notification_prefs(user_id,qimen_enabled,quiet_start,quiet_end,max_per_day,privacy_preview,locale) VALUES($1,true,0,0,0,false,'en')", [owner]);
    await pool!.query(`INSERT INTO mobile_push_tokens(id,user_id,installation_id,expo_push_token,device_push_token,device_token_type,platform,locale,qimen_payload_schema,ziwei_payload_schema,last_registered_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,'zh',$8,3,now())`, [tokenId, owner, installationId, `ExponentPushToken[fixture-${tokenId}]`, provider === "fcm" ? `fixture-fcm-${tokenId}` : null, provider === "fcm" ? "fcm" : "apns", provider === "fcm" ? "android" : "ios", options.capability ?? 4]);
    await pool!.query(`INSERT INTO mobile_qimen_installations(user_id,installation_id,enabled,quiet_start,quiet_end,location_permission,latitude,longitude,location_timezone,location_captured_at,location_expires_at)
      VALUES($1,$2,true,0,0,'foreground',0,0,'UTC',$3::timestamptz-interval '1 day',$3::timestamptz+interval '6 days')`, [owner, installationId, from]);
    const parameters = [occurrenceId, owner, installationId, key, from, until, deadline, snapshot.selectedDirection, JSON.stringify(snapshot.versionTuple), JSON.stringify(snapshot.sourceTuple), JSON.stringify(snapshot), snapshot.snapshotDigest];
    const insertSql = `INSERT INTO mobile_qimen_occurrences(id,user_id,installation_id,occurrence_key,purpose,hour_valid_from,hour_valid_until,send_deadline,selected_direction,version_tuple,source_tuple,snapshot,snapshot_digest,state)
      VALUES($1,$2,$3,$4,'travel',$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12,'claimed')`;
    await pool!.query(insertSql, parameters);
    const payload = schema === 4 ? runtime.buildQimenV4ProviderData(snapshot) : runtime.buildQimenV3ProviderData(snapshot);
    const historyCopies = delivery.localizedHistoryCopies((language: string) => presentation.buildQimenCopy(language, snapshot));
    const notice = {
      userId: owner, key, kind: "qimen", qimenOccurrenceId: occurrenceId, ...historyCopies.th, historyCopies, payload,
      sourceFacts: { eventEndAt: until, sendDeadline: deadline, snapshotDigest: snapshot.snapshotDigest, selectedDirection: snapshot.selectedDirection, calculationVersion: snapshot.versionTuple.hour,
        ...(schema === 4 ? { seasonalEvidence: snapshot.layers.hour.contextEvidence } : {}) },
      messages: [{ tokenId, platform: provider === "fcm" ? "android" : "ios", locale: "zh", category: "qimen", ...presentation.buildQimenCopy("zh", snapshot), url: "/qimen/notification-detail", data: payload }],
    };
    return { owner, tokenId, installationId, occurrenceId, snapshot, notice, provider, key, insertSql, parameters,
      now: new Date(Date.parse(from) + 30_000).toISOString() };
  }
  async function attempt(reserved: any) {
    assert.ok(reserved && reserved.attemptIds.length === 1);
    return one("SELECT a.*,l.title,l.body,l.payload,l.source_facts,l.delivery_status FROM mobile_push_attempts a JOIN mobile_push_log l ON l.id=a.push_log_id WHERE a.id=$1", [reserved.attemptIds[0]]);
  }
  async function retry(f: any, reserved: any, outcome: "accepted" | "retry" = "accepted") {
    const sent: unknown[] = [];
    const report = await worker.runRetryBatch(pool, { attemptIds: reserved.attemptIds, limit: 1, hooks: { policyNow: f.now }, baseDelaySeconds: 1,
      sender: { async sendPrepared(value: any) {
        providerCalls++; sent.push(value.providerMessage);
        return outcome === "retry" ? { kind: "failed", provider: f.provider, reason: "synthetic_503", retryable: true }
          : { kind: "provider_accepted", provider: f.provider, ...(f.provider === "fcm" ? { providerMessageId: `projects/scratch/messages/${randomUUID()}` } : { providerTicketId: randomUUID() }) };
      } } });
    return { report, sent };
  }

  for (const locale of ["th", "en", "zh"]) for (const provider of ["fcm", "expo"] as const) {
    const f = await occurrence(4, { locale, provider });
    const reserved = await delivery.reserve(pool, f.notice);
    const row = await attempt(reserved);
    const expected = presentation.buildQimenCopy(locale, f.snapshot);
    assert.equal(row.title, expected.title); assert.equal(row.body, expected.body);
    assert.equal(row.source_facts.presentationLocale, locale);
    const visible = provider === "fcm" ? row.provider_message.notification : row.provider_message;
    assert.equal(visible.title, row.title); assert.equal(visible.body, row.body);
    assert.equal(row.privacy_safe, true);
    assert.ok(Buffer.byteLength(JSON.stringify(row.provider_message), "utf8") < 4000);
    assert.equal(JSON.stringify(row.provider_message).includes(`fixture-fcm-${f.tokenId}`), false);
    assert.equal(JSON.stringify(row.provider_message).includes(`ExponentPushToken[fixture-${f.tokenId}]`), false);
    const linked = await one("SELECT state,push_log_id FROM mobile_qimen_occurrences WHERE id=$1", [f.occurrenceId]);
    assert.equal(linked.state, "reserved"); assert.equal(linked.push_log_id, reserved.id);
    await rejectsSql("UPDATE mobile_push_attempts SET provider_message='{}'::jsonb WHERE id=$1", [row.id], "P0001");
    await rejectsSql("UPDATE mobile_qimen_occurrences SET snapshot='{}'::jsonb WHERE id=$1", [f.occurrenceId], "P0001");
    const failed = await retry(f, reserved, "retry");
    assert.equal(failed.report.retryDue, 1); assert.equal(failed.sent.length, 1);
    await pool.query("UPDATE users SET locale='ru' WHERE id=$1", [f.owner]);
    await pool.query("UPDATE mobile_push_attempts SET next_retry_at=now()-interval '1 second' WHERE id=$1", [row.id]);
    const retried = await retry(f, reserved);
    assert.equal(retried.report.accepted, 1); assert.equal(retried.report.delivered, 0);
    assert.deepEqual(retried.sent[0], row.provider_message);
    const final = await attempt(reserved);
    assert.equal(final.send_count, 2); assert.equal(final.status, "provider_accepted");
    assert.equal(final.delivered_at, null); assert.equal(final.title, expected.title); assert.equal(final.body, expected.body);
    check(true, `${locale}/${provider}: real reserve links immutable V4, retries exact locked-locale bytes, never claims phone delivery`);
  }

  const historic = await occurrence(3, { capability: 3 });
  const historicReservation = await delivery.reserve(pool, historic.notice);
  const old = await attempt(historicReservation);
  await pool.query("UPDATE mobile_push_tokens SET qimen_payload_schema=4 WHERE id=$1", [historic.tokenId]);
  const upgraded = await retry(historic, historicReservation);
  assert.equal(upgraded.report.accepted, 1); assert.deepEqual(upgraded.sent[0], old.provider_message);
  assert.ok(JSON.parse((upgraded.sent[0] as any).data.body).qimenV3);
  check(true, "capability3→4 upgrade replays immutable V3 without rewriting its snapshot or payload");

  const downgrade = await occurrence(4);
  const downgradeReservation = await delivery.reserve(pool, downgrade.notice);
  await pool.query("UPDATE mobile_push_tokens SET qimen_payload_schema=3 WHERE id=$1", [downgrade.tokenId]);
  const blockedDowngrade = await retry(downgrade, downgradeReservation);
  assert.equal(blockedDowngrade.sent.length, 0);
  assert.equal((await attempt(downgradeReservation)).last_error, "policy_payload_schema_changed");
  check(true, "V4 retry after capability downgrade dies before fake provider invocation");
  const reservationDowngrade = await occurrence(4, { capability: 3 });
  await assert.rejects(delivery.reserve(pool, reservationDowngrade.notice), /qimen_token_capability_changed/u);
  assert.equal((await one("SELECT count(*)::int AS n FROM mobile_push_log WHERE user_id=$1", [reservationDowngrade.owner])).n, 0);
  check(true, "V4 reservation rejects an old capability atomically with no parent or attempt");

  for (const corruption of ["payload", "seasonal-source", "copy", "missing-occurrence"] as const) {
    const f = await occurrence(4);
    const reserved = await delivery.reserve(pool, f.notice);
    if (corruption === "payload") await pool.query("UPDATE mobile_push_log SET payload='{}'::jsonb WHERE id=$1", [reserved.id]);
    if (corruption === "seasonal-source") await pool.query("UPDATE mobile_push_log SET source_facts=jsonb_set(source_facts,'{seasonalEvidence,doorMethod}','\"forged\"'::jsonb) WHERE id=$1", [reserved.id]);
    if (corruption === "copy") await pool.query("UPDATE mobile_push_log SET body='forged-history-copy' WHERE id=$1", [reserved.id]);
    if (corruption === "missing-occurrence") await pool.query("DELETE FROM mobile_qimen_occurrences WHERE id=$1", [f.occurrenceId]);
    const result = await retry(f, reserved);
    assert.equal(result.sent.length, 0);
    const final = await attempt(reserved);
    assert.equal(final.status, "dead"); assert.equal(final.send_count, 0);
    assert.equal(final.last_error, corruption === "missing-occurrence" ? "policy_location_permission_revoked" : "policy_attestation_changed");
    check(true, `malformed ${corruption} cannot downgrade to legacy delivery or invoke fake provider`);
  }

  for (const corruption of ["missing-intrinsic-warning", "substituted-intrinsic-warning", "clear-bad-deity"] as const) {
    const f = await occurrence(4);
    assert.equal(f.snapshot.selectedEvidence.hour.deityBaseQuality, "inauspicious");
    assert.ok(f.snapshot.hourDecision.reasonCodes.includes("hour_warning_INTRINSIC_DEITY_BAD"));
    const forged = structuredClone(f.snapshot);
    forged.hourDecision.reasonCodes = corruption === "clear-bad-deity"
      ? ["hour_clear_good", "hour_reading_suitable"]
      : ["hour_conditional_good", "hour_reading_usable", ...(corruption === "substituted-intrinsic-warning" ? ["hour_warning_MEN_PO"] : [])];
    const { snapshotDigest: _digest, ...digestInput } = forged;
    forged.snapshotDigest = createHash("sha256").update(runtime.canonicalStringify(digestInput)).digest("hex");
    assert.equal(runtime.verifyQimenThreeLayerSnapshotV4(forged), false, "rehashing must not authenticate suppressed intrinsic caution");
    // Model a malformed snapshot written by an earlier implementation via
    // INSERT, without disabling/bypassing the immutable UPDATE trigger.
    await pool.query("DELETE FROM mobile_qimen_occurrences WHERE id=$1", [f.occurrenceId]);
    const parameters = [...f.parameters];
    parameters[10] = JSON.stringify(forged); parameters[11] = forged.snapshotDigest;
    await pool.query(f.insertSql, parameters);
    const malformedNotice = structuredClone(f.notice);
    const compact = JSON.parse(malformedNotice.payload.qimenV4);
    compact.snapshotDigest = forged.snapshotDigest;
    malformedNotice.payload = { qimenV4: runtime.canonicalStringify(compact) };
    malformedNotice.messages[0].data = malformedNotice.payload;
    malformedNotice.sourceFacts.snapshotDigest = forged.snapshotDigest;
    await assert.rejects(delivery.reserve(pool, malformedNotice), /qimen_occurrence_binding_changed/u);
    assert.equal((await one("SELECT count(*)::int AS n FROM mobile_push_log WHERE user_id=$1", [f.owner])).n, 0);

    // Seed an explicitly malformed legacy persisted attempt for the retry
    // boundary test. This is not produced by the current reserve function.
    const logId = randomUUID(), attemptId = randomUUID();
    const sourceFacts = { ...malformedNotice.sourceFacts, presentationLocale: "th" };
    const providerMessage = push.prepareMessage({ category: "qimen", title: malformedNotice.title, body: malformedNotice.body,
      url: "/qimen/notification-detail", data: { ...malformedNotice.payload, notificationId: logId } }, "fcm");
    await pool.query(`INSERT INTO mobile_push_log(id,user_id,yam_key,kind,title,body,payload,source_facts,delivery_status,next_retry_at)
      VALUES($1,$2,$3,'qimen',$4,$5,$6::jsonb,$7::jsonb,'pending',now())`,
    [logId, f.owner, f.key, malformedNotice.title, malformedNotice.body, JSON.stringify(malformedNotice.payload), JSON.stringify(sourceFacts)]);
    await pool.query(`INSERT INTO mobile_push_attempts(id,push_log_id,token_id,installation_id,provider,provider_message,message_sha256,privacy_safe,status,next_retry_at)
      VALUES($1,$2,$3,$4,'fcm',$5::jsonb,$6,true,'reserved',now())`,
    [attemptId, logId, f.tokenId, f.installationId, JSON.stringify(providerMessage), delivery.messageSha256(providerMessage)]);
    await pool.query("UPDATE mobile_qimen_occurrences SET state='reserved',push_log_id=$2 WHERE id=$1", [f.occurrenceId, logId]);
    const seededReservation = { id: logId, attemptIds: [attemptId] };
    const result = await retry(f, seededReservation);
    assert.equal(result.sent.length, 0);
    const final = await attempt(seededReservation);
    assert.equal(final.last_error, "policy_attestation_changed");
    assert.equal(final.status, "dead"); assert.equal(final.send_count, 0);
    check(true, `${corruption}: rebound malformed snapshot is rejected by real reservation and legacy-seeded retry before fake provider`);
  }

  const concurrent = await occurrence(4);
  const winners = await Promise.all(Array.from({ length: 4 }, () => delivery.reserve(pool, concurrent.notice)));
  assert.equal(winners.filter(Boolean).length, 1);
  assert.equal((await one("SELECT count(*)::int AS n FROM mobile_push_log WHERE user_id=$1", [concurrent.owner])).n, 1);
  const alternate = [...concurrent.parameters]; alternate[0] = randomUUID(); alternate[3] = "different-version-key-same-logical-hour";
  await rejectsSql(concurrent.insertSql, alternate, "23505");
  const winning = winners.find(Boolean);
  const results = await Promise.all([retry(concurrent, winning), retry(concurrent, winning)]);
  assert.equal(results.reduce((total, result) => total + result.sent.length, 0), 1);
  assert.equal((await attempt(winning)).send_count, 1);
  check(true, "four real concurrent reservations and two retry workers produce one parent, one attempt, one send; logical-hour unique index survives version-key changes");
  check(externalFetches === 0, "no external provider/engine/network invocation");
  assert.deepEqual(sourceHashes(), loadedSourceHashes, "implementation/fixture bytes must remain unchanged throughout this evidence run");
  console.log(JSON.stringify({ result: "PASS", checks, providerCalls, externalFetches, database, role, migrationHashes, loadedSourceHashes, physicalReceiptProof: false }, null, 2));
} finally {
  if (pool) await pool.end();
  if (databaseCreated) {
    assert.equal(admin(`SELECT datdba::text FROM pg_database WHERE datname='${database}';`), roleOid, "cleanup only the exact database still owned by this newly created role");
    admin(`DROP DATABASE ${database};`); // No FORCE, no broad target, no initial drop.
    databaseCreated = false;
  }
  if (roleCreated) {
    assert.equal(admin(`SELECT oid::text FROM pg_roles WHERE rolname='${role}';`), roleOid, "cleanup role identity must still match the one created here");
    admin(`DROP ROLE ${role};`);
    roleCreated = false;
  }
  assert.equal(admin(`SELECT (SELECT count(*) FROM pg_database WHERE datname='${database}') + (SELECT count(*) FROM pg_roles WHERE rolname='${role}');`), "0");
  globalThis.fetch = originalFetch;
  console.log(JSON.stringify({ cleanup: "verified absent", database, role }));
}
