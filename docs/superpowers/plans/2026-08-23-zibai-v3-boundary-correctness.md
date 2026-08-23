# Zi Bai V3 Boundary Correctness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Zi Bai V3 without stopping production, with month/day/shichen calculated at independent validity anchors and no cross-version duplicate notifications.

**Architecture:** Keep the generic flying-star engine unchanged. The notification science boundary performs three pure calculations: month at the requested instant, day at the apparent-solar day start, and shichen at the apparent-solar shichen start. Calculation V3 reuses snapshot schema 2, preserves V1/V2 history, and is activated through a forward database migration plus an atomically swapped committed release.

**Tech Stack:** TypeScript, Node.js/tsx, Next.js, PostgreSQL, React Native/Expo SDK 56, Android Gradle.

## Global Constraints

- Production service and timers remain running during build and review.
- Never edit `/root/releases/current` or another release artifact directly.
- No rewrite of V1/V2 immutable history.
- Month changes at the exact global `節`; day and shichen are latched at their own true-solar starts.
- Calculation semantics are named `zibai-zaoming-true-solar-v3`; unknown or mixed versions fail closed.
- No production push is sent during tests.
- Deployment source must be committed, pushed, built, and signed by five reviewers.

---

### Task 1: Anchor-correct science engine

**Files:**
- Modify: `src/lib/zibai-science.ts`
- Test: `scripts/test-zibai-v3-boundary-latching.mts`

**Interfaces:**
- Consumes: `solarDayWindow`, `shichenAt`, `computeFlyingLayers`, and the canonical global term runtime.
- Produces: `buildZibaiSnapshot(at, longitude)` with independent month/day/shichen anchors and `ZIBAI_CALCULATION_VERSION = "zibai-zaoming-true-solar-v3"`.

- [ ] Add a failing regression that proves Bangkok `處暑 T-1ms/T/T+1ms` has one `己巳` day map and that the next day begins `庚午` centre `6`.
- [ ] Add failing regressions for all six daily anchors at representative longitudes and `夏至/冬至` inside one shichen.
- [ ] Run `npx tsx scripts/test-zibai-v3-boundary-latching.mts`; verify the old current-instant implementation fails with the observed `4 → 7` change.
- [ ] Add one internal pure calculation helper accepting an instant and its term reference; call it separately at occurrence instant, `dayWindow.start`, and `shichen.start`.
- [ ] Select only `month_stars`, `day_stars`, and `hour_stars` from their respective calculations; retain existing bounds, focus derivation, permutations, and immutable projections.
- [ ] Run the new regression and existing science/month suites until green.
- [ ] Commit only the science test and implementation.

### Task 2: Versioned backend payload and producer

**Files:**
- Create: `src/lib/zibai-version-runtime.cjs`
- Create: `src/lib/zibai-version-runtime.cjs.d.ts`
- Modify: `src/lib/zibai-science.ts`
- Modify: `src/lib/notification-payload.cjs`
- Modify: `scripts/mobile-zibai-push-cron.cjs`
- Test: `scripts/test-zibai-notification-payload.mts`
- Test: `scripts/test-zibai-scheduler.mts`

**Interfaces:**
- Produces: one backend source of truth for active V3 and readable `{V2,V3}`.
- Requires: reference suffix, payload version, occurrence version, and source facts to match.

- [ ] Extend tests first: valid V2 history and valid V3 are accepted; mixed suffix/body versions and unknown versions are rejected; scheduler uses the snapshot version rather than a duplicated literal.
- [ ] Run the focused tests and confirm expected failures.
- [ ] Implement the shared version runtime and exact closed-set validation.
- [ ] Construct reference IDs, occurrence keys, source facts, and payloads from the canonical snapshot calculation version.
- [ ] Reject processing when an installation row is not activated for the active producer version.
- [ ] Run focused payload/scheduler/history tests and commit.

### Task 3: Cross-version dedupe and durable migration

**Files:**
- Create: `migrations/20260823_mobile_zibai_v3_boundary_latch.sql`
- Create: `migrations/20260823_mobile_zibai_v3_boundary_latch.rollback.sql`
- Modify: `scripts/mobile-zibai-push-cron.cjs`
- Test: `scripts/test-zibai-v3-migration.mts`
- Test: `scripts/test-zibai-scheduler.mts`
- Test: `scripts/test-zibai-delivery-contract.mts`

**Interfaces:**
- Produces: logical uniqueness for daily `(user, installation, solar date)` and shichen `(user, installation, solar date, shichen)` independent of calculation version.
- Preserves: V1/V2/V3 occurrence audit rows and immutable push payloads.

- [ ] Add failing upgrade/rollback and V2→V3 duplicate-admission tests.
- [ ] Run them and verify failure against the V2-only constraints/versioned occurrence lookup.
- [ ] Add a forward migration that audits duplicates, allows V3 history, activates installation rows/default to V3, and creates logical unique indexes.
- [ ] Add rollback that reactivates V2 without deleting V3 history or logical fences.
- [ ] Change occurrence admission to reuse only an unlinked same-version claim and suppress every already-existing logical occurrence across versions.
- [ ] Bind delivery reservation to the occurrence calculation version if the focused delivery test proves the current query lacks this check.
- [ ] Run migration, scheduler, reservation, delivery, and history suites and commit.

### Task 4: Mobile V3 compatibility

**Files in `/root/worktrees/hourkey-mobile-zibai-v3-p0`:**
- Modify: `src/navigation/notificationPayload.ts`
- Modify: `scripts/test-zibai-mobile-contract.mts`
- Modify: `scripts/test-zibai-three-layer-contract.mts`

**Interfaces:**
- Produces: mobile parsing of snapshot-schema-2 payloads for exact V2/V3 while preserving all V2 projections and rejecting mixed/unknown versions.

- [ ] Add failing V3 acceptance and mixed-version rejection tests before changing the parser.
- [ ] Run the focused mobile tests and verify they fail only because V3 is not yet supported.
- [ ] Generalize the exact calculation-version type and reference matching to the closed V2/V3 set.
- [ ] Run mobile Zi Bai contract/UI tests and `npm run typecheck`.
- [ ] Commit and push the mobile branch, then build the release APK with the existing embedded-bundle release process.

### Task 5: Cross-repository verification and deployment

**Files:**
- Modify: cross-repository E2E fixtures only if required to pin the new committed backend/mobile SHAs.
- Create: release artifacts and deployment evidence outside tracked source.

**Interfaces:**
- Consumes: committed backend and mobile SHAs.
- Produces: one reviewed backend release, one reviewed APK, and an atomic no-stop production activation.

- [ ] Run all Zi Bai science, payload, scheduler, migration, delivery, history, privacy, ops, queue, and cross-repository E2E suites with explicit backend/mobile SHAs.
- [ ] Run backend `tsc --noEmit` and `npm run build`; run mobile typecheck, bundle checks, and Android release build.
- [ ] Replay the production `處暑` incident and scheduler sequence in dry/no-send mode; verify one day map and no duplicate logical slot.
- [ ] Send the committed diffs and fresh evidence to five independent reviewers; resolve every Critical/Important finding and obtain five explicit approvals.
- [ ] Push both source branches. Apply the audited forward migration, atomically switch `/root/releases/current`, reload the web process without stopping timers, and verify active SHA/health/timer/provider dry-run.
- [ ] Publish the APK URL and retain the previous release link plus rollback SQL.
