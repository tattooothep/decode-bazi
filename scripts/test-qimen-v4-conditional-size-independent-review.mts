import assert from "node:assert/strict";
import { createRequire } from "node:module";

// Controlled advisory-policy inputs and synthetic full-grid contracts, not
// actual historical engine outputs. No DB, network or production edits.
const require = createRequire(import.meta.url);
const runtime = require("../src/lib/qimen-three-layer-notification.cjs");
const seasonal = require("../src/lib/qimen-seasonal-vigor.cjs");
const advisory = require("../src/lib/qimen-notification-advisory.cjs");
const fixture = require("./fixtures/qimen-three-layer-valid-snapshot-v4.cjs");
const engine = require("./fixtures/qimen-seasonal-engine-witness.cjs");
const presentation = require("../src/lib/qimen-notification-presentation.cjs");
const catalog = require("../src/lib/qimen-component-catalog.cjs");
const push = require("../src/lib/push-send.cjs");
const canonicalBuilder = require("../src/lib/qimen-canonical-occurrence-builder.cjs");
const accountId = "11111111-1111-4111-8111-111111111111";
const notificationId = "22222222-2222-4222-8222-222222222222";
const size = (value: unknown) => Buffer.byteLength(JSON.stringify(value), "utf8");
const ordinaryMethod = "STANDARD_FIVE_ELEMENT_DOOR_MONTH_V1";
const globalWarnings = ["NEAR_HOUR_BOUNDARY", "LARGE_TIME_CORRECTION", "NEAR_SOLAR_TERM_START"];
const flagWarnings: Record<string, string> = { KONG_WANG: "is_void_any", MEN_PO: "is_men_po", RU_MU: "is_ru_mu" };
const stemWarnings = [
  "GUI_OVER_REN", "GUI_OVER_JI", "XIN_OVER_BING", "BING_OVER_GUI", "JI_OVER_DING", "BING_OVER_XIN",
  "GUI_OVER_GENG", "JI_OVER_BING", "JI_OVER_WU", "REN_OVER_GUI", "XIN_OVER_WU", "YI_OVER_WU",
].map(code => `STEM_RESPONSE_${code}`);
const warningCodes = [...globalWarnings, ...Object.keys(flagWarnings), "TENG_SHE_YAO_JIAO", ...stemWarnings];
const warningSets: string[][] = [[], ...warningCodes.map(code => [code])];
for (let a = 0; a < warningCodes.length; a += 1) for (let b = a + 1; b < warningCodes.length; b += 1) {
  // A palace has one source-governed stem_response, not two simultaneous tuples.
  if (warningCodes[a].startsWith("STEM_RESPONSE_") && warningCodes[b].startsWith("STEM_RESPONSE_")) continue;
  warningSets.push([warningCodes[a], warningCodes[b]]);
}
assert.equal(warningCodes.length, 19);
assert.equal(warningSets.length, 125);
const canonicalSets: string[][] = [];
const bridge = { snapshots: 0, envelopes: 0, rejectedCopies: 0, maxBodyChars: 0, maxSealedBytes: 0,
  maxFcmNotificationAndDataJsonBytes: 0, maxFcmKeyValueBytes: 0, maxExpoFullBytes: 0 };
const bridgeHour = advisory.trueSolarShichenWindow({ instant: "2026-06-22T03:00:00.000Z",
  longitude: 100.5018, timezone: "Asia/Bangkok" });
