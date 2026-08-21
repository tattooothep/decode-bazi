# Qimen/Yam C4 separation report

Status: DONE_WITH_CONCERNS

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

## Concerns

`scripts/test-notification-live-producers-task3.mts` remains blocked by an unrelated unchanged dedicated-Qimen fixture assertion: `liveQimenAdvisory` is `null` before the Yam producer is exercised. It was invoked with the required mobile-repository environment variables and failed at that existing setup assertion. The focused Yam, scheduler, and dedicated C4 tests above pass.
