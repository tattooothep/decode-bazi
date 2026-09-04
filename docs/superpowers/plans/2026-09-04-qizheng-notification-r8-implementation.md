# Qizheng Notification R8 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the separate `astronomy_fact` and `qizheng` notification lanes defined by R8 without enabling a Qizheng verdict or any provider send before its science and release gates pass.

**Architecture:** Add isolated, versioned domain records and payload contracts first. The astronomy lane may progress through pull-only and provider-incapable shadow stages using deterministic sky facts; the Qizheng lane remains structurally hard-off while every source artifact is `pending_double_verification`. Existing delivery primitives are reused only beneath explicit lane/category boundaries, and legacy notification behavior remains byte-equivalent.

**Tech Stack:** PostgreSQL 16 migrations, TypeScript/Node.js, Next.js 16 route handlers, `astronomy-engine` 2.1.19, React Native/Expo mobile v233 baseline, deterministic CBOR/HMAC identities, FCM/APNs/Expo delivery adapters.

## Global Constraints

- Backend baseline includes production network-morning recovery commit `6ebeb3b9be2c95156959717ca2e24d66119fc0ec`; mobile baseline is `5af5f20687f40e55c23c52a15a6b620c700848b6`.
- `astronomy_fact` and `qizheng` have separate consent, schema, category, lane, route, channel, producer state, analytics, and copy.
- Every new preference is default-off. Qizheng consent, schema eligibility, occurrence creation, scheduler, and provider delivery remain hard-off while source evidence is incomplete.
- No Qimen, Zi Bai, Zi Wei, Yam, western-electional, AI, or weighted-score logic may affect either lane's calculation or verdict.
- A civil two-hour astronomy item is labelled as sky information, not a shichen or auspicious judgment; it contains no good/bad language, score, advice, or personalization.
- Provider data contains only schema/category, opaque occurrence ID, installation-scoped audience binding, and allowlisted route metadata—never account/profile/org IDs, birth facts, coordinates, or judgment text.
- Supported locales are `th`, `en`, `zh-Hans`, `zh-Hant`, `vi`, `ja`, `ru`, `ko`, and `es`; legacy `cn`/`zh` mapping must not alter existing notification rows.
- Production providers remain inaccessible through pull-only and shadow milestones. Activation requires the R8 72-hour soak and five fresh signatures on one immutable backend/mobile bundle.
- Existing Yam, auspicious, daily, Qimen, Zi Bai, Zi Wei, security, service, caps, quiet hours, routes, and retry behavior must remain byte-equivalent.

---

### Task 1: Pin the R8 safety and capability contract

**Files:**
- Create: `src/lib/astro/notification-r8-contract.ts`
- Create: `scripts/test-notification-r8-contract.mts`
- Modify: `src/lib/astro/qizheng/electional-source-manifest.ts`

**Interfaces:**
- Produces: `R8_SOURCE_DIGEST`, `R8_ASTRONOMY_SCHEMA`, `R8_QIZHENG_SCHEMA`, `r8ProductionCapability()` and `assertR8LaneKey()`.
- Consumes: the canonical source digest and artifact statuses already exported by `electional-source-manifest.ts`.

- [ ] **Step 1: Write the failing contract test**

```ts
import assert from "node:assert/strict";
import { R8_QIZHENG_SCHEMA, r8ProductionCapability } from "../src/lib/astro/notification-r8-contract";

const gate = r8ProductionCapability();
assert.equal(R8_QIZHENG_SCHEMA, 0);
assert.deepEqual(gate, {
  astronomyFact: "pull_only",
  qizheng: "blocked_source_incomplete",
  providerSend: false,
});
```

- [ ] **Step 2: Run the test and verify the missing module failure**

Run: `npx tsx scripts/test-notification-r8-contract.mts`

Expected: FAIL with `Cannot find module '../src/lib/astro/notification-r8-contract'`.

- [ ] **Step 3: Implement the immutable contract**

