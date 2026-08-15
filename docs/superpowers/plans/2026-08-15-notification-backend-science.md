# Backend Notification Delivery and Science Implementation Plan

> Scope: exact production-source worktree `/root/worktrees/decode-v195-budai-coin`; additive migrations and notification-only routes/workers. Do not edit release directories or core calculation engines.

**Goal:** Deliver the exact calculated notification durably and idempotently, bind tokens to one account, and make scheduler inputs match each user's timezone/profile/consent.

**Baseline:** backend HEAD `6e7780a` (source baseline `e3b41e2`).

## Task 1: Token ownership and privacy contract

Files:
- Add migration `migrations/20260815_mobile_notification_integrity.sql` plus rollback
- Modify `src/app/api/mobile/v1/push/route.ts`
- Modify `src/lib/mobile-push.ts`
- Extend `scripts/test-mobile-push-delivery.mts` and push guard tests

Steps:
1. RED: same native token/installation registered by B must atomically disable A; duplicate active ownership must fail at DB constraint level.
2. RED: unregister/logout is idempotent and leaves no active token for the installation.
3. Add partial unique indexes and transactional transfer/audit fields; never log raw tokens.
4. Add lock-screen privacy preference and locale to the server preference contract.
5. Run migration against a disposable DB, focused route tests, and rollback/reapply proof.

## Task 2: Durable per-installation attempts and receipts

Files:
- Extend the migration with `mobile_push_attempts` and indexes
- Modify `src/lib/mobile-notification-delivery.cjs`
- Modify `src/lib/fcm-direct.ts` and provider sender adapter
- Add `scripts/mobile-push-retry-worker.cjs`
- Add `scripts/test-mobile-push-retry-worker.mts`

Steps:
1. RED: mixed FCM/Expo partial failure creates one durable attempt per installation; failed attempt preserves exact localized message and retries without scheduler rediscovery.
2. RED: stale `pending` lease recovers; exponential retry exhausts to dead; duplicate workers cannot double-send the same lease.
3. RED: provider message IDs/tickets persist and receipt polling moves accepted attempts to delivered/error; parent status derives from child states and never marks all-dead as sent.
4. Add transactional reservation+attempt persistence, `FOR UPDATE SKIP LOCKED` worker claims, retry schedule, provider IDs, and receipt normalization.
5. Run focused delivery/retry/receipt tests plus existing sender/guard suites.

## Task 3: Scheduler atomicity and science inputs

Files:
- Modify mobile notification cron scripts only
- Modify notification-facing API route adapters only where timezone/profile context is missing
- Add science replay fixtures/tests

Steps:
1. RED: yam with `qimen_enabled=false` never fetches or includes Qimen/location data.
2. RED: Qimen scheduler and entitlement gate use the same IANA timezone and instant for Bangkok, Tokyo, New York, and DST boundary fixtures.
3. RED: goal uses its bound profile and user-local date; oldest unrelated profile cannot override it.
4. RED: saved-date selects a due event even when an earlier non-due future event exists.
5. RED: daily internal engine calls time out; six schedulers cannot overlap; daily cap is atomic and based on local calendar day.
6. Implement notification-layer context fixes without changing engine algorithms or canonical Bangkok outputs.
7. Replay canonical API results and assert titles/body/payload fields equal engine outputs for all eight categories.

## Acceptance

- Exact message survives provider retry; no scheduler recomputation is required.
- Active native token and installation each have one account owner.
- `accepted` means provider acceptance, `delivered` means receipt/device evidence, and UI/API exposes the distinction.
- No enabled science category borrows disabled-category data.
- Qimen/goal/saved-date use the intended timezone/profile/event.
- Existing Bangkok science fixtures and unrelated backend suites remain byte/behavior stable.
