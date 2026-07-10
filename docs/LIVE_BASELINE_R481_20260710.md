# Live Baseline r481

This branch preserves the source currently serving Hourkey production before
any mixed working-tree changes are recovered.

## Provenance

- Production release: `/root/releases/decode-app-r481-member-abc`
- Release build ID: `W7CxPw5uTNCE9AjF3amvK`
- Git base: `r480-deploy-20260709-affiliate`
- Recovery branch: `recovery/live-r481-baseline-20260710`
- Captured: 2026-07-10 (Asia/Bangkok)

The release was copied without `.env.local`, `.next`, `node_modules`, or
`tsconfig.tsbuildinfo`. Tracked development helper scripts that were absent
from the release were retained because they do not affect production runtime
and have not been proven safe to delete.

## Validation

- `npm ci`
- `npm run build` (140 routes)
- `npm run check:pair-oracle`
- `npm run check:pair-v2`
- `node --experimental-strip-types --import ./scripts/register-loader.mjs scripts/test-plan-matrix-e2e.mjs`
  (103 passed, 0 failed)

Database-mutating admin tests were intentionally not run against the live
database. No production release, nginx configuration, process, or database was
changed while creating this baseline.
