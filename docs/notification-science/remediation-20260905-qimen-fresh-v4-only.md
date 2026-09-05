# Fresh Qimen requires corrected V4 — 2026-09-05

Status: source correction and bounded verification, not deployment, phone proof, Expo repair, or a final goal signature. Base backend commit: `c51d5ea0517566677d83984863858b0cbc7a1be9`.

## Verified root cause and compatibility

The scheduler previously admitted capability3/4 and passed the capability through to a fresh canonical builder. With schema3, both the advisory and full hour grid still used the cached `wang_xiang_status` order. This was new legacy-science production, not only frozen-history support.

Independent reviewer `/root/v234_delivery_artifact_review` executed a pure synthetic counterexample: a complete nine-star fixture with 天任/生門 at SE, score67, in 甲午 was recommended as 相 by V3; the corrected V4 star state is 廢 and the builder returns no recommendation. This proves a logic defect, not that this fabricated chart was sent to a user.

The known V233 parser at `dcbbeabfaf442ed52cd1abdd0de92a77bf3db27a` rejects rehashed V3 snapshots containing 廢, seasonal provenance, or the truthful new hour version. Every corrected month map contains a 廢 element and the full grid contains all nine stars. Retaining wrong unselected strengths, substituting 死, or relabeling V4 as V3 cannot satisfy the complete-grid requirement.

Independent compatibility report: `/root/artifacts/hourkey-v234-notification-build-46H3ru/qimen-v3-gap-disposition.md`, SHA-256 `3558cba6913addfb0cd3d6abc25bcef098613029f760a190a160332822a3f357`. The known source does not prove which APK is installed on the actual phone.

## Bounded runtime change

Only `scripts/mobile-qimen-push-cron.cjs` changes production behavior: eight added lines inside `!snapshot`, after `loadRecoverableOccurrence`, return `payload_upgrade_required` for capability3 before engine calculation, new occurrence admission, or delivery reservation.

- Capability3/4 enrollment and historical recovery remain intact; no capability is fabricated.
- Existing claimed V3 can recover byte-for-byte for capability3 or4; frozen validators and durable V2/V3 retry behavior are unchanged.
- Capability4 fresh creation still needs an explicitly chosen valid door method and the existing canonical source, score, intrinsic, warning, owner, and time-window gates.
- `finishClaim` only updates due/skip/lease metadata. No token disablement, user preference/consent/history rewrite, or other-science producer change is introduced.
- The existing legacy builder remains available for history-fixture reproduction; source search found only this scheduler as its production caller and only this scheduler as the occurrence INSERT producer.

Scheduler source SHA-256: `ba74abbbd8a030123a278802450a1653c39ad95022c798863d32bfe390f5bd3f`.

## Regression evidence

Before the runtime patch, the new old-client case failed with actual `no_recommendable_direction` versus required `payload_upgrade_required`. After the patch, it passes with zero build, admission, or delivery calls; configured and unconfigured door-method cases both pass. Valid historical V3 recovery still passes for both capability3/4 without rebuilding or changing provider bytes.

Fresh parent runs passed:

| Check | Evidence |
| --- | --- |
| Seasonal scheduler | New V3 guard; distinct persisted reason; next due retained; V4 creation/method; legacy recovery; downgrade; memo |
| Seasonal root review | 72 term-boundary cases; real INSERT-conflict SQL harness; owner and legacy recovery fences; old-client rejection before INSERT |
| General scheduler | Complete existing suite; grace/stabilization, network retry, duplicate, contract rejection, immutable V3 recovery, abort and500-claim cleanup |
| Seasonal occurrence builder | Actual V4 construction from controlled raw fixture; canonical month; all9states; no source mutation; score59 rejected; source/boundary failures |
| Durable Qimen | 24 locale/provider/privacy reservation cases; V2/V3 compatibility; V4 source/copy/version/owner and retry checks |
| Zibai history projection | Stored history projected without recomputation or upconversion |
| Ziwei V3 wire | 27 snapshots,243 locale cases, actual backend/mobile codec and parser parity; nine synthetic legacy-copy stress rejections retained |
| TypeScript | `tsc --noEmit`, exit0 |

Pure checks ran with `unshare --net`; Ziwei and Zibai used the installed `tsx` loader. This is not whole-system device proof or a fresh exhaustive backend suite.

The general scheduler test keeps all eight original historical cohort calculations. Those calls are now bounded to POST `http://127.0.0.1:4090/api/qimen/calculate`, exact headers and original timestamps/body, `skip_save:true`, one call per instant,8s timeout, redirects rejected, and response `data.run_id:null`. Read-only SQLite matching saved-row counts were0 before and0 after. No push provider or real PostgreSQL call occurred. Its current-production retry/abort cases now use separate valid synthetic V4 snapshots with an explicit test-only door choice; the original V3 history fixture is unchanged. The abort case injects an unused engine fetch boundary so it does not start external engine workers.

## Backend build environment evidence

The pre-patch backend source `c51d5ea...` completed `next build --webpack`, exit0, at `2026-09-05T03:46:39.394Z`: compile, TypeScript,150 static pages, and traces completed. Evidence directory: `/root/artifacts/hourkey-notification-backend-build-bDyP3q`; log SHA-256 `e88a18258d2a37c7ec6ad2b9bece978193ff2ea2feafd5e55acf2fd45b8c4d2d`; result SHA-256 `af3effff83e826a6124084393bc5c395256f83696de18325483288cbe8208b71`.

Earlier attempts failed from isolated-network Google Font DNS and then missing build-time AUTH_SECRET. The successful child used sanitized build-only auth/mail placeholders and nonfunctional PG/Redis loopback port9, verified unused. No production secret, auth code, env file, database, or service was changed. The old failed attempts were terminal before a new attempt started. This build predates the eight-line scheduler fix and is not claimed as the final release artifact.

## Required live rollout checks

1. Obtain the explicit door-method choice; no default has been selected for production.
2. Complete safe additive backend/schema prerequisites, including the separate R8 foundations needed by registration. Preserve Qizheng hard-off and its outstanding source approvals.
3. Communicate and verify the compatible APK update. Old clients remain registered but cannot receive new corrected Qimen until they honestly register capability4; do not alter stored capability on their behalf.
4. At cutover, inspect active scheduler release/process identity and producer-state commit. No old concurrent producer may continue creating new V3. Choose a bounded cutover after any old run finishes and verify no still-admissible unsent legacy occurrence is carried into the corrected release; retain history and let expired attempts follow their existing terminal policy. Do not bulk-delete or rewrite history to meet this check.
5. Bind the final committed runtime and migrations to a fresh build/release. Do not deploy the pre-patch build as evidence of the new guard. Do not revert to defective fresh-V3 behavior or demote registered capabilities as a rollback shortcut.
6. Repair Expo with authenticated project authority; verify actual registered-phone receipt and detail opening. Provider acceptance is not physical receipt.
7. Obtain all five independent final signatures across the full goal, not only this scheduler slice.

No migration, rollout, service restart, APK distribution/install, preference mutation, or real push send occurred in this change.
