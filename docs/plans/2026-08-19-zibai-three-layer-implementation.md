# Zi Bai Three-Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the solar-term month layer to Zi Bai so one mobile nine-palace table shows month, day, and shichen with deterministic caution-first interpretation matching the approved mockup.

**Architecture:** Extend the canonical immutable snapshot first, then derive one versioned nine-sector interpretation from its three exact star maps. Introduce an explicitly negotiated Zi Bai payload schema v2 while retaining v1 production and history projection for old clients. The mobile app parses both schemas and renders one Lo Shu table with a sector detail sheet.

**Tech Stack:** TypeScript/Node.js, Next.js mobile APIs, PostgreSQL, React Native/Expo, FCM/Expo push, `tyme4ts`, existing durable notification delivery.

## Global Constraints

- UI must match the approved mockup at
  `https://qimen3ai.com:8443/mockups/zibai-three-layer-design-v1-20260819.png`
  (SHA-256 `7a826f030b923fe4a9036437ec87be5ed9d715cb95a81010712a9dbbf8758823`):
  one `3 × 3` table with month/day/shichen rows in every palace and a
  tapped-sector detail sheet. Any deliberate visual deviation requires the
  user's approval before implementation continues.
- Mixed evidence is `caution-first`; supportive stars never cancel a caution.
- Never add, subtract, average, rank, multiply, or percentage-score temporal layers.
- `9–9–9` means three-layer temporal convergence, not “three times luck” and not Period 9.
- Month changes at the twelve `節` boundaries, not every solar term, Gregorian month, or lunar month.
- Apparent-solar day changes at 23:00; shichen changes every two apparent-solar hours.
- Daily snapshots contain month + day with `shichen: null`; shichen snapshots contain all three layers.
- Practical verdicts remain limited to reviewed stars `1, 2, 5, 9`; stars `3, 4, 6, 7, 8` are reference-only in interpretation v1.
- Coordinates, saved-house identity, natal data, Period-9 valuations, floor plans, and Qi Men scores are forbidden in payload/history/provider data.
- Existing v1 payloads and old APK behavior must remain valid.
- No real notification sends in tests.
- Completion requires three independent `SIGNED APPROVE` results on the same exact clean backend commit, mobile commit, and APK artifact.

---

## File Structure

### Backend

- Modify `src/lib/zibai-science.ts` — expose immutable month/day/shichen layers and exact layer bounds.
- Create `src/lib/zibai-three-layer-interpretation.ts` — pure nine-sector rule lattice and fixed codes.
- Modify `src/lib/notification-payload.cjs` and `.d.ts` — exact v2 Zi Bai envelope validation/building.
- Modify `scripts/mobile-zibai-push-cron.cjs` — choose v1/v2 by explicit installation capability.
- Modify `src/lib/zibai-notification-copy.cjs` — compact three-layer copy under 400 characters.
- Modify `src/app/api/mobile/v1/push/route.ts` — persist explicit Zi Bai schema capability.
- Modify `src/app/api/mobile/v1/notifications/route.ts` — capability-aware v2/v1 history projection.
- Create `migrations/20260819_mobile_zibai_three_layer.sql` and rollback — add token capability.
- Add focused science, interpretation, payload, scheduler, migration, history, privacy, and cross-repo tests under `scripts/`.

### Mobile

- Work from the isolated mobile checkout `/root/worktrees/zibai-three-layer-mobile`.
- Modify `src/navigation/notificationPayload.ts` — strict dual v1/v2 Zi Bai parser.
- Modify `src/greenfield/client.ts` — advertise schema 2 and request schema-aware history.
- Modify `src/components/design/zibaiVisualSemantics.ts` — three-layer sector profiles without scalar scoring.
- Modify `src/components/design/ZibaiScreen.tsx` — approved single-grid UI and bottom sheet.
- Modify registration/history call sites in `App.tsx` only where required by the typed client contract.
- Add parser, visual semantics, screen, accessibility, registration, and history tests under `scripts/`.

---

### Task 1: Freeze Exact Baselines and Add RED Contract Fixtures

