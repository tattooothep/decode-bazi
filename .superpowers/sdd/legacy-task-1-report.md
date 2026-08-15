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

## Second Reviewer Remediation — Path and Parser Hardening

### RED evidence

- `node scripts/test-legacy-qimen-containment.mjs` failed after the exact proxy
  exploit was added: `commented proxy denial directives never satisfy endpoint
  containment`. The former regular expression counted `# return 404` and
  `# deny all` as effective directives.
- The same RED test extension added exact fixtures for an intermediate symlink
  escaping the audited root (including apply and external-file preservation),
  optional-bracket and parenthesized VAPID environment fallbacks, and commented
  location blocks. These fixtures were added before the path/parser changes.

### GREEN evidence

- `node scripts/test-legacy-qimen-containment.mjs` ->
  `LEGACY_QIMEN_CONTAINMENT_OK 45`.
  - Every configured target file is resolved component-by-component from a
    non-symlink root; symlinked/non-directory components and realpath changes or
    escapes fail closed during audit, apply, and rollback target access.
  - Target writes revalidate the path immediately before temporary-file creation
    and again before rename. Temporary files use exclusive no-follow creation.
  - Backup/approval/inventory paths also reject symlinked components and backup
    contents are read and written through checked regular files.
  - Proxy denial detection strips comments, finds the balanced exact-endpoint
    location block, and accepts only an uncommented terminating `return` or
    `deny all` directive in that block.
  - VAPID fallback analysis recognizes dot, optional, bracket, whitespace, and
    parenthesized environment expressions; it still emits only fixed reason
    codes.
  - The outside-root symlink fixture fails audit and apply while its external
    target stays byte-for-byte unchanged.
- `node scripts/test-admin-notify-recipient-rbac.mjs` ->
  `ADMIN_NOTIFY_RECIPIENT_RBAC_OK`.
- Syntax checks for containment, watcher, and RBAC helper plus `git diff --check`
  passed.

## Third Reviewer Remediation — Final Integrity Gates

### RED evidence

- `node scripts/test-legacy-qimen-containment.mjs` failed after adding the exact
  conditional-location exploit with `conditional proxy denial directives never
  satisfy canonical endpoint containment`. The earlier parser accepted a nested
  `if` containing `return 404`.
- The same RED extension added strict VAPID bracket-environment and indirect
  literal cases plus a deterministic post-backup concurrent-edit hook. They were
  added before the canonical parser/dataflow and final integrity-gate changes.

### GREEN evidence

- `node scripts/test-legacy-qimen-containment.mjs` ->
  `LEGACY_QIMEN_CONTAINMENT_OK 54`.
  - Nginx endpoint containment now accepts exactly one uncommented exact-match
    location body consisting only of `return 404;`; conditional, proxy, rewrite,
    `try_files`, duplicate, and commented variants fail closed.
  - Any VAPID-bearing source is accepted only with the three exact environment
    bindings and the exact `webPush.setVapidDetails` dataflow; optional/bracket
    access, aliases, fallbacks, literals, templates, calls, and defaults fail.
  - A target snapshot captures bytes/checksum plus device, inode, mode, size and
    timestamps before backups. All targets are revalidated before backup and
    again after backup but before the first write; each individual write
    revalidates once more immediately before temporary creation and rename.
  - The deterministic test-only post-backup mutation aborts before target writes,
    leaves the concurrent target content unchanged, leaves later targets
    unchanged, and preserves the approved-before backup bytes.
- `node scripts/test-admin-notify-recipient-rbac.mjs` ->
  `ADMIN_NOTIFY_RECIPIENT_RBAC_OK`.
- Containment/watcher/RBAC syntax checks and `git diff --check` passed.

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

## Fourth Reviewer Remediation — Metadata and Hook Removal

### RED evidence

- Added a non-default `0640` route-file fixture with its current safe uid/gid,
  manifest metadata assertions, and apply/rollback preservation checks before
  changing the tool. `node scripts/test-legacy-qimen-containment.mjs` failed at
  `apply preserves reviewed target mode and ownership`: the prior atomic
  temporary was created as `0600` and replaced the reviewed mode.
- Replaced the former operational mutation hook test with a test-only Node
  preload. The preload pauses immediately after the backup manifest rename,
  then the test externally changes the target and releases the child process.
  This deterministically proves the final all-target verification aborts before
  a reviewed replacement, preserves the concurrent bytes, and leaves later
  targets untouched, without a tool test hook or test-environment branch.

### GREEN evidence

- `node scripts/test-legacy-qimen-containment.mjs` ->
  `LEGACY_QIMEN_CONTAINMENT_OK 58`.
  - Target snapshots now include uid/gid. Atomic target replacement creates a
    `0600` private temporary, applies only that target's captured uid/gid/mode
    with descriptor-level `fchown` then `fchmod`, renames it, and verifies the
    replacement content and metadata.
  - If post-rename verification fails, the helper atomically restores the
    captured pre-write bytes and metadata when the replacement bytes still
    match; otherwise it fails closed without overwriting concurrent bytes.
  - Apply writes `originalMetadata` into the checked rollback manifest and
    rollback validates and uses it, rather than inheriting metadata from the
    applied file. The non-default mode/current uid/current gid fixture proves
    apply and rollback each preserve the original values.
  - The operational tool contains no `TEST_AFTER_BACKUP_MUTATION`,
    `LEGACY_CONTAINMENT_TEST_HOOK`, `runTestAfterBackupHook`, or test-mode
    branch; a focused source assertion enforces that regression boundary.
