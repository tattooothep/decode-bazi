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
6. GREEN: `20260816_mobile_notification_observability.sql` adds indexed paths for stale reservations, stalled receipts, active status/token readiness, bounded historical metrics, parent/state reconciliation, and enabled-token inventory. The disposable test applies forward, validates index plans (with statistics), rolls back only these indexes, and reapplies successfully while retaining the Task 2 attempts table. The observability migration owns its live retry access path rather than relying on an unrelated compatibility index.
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

The first-generation source-only preflight was run once without changing host state. It reported `runtimeRoot=true`, `nodeExecutable=true`, `environmentReadable=true`, and `credentialReadable=true`; it correctly reported `releaseReadable=false` and `stateWritable=false` because `/root/releases/current` does not contain these un-deployed source files and the systemd-managed state directory has not been created. This was an expected deployment blocker and was not bypassed by creating directories, copying files, installing units, or changing permissions. The current preflight's refined `stateReady`/`stateCreatable` contract is recorded in the second remediation addendum.

## Second reviewer remediation addendum

### Root cause verified against worker claims

The prior health predicates did not exactly match the durable worker. `claimOne` treats `COALESCE(next_retry_at,to_timestamp(0))` as due, so a `retry_due` row with no retry time is actionable; it cannot reclaim a non-null lease with no expiry, leaving a permanent block. `claimReceiptOne` can claim an Expo ticket without `accepted_at` through its coalesced receipt/acceptance/creation timestamp, but that state is semantically invalid. The first-start preflight also treated a missing systemd `StateDirectory` as an unconditional access failure even though systemd safely creates it from the reviewed unit contract.

### Red/green evidence

1. RED: disposable current-schema rows aged 200 hours caused the health assertion to fail `2 !== 3` when a `retry_due` row had `next_retry_at=NULL`.
2. GREEN: health now uses the worker-equivalent retry predicate (`send_started_at IS NULL`, epoch-coalesced retry time, and reclaimable lease), counts expired and NULL-expiry leases separately, and treats Expo acceptance with ticket/no `accepted_at` as stalled. These are all all-current direct checks, not historical metrics.
3. RED: the migration test failed because the new worker-equivalent predicate indexes did not exist.
4. GREEN: forward/rollback/reapply plus EXPLAIN verifies indexes for claimable retry rows, stale unleased reservations, missing Expo acceptance timestamps, permanent NULL-expiry leases, bounded historical metrics, parent state reconciliation, and enabled-token inventory.
5. RED: absent first-start state directory produced `ok:false` even with a reviewed root-owned `StateDirectory` unit contract.
6. GREEN: preflight distinguishes `stateReady` from `stateCreatable`; it accepts only the latter when root can write `/var/lib` and the retry unit explicitly declares matching root user/group and `StateDirectory`, without creating a directory. A missing/unsafe unit contract remains failed closed.
7. RED: reconciliation had no parser and silently accepted the obsolete `--lookback-hours` no-op.
8. GREEN: reconciliation accepts no flags, rejects that and any unknown argument with fixed aggregate-safe `invalid_arguments`, avoids opening a database for rejected input, and still exits nonzero on unresolved invariants.

### Current semantic reconciliation coverage

All-age reconciliation now flags distinct rows for Expo accepted state without a ticket, FCM accepted state carrying an Expo ticket, retry-due state without a retry timestamp, reserved/retry state with a permanent lease, provider-accepted state without `accepted_at`, and delivered state without `accepted_at` or `delivered_at`. Tests cover each timestamp/lease case with old rows to prove they remain visible beyond the metrics window; reports remain aggregate only.

### Fresh verification after second remediation

