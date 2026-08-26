# Notification observability runbook

This source-controlled package is read-only for health and reconciliation. It emits only aggregate category/provider/state counts, percentiles, outcome counts, and freshness ages. It never selects or prints notification payloads, raw device tokens, emails, user identifiers, credentials, or message copy.

## Preconditions

- The additive notification-integrity, notification-observability, and
  notification-engagement migrations have been applied and their rollbacks
  have been reviewed.
- Source-review gates have approved the exact revision.
- The service account has only the database access needed by the existing worker and read-only health/reconciliation queries.
- Each source scheduler writes its own timestamp-only heartbeat
  under the directory passed as `--scheduler-heartbeat-dir` after a successful,
  lease-owning run. A source file or template is not evidence that its external
  cron/timer is installed or live; missing files therefore fail health closed.

## Checks

- `notification-health.cjs` exits nonzero on overdue retry age/count, expired leases, unprocessed Expo receipt backlog, actively routed provider/token or FCM credential readiness mismatches, or a missing/stale retry-worker heartbeat. These actionable predicates inspect all current attempt rows; only historical delivery metrics use the bounded 168-hour window.
- Scheduler freshness is reported separately for `yam`, `daily-fortune`,
  `auspicious`, `personal-reminders`, `monthly-report`, `network-morning`,
  `zibai`, `qimen`, and `ziwei-hourly`.
  Missing, stale, and future-timestamp reasons include the scheduler name so an
  empty queue or a bad host clock is not mistaken for scheduler activity. The
  worker and scheduler checks tolerate at most 60 seconds of future clock skew.
- Ziwei health also reads the DB producer gate and compares it with the runtime
  enable flag, exact release commit, locked source digest, and verified runtime
  sources. Disabled or mismatched provenance is unhealthy even when the timer
  heartbeat is fresh. Enabled/due installations, due lag, and expired unlinked
  claimed occurrences are reported as counts/ages only. Zi Bai due lag is
  scoped to the active calculation version and its enabled capable token owner;
  inactive installation rows are reported separately as an orphan count.
- Expo readiness is true only when `EXPO_IOS_PUSH_READY=true`; it is not inferred
  from the optional Expo access token or a fresh scheduler heartbeat.
- Engagement rates use distinct accepted notification/installation targets as
  their denominator. `ackRate` means an authenticated `app_received` callback;
  it is not evidence that the OS displayed a notification. `openRate` and
  `actionRate` use authenticated app callbacks for the same owned target. Only
  aggregate counts/rates are returned; account, installation, and notification
  identifiers are never included in health output.
- `notification-reconcile.cjs` is read-only. It compares generation-1,
  unretired parent delivery truth with child attempts and counts
  orphan/impossible state combinations without repair or mutation. Generation-0
  pre-attempt history and generation-1 parents whose children were intentionally
  retired are reported as informational aggregates, not corrupt orphans.
- Historical health metrics use a 168-hour default; `notification-health.cjs --lookback-hours` is clamped to 1 through 744 hours. `notification-reconcile.cjs` accepts no flags and rejects `--lookback-hours` or any unknown argument with the fixed `invalid_arguments` error so no no-op scope is implied. Current reconciliation is deliberately not time-scoped.
- `POST /api/internal/health/notifications` uses the existing internal bearer secret. It returns aggregate health only to an authenticated caller, hides unauthorized requests, and returns a generic failure on database/dependency errors.

## Deployment review

The templates under `ops/systemd/` are examples only. They are not installed,
enabled, reloaded, or started by this repository. The unchanged legacy Qimen
and Zi Bai source workers still use their existing root runtime and shared
environment; this release does not silently move or restart them. The shared
retry/receipt and health workers, together with the new Ziwei scheduler and
retention job, run as the dedicated `hourkey-notify` account with the dedicated
notification environment and reviewed FCM credential path. This boundary must
be proven with effective-user path and credential checks before installation;
unit-file declarations alone are not evidence that delivery will continue.

