# Qimen/Yam C4 separation report

Status: DONE

Implementation commit: `7e87f569017acf2358b1f44b100c24446aeb8162`

## RED evidence

`npx tsx scripts/test-yam-qimen-line.mts` failed before the production edit with:

```text
AssertionError: Yam scheduler has no Qimen advisory import, fetch, sample, or highlight path
```

This proved the generic Yam script still imported the advisory runtime and retained the legacy fetch/sample/highlight path.

## GREEN evidence

The following commands passed after the change:

- `npx tsx scripts/test-yam-qimen-line.mts`
- `npx tsx scripts/test-notification-science-task3.mts`
- `npx tsx scripts/test-notification-scheduler-heartbeats.mts`
- `npx tsx scripts/test-qimen-canonical-occurrence-builder.mts`
- `npx tsx scripts/test-qimen-scheduler.mts`
- `npx tsx scripts/test-qimen-notification-truth.mts`

The focused Yam test verifies no advisory import/fetch/sample/highlight path, no Qimen source facts or copy append, unchanged TH/EN/ZH Yam core text, and civil cross-midnight/DST range endings. The dedicated C4 tests confirm an auspicious direction remains required to create an occurrence.

## Files

- `scripts/mobile-yam-push-cron.cjs`
- `scripts/test-yam-qimen-line.mts`
- `scripts/test-notification-science-task3.mts`
- `scripts/test-notification-live-producers-task3.mts`
- `scripts/test-notification-source-replay-task3.mts`

## Reviewer follow-up: legacy personal path and historical cutover

Implementation commit: `275209584b5fc4818b5c23a733416e7417ab37fd`

### RED evidence

- `npx tsx scripts/test-personal-qimen-separation.mts` failed because personal reminders still imported and scheduled the legacy Qimen producer.
- `npx tsx scripts/test-yam-qimen-cutover-migration.mts` failed because the scoped migration and rollback note did not exist.
- `npx tsx scripts/test-notification-science-task3.mts` failed after its regression assertion proved the retired generic `yamQimenHighlight` export still existed.

### GREEN evidence

- `npx tsx scripts/test-personal-qimen-separation.mts`
- `npx tsx scripts/test-yam-qimen-cutover-migration.mts`
- `npx tsx scripts/test-yam-qimen-line.mts`
- `npx tsx scripts/test-notification-science-task3.mts`
- `npx tsx scripts/test-notification-scheduler-heartbeats.mts`
- `npx tsx scripts/test-qimen-canonical-occurrence-builder.mts`
- `npx tsx scripts/test-qimen-scheduler.mts`
- `npx tsx scripts/test-qimen-notification-truth.mts`
- `HOURKEY_MOBILE_ROOT=/root/worktrees/zibai-three-layer-mobile HOURKEY_MOBILE_SHA=1c4c228040d67028f116c23b38efc47711fc58db npx tsx scripts/test-notification-live-producers-task3.mts`
- `HOURKEY_MOBILE_ROOT=/root/worktrees/zibai-three-layer-mobile HOURKEY_MOBILE_SHA=1c4c228040d67028f116c23b38efc47711fc58db npx tsx scripts/test-notification-source-replay-task3.mts`

The personal scheduler now runs only saved-date and goal tasks. The rerunnable cutover migration selects only Yam logs whose source facts still contain `qimen`, keeps only the first history line, removes that fact, retires reserved/retry/receipt-pending children as dead, and preserves clean Yam rows byte-for-byte. Its rollback note explicitly forbids restoring removed privacy/safety data or dead attempts.

### Reviewer follow-up files

- `scripts/mobile-personal-reminders-cron.cjs`
- `src/lib/notification-science.cjs`
- `migrations/20260821_mobile_yam_qimen_cutover.sql`
- `migrations/20260821_mobile_yam_qimen_cutover.rollback.md`
- `scripts/test-personal-qimen-separation.mts`
- `scripts/test-yam-qimen-cutover-migration.mts`

## Reviewer blocker follow-up: retention-safe cutover

Implementation commit: `e7a8c71330ea7edc545cd73580eaf4062fd9907c`

### RED evidence

`npx tsx scripts/test-yam-qimen-cutover-migration.mts` failed before the migration edit because the cutover assigned `attempts_retired_at` while keeping child attempts. The new static assertion rejected that premature retirement marker.

### GREEN evidence

- `npx tsx scripts/test-yam-qimen-cutover-migration.mts`
- `npx tsx scripts/test-personal-qimen-separation.mts`
- `npx tsx scripts/test-notification-science-task3.mts`
- `npx tsx scripts/test-qimen-canonical-occurrence-builder.mts`
- `npx tsx scripts/test-qimen-scheduler.mts`

The disposable migration test proves scoped and clean-row behavior remains idempotent/byte-stable, then runs the real reconciliation and retention modules. Reconciliation is healthy before and after retention; normal retention deletes the dead child attempts and only then sets the parent retirement marker. The migration itself no longer sets that marker, so it cannot create `retiredParentWithAttempts` or permanently bypass retention.

Concerns: none.