```ts
import {
  QIZHENG_ELECTIONAL_SOURCE_ARTIFACTS,
  QIZHENG_ELECTIONAL_SOURCE_DIGEST,
} from "./qizheng/electional-source-manifest";

export const R8_SOURCE_DIGEST = QIZHENG_ELECTIONAL_SOURCE_DIGEST;
export const R8_ASTRONOMY_SCHEMA = 1 as const;
export const R8_QIZHENG_SCHEMA = 0 as const;
export type R8ScienceId = "astronomy_fact" | "qizheng";

export function assertR8LaneKey(science: R8ScienceId, submode: string, schema: number): string {
  if (!/^[a-z][a-z0-9_]{0,31}$/u.test(submode)) throw new TypeError("r8_submode_invalid");
  if (!Number.isInteger(schema) || schema < 0 || schema > 32) throw new TypeError("r8_schema_invalid");
  return `${science}:${submode}:v${schema}`;
}

export function r8ProductionCapability() {
  const evidenceComplete = QIZHENG_ELECTIONAL_SOURCE_ARTIFACTS.every(
    (artifact) => String(artifact.transcriptionStatus) === "double_verified",
  );
  return Object.freeze({
    astronomyFact: "pull_only" as const,
    qizheng: evidenceComplete ? "review_required" as const : "blocked_source_incomplete" as const,
    providerSend: false as const,
  });
}
```

Update the artifact status type to admit `double_verified` without changing any current row from `pending_double_verification`.

- [ ] **Step 4: Run focused and existing source-readiness tests**

Run: `npx tsx scripts/test-notification-r8-contract.mts && npx tsx scripts/test-qizheng-electional-preview.mts && npx tsx scripts/test-mobile-hourly-science-migration.mts`

Expected: all pass and Qizheng remains schema `0`, source-incomplete, verdict-null, ranking-empty, and notification-ineligible.

- [ ] **Step 5: Commit**

```bash
git add src/lib/astro/notification-r8-contract.ts src/lib/astro/qizheng/electional-source-manifest.ts scripts/test-notification-r8-contract.mts
git commit -m "feat(qizheng): pin R8 source and capability gates"
```

### Task 2: Add isolated additive database foundations

**Files:**
- Create: `migrations/20260904_mobile_science_notifications_r8.sql`
- Create: `migrations/20260904_mobile_science_notifications_r8.rollback.sql`
- Create: `scripts/test-mobile-science-notifications-r8-migration.mts`

**Interfaces:**
- Produces: separate subscription, producer-state, delivery-chain, occurrence, and immutable-revision records keyed by `science_id + submode + schema_version`.
- Preserves: `mobile_notification_prefs.qizheng_electional_enabled=false` and `mobile_push_tokens.qizheng_payload_schema=0` constraints.

- [ ] **Step 1: Write migration assertions before SQL**

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync("migrations/20260904_mobile_science_notifications_r8.sql", "utf8");
assert.match(sql, /science_id IN \('astronomy_fact','qizheng'\)/u);
assert.match(sql, /CHECK \(provider_send_enabled=false\)/u);
assert.match(sql, /CHECK \(qizheng_payload_schema=0\)/u);
assert.match(sql, /UNIQUE NULLS NOT DISTINCT/u);
assert.doesNotMatch(sql, /UPDATE mobile_.*(?:yam|qimen|zibai|ziwei)/iu);
```

- [ ] **Step 2: Run the test and verify it fails because the migration is absent**

Run: `npx tsx scripts/test-mobile-science-notifications-r8-migration.mts`

Expected: FAIL with `ENOENT` for the new migration.

- [ ] **Step 3: Implement rerunnable hard-off SQL**

Create additive tables with these exact primary interfaces:

```sql
CREATE TABLE mobile_science_notification_producer_state (
  science_id text NOT NULL CHECK (science_id IN ('astronomy_fact','qizheng')),
  submode text NOT NULL,
  schema_version smallint NOT NULL CHECK (schema_version >= 0),
  rollout_epoch bigint NOT NULL DEFAULT 1 CHECK (rollout_epoch > 0),
  source_digest text NOT NULL CHECK (source_digest ~ '^[0-9a-f]{64}$'),
  evidence_complete boolean NOT NULL DEFAULT false,
  provider_send_enabled boolean NOT NULL DEFAULT false CHECK (provider_send_enabled=false),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (science_id,submode,schema_version)
);

