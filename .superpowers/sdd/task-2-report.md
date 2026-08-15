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

## Review remediation (supersedes the original lease design)

The post-implementation review identified concurrency and ambiguity windows in
the original deterministic, batch-claim design. The remediation replaces that
design as follows:

- Workers claim and process one attempt at a time with a fresh database-random
  UUID lease on every claim or recovery. They never reserve a batch that can
  age while earlier sends are in flight.
- `send_started_at` is committed before the provider call. An expired claim
  that never crossed that boundary is reclaimable; one that did cross it is
  finalized as dead with `uncertain_provider_result` and is never resent.
- A session advisory lock using the same installation key as Task 1 is held
  from active-token revalidation through the provider call and finalization.
  Registration transfer therefore cannot change ownership mid-send, and a
  claimed attempt is not sent after an already-completed transfer.
- Child finalization locks the parent `mobile_push_log` first, then updates the
  child and derives parent truth in the same transaction. Concurrent sibling
  completion cannot leave an accepted/sent parent when all children are dead.
- Receipt claims also use fresh random leases; finalization is fenced by the
  current lease, so a stale poller cannot clear or finalize a replacement
  claim.
- Partial unique indexes protect non-null Expo ticket IDs and provider message
  IDs. Provider-identifier conflicts are handled without exposing provider
  details.
- Both active FCM adapters now require a nonempty provider message name for a
  2xx response. Success is `provider_accepted`, never delivered, and raw
  provider responses are not logged.
- Credential-shaped keys are removed from durable notification data before the
  immutable exact message and its SHA-256 are stored.
- The one-shot worker main path is dependency-injectable and tested for retry,
  receipt, reporting, cleanup, and failure ordering.

Additional meaningful REDs preceded these changes: missing `send_started_at`
and unique indexes, malformed FCM 2xx accepted as success, credentials retained
in the durable message, stale pre-send claims not reclaimed, missing random
receipt claims/fencing, and the unused direct FCM adapter returning `sent`.

### Fresh review-fix verification

- `npx tsx scripts/test-mobile-push-retry-worker.mts` → 39 checks passed,
  including slow-provider/two-worker exclusion, pre/post-send crash boundaries,
  unknown-result no-resend, concurrent all-dead sibling derivation, transfer
  blocking, receipt fencing, provider-ID conflicts, and CLI ordering.
- `npx tsx scripts/test-push-send.mts` → 12 checks passed.
- `npx tsx scripts/test-fcm-direct.mts` → `FCM_DIRECT_OK`.
- `npx tsx scripts/test-push-guard.mts` → 22 checks passed.
- Notification integrity contract and migration tests both passed, including
  rollback/reapply and the new partial unique indexes.
- Existing mobile push delivery suite → 6 checks passed on disposable
  database `notification_integrity_delivery_test_task2_review_4300`.
- `npx tsc --noEmit`, CJS syntax checks, and `git diff --check` all passed.
- The final catalog check confirmed that both the disposable database and its
  login role had been removed.

No known correctness concern remains in Task 2's requested source scope. The
independent worker still requires production scheduling in a later authorized
deployment task; no production mutation, deployment, real send, science code,
legacy delivery, or build/release setting was touched.