- `node scripts/test-admin-notify-recipient-rbac.mjs` ->
  `ADMIN_NOTIFY_RECIPIENT_RBAC_OK`.
- `node --check scripts/ops/contain-legacy-qimen-push.mjs`,
  `node --check scripts/test-legacy-qimen-containment.mjs`,
  `node --check scripts/workers/admin-notify-watcher.mjs`, and
  `node --check src/lib/admin-notify-recipient-rbac.mjs` passed.
- `git diff --check` passed.

### Timestamp and concurrency note

- The runbook now explicitly contracts mode/uid/gid preservation only. Atomic
  rename intentionally changes mtime/ctime, so those timestamps are not a
  preservation contract. The existing cooperative-operator constraint remains:
  a privileged actor able to rename directories in the tiny interval after the
  final checks but before kernel rename is outside a path-based tool's
  guarantee.

### Current limitation

- `tsc --noEmit` could not run because `tsc` is not installed in this isolated
  workspace. No package installation was attempted because the root filesystem
  is nearly full; the scoped implementation is JavaScript and passed its syntax
  checks.

## Final Source-Gate Remediation — Safe, Compensating Rollback

### Scope and isolation

- Created `/root/worktrees/notify-legacy-rollback-final` on branch
  `codex/notify-legacy-rollback-final` from integrated backend commit
  `3bacbaa2ac1124e6ad484e72593c42b4ad15d3f1`.
- No live `/root/qimen-api` file, production database, service, cron, provider,
  build, credential, or deployment was read or changed.

### RED evidence

- Added an actual source fixture whose original VAPID private-key binding has a
  literal fallback, applied its reviewed environment-only replacement, and
  asserted the generated manifest must machine-mark the original as
  `retain_applied`. The pre-fix focused suite failed at that new assertion.
- The same pre-implementation extension added a Node preload that fails the
  later cron-target rename after an earlier route target has been restored. It
  requires the route to be compensated to exact contained bytes/mode/uid/gid,
  every other target to remain contained, output to stay secret-free, and the
  manifest to remain reusable.

### GREEN evidence

- Apply now writes manifest version 2 with a non-secret, recomputed rollback
  policy per target. Rollback never writes any VAPID-bearing backup: if either
  the original or applied target references VAPID, it retains the
  already-verified environment-only applied bytes. Version 1 manifests receive
  the same dynamic safety decision.
- Before writes, a normal rollback requires the entire inventory to pass the
  contained audit and checksum-validates every manifest target. The exact
  safe-selective apply recovery state uses a narrower credential/proxy boundary
  and requires every target to match either its permitted applied or original
  checksum and metadata. If a later write fails, rollback compensates
  already-restored targets in reverse order and verifies all manifest targets
  against captured pre-rollback content plus mode/uid/gid. Successful
  compensation emits only `rollback_failed_compensated`; an incomplete
  compensation emits only `rollback_compensation_failed` and blocks further
  operational action.
- The external one-shot later-target failure leaves route, cron, and VAPID source
  consistently contained. A subsequent rollback using the same backup proves
  the manifest is recoverable while the exposed VAPID original remains skipped.
- `node scripts/test-legacy-qimen-containment.mjs` ->
  `LEGACY_QIMEN_CONTAINMENT_OK 89`.
- The runbook and integrity design now describe selective rollback, compensation,
  fixed result codes, legacy-manifest behavior, and the reload stop condition.

### Re-review remediation — apply compensation

- Reviewer reproduction showed that the original apply catch restored
  `before.text` for every previously written target. If a VAPID patch was first
  and a later cron rename failed, this reintroduced the exposed original even
  though rollback itself was safe.
- RED reordered the real fixture so the VAPID transition writes first, injected
  a one-shot failure at the later cron rename, and required environment-only
  VAPID bytes plus mode/uid/gid to remain applied while the written route and
  unwritten cron match originals. It also required fixed redacted output, a
  secret-free manifest, and successful guarded recovery with that same manifest.
- Apply compensation is now rollback-policy aware. It retains written VAPID
  transitions, reverse-compensates written non-VAPID targets, and verifies every
  target's expected checksum/mode/uid/gid before emitting
  `apply_failed_safe_selective`. Compensation uncertainty emits
  `apply_compensation_failed` instead.
- Guarded rollback recognizes that exact recovery state: non-VAPID targets may
  already equal manifest originals, while VAPID targets must equal their applied
  checksums and pass canonical credential dataflow checks. It performs no unsafe
  credential restore and keeps the manifest reusable.
