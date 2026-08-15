# Legacy Task 1 — Legacy Containment Evidence

## Scope and isolation

- Created `/root/worktrees/notify-legacy-containment` on local branch
  `codex/notify-legacy-containment` from clean commit
  `3e86c291c39a64b369478dba4be4f9c1dd1d552f`.
- No file under `/root/qimen-api` was read or modified. No production route,
  service, cron, database, credential, or push operation was executed.
- No dependency installation or build artifact was created because available
  filesystem space was constrained.

## RED evidence

1. `node scripts/test-legacy-qimen-containment.mjs` failed before the tool
   existed: the safe audit assertion could not pass.
2. `node scripts/test-admin-notify-recipient-rbac.mjs` failed before the pure
   query builder existed with `ERR_MODULE_NOT_FOUND`.
3. After adding the runbook contract to the containment test, the same test
   failed with `ENOENT` until the source-controlled runbook was added.

## GREEN evidence

- `node scripts/test-legacy-qimen-containment.mjs` ->
  `LEGACY_QIMEN_CONTAINMENT_OK 17`.
  - Default audit is read-only and fails closed for an enabled legacy route or
    cron.
  - Audit rejects literal VAPID private material without echoing it.
  - Apply requires exactly three approvals, an explicit confirmation, exact
    checksums, a backup manifest, candidate validation, and atomic writes.
  - Explicit rollback verifies checksums and restores only the manifest files.
- `node scripts/test-admin-notify-recipient-rbac.mjs` ->
  `ADMIN_NOTIFY_RECIPIENT_RBAC_OK`.
  - The recipient query requires live DB RBAC and uses `ADMIN_EMAILS` only as an
    optional narrowing filter; it cannot bypass role, event-audience, or required
    permission checks.
- `node --check` passed for the new containment tool, new RBAC helper, and
  changed watcher.
- `git diff --check` passed.

## Delivered source changes

- `scripts/ops/contain-legacy-qimen-push.mjs`: default dry audit plus guarded
  apply/rollback against a reviewed deployment snapshot. It emits only result
  codes and never performs HTTP probes that could send a push.
- `docs/runbooks/legacy-qimen-push-containment.md`: exact audit/apply/rollback
  procedure, three-approval gate, backup and secret-handling rules.
- `src/lib/admin-notify-recipient-rbac.mjs` and
  `scripts/workers/admin-notify-watcher.mjs`: RBAC-first notification-recipient
  selection with optional environment allowlist narrowing only.
- Focused regression tests for containment and recipient authorization.

## Concerns

- A live legacy deployment was deliberately not audited: the task forbids
  touching `/root/qimen-api` and production. The runbook requires a reviewed,
  read-only configuration snapshot and then the separate three-signature gate
  before any operational action.
- Full `tsc --noEmit` was attempted with the available compiler but cannot run
  in this isolated worktree because dependency type packages are absent; it
  reports existing unresolved framework and Node module declarations. No package
  install was attempted due to the filesystem-space constraint. JavaScript syntax
  checks and focused source tests passed.
- The tool intentionally does not generate, receive, print, or restore VAPID
  private values. Secret-manager rotation remains a separately reviewed
  operational step; rollback must not restore an exposed private key.

## Reviewer Remediation — Containment Hardening

### RED evidence

- After adding the adversarial cron case,
  `node scripts/test-legacy-qimen-containment.mjs` failed with
  `an active legacy cron remains enabled despite a trailing disabled comment`.
  The prior parser incorrectly treated an inline comment as a disable control.
- The same new focused test includes pre-fix reproductions for a nonempty backup
  directory, VAPID private/public literal fallback expressions, an unrelated
  patch path, and a PII-bearing approvals path. Each is asserted to fail closed
  without modifying its sentinel or echoing the supplied marker/path.
- Adding optional-chaining and embedded-VAPID-literal cases then produced the
  same focused-test failure until the detector covered those forms.

### GREEN evidence

- `node scripts/test-legacy-qimen-containment.mjs` ->
  `LEGACY_QIMEN_CONTAINMENT_OK 37`.
  - Apply creates the backup directory with non-recursive exclusive creation and
    rejects every pre-existing path before it can create or overwrite files.
  - Cron parsing ignores only leading-comment lines and strips trailing comments
    after determining the active entry.
  - Audit rejects direct/embedded VAPID private/public literals, literal
    fallbacks for dot, bracket, and optional-chaining environment access, and
    literal `setVapidDetails` input.
  - Apply patches must exactly match an audited route/source/cron allowlist.
  - Top-level failure output accepts only a fixed reason-code allowlist; unknown
    filesystem exceptions become `unexpected_failure` with no path text.
- `node scripts/test-admin-notify-recipient-rbac.mjs` ->
  `ADMIN_NOTIFY_RECIPIENT_RBAC_OK`.
- `node --check scripts/ops/contain-legacy-qimen-push.mjs`,
  `node --check scripts/workers/admin-notify-watcher.mjs`, and
  `node --check src/lib/admin-notify-recipient-rbac.mjs` passed.
- `git diff --check` passed.
