# Qimen seasonal classification integration — 2026-09-05

Goal remains ACTIVE. This is source/test evidence, not a deployment or final approval.

## Cause and scope

The legacy advisory and full hour grid use one cached `chart.wang_xiang_status` for both stars and doors. A reusable ju/hour chart cannot determine the current global-Jie month. The confirmed June chart1062 witness labels 天輔(木) as 休 in 甲午 month; Yanbo's star-generates-month rule requires 旺.

The application interpretation/notification layer is changed, not the external arrangement engine, BaZi Layer0/1, shared reference tables, other science producers, preferences or historical records. Sources/methods and their differences are documented in `audit-20260905-qimen-vigor-source.md`.

## Implementation

- `qimen-seasonal-vigor.cjs`: strict valid sexagenary month pillar, all9 star-code states including central 天禽, two explicitly named and independently sourced door profiles, no default door method. Ordinary five-element doors retain editorial/product-policy provenance; Tongzong 暗餘氣 remains a distinct candidate, not blended or silently selected.
- `qimen-notification-advisory.cjs`: explicit `{schema:4,doorMethod}` recalculates canonical global-Jie pillars/window, validates all4 engine pillars, and classifies stars/doors separately. New version is `qimen-notification-advisory-month-v2`. Singular shared `wangXiangOrder` is null; separate immutable orders and exact10-field seasonal provenance are supplied. 廢 has its own warning, never an alias for legacy 死.
- `qimen-canonical-occurrence-builder.cjs`: V4 derives selection again from the same raw response used for the full9-palace grid, rather than trusting a stale injected advisory. Source/instant/pillars are checked before no-direction return. New hour version is `QIMEN_ZHUANPAN_SHIJIA_CHAIBU_TST_MONTH_V2`; hour evidence matches the full month layer. Month/day remain raw context with null vigor. No raw engine data is rewritten.
- `mobile-qimen-push-cron.cjs`: creates notices and history from strict V3/V4 snapshots, with V4 method provenance in source facts. New V4 creation requires an explicit `seasonalDoorMethod` dependency or `QIMEN_SEASONAL_DOOR_METHOD`; no environment value was set. Existing claimed V3 can recover unchanged on capability4; V4 cannot be delivered to capability3. Engine memoization includes schema and method. INSERT-conflict recovery rechecks owner/window/capability.
- Backend V4 full/compact/detail contract is in separate reviewed component commit `919e56a7f1c7ea804da4c1a2cba493abb881194e`; V2/V3 manifests/readers remain frozen. Its validators bind source/method/month/subject/window and recompute each palace's seasonal states.

The score60 threshold, no hard warnings, no unclassified warnings, maximum2 independent soft warnings, both door/star 旺 or 相, quiet-hours, entitlements, location lease, 10-minute admission and5-minute provider safety windows remain unchanged. A corrected strong star does not override a weak door. No new automatic permission, enrollment or science-mixing behavior is introduced.

## RED → GREEN and checks

Fresh RED reproduced `休 !== 旺` in the actual June month-classification witness. The explicit V4 call now returns star旺 and ordinary metal-door死, therefore caution—not a manufactured good direction. A controlled supportive-door fixture is recommended, but score59, hard_count1, FU_YIN, unknown warning or3 independent soft warnings still block it. Earth stars in 午 month return 廢, with localized TH/EN/ZH advisory warnings.

New helper/evidence/occurrence/scheduler tests first failed due missing helpers, missing option propagation or V3-only notice rejection, then passed with implementation.

Parent ran these DB-free commands successfully:

```sh
node --no-warnings --experimental-strip-types scripts/test-qimen-seasonal-evidence.mts
node --no-warnings --experimental-strip-types scripts/test-qimen-nine-star-component-month.mts
node --no-warnings --experimental-strip-types scripts/test-qimen-separated-door-month-rules.mts
node --no-warnings --experimental-strip-types scripts/test-qimen-seasonal-vigor.mts
node --no-warnings --experimental-strip-types scripts/test-qimen-seasonal-occurrence-builder.mts
node --no-warnings --experimental-strip-types scripts/test-qimen-seasonal-scheduler.mts
node --no-warnings --experimental-strip-types scripts/test-qimen-three-layer-v4.mts
node --no-warnings --experimental-strip-types scripts/test-qimen-seasonal-month-boundaries.mts
node --no-warnings --experimental-strip-types scripts/test-qimen-notification-truth.mts
node --no-warnings --experimental-strip-types scripts/test-qimen-canonical-occurrence-builder.mts
node --no-warnings --experimental-strip-types scripts/test-qimen-push-registration.mts
node --no-warnings --experimental-strip-types scripts/test-yam-qimen-line.mts
```

Coverage: 60valid pillars×9stars=540; 12branches×8doors×2profiles=192; V4 full validation24branch/profile cases×9palaces=216; boundary review1008 longitude/timezone cases. Whole-hour Jie straddles fail closed with `QIMEN_CONTEXT_TRANSITION_INSIDE_HOUR`; hours are neither split nor mislabeled as constant-month vigor.

`qimen-seasonal-engine-witness.cjs` is explicitly synthetic for transport/selection tests. Its clock/pillars are canonical but its placements/scores are controlled; it is NOT historical engine evidence or predictive-accuracy proof. Full `test-qimen-scheduler.mts` has live calculate POST calls and was not run in this local-only verification.

## Remaining / rollout limits

- Independent root-code review, coordinated mobile V4 parsing/display, registration/migration, durable reservation/retry/whole-provider validation remain required.
- User's door-profile choice remains pending; no production default is selected. Existing runtime default still emits historical schema3 until coordinated rollout. Passing opt-in V4 tests does not fix already deployed classifiers.
- No DB migration, production API call/test push, service/credential/environment change, APK build or deployment occurred. No final goal signature.
- Before rollout, commit exact code/artifacts/config, expand compatibility without demoting devices, retain all historical readers, then enable approved V4 producer/enrollment. Rollback after V4 enrollment must retain capability4/detail/retry readers; reverting to schema3-only binaries is not safe.
- Seven-day silence must be reported from the independent read-only audit, not attributed automatically to the June cache defect. Provider acceptance still is not phone display proof.

Endpoints exercised: none live. Full detail resolver/provider parsers were checked in memory. Production receipt/detail-opening, migrations, whole app/backend builds and final5-reviewer evidence remain open.