Before an operator performs a reviewed deployment, confirm the release path, runtime accounts, state directory ownership, environment file permissions, migration level, timer cadence, and scheduler heartbeat producer. Verify health and reconciliation output contains aggregate fields only and record the exact revision and review approvals in the release evidence.

The Ziwei, retry/receipt, health, and retention units run as `hourkey-notify`
and load only `/etc/hourkey/hourkey-notification.env`. The
checked-in `scripts/derive-hourkey-notification-env.cjs --install` helper copies
only `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`,
`EXPO_PUSH_ACCESS_TOKEN`, `ZIWEI_HOURLY_PRODUCER_ENABLED`,
`HOURKEY_RELEASE_COMMIT`, `EXPO_IOS_PUSH_READY`, and
`NOTIFICATION_SCHEDULER_HEARTBEAT_DIR`. Core PostgreSQL keys, exact
`PGUSER=hourkey_app`, the runtime producer flag, and an exact lowercase 40-hex release commit are required;
Expo iOS readiness, when present, must be exactly `true` or `false`. It writes
atomically as `root:hourkey-notify` mode `0640` and
reports only success plus a key count; it never logs values. The helper is a
source-only installation contract and is not evidence that the dedicated file
has been derived on any host. The Ziwei scheduler, retry/receipt worker, health
check, and retention unit all require this file. Retry and health force the
reviewed `/etc/hourkey/credentials/fcm-service-account.json` path in their unit
command rather than copying an arbitrary credential path from the shared env.

Run `node scripts/notification-observability-preflight.cjs` from the reviewed
release before any service action. It checks the root operator identity, Node
executable, every named scheduler/retry/health source, shared environment and
credential readability for remaining root workers, dedicated-environment
readability, exact regular-file ownership `root:hourkey-notify`, mode `0640`,
reviewed key/value contract, credential and executable-path readability as
`hourkey-notify`, and the state-directory contract as booleans only; it prints
neither paths nor credential data. It also connects through the dedicated
settings and proves `current_user=session_user=hourkey_app`, read-only effective
access to the Ziwei producer row, required parent/attempt UPDATE capabilities,
no direct DELETE on occurrence/installation/user/profile cascade boundaries,
the executable and hardened bounded purge function, the inherited shared-parent
DELETE only behind a trigger that protects linked Ziwei occurrences and the
180-day history boundary, and all four required integrity triggers. A
pre-existing writable state directory is `stateReady`.
Before the first service start, an absent directory is accepted only as
`stateCreatable` when root can write `/var/lib` and the reviewed tmpfiles
contract declares `/var/lib/hourkey-notification` with the single owner
`hourkey-notify:hourkey-notify`; the preflight never creates it. No service unit
declares `StateDirectory`, so a service start cannot recursively change that
shared ownership. Apply the tmpfiles contract before starting a worker and
validate the unit files with `systemd-analyze verify` as part of that review. A
failed preflight or unit validation is a deployment blocker, not a reason to
weaken the service account or protections.

## Ziwei producer mutation boundary

The database producer row is the authoritative linearizable kill switch. Every
INSERT, UPDATE, or DELETE on that row automatically takes the exclusive
transaction advisory gate, while a Ziwei worker holds the shared session gate
from its final policy read through provider completion and durable result. An
owner/admin disable therefore waits for admitted sends to finish; after the
disable transaction commits, no later provider call can cross the gate. The
runtime role `hourkey_app` has SELECT only and cannot acknowledge this boundary.
Operators must mutate the row only as the reviewed owner/admin role in one
transaction and treat COMMIT as the disable/enable acknowledgement. Direct SQL
is still serialized by the trigger; bypassing or disabling the trigger is not
an approved operation. The runtime environment flag is an additional
fail-closed prerequisite, not a substitute for the database kill-switch
transaction.

## Response

Treat a failed health result as a stop signal for notification rollout. Investigate with aggregate reconciliation output first. Do not replay attempts manually, modify rows, expose identifiers, or send a test push from this runbook. Roll back the reviewed service/template revision if it is the cause; retain existing delivery rows for forensic review.
