import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { buildZiweiHourlyNotificationFacts } from "../src/lib/astro/ziwei/hourly-preview";

const require = createRequire(import.meta.url);
const runtime = require("../src/lib/ziwei-hourly-notification.cjs");
const presentation = require("../src/lib/ziwei-hourly-presentation.cjs");
const facts = buildZiweiHourlyNotificationFacts({
  birthInstant: new Date("1984-12-31T06:15:00.000Z"), birthTimezone: "Asia/Bangkok",
  birthLocation: null, gender: "M", referenceInstant: new Date("2026-09-04T22:00:00.000Z"),
  referenceTimezone: "Asia/Bangkok",
});
const accountId = "00000000-0000-4000-8000-000000000001";
const profile = { id: "00000000-0000-4000-8000-000000000002", name: "Owner", isSelf: true };
const snapshot = runtime.buildZiweiHourlyNotificationSnapshot({ accountId, profile, facts });
assert.equal(new Set([facts.layers.liuYue.mingPalaceName, facts.layers.liuRi.mingPalaceName, facts.layers.liuShi.mingPalaceName]).size, 3,
  "the real witness must have distinct month/day/hour focuses, not three identical labels");
// Before the opt-in replacement exists this executes the production copy path,
// reproducing loss of meaning rather than failing on a missing new export.
const readableCopy = presentation.buildZiweiHourlyReadableCopy ?? presentation.buildZiweiHourlyTypeCCopy;
const thai = readableCopy("th", snapshot);
assert.match(thai.title, /จื่อเว่ย/u, "Thai users must be able to read the notification's science name");
assert.match(thai.body, /โอกาส/u, "support needs an actual meaning, not only a Chinese identifier");
assert.match(thai.body, /กดดัน/u, "authority/action must not be advertised as unqualified good fortune");
assert.match(thai.body, /ติดขัด/u, "caution must explain the concern");
assert.doesNotMatch(thai.body, /天馬|紅鸞|天喜/u, "constant contextual stars are not selective hourly reasons");
const catalog = require("../src/lib/ziwei-hourly-readable-copy-catalog.json");
const push = require("../src/lib/push-send.cjs");
assert.equal(presentation.READABLE_COPY_VERSION, catalog.version);
assert.deepEqual(catalog.supportedLocales, presentation.SUPPORTED_LOCALES);
assert.equal(createHash("sha256").update(readFileSync("src/lib/ziwei-hourly-readable-copy-catalog.json")).digest("hex"),
  presentation.READABLE_COPY_CATALOG_SHA256, "reviewable copy source fingerprint");
