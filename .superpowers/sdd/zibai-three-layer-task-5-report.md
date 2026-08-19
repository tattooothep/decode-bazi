# Task 5 Report — Safe Zi Bai v2 Delivery and Legacy History Projection

## Status and commit

Complete on base `09d65c4132eb56f44eb5132f6df3826120f249ff`.

Implementation commit:

```text
17be1a173316798f764fb9da857dd8fc620f10a6
feat(zibai): deliver three-layer snapshots compatibly
```

The mandatory independent review returned `APPROVED / PASS` with no Critical
or Important findings. No production database, real provider send, build,
deployment, push, reset, stash, or destructive repository command was used.

## Delivered contract

- `loadClaimContext` reads `zibai_payload_schema` from the exact enabled token
  joined to the installation claim. No app-version inference or cross-device
  schema merge exists.
- The producer builds exact v1 or strict compact v2 facts before reservation.
  Daily v2 has `shichen: null`; shichen v2 carries the exact month, day, and
  shichen bounds/maps plus exactly nine compact Task 3 attestations.
- Durable reservation reselects and locks the exact token row, compares the
  parent/message/current schemas, and then locks the occurrence. The
  token→occurrence order matches registration and fences concurrent downgrade,
  rotation, and account transfer without deadlock or stale-v2 reservation.
- Every installation-scoped occurrence reserves one parent/message. Mixed old
  and new installations therefore retain independent v1/v2 durable payloads.
- Retry sends the immutable stored `provider_message`; it cannot import or
  invoke the Zi Bai producer to recompute a later schema.
- FCM's decoded inner data and Expo data are exact for v1/v2 daily/shichen.
  The provider allowlist preserves strict v2 daily `shichen: null` without
  weakening general null filtering.
- History defaults an absent `X-Hourkey-Zibai-Schema` header to `1`, accepts
  only exact `1` or `2`, and returns `400 invalid_zibai_schema` otherwise.
  Stored v2 is retained for schema 2 and down-projected to exact v1 for schema
  1; stored v1 is never upconverted.
- Projection derives only legacy day/shichen focus from the immutable maps and
  shared rule kernel. It never uses current time/location and returns no month,
  compact attestations, coordinates, PII, or `source_facts`.
- TH/EN/ZH copy follows canonical `repeatedLayers`, `warningCodes`, and
  `actionCode`; triple/Five Yellow/mixed caution is prioritized. Repeated Nine
  Purple explicitly says it is not Period 9. Privacy-off provider copy remains
  generic. Copy throws rather than truncating if the 400-character contract is
  exceeded.

## RED evidence

The initial producer/history/copy tests failed before implementation:

```text
test-zibai-scheduler.mts
  buildZibaiV2Facts was undefined; capable delivery remained v1

test-zibai-history-projection.mts
  history projection/schema parser did not exist

test-zibai-notification-copy.mts
  layered v2 snapshot/caution copy was unsupported

test-zibai-delivery-contract.mts
  capable daily/shichen provider data did not carry exact v2
```

The first review added two deliberate failing regressions:

```text
AssertionError: repeat-nine disclosure follows the kernel's repeated layer evidence
actual: "1 White ... double repeat; plan/communicate calmly"

AssertionError: durable reservation waits for the concurrent registration row lock
actual: "settled"
expected: "blocked"
```

After adding the first schema fence, the cross-account transfer regression
reproduced the lock-order bug before the final repair:

```text
PostgreSQL 40P01: deadlock detected
reservation expected zibai_token_capability_changed
```

The original Task 8 fixture also failed its last retention assertion because
fixed 2026-08-16 expiries were compared with the 2026-08-19 wall clock, making
all 10,000 locations expired instead of one. The adaptation does not reduce
load strength: it applies the Task 4 capability migration and evaluates purge
against an explicit time inside the fixture timeline, with an added assertion
that exactly one row is expired before purge. Installations, two cycles,
20,000 reservations, provider parity/history checks, concurrency, pool bounds,
and the 120-second provider SLO are unchanged.

Two noisy-host runs later exceeded only the unchanged provider SLO
(`131749.8ms` and an independent `123177.6ms` versus `120000ms`). No functional
assertion failed and both isolated databases cleaned. The authoritative
post-fix rerun below passed without changing the SLO.

## GREEN evidence

Focused Zi Bai gates:

```text
ZIBAI_SCIENCE_OK
ZIBAI_MONTH_BOUNDARIES_OK
ZIBAI_V1_BACKEND_CONTRACT_OK
ZIBAI_THREE_LAYER_BACKEND_CONTRACT_OK
ZIBAI_THREE_LAYER_INTERPRETATION_OK 6561
ZIBAI_NOTIFICATION_PAYLOAD_OK
ZIBAI_NOTIFICATION_PAYLOAD_BYTES shichen=1594 daily=1488
ZIBAI_NOTIFICATION_COPY_OK
ZIBAI_SCHEDULER_OK
ZIBAI_DELIVERY_CONTRACT_OK
ZIBAI_HISTORY_PROJECTION_OK
ZIBAI_API_CONTRACT_OK
ZIBAI_PRIVACY_POLICY_OK locales=9
ZIBAI_OPS_CONTRACT_OK
ZIBAI_MIGRATION_OK
ZIBAI_STATE_DB_OK ownership=1 location=1 permissionDowngrade=1
ZIBAI_SCHEDULER_DB_OK ... durableRecovery=1 mixedSchemas=2
ZIBAI_RESERVATION_SCHEMA_FENCE_OK concurrentDowngrade=1 crossAccountTransfer=1 staleV2=0
```

