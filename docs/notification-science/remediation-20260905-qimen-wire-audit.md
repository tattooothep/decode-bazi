# Qimen seasonal-vigor wire compatibility audit — 2026-09-05

Initial read-only compatibility audit. Backend inspection began at `75b908e`; mobile at `0e95e761`. The subsequently authorized bounded backend contract implementation is recorded at the end of this report. Parent's seasonal helper work is concurrent and was not edited. No DB, external engine import, build, deployment, enrollment or door-method selection occurred.

## Decision supported by the existing contracts

Parent agreed **Qimen capability 4 + `qimenV4` + full `snapshotSchema: 4`**, retaining the existing JSON compact format. This is the smallest explicit end-to-end discriminator already supported by the architecture's versioned pattern. It does not require a new compression codec, endpoint, channel, science or remote-detail workflow. Parent also explicitly retained whole true-solar-hour bounds/containment: **no Jie splitting in this remedy**.

Do not merely append 廢 to a shared six-state allowlist or replace the global hour-version constant. That would obscure a calculation change and can invalidate all immutable V2/V3 history. A new scalar capability is necessary because currently installed capability-3 clients cannot read the new hour calculation or full evidence shape.

**Door method remains an unresolved release dependency.** This audit does not choose ordinary-five-element doors or Tongzong 暗餘氣. A final V4 method manifest must identify an explicitly approved door method and its actual source class. Ordinary-five-element provenance must say editorial/product policy, not claim a unanimous primary formula. An unselected/unknown door method must not be emitted as valid source evidence. No 廢→死 alias, fabricated source pin or silent method fallback is acceptable.

## What is actually on each surface

| Surface | Current contract and compatibility consequence |
|---|---|
| Registration | API `qimenPayloadSchema` accepts 1/2/3; DB constraint accepts 1/2/3. Mobile advertises 3 behind existing iOS permission / Android high-alert readiness gates, otherwise 1. |
| Compact push | Exact `{qimenV2: string}` or `{qimenV3: string}`, plus outer durable UUID `notificationId` after reservation. Inner keys: `v,event,accountId,notificationId,purpose,direction,hourStart,hourEnd,layers,snapshotDigest,url`. **No vigor values or full source digests are in this compact format.** V3 adds the three intrinsic component-quality fields per selected layer. |
| Compact layer | Exact `version,sourceCode,stateCode,explanationCodes,conflictCodes,unavailableCodes,deityCode,deityZh,doorCode,doorZh,starCode,starZh` plus V3 `deityBaseQuality,doorBaseQuality,starBaseQuality`. All readers pin hour version `QIMEN_ZHUANPAN_SHIJIA_CHAIBU_TST_V1`. |
| Full immutable snapshot | Schemas 2/3 include all 3×9 palaces, selected evidence, source/version tuples and SHA-256 digest. Both components' hour vigor allow only 旺相休囚死; month/day vigor must be null. V3 full validation delegates through the V2 readers, so changing only the V3 entrypoint cannot admit 廢. |
| Full source | Hour source tuple has exact external engine V6, source/closure/reference digests, closure V2, runtime and profile pins. Hour `contextEvidence` must be null; arbitrary provenance cannot be inserted there without versioned validation. External-engine closure does not attest a new application-side vigor helper. |
| Detail | Existing `/qimen/notification-detail` flow retrieves the account-owned stored occurrence using push-log UUID, verifies it server-side, then mobile binds the full snapshot to compact reference/digest/selected identities and recomputes the canonical digest. Qimen already uses this detail-fetch workflow; unlike Ziwei it is not a full offline push payload. No new fetching scheme is proposed. |
| App routing | `App.tsx:735` runtime guard explicitly accepts only resolved `v=2 || v=3`. Updating the compact parser alone would still leave V4 detail inaccessible. |

Important identities must stay distinct: outer `notificationId` is the durable push-log UUID; inner compact `notificationId` becomes mobile `snapshotReferenceId` and matches full snapshot `notificationId`. Do not conflate these while adding V4.

