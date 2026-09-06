import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { buildZiweiHourlyNotificationFacts } from "../src/lib/astro/ziwei/hourly-preview";
import { buildZiweiNotice } from "./mobile-ziwei-hourly-push-cron.mts";

const require = createRequire(import.meta.url);
const runtime = require("../src/lib/ziwei-hourly-notification.cjs");
const presentation = require("../src/lib/ziwei-hourly-presentation.cjs");
const push = require("../src/lib/push-send.cjs");
const accountId = "00000000-0000-4000-8000-000000000001";
const profileId = "00000000-0000-4000-8000-000000000002";
const notificationId = "00000000-0000-4000-8000-000000000003";
const version = "ziwei-hourly-readable-copy-v2";
const options = { schema: 3, presentationVersion: version };
const witnesses = [
  ["Asia/Bangkok", "2026-09-04T22:01:00.000Z", "2026-09-05 05:00–07:00 UTC+07:00"],
  ["Asia/Bangkok", "2026-09-06T16:01:00.000Z", "2026-09-06 23:00–2026-09-07 01:00 UTC+07:00"],
  ["Asia/Bangkok", "2026-12-31T16:01:00.000Z", "2026-12-31 23:00–2027-01-01 01:00 UTC+07:00"],
  ["America/New_York", "2026-03-08T06:30:00.000Z", "2026-03-08 01:00 UTC-05:00–03:00 UTC-04:00"],
  ["America/New_York", "2026-11-01T05:30:00.000Z", "2026-11-01 01:00 UTC-04:00–03:00 UTC-05:00"],
  ["America/New_York", "2026-11-01T06:30:00.000Z", "2026-11-01 01:00 UTC-04:00–03:00 UTC-05:00"],
  ["Asia/Kathmandu", "2026-09-05T01:20:00.000Z", "2026-09-05 07:00–09:00 UTC+05:45"],
  ["UTC", "2026-09-05T05:01:00.000Z", "2026-09-05 05:00–07:00 UTC+00:00"],
] as const;
let cases = 0, maxFcmBytes = 0, maxExpoBytes = 0, maxTitle = 0;
for (const [timezone, instant, clock] of witnesses) {
  const facts = buildZiweiHourlyNotificationFacts({
    birthInstant: new Date("1984-12-31T06:15:00.000Z"), birthTimezone: "Asia/Bangkok", birthLocation: null,
    gender: "M", referenceInstant: new Date(instant), referenceTimezone: timezone,
  });
  for (const palace of [null, "命宮", "兄弟", "夫妻", "子女", "財帛", "疾厄", "遷移", "僕役", "官祿", "田宅", "福德", "父母", "ก".repeat(20)]) {
    const fixtureFacts = structuredClone(facts) as any;
    if (palace !== null) for (const key of ["liuYue", "liuRi", "liuShi"]) {
      fixtureFacts.layers[key].mingPalaceName = palace;
      for (const entry of fixtureFacts.layers[key].siHua) entry.palaceName = palace;
    }
    const snapshot = runtime.buildZiweiHourlyNotificationSnapshot({ accountId, profile: { id: profileId, name: "Owner", isSelf: true }, facts: fixtureFacts });
    const before = JSON.stringify(snapshot);
    const payload = runtime.buildZiweiHourlyProviderData(snapshot, { schema: 3 });
    for (const locale of presentation.SUPPORTED_LOCALES) {
      const legacy = runtime.buildZiweiHourlyCopy(locale, snapshot, { schema: 3 });
      const copy = runtime.buildZiweiHourlyCopy(locale, snapshot, options);
      assert.equal(copy.title, `${legacy.title} · ${clock}`, "new copy must include the actual frozen civil interval and offsets");
      assert.equal(copy.body, legacy.body, "adding a clock cannot remove meaning, raw stars, palaces, or any layer");
      assert.deepEqual(runtime.buildZiweiHourlyCopy(locale, snapshot, { schema: 3, presentationVersion: "ziwei-hourly-readable-copy-v1" }), legacy);
      // The old, smaller V2 budget can reject synthetic long raw names. Preserve
      // that result as well; this change cannot silently upgrade V2 transports.
      let oldV2;
      try { oldV2 = presentation.buildZiweiHourlyTypeCCopy(locale, snapshot); }
      catch (error) { assert.throws(() => runtime.buildZiweiHourlyCopy(locale, snapshot), { message: (error as Error).message }); }
      if (oldV2) assert.deepEqual(runtime.buildZiweiHourlyCopy(locale, snapshot), oldV2);
      assert.ok(copy.title.length <= 120 && copy.body.length <= 400);
      const input = { category: "ziwei", ...copy, url: "/ziwei/hourly", transactional: false, data: { ...payload, notificationId } };
      const fcm = push.prepareMessage(input, "fcm"), expo = push.prepareMessage(input, "expo");
      assert.deepEqual(fcm.notification, copy, "provider must not silently truncate the clock or meanings");
      assert.equal(expo.title, copy.title); assert.equal(expo.body, copy.body);
      assert.deepEqual(JSON.parse(fcm.data.body), input.data);
      assert.deepEqual(expo.data, input.data);
      const fcmBytes = Buffer.byteLength(JSON.stringify({ message: { token: "f".repeat(256), ...fcm } }));
      const expoBytes = Buffer.byteLength(JSON.stringify({ to: `ExponentPushToken[${"e".repeat(32)}]`, ...expo }));
      assert.ok(fcmBytes <= 4000, `${locale}/${timezone}/${palace}: FCM ${fcmBytes} B`);
      assert.ok(expoBytes <= 4000, `${locale}/${timezone}/${palace}: Expo ${expoBytes} B`);
      maxFcmBytes = Math.max(maxFcmBytes, fcmBytes); maxExpoBytes = Math.max(maxExpoBytes, expoBytes);
      maxTitle = Math.max(maxTitle, copy.title.length); cases++;
    }
    assert.equal(JSON.stringify(snapshot), before, "copy cannot rewrite immutable facts or dates");
    assert.throws(() => runtime.buildZiweiHourlyCopy("th", snapshot, { schema: 3, presentationVersion: "unknown" }), /ziwei_hourly_copy_version_invalid/u);
    const notice = buildZiweiNotice({
      user_id: accountId, profile_id: profileId, installation_id: notificationId, token_id: notificationId,
      owner_generation: 7, ziwei_payload_schema: 3, account_locale: "th", platform: "android",
    }, snapshot, notificationId, new Date(Date.parse(facts.reference.validFrom) + 600_000).toISOString(), "a".repeat(40));
    assert.equal(notice.sourceFacts.presentationVersion, version, "new production notices explicitly select clock copy");
    assert.equal(notice.messages[0].title, runtime.buildZiweiHourlyCopy("th", snapshot, options).title);
    assert.deepEqual(notice.payload, payload, "clock is presentation-only; no wire upgrade or extra notification");
  }
}
console.log(`ZIWEI_HOURLY_CLOCK_COPY_OK locales=9 windows=8 cases=${cases} titleMax=${maxTitle} FCM=${maxFcmBytes}B Expo=${maxExpoBytes}B`);
