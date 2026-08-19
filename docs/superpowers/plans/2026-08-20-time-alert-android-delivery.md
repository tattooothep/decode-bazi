# Android Time-Alert Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Yam/QiMen and Zi Bai notifications use a fresh high-importance Android channel while retaining a five-minute stale-message bound.

**Architecture:** The backend owns provider priority, TTL, sound, and channel selection. The mobile runtime owns creation of the matching Android channel. Existing payload and scheduling contracts remain unchanged.

**Tech Stack:** Node.js CommonJS push transport, React Native/Expo Notifications, TypeScript, Android manifest/CNG configuration, repository script tests.

## Global Constraints

- Exact channel ID: `hourkey-time-alerts-v2`.
- Time-bound categories: `yam`, `qimen`, `zibai`.
- FCM/Expo priority: high; sound: default; TTL: 300 seconds.
- Ordinary reminders retain `hourkey-reminders` and normal priority.
- No consent, schedule, payload, science, privacy, or history changes.

---

### Task 1: Backend provider contract

**Files:**
- Modify: `scripts/test-push-send.mts`
- Modify: `src/lib/push-send.cjs`

**Interfaces:**
- Consumes: `prepareMessage(item, provider)` and `providerTtlSeconds(category)`.
- Produces: FCM/Expo envelopes for Yam/QiMen/Zi Bai with exact high-priority channel policy.

- [ ] **Step 1: Write failing provider assertions**

Assert for each of `yam`, `qimen`, and `zibai` that FCM uses `HIGH`, `300s`, `sound: "default"`, and `channel_id: "hourkey-time-alerts-v2"`; assert Expo uses `high`, `300`, `sound: "default"`, and the same channel. Assert a `daily` control remains normal on `hourkey-reminders`.

- [ ] **Step 2: Run RED**

Run: `./node_modules/.bin/tsx scripts/test-push-send.mts`

Expected: fail because current time alerts are normal, silent, and use `hourkey-reminders`.

- [ ] **Step 3: Implement minimal provider policy**

Add one time-bound category predicate, map it to `hourkey-time-alerts-v2`, and use it for high priority/default sound without changing TTL selection or payload serialization.

- [ ] **Step 4: Run GREEN and adjacent delivery gates**

Run:

```bash
./node_modules/.bin/tsx scripts/test-push-send.mts
./node_modules/.bin/tsx scripts/test-zibai-delivery-contract.mts
./node_modules/.bin/tsx scripts/test-mobile-push-retry-worker.mts
```

Expected: all pass, including the existing 300/360-second expiry boundary.

### Task 2: Mobile channel and manifest contract

**Files:**
- Modify: `/root/worktrees/zibai-three-layer-mobile/src/native/push.ts`
- Modify: `/root/worktrees/zibai-three-layer-mobile/app.json`
- Modify: `/root/worktrees/zibai-three-layer-mobile/scripts/test-account-store-clients.mts`
- Verify: `/root/worktrees/zibai-three-layer-mobile/scripts/test-cng-native-manifest-parity.mts`
- Verify: `/root/worktrees/zibai-three-layer-mobile/scripts/test-cng-native-source-of-truth.mts`

**Interfaces:**
- Consumes: Expo `Notifications.setNotificationChannelAsync`.
- Produces: an Android `hourkey-time-alerts-v2` channel at HIGH importance and a valid created manifest fallback.

- [ ] **Step 1: Write failing channel/config assertions**

In the executable registration test, capture every `setNotificationChannelAsync` call and require exact entries for `hourkey-reminders`, `hourkey-security`, `hourkey-service`, and `hourkey-time-alerts-v2`; require the new channel to use HIGH plus `sound: "default"`. Parse `app.json` in the same test and require `defaultChannel` to equal the captured `hourkey-reminders` channel.

- [ ] **Step 2: Run RED**

Run the focused channel/config tests and confirm failure on the missing new channel plus stale `hourkey-updates` fallback.

- [ ] **Step 3: Implement minimal mobile/config change**

Create `hourkey-time-alerts-v2` beside the existing three channels and change only the Firebase default-channel configuration to `hourkey-reminders`.

- [ ] **Step 4: Run GREEN**

Run focused registration, native-manifest/CNG parity, notification wiring, and `npx tsc --noEmit` checks.

### Task 3: Cross-repository verification and commits

**Files:**
- No new production files.

**Interfaces:**
- Consumes: exact backend and mobile changes from Tasks 1–2.
- Produces: clean exact commits ready for independent signatures.

- [ ] **Step 1: Run focused cross-repository replay**

Use explicit `HOURKEY_MOBILE_ROOT` and exact mobile SHA for source-replay/live-producer tests. Verify both providers preserve strict payloads while carrying the new channel policy.

- [ ] **Step 2: Run full relevant suites**

Run backend notification suites, mobile notification/full canonical suite, TypeScript, CJS syntax, and `git diff --check` in both worktrees.

- [ ] **Step 3: Commit scoped changes**

Commit backend and mobile separately, verify clean worktrees, and record exact SHAs.

- [ ] **Step 4: Request three independent signatures**

Give all reviewers the same exact SHA pair and require read-only verification of provider envelopes, Android channel creation, fallback-channel truth, expiry, payload parity, and regression suites. Any Critical or Important finding resets all three signatures.
