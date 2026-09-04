import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { buildZiweiHourlyNotificationFacts } from "../src/lib/astro/ziwei/hourly-preview";

const require = createRequire(import.meta.url);
const runtime = require("../src/lib/ziwei-hourly-notification.cjs");
const facts = buildZiweiHourlyNotificationFacts({
  birthInstant: new Date("1984-12-31T06:15:00.000Z"), birthTimezone: "Asia/Bangkok",
  birthLocation: { lat: 13.7563, lng: 100.5018 }, gender: "M",
  referenceInstant: new Date("2026-08-26T12:30:00.000Z"), referenceTimezone: "Asia/Bangkok",
});
const input = {
  accountId: "00000000-0000-4000-8000-000000000001",
  profile: { id: "00000000-0000-4000-8000-000000000002", name: "Owner", isSelf: true }, facts,
};
const snapshot = runtime.buildZiweiHourlyNotificationSnapshot(input);
const v2 = runtime.buildZiweiHourlyProviderData(snapshot);
const v3 = runtime.buildZiweiHourlyProviderData(snapshot, { schema: 3 });
assert.deepEqual(Object.keys(v2), ["ziweiHourlyV2"], "historical/default clients stay V2");
assert.deepEqual(Object.keys(v3), ["ziweiHourlyV3"], "V3 requires explicit selection");
assert.deepEqual(runtime.parseZiweiHourlyProviderData(v3), runtime.parseZiweiHourlyProviderData(v2),
  "every field, tuple order, null and snapshot digest must survive losslessly");
console.log("PASS Ziwei V3 lossless baseline", { v2: Buffer.byteLength(JSON.stringify(v2)), v3: Buffer.byteLength(JSON.stringify(v3)) });

const codec = require("../src/lib/ziwei-hourly-wire-v3.cjs");
const clone = (value: any): any => JSON.parse(JSON.stringify(value));
const wire = (tuple: unknown) => ({ ziweiHourlyV3: Buffer.from(JSON.stringify(tuple)).toString("base64url") });
const compact = runtime.parseZiweiHourlyProviderData(v2);
const tuple = codec.packZiweiHourlyWireV3(compact);
assert.deepEqual(codec.unpackZiweiHourlyWireV3(tuple), compact);
assert.equal(JSON.stringify(codec.packZiweiHourlyWireV3(compact)), Buffer.from(v3.ziweiHourlyV3, "base64url").toString("utf8"));

for (const [label, mutate] of [
  ["wrong wire version", (t: any) => { t[0] = 2; }],
  ["unknown tuple field", (t: any) => { t.push(1); }],
  ["missing layer", (t: any) => { t.pop(); }],
  ["negative reference", (t: any) => { t[2][0] = -1; }],
  ["fractional reference", (t: any) => { t[2][0] = 0.5; }],
  ["string reference", (t: any) => { t[2][0] = "0"; }],
  ["out of bounds reference", (t: any) => { t[2][0] = t[1].length; }],
  ["duplicate string", (t: any) => { t[1].push(t[1][0]); }],
  ["unused string", (t: any) => { t[1].push("unused"); }],
  ["oversized table", (t: any) => { t[1] = Array.from({ length: 129 }, (_, i) => String(i)); }],
  ["oversized string", (t: any) => { t[1][0] = "x".repeat(301); }],
  ["oversized total strings", (t: any) => { t[1] = Array.from({ length: 21 }, (_, i) => String(i).padEnd(300, "x")); }],
  ["wrong row width", (t: any) => { t[3][6][0].push(0); }],
  ["missing flow star", (t: any) => { t[4][6].pop(); }],
  ["null required star", (t: any) => { t[3][6][0][0] = null; }],
  ["null required flow palace", (t: any) => { t[5][7][0][1] = null; }],
  ["invalid lunar month", (t: any) => { t[3][0] = 13; }],
  ["invalid lunar day", (t: any) => { t[4][1] = 31; }],
  ["invalid hour", (t: any) => { t[5][2] = 13; }],
  ["invalid boolean", (t: any) => { t[3][1] = 0; }],
] as const) {
  const bad = clone(tuple); mutate(bad);
  assert.equal(codec.unpackZiweiHourlyWireV3(bad), null, label);
  assert.equal(runtime.parseZiweiHourlyProviderData(wire(bad)), null, label);
}

