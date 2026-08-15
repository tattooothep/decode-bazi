# Task 2 — Durable per-installation notification delivery

## Final implementation

- `mobile_push_attempts` stores one immutable, SHA-256-verified exact provider
  message per logical push and installation before any external send. Target
  credentials stay in `mobile_push_tokens`; credential-shaped data keys are
  normalized and removed before persistence.
- Each worker claims and processes one attempt at a time with
  `FOR UPDATE SKIP LOCKED` and a fresh database-random UUID lease. A stale
  reservation that has not crossed `send_started_at` can be reclaimed. Once
  the committed send boundary is crossed, an expired or otherwise ambiguous
  provider result becomes dead with `uncertain_provider_result` and is never
  resent.
- Provider transport exceptions, socket/abort timeouts, malformed FCM 2xx
  acknowledgements, and successful Expo responses without a valid ticket are
  explicit terminal `uncertain` outcomes. Known pre-send configuration/auth
  failures and explicit retryable provider HTTP responses retain bounded
  exponential retry and `Retry-After` handling.
- FCM acceptance persists the provider message name and remains
  `provider_accepted`, never delivered without device evidence. Expo acceptance
  persists a unique ticket; receipt confirmation is the evidence that advances
  it to delivered. Both `src/lib/push-send.cjs` and the direct FCM compatibility
  adapter implement the same acceptance/uncertainty contract without logging
  raw provider responses.
- Expo receipt work has durable `next_receipt_at` and `receipt_poll_count`
  fields plus a partial due index. Missing receipts are fenced, released, and
  exponentially backed off before the loop continues, so one absent receipt
  cannot starve later tickets. Provider-wide polling failures back off the
  claimed row and stop that batch.
- Provider ticket and message IDs have partial unique indexes. Receipt and send
  finalization are lease-fenced; stale workers cannot finalize a replacement
  lease. Identifier conflicts fail generically without retaining provider
  detail.
- An installation-scoped session advisory lock, using Task 1's lock key, spans
  active-token revalidation, provider send, and finalization. Account transfer
  cannot change ownership during a send, and old content is never sent after a
  completed transfer. Advisory unlock failure is surfaced and the checked-out
  pool client is destroyed with `release(true)` rather than reused.
- Every child finalization locks the parent `mobile_push_log` first and derives
  parent truth in the same transaction. Concurrent all-dead siblings produce a
  failed parent with accepted/sent timestamps cleared.
- The independent one-shot retry worker accepts an injected database without
  connecting or ending caller-owned state. It avoids unused `Pool.connect()`
  handles, connects a worker-owned `Client`, ends only internally-owned
  dependencies, and reports aggregate non-sensitive counts.
- Notification history and category-cap behavior from the original Task 2 work
  remain compatible across all eight callers. FCM is accepted-only; Expo can
  advance to delivered through receipts.

## Migration and rollback

The forward migration is additive and rerunnable. It creates or upgrades the
attempt table, send boundary, receipt schedule/count, due/stale/receipt indexes,
partial unique provider-ID indexes, immutable-message trigger, and grants. The
schema rollback drops Task 2 attempt state, maps delivered parents back to the
older accepted state, retains Task 1's active ownership constraints, and can be
followed by a clean forward reapply.

## TDD evidence

Meaningful RED results observed before their fixes included:

1. The active sender and direct FCM adapter returned malformed FCM 2xx results
   as retryable failures instead of terminal uncertainty.
2. The receipt migration check found zero of the two required durable polling
   columns, and the retry suite then stopped at the missing
   `next_receipt_at` boundary.
3. The internally-owned Pool fixture recorded an unnecessary `connect`, proving
   the unused-handle lifecycle bug.
4. Separator-free and mixed-form credential keys were retained; the additional
   encryption-key fixture also demonstrated the generic `*key` gap.
5. The direct FCM adapter lacked an abort signal on its provider send.
6. The CLI aggregate omitted receipt-backoff and provider-wide polling-error
   counts even though those states were durable.

The resulting focused suite covers response-lost send ambiguity across two
worker runs, exact one-send behavior, receipt limit/starvation/backoff and
provider-wide errors, random receipt leases and stale-worker fencing, advisory
unlock client destruction, caller-owned/internally-owned database lifecycle,
cross-account transfer blocking, concurrent sibling truth, immutable messages,
provider IDs, partial failures, and retry exhaustion. All provider calls in
tests are dependency-injected or HTTP-mocked; no real notification was sent.

## Fresh final verification

- `npx tsx scripts/test-mobile-push-retry-worker.mts` — 49 checks passed.
- `npx tsx scripts/test-push-send.mts` — 13 checks passed.
- `npx tsx scripts/test-fcm-direct.mts` — `FCM_DIRECT_OK`.
- `npx tsx scripts/test-push-guard.mts` — 22 checks passed.
- `npx tsx scripts/test-notification-integrity-contract.mts` —
  `NOTIFICATION_INTEGRITY_CONTRACT_OK`.
- `npx tsx scripts/test-notification-integrity-migration.mts` —
  `NOTIFICATION_INTEGRITY_MIGRATION_OK`, including rollback and forward reapply.
- `npx tsx scripts/test-mobile-push-delivery.mts` — 6 checks passed against
  hard-guarded disposable database
  `notification_integrity_delivery_test_task2_review2_6201` with mocked Expo.
- `npx tsc --noEmit`, all three changed CJS syntax checks, and
  `git diff --check` exited successfully.
- Final catalog checks confirmed that the disposable delivery database and its
  login role were both removed.

## Scope and remaining operational concern

No production data or service was mutated, no real send occurred, and no
science, legacy delivery, build, deploy, release, or credential file changed.
The Task 1 test-harness minor remains ledgered because that harness was not
touched. The one-shot retry worker still needs production scheduling in a
separate authorized deployment task; no known Task 2 source correctness issue
remains in the requested scope.

Prior Task 2 commits: `fc878da62618c6000365e62bf22eb809df32157b`,
`ec4f17546ce93b065e6f5a946c8e18d2b22e3ae0`, and
`d8b5dab0c04bb93717c2bc04fe7cd9f108d851a2`.