- `node --experimental-strip-types scripts/test-notification-observability.mts` — PASS.
- `node --experimental-strip-types scripts/test-notification-observability-cli.mts` — PASS (argument rejection, first-start preflight, root/user validation, and `systemd-analyze verify`).
- `npx tsx scripts/test-notification-observability-endpoint.mts` — PASS.
- `node --experimental-strip-types scripts/test-notification-observability-migration.mts` — PASS (forward, rollback, reapply, EXPLAIN).
- `node --experimental-strip-types scripts/test-notification-integrity-migration.mts` — PASS.
- `node --experimental-strip-types scripts/test-mobile-push-retry-worker.mts` — PASS (58 checks).
- `node --experimental-strip-types scripts/test-notification-log-privacy-task3.mts` — PASS.
- CJS syntax checks, `npx tsc --noEmit`, and `git diff --check` — PASS.

No production database, release contents, service/timer state, credential, directory permission, or provider was changed; no push was sent.

### Final expired-lease access-path follow-up

The all-current expired-lease health predicate also needs an explicit bounded access path; the retry-only index does not prove the standalone stale-lease query. RED: the disposable migration test failed because `ix_mobile_push_attempts_observability_lease_expired` was absent. GREEN: the forward migration now creates the partial non-null expiry index, rollback removes it, reapply restores it, and `EXPLAIN` proves the exact `lease_token IS NOT NULL AND lease_expires_at<=now()` predicate uses it. This was verified only on a disposable PostgreSQL database, which its `finally` cleanup dropped.

### Final source-only verification

After the expired-lease index change, the complete required suite passed again: observability behavior; CLI, preflight, argument rejection, and `systemd-analyze verify`; authenticated endpoint; observability forward/rollback/reapply plus all `EXPLAIN` assertions; integrity migration; all 58 retry-worker checks; Task 3 privacy scan; CJS syntax checks; TypeScript no-emit; and `git diff --check`. The temporary ignored dependency symlink was removed immediately after the run. No live service, deployment file, database, provider, credential, or push operation was invoked.

## Third reviewer remediation addendum

### Worker lease-state matrix audit

The audit was performed against the actual current-schema predicates in `claimOne`, `recoverUncertainOne`, and `claimReceiptOne`. Claim and receipt can proceed with a NULL token regardless of expiry, or a non-NULL token only after expiry; recovery first selects only a started attempt with expired lease, then requires token equality to update it. That second equality means an expired started attempt whose token is NULL is selected but can never be recovered. A started row with both token and expiry NULL is likewise unrecoverable; a NULL-token future expiry has no real owner and will fail recovery when it expires. Only a non-NULL future expiry is a legitimate active lease.

### Red/green evidence

1. RED: the table-driven disposable worker matrix (three worker paths times all six NULL/past/future expiry and NULL/present-token combinations) failed health with `6 !== 9`; health counted expired/permanent leases but not the three NULL-token in-flight recovery states.
2. GREEN: health adds the all-current `reserved`/`retry_due`, `send_started_at IS NOT NULL`, `lease_token IS NULL` unhealthy predicate. Receipt health now also requires the receipt worker's exact reclaimable lease condition, so a legitimate non-NULL future receipt lease is not called stalled.
3. RED: the migration test failed because the new unrecoverable-in-flight access path was absent.
4. GREEN: the migration adds and rollback removes partial indexes for unrecoverable in-flight rows and terminal rows retaining either lease field; disposable forward/rollback/reapply with `EXPLAIN` validates each exact predicate.
5. The matrix directly proves the recovery hole: a disposable `retry_due` started row with NULL token and expired lease matches the worker's candidate SELECT, has zero rows for the subsequent token-equality SELECT, and `recoverUncertainOne` returns `null` without mutation. Health and reconciliation both surface it as an aggregate failure.
6. Reconciliation now treats non-NULL token/NULL expiry as impossible regardless of status (including a leased Expo receipt), all NULL-token started open rows as impossible, and delivered/dead rows retaining either lease field as impossible. The terminal matrix keeps no-lease terminal rows valid and verifies legitimate non-NULL future active leases are not flagged.

No production database, filesystem path, release, service/timer state, credential, or provider was changed; no push was sent. The disposable test database and role remain cleaned in `finally` blocks.
