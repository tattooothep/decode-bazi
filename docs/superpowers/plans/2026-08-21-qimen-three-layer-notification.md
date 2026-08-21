# Qimen C4 Three-Layer Notification Implementation Plan

> **Execution rule:** implement test-first in the two existing isolated worktrees. Keep the producer disabled until science, backend, and mobile review all sign the same clean source tuple. A provider acceptance is not completion; the exact signed APK must pass the remote system-tray canary.

**Goal:** Send one Qimen C4 notification at the start of each eligible true-solar shichen, only when the canonical hour chart has a genuinely recommendable direction, and open the exact immutable month/day/shichen evidence on mobile.

**Architecture:** The backend owns a versioned canonical context engine, an independent per-minute scheduler, an immutable snapshot/detail store, and a compact strict v2 provider contract. The mobile app advertises v2 only after its parser, detail route, and Android time-alert channel are ready. Month/day are contextual charts with their own named lineages; the hour chart alone decides eligibility and direction.

**Repositories:**

- Backend: `/root/worktrees/qimen-notification-truth-backend`
- Mobile: `/root/worktrees/zibai-three-layer-mobile`

**Primary references under review:**

- 《奇門法竅》卷二 `論月奇法`, `論日奇法`, `論直符`, `論直使`, `論八神`, `論寄宮`, `論拆局補局`
- 《奇門遁甲統宗》卷二 `附月奇門起例`
- Existing source-verified `拆補 Chai Bu` hour profile for the actionable 時家 chart

---

## Task 1: Freeze the science decision and source manifest

**Files:**

- Modify: `docs/superpowers/specs/2026-08-21-qimen-three-layer-notification-design.md`
- Create: `docs/specs/QIMEN_C4_CANONICAL_SOURCE_MANIFEST.md`
- Create: `src/lib/qimen-canonical-source-manifest.cjs`
- Create: `scripts/fixtures/qimen-three-layer-science.json`
- Test: `scripts/test-qimen-three-layer-science.mts`

1. Write a failing test that rejects every engine version not listed in the manifest and rejects the existing `preliminary_simplified_dmy` month/day outputs.
2. Add exact worked fixtures for the approved month and day examples, boundary fixtures for solar-term transitions, and explicit center-lodging expectations.
3. Record the approved month/day lineages, plate method, Ju rule, Fu-head rule, center-lodging rule, component order, valid-window rule, and primary-source locations. Do not describe a product ruling as a direct quotation.
4. Implement the immutable source-manifest reader and make the test pass.
5. If the independent science reviewer cannot approve the lineage or a fixture cannot be reproduced, leave the producer disabled and return a fixed canonical-science error. Do not substitute a simplified chart.

## Task 2: Build the versioned month/day canonical context engine

**Files:**

- Create: `src/lib/qimen-canonical-tables.cjs`
- Create: `src/lib/qimen-canonical-pillars.cjs`
- Create: `src/lib/qimen-canonical-context-engine.cjs`
- Create: `src/lib/qimen-canonical-context-engine.d.ts`
- Test: `scripts/test-qimen-three-layer-science.mts`
- Test: `scripts/test-qimen-three-layer-boundaries.mts`

1. Add failing tests for the full sexagenary year grouping used by 月家; include `甲子 -> 陰1`, `己巳 -> 陰4`, and `甲戌 -> 陰7`.
2. Add failing tests for exact astronomical term instants, Li Chun year/month boundaries, Fu-head classification, day-boundary policy, and the approved 陽/陰 daily Ju cycle.
3. Add failing palace invariants: nine unique palaces, correct Yang/Yin instrument direction, moving heaven plate, moving doors/stars/deities, no raw center door/deity, and explicit center lodging.
4. Implement pillars and exact term lookup with the repository-pinned `tyme4ts` runtime; never use mean-date approximations.
5. Implement the approved month/day engine directly in this versioned repository. Return frozen charts with source code, calculation version, input instant, valid window, all nine palaces, raw/effective center evidence, and fixed error codes.
6. Run the science and boundary tests, then run mutation fixtures that shift one component or boundary and verify rejection.

## Task 3: Define immutable C4 snapshot and strict Qimen v2 payload

**Files:**

- Create: `src/lib/qimen-three-layer-notification.cjs`
- Create: `src/lib/qimen-three-layer-notification.d.ts`
- Modify: `src/lib/notification-payload.cjs`
- Modify: `src/lib/notification-payload.ts`
- Modify: `src/lib/notification-payload.d.ts`
- Create: `scripts/test-qimen-three-layer-payload.mts`
- Create: `scripts/test-qimen-three-layer-snapshot.mts`

