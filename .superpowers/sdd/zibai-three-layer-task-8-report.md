# Task 8 Report — Cross-Repo End-to-End and Load Regression

## Status and exact source pair

Task 8 implementation is complete on backend base
`b82f932c681988abf7b568f8defd99b87b657771`.

Implementation commit:

```text
7b24a21860e2591ea60662758b260236937a5488
test(zibai): gate three-layer delivery end to end
```

The authoritative portable cross-repository run pinned the exact clean mobile
source and the then-current clean backend/report head:

```text
HOURKEY_BACKEND_SHA=f32edfbb504d810861fe7d1c0fecfebc00d1ae8e
HOURKEY_MOBILE_ROOT=/root/worktrees/zibai-three-layer-mobile
HOURKEY_MOBILE_SHA=488575b9420b28a1bb7ab51808b6c1302deebab1
```

This final candidate supersedes the earlier mobile validation pin. Its delta
is limited to Zi Bai visual color/focus behavior and associated tests/report;
the authoritative scheduler/provider/history/parser E2E was rerun rather than
assuming delivery parity from that scope.

No APK build, deployment, production database mutation, real FCM/Expo send, or
external side effect occurred.

## Delivered Task 8 gate

- `scripts/test-zibai-three-layer-e2e.mts` has no sibling-worktree fallback.
  Both `HOURKEY_MOBILE_ROOT` and `HOURKEY_MOBILE_SHA` are mandatory, and the
  supplied mobile checkout's exact `HEAD` must equal that SHA.
- The portable test drives the canonical scheduler into a PID-scoped durable
  PostgreSQL database and reads the resulting immutable provider reservation.
  It covers daily v1, daily v2, shichen v1, and shichen v2 across both FCM and
  Expo inner-data shapes, then passes the actual wire JSON through the shipped
  mobile strict parser.
- The same durable rows exercise schema-aware history projection. Stored v1 is
  never upconverted; stored v2 is returned as v2 or down-projected to v1 by
  explicit request. An accepted v2 shichen row remains parseable after its
  deterministic expiry and retains its original month/day/shichen maps.
- Privacy-off reservations retain exactly the generic title/body. Provider and
  history envelopes contain no coordinates, source facts, house/natal identity,
  or Period-9 proxy.
- Retry is forced through one retryable failure and later acceptance. Both
  attempts use the byte-equivalent reserved provider object and unchanged
  SHA-256; no scheduler/science recomputation occurs.
- Boundary replay covers the exact Liqiu Jie instant, apparent-solar 23:00 day
  turnover, exact shichen turnover, New York DST gap, and both instants in the
  New York DST fold.
- The existing 10k-installation gate still runs two cycles and retains the
  unchanged 50-second scheduler and 120-second provider SLOs. Its deterministic
  capability split produces 10,000 v1 and 10,000 v2 durable rows. Every one of
  the 10,000 v2 provider envelopes is rebuilt through the strict payload
  validator and compared with the shared interpretation kernel's nine sectors.
- The live-producer inventory now includes exact Zi Bai v1/v2 producer,
  provider, history, and shipped-parser parity without app-version inference.

## RED evidence and production blocker repaired

The new real scheduler → database → retry test reproduced an expired-v2 send:

```text
AssertionError: expired v2 snapshot is never sent by a later retry
actual: 1
expected: 0
```

Cause: retry policy read only legacy `payload.endAt`. Schema v2 intentionally
stores immutable expiry at `payload.day.endAt` for daily and
`payload.shichen.endAt` for shichen. Consequently, a delayed v2 attempt had no
policy expiry and could reach the provider sender after the occurrence ended.

The narrow repair in `src/lib/mobile-notification-delivery.cjs` selects expiry
from the immutable event layer for v2 and preserves the existing v1 top-level
field. The same test then observed zero sender calls and terminal
`policy_expired_occurrence`. No payload, calculation, scheduling, or copy
behavior was otherwise changed.

## Authoritative GREEN evidence

Exact clean backend/mobile cross-repository E2E:

```text
ZIBAI_THREE_LAYER_E2E_OK dailyV1=1 dailyV2=1
shichenV1=1 shichenV2=1 providers=fcm,expo
boundaries=jie,day23,shichen,dst-gap,dst-fold realSends=0
```