for (const [label, mutate] of [
  ["invalid account", (c: any) => { c.accountId = "bad"; }],
  ["invalid profile", (c: any) => { c.profileId = "bad"; }],
  ["wrong lineage", (c: any) => { c.lineage = "invented"; }],
  ["wrong source calculation", (c: any) => { c.calculationVersion = "invented"; }],
  ["invalid date", (c: any) => { c.day.dateISO = "2026-02-30"; }],
  ["wrong day identity", (c: any) => { c.day.dateISO = "2026-08-25"; }],
  ["wrong window", (c: any) => { c.windowKey = c.windowKey.replace("2026-08-26", "2026-08-25"); }],
  ["stale bounds", (c: any) => { c.validUntil = "2026-08-25T14:00:00.000Z"; }],
  ["invalid digest", (c: any) => { c.snapshotDigest = "x".repeat(64); }],
  ["foreign URL", (c: any) => { c.url = "/other"; }],
  ["duplicate transformation", (c: any) => { c.hour.siHua[1][1] = c.hour.siHua[0][1]; }],
] as const) {
  const bad = clone(compact); mutate(bad);
  assert.equal(runtime.parseZiweiHourlyProviderData(wire(codec.packZiweiHourlyWireV3(bad))), null, label);
}
for (const source of [
  ` ${JSON.stringify(tuple)}`, JSON.stringify(tuple).replace("[3,", "[3.0,"),
  JSON.stringify(tuple).replace("[3,", "[3e0,"),
  JSON.stringify(tuple).replace('[0,1,2,', '[-0,1,2,'),
  JSON.stringify(tuple).replace("[3,", '[{"v":3,"v":3},'),
]) assert.equal(runtime.parseZiweiHourlyProviderData({ ziweiHourlyV3: Buffer.from(source).toString("base64url") }), null,
  "noncanonical or duplicate-key JSON rejected");
for (const encoded of ["", "a".repeat(3501), `${v3.ziweiHourlyV3}=`, `${v3.ziweiHourlyV3}+`,
  Buffer.from([0xc0, 0xaf]).toString("base64url"), Buffer.from([0xed, 0xa0, 0x80]).toString("base64url")]) {
  assert.equal(runtime.parseZiweiHourlyProviderData({ ziweiHourlyV3: encoded }), null);
}
assert.equal(runtime.parseZiweiHourlyProviderData({ ...v2, ...v3 }), null);
assert.equal(runtime.parseZiweiHourlyProviderData({ ...v3, url: "/other" }), null);

let getterCalls = 0;
for (const mutate of [
  (t: any) => { t.extra = 1; },
  (t: any) => { t[Symbol("custom")] = 1; },
  (t: any) => { Object.setPrototypeOf(t, {}); },
  (t: any) => { delete t[2][0]; },
  (t: any) => { Object.defineProperty(t[3][6][0], "0", { get() { getterCalls++; return 0; } }); },
  (t: any) => { t[5][7].toJSON = () => { getterCalls++; return []; }; },
]) { const bad = clone(tuple); mutate(bad); assert.equal(codec.unpackZiweiHourlyWireV3(bad), null); }
assert.equal(runtime.parseZiweiHourlyProviderData(Object.defineProperty({}, "ziweiHourlyV3", {
  enumerable: true, get() { getterCalls++; return v3.ziweiHourlyV3; },
})), null);
assert.equal(getterCalls, 0, "capture never invokes accessors or toJSON");

const nullFacts = clone(facts);
for (const name of ["liuYue", "liuRi", "liuShi"]) {
  nullFacts.layers[name].siHua[0].palaceName = null;
  nullFacts.layers[name].siHua[0].branch = null;
}
const nullSnapshot = runtime.buildZiweiHourlyNotificationSnapshot({ ...input, facts: nullFacts });
assert.deepEqual(runtime.parseZiweiHourlyProviderData(runtime.buildZiweiHourlyProviderData(nullSnapshot, { schema: 3 })),
  runtime.parseZiweiHourlyProviderData(runtime.buildZiweiHourlyProviderData(nullSnapshot)), "null placements in all three layers survive");

