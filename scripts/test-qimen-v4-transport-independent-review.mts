import assert from "node:assert/strict";
import { createRequire } from "node:module";

// Independent review harness: public retry worker, in-memory SQL responses only.
// The send-start hook stops every allowed attempt before any sender invocation.
const require = createRequire(import.meta.url);
const delivery = require("../src/lib/mobile-notification-delivery.cjs");
const push = require("../src/lib/push-send.cjs");
const runtime = require("../src/lib/qimen-three-layer-notification.cjs");
const presentation = require("../src/lib/qimen-notification-presentation.cjs");
const seasonal = require("../src/lib/qimen-seasonal-vigor.cjs");
const accountId = "11111111-1111-4111-8111-111111111111";
const installationId = "22222222-2222-4222-8222-222222222222";
const pushLogId = "33333333-3333-4333-8333-333333333333";
const tokenId = "44444444-4444-4444-8444-444444444444";
const attemptId = "55555555-5555-4555-8555-555555555555";
const stopBeforeProvider = new Error("INDEPENDENT_REVIEW_STOP_BEFORE_PROVIDER");
const failures: string[] = [];
let checks = 0;

function fixture(schema: 2 | 3 | 4, provider: "fcm" | "expo" = "fcm") {
  const file = schema === 2 ? "./fixtures/qimen-three-layer-valid-snapshot.cjs"
    : `./fixtures/qimen-three-layer-valid-snapshot-v${schema}.cjs`;
  const snapshot = require(file).build(accountId, Object.keys(seasonal.DOOR_METHODS)[0]);
  const payload = runtime[`buildQimenV${schema}ProviderData`](snapshot);
  const copy = schema === 2 ? { title: "Historical V2", body: "Historical immutable copy" }
    : presentation.buildQimenCopy("th", snapshot);
  const deadline = new Date(Date.parse(snapshot.layers.hour.validFrom) + 600_000).toISOString();
  const message = JSON.parse(JSON.stringify(push.prepareMessage({
    ...copy, category: "qimen", transactional: false,
    data: { ...payload, notificationId: pushLogId }, url: "/qimen/notification-detail",
  }, provider)));
  const row: any = {
    id: attemptId, push_log_id: pushLogId, token_id: tokenId,
    installation_id: installationId, user_id: accountId, kind: "qimen",
    yam_key: `qimen|historical-independent-${schema}`,
    ...copy, payload, provider, provider_message: message,
    message_sha256: delivery.messageSha256(message), privacy_safe: true,
    transactional: false, status: "retry_due", lease_token: "review-lease",
    send_count: 1, send_started_at: null,
    source_facts: {
      snapshotDigest: snapshot.snapshotDigest, selectedDirection: snapshot.selectedDirection,
      calculationVersion: snapshot.versionTuple.hour, eventEndAt: snapshot.layers.hour.validUntil,
      sendDeadline: deadline,
      ...(schema === 4 ? { seasonalEvidence: snapshot.layers.hour.contextEvidence, presentationLocale: "th" } : {}),
    },
  };
  const occurrence: any = {
    enabled: true, location_permission: "foreground",
    location_captured_at: snapshot.layers.hour.validFrom,
    location_expires_at: new Date(Date.parse(snapshot.layers.hour.validFrom) + 86_400_000).toISOString(),
    location_timezone: "Asia/Bangkok", quiet_start: 0, quiet_end: 0,
    occurrence_user_id: accountId, occurrence_installation_id: installationId,
    occurrence_state: "reserved", occurrence_key: row.yam_key,
    selected_direction: snapshot.selectedDirection, version_tuple: snapshot.versionTuple,
    hour_valid_from: snapshot.layers.hour.validFrom, hour_valid_until: snapshot.layers.hour.validUntil,
    send_deadline: deadline, snapshot, snapshot_digest: snapshot.snapshotDigest,
  };
  return { row, occurrence, snapshot };
}

