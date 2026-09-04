# Independent review — Ziwei hourly readable copy — 2026-09-05

Status: bounded read-only code and fixture review. This is not a production rollout signature, provider acceptance result, or authorization to enable V3 enrollment.

## Review conclusion

No blocking semantic or scope defect remains in the reviewed readable-copy implementation.

`buildZiweiHourlyReadableCopy` is an additive, explicit V3 presentation path. It does not recalculate Ziwei facts, change the existing full presentation catalog, alter `buildZiweiHourlyTypeCCopy`, or make V2 callers opt into the new copy. The readable output preserves the existing catalog's four transformation meanings verbatim and keeps each meaning associated with its actual transformation and target palace.

The reviewed tone placement remains faithful to the existing Type-C contract:

- 化祿 and 化科 appear only on the localized support line;
- 化權 appears on the drive line, whose full localized meaning still includes action, authority, and pressure rather than presenting authority as unqualified fortune;
- 化忌 appears on the caution line with the existing knot/delay/obligation meaning;
- hourly flow-star/contextual markers are excluded from the readable body, so their repeated presence is not promoted into a selective “good hour” claim.

Month, day, and hour remain three separately named focus layers. The natural fixture explicitly witnesses three different palaces — 官祿 for month, 田宅 for day, and 遷移 for hour — so the layer assertion cannot pass merely because all three labels happen to share one value.

## Locale review

The readable catalog covers exactly the nine locales supported by the full presentation catalog: Thai, English, Traditional Chinese, Simplified Chinese, Vietnamese, Japanese, Russian, Korean, and Spanish. In each locale:

- the title identifies an hourly Ziwei/chart-context reading without declaring auspiciousness;
- support, drive, caution, and three-layer labels are understandable and distinct;
- all twelve shortened palace topics retain the principal semantic anchors of their corresponding full-catalog topics;
- the four detailed transformation meanings come from the existing full catalog rather than newly invented translations;
- unknown palace names display the localized unavailable label plus `?`, not an unsourced interpretation.

Some topic labels deliberately abbreviate the fuller palace descriptions to fit a lock-screen notification. The abbreviation does not change the direction of any claim or move a marker between tones.

## Unknown-palace and evidence behavior

The final regression rebuilds a valid immutable snapshot containing a 20-character unsupported palace name. It verifies that:

- visible copy uses the localized unavailable label and does not expose the unsupported raw name as if it had a sourced meaning;
- the exact raw month, day, hour, and all transformation target-palace values survive V3 build and parse;
- the historical snapshot digest survives the round trip unchanged;
- both provider envelopes remain within the repository's conservative 4000-byte fixture guard.

This preserves the distinction between cautious lock-screen display and lossless offline detail evidence.

## Compatibility and adapter review

The opt-in bridge is narrow:

- `buildZiweiHourlyCopy(locale, snapshot, { schema: 3 })` selects readable copy;
- omitting the option still equals the existing Type-C copy;
- `buildZiweiHourlyProviderData(snapshot)` still emits `ziweiHourlyV2` by default;
- the push adapter extends the existing exact Ziwei envelope check with one alternative exact two-key shape, `notificationId` plus `ziweiHourlyV3`;
- the existing exact V2 shape and generic data filtering are unchanged.

The focused fixture also proves that Expo retains the exact V3 data keys and FCM's stringified data body parses back to the exact input envelope. Parent-reported legacy push tests and the V2 Type-C, contract, and payload suites remain green.

## Verification performed

Command:

```text
node --import tsx scripts/test-ziwei-hourly-readable-copy.mts
```

Result:

```text
ZIWEI_HOURLY_READABLE_COPY_OK locales=9 cases=126 bodyMax=361 FCM=3882B Expo=3593B
```

The catalog fingerprint also matches the implementation constant:

```text
23ea576b5cd9fb95c7102315620980dff1637e11540d7f07d10d090eb1f732e6
```

No full build, database, provider send, environment mutation, deployment, or push was performed.

## Remaining rollout boundary

The FCM witness is 118 bytes below the repository's conservative 4000-byte whole-request fixture guard. The matrix covers all supported locales, all twelve palace topics, the natural distinct-layer witness, and a maximum-length unsupported palace case, but it is still a pure fixture rather than provider acceptance evidence. A coordinated rollout should retain the runtime size guard and require bounded non-production FCM and Expo canaries for the exact V3 envelopes. This review does not enable V3 registration or certify production delivery.