**Files:**
- Create: `scripts/fixtures/zibai-three-layer-cases.json`
- Create: `scripts/test-zibai-three-layer-contract.mts`
- Create: `/root/worktrees/zibai-three-layer-mobile/scripts/test-zibai-three-layer-contract.mts`

**Interfaces:**
- Consumes: current `buildZibaiSnapshot`, current v1 payload, current `ZibaiScreen`.
- Produces: one sanitized fixture shared by backend/mobile tests with month/day/shichen maps and `9–9–9`, `9–5–2` sectors.

- [ ] **Step 1: Record exact clean backend/mobile heads and dirty-state inventory**

Run:

```bash
git rev-parse HEAD && git status --short
git -C /root/worktrees/zibai-three-layer-mobile rev-parse HEAD
git -C /root/worktrees/zibai-three-layer-mobile status --short
```

Expected: preserve unrelated dirty files; implementation must use isolated worktrees and never reset user changes.

- [ ] **Step 2: Write the shared sanitized fixture**

Use exact maps whose values are permutations `1–9` and include:

```json
{
  "snapshotSchema": 2,
  "calculationVersion": "zibai-zaoming-true-solar-v2",
  "interpretationVersion": "zibai-3layer-rule-v1",
  "month": { "startTermCode": "liqiu", "endTermCode": "bailu" },
  "assertions": {
    "NW": { "month": 9, "day": 9, "shichen": 9, "pattern": "three_layer_same_star" },
    "N": { "month": 9, "day": 5, "shichen": 2, "pattern": "mixed_caution_priority" }
  }
}
```

- [ ] **Step 3: Write RED backend and mobile contract tests**

Assertions must require `monthPalaces`, exact month bounds, nine sector records, v2 parser acceptance, and one-grid screen markers.

- [ ] **Step 4: Run RED tests**

Run:

```bash
./node_modules/.bin/tsx scripts/test-zibai-three-layer-contract.mts
cd /root/worktrees/zibai-three-layer-mobile && ./node_modules/.bin/tsx scripts/test-zibai-three-layer-contract.mts
```

Expected: FAIL because `monthPalaces`/v2 parser/three-layer grid do not exist.

- [ ] **Step 5: Commit fixture and RED tests**

```bash
git add scripts/fixtures/zibai-three-layer-cases.json scripts/test-zibai-three-layer-contract.mts
git commit -m "test(zibai): define three-layer contract"
```

Commit the mobile RED test independently in the mobile worktree.

---

### Task 2: Extend Canonical Science Snapshot with Solar-Term Month

**Files:**
- Modify: `src/lib/zibai-science.ts`
- Modify: `scripts/test-zibai-science.mts`
- Create: `scripts/test-zibai-month-boundaries.mts`

**Interfaces:**
- Produces:

```ts
type ZibaiLayer<T> = Readonly<{
  palaces: Readonly<PalaceStars>;
  startAt: string;
  endAt: string;
  flight: "順" | "逆";
  meta: T;
}>;

type ZibaiSnapshotV2 = Readonly<{
  snapshotSchema: 2;
  calculationVersion: typeof ZIBAI_CALCULATION_VERSION;
  interpretationVersion: "zibai-3layer-rule-v1";
  month: ZibaiLayer<{ yearBranch: string; monthBranch: string; jieqiMonth: number; startTermCode: string; endTermCode: string }>;
  day: ZibaiLayer<{ apparentSolarDate: string; dayPillar: string }>;
  shichen: ZibaiLayer<{ key: ZibaiShichenKey }>;
}>;
```

- [ ] **Step 1: Add RED month boundary tests**

Test all three year-branch groups, all twelve `節`, one second before/at/after each boundary, and intermediate `中氣` no-change behavior.

- [ ] **Step 2: Run RED science test**

```bash
./node_modules/.bin/tsx scripts/test-zibai-month-boundaries.mts
```

Expected: FAIL because snapshot omits month metadata/bounds.

- [ ] **Step 3: Implement exact global month bounds**

Add a pure helper returning the current and next twelve-section instants from the same global term reference used by `computeFlyingLayers`; never derive month bounds from longitude-shifted apparent fields.

- [ ] **Step 4: Return immutable month/day/shichen layer objects**

