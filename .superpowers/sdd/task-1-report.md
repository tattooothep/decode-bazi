# Task 1 — Notification token ownership and privacy contract

## Delivered scope

- The rerunnable forward migration deduplicates historical active ownership and
  enforces one global enabled owner for each installation and native device
  token with partial unique indexes.
- The rollback is intentionally schema-only for preference fields: it retains
  both partial owner indexes, is rerunnable, and therefore cannot report a
  successful rollback while leaving active ownership unprotected.
- Push registration transfers stale installation/native owners before its
  upsert, and a legacy request that omits a native identity writes `NULL` for
  both native fields instead of reviving a stored token.
- POST, installation DELETE, and unregister-all use one transaction protocol:
  discover candidates without row locks; acquire sorted transaction advisory
  locks in global `user → expo → installation → native` order; then re-read
  candidates with `FOR UPDATE` before mutation. Including Expo identity in the
  same order serializes its unique upsert as well. This prevents a row-lock to
  advisory-lock cycle, including A unregister-all racing B transfer and two
  opposite-direction transfers.
- Unregister remains idempotent. Database failures are rolled back and mapped
  to generic 409/500 responses without logging raw PostgreSQL/token detail.
- Notification preferences expose server-owned `privacyPreview` (default
  `false`) and validated `locale` (default `th`) read/write fields.

Delivery/retry, science, legacy, production/release, build, and deployment
code were not changed.

## RED evidence

1. `npx tsx scripts/test-notification-integrity-contract.mts` initially failed
   with `POST must acquire all advisory identity locks before row locks`: the
   starter transaction took `FOR UPDATE` and only then acquired native advisory
   locks.
2. Earlier executable migration coverage failed when rollback removed the two
   active-owner indexes; its rollback/reapply test now requires duplicate active
   installation and native writes to keep failing after rollback.
3. Route integration additions were introduced before the corresponding fixes:
   native omission after an Expo transfer, queued POST/DELETE, cross-user
   transfer versus unregister-all, locale persistence, and a forced database
   error all exercised the missing contract behavior.

## GREEN verification

- `npx tsx scripts/test-notification-integrity-contract.mts` →
  `NOTIFICATION_INTEGRITY_CONTRACT_OK`.
- `npx tsx scripts/test-notification-integrity-migration.mts` →
  `NOTIFICATION_INTEGRITY_MIGRATION_OK`.
  - Creates a uniquely named `notification_integrity_test_*` disposable DB;
    proves forward ownership enforcement, rollback twice, retained constraints
    after rollback, and forward reapply; drops the DB in `finally`.
- Disposable API route integration with a dedicated non-superuser role:
  `BASE_URL=http://127.0.0.1:3437 NEXT_DEV_LOG_PATH=.next/dev/logs/next-development.log node scripts/test-mobile-push-p0.mjs`
  → `36 mobile push checks passed`.
  - Runs the real route against `notification_integrity_api_test` only.
  - Deterministically queues POST and DELETE under an advisory user lock.
  - Runs cross-user B transfer versus A unregister-all in both `post-first` and
    `delete-first` schedules; both return 200 and leave B the enabled Expo
    owner, with no deadlock/500.
  - Creates the forced-error trigger/function inside the test and drops both in
    `finally`; it verifies response and new server-log bytes contain neither
    the raw Expo token nor PostgreSQL error detail.
- `npx tsx scripts/test-mobile-push-delivery.mts` →
  `6 mobile push delivery checks passed`.
- `npx tsx scripts/test-push-guard.mts` → `22` checks passed.
- `npx tsc --noEmit` → exit 0.
- `git diff --check` → exit 0.

Both DB-mutating route and delivery tests reject non-disposable database names.
The route DB/role and delivery DB/role were dropped after verification; cleanup
query returned `false|false` for their database/role existence. No production
database was touched.

## Changed files

- `migrations/20260815_mobile_notification_integrity.sql`
- `migrations/20260815_mobile_notification_integrity.rollback.sql`
- `src/app/api/mobile/v1/push/route.ts`
- `src/app/api/mobile/v1/notifications/route.ts`
- `scripts/test-notification-integrity-contract.mts`
- `scripts/test-notification-integrity-migration.mts`
- `scripts/test-mobile-push-p0.mjs`
- `scripts/test-mobile-push-delivery.mts`
- `scripts/test-push-guard.mts`

## Self-review and concerns

The partial indexes are the final database invariant; advisory locks make the
route sequencing deterministic but do not replace that invariant. Candidate
discovery is deliberately unlocked and every mutation revalidates with row
locks only after the complete identity lock set, so it avoids the prior
row-lock/advisory-lock inversion. The forced database-error test is fully
self-contained and cleanup-protected.

No known Task 1 concerns remain. The retained owner indexes are deliberate:
rolling back preference columns does not make an active device shareable.

## Commits

- Initial implementation: `5347dbd68cb9076e8dfe3a6a2e6d940afc5fe702`
- Second review fixes: `0a8aed8d0da874d9411ddbec736a1f559001d387`
- This lock-order/test review cycle: `e6cacb673f7a65cfa4d7a2a3fe88f5c729289cd2`
