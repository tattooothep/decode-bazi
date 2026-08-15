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

## Reviewer remediation addendum

### Root cause verified

The initial implementation used one `updated_at`-bounded CTE for both historical metrics and live health/reconciliation. Therefore an overdue retry, expired lease, old unleased reservation, unpolled Expo receipt, parent/child disagreement, or impossible child state older than the default 168-hour window was not reported. It also issued concurrent `pg` queries through one checked-out client, producing a PostgreSQL deprecation warning under the expanded test. The service templates named `hourkey`, which is not an account on the reviewed host; the current deployed admin unit instead uses root.

### Red/green evidence for review findings

1. RED: disposable rows aged 200 hours made the health test fail `1 !== 2` for overdue retry count. The same fixture covers old leases, reservations, and Expo receipts.
2. GREEN: live retry, lease/reservation, receipt, and active attempt readiness now run as separate direct predicates without an `updated_at` filter. Historical terminal/latency metrics retain the bounded `updated_at` window and an index.
3. RED: all-age reconciliation expectations and the missing `ok` field failed before the implementation was changed.
4. GREEN: reconciliation compares all current parent/child rows, returns `ok`, includes orphan receipt artifacts, and the CLI test proves a nonzero exit state for any unresolved count.
5. RED: the new observability migration test could not read either migration before they were added; its first plan assertion then revealed an existing retry index was already the planner-selected compatible access path.
6. GREEN: `20260816_mobile_notification_observability.sql` adds indexed paths for stale reservations, stalled receipts, active status/token readiness, bounded historical metrics, parent/state reconciliation, and enabled-token inventory. The disposable test applies forward, validates index plans (with statistics), rolls back only these indexes, and reapplies successfully while retaining the Task 2 attempts table. The existing `ix_mobile_push_attempts_due` remains the live retry predicate's index.
7. RED: the internal endpoint test initially failed because the route did not exist; CLI template checks also failed because `User=hourkey` did not match the validated runtime account.
8. GREEN: authenticated `POST /api/internal/health/notifications` returns aggregate-only data, hides unauthorized requests, and returns a generic 503 on dependency failure. Endpoint tests cover all three paths. Systemd units use existing `root`, `systemd-analyze verify` passes, and the source-only preflight checks identity, executable, release, environment, credential, and state access as booleans without exception/path/secret output.

### Fresh verification after remediation

- `node --experimental-strip-types scripts/test-notification-observability.mts` — PASS.
- `node --experimental-strip-types scripts/test-notification-observability-cli.mts` — PASS, including `systemd-analyze verify` and root/executable access preflight coverage.
- `npx tsx scripts/test-notification-observability-endpoint.mts` — PASS.
- `node --experimental-strip-types scripts/test-notification-observability-migration.mts` — PASS (forward, rollback, reapply, and EXPLAIN plans).
- `node --experimental-strip-types scripts/test-notification-integrity-migration.mts` — PASS.
- `node --experimental-strip-types scripts/test-mobile-push-retry-worker.mts` — PASS (58 checks).
- `node --experimental-strip-types scripts/test-notification-log-privacy-task3.mts` — PASS.
- CJS syntax checks, `npx tsc --noEmit`, and `git diff --check` — PASS.

### Remaining operational constraint

No service was installed, enabled, reloaded, or started; no production database/provider was contacted and no push was sent. The root unit choice preserves the reviewed current access model but is explicitly not least-privilege. The runbook requires a read-only preflight and a fresh security review before any deployment; moving to a dedicated user first requires relocating both release and credential access.

### Read-only host preflight result

The source-only preflight was run once without changing host state. It reported `runtimeRoot=true`, `nodeExecutable=true`, `environmentReadable=true`, and `credentialReadable=true`; it correctly reported `releaseReadable=false` and `stateWritable=false` because `/root/releases/current` does not contain these un-deployed source files and the systemd-managed state directory has not been created. This is an expected deployment blocker and was not bypassed by creating directories, copying files, installing units, or changing permissions.
