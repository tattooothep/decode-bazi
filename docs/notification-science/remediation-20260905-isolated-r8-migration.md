# Remediation: actual isolated R8 migration evidence

Goal remains **ACTIVE**. This records one successful disposable PostgreSQL test,
not production migration, deployment, full installed-schema approval or a final
five-reviewer signature.

## Execution and exact authority

- Executed at `2026-09-05T05:15:49.657Z`–`2026-09-05T05:16:06.422Z`.
- Backend tool-checkout HEAD: `05b9ccff8ef3140e4314b5d0c725183b6260dca5`.
- New harness was not yet committed during execution; its reviewed SHA-256 was
  `974e29d545d4e0898d2f728e9fddac30c9ab6d9870de78e2102f9763fe50bab8`.
- Terminal process exit: **0**; marker `R8_ISOLATED_ORIGINAL_MIGRATION_OK`.
- Actual receipt:
  `/root/artifacts/hourkey-r8-isolated-migration-PXcbc4/original-migration-run-01.json`.
  Receipt SHA-256:
  `7733d0430aff56b4d14907f7ba37e88f4a9c5af111600e5d11fb5dc3fc33c5fe`
  (29,539 bytes).
- Independent pre-execution safety review:
  `/root/artifacts/hourkey-notification-backend-build-0bMXdy/isolated-migration-safety-review.md`,
  SHA-256 `4b5a714ee0ddd6fa56ba71dd5a7a9e95f7d5e8ba0fbb64ca1abf733edc9ec0e4`.
- Independent post-run receipt review:
  `/root/artifacts/hourkey-r8-isolated-migration-PXcbc4/actual-receipt-review.md`,
  SHA-256 `9fd791a8da746dda7899d89c3cb555f09e154c3d08c94a3c1abfb87fd97b5a10`.
  Its 61 read-only assertions checked source/runtime hashes, transcript/counts,
  fidelity and current image config; exact-ID listing corroborated cleanup.
  This reviewer did not rerun PostgreSQL or issue a final release signature.

The parent read the complete original harness and SQL and the new adapter,
reviewed the independent report, rechecked source hashes, and reran the 52
fake-only checks plus focused TypeScript checking before this actual run.
The fake suite is not the PostgreSQL evidence reported below.

## What actually passed

The unchanged original test's JavaScript assertions and SQL were executed
through a reviewed in-memory adapter. Only its unsafe original database/container
targeting was mapped to a new owned isolated cluster and random fixture database;
the original module was never imported with its production-targeting top level.

- PostgreSQL **16.13**, UTF8, `en_US.utf8` collation/ctype, UTC.
- Two successful executions of the exact forward migration; one successful
  execution of its exact rollback.
- All seven expected PostgreSQL rejections confirmed with psql exit 3 and the
  required SQLSTATE, rather than treating an arbitrary exception as success:
  subscription hard-off, producer hard-off, Qizheng schema zero, unapproved
  shadow cohort, duplicate primary endpoint, immutable update, immutable delete.
- 66 original SQL calls and two isolated-cluster setup/fidelity calls.
- Original create/drop lifecycle completed; no latched adapter failures.
- SQL transcript SHA-256:
  `363e4846dc7f71a83ad2dcc53e2a626c1603d6cfde8c1a815e23c55614dc67dc`.

Before this run, source review found and fixed a temporary-entrypoint readiness
race in the new test harness. A RED regression reproduced it. The final harness
requires exact final PID 1 `postgres` before readiness and every SQL call. The
actual run recorded two initialization waits and 69 final-process checks.

## Isolation and cleanup

The new container used the existing local image
`sha256:4e6e670bb069649261c9c18031f0aded7bb249a5b6664ddec29c013a89310d50`
with no pull, no network, no host ports/bind mounts, read-only root, UID/GID 70,
bounded tmpfs, one CPU and 512 MiB memory. Docker subprocesses received only the
fixed PATH and a private absent Docker config path; no HOME variable was assigned
or repurposed and no host credentials were inherited.

Owned container ID:
`50dde0f661352e365668676fea66f1469fb08250d88f6f2ac227da5659fdc304`.
The fixture database was dropped without FORCE; the container was stopped
gracefully and removed by its verified full ID without force. Receipt reports
`removed=true`, `runFailure=null`, `cleanupFailure=null`. A separate post-run
`docker ps --all --filter id=<exact-ID>` returned no container with exit 0.
Only disposable synthetic data was removed; the receipt is retained privately.

The existing production PostgreSQL container remained running with the same ID
and image. No production SQL/migration, service restart, provider send, APK
installation or deployment was performed by this execution.

## Deliberately unproven requirements

This preserves the original minimal fixture coverage; it is **not** proof of all
production schema/runtime behavior. Its token fixture omits `expo_push_token`
and `device_push_token`, so transferred-binding function execution is not tested.
Original privilege assertions query SELECT/INSERT/UPDATE/DELETE metadata as the
fixture superuser, not the complete actual runtime-role and installed preflight.
Those requirements remain open, as do observed native receipts, safe staged
rollout, external Expo authority/repair, explicit Qimen door-method authority,
physical notification receipt/detail opening and five final independent reviews.

The separate source-evidence tools committed as `05b9ccf` passed independent
review and 54 supplied tests, but validate source identity only. Their 25 actual
proof validators remain unimplemented and their approval flags remain false.
They use frozen application checkouts distinct from the tool checkout and do
not replace the installed migration preflight or authorize this newer tool HEAD
as an application release. Historical R8 evidence and gates remain unchanged.

No Qizheng source pack was marked verified and no astronomy/Qizheng provider
activation was enabled. Their future activation is not an additional requirement
for the current hard-off remediation; existing prohibitions remain intact.
