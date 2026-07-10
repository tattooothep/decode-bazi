# Hourkey P0 operations runbook

## Source of truth

- Production releases are built only from a clean, pushed Git commit.
- `/root/releases/current` is the only systemd runtime path.
- Never build from `/root/decode-app` while its worktree is dirty.
- Tag every deployed commit as `rNNN-deploy-YYYYMMDD`.

## Required deploy gates

1. Git status clean and remote commit matches local HEAD.
2. Database backup restores successfully.
3. `npm run build` and focused tests pass.
4. Start the candidate on a spare port and run health/auth/entitlement probes.
5. Roll instances one at a time; verify health before continuing.

## Rollback

1. Resolve the previous release path and verify its health artifact.
2. Atomically repoint `/root/releases/current` with `ln -sfn`.
3. Restart one web instance and verify `/api/health`.
4. Restart the remaining instances only after the first is healthy.
5. Reload Nginx only when `nginx -t` passes.

Schema changes in P0 must be additive so an application rollback does not
require an immediate database rollback.