Keep legacy fields temporarily as compatibility projections inside backend tests only; new production v2 consumers use `snapshot.month/day/shichen`.

- [ ] **Step 5: Run science gates**

```bash
./node_modules/.bin/tsx scripts/test-zibai-science.mts
./node_modules/.bin/tsx scripts/test-zibai-month-boundaries.mts
./node_modules/.bin/tsx scripts/test-qimen-flying-stars.mts
```

Expected: all PASS; every layer exact permutation; longitude/DST do not move month boundary.

- [ ] **Step 6: Commit**

```bash
git add src/lib/zibai-science.ts scripts/test-zibai-science.mts scripts/test-zibai-month-boundaries.mts
git commit -m "feat(zibai): preserve solar-term month layer"
```

---

### Task 3: Add Pure Three-Layer Interpretation Lattice

**Files:**
- Create: `src/lib/zibai-three-layer-interpretation.ts`
- Create: `scripts/test-zibai-three-layer-interpretation.mts`

**Interfaces:**
- Produces:

```ts
export type ZibaiPatternCode =
  | "three_layer_same_star"
  | "two_layer_same_star"
  | "aligned"
  | "supportive_contested"
  | "mixed_caution_priority"
  | "heightened_caution"
  | "reference_only";

export type ZibaiSectorReading = Readonly<{
  direction: Dir9;
  palaceElement: ZibaiElement;
  month: ZibaiLayerEvidence;
  day: ZibaiLayerEvidence;
  shichen: ZibaiLayerEvidence | null;
  repeatCount: 1 | 2 | 3;
  repeatedLayers: readonly ("month" | "day" | "shichen")[];
  patternCode: ZibaiPatternCode;
  coherenceCode: "concentrated" | "repeated" | "aligned" | "mixed" | "contested";
  warningCodes: readonly string[];
  actionCode: string;
}>;

export function interpretZibaiSectors(snapshot: ZibaiSnapshotV2, includeShichen: boolean): readonly ZibaiSectorReading[];
```

- [ ] **Step 1: Write exhaustive RED tests**

Enumerate `9³ × 9 = 6,561` combinations and assert deterministic output, exact no-cancellation properties, and fixed representative readings.

- [ ] **Step 2: Run RED interpretation test**

Expected: module-not-found.

- [ ] **Step 3: Implement relation evidence and pattern classification**

Use no numeric scores. `patternCode` records structure while
`warningCodes`/`actionCode` carry the caution-first presentation. Apply this
classification order so a same-star convergence remains visible even when its
palace relation is contested or the repeated star carries caution:

```ts
if (allSameStar) return "three_layer_same_star";
if (repeatCount === 2 && hasFive) return "heightened_caution";
if (repeatCount === 2) return "two_layer_same_star";
if (hasSupport && hasCaution) return "mixed_caution_priority";
if (hasCaution) return "heightened_caution";
if (allGuidanceSupported && hasRestrainingRelation) return "supportive_contested";
if (allGuidanceSupported) return "aligned";
return "reference_only";
```

`three_layer_same_star` remains pattern metadata; final presentation state also carries caution/support evidence so `5–5–5` cannot look auspicious.

- [ ] **Step 4: Implement fixed action/warning codes**

Only `1, 2, 5, 9` may emit practical v1 action codes. Other stars return identity/relation and `reference_only`.

- [ ] **Step 5: Run exhaustive tests**

Expected: 6,561 combinations PASS; adding 9 never removes a Five Yellow warning.

- [ ] **Step 6: Commit**

```bash
git add src/lib/zibai-three-layer-interpretation.ts scripts/test-zibai-three-layer-interpretation.mts
git commit -m "feat(zibai): interpret three temporal layers"
```

---

### Task 4: Add Explicit Capability and Payload Schema v2

**Files:**
- Create: `migrations/20260819_mobile_zibai_three_layer.sql`
- Create: `migrations/20260819_mobile_zibai_three_layer.rollback.sql`
- Modify: `src/app/api/mobile/v1/push/route.ts`
- Modify: `src/lib/notification-payload.cjs`
- Modify: `src/lib/notification-payload.cjs.d.ts`
- Modify: `scripts/test-zibai-migration.mts`
- Modify: `scripts/test-zibai-notification-payload.mts`

