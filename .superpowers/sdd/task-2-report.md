# Task 2 — Durable per-installation attempts and receipts

## Delivered scope

- Extended the Task 1 forward migration with rerunnable
  `mobile_push_attempts` storage, one-attempt-per-logical-push/installation
  uniqueness, due/stale-lease/receipt indexes, immutable provider-message and
  SHA-256 fields, provider IDs/tickets, retry/lease timestamps, and explicit
  child states. The rollback removes Task 2 state, safely maps delivered
  parents back to accepted, retains Task 1 ownership constraints, and reapplies
  cleanly.
- Replaced logical-row retry with transactional parent + per-installation
  reservation. The exact normalized localized FCM/Expo message is committed
  before any provider call; provider credentials remain only in the token
  table and are never copied into attempts.
- Added deterministic leases and `FOR UPDATE SKIP LOCKED` claims, stale-lease
  recovery, bounded exponential backoff, provider `Retry-After`, maximum
  attempts/dead-letter state, and atomic child-completion + parent derivation.
- Partial failures retry only the failed installation without rerunning a
  scheduler. Same-account token rotation resolves the current active transport
  by user + installation while keeping the immutable message; an installation
  transferred to another account is never sent the prior owner's message.
- FCM HTTP success is recorded only as `provider_accepted`, with the FCM
  message name when returned. Expo tickets are persisted and receipt polling
  normalizes confirmation to `delivered` and errors to retry/dead. No FCM path
  claims device delivery without receipt/device evidence.
- Parent `mobile_push_log` truth is derived from child states. Any delivered
  child yields delivered, provider acceptance yields accepted, retryable-only
  children remain pending, and all-dead children yield failed with accepted and
  sent timestamps cleared.
- Added the independent one-shot `scripts/mobile-push-retry-worker.cjs` entry
  point. It logs aggregate counts only—never tokens, provider payloads, titles,
  bodies, or PII.
- Notification history/read APIs now retain both accepted and delivered rows
  and expose `delivery_status`. The four scheduler query sites covering all
  eight v2 categories count both accepted and delivered parents toward caps.
- `src/lib/fcm-direct.ts` was intentionally not changed: repository-wide usage
  search found no callers. The active scheduled provider adapter is
  `src/lib/push-send.cjs`, which now owns exact message preparation, provider
  ID/ticket normalization, receipt polling, and sanitized provider failures.

## TDD evidence

Meaningful REDs observed before the corresponding implementation/fix:

1. Disposable migration test failed because `mobile_push_attempts` did not
   exist; it now proves forward creation, per-installation uniqueness,
   rollback, repeated rollback, and forward reapply.
2. Retry suite initially failed because the independent worker did not exist.
   Subsequent slices exercised mixed FCM/Expo partial results, immutable exact
   retry messages, stale leases, concurrent workers, IDs/receipts, bounded
   exhaustion, and all-dead parent truth.
3. Contract test failed because delivered parents disappeared from history and
   category caps; API and all eight-category scheduler query paths now treat
   accepted and delivered as visible/counted success states.
4. A forced parent-update database error proved attempt completion could commit
   before parent derivation. Both now roll back atomically.
5. Sender test failed on the missing `Retry-After` normalization helper; both
   FCM and Expo HTTP failures now propagate a bounded provider delay.
6. A reserved attempt failed after same-owner token rotation because it followed
   the disabled row ID. Claims now select the active transport scoped to the
   original user + installation + provider, with a separate cross-account
   takeover test proving the prior owner's content is not sent.

All retry tests use dependency-injected fake providers. No real push was sent.

## Fresh verification

- `npx tsx scripts/test-mobile-push-retry-worker.mts` → 26 checks passed.
- `npx tsx scripts/test-push-send.mts` → 11 checks passed, including actual
  adapter message-ID/ticket/receipt normalization with mocked HTTP.
- `npx tsx scripts/test-push-guard.mts` → 22 checks passed.
- `npx tsx scripts/test-notification-integrity-contract.mts` →
  `NOTIFICATION_INTEGRITY_CONTRACT_OK`.
- `npx tsx scripts/test-notification-integrity-migration.mts` →
  `NOTIFICATION_INTEGRITY_MIGRATION_OK`.
- Existing `npx tsx scripts/test-mobile-push-delivery.mts` → 6 checks passed on
  a fresh schema-only clone named
  `notification_integrity_delivery_test_task2_final_4200` with its own
  disposable login and mocked Expo responses.
- `npx tsc --noEmit` → exit 0.
- CJS syntax checks and `git diff --check` → exit 0.
- Final catalog query found neither the disposable delivery database nor role.
  The retry/migration tests also use hard-guarded unique disposable names and
  cleanup in `finally`.

## Changed files

- `migrations/20260815_mobile_notification_integrity.sql`
- `migrations/20260815_mobile_notification_integrity.rollback.sql`
- `src/lib/mobile-notification-delivery.cjs`
- `src/lib/push-send.cjs`
- `src/app/api/mobile/v1/notifications/route.ts`
- `scripts/mobile-push-retry-worker.cjs`
- `scripts/test-mobile-push-retry-worker.mts`
- `scripts/test-notification-integrity-migration.mts`
- `scripts/test-notification-integrity-contract.mts`
- `scripts/test-push-send.mts`
- `scripts/mobile-yam-push-cron.cjs`
- `scripts/mobile-daily-fortune-push-cron.cjs`
- `scripts/mobile-auspicious-push-cron.cjs`
- `scripts/mobile-personal-reminders-cron.cjs`

No science algorithms, production/release directories, build/deploy settings,
legacy delivery, credentials, or release identity were changed.

## Self-review, ledger, and concerns

- `scripts/test-mobile-push-p0.mjs` was not touched. Per the Task 1 review note,
  its Buffer byte-offset log-tail improvement and direct opposite-transfer
  fixture remain ledgered for the next change that edits that harness.
- The worker is an independent one-shot process; installing its recurring
  production schedule is intentionally outside this source-only task.
- Expo receipts provide the delivery evidence modeled here. FCM remains
  provider-accepted unless a future real receipt/device-ack integration supplies
  stronger evidence.
- No known Task 2 correctness concern remains within the requested source
  scope. Production mutation, deployment, real sends, load testing, and Task 3
  science/scheduler atomicity were not performed.

## Commit

- Implementation: `fc878da62618c6000365e62bf22eb809df32157b`
