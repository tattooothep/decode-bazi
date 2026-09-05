import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const delivery = require("../src/lib/mobile-notification-delivery.cjs");
const push = require("../src/lib/push-send.cjs");
const qimen = require("../src/lib/qimen-three-layer-notification.cjs");
const presentation = require("../src/lib/qimen-notification-presentation.cjs");
const scheduler = require("./mobile-qimen-push-cron.cjs");
const seasonal = require("../src/lib/qimen-seasonal-vigor.cjs");
const v2Fixture = require("./fixtures/qimen-three-layer-valid-snapshot.cjs");
const v3Fixture = require("./fixtures/qimen-three-layer-valid-snapshot-v3.cjs");
const v4Fixture = require("./fixtures/qimen-three-layer-valid-snapshot-v4.cjs");

const accountId = "00000000-0000-4000-8000-000000000001";
const otherAccountId = "00000000-0000-4000-8000-000000000002";
const occurrenceId = "00000000-0000-4000-8000-000000000003";
const installationId = "00000000-0000-4000-8000-000000000004";
const tokenId = "00000000-0000-4000-8000-000000000005";
const pushLogId = "00000000-0000-4000-8000-000000000006";
const attemptId = "00000000-0000-4000-8000-000000000007";
const method = Object.keys(seasonal.DOOR_METHODS)[0];
const v4Snapshot = v4Fixture.build(accountId, method);
const v3Snapshot = v3Fixture.build(accountId);
const deadline = new Date(Date.parse(v4Snapshot.layers.hour.validFrom) + 10 * 60_000).toISOString();
const selectedHourPalace = v4Snapshot.layers.hour.palaces.find((palace: any) => palace.direction === v4Snapshot.selectedDirection);
assert.ok(selectedHourPalace);
assert.ok(["旺", "相"].includes(selectedHourPalace.starVigor));
assert.ok(["旺", "相"].includes(selectedHourPalace.doorVigor),
  "the transport fixture must be a genuinely V4-admissible selected hour, not a synthetic weak-pair bypass");

const historicalCopySha256: Record<string, string> = {
  th: "787acb7e2fbd8943e317ee3eea5e252cef20c5840e663577e38dc359a98b74d2",
  en: "24ac71c0bfef94ecb081e933ace54de70208ffa16daeaee359f11b43b8b46673",
  zh: "35f7318424178e68ca4083cf091f210b834e89bf41ac14867eb91b28b57b5ac1",
};
for (const locale of ["th", "en", "zh"]) {
  const copy = presentation.buildQimenCopy(locale, v3Snapshot);
  assert.deepEqual(scheduler.buildQimenCopy(locale, v3Snapshot), copy);
  assert.equal(createHash("sha256").update(JSON.stringify(copy)).digest("hex"), historicalCopySha256[locale],
    `extracting pure presentation cannot change existing Qimen V3 ${locale} copy bytes`);
}
const presentationSource = readFileSync(new URL("../src/lib/qimen-notification-presentation.cjs", import.meta.url), "utf8");
assert.doesNotMatch(presentationSource,
  /require\(["'][^"']*(?:mobile-qimen-push-cron|mobile-notification-delivery|heartbeat|worker)[^"']*["']\)|require\(["']pg["']\)|function loadEnv|process\.env/iu,
  "retry presentation must not initialize cron, DB, environment, heartbeat, or worker code");

type Provider = "fcm" | "expo";

