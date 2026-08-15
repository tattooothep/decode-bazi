# Notification observability runbook

This source-controlled package is read-only for health and reconciliation. It emits only aggregate category/provider/state counts, percentiles, outcome counts, and freshness ages. It never selects or prints notification payloads, raw device tokens, emails, user identifiers, credentials, or message copy.

## Preconditions

- The additive notification-integrity and notification-observability migrations have been applied and their rollbacks have been reviewed.
- Source-review gates have approved the exact revision.
- The service account has only the database access needed by the existing worker and read-only health/reconciliation queries.
- A scheduler writes its own timestamp-only heartbeat to the path passed as `--scheduler-heartbeat-file` after a successful run.

## Checks

- `notification-health.cjs` exits nonzero on overdue retry age/count, expired leases, unprocessed Expo receipt backlog, actively routed provider/token or FCM credential readiness mismatches, or a missing/stale retry-worker heartbeat. These actionable predicates inspect all current attempt rows; only historical delivery metrics use the bounded 168-hour window.
- Scheduler freshness is reported separately so idle scheduler behavior remains observable without treating an empty queue as activity.
- `notification-reconcile.cjs` is read-only. It compares all current parent delivery truth with child attempts and counts orphan/impossible state combinations without repair or mutation. It exits nonzero whenever any invariant count is nonzero.
- Historical health metrics use a 168-hour default; `notification-health.cjs --lookback-hours` is clamped to 1 through 744 hours. `notification-reconcile.cjs` accepts no flags and rejects `--lookback-hours` or any unknown argument with the fixed `invalid_arguments` error so no no-op scope is implied. Current reconciliation is deliberately not time-scoped.
- `POST /api/internal/health/notifications` uses the existing internal bearer secret. It returns aggregate health only to an authenticated caller, hides unauthorized requests, and returns a generic failure on database/dependency errors.

## Deployment review

The templates under `ops/systemd/` are examples only. They are not installed, enabled, reloaded, or started by this repository. They deliberately use the existing `root` runtime account because the current release path and FCM credential access model are root-owned. This is not least-privilege isolation: the hardening directives reduce filesystem exposure, but the account can still read the reviewed root-owned release and credential locations. Before a future drop to a dedicated account, relocate credentials and release access, validate that account and its executable paths, then review the changed service units.

Before an operator performs a reviewed deployment, confirm the release path, root account, state directory ownership, environment file permissions, migration level, timer cadence, and scheduler heartbeat producer. Verify health and reconciliation output contains aggregate fields only and record the exact revision and review approvals in the release evidence.

Run `node scripts/notification-observability-preflight.cjs` from the reviewed release before any service action. It checks the root runtime identity, Node executable, release scripts, environment file, credential readability, and state-directory contract as booleans only; it prints neither paths nor credential data. A pre-existing writable state directory is `stateReady`. Before the first service start, an absent directory is accepted only as `stateCreatable` when root can write `/var/lib` and the reviewed retry unit declares the matching root-owned `StateDirectory`; the preflight never creates it. Validate the four unit files with `systemd-analyze verify` as part of that review. A failed preflight or unit validation is a deployment blocker, not a reason to weaken the service account or protections.

## Response

Treat a failed health result as a stop signal for notification rollout. Investigate with aggregate reconciliation output first. Do not replay attempts manually, modify rows, expose identifiers, or send a test push from this runbook. Roll back the reviewed service/template revision if it is the cause; retain existing delivery rows for forensic review.