Relevant exact checks: backend `qimen-three-layer-notification.cjs` lines 214–236, 273–320, 469–491, 537–626, 795–912; mobile `notificationContract.ts` lines 177–240, 375–507, 525–570, 597–652, 704–856. Backend detail dispatch is `mobile-qimen-notification-detail.cjs:36`; mobile fetch/digest binding is `notificationDetailCoordinator.ts`.

## Parent-agreed V4 contract, conditional on explicit door-method choice

1. **Discriminator:** enrollment 4; outer exact `{qimenV4, notificationId}`; inner `v:4`; resolved mobile `v:4`; full `snapshotSchema:4`. Continue to accept V2/V3 under their original rules. Keep the existing event, route, compact identity and component-quality layout.
2. **Application calculation version:** use `QIMEN_ZHUANPAN_SHIJIA_CHAIBU_TST_MONTH_V2` for the new hour contract. Keep month/day versions unchanged. The V4 reader may support the two separately named reviewed door profiles, but each generated snapshot must carry exactly one explicitly selected profile. There is no production default or activation while the user's method choice is pending.
3. **Exact full provenance in the existing slot:** keep V3 top/layer/palace field names, but in V4 make `layers.hour.contextEvidence` a required non-null object with exactly `version,monthPillarZh,monthBoundaryClock,monthValidFrom,monthValidUntil,starMethod,starSourceSha256,doorMethod,doorSourceSha256,doorProvenance`. Historical V2/V3 hour `contextEvidence` remains strictly null. Pin `version` to the parent-exported application contract identifier, `starMethod` to `YANBO_NINE_STAR_MONTH_V1`, and `starSourceSha256` to `cc3a5a5dbc4742467551456b3f296efd7e7c4b36336cbb4b9133162093b5c16e`. Door method/hash/provenance must match an exact allowed profile tuple; ordinary existing product policy and Tongzong 暗餘氣 must remain distinct and never be implicit alternatives. Final door identifiers and `version` come from the parent's exported contract/helper, not invented constants in this audit.
4. **Month and source validation:** `monthPillarZh` must match the full month layer's canonical pillar; clock must match its pinned global Jie clock; month bounds must exactly match its `validFrom/validUntil` and contain the full unchanged hour. Derive the validated month branch/element from that pillar for checking per-palace states; there is no need to add those redundant fields. New full-snapshot digest covers the context object. Both backend and mobile V4 validators must reject method-inconsistent states, not simply admit five labels. Preserve the exact external `sourceTuple.hour` keys and source/closure pins: arrangement-engine code is unchanged. This context supplies application **method/source provenance**, not a claim that the external closure now covers the application helper. No synthetic code digest is needed; a future application-code closure, if desired, would be a separately scoped attestation.
5. **Separate states by method:** Yanbo hour stars use exactly 旺相休囚廢. Door states use exactly the approved door method's vocabulary and relation table. All nine stars including central 天禽 are validated; center door/deity remain null. Month/day continue `raw_context_only`, `CONTEXT_VIGOR_NOT_DEFINED` and null door/star vigor. Existing component intrinsic quality stays separate from seasonal vigor.
6. **Compact provenance binding:** retaining only the new hour `version` plus immutable `snapshotDigest` in compact V4 is sufficient for this existing selected-summary/full-detail architecture, provided V4 full parsing pins and verifies the context's method tuple. Do not put unverified method labels in visible copy or infer method from the presence of 廢. If the product requires method information before opening detail, that is an explicit copy/payload addition with its own byte test, not silently part of this contract.

The alternative, keeping `qimenV3` but adding a separately negotiated `qimenVigorContract` capability, is technically possible only with a new persisted API field, scheduler/delivery negotiation, a new full-schema discriminator, and strict method-aware mobile routing. Keeping just the existing scalar 3 cannot distinguish old/new readers. Reusing V3 with changed exact keys also weakens the meaning of its published schema. It saves **zero** bytes over renaming V3 to V4 and adds a second negotiation axis; it is not the smaller change here.

## Immutable history and rollout rules

