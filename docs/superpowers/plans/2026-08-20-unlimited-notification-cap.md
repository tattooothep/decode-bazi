# Unlimited Notification Cap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `maxPerDay: 0` an explicit unlimited notification preference across backend policy, durable delivery, and mobile settings.

**Architecture:** Preserve the existing integer field and wire contract. Interpret only zero as unlimited at every backend enforcement boundary, expose zero as a localized mobile choice, then deploy backend before updating the production account.

**Tech Stack:** Node.js/TypeScript, PostgreSQL, React Native/Expo, Gradle Android.

## Global Constraints

- Positive caps retain current behavior.
- Pause, consent, quiet-hours, ownership, privacy, occurrence expiry, and retry rules remain unchanged.
- No schema migration is required; the database already permits integers from 0 through 10.
- Backend must be live before production receives `max_per_day=0`.
- A new mobile artifact must use a monotonic version and pass three independent signatures.

---

### Task 1: Backend unlimited policy

**Files:**
- Modify: `scripts/test-push-guard.mts`
- Modify: `scripts/test-notification-cap-task3.mts`
- Modify: `scripts/test-mobile-push-retry-worker.mts`
- Modify: `src/lib/push-guard.cjs`
- Modify: `src/lib/mobile-notification-delivery.cjs`

**Interfaces:**
- Consumes: `prefs.max_per_day: integer`
- Produces: zero bypasses only daily-cap comparisons; positive integers still cap.

- [ ] **Step 1: Write failing tests**

Add assertions that zero allows a guard decision after many sends, allows a durable reservation, and does not terminate a retry for `policy_cap_reached`; retain positive-cap boundary assertions.

- [ ] **Step 2: Verify RED**

Run `./node_modules/.bin/tsx scripts/test-push-guard.mts`, `./node_modules/.bin/tsx scripts/test-notification-cap-task3.mts`, and the focused retry worker test. Expect zero-cap assertions to fail under the old `already >= 0` behavior.

- [ ] **Step 3: Implement minimal policy**

Use the exact predicate `cap > 0 && already >= cap` in the guard/reservation boundary and `maxPerDay > 0 && capCount > maxPerDay` in retry policy.

- [ ] **Step 4: Verify GREEN**

Rerun the focused tests, notification live-producer/source-replay tests, TypeScript, and diff checks. Expect all to exit zero.

- [ ] **Step 5: Commit backend**

Stage only the listed backend source/tests and the approved docs, then commit with `fix(notifications): support an unlimited daily cap`.

### Task 2: Mobile Unlimited setting and v220

**Files:**
- Modify: `src/components/design/NotificationCenterScreen.tsx`
- Modify: `scripts/test-notification-settings.mts`
- Modify: `scripts/test-account-store-clients.mts`
- Modify: version assertions, `app.json`, and current native Gradle version fields.

**Interfaces:**
- Consumes: existing `MobileNotificationPrefs.maxPerDay?: number`
- Produces: localized Unlimited chip sending `{maxPerDay: 0}`.

- [ ] **Step 1: Write failing UI/client tests**

Require localized Unlimited copy, a `notif-cap-0` control, exact selected-state behavior, and serialized `maxPerDay: 0`.

- [ ] **Step 2: Verify RED**

Run notification-settings and account/store client tests. Expect the missing Unlimited control/copy assertion to fail.

- [ ] **Step 3: Implement minimal UI**

Add `capUnlimited` for TH/EN/ZH and prepend `{ n: 0, label: L.capUnlimited }` to the existing cap choices. Keep parsing and update types unchanged because they already accept zero.

- [ ] **Step 4: Bump and verify v220**

Update app/native version fields to 220, run focused tests, the full mobile suite, TypeScript, current-native manifest gates, and diff checks.

- [ ] **Step 5: Commit mobile**

Stage only scoped UI/tests/version files and commit with `fix(notifications): add unlimited delivery preference`.

### Task 3: Release, account update, and evidence

**Files:**
- Build: backend r551 release directory
- Build: Android v220 artifact
- Update: production preference row for the active Qimen-enabled owner account

**Interfaces:**
- Consumes: signed backend/mobile commits.
- Produces: live unlimited account, healthy backend, immutable v220 download artifact.

- [ ] **Step 1: Obtain three source/artifact signatures**

Require explicit APPROVE from three independent reviewers; any Critical/Important rejection resets the gate.

- [ ] **Step 2: Deploy backend safely**

Build/canary r551, atomically switch `/root/releases/current`, restart four instances rolling, and verify `/api/health` on 3349-3352 with rollback on failure.

- [ ] **Step 3: Update the approved account**

Under the existing per-user advisory lock, update only the current active Master/Qimen-enabled account from `max_per_day=4` to zero. Verify the guard at the observed daily count now allows Qimen without sending a real push.

- [ ] **Step 4: Publish v220**

Build a fresh APK, verify its source bundle/signature/version, obtain three artifact approvals, publish an immutable URL, and verify the downloaded SHA-256.