// Actual engine snapshots, all 13 time indices, with no fake facts or altered names.
export const snapshots = [snapshot, nullSnapshot];
for (let hour = 0; hour < 24; hour += 1) {
  const generated = buildZiweiHourlyNotificationFacts({
    birthInstant: new Date("1984-12-31T06:15:00.000Z"), birthTimezone: "Asia/Bangkok",
    birthLocation: null, gender: "M", referenceInstant: new Date(Date.UTC(2026, 7, 26, hour)), referenceTimezone: "Asia/Bangkok",
  });
  snapshots.push(runtime.buildZiweiHourlyNotificationSnapshot({ ...input, facts: generated }));
}
// Explicit synthetic size stress, not scientific evidence: maximum accepted 20-char palace label.
const stressFacts = clone(facts);
const stressPalace = "พระราชวังทดสอบ".padEnd(20, "宮");
for (const [layerName, starName] of [["liuYue", "monthlyStars"], ["liuRi", "dailyStars"], ["liuShi", "hourlyStars"]]) {
  const layer = stressFacts.layers[layerName];
  layer.mingPalaceName = stressPalace;
  for (const row of [...layer.siHua, ...layer[starName]]) row.palaceName = stressPalace;
}
snapshots.push(runtime.buildZiweiHourlyNotificationSnapshot({ ...input, facts: stressFacts }));
const measured: any[] = [];
const mobile = process.env.ZIWEI_MOBILE_ROOT ? await import(pathToFileURL(`${process.env.ZIWEI_MOBILE_ROOT}/src/ziwei/hourlyNotificationContract.ts`).href) : null;
const mobileCodec = process.env.ZIWEI_MOBILE_ROOT ? await import(pathToFileURL(`${process.env.ZIWEI_MOBILE_ROOT}/src/ziwei/hourlyWireV3.ts`).href) : null;
for (const current of snapshots) {
  const oldData = runtime.buildZiweiHourlyProviderData(current);
  const data = runtime.buildZiweiHourlyProviderData(current, { schema: 3 });
  const expected = runtime.parseZiweiHourlyProviderData(oldData);
  assert.deepEqual(runtime.parseZiweiHourlyProviderData(data), expected);
  const packed = codec.packZiweiHourlyWireV3(expected);
  if (mobile && mobileCodec) {
    assert.deepEqual(mobileCodec.packZiweiHourlyWireV3(expected), packed, "backend/mobile pack parity");
    assert.deepEqual(mobileCodec.unpackZiweiHourlyWireV3(packed), expected, "backend/mobile unpack parity");
    const envelope = { notificationId: "00000000-0000-4000-8000-000000000099", ...data };
    const resolved = mobile.parseZiweiHourlyProviderPayload(envelope, input.accountId);
    assert.ok(resolved); assert.equal(mobile.isResolvedZiweiHourlyNotificationPayload(resolved), true);
    if (oldData.ziweiHourlyV2.length <= 3500) assert.deepEqual(resolved,
      mobile.parseZiweiHourlyProviderPayload({ notificationId: envelope.notificationId, ...oldData }, input.accountId));
  }
  for (const locale of ["th", "en", "zh", "cn", "vi", "ja", "ru", "ko", "es"]) {
    let copy = { title: "", body: "" };
    let legacyCopyAvailable = true;
    try { copy = runtime.buildZiweiHourlyCopy(locale, current); }
    catch (error) {
      // Legacy presentation cannot render every maximum-length stress label;
      // codec headroom is measured independently, without changing legacy copy.
      if (!(error instanceof RangeError) || error.message !== "ziwei_hourly_copy_too_long") throw error;
      legacyCopyAvailable = false;
    }
    const request = { to: `ExponentPushToken[${"x".repeat(22)}]`, title: copy.title, body: copy.body,
      sound: "default", channelId: "ziwei-hourly", data: { notificationId: "00000000-0000-4000-8000-000000000099", ...data } };
    const bytes = Buffer.byteLength(JSON.stringify(request));
    const dataBytes = Buffer.byteLength(JSON.stringify(data));
    const envelopeBytes = bytes - Buffer.byteLength(copy.title) - Buffer.byteLength(copy.body);
    assert.ok(envelopeBytes + 1200 <= 4000, `1200 visible-text bytes must fit: ${envelopeBytes}, ${locale}`);
    measured.push({ locale, dataBytes, requestBytes: bytes, legacyCopyAvailable, visibleTextHeadroom: 4000 - envelopeBytes });
  }
}
console.log("PASS Ziwei V3 bounds, malformed corpus, all-field roundtrip and 9-locale size matrix", {
  snapshots: snapshots.length, cases: measured.length, crossRuntime: !!mobile,
  maxDataBytes: Math.max(...measured.map(x => x.dataBytes)),
  maxLegacyCopyRequestBytes: Math.max(...measured.map(x => x.requestBytes)),
  legacyCopyStressRejected: measured.filter(x => !x.legacyCopyAvailable).length,
  minVisibleTextHeadroom: Math.min(...measured.map(x => x.visibleTextHeadroom)),
});

// Optional integration probe; presentation belongs to the separately reviewed copy change.
if (process.env.ZIWEI_READABLE_COPY_MATRIX === "1") {
  const presentation = require("../src/lib/ziwei-hourly-presentation.cjs");
  const push = require("../src/lib/push-send.cjs");
  let maxFcm = 0, maxExpo = 0;
  const failures: unknown[] = [];
  for (const [index, current] of snapshots.entries()) {
    for (const locale of ["th", "en", "zh", "cn", "vi", "ja", "ru", "ko", "es"]) {
      try {
        const copy = presentation.buildZiweiHourlyReadableCopy(locale, current);
        const data = { notificationId: "00000000-0000-4000-8000-000000000099", ...runtime.buildZiweiHourlyProviderData(current, { schema: 3 }) };
        const input = { category: "ziwei", ...copy, url: "/ziwei/hourly", transactional: false, data };
        const fcm = Buffer.byteLength(JSON.stringify({ message: { token: "f".repeat(256), ...push.prepareMessage(input, "fcm") } }));
        const expo = Buffer.byteLength(JSON.stringify({ to: `ExponentPushToken[${"e".repeat(32)}]`, ...push.prepareMessage(input, "expo") }));
        maxFcm = Math.max(maxFcm, fcm); maxExpo = Math.max(maxExpo, expo);
        if (fcm > 4000 || expo > 4000) failures.push({ index, locale, fcm, expo });
      } catch (error) { failures.push({ index, locale, error: String(error) }); }
    }
  }
  console.log("READABLE_COPY_INTEGRATION_PROBE", { maxFcm, maxExpo, failures });
}