- Freeze the historical V2/V3 version/source manifests and validators. Current backend verifiers rebuild snapshots through the **current** global manifest; changing that manifest in place will reject older calculation versions and/or regenerate different source tuples/digests. Route by snapshot schema plus its pinned version bundle before rebuilding. Do not recompute old vigor, replace 死 with 廢, insert new provenance into old JSON, or re-sign old records.
- New capability-4 mobile must read historical schemas 2/3 as historical, including their original labels and source pins. Add schema 4 as a separate strict branch, not a broad allow-any-version path.
- Preserve recovery and immutable reservation: an already claimed V3 occurrence must not be recalculated into V4 after a capability upgrade. The current reservation check is exact equality of token schema and payload schema. Deliberately model supported schemas (e.g. capable 4 can read reviewed 2/3/4) when recovering old immutable occurrences; never send new V4 to 1/2/3. Tests must cover upgrade between claim and reservation and already-reserved V3 retries.
- API/database expansion and all backend V4 consumers must precede mobile enrollment 4. Rollback must retain capability-4 registration/constraint acceptance, V4 detail verification and old immutable readers. Existing migration rollback that demotes schemas cannot be reused blindly after V4 enrollment.
- Corrected new occurrences cannot honestly be sent to old V3 clients as if they understood the new method. The operational treatment of clients that have not upgraded requires an explicit rollout/product decision; this report does not authorize silently stopping notifications, emitting corrected facts with false V1 provenance, or retaining the known-wrong classifier while claiming the remedy is active.

## Boundary contract retained by parent: whole hours, no splitting

Source audit requires a month transition inside a true-solar hour not to claim unchanged vigor across that transition. Current compact readers require **90–150 minutes**, while the builder requires exactly the engine's true-solar hour and full validators require that entire hour lie inside the month/day layer windows. The builder also explicitly rejects a day/context transition inside the hour. Parent has selected retention of this whole-hour/containment contract, not interval clipping.

Therefore V4 must keep those bounds and guards, reject any would-be snapshot spanning two canonical month windows, and retain auditable unavailable/skip evidence for that condition. Do not let source facts claim stable vigor across a Jie, broaden the month context to force containment, or silently truncate the hour. No new interval fields or changes to the logical shichen key are required for this remedy. Tests must prove both sides of every Jie and that straddling hours cannot be emitted as stable-method snapshots. This retains the existing fail-closed behavior; it does not authorize adding a new silent-notification fallback. Splitting would require a separately authorized interval/key/scheduling contract later.

## Affected files and precise responsibilities

| Area | Files and required follow-through |
|---|---|
| Calculation/provenance | `src/lib/qimen-seasonal-vigor.cjs`, `qimen-notification-advisory.cjs`, `qimen-canonical-occurrence-builder.cjs`, `qimen-canonical-source-manifest.cjs`: finalize explicitly selectable profiles; versioned application context provenance separate from unchanged external engine; matched selected/full-grid evidence; version-scoped legacy registry. |
| Backend contract/detail | `src/lib/qimen-three-layer-notification.cjs`, `mobile-qimen-notification-detail.cjs`: strict V4 builder/verifier/provider/parser and historical dispatcher. Context null vigor remains enforced. |
| Enrollment/status | `src/app/api/mobile/v1/push/route.ts`; new expand-only migration for `mobile_push_tokens_qimen_payload_schema_check`; `src/lib/mobile-notification-preferences.ts:399,410` currently tests `=3` and would falsely report capability 4 unavailable. No occurrence snapshot-schema DB enum was found: snapshot is JSONB with object/digest-shape checks. |
| Producer/recovery | `scripts/mobile-qimen-push-cron.cjs`: exact schema-3 gate at 467; V3 verifier/builder in copy, notice, admission, recovery and production; retain legacy recovery, choose V4 only for compatible installations; source facts must reflect actual version and effective expiry. |
| Durable transport/retry | `src/lib/mobile-notification-delivery.cjs`: extend exact schema descriptor, mixed-key rejection, capability relation, immutable byte rebinding and V3-only privacy-safe-copy branch at 631. Retry context currently recognizes only qimenV2/V3 at 1246; omitting V4 would bypass installation-location handling. `src/lib/push-send.cjs:102–105` exact envelope allowlist must add V4 so generic URL injection/truncation does not corrupt the strict envelope. Preserve 4000 B whole-request guard. |
| Mobile parsing/routing | `src/qimen/notificationContract.ts`: separate V4 compact/full types, exact schema/source/method/month/interval validators; preserve old branches. `src/navigation/notificationPayload.ts`: V4 account resolver. `App.tsx:735`: existing resolved guard must accept the validated V4 type. `notificationDetailCoordinator.ts`: preserve account/ref/digest/cancellation behavior and regression-test V4 dispatch. |
| Mobile enrollment/display | `src/native/push.ts`, `src/types/mobile.ts`: capability/type 4 with unchanged readiness/permission gates. `src/greenfield/client.ts` already forwards capability and uses the same detail endpoint; test rather than needlessly rewrite. `src/i18n/qimenNotification.ts` has nine hard-coded 旺相休囚死 legends; make historical/new star and approved-door vocabulary truthful. `QimenNotificationDetailScreen.tsx` renders raw labels but needs source/method presentation if added; do not assign month/day vigor. |