1. Write failing tests for a complete immutable three-chart snapshot, selected hour decision, version tuple, source tuple, exact windows, and SHA-256 digest.
2. Write failing tests proving month/day never reorder the hour direction and that missing deity/door/star, preliminary versions, unknown source codes, mismatched windows, coordinates, profile IDs, or accessors fail closed.
3. Write failing tests for a compact v2 canonical JSON string in the exact outer field `qimenV2`; reject duplicate JSON keys before object construction, unknown keys, wrong literal route, digest mismatch, and provider payloads over the byte cap.
4. Implement deterministic canonical serialization and digest generation. Keep full 27-palace evidence out of FCM/Expo data.
5. Preserve legacy Qimen v1 parsing and `/qimen/board` behavior without recomputing month/day history.

## Task 4: Add durable occurrence, snapshot, and installation capability schema

**Files:**

- Create: `migrations/20260821_mobile_qimen_three_layer.sql`
- Create: `migrations/20260821_mobile_qimen_three_layer.rollback.sql`
- Create: `scripts/test-qimen-migration.mts`
- Create: `scripts/test-qimen-reservation-schema-fence.mts`

1. Write schema tests for per-installation `qimen_payload_schema`, purpose, location lease, next due, owner generation, and producer-enable state.
2. Write schema tests for one logical occurrence per `(user, installation, purpose, hour_valid_from)`, immutable send deadline, state/skip reason, full dedupe digest, source/version tuple, snapshot JSONB, digest, and size check.
3. Add ownership FKs, deletion behavior, claim/due/retention indexes, and triggers preventing mutation after reservation.
4. Make rollback disable the producer and preserve delivered history; it must not drop evidence users already received.
5. Run migration forward/rollback tests against an isolated database fixture.

## Task 5: Implement the independent per-minute Qimen scheduler

**Files:**

- Create: `src/lib/mobile-qimen-installation.ts`
- Create: `scripts/mobile-qimen-push-cron.cjs`
- Modify: `src/lib/qimen-notification-advisory.cjs`
- Modify: `src/lib/mobile-notification-delivery.cjs`
- Modify: `scripts/mobile-yam-push-cron.cjs`
- Modify: `scripts/mobile-personal-reminders-cron.cjs`
- Create: `scripts/test-qimen-scheduler.mts`
- Create: `scripts/test-qimen-scheduler-db.mts`
- Create: `scripts/test-qimen-three-layer-e2e.mts`

1. Write a failing scheduler test that discovers a due Qimen installation without a Today/Yam row or personal-reminder run.
2. Write failing tests for once-per-true-solar-shichen evaluation, location lease, purpose, consent, pause, quiet hours, cap, entitlement, owner transfer, and schema negotiation.
3. Write failing eligibility tests that reserve only the hour engine's clear recommendation; caution, fallback, missing context, hard warning, late discovery, and less than one TTL remaining must become terminal skip states.
4. Implement indexed claims, immutable occurrence fencing, exact snapshot reservation, and one provider submission through the existing durable delivery layer.
5. Make Qimen quiet/pause/late results terminal for that shichen so retry cannot replay them later. Keep unrelated notification retry behavior unchanged.
6. Guard the old Yam addendum and 08:00 Qimen path behind the cutover flag; remove them only after the new canary succeeds.
7. Run scheduler, database, retry-regression, and end-to-end tests.

## Task 6: Add account-bound immutable detail and capability APIs

**Files:**

- Create: `src/app/api/mobile/v1/notifications/[id]/route.ts`
- Create: `src/app/api/mobile/v1/qimen/notifications/route.ts`
- Modify: `src/app/api/mobile/v1/notifications/route.ts`
- Modify: `src/app/api/mobile/v1/push/route.ts`
- Create: `scripts/test-qimen-three-layer-history.mts`

1. Write failing API tests for authentication, account ownership, unknown IDs, compact list projection, full detail validation, digest parity, and no location/profile leakage.
2. Implement a literal account-bound detail endpoint that returns only the immutable stored snapshot; never call the live Qimen engine from this route.
3. Persist and negotiate `qimenPayloadSchema`; schema 2 requires the mobile parser/detail route/channel readiness capability.
4. Keep legacy v1 list entries readable and route them only to the legacy board.
5. Run history, privacy, engagement, and source-replay regressions.

## Task 7: Add operations, heartbeat, health, and guarded cutover

**Files:**