**Interfaces:**
- Add `mobile_push_tokens.zibai_payload_schema smallint NOT NULL DEFAULT 1 CHECK (zibai_payload_schema IN (1,2))`.
- Registration body accepts only `zibaiPayloadSchema: 1 | 2`; omission preserves/defaults to 1.
- `buildNotificationPayload("zibai", accountId, facts)` branches on exact `snapshotSchema` and builds v1 or v2.

- [ ] **Step 1: Write RED migration and registration tests**

Assert fresh, upgrade, rollback/reapply, omitted capability=1, explicit 2 persists, invalid values 400, and registration does not alter Zi Bai consent.

- [ ] **Step 2: Write RED exact v2 payload tests**

Reject unknown fields, invalid maps, mismatched sector readings, missing month bounds, coordinates, Period-9 fields, accessors, symbols, and non-enumerable fields.

- [ ] **Step 3: Implement migration and registration**

Use an additive column only; no destructive rewrite of token rows.

- [ ] **Step 4: Implement exact v2 builder/validator**

Keep v1 byte behavior unchanged. V2 derives/verifies semantic records from maps rather than trusting caller labels.

- [ ] **Step 5: Run migration/payload gates**

```bash
./node_modules/.bin/tsx scripts/test-zibai-migration.mts
./node_modules/.bin/tsx scripts/test-zibai-notification-payload.mts
```

- [ ] **Step 6: Commit**

```bash
git add migrations/20260819_mobile_zibai_three_layer* src/app/api/mobile/v1/push/route.ts src/lib/notification-payload.cjs* scripts/test-zibai-migration.mts scripts/test-zibai-notification-payload.mts
git commit -m "feat(zibai): negotiate strict three-layer payloads"
```

---

### Task 5: Produce v2 Safely and Project History for Old Clients

**Files:**
- Modify: `scripts/mobile-zibai-push-cron.cjs`
- Modify: `src/lib/zibai-notification-copy.cjs`
- Modify: `src/app/api/mobile/v1/notifications/route.ts`
- Create: `src/lib/zibai-payload-projection.ts`
- Modify: `scripts/test-zibai-scheduler.mts`
- Modify: `scripts/test-zibai-delivery-contract.mts`
- Create: `scripts/test-zibai-history-projection.mts`

**Interfaces:**
- `buildZibaiV2Facts(snapshot, event): StrictZibaiV2Facts`.
- `projectZibaiPayload(payload, requestedSchema): v1 | v2` down-converts v2 to exact v1 for old history clients.
- Mobile history GET sends explicit `X-Hourkey-Zibai-Schema: 2`; absence means schema 1.

- [ ] **Step 1: Write RED producer/history tests**

Prove capable installation gets v2, legacy installation gets v1, v2 history down-converts exactly for an old client, and a new client retains v2.

- [ ] **Step 2: Implement capability branch per installation**

Daily v2 sets `shichen: null`; shichen v2 includes all three immutable layers. Never sample a shichen for daily.

- [ ] **Step 3: Implement compact caution-first copy**

Copy prioritizes triple repeats and Five Yellow/caution evidence, includes “not Period 9” when Nine Purple repeats, and stays within 400 characters in TH/EN/ZH.

- [ ] **Step 4: Implement history projection**

Down-conversion removes month/sector semantic fields and reconstructs only exact legacy focus/day/shichen fields from the immutable v2 maps. It never recomputes from current time/location.

- [ ] **Step 5: Run producer/provider/history/privacy tests**

Expected: FCM=Expo inner data, v1/v2 strict parser fixtures, no coordinates/PII, no real provider calls.

- [ ] **Step 6: Commit**

```bash
git add scripts/mobile-zibai-push-cron.cjs src/lib/zibai-notification-copy.cjs src/app/api/mobile/v1/notifications/route.ts src/lib/zibai-payload-projection.ts scripts/test-zibai-scheduler.mts scripts/test-zibai-delivery-contract.mts scripts/test-zibai-history-projection.mts
git commit -m "feat(zibai): deliver three-layer snapshots compatibly"
```

---

### Task 6: Add Strict Mobile v2 Parser and Capability Wiring