Focused tests to extend include backend `test-qimen-three-layer-v3`, `test-qimen-three-layer-payload`, `test-qimen-notification-detail`, `test-qimen-scheduler`, `test-qimen-push-registration`, migration/transport/delivery/retry tests; mobile payload V2/V3 plus new V4, detail-contract/coordinator, app-wiring/route/render/i18n/android/client enrollment suites. Preserve the existing installed-v223 transport regression's pinned old checkout instead of rewriting it to point at the new client.

## Measured compatibility and size evidence

DB-free in-memory probes built the existing valid V3 fixture using application fixture/helpers only and imported the candidate mobile contract:

- Historical full V3: backend verifier **true**, mobile full parser **accepted**.
- Replace one hour star state with 廢 and recompute the full digest correctly, then bind that digest into compact: backend verifier **false**, mobile full parser **rejected**. This is not merely a stale-digest failure.
- Change only compact hour calculation version V1→V2 while retaining `qimenV3`: both backend and mobile compact readers **reject**. The parent-selected `_MONTH_V2` is likewise outside the current exact V1 allowlist.

Measured fixture sizes (synthetic identifiers, canonical existing fixture; not a worst-case/all-locale promise):

| Measurement | Bytes |
|---|---:|
| Full snapshot V3 | 16479 |
| Canonical compact JSON V3 | 1829 |
| Outer V3 envelope including durable UUID | 2125 |
| Parent-selected V4 compact / outer (`_MONTH_V2`) | 1835 / 2131 |
| Actual FCM whole request, 256-character token, title `t`, body `b` | 3069 |
| Actual Expo whole request, 32-character token core, title `t`, body `b` | 2328 |
| Remaining V3 title+body allowance under 4000 B, this fixture | FCM 933 / Expo 1674 |
| Same provider formatting with V4's six extra version characters | FCM allowance 927 / Expo allowance 1668 |

`qimenV3`→`qimenV4` and `v:3`→`v:4` cost zero bytes; parent-selected `_V1`→`_MONTH_V2` adds six ASCII bytes. 死 and 廢 each occupy three UTF-8 bytes, and vigor is absent from compact anyway. Non-null hour context provenance increases the detail response/digest input, **not** push size. Method-visible copy would need fresh whole-envelope measurements. The 3500 B compact cap is not a guarantee of the 4000 B FCM request cap because FCM nests/escapes JSON twice. No limit change is warranted. V4 sizes are an in-memory projection of the specified contract, not a claim that a V4 implementation passed the current V3-only serializer.

Passing existing regression commands run during this audit:

```sh
# Backend
node --no-warnings --experimental-strip-types scripts/test-qimen-three-layer-v3.mts
node --no-warnings --experimental-strip-types scripts/test-qimen-notification-detail.mts
# Mobile
node --no-warnings --experimental-strip-types scripts/test-qimen-notification-payload-v2.mts
node --no-warnings --experimental-strip-types scripts/test-qimen-notification-payload-v3.mts
node --no-warnings --experimental-strip-types scripts/test-qimen-notification-detail-contract.mts
```

Remaining blockers: user's explicit door-profile choice; parent's exported context-version/profile contract; coordinated strict V4 implementation and regression tests; capability expansion/rollout approval. No deviation from the parent-agreed transport/context/whole-hour design is required. This report does not approve predictive validity or a deployable V4 implementation.

## Bounded backend implementation follow-up

