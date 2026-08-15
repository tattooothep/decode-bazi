# Notification observability runbook

This source-controlled package is read-only for health and reconciliation. It emits only aggregate category/provider/state counts, percentiles, outcome counts, and freshness ages. It never selects or prints notification payloads, raw device tokens, emails, user identifiers, credentials, or message copy.

## Preconditions

- The additive notification-integrity migration has been applied and its rollback has been reviewed.
- Source-review gates have approved the exact revision.
- The service account has only the database access needed by the existing worker and read-only health/reconciliation queries.
- A scheduler writes its own timestamp-only heartbeat to the path passed as `--scheduler-heartbeat-file` after a successful run.

## Checks

- `notification-health.cjs` exits nonzero on overdue retry age/count, expired leases, unprocessed Expo receipt backlog, actively routed provider/token readiness mismatches, or a missing/stale retry-worker heartbeat.
- Scheduler freshness is reported separately so idle scheduler behavior remains observable without treating an empty queue as activity.
- `notification-reconcile.cjs` is read-only. It compares parent delivery truth with child attempts and counts orphan/impossible state combinations without repair or mutation.
- Both commands bound their default scan to 168 hours; `--lookback-hours` is clamped to 1 through 744 hours.

## Deployment review

The templates under `ops/systemd/` are examples only. They are not installed, enabled, reloaded, or started by this repository. Before an operator performs a reviewed deployment, confirm the release path, account name, state directory ownership, environment file permissions, migration level, timer cadence, and scheduler heartbeat producer. Verify health and reconciliation output contains aggregate fields only and record the exact revision and review approvals in the release evidence.

## Response

Treat a failed health result as a stop signal for notification rollout. Investigate with aggregate reconciliation output first. Do not replay attempts manually, modify rows, expose identifiers, or send a test push from this runbook. Roll back the reviewed service/template revision if it is the cause; retain existing delivery rows for forensic review.