function fixture(snapshot: any, capability: number, provider: Provider, preview: boolean, locale = "th") {
  const token = {
    user_id: accountId,
    token_id: tokenId,
    device_push_token: provider === "fcm" ? "f".repeat(256) : null,
    device_token_type: provider === "fcm" ? "fcm" : null,
    expo_push_token: provider === "expo" ? `ExponentPushToken[${"e".repeat(256)}]` : null,
    platform: "android",
    token_locale: "en",
  };
  const notice = snapshot.snapshotSchema === 2 ? {
    userId: accountId,
    key: "qimen|legacy-v2-fixture",
    kind: "qimen",
    qimenOccurrenceId: occurrenceId,
    title: "Qimen historical V2",
    body: "Immutable historical occurrence",
    historyCopies: {
      th: { title: "Qimen historical V2", body: "Immutable historical occurrence" },
      en: { title: "Qimen historical V2", body: "Immutable historical occurrence" },
      zh: { title: "Qimen historical V2", body: "Immutable historical occurrence" },
    },
    payload: qimen.buildQimenV2ProviderData(snapshot),
    sourceFacts: {
      eventEndAt: snapshot.layers.hour.validUntil,
      sendDeadline: deadline,
      snapshotDigest: snapshot.snapshotDigest,
      selectedDirection: snapshot.selectedDirection,
      calculationVersion: snapshot.versionTuple.hour,
    },
    messages: [{
      tokenId, deviceToken: token.device_push_token, deviceTokenType: token.device_token_type,
      expoToken: token.expo_push_token, platform: token.platform, locale: "en", category: "qimen",
      title: "Qimen historical V2", body: "Immutable historical occurrence",
      url: "/qimen/notification-detail", data: qimen.buildQimenV2ProviderData(snapshot),
    }],
  } : scheduler.buildQimenNotice(token, snapshot, occurrenceId, deadline);
  const binding: any = {
    token_id: tokenId,
    token_installation_id: installationId,
    device_push_token: provider === "fcm" ? "f".repeat(256) : null,
    device_token_type: provider === "fcm" ? "fcm" : null,
    expo_push_token: provider === "expo" ? `ExponentPushToken[${"e".repeat(256)}]` : null,
    platform: "android",
    qimen_payload_schema: capability,
    occurrence_id: occurrenceId,
    occurrence_user_id: accountId,
    occurrence_installation_id: installationId,
    occurrence_key: notice.key,
    state: "claimed",
    push_log_id: null,
    selected_direction: snapshot.selectedDirection,
    snapshot_digest: snapshot.snapshotDigest,
    snapshot,
    hour_valid_from: snapshot.layers.hour.validFrom,
    hour_valid_until: snapshot.layers.hour.validUntil,
    send_deadline: deadline,
    version_tuple: snapshot.versionTuple,
    snapshot_account_id: accountId,
    snapshot_purpose: "travel",
  };
  const captured: { queries: string[]; parent?: any; attempt?: any; reserved: boolean; rollback: boolean } = {
    queries: [], reserved: false, rollback: false,
  };
  const db = {
    async query(sql: string, params: any[] = []) {
      captured.queries.push(sql);
      if (sql === "BEGIN" || sql === "COMMIT") return { rows: [], rowCount: 0 };
      if (sql === "ROLLBACK") { captured.rollback = true; return { rows: [], rowCount: 0 }; }
      if (/FROM users u LEFT JOIN mobile_notification_prefs/u.test(sql)) {
        assert.deepEqual(params, [accountId]);
        return { rows: [{ timezone: "Asia/Bangkok", locale, privacy_preview: preview, has_prefs: true, max_per_day: 0 }] };
      }
      if (/JOIN mobile_qimen_occurrences o/u.test(sql)) {
        assert.match(sql, /FOR UPDATE OF t,o/u);
        assert.deepEqual(params, [tokenId, accountId, occurrenceId]);
        return { rows: [binding] };
      }
      if (/INSERT INTO mobile_push_log/u.test(sql)) {
        captured.parent = {
          title: params[3], body: params[4], payload: JSON.parse(params[5]), source_facts: JSON.parse(params[6]),
        };
        return { rows: [{ id: pushLogId }] };
      }
      if (/INSERT INTO mobile_push_attempts/u.test(sql)) {
        captured.attempt = {
          provider: params[3], provider_message: JSON.parse(params[4]), message_sha256: params[5], privacy_safe: params[6],
        };
        return { rows: [{ id: attemptId }] };
      }
      if (/UPDATE mobile_qimen_occurrences SET state='reserved'/u.test(sql)) {
        assert.deepEqual(params, [occurrenceId, pushLogId]);
        captured.reserved = true;
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected query in isolated Qimen fixture: ${sql.slice(0, 120)}`);
    },
  };
  return { notice, binding, captured, db };
}

assert.equal(typeof delivery.qimenPayloadDescriptor, "function");
assert.equal(typeof delivery.qimenTokenSupportsPayload, "function");
assert.equal(typeof delivery.qimenAttemptAttestationValid, "function");

const payloads = [
  { schema: 2, payload: qimen.buildQimenV2ProviderData(v2Fixture.build(accountId)) },
  { schema: 3, payload: qimen.buildQimenV3ProviderData(v3Snapshot) },
  { schema: 4, payload: qimen.buildQimenV4ProviderData(v4Snapshot) },
];
for (const capability of [2, 3, 4, 0, 1, 5, -1, Number.NaN]) {
  for (const entry of payloads) {
    const descriptor = delivery.qimenPayloadDescriptor(entry.payload);
    assert.equal(descriptor?.schema, entry.schema);
    const expected = [2, 3, 4].includes(capability) && capability >= entry.schema;
    assert.equal(delivery.qimenTokenSupportsPayload(capability, descriptor), expected,
      `capability ${capability} / payload ${entry.schema}`);
  }
}

let accepted = 0;
for (const snapshot of [v3Snapshot, v4Snapshot]) {
  for (const locale of ["th", "en", "zh"]) for (const provider of ["fcm", "expo"] as const) for (const preview of [false, true]) {
    const f = fixture(snapshot, 4, provider, preview, locale);
    const originalNotice = JSON.stringify(f.notice);
    assert.deepEqual(await delivery.reserve(f.db, f.notice), { id: pushLogId, attemptIds: [attemptId] });
    assert.equal(JSON.stringify(f.notice), originalNotice, "reservation cannot rewrite a notice");
    assert.equal(f.captured.reserved, true);
    const expectedCopy = scheduler.buildQimenCopy(locale, snapshot);
    assert.equal(f.captured.parent.title, expectedCopy.title);
    assert.equal(f.captured.parent.body, expectedCopy.body);
    const visible = provider === "fcm" ? f.captured.attempt.provider_message.notification : f.captured.attempt.provider_message;
    assert.equal(visible.title, expectedCopy.title, "Qimen V3/V4 full copy uses the locked account locale even in private-preview mode");
    assert.equal(visible.body, expectedCopy.body);
    assert.equal(f.captured.attempt.privacy_safe, true);
    const data = provider === "fcm"
      ? JSON.parse(f.captured.attempt.provider_message.data.body) : f.captured.attempt.provider_message.data;
    const key = snapshot.snapshotSchema === 4 ? "qimenV4" : "qimenV3";
    assert.deepEqual(Object.keys(data).sort(), [key, "notificationId"].sort());
    assert.equal(data[key], f.notice.payload[key]);
    assert.equal(data.notificationId, pushLogId);
    assert.equal("url" in data, false, "the exact Qimen envelope must not receive a generic parallel route");
    assert.ok(Buffer.byteLength(JSON.stringify(f.captured.attempt.provider_message), "utf8") < 4_000,
      `${provider} Qimen V${snapshot.snapshotSchema} envelope stays inside the unchanged transport guard`);
    assert.equal(JSON.stringify(f.captured.attempt.provider_message).includes("f".repeat(256)), false);
    assert.equal(JSON.stringify(f.captured.attempt.provider_message).includes("e".repeat(256)), false);
    if (snapshot.snapshotSchema === 4) {
      assert.deepEqual(f.captured.parent.source_facts.seasonalEvidence, snapshot.layers.hour.contextEvidence);
      assert.equal(f.captured.parent.source_facts.presentationLocale, locale);
    }
    const sealedRow = {
      ...f.captured.parent,
      ...f.captured.attempt,
      user_id: accountId,
      installation_id: installationId,
      push_log_id: pushLogId,
      yam_key: f.notice.key,
    };
    const occurrence = {
      occurrence_user_id: accountId,
      occurrence_installation_id: installationId,
      occurrence_state: "reserved",
      occurrence_key: f.notice.key,
      selected_direction: snapshot.selectedDirection,
      snapshot_digest: snapshot.snapshotDigest,
      version_tuple: snapshot.versionTuple,
      hour_valid_from: snapshot.layers.hour.validFrom,
      hour_valid_until: snapshot.layers.hour.validUntil,
      send_deadline: deadline,
    };
    assert.equal(delivery.qimenAttemptAttestationValid(sealedRow, snapshot, occurrence), true,
      "the exact newly reserved V3/V4 parent, payload, provider message, and hash survive retry attestation");
    if (snapshot.snapshotSchema === 4) {
      assert.equal(delivery.qimenAttemptAttestationValid(
        sealedRow,
        snapshot,
        { ...occurrence, version_tuple: { ...occurrence.version_tuple, month: "forged-month-version" } },
      ), false, "retry binds the complete occurrence version tuple, not only its hour component");
      assert.equal(delivery.qimenAttemptAttestationValid({
        ...sealedRow,
        source_facts: { ...sealedRow.source_facts, seasonalEvidence: { ...sealedRow.source_facts.seasonalEvidence, doorMethod: "forged" } },
      }, snapshot, occurrence), false, "retry rejects a forged pinned door method");
      assert.equal(delivery.qimenAttemptAttestationValid({
        ...sealedRow,
        source_facts: { ...sealedRow.source_facts, presentationLocale: "xx" },
      }, snapshot, occurrence), false, "retry rejects a fabricated locale even when it would fall back to English copy");
      assert.equal(delivery.qimenAttemptAttestationValid({ ...sealedRow, user_id: otherAccountId }, snapshot, occurrence), false,
        "retry rejects changed ownership");
      const forgedProvider = structuredClone(sealedRow.provider_message);
      if (provider === "fcm") forgedProvider.notification.body = "invented good hour";
      else forgedProvider.body = "invented good hour";
      assert.equal(delivery.qimenAttemptAttestationValid({
        ...sealedRow, body: "invented good hour", provider_message: forgedProvider,
        message_sha256: delivery.messageSha256(forgedProvider),
      }, snapshot, occurrence), false, "matching forged parent/provider/hash cannot replace the sealed public copy");
    }
    accepted += 1;
  }
}

const v2Snapshot = v2Fixture.build(accountId);
for (const provider of ["fcm", "expo"] as const) {
  const historical = fixture(v2Snapshot, 4, provider, true, "en");
  assert.deepEqual(await delivery.reserve(historical.db, historical.notice), { id: pushLogId, attemptIds: [attemptId] },
    "transport accepts an immutable V2 reservation handoff for a capability-4 installation");
  const data = provider === "fcm"
    ? JSON.parse(historical.captured.attempt.provider_message.data.body) : historical.captured.attempt.provider_message.data;
  assert.deepEqual(Object.keys(data).sort(), ["notificationId", "qimenV2"].sort());
}

for (const capability of [0, 1, 2, 3, 5]) {
  const f = fixture(v4Snapshot, capability, "fcm", true);
  await assert.rejects(() => delivery.reserve(f.db, f.notice), /qimen_token_capability_changed/u);
  assert.equal(f.captured.rollback, true);
  assert.equal(f.captured.parent, undefined);
}

const chineseAlias = fixture(v4Snapshot, 4, "fcm", true, "cn");
assert.deepEqual(await delivery.reserve(chineseAlias.db, chineseAlias.notice), { id: pushLogId, attemptIds: [attemptId] });
assert.deepEqual(
  { title: chineseAlias.captured.parent.title, body: chineseAlias.captured.parent.body },
  scheduler.buildQimenCopy("zh", v4Snapshot),
  "the locked cn account alias resolves to the established Chinese Qimen copy",
);

for (const payload of [
  { ...qimen.buildQimenV4ProviderData(v4Snapshot), ...qimen.buildQimenV3ProviderData(v3Snapshot) },
  { ...qimen.buildQimenV4ProviderData(v4Snapshot), url: "/qimen/notification-detail" },
  { qimenV5: qimen.buildQimenV4ProviderData(v4Snapshot).qimenV4 },
  Object.assign(Object.create({ inherited: true }), qimen.buildQimenV4ProviderData(v4Snapshot)),
]) {
  const f = fixture(v4Snapshot, 4, "fcm", true);
  await assert.rejects(() => delivery.reserve(f.db, { ...f.notice, payload }), /qimen_notice_schema_mismatch/u);
  assert.equal(f.captured.queries.length, 0, "mixed/prototyped envelopes are rejected before transaction admission");
}
let accessorCalls = 0;
const accessorPayload = Object.defineProperty({}, "qimenV4", {
  enumerable: true,
  get() { accessorCalls += 1; return ftoa(qimen.buildQimenV4ProviderData(v4Snapshot).qimenV4); },
});
function ftoa(value: string) { return value; }
const accessor = fixture(v4Snapshot, 4, "fcm", true);
await assert.rejects(() => delivery.reserve(accessor.db, { ...accessor.notice, payload: accessorPayload }), /qimen_notice_schema_mismatch/u);
assert.equal(accessorCalls, 0, "schema detection never invokes an accessor");
assert.equal(accessor.captured.queries.length, 0);

const mixedItem = fixture(v4Snapshot, 4, "fcm", true);
await assert.rejects(() => delivery.reserve(mixedItem.db, {
  ...mixedItem.notice,
  messages: [{ ...mixedItem.notice.messages[0], data: { ...mixedItem.notice.payload, qimenV3: qimen.buildQimenV3ProviderData(v3Snapshot).qimenV3 } }],
}), /qimen_notice_schema_mismatch/u);
assert.equal(mixedItem.captured.parent, undefined);

let itemAccessorCalls = 0;
const accessorItem = fixture(v4Snapshot, 4, "fcm", true);
const itemData = Object.defineProperty({}, "qimenV4", {
  enumerable: true,
  get() { itemAccessorCalls += 1; return accessorItem.notice.payload.qimenV4; },
});
await assert.rejects(() => delivery.reserve(accessorItem.db, {
  ...accessorItem.notice,
  messages: [{ ...accessorItem.notice.messages[0], data: itemData }],
}), /qimen_notice_schema_mismatch/u);
assert.equal(itemAccessorCalls, 0);
assert.equal(accessorItem.captured.parent, undefined);

const forgedSource = fixture(v4Snapshot, 4, "fcm", true);
await assert.rejects(() => delivery.reserve(forgedSource.db, {
  ...forgedSource.notice,
  sourceFacts: {
    ...forgedSource.notice.sourceFacts,
    seasonalEvidence: { ...forgedSource.notice.sourceFacts.seasonalEvidence, doorMethod: "forged" },
  },
}), /qimen_occurrence_binding_changed/u);
assert.equal(forgedSource.captured.parent, undefined);

const forgedOccurrenceOwner = fixture(v4Snapshot, 4, "fcm", true);
forgedOccurrenceOwner.binding.occurrence_user_id = otherAccountId;
await assert.rejects(() => delivery.reserve(forgedOccurrenceOwner.db, forgedOccurrenceOwner.notice), /qimen_occurrence_binding_changed/u);
assert.equal(forgedOccurrenceOwner.captured.parent, undefined);

const forgedOccurrenceVersion = fixture(v4Snapshot, 4, "fcm", true);
forgedOccurrenceVersion.binding.version_tuple = {
  ...forgedOccurrenceVersion.binding.version_tuple,
  month: "forged-month-version",
};
await assert.rejects(
  () => delivery.reserve(forgedOccurrenceVersion.db, forgedOccurrenceVersion.notice),
  /qimen_occurrence_binding_changed/u,
);
assert.equal(forgedOccurrenceVersion.captured.parent, undefined,
  "reservation binds the complete occurrence version tuple before persistence");

const forgedHistory = fixture(v4Snapshot, 4, "fcm", true, "th");
await assert.rejects(() => delivery.reserve(forgedHistory.db, {
  ...forgedHistory.notice,
  historyCopies: {
    ...forgedHistory.notice.historyCopies,
    th: { title: "Invented", body: "invented good hour" },
  },
}), /qimen_notice_copy_mismatch/u);
assert.equal(forgedHistory.captured.parent, undefined, "forged public copy never reaches immutable history");

for (const provider of ["fcm", "expo"] as const) {
  const exact = push.prepareMessage({
    title: "Qimen V4", body: "month · day · hour", category: "qimen", url: "/qimen/notification-detail",
    data: { ...qimen.buildQimenV4ProviderData(v4Snapshot), notificationId: pushLogId },
  }, provider);
  const data = provider === "fcm" ? JSON.parse(exact.data.body) : exact.data;
  assert.deepEqual(Object.keys(data).sort(), ["notificationId", "qimenV4"].sort());
  assert.equal("url" in data, false);
}

const policyBase = {
  account_active: true,
  qimen_enabled: true,
  qimen_location_required: true,
  qimen_location_permission: "foreground",
  qimen_location_captured_at: v4Snapshot.layers.hour.validFrom,
  qimen_location_expires_at: new Date(Date.parse(v4Snapshot.layers.hour.validFrom) + 24 * 60 * 60_000).toISOString(),
  qimen_timezone: "Asia/Bangkok",
  qimen_quiet_start: 22,
  qimen_quiet_end: 7,
  qimen_expires_at: v4Snapshot.layers.hour.validUntil,
  qimen_send_deadline: deadline,
  qimen_attempt_attested: true,
  now_at: new Date(Date.parse(v4Snapshot.layers.hour.validFrom) + 2 * 60_000).toISOString(),
  account_tier: "paid",
  account_sub_expires_at: "2027-01-01T00:00:00.000Z",
  account_trial_ends_at: null,
};
const policyRow = {
  kind: "qimen", user_id: accountId, payload: qimen.buildQimenV4ProviderData(v4Snapshot),
  qimen_token_payload_schema: 4,
  source_facts: { eventEndAt: v4Snapshot.layers.hour.validUntil }, transactional: false, privacy_safe: true,
};
assert.deepEqual(delivery.currentPolicyDecision(policyRow, policyBase, 0), { allow: true });
assert.deepEqual(delivery.currentPolicyDecision(policyRow, { ...policyBase, qimen_attempt_attested: false }, 0), {
  allow: false, terminal: true, reason: "policy_attestation_changed",
});
assert.deepEqual(delivery.currentPolicyDecision({ ...policyRow, qimen_token_payload_schema: 3 }, policyBase, 0), {
  allow: false, terminal: true, reason: "policy_payload_schema_changed",
}, "a V4 retry cannot downgrade onto a V3 token");

const deliverySource = readFileSync(new URL("../src/lib/mobile-notification-delivery.cjs", import.meta.url), "utf8");
assert.match(deliverySource, /key === "qimenV2"[^;]+key === "qimenV3"[^;]+key === "qimenV4"/su);
assert.match(deliverySource, /const qimenAttested = qimen\.rows\.length > 0 \|\| qimenHasAttestationEvidence\(row\)/u,
  "retry classification must resolve the persisted occurrence even if a modern envelope is corrupted");

console.log(`QIMEN_V4_DURABLE_DELIVERY_OK accepted=${accepted} locales=3 providers=2 privacy=2 capability_and_retry_binding=PASS`);
