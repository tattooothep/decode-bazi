# Isolated PostgreSQL capability / Qimen retry integration review

Reviewer: `/root/qimen_cap4_review_0905b`, 2026-09-05.

## Status and scope

**PASS for this bounded integration review**, including the final stable-hash
run after the parent's V4 intrinsic-warning contract/fixture hardening:
26 checks, 14 fake provider calls, zero external fetch calls. All disposable
databases and roles were removed and verified absent. This report is not a
final goal signature or a production migration approval.

The new script is
`scripts/test-notification-capability-postgres-review.mts`. It runs real
`delivery.reserve` and the exported worker `runRetryBatch`, real SQL
transactions, immutable triggers, unique indexes, advisory locks and retry
leases. Only the provider sender and policy clock are injected. It does not
invoke an external calculation engine or make any provider/network request.

The Qimen arrangement fixtures are explicitly synthetic contract fixtures;
this test proves delivery/database behavior, not the astronomical or textual
accuracy of a live chart. Ziwei scope here is the capability-3 database domain,
not end-to-end Ziwei reservation/delivery.

## Isolation / safety

- Read all 705 lines of backend AGENTS.md and the local Next testing guide
  before adding the new test. No implementation files were changed.
- Every run generates a 96-bit random database/role suffix, verifies both names
  are absent, and refuses collisions. There is no initial DROP or PID-only name.
- Admin access through `docker exec decode-postgres psql -d postgres` is used
  only to create/check/drop the exact new database/role. Production tables and
  user records are neither read nor written. No production role is changed.
- The test pool explicitly connects to `127.0.0.1:5433`, the new database and
  its new restricted login. It ignores production PG environment defaults and
  verifies `current_database`, `current_user`, `NOSUPERUSER`, `NOCREATEDB` and
  `NOCREATEROLE`. Public CONNECT on the scratch database is revoked.
- Bootstrap reuses only the static table-definition substring from the older
  retry harness, not its executable `.env.local` loader or preemptive DROP.
  It adds the missing fixture `users.locale` column. Historical bootstrap
  migration grants are redirected solely from `hourkey_app` to the fresh test
  role; the two **new capability migration files are executed unchanged**.
- Runtime imports must not load `/root/qimen-api` or the Qimen cron. Global
  `fetch` is a tripwire. The real sender is never passed to the worker.
- Cleanup first closes the pool, verifies exact database ownership and role
  OID, then drops only those newly created targets without FORCE. A final
  catalog query verifies both names are absent. Test rows are disposable and
  can be recreated by rerunning; no user data was removed.

## Evidence covered

1. **Red → green migration behavior:** old constraints reject Qimen 4 and
   Ziwei 3 with PostgreSQL `23514`; applying the exact new migrations permits
   all 16 Qimen 1/2/3/4 × Ziwei 0/1/2/3 pairs.
2. **No migration row rewrite:** nine historical Qimen 1/2/3 × Ziwei 0/1/2
   rows, including enabled/disabled state, identity, token, locale, app version
   and timestamps, remain byte-equivalent as `row_to_json` before/after and
   after rerunning both migrations. Valid updates used for domain tests occur
   only after this preservation comparison.
3. **Domain rejection:** Qimen 0, negative/out-of-range known smallint values,
   unsupported future schemas and null are rejected; Ziwei 0 remains valid.
   This is PostgreSQL integer-domain coverage, not API coercion validation.
4. **Bounded DDL:** each exact migration is attempted while another scratch
   connection holds an ACCESS SHARE table lock. It fails with `55P03` at the
   migration's 1-second lock timeout (bounded 850–3500 ms assertion), rolls
   back, and leaves every original constraint definition unchanged. This is
   not a production traffic or lock-duration benchmark.
5. **Real V4 reservation and retries:** TH/EN/ZH × FCM/Expo envelopes use
   account locale despite a different token/prefs locale. Parent, attempt and
   occurrence link commit together. Actual immutable triggers reject attempts
   to change provider messages or occurrence snapshots. Stored envelopes stay
   under the existing 4000-byte guard and do not persist fixture credentials.
6. **Immutable localized replay:** each case receives one simulated retryable
   failure, then changes the account locale before retrying. The worker still
   passes the exact originally stored provider message to the fake sender.
   The accepted state is `provider_accepted`, `delivered_at` stays null and the
   report's delivered count stays zero.
7. **Upgrade/downgrade:** an immutable V3 reservation retries after capability
   3→4 without changing its V3 wire. V4 reservation on capability 3 rolls back
   without parent/attempt; V4 retry after downgrade dies with
   `policy_payload_schema_changed` before any fake send.
8. **Malformed retry:** missing payload, forged seasonal source, changed
   history copy and a removed scratch occurrence all fail before send with
   zero send count. Invalid modern data cannot fall back to generic legacy
   Qimen policy.
9. **Concurrency:** four actual concurrent reservations create one parent and
   one attempt. A different occurrence key cannot bypass the logical-hour
   unique index. Two retry workers invoke the fake sender exactly once.
