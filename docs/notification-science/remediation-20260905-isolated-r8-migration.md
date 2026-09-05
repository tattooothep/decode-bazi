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

## Later supplement: actual runtime login and transfer checks

The two original fixture gaps above now have a separate, bounded execution.
The existing harness adds explicit `--run-runtime` mode; original `--run`, pinned
migration SQL and historical receipt remain separate. This mode applies the
unchanged forward migration once, not another double-apply/rollback run.

- Harness SHA-256: `3cc6b9f94de9e41b653d8ccb2a2b2a6223dd2c830b583a9b614e85d5f2241533`.
- RED `353874` caught the previously ignored runtime-login argument; GREEN
  `c0be3e` passed 53 fake checks. Targeted TypeScript checking exited 0 (`3f27ec`).
- Independent `/root/cng_home_preservation` approved this exact slice for one
  disposable PostgreSQL attempt; its self-test and type checks also passed.
  This is not a final-goal signature.
- Actual session `1469` exited 0 (`aa7147`), at
  `2026-09-05T11:49:17.927Z`–`2026-09-05T11:49:30.578Z`, PostgreSQL 16.13.
- Receipt: `/root/artifacts/hourkey-r8-runtime-aaKbBi/runtime-checks-01.private.json`,
  13,282 bytes, SHA-256
  `8b679db20bdc5e4c5e570a323f8b23e08ca33cc40bf80fb7680bee931db64c81`.

Nine actual psql sessions logged in as `hourkey_app`, not `SET ROLE` under an
administrator session. The test checked `current_user=session_user`, six
readable R8 tables, 24 real mutation attempts rejected specifically for
insufficient privilege, remaining broad mutation grants, PUBLIC restrictions
and the five scoped functions' SECURITY DEFINER/search_path/EXECUTE metadata.
Eight transfer fixtures covered Expo, installation and native-token matching
for primary and secondary endpoints, plus same-binding and no-match cases.
Unrelated chain/occurrence snapshots and every token row were compared exactly.

The original SQL deliberately deletes a selected transferred primary chain
and cascades its own occurrences. Secondary-endpoint transfer preserves the
chain/history. The tests confirm this distinction; they do **not** claim that
all history survives a primary transfer, or establish a new production defect.

There were 47 SQL calls and 48 final-PID-1 checks. The owned container was
gracefully stopped and removed without force. Parent read-only check `8df269`
confirmed that exact test container absent and the production PostgreSQL
container still running with its unchanged ID. Only disposable fixture data
was removed; source, logs and receipts remain. No production SQL was executed.

At that checkpoint, still unproven: the installed production catalog fingerprint, complete legacy
Ziwei preflight, actual execution of the other four scoped R8 functions, API
authentication, rollout, provider repair, phone receipt and five final reviews.

## Later supplement: all five scoped functions under the runtime login

The same runtime mode now covers the four remaining scoped functions, without
changing migration SQL, the original mode, container isolation or cleanup rules.
Both `/root/isolated_migration_safety_review` and `/root/cng_home_preservation`
independently approved one attempt at harness SHA-256
`6a14835b203b952374a763a623388460c56a6abd1bc699bb86f6690ff2136211`.
The 53 existing fake guard checks (`2b34d8`) and targeted TypeScript/diff checks
(`080532`) passed; those checks do not execute the new SQL fixtures.

Actual session `56268` exited 0 (`e8fb93`), at
`2026-09-05T12:39:32.131Z`–`2026-09-05T12:40:08.326Z`.
Receipt: `/root/artifacts/hourkey-r8-runtime-full-O0Ag4Z/runtime-checks-01.private.json`,
30,147 bytes, SHA-256
`cabbed95bbcea837541310f7fd1d63a6ca797fe837b962c078e0d4ebe94652ef`.
Execution HEAD was `a110da7ca428399a1cd1081521c3847b312089ca`; the then-uncommitted
test supplement is identified by its exact source hash, not attributed to HEAD.
Root rehashed all seven recorded authority files after execution; all matched.

The run made 147 SQL calls, including 31 genuine `hourkey_app` logins, with 148
final-PID checks and one initialization wait. Besides the previous eight transfer
cases and 24 denied mutations, actual execution verified:

- Rebind rejects wrong user, installation, audience and disabled token with
  SQLSTATE 23514; valid replacement updates only the selected Astronomy binding,
  and repeat keeps its chain revision stable. Qizheng and other bindings survive.
- Mark-shadow updates only the matching Astronomy producer. Wrong digest or
  incomplete evidence makes no change; negative count raises 23514.
- Record-shadow checks missing/ineligible chains, account status, cohort,
  consent, token, endpoint revision and model digest; eligible input is stored
  exactly and duplicate input does not rewrite history.
- Revoke respects installation/user scope and preserves occurrences. Rollback
  chain rows survive, but their selected endpoints are deleted. Repeated revoke
  advances non-rollback revisions; no idempotent-revision guarantee is claimed.

The added 22 runtime calls are rebind 6, mark-shadow 4, record-shadow 10 and
revoke 2. Revoke's four receipt labels describe coverage, not four invocations.
Independent `/root/v234_delivery_artifact_review` verified the receipt, all source
hashes and counts, and unchanged older receipts (`fc07ee`); this is a bounded
retained-evidence PASS, not a final release signature.

Owned container `ca60e128808d85712c2216a814134facfb6a44d934492fe637ebe0665b6a4541`
was gracefully stopped and removed without force. Root separately confirmed it
absent and production PostgreSQL still running with the unchanged exact ID.
Only the disposable fixture was removed; this execution did not query production.

A separate read-only installed-runtime check (`4d6ee1`) used the actual
`hourkey_app` login with default read-only transactions and bounded timeouts.
Legacy Ziwei permission/integrity checks passed; the R8 relations were not all
installed. No catalog/source expected digest was supplied, so this is not full
installed R8 approval. False R8 proof defaults on absent tables do not establish
that R8 sending is enabled or that its hard-off constraint failed.

Still unproven: installed R8 catalog equivalence, API authentication/concurrency,
safe rollout, provider repair, physical receipt/detail opening and five final
reviews. Scoped storage tests do not recompute astronomy, hashes or rollout
epochs, and do not authorize shadow/provider activation.