CREATE TABLE mobile_science_notification_subscriptions (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  science_id text NOT NULL CHECK (science_id IN ('astronomy_fact','qizheng')),
  submode text NOT NULL,
  enabled boolean NOT NULL DEFAULT false CHECK (enabled=false),
  cadence text NOT NULL,
  local_day_cap smallint NOT NULL CHECK (local_day_cap BETWEEN 1 AND 12),
  consent_generation bigint NOT NULL DEFAULT 1 CHECK (consent_generation > 0),
  profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  profile_revision bigint,
  locale text NOT NULL,
  display_timezone text NOT NULL,
  receipt jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,science_id,submode)
);
```

Add delivery chains with one partial-unique primary endpoint, occurrence lineage, canonical identity `bytea CHECK(octet_length(identity_hash)=32)`, immutable result revision, rollout epoch, and provider-incapable shadow states. Qizheng rows additionally enforce `schema_version=0`, `enabled=false`, and `provider_send_enabled=false`.

- [ ] **Step 4: Run the migration against a disposable database twice, then rollback containment**

Run: `npx tsx scripts/test-mobile-science-notifications-r8-migration.mts`

Expected: PASS for first apply, second apply, constraints, isolation, grants, and rollback that disables lanes without deleting occurrence/audit evidence.

- [ ] **Step 5: Commit**

```bash
git add migrations/20260904_mobile_science_notifications_r8.sql migrations/20260904_mobile_science_notifications_r8.rollback.sql scripts/test-mobile-science-notifications-r8-migration.mts
git commit -m "feat(notifications): add hard-off R8 science lanes"
```

### Task 3: Implement deterministic two-hour astronomy facts

**Files:**
- Create: `src/lib/astro/astronomy-fact-r8.ts`
- Create: `scripts/test-astronomy-fact-r8.mts`

**Interfaces:**
- Produces: `buildCivilSkySnapshot(input): AstronomyFactSnapshot` and `nextCivilTwoHourBoundary(timezone, after): Boundary | null`.
- Consumes: `computeAstro()` only; no Qizheng rule, natal profile, score, or AI input.

- [ ] **Step 1: Write failing goldens and wording exclusions**

```ts
const snapshot = buildCivilSkySnapshot({
  instant: new Date("2026-09-04T05:00:00.000Z"),
  timezone: "Asia/Bangkok",
  observation: { frame: "geocentric", location: null },
});
assert.equal(snapshot.localBoundary, "2026-09-04T12:00:00+07:00");
assert.deepEqual(snapshot.physicalBodies.map((body) => body.key),
  ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"]);
assert.equal(snapshot.points.every((point) => point.definition === "mean_lunar_node" || point.definition === "lunar_apogee"), true);
assert.doesNotMatch(JSON.stringify(snapshot), /ดี|ร้าย|มงคล|score|advice|體|用|廟旺/iu);
```

Add DST gap/fold cases for New York, Berlin, London, Bangkok, Kolkata, Kathmandu, UTC+14, UTC-12, Samoa skipped date, and a property test asserting at most 12 unique boundary identities per local day.

- [ ] **Step 2: Run and observe the missing export failure**

Run: `npx tsx scripts/test-astronomy-fact-r8.mts`

Expected: FAIL with missing `buildCivilSkySnapshot`.

- [ ] **Step 3: Implement strict immutable output**

```ts
export type AstronomyFactSnapshot = Readonly<{
  schema: 1;
  category: "astronomy_fact";
  mode: "civil_two_hour";
  instant: string;
  localBoundary: string;
  timezone: string;
  frame: "geocentric" | "topocentric";
  physicalBodies: readonly AstronomyBodyFact[];
  points: readonly AstronomyPointFact[];
  prediction: false;
  judgment: null;
}>;
```

Reject invalid IANA zones, nonexistent civil boundaries, unknown point definitions, non-finite positions, more than seven physical bodies, and any output key outside the schema. A repeated DST boundary selects the earlier offset once and includes UTC instant, offset, fold, and local date in its unit identity.

- [ ] **Step 4: Run goldens twice and compare canonical output bytes**

Run: `npx tsx scripts/test-astronomy-fact-r8.mts && npx tsx scripts/test-astronomy-fact-r8.mts`

Expected: PASS both times with the same printed SHA-256 corpus digest.

- [ ] **Step 5: Commit**

```bash
git add src/lib/astro/astronomy-fact-r8.ts scripts/test-astronomy-fact-r8.mts
git commit -m "feat(astronomy): add deterministic two-hour sky facts"
```

### Task 4: Add authenticated pull-only APIs and immutable detail ownership

**Files:**
- Create: `src/app/api/mobile/v1/astronomy-facts/route.ts`
- Create: `src/app/api/mobile/v1/astronomy-facts/[occurrenceId]/route.ts`
- Create: `src/app/api/mobile/v1/qizheng/notification-detail/[occurrenceId]/route.ts`
- Create: `src/lib/mobile-science-notification-detail-r8.ts`
- Create: `scripts/test-mobile-science-notification-detail-r8.mts`

**Interfaces:**
- Produces: authenticated list/detail responses with `Cache-Control: private, no-store` and generic non-enumerating failures.
- Consumes: stored immutable snapshots only; detail handlers never recompute astronomy or Qizheng results.

- [ ] **Step 1: Write route security tests**

Test exact UUID parsing, current account/installation audience binding, cross-account 404 equivalence, revoked/expired/rollback states, `no-store`, schema-0 Qizheng rejection, and source code scans proving detail routes do not import `computeAstro`, Qizheng engines, AI, or prompt modules.

- [ ] **Step 2: Run and verify missing route/module failures**

Run: `npx tsx scripts/test-mobile-science-notification-detail-r8.mts`

Expected: FAIL until all four files exist.

- [ ] **Step 3: Implement the server resolver**

```ts
export async function resolveScienceNotificationDetail(
  db: Pool,
  input: Readonly<{ userId: string; orgId: string; installationId: string; occurrenceId: string; category: "astronomy_fact" | "qizheng" }>,
): Promise<Readonly<{ state: "current" | "expired" | "revoked" | "rollback"; snapshot: unknown }> | null> {
  const row = await db.query(
    `SELECT o.state,o.snapshot FROM mobile_science_notification_occurrences o
      JOIN mobile_science_notification_chains c ON c.id=o.chain_id
     WHERE o.id=$1 AND c.user_id=$2 AND c.org_id=$3
       AND c.primary_installation_id=$4 AND c.science_id=$5 LIMIT 1`,
    [input.occurrenceId,input.userId,input.orgId,input.installationId,input.category],
  );
  return row.rows[0] ?? null;
}
```

Return the same generic unauthorized body for missing, other-account, and other-installation rows. Current details expose pinned versions and typed facts; provider payload IDs never expose profile/account/org IDs.

- [ ] **Step 4: Run route, auth, privacy, and existing mobile API tests**

Run: `npx tsx scripts/test-mobile-science-notification-detail-r8.mts && npx tsx scripts/test-mobile-science-preview-routes.mts && npx tsc --noEmit`

Expected: PASS with zero recomputation and zero cross-account disclosure.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/mobile/v1/astronomy-facts src/app/api/mobile/v1/qizheng/notification-detail src/lib/mobile-science-notification-detail-r8.ts scripts/test-mobile-science-notification-detail-r8.mts
git commit -m "feat(notifications): add pull-only R8 science details"
```

### Task 5: Build a provider-incapable shadow scheduler

**Files:**
- Create: `scripts/mobile-astronomy-fact-shadow-cron.mts`
- Create: `src/lib/mobile-science-shadow-r8.ts`
- Create: `scripts/test-mobile-science-shadow-r8.mts`
- Modify: `scripts/notification-health.cjs`

**Interfaces:**
- Produces: scheduled/shadow occurrence evidence and partitioned health metrics.
- Must not import: `push-send`, `mobile-notification-delivery`, FCM, APNs, Expo, or provider credentials.

- [ ] **Step 1: Write the provider-capability negative test**

```ts
const source = readFileSync("scripts/mobile-astronomy-fact-shadow-cron.mts", "utf8");
assert.doesNotMatch(source, /push-send|mobile-notification-delivery|firebase|expo-server|apns/iu);
assert.match(source, /provider_send_enabled=false/u);
```

Add disposable-DB tests for scheduler lease namespace, civil boundary identity, account/local-day cap, rolling-24-hour cap, quiet-hour expiry, generation suppression, two-device primary selection, restart idempotency, and no changes to legacy heartbeat rows.

- [ ] **Step 2: Run and verify missing shadow scheduler failure**

Run: `npx tsx scripts/test-mobile-science-shadow-r8.mts`

Expected: FAIL because the shadow files are absent.

- [ ] **Step 3: Implement shadow scheduling**

The scheduler reads only enabled internal test subscriptions, verifies the producer row is `provider_send_enabled=false`, builds immutable astronomy facts, writes `shadowed` occurrences transactionally, and advances its own lane heartbeat. It exits non-zero if any provider-capable module is present in its dependency inventory.

- [ ] **Step 4: Run race/load/isolation tests**

Run: `npx tsx scripts/test-mobile-science-shadow-r8.mts && node scripts/test-notification-load-5000.mjs && npx tsx scripts/test-notification-scheduler-heartbeats.mts`

Expected: PASS, no provider attempts, at least 2× projected peak headroom, and no legacy p95 regression above 5%.

- [ ] **Step 5: Commit**

```bash
git add scripts/mobile-astronomy-fact-shadow-cron.mts src/lib/mobile-science-shadow-r8.ts scripts/test-mobile-science-shadow-r8.mts scripts/notification-health.cjs
git commit -m "feat(notifications): add provider-free astronomy shadow lane"
```

### Task 6: Add strict mobile schemas, routes, and separate cards

**Repositories and files:**
- Backend modify: `src/lib/notification-payload.cjs`, `src/lib/mobile-push-registration-readiness.cjs`, `src/app/api/mobile/v1/notifications/route.ts`
- Mobile modify: `src/navigation/notificationPayload.ts`, `src/navigation/notificationRouteDispatcher.ts`, `src/native/push.ts`, `src/native/notificationPreferencePolicy.ts`, `src/components/design/NotificationCenterScreen.tsx`
- Mobile create: `src/components/design/astronomy/AstronomyFactDetailScreen.tsx`, `src/components/design/qizheng/QizhengNotificationDetailScreen.tsx`
- Test create: backend `scripts/test-mobile-science-payload-r8.mts`; mobile `scripts/testNotificationScienceR8.mts`

**Interfaces:**
- Produces two exact payload kinds and two allowlisted routes: `/astronomy-facts/detail` and `/qizheng/notification-detail`.
- Keeps mobile Qizheng capability at schema `0`; astronomy schema `1` is parseable for pull/shadow fixtures but not delivery-eligible.

- [ ] **Step 1: Write backend/mobile negative and positive parser tests**

Use this exact provider data shape for astronomy fixtures:

```ts
{
  v: 1,
  kind: "astronomy_fact",
  notificationId: "00000000-0000-4000-8000-000000000001",
  occurrenceId: "00000000-0000-4000-8000-000000000002",
  audience: "A9c7wP4nY2kLm8QrV5sT1u",
  mode: "civil_two_hour",
  url: "/astronomy-facts/detail"
}
```

Reject account/profile/org IDs, coordinates, birth values, judgment text, unknown keys, oversized fields, incorrect category-route pairs, schema-0 Qizheng payloads, and account/installation mismatch.

- [ ] **Step 2: Run both test files and observe missing-kind failures**

Run backend: `npx tsx scripts/test-mobile-science-payload-r8.mts`

Run mobile: `npx tsx scripts/testNotificationScienceR8.mts`

Expected: both fail before parser and route changes.

- [ ] **Step 3: Implement strict parsing and display-only details**

Cards use independent toggles and explain that sky facts are not predictions while Qizheng remains unavailable due to incomplete source evidence. Detail screens fetch authenticated immutable snapshots, show safe expired/revoked/rollback/offline states, and never recompute or redirect to another science.

- [ ] **Step 4: Run nine-locale, navigation, foreground/background/killed-open, logout purge, and legacy replay tests**

Run backend: `npx tsx scripts/test-mobile-science-payload-r8.mts && npx tsx scripts/test-notification-source-replay-task3.mts`

Run mobile: `npx tsx scripts/testNotificationScienceR8.mts && npx tsc --noEmit`

Expected: all R8 fixtures pass and legacy canonical payload corpus is byte-equivalent.

- [ ] **Step 5: Commit both repositories separately**

```bash
git add src/lib/notification-payload.cjs src/lib/mobile-push-registration-readiness.cjs src/app/api/mobile/v1/notifications/route.ts scripts/test-mobile-science-payload-r8.mts
git commit -m "feat(notifications): add strict R8 mobile payload contracts"
```

```bash
git add src/navigation/notificationPayload.ts src/navigation/notificationRouteDispatcher.ts src/native/push.ts src/native/notificationPreferencePolicy.ts src/components/design/NotificationCenterScreen.tsx src/components/design/astronomy src/components/design/qizheng scripts/testNotificationScienceR8.mts
git commit -m "feat(notifications): add R8 science cards and details"
```

### Task 7: Prove the immutable hard-off release bundle

**Files:**
- Create: `scripts/test-notification-r8-final-gates.mts`
- Create: `docs/notification-science/qizheng-r8-release-evidence.json`
- Modify: `scripts/notification-observability-preflight.cjs`

**Interfaces:**
- Produces one manifest digest covering backend/mobile commits, builds, lockfiles, astronomy dataset/model, tzdb/ICU, source/rule/copy/schema digests, and runtime bundle digest.
- Does not enable provider delivery or Qizheng schema/consent.

- [ ] **Step 1: Write the final gate verifier**

The verifier fails unless all pinned fields are present and hashed, all Qizheng hard-off constraints hold, no R8 provider attempt exists, every legacy replay is byte-equivalent, all nine locale reviews are signed, no forbidden claim/PII exists, and rollback preserves other lanes.

- [ ] **Step 2: Run full backend and mobile suites plus production builds**

Run backend:

```bash
npx tsc --noEmit
npx tsx scripts/test-notification-r8-final-gates.mts
npx tsx scripts/test-notification-live-producers-task3.mts
npx tsx scripts/test-mobile-push-retry-worker.mts
npx tsx scripts/test-notification-science-final-blockers.mts
npx next build --webpack
```

Run mobile:

```bash
npx tsc --noEmit
npx tsx scripts/testNotificationScienceR8.mts
npx expo export --platform android --platform ios
```

Expected: all exit `0`; Qizheng schema remains `0`; new provider attempts remain `0`.

- [ ] **Step 3: Run the provider-free 72-hour/10,000-user soak**

Exercise 120,000 daily boundaries plus C1/B/C2/D1/D2 placeholder-free synthetic envelopes, provider throttling simulations, crashes, revoke/deletion races, timezone/DST matrices, and legacy noisy-neighbor load. The process has no provider credentials. Required outcomes are p95 ≤5 minutes, p99 ≤10 minutes, backlog <10 minutes, pool/quota simulation <70%, ≥2× headroom, legacy p95 regression <5%, and zero duplicate lineages.

- [ ] **Step 4: Collect five independent signatures on the exact manifest digest**

Each reviewer records `PASS/FAIL`, commit pair, artifact digests, test evidence, and Critical/Important/Minor findings. Any changed byte invalidates all five signatures.

- [ ] **Step 5: Commit and push the hard-off bundle**

```bash
git add scripts/test-notification-r8-final-gates.mts scripts/notification-observability-preflight.cjs docs/notification-science/qizheng-r8-release-evidence.json
git commit -m "test(notifications): lock R8 hard-off release evidence"
git push origin feat/qizheng-notifications-r8
```

## Explicit activation boundary

This plan intentionally ends with a verified hard-off bundle. Enabling external astronomy pushes requires a separate signed activation migration after the 72-hour soak. Enabling any Qizheng notification additionally requires every source transcription, rule/precedence table, astronomy calibration, activity/owner matrix, copy mapping, and reproducible golden to be complete and signed; the current canonical ledger proves those inputs are incomplete, so no scientifically honest activation code can be written in this implementation.

## Self-review record

- Spec coverage: lane separation, source gate, deterministic astronomy, profile/time isolation, consent defaults, caps, one-primary endpoint, immutable details, privacy, provider-free shadowing, mobile schemas, observability, rollback, soak, and five-signature gates map to Tasks 1–7.
- Placeholder scan: the plan contains no deferred implementation markers; science inputs that do not exist are an explicit activation boundary, not fabricated work.
- Type consistency: science IDs, schemas, routes, occurrence/audience IDs, capability values, and source digest names are consistent across database, backend, mobile, and tests.
- Execution choice: the user already selected inline execution with “อนุมัติ R8 ลุย”; execute Tasks 1–7 in order and stop before the explicit activation boundary.