10. **Intrinsic-warning hardening:** for a selected intrinsically inauspicious
    deity, independently remove its mandatory warning, substitute an unrelated
    warning, or claim `hour_clear_good`. Recompute the snapshot digest and
    rebind compact/source digest fields. The real reservation rejects each
    malformed snapshot atomically with no durable parent. Separately INSERT
    deliberately malformed legacy fixtures (without disabling immutable
    triggers), then invoke the real retry worker: all three become dead with
    `policy_attestation_changed`, zero send count and zero fake-provider calls.
    These legacy-seeded rows are test fixtures, not rows produced by the new
    reservation function.

The 14-line backend and 11-line mobile intrinsic guards were also inspected:
both act only on V4 and derive the expected warnings from canonical selected
hour component quality, not caller reason codes. Severe components reject;
the exact required intrinsic set must match. Month/day remain context only;
legacy V2/V3 code paths are unchanged. The database test exercises the backend
guard through real reservation/retry. This does not replace mobile renderer
regressions, engine-policy review or physical-device evidence.

## Executed commands and disposable targets

Run command from `/root/worktrees/hourkey-qizheng-r8`:

```sh
node --experimental-strip-types scripts/test-notification-capability-postgres-review.mts
```

PostgreSQL: 16.13 in existing `decode-postgres`; Node: v22.22.1.

| Run | Database / role suffix | Result | Cleanup |
| --- | --- | --- | --- |
| Initial | `d52961a9d3765fc6208e262c` | 21 checks, 14 fake sends, 0 fetch calls | Both absent, verified |
| Added DDL contention | `d1c506781629d8b69c366061` | 23 checks, 14 fake sends, 0 fetch calls | Both absent, verified |
| Unchanged suite after intrinsic hardening | `e84aba39b6716493980d6a9f` | 23 checks, 14 fake sends, 0 fetch calls | Both absent, verified |
| Added intrinsic reservation/retry cases | `2a4b86886dc688438d36e06c` | 26 checks, 14 fake sends, 0 fetch calls | Both absent, verified |
| Final start/end hash-guarded run | `41592546a911fbc45d54ca16` | 26 checks, 14 fake sends, 0 fetch calls | Both absent, verified |

Full names are `hk_notif_cap4_test_<suffix>` and
`hk_notif_cap4_role_<suffix>`. Cleanup was part of each successful exit-0 run.

## Source binding

The initial runs used backend HEAD
`9b2cfbf0d0f0ee149284bc6b0a3b7d68d5cb4349`. The later runs include the parent's
new intrinsic guard and corrected fixture. The final run computes these source
fingerprints before importing the implementation and compares them again after
all checks; none changed during that run. This binds the actual tested bytes
even while the parent and fixture author make separate selective commits.
After those commits completed, this reviewer verified the same core/fixture
hashes at backend HEAD `fc85afccb93b7436803b9cbe8524dd33496803ca` before
committing this report and test separately.

| File | SHA-256 |
| --- | --- |
| Qimen schema-4 migration | `7da2a7c11aae4b7d86fbe2879f66efd1f2e41ff43a7632e22a50f1d198aea8f1` |
| Ziwei schema-3 migration | `c37ff59e9135920ae3afe919868885235842bdb0e639bce9d0185f8cc3e784da` |
| `src/lib/mobile-notification-delivery.cjs` | `4dae5477a85c7e1f6c54019d72066c2719c259fb0996ddc66f8d60284e570822` |
| `src/lib/push-send.cjs` | `9cb77d1d86a4222c9769356746abfc3b03b94d313d8cd983cc6c231a4a92edbe` |
| `scripts/mobile-push-retry-worker.cjs` | `db9d115e6b34a2dc8571a99ba2abcf1c647ca0405fec3d0a0cf7fb2bf871e369` |
| `src/lib/qimen-three-layer-notification.cjs` | `25cfc642a9e4cac155c95895fe66d5dde9157007cdaf0ba1e033ac6511f93c92` |
| `src/lib/qimen-notification-presentation.cjs` | `760384118ce57db2168583db4e01a2b485a3a296480916f9b7a366204a08360e` |
| V3 fixture | `ef50dc0f0f5e206458a031cea17c17f71615d62e48ed013a65b215607cb2b73f` |
| V4 fixture | `bdf5cd6b4ad4611ba201928aea07710ae5330103c7908c14caae797e11ba201d` |
| New integration test | `81fc207dc7f6ac022cd31366e5d97ef7353900b6d08ce04416264ff3b6ff39f8` |

## Remaining release gates

Production schema/role/DB state was not certified or migrated. No source-policy
choice, Expo/EAS credential repair, real engine calculation, live provider
submission, APK build/install, phone receipt or detail opening was performed.
The bounded concurrency test is not evidence of 10,000-user capacity. Keep the
separate production migration/deployment/rollback gates and final independent
signatures; this evidence does not authorize bypassing any of them.