const notificationId = "00000000-0000-4000-8000-000000000003";
const palaceNames = ["命宮", "兄弟", "夫妻", "子女", "財帛", "疾厄", "遷移", "僕役", "官祿", "田宅", "福德", "父母"];
let maxFcmBytes = 0, maxExpoBytes = 0, maxBodyCharacters = 0;
for (const locale of catalog.supportedLocales) {
  const C = catalog.locales[locale];
  assert.equal(Object.keys(C.topics).length, 12);
  for (const palace of [null, ...palaceNames]) {
    const fixtureFacts = structuredClone(facts) as any;
    if (palace !== null) {
      for (const key of ["liuYue", "liuRi", "liuShi"]) {
        fixtureFacts.layers[key].mingPalaceName = palace;
        for (const item of fixtureFacts.layers[key].siHua) item.palaceName = palace;
      }
    }
    const fixture = runtime.buildZiweiHourlyNotificationSnapshot({ accountId, profile, facts: fixtureFacts });
    const before = JSON.stringify(fixture);
    const copy = readableCopy(locale, fixture);
    assert.deepEqual(runtime.buildZiweiHourlyCopy(locale, fixture, { schema: 3 }), copy, "explicit V3 copy bridge selects the readable presentation");
    assert.deepEqual(runtime.buildZiweiHourlyCopy(locale, fixture), presentation.buildZiweiHourlyTypeCCopy(locale, fixture), "default V2 copy is unchanged");
    assert.equal(JSON.stringify(fixture), before, "presentation cannot alter the science facts or historical digest");
    const view = presentation.buildZiweiHourlyPresentation(locale, fixture);
    assert.ok(copy.title.startsWith(C.title));
    const toneLines = { supportive: copy.body.split("\n")[0], drive: copy.body.split("\n")[1], caution: copy.body.split("\n")[2] };
    for (const marker of view.layers.hour.transformations) {
      assert.ok(toneLines[marker.tone as keyof typeof toneLines].includes(`${marker.meaning}→${C.topics[marker.focus.canonicalPalace]}(${marker.raw}/${marker.focus.rawPalace})`),
        `${locale}/${palace}: meaning, raw star and actual target palace must remain in the correct tone line`);
    }
    for (const star of view.layers.hour.flowStars) assert.ok(!copy.body.includes(star.canonicalStar),
      `${locale}/${palace}: repeated flow-star presence is not a selective hourly judgment`);
    for (const key of ["month", "day", "hour"]) {
      const focus = view.layers[key].focus;
      assert.ok(copy.body.includes(`${C[key]} ${C.topics[focus.canonicalPalace]}(${focus.rawPalace})`),
        `${locale}/${palace}: ${key} stays named, localized and inspectable`);
    }
    assert.ok(copy.title.length <= 120 && copy.body.length <= 400);
    maxBodyCharacters = Math.max(maxBodyCharacters, copy.body.length);
    const provider = runtime.buildZiweiHourlyProviderData(fixture, { schema: 3 });
    const input = { category: "ziwei", ...copy, url: "/ziwei/hourly", transactional: false, data: { ...provider, notificationId } };
    const fcm = push.prepareMessage(input, "fcm");
    const expo = push.prepareMessage(input, "expo");
    assert.deepEqual(Object.keys(expo.data).sort(), Object.keys(input.data).sort(), "Expo must retain the exact strict V3 offline envelope");
    assert.deepEqual(JSON.parse(fcm.data.body), input.data, "FCM must retain the exact strict V3 offline envelope");
    assert.equal(fcm.notification.body, copy.body, "provider cannot silently trim meaning");
    assert.equal(expo.body, copy.body);
    const fcmBytes = Buffer.byteLength(JSON.stringify({ message: { token: "f".repeat(256), ...fcm } }), "utf8");
    const expoBytes = Buffer.byteLength(JSON.stringify({ to: `ExponentPushToken[${"e".repeat(32)}]`, ...expo }), "utf8");
    maxFcmBytes = Math.max(maxFcmBytes, fcmBytes);
    maxExpoBytes = Math.max(maxExpoBytes, expoBytes);
    assert.ok(fcmBytes <= 4000, `${locale}/${palace}: FCM ${fcmBytes} B > 4000 B guard`);
    assert.ok(expoBytes <= 4000, `${locale}/${palace}: Expo ${expoBytes} B > 4000 B guard`);
    assert.ok(runtime.buildZiweiHourlyProviderData(fixture).ziweiHourlyV2, "legacy enrollment remains V2 until coordinated rollout");
  }
}
for (const locale of catalog.supportedLocales) {
  const unknownFacts = structuredClone(facts) as any;
  for (const key of ["liuYue", "liuRi", "liuShi"]) {
    unknownFacts.layers[key].mingPalaceName = "ก".repeat(20);
    for (const item of unknownFacts.layers[key].siHua) item.palaceName = "ก".repeat(20);
  }
  const unknown = runtime.buildZiweiHourlyNotificationSnapshot({ accountId, profile, facts: unknownFacts });
  const copy = runtime.buildZiweiHourlyCopy(locale, unknown, { schema: 3 });
  assert.ok(copy.body.includes(catalog.locales[locale].unavailable));
  assert.ok(copy.body.length <= 400);
  const provider = runtime.buildZiweiHourlyProviderData(unknown, { schema: 3 });
  const expanded = runtime.parseZiweiHourlyProviderData(provider);
  for (const key of ["month", "day", "hour"]) {
    assert.equal(expanded[key].mingPalaceName, "ก".repeat(20), "unsupported raw names remain intact for detail inspection");
    for (const row of expanded[key].siHua) assert.equal(row[2], "ก".repeat(20));
  }
  assert.equal(expanded.snapshotDigest, unknown.snapshotDigest, "valid immutable digest survives transport unchanged");
  const input = { category: "ziwei", ...copy, url: "/ziwei/hourly", transactional: false, data: { ...provider, notificationId } };
  const fcm = push.prepareMessage(input, "fcm"), expo = push.prepareMessage(input, "expo");
  const fcmBytes = Buffer.byteLength(JSON.stringify({ message: { token: "f".repeat(256), ...fcm } }));
  const expoBytes = Buffer.byteLength(JSON.stringify({ to: `ExponentPushToken[${"e".repeat(32)}]`, ...expo }));
  assert.ok(fcmBytes <= 4000, `${locale}/unknown FCM ${fcmBytes} B > 4000 B`);
  assert.ok(expoBytes <= 4000, `${locale}/unknown Expo ${expoBytes} B > 4000 B`);
  maxFcmBytes = Math.max(maxFcmBytes, fcmBytes);
  maxExpoBytes = Math.max(maxExpoBytes, expoBytes);
  maxBodyCharacters = Math.max(maxBodyCharacters, copy.body.length);
}
for (const badType of ["祿", "unknown"]) {
  const invalid = structuredClone(snapshot);
  invalid.facts.layers.liuShi.siHua[1].type = badType;
  assert.throws(() => readableCopy("th", invalid), /ziwei_hourly_readable_transformations_invalid/u);
}
assert.deepEqual(readableCopy("unsupported-locale", snapshot), readableCopy("en", snapshot));
console.log(JSON.stringify({ title: thai.title, body: thai.body }));
console.log(`ZIWEI_HOURLY_READABLE_COPY_OK locales=9 cases=126 bodyMax=${maxBodyCharacters} FCM=${maxFcmBytes}B Expo=${maxExpoBytes}B`);
