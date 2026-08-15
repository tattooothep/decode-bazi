# Mobile notification retention

This source-only retention job bounds notification data without touching an
active delivery. It is not evidence that any unit or timer is installed or
running on a host. Installation remains behind the release and signature gates.

## Policy

- After 30 days, `source_facts` is replaced with an empty object only for a
  terminal parent with no active retry or outstanding Expo receipt. The marker
  `source_facts_redacted_at` records the aggregate transition.
- After 30 days, immutable provider attempts are removed only when every child
  on the locked parent is stable (`dead`, `delivered`, or FCM accepted). The
  parent stays as useful authenticated history and `attempts_retired_at` keeps
  reconciliation from mistaking the intentional retirement for an orphan.
- Ordinary notification history is retained for 180 days. Security and service
  history uses a longer 365-day window. Deleting the parent also deletes any
  remaining child rows through the existing foreign key.
- Active reservations, retries, and outstanding Expo receipts are never
  redacted or deleted, regardless of age. Health checks continue to alert on
  those stale rows.
- The parent payload remains available while authenticated history remains.
  Payload and copy are therefore bounded by the 180/365-day parent windows.

The runner uses bounded batches (500 rows, at most 20 batches per phase), short
statement and lock timeouts, `SKIP LOCKED`, parent locks, and a singleton
advisory lock. Its output contains only status and aggregate counts; it never
prints titles, bodies, payloads, source facts, tokens, user IDs, or errors.

## Source verification

Run only against the disposable test databases created by the tests:

```text
node --experimental-strip-types scripts/test-notification-retention.mts
node --experimental-strip-types scripts/test-notification-retention-cli.mts
systemd-analyze verify ops/systemd/hourkey-mobile-notification-retention.service ops/systemd/hourkey-mobile-notification-retention.timer
```

The source service writes aggregate output under `/var/log/hourkey` with a
0750 directory, 0027 umask, 0640 files, and the checked-in 14-file rotation
policy. Before a release gate approves installation, verify the reviewed source
commit, migration rollback/reapply evidence, database-role access, disk budget,
and that the log path contains aggregate records only.

## Rollback

Withhold or remove the source timer from the release manifest. The observability
rollback removes query indexes but deliberately preserves generation and
retention markers: deleting those markers would make already-retired parents
indistinguishable from corrupt new orphans. No restore of expired personal
notification content is attempted.
