# Task 1 — Token ownership and privacy contract

## Scope delivered

- Added a rerunnable ownership/privacy migration and schema-only rollback.
- Enforced one active global owner per installation and native token with partial
  unique indexes, deterministic historical deduplication, and preserved disabled
  token audit rows.
- Registration serializes installation/native ownership with transaction-scoped
  advisory locks, disables stale rows before upsert, and contains no raw-token
  logging.
- Kept unregister idempotent.
- Added `privacyPreview` to the authenticated mobile notification preferences
  read/write contract; its database and absent-row defaults are `false`.
- Added executable migration/rollback/reapply, API contract, route integration,
  delivery, and no-raw-token guard coverage. Delivery/retry implementation was
  intentionally not changed.

## RED evidence

1. `npx tsx scripts/test-notification-integrity-contract.mts`
   - Failed before the change: `ownership transfers must serialize concurrent registrations` because the starter route had no advisory lock.
2. Isolated `BASE_URL=http://127.0.0.1:3437 node scripts/test-mobile-push-p0.mjs`
   - Failed on the first valid registration with `500`; Next diagnostic log showed `could not determine data type of parameter $3`. The starter transaction used non-contiguous PostgreSQL placeholders.
3. The same isolated route test then failed token rotation with `duplicate key value violates unique constraint mobile_push_tokens_user_id_installation_id_key`.
4. `npx tsx scripts/test-notification-integrity-migration.mts`
   - Failed before the migration constraint replacement when inserting disabled same-installation rotation history, reproducing the legacy unique-constraint conflict.

## GREEN verification

- `npx tsx scripts/test-notification-integrity-contract.mts` → `NOTIFICATION_INTEGRITY_CONTRACT_OK`
- `npx tsx scripts/test-notification-integrity-migration.mts` → `NOTIFICATION_INTEGRITY_MIGRATION_OK`
  - Creates a uniquely named disposable PostgreSQL database.
  - Applies the migration, proves both active-owner constraints reject duplicates,
    verifies default `privacy_preview=false`, rolls back twice, and reapplies.
  - Drops its database in `finally`.
- Isolated schema-only disposable DB + dedicated non-superuser test role:
  `BASE_URL=http://127.0.0.1:3437 node scripts/test-mobile-push-p0.mjs` → `21 mobile push checks passed`
  - Covers A→B native installation ownership transfer, duplicate unregister,
    no active token after unregister, and privacy preference default/persistence.
- `npx tsx scripts/test-mobile-push-delivery.mts` → `6 mobile push delivery checks passed`
  - Includes disabled historical-token exclusion.
- `npx tsx scripts/test-push-guard.mts` → `22` checks passed, including no raw provider-token logging in registration.
- `npx tsc --noEmit` → exit 0.
- `git diff --check` → exit 0.

The temporary API DB/role and delivery DB/role were dropped after their tests;
post-cleanup checks returned `f|f` for database/role existence. No production DB
was migrated or changed.

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

## Migration and rollback proof

The forward migration first disables historical duplicate active ownership,
replaces the legacy per-account installation uniqueness constraint with global
active-owner partial indexes, and adds `privacy_preview` with `false` default.
It is rerunnable (`IF EXISTS` / `IF NOT EXISTS`). The rollback drops only the
new indexes and preference column, never re-enables ambiguous ownership, and
restores the legacy constraint only if doing so cannot discard or invalidate
preserved audit history. It is safe to execute twice and the forward migration
reapplies after it.

## Self-review

- One active global owner: DB indexes prove installation/native uniqueness among enabled rows.
- Transfer ordering: stale identities are disabled inside the same transaction before upsert.
- Concurrency: advisory locks serialize competing installation/native changes; indexes remain the final DB guard.
- Unregister: repeat DELETE returns the same unsubscribed result and cannot reactivate a row.
- Privacy: absent rows, migration default, write, and response all use `false` unless explicitly enabled.
- Privacy/logging: no raw provider token is logged by the registration route.
- Scope: no retry/delivery worker, science, legacy, release, or deployment code changed.

## Concern

Rollback deliberately does not recreate the obsolete `(user_id, installation_id)`
constraint when preserved disabled rotation rows would violate it. This is the
safe data-preserving behavior; it should be used only together with reverting
the new registration route, as with any schema rollback.

## Commit

Implementation and tests: `5347dbd68cb9076e8dfe3a6a2e6d940afc5fe702`

## Review-fix addendum

This addendum supersedes the earlier rollback description: rollback now retains
both global partial active-owner indexes. It only removes Task 1 preference
columns, so it cannot complete without database ownership enforcement.

### Additional RED evidence

- The strengthened contract failed because the migration had no preference
  locale and rollback dropped both active-owner indexes.
- The migration test initially codified that unsafe rollback; it was changed to
  prove duplicate active installation and native-token inserts still fail after
  rollback.
- The real API route test added a queued POST/DELETE case, native omission on
  Expo ownership transfer, forced database error sanitization, locale round
  trip, invalid-locale retention, and unregister-all coverage before their
  implementation changes.

### Additional GREEN verification

- `npx tsx scripts/test-notification-integrity-contract.mts` → pass.
- `npx tsx scripts/test-notification-integrity-migration.mts` → pass; forward,
  rollback twice, duplicate enforcement after rollback, and reapply are proven
  in a `notification_integrity_test_*` disposable DB.
- Isolated route server + schema-only disposable DB:
  `BASE_URL=http://127.0.0.1:3437 node scripts/test-mobile-push-p0.mjs`
  → `30 mobile push checks passed`.
  - It holds the same advisory user lock while a POST and DELETE enter the real
    route, releases it only after both wait, and proves the queued DELETE leaves
    no enabled row.
  - It proves legacy omitted-native registration clears the transferred native
    token/type, forced database errors return only a generic error, and locale
    defaults/persists/rejects invalid values.
- `npx tsx scripts/test-mobile-push-delivery.mts` → `6` checks passed.
- `npx tsx scripts/test-push-guard.mts` → `22` checks passed.
- `npx tsc --noEmit` and `git diff --check` → exit 0.

### Review-fix implementation notes

- POST and DELETE now take transaction-scoped user locks before deterministic
  installation/native locks. Unregister-all locks every currently enabled
  installation in sorted query order.
- Existing native identities are selected and locked before upsert. A legacy
  request writes `NULL` native token/type rather than coalescing stale values.
- PostgreSQL failures are rolled back and mapped to sanitized 409/500 responses;
  no database error is rethrown or logged by the route.
- `mobile_notification_prefs.locale` is a validated supported server preference
  with `th` default and API read/write contract.
- Both DB-mutating integration scripts now refuse names outside an explicit
  `notification_integrity_*_test` disposable prefix. Temporary DBs/roles were
  removed after every run; cleanup checks returned `f|f`.

Review-fix implementation: `0a8aed8d0da874d9411ddbec736a1f559001d387`
