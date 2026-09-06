import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { buildZiweiHourlyNotificationFacts } from "../src/lib/astro/ziwei/hourly-preview";
import { buildZiweiNotice } from "./mobile-ziwei-hourly-push-cron.mts";

const require = createRequire(import.meta.url);
const runtime = require("../src/lib/ziwei-hourly-notification.cjs");
const delivery = require("../src/lib/mobile-notification-delivery.cjs");
const presentation = require("../src/lib/ziwei-hourly-presentation.cjs");
const accountId = "00000000-0000-4000-8000-000000000001";
const profileId = "00000000-0000-4000-8000-000000000002";
const occurrenceId = "00000000-0000-4000-8000-000000000003";
const installationId = "00000000-0000-4000-8000-000000000004";
const tokenId = "00000000-0000-4000-8000-000000000005";
const pushLogId = "00000000-0000-4000-8000-000000000006";
const attemptId = "00000000-0000-4000-8000-000000000007";
const facts = buildZiweiHourlyNotificationFacts({
  birthInstant: new Date("1984-12-31T06:15:00.000Z"), birthTimezone: "Asia/Bangkok", birthLocation: null,
  gender: "M", referenceInstant: new Date("2026-09-04T22:01:00.000Z"), referenceTimezone: "Asia/Bangkok",
});
const snapshot = runtime.buildZiweiHourlyNotificationSnapshot({ accountId, profile: { id: profileId, name: "Owner", isSelf: true }, facts });
const deadline = "2026-09-04T22:10:00.000Z";
const legacyCopies = delivery.localizedHistoryCopies(
  (locale: string) => runtime.buildZiweiHourlyCopy(locale, snapshot, { schema: 3 }), presentation.SUPPORTED_LOCALES,
);
// Independently captured from the original 98cd3db formatter, before clock copy.
assert.equal(createHash("sha256").update(JSON.stringify(legacyCopies)).digest("hex"),
  "e2562291bf41c75e0c25ac8f421403be6eee36c53fbed6017cef0ce9a06417e9", "all nine frozen v1 copies remain byte-exact");

