# Task 2 observability evidence

## Scope and isolation

- Worktree: `/root/worktrees/notify-observability`
- Branch: `codex/notify-observability`
- Base commit verified before edits: `3e86c291c39a64b369478dba4be4f9c1dd1d552f`
- Scope implemented: read-only aggregate health/reconciliation library, health/reconciliation/retry-receipt CLI wrappers, reviewed systemd templates, runbook, and disposable behavioral tests.
- No production database, release directory, service, timer, credential, existing retry worker, admin watcher, admin guard, legacy runbook, or push provider was mutated or invoked.

## Red/green evidence

1. RED: `node --experimental-strip-types scripts/test-notification-observability.mts` initially failed with `MODULE_NOT_FOUND` for `../src/lib/notification-observability.cjs`.
2. GREEN: the same command completed with `NOTIFICATION_OBSERVABILITY_OK` after the read-only library was added.
3. RED: `node --experimental-strip-types scripts/test-notification-observability-cli.mts` initially failed with `MODULE_NOT_FOUND` for `./notification-health.cjs`.
4. GREEN: the CLI/template test completed with `NOTIFICATION_OBSERVABILITY_CLI_OK` after the source-controlled CLI/template files were added.
5. RED: the added unleased-reserved-attempt assertion failed `1 !== 2`, proving stale pending attempts were not initially counted.
6. GREEN: the health query now counts both expired leases and old unleased reserved attempts; both focused tests completed successfully.
7. RED: credential-readiness coverage failed `1 !== 2` before active FCM routing was combined with missing credential readiness, and the CLI helper test then failed because `providerReadiness` did not exist.
8. GREEN: FCM readiness is now determined without outputting the credential path or contents; active routes with missing/invalid FCM credential structure add an aggregate readiness failure. Expo remains ready without an access token because its transport permits unauthenticated project sends.

## Verification run

- `node --experimental-strip-types scripts/test-notification-observability.mts` — PASS (`NOTIFICATION_OBSERVABILITY_OK`).
- `node --experimental-strip-types scripts/test-notification-observability-cli.mts` — PASS (`NOTIFICATION_OBSERVABILITY_CLI_OK`).
- `node --experimental-strip-types scripts/test-mobile-push-retry-worker.mts` — PASS (58 checks).
- `node --experimental-strip-types scripts/test-notification-log-privacy-task3.mts` — PASS.
- `node --check src/lib/notification-observability.cjs` — PASS.
- `node --check scripts/notification-health.cjs` — PASS.
- `node --check scripts/notification-reconcile.cjs` — PASS.
- `node --check scripts/notification-retry-receipt-runner.cjs` — PASS.
- `npx tsc --noEmit` — PASS.
- `git diff --check` — PASS.

Disposable PostgreSQL databases and roles use the `notification_observability_test_` and `notification_observability_role_` prefixes and are dropped in `finally`, including on assertion failure. Existing dependencies were temporarily reused through a local ignored symlink because the worktree intentionally has no `node_modules`; no package installation or build artifacts were created, and the symlink was removed after verification.

## Behavioral coverage

- Health fails closed on overdue retry count/age, expired lease or stale unleased reservation, stalled Expo receipt polling, active provider/token or FCM credential readiness mismatch, and missing/stale retry-worker heartbeat.
- Metrics are aggregate only by category/provider/state and include counts, provider p50/p95 latency, receipt p50/p95 lag, dead-letter/uncertain/invalid-token counts, and worker/scheduler freshness.
- Health and reconciliation run inside `BEGIN READ ONLY` with `SET LOCAL statement_timeout = '5000ms'`, have a 1–744 hour bounded lookback, and limit grouped metric rows.
- Reconciliation compares parent truth to child states and reports aggregate parent mismatches, orphaned attempt/accepted/failed combinations, and impossible provider/receipt state combinations without mutation or identifiers.
- Test fixtures assert that raw token and user-ID sentinels cannot appear in reports. The library never selects notification bodies, payloads, provider messages, emails, or raw tokens.

## Concerns / operator follow-up

- Scheduler heartbeat production is intentionally external to this change: the runbook requires the reviewed scheduler to write only a timestamp to the configured scheduler heartbeat path after successful work. Scheduler freshness is visible but does not by itself make health fail; retry-worker freshness does fail closed as required.
- The systemd templates are uninstalled examples. An operator must verify the service account name, release path, state-directory ownership, environment-file access, migration state, and scheduler heartbeat producer after the required source approvals. This change does not authorize installing, enabling, reloading, or starting them.
- The current Task 2/3 schema has foreign keys, so physical orphan attempts should be zero in a healthy database. The reconciliation query retains the defensive aggregate check for drift/corruption without exposing row identifiers or performing repair.