- Create: `ops/systemd/hourkey-mobile-qimen-push.service`
- Create: `ops/systemd/hourkey-mobile-qimen-push.timer`
- Create: `docs/runbooks/qimen-three-layer-notification.md`
- Modify: `src/lib/notification-observability.cjs`
- Modify: `scripts/notification-observability-preflight.cjs`
- Modify: notification health/heartbeat modules discovered by `scripts/test-notification-scheduler-heartbeats.mts`
- Create: `scripts/test-qimen-observability.mts`
- Create: `scripts/test-qimen-ops-contract.mts`
- Create: `scripts/test-qimen-10k-queue.mts`

1. Write failing tests for exact current-release command resolution, one-minute cadence, stale heartbeat, due lag, skip reasons, engine/source version, snapshot digest, and provider credential dead letters.
2. Add service/timer files with production disabled by default and safe locking/timeouts.
3. Add Qimen-specific observability and a 10k indexed-queue test; do not equate provider acceptance with device delivery.
4. Document enable, disable, rollback, and legacy-producer cutover steps.
5. Verify units with `systemd-analyze verify` without enabling them yet.

## Task 8: Implement mobile strict v2 parsing and channel readiness

**Files (mobile worktree):**

- Create: `src/qimen/notificationContract.ts`
- Create: `src/qimen/notificationDetailCoordinator.ts`
- Modify: `src/navigation/notificationPayload.ts`
- Modify: `src/navigation/notificationRouteDispatcher.ts`
- Modify: `src/greenfield/client.ts`
- Modify: `src/native/push.ts`
- Modify: `App.tsx`
- Create: `scripts/test-qimen-notification-payload-v2.mts`
- Create: `scripts/test-qimen-notification-detail-contract.mts`
- Create: `scripts/test-qimen-notification-route.mts`
- Create: `scripts/test-qimen-notification-android.mts`

1. Write failing tests for legacy v1 plus strict duplicate-aware v2 string parsing, exact keys, literal `/qimen/notification-detail`, digest parity, and account-bound stale-response cancellation.
2. Implement the compact parser and full snapshot parser without using a native-collapsed object as proof of duplicate rejection.
3. Add the authenticated detail client and owner/notification-bound coordinator.
4. Create and verify `hourkey-time-alerts-v2` eagerly with high importance, default sound, and vibration. Advertise `qimenPayloadSchema: 2` only after channel and app capability readiness succeed.
5. Wire foreground, background, cold-start, and Notification Center taps to the immutable detail state; v2 must never open the live board.

## Task 9: Implement the approved C4 mobile screen

**Files (mobile worktree):**

- Create: `src/components/design/qimen/QimenNotificationDetailScreen.tsx`
- Create: `src/components/design/qimen/QimenNotificationNinePalaceOverview.tsx`
- Create: `src/components/design/qimen/QimenNotificationExplanationSheet.tsx`
- Create: `src/components/design/qimen/QimenNotificationEvidenceAccordion.tsx`
- Create: `src/i18n/qimenNotification.ts`
- Modify: `src/components/design/NotificationCenterScreen.tsx`
- Modify: modal registry/host files used by the existing native sheet system
- Create: `scripts/test-qimen-notification-c4-ui.mts`
- Create: `scripts/test-qimen-notification-accessibility.mts`
- Create: `scripts/test-qimen-notification-large-font.mts`
- Create: `scripts/test-qimen-notification-i18n.mts`

1. Write failing C4 tests for the nine-palace overview, selected direction, purpose/window, and visible month/day/shichen deity-door-star rows for every user.
2. Write failing state tests for supportive, cautionary, conflicting, neutral, and unavailable context; hour authority must always remain visible.
3. Write failing accessibility tests for direction -> layer -> deity -> door -> star -> state -> validity order, icon/text state labels, initial/return focus, and large-font layouts without ellipsis-hidden evidence.
4. Implement C4 and the explanation/evidence sheets. Full evidence is not entitlement-gated and never recomputes a chart.
5. Add native copy for `th`, `en`, `zh`, `cn`, `vi`, `ja`, `ru`, `ko`, and `es`, retaining Chinese technical identities as secondary evidence.
6. Add the new files to full-suite and packaged-source provenance gates.

## Task 10: Verify, obtain three signatures, build, and run the real-device canary

**Files:**

- Create/update signed evidence manifests and raw test logs under the existing release-evidence convention
- Modify version/build metadata only after source review passes

