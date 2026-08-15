# Legacy Containment, E2E, and Rollout Plan

> Scope: notification legacy endpoints, observability, staging proof, and release gates. No production mutation until three source signatures approve the exact commits.

**Goal:** Remove insecure duplicate push paths, expose truthful health/delivery signals, and prove the reviewed bytes on real devices before rollout.

## Task 1: Contain legacy web-push

Files:
- Add a version-controlled hardening script/runbook in backend repository
- Modify version-controlled legacy proxy/config tests only before approval

Steps:
1. Add RED configuration tests rejecting public `/push/test`, unauthenticated unsubscribe, hard-coded VAPID material, and legacy cron enablement.
2. Prepare a no-secret migration that disables the legacy cron/routes, rotates credentials from environment, and records rollback commands.
3. After three source approvals, apply only the reviewed config change with pre/post route checks; never print credentials.

## Task 2: Observability and reconciliation

Files:
- Add notification health/reconciliation scripts and systemd templates under source control
- Extend internal health endpoint/test

Steps:
1. RED: health fails on retry backlog age, stale pending lease, zero receipt processing, token-provider readiness mismatch, or worker heartbeat loss.
2. Add aggregate metrics by category/provider/state, latency percentiles, receipt lag, dead-letter count, token invalidation count, and alert thresholds without PII/token values.
3. Add reconciliation proving event state equals child delivery/attempt state and reporting orphaned accepted/failed rows.

## Task 3: Staging and artifact proof

Steps:
1. Obtain three independent source-review signatures for the exact mobile/backend/config commits.
2. Apply additive migrations to a disposable/staging database; prove rollback/reapply and concurrent-worker idempotency.
3. Build a new internal-QA artifact from exact approved mobile source; obtain three artifact signatures.
4. On at least one Android and one iOS physical device, test clean install, denied/granted permission, token rotation, foreground/background/killed tap, mute, sign-out/login-account-switch, eight categories, retry, and receipt evidence.
5. Run a staging load/soak covering 10,000 registered users and realistic notification fanout with p95/p99/error/queue lag thresholds.
6. Roll out canary to internal accounts, then limited cohort, then wider cohort only if alerts and receipts remain healthy; preserve immediate rollback switches.

## Hard gates

- Three source signatures before migration/build/reload/deploy.
- Three artifact/device signatures before public rollout.
- No production push is sent by automated tests.
- No secrets, raw tokens, emails, notification bodies, or user identifiers enter logs/evidence.