Legacy/live/retry gates:

```text
NOTIFICATION_SCIENCE_TASK3_OK checks=8
NOTIFICATION_PAYLOAD_TASK3_OK cases=8
NOTIFICATION_LOG_PRIVACY_TASK3_OK files=8
NOTIFICATION_ATOMICITY_TASK3_OK
NOTIFICATION_CAP_TASK3_OK concurrent=8 admitted=1 local_day=pass privacy=pass
NOTIFICATION_LIVE_PRODUCERS_TASK3_OK checks=180
NOTIFICATION_SOURCE_REPLAY_TASK3_OK notices=11
69 mobile push retry checks passed
```

The live producer/source replay gates used the clean pinned mobile source:

```text
HOURKEY_MOBILE_ROOT=/root/worktrees/zibai-three-layer-mobile
HOURKEY_MOBILE_SHA=e2078e327c809b0452829e9502ca0e404db83c4c
```

Authoritative Task 8 post-fix load gate:

```text
ZIBAI_10K_PIPELINE_OK installations=10000 cycles=2 accepted=20000
totalMs=185087.6 cpuMs=81631.9 peakPool=20/20 peakWaiting=0
runs=20445.9:19478.8:20279.7:64325.8:0,
     20458.1:19522.5:20285.3:79849.2:0
```

Both cycles had zero errors; provider drain was `64325.8ms` and `79849.2ms`,
below the unchanged `120000ms` SLO.

Final static checks after the last production edit:

```text
npx tsc --noEmit                         exit 0
node --check scripts/mobile-zibai-push-cron.cjs                 exit 0
node --check src/lib/mobile-notification-delivery.cjs           exit 0
node --check src/lib/push-send.cjs                              exit 0
node --check src/lib/zibai-notification-copy.cjs                exit 0
node --check src/lib/zibai-payload-projection.cjs               exit 0
git diff --check                                                exit 0
```

## Copy and payload sizes

Measured through the real layered copy builder, with no truncation:

| Locale | Shichen title/body | Daily title/body |
| --- | ---: | ---: |
| TH | 40 / 298 | 28 / 265 |
| EN | 41 / 340 | 25 / 311 |
| ZH | 23 / 172 | 17 / 155 |

All bodies are at most 400 characters. Strict v2 payloads measure `1594`
bytes for shichen and `1488` bytes for daily.

## Disposable database and process cleanup

All database-backed tests use PID-scoped databases/roles and guarded cleanup.
One obsolete in-flight 10k run was interrupted after a production edit; its
exact resolved database `zibai_queue_10k_4067182` and exact role
`zibai_queue_10k_role_4067182` were explicitly dropped before the final run.

The final audit searched all Task 1/3/5 prefixes for Zi Bai migration/state/
scheduler/schema-fence/10k, notification cap/live/source-replay, and retry
databases and roles. It returned no rows. `pgrep` returned no remaining 10k,
schema-fence, or retry test process.

## Files

Production:

- `scripts/mobile-zibai-push-cron.cjs`
- `src/app/api/mobile/v1/notifications/route.ts`
- `src/lib/mobile-notification-delivery.cjs`
- `src/lib/push-send.cjs`
- `src/lib/zibai-notification-copy.cjs`
- `src/lib/zibai-payload-projection.cjs`
- `src/lib/zibai-payload-projection.cjs.d.ts`

Tests:

- `scripts/test-zibai-10k-queue.mts`
- `scripts/test-zibai-delivery-contract.mts`
- `scripts/test-zibai-history-projection.mts`
- `scripts/test-zibai-notification-copy.mts`
- `scripts/test-zibai-reservation-schema-fence.mts`
- `scripts/test-zibai-scheduler-db.mts`
- `scripts/test-zibai-scheduler.mts`

## Self-review and concerns

- Reviewed the complete `09d65c4..17be1a1` implementation diff and staged only
  the 14 Task 5 production/test files.
- Confirmed the reservation lock order matches registration and that both race
  tests leave zero parent/attempt leakage.
- Confirmed v1/v2 are never merged, history never upconverts v1, retry never
  rebuilds, and daily never samples a shichen.
- Confirmed durable/provider copy is identical, caution derives from the shared
  kernel, and privacy-off copy contains no chart details.
- Confirmed no coordinates, PII, provider credentials, or source facts enter
  returned history payloads.
- The only observed concern was shared-host load variance in two 10k provider
  drains. The unchanged SLO passed in the authoritative post-fix run; no code
  or test threshold was relaxed.
- No remaining blocker or known contract defect is open.
