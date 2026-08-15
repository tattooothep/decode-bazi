# Mobile Notification Integrity Implementation Plan

> Scope: `/root/worktrees/hourkey-v197-mobile` only. Do not change Unity, Sifu, billing, subscriptions, or release identity.

**Goal:** Make device-status checks bounded and retryable, isolate notification state per account, make installation identity single-flight, preserve typed notification intent, and stop claiming unsupported background actions.

**Baseline:** mobile HEAD `c6947567ca466f79990ea5ad9606971f130bb14e`.

## Task 1: Bound device-status dependencies

Files:
- Modify `src/native/pushDeviceStatusCoordinator.ts`
- Modify `scripts/test-push-device-status-coordinator.mts`

Steps:
1. Add tests where permission, installation-id, and server-status promises never settle; advance a fake clock and assert `error`, cleared single-flight state, and a subsequent refresh starts a new request.
2. Run `node --no-warnings --experimental-strip-types scripts/test-push-device-status-coordinator.mts` and capture expected RED.
3. Add a dependency deadline with injectable clock/timer, defaulting to 8 seconds; guard every publish by owner+sequence; clear `latest` in `finally`.
4. Re-run focused test GREEN and commit only coordinator+test.

## Task 2: Installation ID and account ownership

Files:
- Modify `src/native/push.ts`
- Add `src/native/notificationAccountCoordinator.ts`
- Modify `App.tsx`
- Modify `scripts/test-account-store-clients.mts`
- Modify `scripts/test-notification-app-wiring.mts`
- Add `scripts/test-notification-account-coordinator.mts`

Steps:
1. Add concurrent installation-id test proving one UUID/write under 100 simultaneous calls.
2. Add A→B delayed response test proving A cannot publish items/unread/preferences/loading after owner invalidation.
3. Add reset wiring assertions for items/unread/preferences/error/status.
4. Capture REDs, then implement a module-level installation single-flight and a sequence-based notification account coordinator.
5. Integrate `loadNotifications` with owner+request token and truthful `ready|empty|error` state; clear all account-owned notification state on auth boundary.
6. Run focused tests and TypeScript GREEN; commit scoped changes.

## Task 3: Typed payload, privacy, and actions

Files:
- Modify `src/native/push.ts`
- Modify `src/native/notificationRouteDispatcher.ts`
- Modify `src/native/mobileApi.ts`
- Modify `src/screens/NotificationCenterScreen.tsx`
- Modify `App.tsx`
- Modify/add focused notification route/action tests

Steps:
1. Write RED tests for all eight categories, exact object/date/profile fields, account binding, `/shrine` allowlisting, query/fragment preservation, and one-shot initial response clearing.
2. Write RED tests proving MUTE cannot advertise killed-app execution without a registered background task; choose foreground-open behavior for this release.
3. Add strict versioned payload parser and category-to-destination mapping; reject mismatched account/user data and unknown fields.
4. Clear consumed initial notification response with the Expo 56 API after route selection.
5. Add privacy preview mode/default redaction for personal categories and render category-specific server facts in the center without recalculation.
6. Run all notification/push tests, `npm run typecheck` (or repository canonical `tsc --noEmit`), and the mobile full suite before source review.

## Acceptance

- No native/secure-store/API await can leave device status in `checking` beyond 8 seconds.
- Account A notification state/taps cannot appear in account B.
- One installation ID is created under concurrency.
- Eight categories retain typed intent and locale-exact server facts.
- No UI copy promises a killed-app action that is not implemented.
- No build, credential, release identity, or deployment change in this plan.