**Files:**
- Modify: `/root/worktrees/zibai-three-layer-mobile/src/navigation/notificationPayload.ts`
- Modify: `/root/worktrees/zibai-three-layer-mobile/src/greenfield/client.ts`
- Modify: `/root/worktrees/zibai-three-layer-mobile/App.tsx`
- Modify: `/root/worktrees/zibai-three-layer-mobile/scripts/test-notification-payload.mts`
- Modify: `/root/worktrees/zibai-three-layer-mobile/scripts/test-account-store-clients.mts`

**Interfaces:**
- `resolveNotificationPayload` returns a discriminated v1/v2 Zi Bai payload.
- Push registration sends `zibaiPayloadSchema: 2`.
- Notification history sends `X-Hourkey-Zibai-Schema: 2`.

- [ ] **Step 1: Write RED parser mutation tests**

Test exact keys, own data descriptors, 27 map entries, nine derived sector records, bounds, term codes, and v1 compatibility.

- [ ] **Step 2: Implement strict v2 snapshot validation**

Snapshot properties are captured once. Never repeatedly read accessors/proxies while validating.

- [ ] **Step 3: Wire explicit capability**

Registration and history requests advertise schema 2; sign-out/account reset preserve existing abort/owner guards.

- [ ] **Step 4: Run focused mobile tests and typecheck**

```bash
node scripts/test-notification-payload.mts
node scripts/test-account-store-clients.mts
npx tsc --noEmit
```

- [ ] **Step 5: Commit mobile changes**

```bash
git add src/navigation/notificationPayload.ts src/greenfield/client.ts App.tsx scripts/test-notification-payload.mts scripts/test-account-store-clients.mts
git commit -m "feat(mobile): accept three-layer zibai snapshots"
```

---

### Task 7: Build the Approved One-Grid Mobile UI

**Files:**
- Modify: `/root/worktrees/zibai-three-layer-mobile/src/components/design/zibaiVisualSemantics.ts`
- Modify: `/root/worktrees/zibai-three-layer-mobile/src/components/design/ZibaiScreen.tsx`
- Create: `/root/worktrees/zibai-three-layer-mobile/scripts/test-zibai-three-layer-ui.mts`
- Modify: `/root/worktrees/zibai-three-layer-mobile/scripts/test-zibai-detail-colors.mts`

**Interfaces:**
- `buildZibaiDirectionProfilesV2(payload): readonly ZibaiDirectionProfileV2[]` returns exactly nine sectors in Lo Shu order.
- `ZibaiScreen` renders `zibai-sector-{direction}` and `zibai-sector-sheet` test IDs.

- [ ] **Step 1: Write RED render and accessibility tests**

Require all nine sectors, 27 labelled layer entries, `N ↑`, `9–9–9` badge, `9–5–2` caution-first badge, neutral cell background, legend text, and one accessible button per sector.

The visual test fixture must reference the approved mockup URL and SHA-256 so
the release report can prove which design was implemented.

- [ ] **Step 2: Implement pure visual semantics**

Separate star identity color from interpretation glyph. Never return an overall house verdict or numeric score.

- [ ] **Step 3: Replace separate day/hour charts with one grid**

Match the approved mockup hierarchy and wording. Daily snapshots render shichen as unavailable, never current/recomputed.

- [ ] **Step 4: Add tapped-sector bottom sheet**

Show stars, relations, bounds, caution-first meaning, bounded action, and the explicit no-Period-9 statement.

- [ ] **Step 5: Add large-font list fallback and focus behavior**

Use a deterministic font-scale threshold; no horizontal scroll. Restore accessibility focus to the originating sector after close.

- [ ] **Step 6: Run UI, action, navigation, and type tests**

```bash
node scripts/test-zibai-three-layer-ui.mts
node scripts/test-zibai-detail-colors.mts
node scripts/test-zibai-actions.mts
node scripts/test-zibai-app-wiring.mts
npx tsc --noEmit
```

- [ ] **Step 7: Commit mobile UI**

```bash
git add src/components/design/zibaiVisualSemantics.ts src/components/design/ZibaiScreen.tsx scripts/test-zibai-three-layer-ui.mts scripts/test-zibai-detail-colors.mts
git commit -m "feat(mobile): show zibai month day shichen grid"
```