1. Run all new backend tests and the existing Qimen, delivery, privacy, engagement, retention, atomicity, cap, heartbeat, integrity, TypeScript, unit-file, and `git diff --check` regressions.
2. Run all new mobile tests, `mobile-full-suite.mjs`, TypeScript, source-map/provenance, and legacy Zi Bai/Qimen regressions.
3. Commit both repositories and confirm clean trees. Record backend SHA/tree, mobile SHA/tree, engine/source-manifest digest, migration checksum, spec digest, and expected artifact mapping.
4. Request independent science, backend/delivery, and mobile/E2E review. Any Critical or Important finding resets the affected signature.
5. After `SIGNED APPROVE 3/3`, build the exact APK and record APK SHA-256, certificate SHA-256, versionCode, package, and packaged source proof.
6. Install on the registered physical Android device; verify permission and `hourkey-time-alerts-v2` with `dumpsys`.
7. Background/kill (not force-stop) the app and let the real per-minute scheduler create one natural known-good occurrence. Capture reservation, provider attempt/message ID, TTL, timer/heartbeat state, tray screenshot/UI dump, external audible video, tap result, immutable detail digest, and opened engagement.
8. Enable the guarded production cutover only when system tray + sound + tap-to-matching-C4 all pass. Otherwise leave the producer disabled, diagnose, and repeat review/canary on the new exact source tuple.

---

## Required final regression commands

Backend:

```bash
node --experimental-strip-types scripts/test-qimen-three-layer-science.mts
node --experimental-strip-types scripts/test-qimen-three-layer-boundaries.mts
node --experimental-strip-types scripts/test-qimen-three-layer-payload.mts
node --experimental-strip-types scripts/test-qimen-three-layer-snapshot.mts
node --experimental-strip-types scripts/test-qimen-scheduler.mts
node --experimental-strip-types scripts/test-qimen-scheduler-db.mts
node --experimental-strip-types scripts/test-qimen-reservation-schema-fence.mts
node --experimental-strip-types scripts/test-qimen-three-layer-history.mts
node --experimental-strip-types scripts/test-qimen-three-layer-e2e.mts
node --experimental-strip-types scripts/test-qimen-migration.mts
node --experimental-strip-types scripts/test-qimen-observability.mts
node --experimental-strip-types scripts/test-qimen-ops-contract.mts
node --experimental-strip-types scripts/test-qimen-10k-queue.mts
node --experimental-strip-types scripts/test-qimen-notification-truth.mts
node --experimental-strip-types scripts/test-qimen-notification-engine-integration.mts
node --experimental-strip-types scripts/test-mobile-push-retry-worker.mts
node --experimental-strip-types scripts/test-notification-source-replay-task3.mts
node --experimental-strip-types scripts/test-notification-log-privacy-task3.mts
node --experimental-strip-types scripts/test-notification-observability.mts
node --experimental-strip-types scripts/test-notification-engagement.mts
node --experimental-strip-types scripts/test-notification-retention.mts
node --experimental-strip-types scripts/test-notification-cap-task3.mts
node --experimental-strip-types scripts/test-notification-atomicity-task3.mts
node --experimental-strip-types scripts/test-notification-preference-race.mts
node --experimental-strip-types scripts/test-push-send.mts
node --experimental-strip-types scripts/test-notification-scheduler-heartbeats.mts
node --experimental-strip-types scripts/test-notification-integrity-contract.mts
npx tsc --noEmit
systemd-analyze verify ops/systemd/hourkey-mobile-qimen-push.service ops/systemd/hourkey-mobile-qimen-push.timer
git diff --check
```

Mobile:

```bash
node --no-warnings --experimental-strip-types scripts/test-qimen-notification-payload-v2.mts
node --no-warnings --experimental-strip-types scripts/test-qimen-notification-detail-contract.mts
node --no-warnings --experimental-strip-types scripts/test-qimen-notification-route.mts
node --no-warnings --experimental-strip-types scripts/test-qimen-notification-history-parity.mts
node --no-warnings --experimental-strip-types scripts/test-qimen-notification-c4-ui.mts
node --no-warnings --experimental-strip-types scripts/test-qimen-notification-accessibility.mts
node --no-warnings --experimental-strip-types scripts/test-qimen-notification-large-font.mts
node --no-warnings --experimental-strip-types scripts/test-qimen-notification-i18n.mts
node --no-warnings --experimental-strip-types scripts/test-qimen-notification-android.mts
node --no-warnings --experimental-strip-types scripts/test-notification-engagement.mts
node --no-warnings --experimental-strip-types scripts/test-zibai-mobile-contract.mts
node --no-warnings --experimental-strip-types scripts/mobile-full-suite.mjs
./node_modules/.bin/tsc --noEmit
git diff --check
```
