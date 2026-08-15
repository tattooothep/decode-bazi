# Legacy Qimen Push Containment Runbook

This runbook contains only source-controlled commands and placeholders. It does
not authorize a production change. Do not run apply, reload a service, alter a
cron, rotate a credential, or send a push until the exact reviewed inventory and
three independent `APPROVE` records have passed the source gate.

## Scope and safety boundary

- Keep Qimen calculation routes available. Contain only legacy browser-push
  routes `/push/test` and `/push/unsubscribe`, the legacy Qimen push cron, and
  source-held VAPID private material.
- The tool is an audit by default and fails closed. It reads a supplied,
  reviewed deployment snapshot; it never probes an HTTP endpoint because an
  unauthenticated test route might send a real push.
- Audit/apply/rollback output contains result codes only; never print, paste, or
  attach environment files, private keys, tokens, user identifiers, emails, or
  notification bodies to a ticket or evidence log.

## Prepare an exact inventory

On an approved, read-only copy of the legacy service configuration, create an
inventory JSON with:

- absolute `root` equal to the audited service directory;
- exact, relative regular-file paths for proxy route config, legacy route source,
  legacy cron config, and environment-key declarations;
- the three required VAPID environment key names;
- for an apply, each exact target file checksum and a single reviewed textual
  replacement.

The tool rejects path traversal, any symlink/non-directory component, realpath
escape, missing files, unexpected checksums, missing VAPID environment
declarations, non-denied legacy routes, enabled legacy cron entries, and literal
VAPID private key material. Target paths are rechecked immediately around writes.
The replacements must make the post-change audit pass before any file is written.

For a source file that configures Web Push, the reviewed replacement must use
only this canonical environment-only binding/dataflow (with no aliases,
fallbacks, optional access, computed access, literals, templates, calls, or
defaults):

```js
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT;
webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
```

## Audit (default, read-only)

Run from the backend repository against an approved configuration snapshot:

```bash
node scripts/ops/contain-legacy-qimen-push.mjs \
  --root /exact/qimen-api-snapshot \
  --inventory /exact/reviewed/legacy-qimen-inventory.json
```

Expected success output is `LEGACY_QIMEN_CONTAINMENT_AUDIT_OK`. Any other result
is a stop condition. Resolve the reviewed configuration or inventory; do not
silence the check and do not inspect or print secret values.

## Source-gated apply (not authorized by this change)

Before applying, obtain exactly three distinct reviewer lines in a protected
approval file, each formatted `<reviewer-id> APPROVE`. Confirm separately that
the replacement removes the legacy route implementations, leaves explicit proxy
denials, disables the legacy cron, and changes VAPID use to environment/secret
manager references only. Provision and rotate the actual VAPID credential in the
approved secret manager first; this repository tool never receives the value.

The operator must use a new, nonexistent, access-restricted backup-directory
path (its parent must already exist) and the exact reviewed inventory. Apply
creates that directory exclusively; it refuses every pre-existing path so an
older backup can never be clobbered:

```bash
node scripts/ops/contain-legacy-qimen-push.mjs --apply \
  --confirm=DISABLE_LEGACY_QIMEN_PUSH \
  --root /exact/qimen-api-snapshot \
  --inventory /exact/reviewed/legacy-qimen-inventory.json \
  --approvals /exact/protected/source-approvals.txt \
  --backup-dir /exact/protected/legacy-qimen-backup
```

Apply stores checksummed, mode-0600 backups and writes each reviewed target via
atomic rename. Manifest version 2 records a non-secret `rollbackPolicy` for each
target: `restore_original` for a non-VAPID target or `retain_applied` whenever
either the original backup or applied target contains a VAPID binding or
`setVapidDetails` call. The rollback path never writes a VAPID-bearing backup,
even when that backup appears canonical. It captures and
preserves each target's exact Unix permission mode, uid, and gid through apply
and rollback, then verifies those fields after
each rename; the backup manifest records the original metadata. Target mtime and
ctime are intentionally not contractual because an atomic replacement creates a
new file. It validates every target checksum before writing, validates the
candidate configuration before writing, and restores already-written files if a
post-write validation fails. A process interruption still requires the rollback
procedure below; do not reload a service before the post-apply audit succeeds.

After backups are written, apply re-resolves and rereads **every** target and
compares its approved-before bytes, checksum, device, inode, mode, size, and
timestamps before any replacement begins. It repeats that check immediately
before every target write. This prevents ordinary concurrent edits from being
overwritten or causing a partial operation. As with any path-based filesystem
tool, a privileged actor that can race directory renames in the tiny interval
between the final OS checks and rename remains outside this tool's guarantee;
operators must keep configuration management paused and maintain exclusive host
access for the short apply window.

## Post-apply audit and service change

Re-run the audit command against the changed snapshot. Only after it succeeds,
the three approvals explicitly cover the exact service operation, and the
separate release gate authorizes it, may an operator perform the reviewed
service/cron change outside this tool. Record only command exit status and the
reviewed file checksums—not secret values or request data.

## Rollback

Rollback is an explicit recovery operation. It first requires the whole current
inventory to pass the contained-state audit, then verifies every current target
checksum against the apply manifest before changing any file. It atomically
restores only manifest files whose machine-derived policy is
`restore_original`. A checksum-valid VAPID-bearing backup is never restored: the
target stays at its verified contained, environment-only bytes under
`retain_applied`. The policy is recomputed from the original backup and applied
target before any write. Version 1 manifests receive the same dynamic decision,
so an older manifest cannot bypass this rule.

```bash
node scripts/ops/contain-legacy-qimen-push.mjs --rollback \
  --confirm=ROLLBACK_LEGACY_QIMEN_PUSH \
  --root /exact/qimen-api-snapshot \
  --inventory /exact/reviewed/legacy-qimen-inventory.json \
  --backup-dir /exact/protected/legacy-qimen-backup
```

`LEGACY_QIMEN_CONTAINMENT_ROLLBACK_OK` means every original was safe to restore.
`LEGACY_QIMEN_CONTAINMENT_ROLLBACK_SAFE_SELECTIVE_OK` means at least one unsafe
VAPID-bearing original was deliberately retained in its contained form. Neither
result authorizes a service reload; review the selective result and re-audit the
intended runtime configuration first.

Rollback is compensating across the complete manifest. If a later target write
fails, every earlier restored target is atomically returned to its exact
pre-rollback bytes, mode, uid, and gid. The unchanged manifest remains reusable.
`LEGACY_QIMEN_CONTAINMENT_FAILED:rollback_failed_compensated` confirms that all
manifest targets match their captured contained state after compensation; fix
the external cause and retry with the same reviewed manifest. A
`rollback_compensation_failed` result is a stop condition: do not reload any
service or cron, preserve host exclusivity, and perform a read-only audit and
incident review. The tool never logs file contents or secret values.

Do not manually restore an exposed VAPID private key. If a credential was
rotated, keep the new secret-manager reference. Re-audit after rollback and
retain the backup manifest for the incident record without copying file
contents into logs.