const bridgeAt = new Date(Date.parse(bridgeHour.startAt) + 6 * 60_000);
for (const warnings of warningSets) {
  const input = engine.build(bridgeAt);
  const selected = input.palaces.find((palace: any) => palace.direction === "SE");
  selected.beginner_reading.code = "caution";
  for (const code of warnings) {
    if (globalWarnings.includes(code)) input.warnings.push({ code });
    else if (flagWarnings[code]) selected[flagWarnings[code]] = true;
    else if (code.startsWith("STEM_RESPONSE_")) selected.stem_response = {
      code: code.slice("STEM_RESPONSE_".length), quality: "bad", severity: "caution", is_source_governed: true,
    };
    else selected.classical_flags.push({ code, severity: "caution" });
  }
  const result = advisory.buildQimenAdvisory({ data: input }, {
    timezone: "Asia/Bangkok", longitude: 100.5018, purpose: "travel", schema: 4, doorMethod: ordinaryMethod,
  });
  assert.equal(result?.recommendation, "recommended", warnings.join("+"));
  assert.equal(result?.decisionClass, "conditional");
  assert.equal(result?.direction.code, "SE");
  assert.equal(result?.readingCode, "caution");
  assert.deepEqual([...result.canonicalWarningCodes].sort(), [...warnings].sort());
  canonicalSets.push([...result.canonicalWarningCodes]);
  const snapshot = await canonicalBuilder.buildCanonicalQimenOccurrence({
    user_id: accountId, installation_id: "33333333-3333-4333-8333-333333333333", latitude: 13.7563, longitude: 100.5018,
    location_timezone: "Asia/Bangkok", purpose: "travel",
  }, bridgeAt, {
    schema: 4, doorMethod: ordinaryMethod,
    fetchCanonicalQimenEngineSnapshot: async () => ({ result: input }),
  });
  assert.ok(snapshot);
  assert.equal(runtime.verifyQimenThreeLayerSnapshotV4(snapshot), true);
  assert.deepEqual(snapshot.hourDecision.reasonCodes,
    ["hour_conditional_good", "hour_reading_caution", ...result.canonicalWarningCodes.map((code: string) => `hour_warning_${code}`)]);
  bridge.snapshots += 1;
  for (const locale of ["th", "en", "zh"]) {
    let copy;
    try { copy = presentation.buildQimenCopy(locale, snapshot); }
    catch (error: any) {
      if (!(error instanceof RangeError) || error.message !== "qimen_copy_too_long") throw error;
      bridge.rejectedCopies += 1; continue;
    }
    bridge.maxBodyChars = Math.max(bridge.maxBodyChars, copy.body.length);
    for (const provider of ["fcm", "expo"] as const) {
      const prepared = JSON.parse(JSON.stringify(push.prepareMessage({
        ...copy, category: "qimen", transactional: false,
        data: { ...runtime.buildQimenV4ProviderData(snapshot), notificationId },
        url: "/qimen/notification-detail",
      }, provider)));
      const visible = provider === "fcm" ? prepared.notification : prepared;
      assert.deepEqual({ title: visible.title, body: visible.body }, copy);
      bridge.envelopes += 1;
      bridge.maxSealedBytes = Math.max(bridge.maxSealedBytes, size(prepared));
      if (provider === "fcm") {
        bridge.maxFcmNotificationAndDataJsonBytes = Math.max(bridge.maxFcmNotificationAndDataJsonBytes,
          size({ notification: prepared.notification, data: prepared.data }));
        const keyValues = [prepared.notification, prepared.data].reduce((total, fields) => total
          + Object.entries(fields).reduce((subtotal, [key, value]) => subtotal
            + Buffer.byteLength(key, "utf8") + Buffer.byteLength(String(value), "utf8"), 0), 0);
        bridge.maxFcmKeyValueBytes = Math.max(bridge.maxFcmKeyValueBytes, keyValues);
      } else bridge.maxExpoFullBytes = Math.max(bridge.maxExpoFullBytes,
        size({ to: `ExponentPushToken[${"e".repeat(256)}]`, ...prepared }));
    }
  }
}