---

### Task 8: Cross-Repo End-to-End and Load Regression

**Files:**
- Create: `scripts/test-zibai-three-layer-e2e.mts`
- Modify: `scripts/test-zibai-10k-queue.mts`
- Modify: `scripts/test-notification-live-producers-task3.mts`

**Interfaces:**
- Require explicit `HOURKEY_MOBILE_ROOT` and `HOURKEY_MOBILE_SHA`; no fallback worktree.

- [ ] **Step 1: Add real canonical scheduler → durable DB → FCM/Expo → exact mobile parser test**

Cover daily v1, daily v2, shichen v1, shichen v2, history projection, and privacy-off copy.

- [ ] **Step 2: Add boundary replay**

Replay month boundary, apparent-day 23:00, shichen boundary, DST fold/gap, and history after expiry.

- [ ] **Step 3: Extend 10k stub-provider drain**

Require v2 payload creation/validation/interpretation within existing scheduler/provider SLO and record p95/p99, pool saturation, accepted count, and errors.

- [ ] **Step 4: Run exact cross-repo aggregate**

```bash
HOURKEY_MOBILE_ROOT=/absolute/mobile/worktree \
HOURKEY_MOBILE_SHA=<exact-sha> \
./node_modules/.bin/tsx scripts/test-zibai-three-layer-e2e.mts
```

Expected: zero real sends, exact parser/provider/history parity.

- [ ] **Step 5: Commit backend cross-repo gates**

```bash
git add scripts/test-zibai-three-layer-e2e.mts scripts/test-zibai-10k-queue.mts scripts/test-notification-live-producers-task3.mts
git commit -m "test(zibai): gate three-layer delivery end to end"
```

---

### Task 9: Full Verification, Independent Reviews, Build, and Release

**Files:**
- Update: `docs/specs/2026-08-19-zibai-three-layer-design.md` only if implementation revealed a reviewed contract correction.
- Create: review reports under the existing project report convention.

- [ ] **Step 1: Run backend full focused aggregate**

Include science, month boundaries, interpretation 6,561 cases, payload, migration, scheduler DB, delivery/retry, cap/atomicity, privacy, source replay, live producers, retention, observability, `tsc --noEmit`, syntax, and `git diff --check`.

- [ ] **Step 2: Run mobile canonical suite and typecheck**

Include strict payload/navigation/history, Zi Bai UI/actions/location/account isolation, notification settings, current-native manifest, and the repository full suite without test reduction.

- [ ] **Step 3: Obtain three independent source signatures**

Each reviewer receives exact backend/mobile SHAs and returns `SIGNED APPROVE` or a precise rejection. Any source change invalidates all signatures.

- [ ] **Step 4: Build a fresh internal-QA APK**

Use the reviewed release builder. Verify package/version, arm64, signature, embedded Hermes bundle/source parity, background-location permissions, Unity parity, and exact Zi Bai v2 markers.

- [ ] **Step 5: Obtain three independent artifact/live signatures**

All reviewers inspect the same APK SHA and backend release SHA. Any rejection or artifact rebuild restarts 3/3.

- [ ] **Step 6: Deploy behind capability/canary gate**

Deploy backend schema/code first with old clients on v1. Install the internal-QA APK only on approved canary devices. Do not enable v2 broadly until live parser/history/privacy checks pass.

- [ ] **Step 7: Verify rollback**

Prove capability off returns v1, old history still opens, backend release symlink rollback works, and no consent/location setting changes.

---

## Plan Self-Review

- Spec coverage: science, month boundaries, rule lattice, mockup UI, payload compatibility, history projection, privacy, accessibility, load, rollout, and 3/3 signatures each map to a task.
- Placeholder scan: no `TBD`, `TODO`, or unspecified implementation step remains.
- Type consistency: `snapshotSchema=2`, `interpretationVersion=zibai-3layer-rule-v1`, `ZibaiSnapshotV2`, and `ZibaiSectorReading` are used consistently across tasks.
- Scope: no Period-9, house-facing, natal, Qi Men, new monthly notification toggle, or unsupported star guidance is included.