function fixture(schema: 2 | 3, capability: number, provider: "fcm" | "expo", preview: boolean, locale = "th", legacy = false) {
  let notice = buildZiweiNotice({
    user_id: accountId, installation_id: installationId, profile_id: profileId, token_id: tokenId,
    device_push_token: provider === "fcm" ? "fcm-fixture" : null, device_token_type: provider === "fcm" ? "fcm" : null,
    expo_push_token: "ExponentPushToken[ziwei-v3-reservation-fixture]", platform: "android",
    ziwei_payload_schema: schema, owner_generation: 7, account_locale: "en", token_locale: "en",
  }, snapshot, occurrenceId, deadline, "a".repeat(40));
  if (legacy) notice = {
    ...notice, ...legacyCopies.th, historyCopies: legacyCopies,
    sourceFacts: { ...notice.sourceFacts, presentationVersion: "ziwei-hourly-readable-copy-v1" },
    messages: notice.messages.map((message: any) => ({ ...message, ...legacyCopies[message.locale] })),
  };
  const binding: any = {
    token_id: tokenId, token_installation_id: installationId,
    device_push_token: provider === "fcm" ? "fcm-fixture" : null, device_token_type: provider === "fcm" ? "fcm" : null,
    expo_push_token: "ExponentPushToken[ziwei-v3-reservation-fixture]", platform: "android", ziwei_payload_schema: capability,
    occurrence_id: occurrenceId, occurrence_user_id: accountId, occurrence_installation_id: installationId,
    profile_id: profileId, state: "claimed", push_log_id: null,
    lineage: facts.lineage, calculation_version: facts.calculationVersion,
    window_valid_from: facts.reference.validFrom, window_valid_until: facts.reference.validUntil,
    send_deadline: deadline, snapshot, snapshot_digest: snapshot.snapshotDigest,
    occurrence_owner_generation: 7, current_owner_generation: 7, current_installation_enabled: true, current_profile_id: profileId,
  };
  const captured: { sql: string[]; parent?: any; attempt?: any; reserved: boolean; rollback: boolean } = {
    sql: [], reserved: false, rollback: false,
  };
  const db = {
    async query(sql: string, params: any[] = []) {
      captured.sql.push(sql);
      if (sql === "BEGIN" || sql === "COMMIT") return { rows: [], rowCount: 0 };
      if (sql === "ROLLBACK") { captured.rollback = true; return { rows: [], rowCount: 0 }; }
      if (/FROM users u LEFT JOIN mobile_notification_prefs/u.test(sql)) {
        assert.deepEqual(params, [accountId]);
        return { rows: [{ timezone: "Asia/Bangkok", locale, privacy_preview: preview, has_prefs: true, max_per_day: 0 }] };
      }
      if (/JOIN mobile_ziwei_hourly_occurrences o/u.test(sql)) {
        assert.match(sql, /FOR UPDATE OF t,o,i/u);
        assert.deepEqual(params, [tokenId, accountId, occurrenceId]);
        return { rows: [binding] };
      }
      if (/INSERT INTO mobile_push_log/u.test(sql)) {
        captured.parent = { title: params[3], body: params[4], payload: JSON.parse(params[5]), source_facts: JSON.parse(params[6]) };
        return { rows: [{ id: pushLogId }] };
      }
      if (/INSERT INTO mobile_push_attempts/u.test(sql)) {
        captured.attempt = { provider: params[3], provider_message: JSON.parse(params[4]), message_sha256: params[5], privacy_safe: params[6] };
        return { rows: [{ id: attemptId }] };
      }
      if (/UPDATE mobile_ziwei_hourly_occurrences SET state='reserved'/u.test(sql)) {
        assert.deepEqual(params, [occurrenceId, pushLogId]); captured.reserved = true; return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected query in isolated in-memory Ziwei fixture: ${sql.slice(0, 100)}`);
    },
  };
  return { notice, binding, captured, db };
}

let accepted = 0;
for (const locale of ["th", "en", "zh", "cn", "vi", "ja", "ru", "ko", "es"]) {
  for (const mode of ["v2", "readable-v1", "readable-v2"]) for (const provider of ["fcm", "expo"] as const) for (const preview of [false, true]) {
    const schema = mode === "v2" ? 2 : 3;
    const f = fixture(schema, 3, provider, preview, locale, mode === "readable-v1");
    const original = JSON.stringify(f.notice);
    assert.deepEqual(await delivery.reserve(f.db, f.notice), { id: pushLogId, attemptIds: [attemptId] });
    assert.equal(JSON.stringify(f.notice), original, "reservation cannot rewrite the original notice");
    const publicCopy = runtime.buildZiweiHourlyCopy(locale, snapshot, { schema, presentationVersion: f.notice.sourceFacts.presentationVersion });
    assert.equal(f.captured.parent.title, publicCopy.title);
    assert.equal(f.captured.parent.body, publicCopy.body);
    const visible = provider === "fcm" ? f.captured.attempt.provider_message.notification : f.captured.attempt.provider_message;
    const expected = preview ? publicCopy : runtime.buildZiweiHourlyPrivateCopy(locale);
    assert.equal(visible.title, expected.title, "locked current account locale, not the stale claim/token locale, controls phone copy");
    assert.equal(visible.body, expected.body, "phone copy and localized history must agree when preview is enabled");
    const data = provider === "fcm" ? JSON.parse(f.captured.attempt.provider_message.data.body) : f.captured.attempt.provider_message.data;
    assert.deepEqual(data, { ...f.notice.payload, notificationId: pushLogId });
    assert.equal(f.captured.reserved, true);
    const sealedRow = { ...f.captured.parent, ...f.captured.attempt, user_id: accountId, push_log_id: pushLogId, yam_key: f.notice.key };
    const occurrence = {
      occurrence_user_id: accountId, occurrence_profile_id: profileId, occurrence_state: "reserved", occurrence_key: f.notice.key,
      occurrence_owner_generation: 7, lineage: facts.lineage, calculation_version: facts.calculationVersion,
      window_key: facts.reference.windowKey, window_valid_from: facts.reference.validFrom, window_valid_until: facts.reference.validUntil,
      send_deadline: deadline, snapshot_digest: snapshot.snapshotDigest,
    };
    assert.equal(delivery.ziweiAttemptAttestationValid(sealedRow, snapshot, occurrence), true, "the exact newly reserved V2 or V3 message survives retry attestation");
    if (schema === 3) {
      const forgedMessage = structuredClone(sealedRow.provider_message);
      if (provider === "fcm") forgedMessage.notification = { title: sealedRow.title, body: "Unsupported lucky-hour claim" };
      else Object.assign(forgedMessage, { title: sealedRow.title, body: "Unsupported lucky-hour claim" });
      assert.equal(delivery.ziweiAttemptAttestationValid({
        ...sealedRow, body: "Unsupported lucky-hour claim", privacy_safe: false,
        provider_message: forgedMessage, message_sha256: delivery.messageSha256(forgedMessage),
      }, snapshot, occurrence), false, "matching forged history/provider/hash cannot replace snapshot-derived readable meaning");
      assert.equal(f.captured.parent.source_facts.presentationLocale, locale, "presentation locale is bound at reservation, not stale claim time");
      for (const key of ["payloadSchema", "presentationVersion", "presentationCatalogSha256", "meaningCatalogSha256", "presentationLocale"]) {
        assert.equal(delivery.ziweiAttemptAttestationValid({ ...sealedRow, source_facts: { ...sealedRow.source_facts, [key]: "forged" } }, snapshot, occurrence), false);
      }
      const otherVersion = mode === "readable-v1" ? "ziwei-hourly-readable-copy-v2" : "ziwei-hourly-readable-copy-v1";
      assert.equal(delivery.ziweiAttemptAttestationValid({
        ...sealedRow, source_facts: { ...sealedRow.source_facts, presentationVersion: otherVersion },
      }, snapshot, occurrence), false, "even another recognized copy version cannot rewrite a sealed attempt");
      if (mode === "readable-v2") {
        const title = sealedRow.title.replace("05:00", "05:01");
        assert.notEqual(title, sealedRow.title);
        const message = structuredClone(sealedRow.provider_message);
        if (provider === "fcm") message.notification = { title, body: sealedRow.body };
        else Object.assign(message, { title, body: sealedRow.body });
        assert.equal(delivery.ziweiAttemptAttestationValid({
          ...sealedRow, title, privacy_safe: false, provider_message: message, message_sha256: delivery.messageSha256(message),
        }, snapshot, occurrence), false, "forged civil time fails even with matching history/provider/hash");
      }
    }
    accepted++;
  }
}

for (const capability of [0, 1, 2, 4]) {
  const f = fixture(3, capability, "fcm", true);
  await assert.rejects(() => delivery.reserve(f.db, f.notice), /ziwei_token_capability_changed/u);
  assert.equal(f.captured.rollback, true); assert.equal(f.captured.parent, undefined); assert.equal(f.captured.attempt, undefined);
}
for (const changed of [{ current_owner_generation: 8 }, { current_installation_enabled: false }, { current_profile_id: tokenId }]) {
  const f = fixture(3, 3, "fcm", true); Object.assign(f.binding, changed);
  assert.equal(await delivery.reserve(f.db, f.notice), null); assert.equal(f.captured.parent, undefined);
}
for (const payload of [
  { ...runtime.buildZiweiHourlyProviderData(snapshot), ...runtime.buildZiweiHourlyProviderData(snapshot, { schema: 3 }) },
  { ...runtime.buildZiweiHourlyProviderData(snapshot, { schema: 3 }), url: "/ziwei/hourly" },
]) {
  const f = fixture(3, 3, "fcm", true);
  await assert.rejects(() => delivery.reserve(f.db, { ...f.notice, payload }), /ziwei_notice_schema_mismatch/u);
  assert.equal(f.captured.sql.length, 0, "bad/mixed envelope is rejected before transaction admission");
}
const provenance = fixture(3, 3, "fcm", true);
await assert.rejects(() => delivery.reserve(provenance.db, { ...provenance.notice, sourceFacts: { ...provenance.notice.sourceFacts, presentationCatalogSha256: "f".repeat(64) } }), /ziwei_notice_presentation_mismatch/u);
assert.equal(provenance.captured.parent, undefined);
const forgedHistory = fixture(3, 3, "fcm", true);
await assert.rejects(() => delivery.reserve(forgedHistory.db, {
  ...forgedHistory.notice,
  historyCopies: { ...forgedHistory.notice.historyCopies, th: { title: "Invented", body: "Unsupported lucky-hour claim" } },
}), /ziwei_notice_copy_mismatch/u);
assert.equal(forgedHistory.captured.parent, undefined, "incorrect meaning never reaches immutable history");
console.log(`ZIWEI_V3_RESERVATION_OK accepted=${accepted} versions=3 providers=2 locales=9 privacy=2 immutable_and_capability_fences=PASS (in-memory only)`);