type Sample = {
  method: string; pillar: string; locale: string; warnings: string[]; provider: "fcm" | "expo";
  bodyChars: number; sealedBytes: number; httpBodyBytes: number;
  notificationAndDataJsonBytes: number | null; notificationAndDataKeyValueBytes: number | null;
};
let noSupportingPairCases = 0;
let hardIneligibleCases = 0;
let validSnapshots = 0;
let excludedOverWarningCap = 0;
let baselineTooManyWarnings = 0;
let rejectedCopies = 0;
const firstRejectedCopies: unknown[] = [];
const maxByLocaleProvider = new Map<string, Sample>();
const firstOverflows: unknown[] = [];
const totals = { envelopes: 0, sealedOver4000: 0, httpOver4000: 0, httpOver4096: 0,
  fcmNotificationAndDataJsonOver4096: 0, fcmNotificationAndDataKeyValuesOver4096: 0, expoFullOver4096: 0 };

for (const method of Object.keys(seasonal.DOOR_METHODS)) {
  for (const pillar of ["甲子", "乙丑", "丙寅", "丁卯", "戊辰", "己巳", "庚午", "辛未", "壬申", "癸酉", "甲戌", "乙亥"]) {
    const base = fixture.input(accountId, method);
    const pillars = { ...base.layers.month.contextEvidence, monthPillarZh: pillar };
    for (const layer of ["month", "day"]) base.layers[layer] = fixture.contextLayer(
      layer, base.layers[layer].validFrom, base.layers[layer].validUntil, pillars,
    );
    base.layers.hour.contextEvidence = seasonal.buildSeasonalVigorEvidence({
      monthPillarZh: pillar, monthBoundaryClock: seasonal.MONTH_BOUNDARY_CLOCK,
      monthValidFrom: base.layers.month.validFrom, monthValidUntil: base.layers.month.validUntil, doorMethod: method,
    });
    const maps = seasonal.separatedVigorForMonthPillar(pillar, method);
    for (const palace of base.layers.hour.palaces) {
      palace.starVigor = maps.star.byStarCode[palace.starCode];
      palace.doorVigor = palace.direction === "C" ? null : maps.door.byDoorCode[palace.doorCode];
    }
    const status = fixture.supportingDirectionStatus(base);
    if (status.kind !== "admissible") {
      assert.throws(() => fixture.selectSupportingDirection(base),
        status.kind === "no_supporting_pair" ? /qimen_fixture_no_supporting_direction/u : /qimen_fixture_supporting_directions_intrinsically_ineligible/u);
      assert.throws(() => runtime.buildQimenThreeLayerSnapshotV4(base), /QIMEN_THREE_LAYER_SNAPSHOT_INVALID/u);
      if (status.kind === "no_supporting_pair") noSupportingPairCases += 1;
      else hardIneligibleCases += 1;
      fixture.arrangeSyntheticAdmissibleDirection(base);
    } else fixture.selectSupportingDirection(base);
    const selected = base.layers.hour.palaces.find((palace: any) => palace.direction === base.selectedDirection);
    const mandatoryIntrinsicWarnings = ["deity", "door", "star"].filter(kind => {
      const component = catalog.resolveQimenComponent(kind, selected[`${kind}Code`]);
      return ["bad", "inauspicious", "xiong", "avoid", "danger"].includes(component.baseQuality);
    }).map(kind => `INTRINSIC_${kind.toUpperCase()}_BAD`);
    if (mandatoryIntrinsicWarnings.length > 2) { baselineTooManyWarnings += 1; continue; }
    for (const additionalWarnings of canonicalSets) {
      const warnings = [...mandatoryIntrinsicWarnings, ...additionalWarnings];
      if (warnings.length > 2) { excludedOverWarningCap += 1; continue; }
      const input = structuredClone(base);
      input.hourDecision.reasonCodes = ["hour_conditional_good", "hour_reading_caution",
        ...warnings.map(code => `hour_warning_${code}`)];
      const snapshot = runtime.buildQimenThreeLayerSnapshotV4(input);
      assert.equal(runtime.verifyQimenThreeLayerSnapshotV4(snapshot), true);
      validSnapshots += 1;
      for (const locale of ["th", "en", "zh"]) {
        let copy;
        try { copy = presentation.buildQimenCopy(locale, snapshot); }
        catch (error: any) {
          if (!(error instanceof RangeError) || error.message !== "qimen_copy_too_long") throw error;
          rejectedCopies += 1;
          if (firstRejectedCopies.length < 8) firstRejectedCopies.push({ method, pillar, locale, warnings, reason: error.message });
          continue;
        }
        assert.ok(copy.body.length <= 400);
        for (const provider of ["fcm", "expo"] as const) {
          const prepared = JSON.parse(JSON.stringify(push.prepareMessage({
            ...copy, category: "qimen", transactional: false,
            data: { ...runtime.buildQimenV4ProviderData(snapshot), notificationId },
            url: "/qimen/notification-detail",
          }, provider)));
          const visible = provider === "fcm" ? prepared.notification : prepared;
          assert.deepEqual({ title: visible.title, body: visible.body }, copy, "no silent truncation is allowed in measurement");
          const full = provider === "fcm" ? { message: { token: "f".repeat(256), ...prepared } }
            : { to: `ExponentPushToken[${"e".repeat(256)}]`, ...prepared };
          const notificationAndData = provider === "fcm" ? { notification: prepared.notification, data: prepared.data } : null;
          const sample: Sample = {
            method, pillar, locale, warnings, provider, bodyChars: copy.body.length,
            sealedBytes: size(prepared), httpBodyBytes: size(full),
            notificationAndDataJsonBytes: notificationAndData ? size(notificationAndData) : null,
            notificationAndDataKeyValueBytes: provider === "fcm"
              ? [prepared.notification, prepared.data].reduce((total, fields) => total
                + Object.entries(fields).reduce((subtotal, [key, value]) => subtotal
                  + Buffer.byteLength(key, "utf8") + Buffer.byteLength(String(value), "utf8"), 0), 0) : null,
          };
          totals.envelopes += 1;
          if (sample.sealedBytes > 4_000) totals.sealedOver4000 += 1;
          if (sample.httpBodyBytes > 4_000) totals.httpOver4000 += 1;
          if (sample.httpBodyBytes > 4_096) totals.httpOver4096 += 1;
          if (sample.notificationAndDataJsonBytes! > 4_096) totals.fcmNotificationAndDataJsonOver4096 += 1;
          if (sample.notificationAndDataKeyValueBytes! > 4_096) totals.fcmNotificationAndDataKeyValuesOver4096 += 1;
          if (provider === "expo" && sample.httpBodyBytes > 4_096) totals.expoFullOver4096 += 1;
          if (sample.sealedBytes > 4_000 && firstOverflows.length < 8) firstOverflows.push(sample);
          const key = `${locale}/${provider}`;
          if (!maxByLocaleProvider.has(key) || maxByLocaleProvider.get(key)!.sealedBytes < sample.sealedBytes) maxByLocaleProvider.set(key, sample);
        }
      }
    }
  }
}
assert.equal(noSupportingPairCases, 4);
assert.equal(hardIneligibleCases, 16);
assert.equal(totals.envelopes + rejectedCopies * 2, validSnapshots * 6);
console.log(JSON.stringify({ result: "QIMEN_V4_CONDITIONAL_SIZE_INDEPENDENT_MEASUREMENT",
  policyAdmittedWarningSets: canonicalSets.length, warningCodes: warningCodes.length,
  validSnapshots, noSupportingPairCases, hardIneligibleCases, excludedOverWarningCap, baselineTooManyWarnings, rejectedCopies, totals,
  canonicalBuilderControlledEngineBridge: bridge,
  maxByLocaleProvider: [...maxByLocaleProvider.values()], firstRejectedCopies, firstOverflows,
  noSilentTruncation: true, network: 0,
}, null, 2));