async function run(f: ReturnType<typeof fixture>, capability = 4) {
  let started = 0;
  let occurrenceReads = 0;
  let blockedReason: string | null = null;
  let senderCalls = 0;
  const db = {
    async query(sql: string, args: any[] = []) {
      const result = (rows: any[] = []) => ({ rows, rowCount: rows.length });
      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) return result();
      if (sql.includes("WHERE status IN ('reserved','retry_due') AND send_started_at IS NOT NULL")) return result();
      if (sql.includes("WITH candidate AS") && sql.includes("target.id AS target_token_id")) return result([f.row]);
      if (sql.includes("pg_advisory_unlock(")) return result([{ unlocked: true }]);
      if (sql.includes("pg_advisory_lock(" ) || sql.includes("pg_advisory_xact_lock(")) return result();
      if (sql.includes("SELECT l.kind FROM mobile_push_log")) return result([{ kind: "qimen" }]);
      if (sql.includes("SELECT a.*,l.user_id,l.yam_key")) return result([f.row]);
      if (sql.includes("SELECT t.id,t.device_push_token,t.expo_push_token")) return result([{
        id: tokenId, device_push_token: "INERT_FCM_REVIEW_TARGET", expo_push_token: "INERT_EXPO_REVIEW_TARGET",
        qimen_payload_schema: capability,
      }]);
      if (sql.includes("FROM users u LEFT JOIN mobile_notification_prefs")) return result([{
        account_active: true, account_tier: "paid", account_sub_expires_at: "2027-01-01T00:00:00Z",
        account_trial_ends_at: null, timezone: "Asia/Bangkok", privacy_preview: false,
        has_prefs: true, prefs: { qimen_enabled: true, quiet_start: 0, quiet_end: 0 },
        now_at: new Date(Date.parse(f.snapshot.layers.hour.validFrom) + 120_000),
      }]);
      if (sql.includes("JOIN mobile_qimen_occurrences o")) {
        occurrenceReads += 1;
        return result(f.occurrence ? [f.occurrence] : []);
      }
      if (sql.includes("UPDATE mobile_push_attempts SET token_id=$3,send_count=send_count+1")) return result([f.row]);
      if (sql.includes("SELECT id FROM mobile_push_log WHERE id=$1 FOR UPDATE")) return result([{ id: pushLogId }]);
      if (sql.includes("UPDATE mobile_push_attempts SET status=$3")) {
        blockedReason = args[4];
        return result([{ push_log_id: pushLogId }]);
      }
      if (sql.includes("WITH child AS")) return result();
      throw new Error(`Unmocked query: ${sql.slice(0, 110)}`);
    },
  };
  try {
    await delivery.runRetryBatch(db, {
      limit: 1, concurrency: 1,
      sender: { async sendPrepared() { senderCalls += 1; throw new Error("PROVIDER_MUST_NOT_RUN"); } },
      hooks: { afterSendStarted() { started += 1; throw stopBeforeProvider; } },
    });
  } catch (error) {
    if (error !== stopBeforeProvider) throw error;
  }
  assert.equal(senderCalls, 0);
  return { started, occurrenceReads, blockedReason };
}

for (const schema of [2, 3, 4] as const) for (const provider of ["fcm", "expo"] as const) {
  const f = fixture(schema, provider);
  assert.equal(delivery.qimenAttemptAttestationValid(f.row, f.snapshot, f.occurrence), true);
  assert.deepEqual(await run(f), { started: 1, occurrenceReads: 1, blockedReason: null },
    `historical V${schema} ${provider} retries remain readable by capability 4`);
  checks += 1;
}

for (const versionKey of ["month", "day", "hour", "combined"]) {
  const f = fixture(4);
  f.occurrence.version_tuple = { ...f.occurrence.version_tuple, [versionKey]: "forged-review-version" };
  const result = await run(f);
  assert.equal(result.started, 0);
  assert.equal(result.blockedReason, "policy_attestation_changed");
  checks += 1;
}

for (const [name, mutate] of [
  ["mixed V4/V3 envelope", (row: any) => { row.payload = { ...row.payload, qimenV3: "corrupt" }; }],
  ["extra URL envelope", (row: any) => { row.payload = { ...row.payload, url: "/today" }; }],
  ["unknown V5 envelope", (row: any) => { row.payload = { qimenV5: row.payload.qimenV4 }; }],
  ["missing envelope", (row: any) => { row.payload = {}; }],
] as const) {
  const f = fixture(4);
  mutate(f.row);
  // This must not reinterpret a previously attested occurrence as old generic
  // Qimen, bypass consent and location, or send to a downgraded capability.
  f.occurrence.enabled = false;
  f.occurrence.location_permission = "denied";
  const result = await run(f, 1);
  if (result.started !== 0) failures.push(`${name}: send-start reached; occurrence reads=${result.occurrenceReads}; capability=1`);
  checks += 1;
}

const stripped = fixture(4);
stripped.row.payload = {};
stripped.row.source_facts = { eventEndAt: stripped.snapshot.layers.hour.validUntil };
const strippedResult = await run(stripped, 1);
assert.equal(strippedResult.started, 0, "a persisted modern occurrence remains authoritative after all parent attestation markers are stripped");
assert.equal(strippedResult.occurrenceReads, 1);
checks += 1;

for (const marker of ["payload", "snapshotDigest", "seasonalEvidence"]) {
  const f = fixture(4);
  f.occurrence = null;
  if (marker !== "payload") f.row.payload = {};
  f.row.source_facts = {
    eventEndAt: f.snapshot.layers.hour.validUntil,
    ...(marker === "snapshotDigest" ? { snapshotDigest: f.snapshot.snapshotDigest } : {}),
    ...(marker === "seasonalEvidence" ? { seasonalEvidence: f.snapshot.layers.hour.contextEvidence } : {}),
  };
  const result = await run(f, 1);
  assert.equal(result.started, 0, `${marker} modern provenance without an occurrence must fail closed`);
  assert.equal(result.occurrenceReads, 1);
  checks += 1;
}

const legacy = fixture(2);
legacy.occurrence = null;
legacy.row.payload = { v: 1, kind: "qimen", url: "/today" };
legacy.row.source_facts = { eventEndAt: legacy.snapshot.layers.hour.validUntil };
assert.deepEqual(await run(legacy, 1), { started: 1, occurrenceReads: 1, blockedReason: null },
  "genuine pre-occurrence generic Qimen remains eligible under its original account consent/expiry policy");
checks += 1;

console.log(`QIMEN_TRANSPORT_INDEPENDENT_REVIEW checks=${checks} failures=${failures.length} network=0 database=mock`);
assert.deepEqual(failures, [], failures.join("\n"));