Implemented only the source manifest, immutable snapshot/provider contract, detail dispatch, new V4 fixture/tests and this report. No enrollment, delivery, scheduler, presentation or activation changes are included in this scope.

Version-scoped interface:

- `loadCanonicalSourceManifest()` and `{schema:2}` / `{schema:3}` return the unchanged historical manifest. `{schema:4}` changes only the hour application calculation version to `QIMEN_ZHUANPAN_SHIJIA_CHAIBU_TST_MONTH_V2`; external engine source/closure/reference pins and exact source tuple are unchanged. Unsupported explicit schemas throw.
- New explicit `buildQimenThreeLayerSnapshotV4`, `verifyQimenThreeLayerSnapshotV4`, `buildQimenV4ProviderData`, and `parseQimenV4ProviderData` coexist with all legacy exports. No default builder switches to V4. The provider parser accepts the exact `{qimenV4: canonicalJsonString}` contract; durable outer UUID handling remains the delivery layer's separate responsibility.
- The full V4 reader uses the parent's exact ten-key seasonal verifier and separately recomputes every star/door state from its explicit method. It binds evidence pillar, clock and interval to the full month layer, requires month subject = month pillar, day subject = day pillar, and day month pillar = month pillar. Those V4-only consistency checks do not reinterpret historical records. It preserves null month/day vigor, center null door, intrinsic component quality, whole-hour 90–150-minute bounds and full month/day containment.
- Backend detail dispatch now verifies schema 4 while retaining schema 2/3 validation and existing account/digest binding. It neither rewrites nor recomputes a stored historical record.

`scripts/fixtures/qimen-three-layer-valid-snapshot-v4.cjs` exports `input(accountId, explicitDoorMethod)` and `build(accountId, explicitDoorMethod)`. Omitted or unknown method throws. This is explicitly a synthetic arrangement contract fixture, not a claim of external-engine calculation. Its month bounds use the existing pinned calendar runtime; month/day chart subjects and shared pillars are consistent. The canonical August fixture has global Jie bounds `2026-08-07T11:42:43.000Z` through `2026-09-07T14:41:16.000Z`.

RED evidence: the new V4 test initially failed because the explicit V4 builder export did not exist. The expanded suite subsequently exposed an unfrozen new hour evidence object; the V4 capture now freezes it. GREEN coverage includes both explicit profiles across 12 month branches (24 cases, 216 palace checks), re-signed corruptions of every star/door including center, all ten evidence keys/pins, mixed versions, metadata/subject contradictions, interval mismatches and Jie-straddling hours, malformed canonical JSON/duplicate keys/unknown fields, sparse or decorated arrays, inherited/accessor/cyclic objects, account/digest detail mismatches, and unchanged historical vocabularies. V2/V3 fixtures retain their prechange snapshot digests **and entire canonical serialized byte hashes**.

Focused passing commands use `node --no-warnings --experimental-strip-types` for:

- `scripts/test-qimen-three-layer-v4.mts`
- `scripts/test-qimen-three-layer-v3.mts`
- `scripts/test-qimen-three-layer-snapshot.mts`
- `scripts/test-qimen-three-layer-payload.mts`
- `scripts/test-qimen-notification-detail.mts`
- `scripts/test-qimen-three-layer-science.mts`

The corrected, internally consistent V4 fixture measures **1873 B compact JSON** for either method and **17060 / 17064 B full canonical snapshot**, respectively ordinary/Tongzong. Compact retains the existing strict `<3500 B` cap. These values differ from the earlier projection because the V4 fixture now rebuilds genuinely matching month/day subjects rather than reusing the inconsistent legacy synthetic subjects. They are not an all-locale/worst-case whole-FCM request guarantee. The existing **4000 B whole-request guard is untouched**, and the later transport integration must measure its final V4 envelope and visible copy.

Remaining integration/release work: user chooses an explicit production door profile; parent completes coordinated occurrence/advisory/transport/recovery and source-fact integration; mobile strict V4 detail/routing plus truthful method display must land; API/DB capability expansion and backend acceptance precede capability-4 enrollment. No production default, release authorization, deployment or goal signature is implied. Rollback must retain V4 registration/detail acceptance once V4 clients or immutable records exist.