Load gate, unchanged SLO thresholds:

```text
ZIBAI_10K_PIPELINE_OK installations=10000 cycles=2 accepted=20000
v2Validated=10000 totalMs=198096.9 cpuMs=88596.8
peakPool=20/20 peakWaiting=0
runs=
  23213.6:21909.3:23005.1:64337.8:63218.0:64122.2:0,
  20302.0:19183.4:20087.2:90233.3:87492.4:89756.8:0
```

Each run tuple is scheduler duration, scheduler p95, scheduler p99, provider
duration, provider p95, provider p99, and errors in milliseconds/count. Both
scheduler runs were below 50 seconds; both provider runs and provider p99 were
below 120 seconds; errors were zero; all 20,000 stub attempts were accepted.

Pinned backend gates:

```text
ZIBAI_SCIENCE_OK
ZIBAI_MONTH_BOUNDARIES_OK
ZIBAI_THREE_LAYER_INTERPRETATION_OK 6561
ZIBAI_NOTIFICATION_PAYLOAD_OK
ZIBAI_NOTIFICATION_PAYLOAD_BYTES shichen=1594 daily=1488
ZIBAI_SCHEDULER_OK
ZIBAI_DELIVERY_CONTRACT_OK
ZIBAI_HISTORY_PROJECTION_OK
ZIBAI_PRIVACY_POLICY_OK locales=9
NOTIFICATION_LIVE_PRODUCERS_TASK3_OK checks=183
NOTIFICATION_SOURCE_REPLAY_TASK3_OK notices=11
69 mobile push retry checks passed
ZIBAI_SCHEDULER_DB_OK ... mixedSchemas=2
ZIBAI_RESERVATION_SCHEMA_FENCE_OK concurrentDowngrade=1 crossAccountTransfer=1 staleV2=0
ZIBAI_API_CONTRACT_OK
ZIBAI_OPS_CONTRACT_OK
ZIBAI_STATE_DB_OK ownership=1 location=1 permissionDowngrade=1
```

Pinned mobile gates:

```text
ZIBAI_MOBILE_CONTRACT_OK
NOTIFICATION_PAYLOAD_OK categories=9 backendService=3
ZIBAI_V2_MOBILE_PARITY_OK shichen=6561 daily=729
backend=f32edfbb504d810861fe7d1c0fecfebc00d1ae8e
ZIBAI_V1_MOBILE_CONTRACT_OK
ZIBAI_SCREEN_AST_PARSE_OK
ZIBAI_THREE_LAYER_MOBILE_CONTRACT_OK
ZIBAI_THREE_LAYER_UI_OK mockup=7a826f030b923fe4a9036437ec87be5ed9d715cb95a81010712a9dbbf8758823
ZIBAI_DETAIL_COLORS_SEMANTICS_OK
ZIBAI_ACTIONS_OK
ZIBAI_APP_WIRING_OK
```

Backend and mobile `npx tsc --noEmit`, backend CJS syntax checks, and both
`git diff --check` gates exited zero. Both exact source worktrees were clean at
the authoritative run.

## Cleanup and safety

All Task 8 databases and roles use resolved PID-scoped names with guarded
cleanup. The final audit found no matching E2E, 10k, or live-producer database,
role, or process. Every provider path used a local stub; the test does not load
credentials or call real FCM/Expo endpoints.

## Files

- `scripts/test-zibai-three-layer-e2e.mts`
- `scripts/test-zibai-10k-queue.mts`
- `scripts/test-notification-live-producers-task3.mts`
- `src/lib/mobile-notification-delivery.cjs`
- `.superpowers/sdd/zibai-three-layer-task-8-report.md`

## Self-review

- Reviewed the complete `b82f932..7b24a21` Task 8 diff and staged only the
  three planned test surfaces plus the single production expiry repair exposed
  by RED.
- Confirmed schema selection remains installation-scoped and never uses app
  version; retry sends the reserved provider message and history never
  recomputes current time or location.
- Confirmed daily v2 keeps `shichen: null`, shichen v2 carries all three layers,
  and every tested v2 compact attestation matches the shared kernel.
- Confirmed no SLO threshold, installation count, cycle count, provider count,
  privacy path, or cleanup assertion was weakened.
- No remaining Task 8 blocker or known delivery-contract defect is open.
