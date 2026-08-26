# Mobile notification retention

This source-only retention job bounds notification data without touching an
active delivery. It is not evidence that any unit or timer is installed or
running on a host. Installation remains behind the release and signature gates.

## Policy

- After 30 days, `source_facts` is replaced with an empty object only for a
  terminal parent with no active retry or outstanding Expo receipt. The marker
  `source_facts_redacted_at` records the aggregate transition.
- After 90 days, immutable provider attempts are removed only when every child
  on the locked parent is stable and passes the same provider-ID, timestamp,
  lease, and state invariants used by reconciliation. Checked Expo acceptance
  is stable; an unpolled receipt is not. The parent delivery status must equal
  derived child truth and `attempt_count` must equal the child `send_count` sum.
  Only then is `attempts_retired_at` written before the children are deleted.
- Attempt ownership is kept for the complete 90-day engagement acceptance
  window, so a first authenticated open/action from a still-visible history
  item cannot become unauthenticated merely because provider detail aged out.
- Authenticated app acknowledgement/open/action evidence is retained for 90
  days, then deleted in bounded batches. It records server receipt time only;
  `app_received` is not described or reported as OS delivery.
- Ordinary notification history is retained for 180 days. Security and service
  history uses a longer 365-day window. History deletion requires no remaining
  children and either a valid retirement marker, an explicit legacy generation,
  or the reviewed no-deliverable terminal state; it cannot cascade-delete
  corrupt attempt evidence.
- Active reservations, retries, and outstanding Expo receipts are never
  redacted or deleted, regardless of age. Health checks continue to alert on
  those stale rows.
- Ziwei personal occurrence snapshots have an explicit minimum 30-day
  retention window, enforced by both the CLI parser and PostgreSQL function.
  After that boundary, old and expired unlinked `claimed`, `reserved`, or
  `skipped` occurrences are eligible for deletion. A push-linked `reserved`
  occurrence is eligible only when its parent is terminal
  (`accepted`/`delivered`/`failed`) and no active retry or unchecked Expo
  receipt remains. Recent, still-live, actively retried, and receipt-pending
  rows are preserved. The phase uses the same bounded batches, row locks, and
  `SKIP LOCKED` policy as the other phases, so a scheduler-owned row is deferred
  to a later run. The shared `hourkey_app` role has no direct `DELETE`
  privilege on the occurrence table, its installation parent, or the
  `users`/`profiles` cascade parents. Push unregister, account transfer, and
  normal account deletion use non-destructive state changes, so occurrence
  evidence remains attached until retention is allowed to remove it. Retention
  can invoke only the `SECURITY DEFINER` purge function, which pins
  `pg_catalog,public` and independently enforces the age, state, linkage,
  provider-finality, expiry, batch-size, and retention-window bounds inside
  PostgreSQL.
- The parent payload remains available while authenticated history remains.
  Payload and copy are therefore bounded by the 180/365-day parent windows.

The runner uses bounded batches (500 rows, at most 20 batches per phase), short
statement and lock timeouts, `SKIP LOCKED`, parent locks, and a singleton
advisory lock. Its output contains only status and aggregate counts; it never
prints titles, bodies, payloads, source facts, tokens, user IDs, or errors.

## Source verification

Run only against the disposable test databases created by the tests:

```text
node --import tsx scripts/test-notification-retention.mts
node --import tsx scripts/test-notification-retention-cli.mts
node --import tsx scripts/test-ziwei-occurrence-retention.mts
systemd-analyze verify ops/systemd/hourkey-mobile-notification-retention.service ops/systemd/hourkey-mobile-notification-retention.timer
```

The source service runs as the dedicated unprivileged `hourkey-notify` account
and writes aggregate output under the systemd-managed `/var/log/hourkey`
directory with mode 0750, a 0027 umask, 0640 files owned by that account, and
the checked-in 14-file rotation policy. Before a release gate approves installation, verify the reviewed source
commit, migration rollback/reapply evidence, that `hourkey_app` cannot delete
occurrences, installations, users, or profiles directly but can execute only
the hardened bounded purge function, the enforced 30-day minimum, disk budget,
and that the log path contains aggregate records only.

## Rollback

Withhold or remove the source timer from the release manifest. The observability
rollback removes query indexes but deliberately preserves generation and
retention markers: deleting those markers would make already-retired parents
indistinguishable from corrupt new orphans. No restore of expired personal
notification content is attempted.
