# Current remediation release handoff — 5 September 2026

The full notification-remediation goal remains **ACTIVE**. This document is a
current evidence handoff, not a release policy, approval, or substitute gate.

## Verified boundaries

- Mobile checkpoint `b610fb6f21054ea0aa587f5ee42ce41dfc4a2953` completed the
  unchanged 311-command source suite. Actual execution session `86250` exited 0;
  the independent retained-evidence review is
  `/root/artifacts/hourkey-full-source-observed-V8zBSC/full-source-review.private.md`,
  SHA-256 `5187f133e96e62ffaa4ef15796da8e10fb264d3f0c19a6e7e5b8e3be26650d9f`.
  Before/after source, golden-source and input manifests match. This standalone
  diagnostic explicitly lacks a continuous mutation journal and native chain.
- From the retained APK's source `6f5fb40fd022a702a5e2a17e2934c6c2f12d3cde`
  to b610, the delta is nine build/test/tooling files and one evidence document;
  app code, native project, lockfile and command manifest did not change.
  This does not reattribute the old APK to b610 or prove a new build.
- The existing source-only evidence verifier passed all 54 checks again
  (parent execution session `19920`, terminal output `d718a6`). Its policy,
  existing consumer and historical final gate remain unchanged. All existing
  release-authority flags remain false.
- Production still resolves to
  `/root/releases/decode-app-r573-network-morning-final` at this check.
  No deployment, migration, credential repair or provider test was performed
  during this handoff work.

## Completed all-platform export comparison

Two different new detached checkouts of mobile b610 completed fresh offline
`npm ci --ignore-scripts --include=dev` and Android/iOS/web export. Existing
worktree dependencies were not replaced; the shared npm cache was read-only.
HOME was preserved with private storage and network/PID isolation. The later
preparation review clarified the older mapping's generic fresh-install
restriction: installation into a new owned checkout is distinct from replacing
dependencies in an existing worktree. That replacement remains prohibited.

- First artifact: `/root/artifacts/hourkey-all-platform-export-ulPjKX`.
  Actual parent session `2135` exited 0 (`8a2705`); namespace execution was
  09:04:33.394Z–09:07:23.996Z. Parent result SHA-256:
  `095c7a2eb92ce1d340cff3fcb8d325c60499379304fb76f1f7c71e9a98ca4d02`.
  Independent `measurement-review.private.md` SHA-256:
  `a9837bdcb9a8388a671366a8473ac6eff8c595de75754731e495caa6ca54b264`.
- Second artifact: `/root/artifacts/hourkey-all-platform-export-compare-rVBN7C`.
  Actual parent session `48629` exited 0 (`303070`); namespace execution was
  09:15:23.657Z–09:18:00.311Z. Parent result SHA-256:
  `9a8b5a31b493566d2fb112bdb85643e3fdba591d1098974283cfe04ed6145db6`.
  The first child receipt and expected digest were pinned before this run;
  first-run dependencies, output and disassemblies were not used to build it.
  Independent `export-comparison-review.private.md` by
  `/root/v234_delivery_artifact_review`, SHA-256:
  `9fab30fe0ad811525d61b4725b042da058f7322a02ef9b57d377890e71c42f67`.

Both runs preserve the original 255-file/two-HBC/web/metadata checks and the
single ephemeral Hermes-input-path normalization. Their semantic digest is
`98cb3368dab2d1ff610c4b662258aa3d9429aeaea683324515bfbc48df20662f`.
Each run's retained source/dependency/tool/output before/after pairs match.
The second result verifies the bounded semantic export comparison only;
`nativeBuildVerified`, full `reproductionVerified` and `releaseReady` remain
false. The independent reviewer rehashed the actual second output and
recomputed the unchanged comparator successfully. This completes the bounded
all-platform export comparison, not a final release signature; no further
export is needed merely to repeat that same proof.

The missing `android.googleServicesFile` export warning is retained. Inspection
of the exact installed Expo code places its mutation after serialized bundles;
the current SPA output does not consume it and the EAS project ID is unchanged.
This is not proof of native Firebase resources, APK Constants, credentials,
registration or physical notification receipt. No native config was mounted
merely to remove the warning. No new APK was built or deployed in these runs.

## Reuse substantive gates; do not create 25 new frameworks

Independent mapping:
`/root/artifacts/hourkey-full-source-observed-V8zBSC/mobile-original-gate-mapping.private.md`,
SHA-256 `2b40bdef8633221585228b82e54aa478da881933060e7bc0224f3918501de7c0`.

The historical executable gate pins v233, 301 commands, receipt v1, sandbox v2
and the previous source/artifact/review identities. It also performs destructive
dependency replacement and repurposes HOME. **Do not execute or silently edit
it to approve this candidate.** Its substantive requirements still apply.

The next integration should be one independently reviewed current-version
adapter reusing the existing checks and pinned producer, not 25 new validators
to match the later source-only policy's bookkeeping entries. That policy stays
fail-closed; the adapter must not manufacture release authority.

Mobile evidence sequence (completed stages are labelled):

1. **Completed APK/export stage:** the current adapter below binds the
   independently reviewed all-platform export comparison. Do not substitute
   CNG parity, an Android-only export, or rerun exports merely for paperwork.
2. One observed source-to-native run, including the producer's own complete
   source phase, fresh IL2CPP/APK and every actionable Gradle task executed.
   Do not splice in the standalone diagnostic source run.
3. Original APK unsigned-content/size reproduction, actual signature/package/
   ABI inspection, and the normal wrapper's existing sourcemap, packaged
   bundle, permissions, FCM channel and protected V194 postgates.
4. Current source/input and shared sparse-owner preservation. Reuse the
   existing bounded checks; no second normal build is needed merely to run
   its read-only APK postgates.

A new standalone v2 receipt reader now passes 62 synthetic cases and targeted
syntax/type checks in parent execution `50376`. Its bounded implementation
review is approved in
`/root/artifacts/hourkey-r8-isolated-migration-PXcbc4/observed-mobile-chain-contract-review.md`,
SHA-256 `43f489037df90ace7f9d38d6476efce89879e93b03a9c8cd8b8e250d14ae9166`.
This is not a final release signature. It checks retained bytes and selected
crosslinks only. Its `validationScope` and
`RECORDED_SANDBOX_POLICY_EQUIVALENCE` missing-proof entry explicitly leave full
mount/overlay policy equivalence unverified. Self-consistent receipts,
expected hashes and synthetic PASS fixtures do not establish actual execution,
cryptographic verification, watcher continuity or release readiness. Neither
this reader nor its tests are connected to the unchanged release gate.

## Current APK/export acceptance stage

`scripts/verify-remediation-mobile-apk.mts` now adapts the original unsigned
APK comparator and existing read-only output checks to the independently
selected V234 baseline. It binds the two completed export receipts and their
independent review, without rebuilding exports or changing the old release
gate/policy. The retained baseline is 165,371,940 bytes, signed SHA-256
`7d4f11b5c78d952c0f246f2f52047a8c5c896fa737044d84494808d48e7f802e`,
unsigned-content SHA-256
`d94528b7e630b7e2341fea1de64e9faee6007748a5fc1be439f948e312a098ce`.
Its independently measured baseline receipt is
`/root/artifacts/hourkey-v234-notification-build-46H3ru/v234-native-comparison-baseline.private.json`,
SHA-256 `10a6b5f6da130733fa0833041e8e23984c69ae4ab1bd120ac2793c867bb77dfc`.
These identities were selected before any new observed native run.

The adapter's 16 targeted tests passed (`9c9a81`), including exact historical
helper preservation and rejection of version, signer, ABI, permission and
channel mismatches. Git checks disable optional locks, fsmonitor, external
configuration and network access; child environments preserve HOME exactly
without inheriting credentials or preloads. A real read-only invocation of
the final code on the retained V234 APK and existing generated sourcemap/bundle
exited 0 (session `40999`, `b77ede`), with the actual mobile index identity,
timestamps and hash unchanged before/after.
That invocation ran signature/package/ABI/permission/channel inspections,
the existing 12-source gate, all 410 first-party source-content comparisons,
packaged Hermes equality and the existing protected V194 postgate.
This is an operational check of the new adapter on **retained** bytes, not a
fresh b610 build or native reproduction. It explicitly returns
`nativeExecutionVerified: false` and `releaseReady: false`; the observed
source-to-native execution, preservation and final release review remain open.

An independent read-only task-count review by `/root/v234_delivery_artifact_review`
found 23 cleanup tasks in
`/root/artifacts/hourkey-v234-notification-build-46H3ru/build.log`:
16 `clean` plus seven `externalNativeBuildClean*` tasks (parent also checked the
actual task rows in `d736ac`).
The observed producer omits `clean` but retains the same three build targets
and rerun/no-build-cache flags. Do not infer a current count by subtracting
only 16, and do not copy 652/659/675 as a verified current count. A future
observed run must still show every actionable task executed, with its actual
complete successful terminal summary inspected and the count recorded.

## External boundaries and the full goal

The user subsequently approved the exact 12 inventoried cleanup targets.
Cleanup session `11379` exited 0 (`1fe72f`); all 12 targets were absent and
free space reached 7,412,244,480 bytes (`9e9dea`). This permanently removed
the selected generated caches, the two export checkouts' dependency instances
and export temporary directories, not their retained source, output or receipts.
The main mobile dependencies and retained APKs were preserved. Details:
`/root/artifacts/hourkey-all-platform-export-ulPjKX/approved-cleanup-completed.private.md`.

One new observed native attempt then ran in
`/root/artifacts/hourkey-v234-native-4fksRi/observed`, using the unchanged b610
producer and the verified existing internal-upgrade certificate (no key rotation).
Its own full source phase passed all 311 commands (`e09e10`), then Android
compilation started. This was a real attempt, **not a completed APK**.
At `2026-09-05T11:20:58.054Z`, the observed child failed after the outer monitor
latched its 2 GiB low-space floor and stopped only the owned child PID namespace.
Actual session `32826` terminated with exit 1 (`3c009f`), parent exit 1,
minimum sampled free space 2,139,222,016 bytes and zero remaining owned mounts.
The parent was not killed. Its failure receipt and source/native logs remain.
No successful native receipt, new APK, deploy or phone-delivery proof is claimed.

Post-run read-only checks (`9069e0`, corrected command format `3887f3`) found
mobile b610 and backend 0dc6bc1 clean and production still at r573. The shared
owner's HEAD, actual index bytes/identity/timestamps, and `git ls-files -v -z`
hash match the actual pre-build seal. A first diagnostic used the non-NUL
`ls-files -v` format; that different hash was a measurement-format mismatch,
not an index mutation. Do not restore any owner files or index from old pins.

The failed attempt now retains approximately 5.85 GB of generated cache,
Unity build view and dependency-overlay output. No additional cleanup or
automatic retry has been performed. Before another attempt, obtain a measured
storage solution and preserve failure evidence; do not lower the safety floor
or silently delete further worktree dependencies to force a build.

Expo project credential repair is a separate authority boundary; it is **not**
a prerequisite to compiling an otherwise authorized offline internal APK.
The operator connection choice remains pending; the original cleanup choice
was resolved, but the failed native attempt needs a new storage decision.
Do not export signing/service keys or delete registrations to bypass them.

While native storage is pending, the missing isolated R8 runtime-login and
transferred-binding checks completed successfully in actual session `1469`
(`aa7147`). The unchanged migration, genuine restricted login, 24 denied
mutations and eight transfer cases passed in a disposable cluster, now removed.
See the later supplement in `remediation-20260905-isolated-r8-migration.md` for
the exact receipt and selective history-cascade semantics. This does not replace
the still-required installed catalog/runtime preflight or authorize deployment.

Explicit Qimen door-method selection, compatible schema/backend rollout and
rollback, Expo repair, physical receipt/detail opening, and five independent
final reviews remain open. Preserve the month-based nine-star correction,
separate door traditions, readable nine-locale Ziwei Type C, Zibai leap-seam
correction, immutable history, existing profiles and all unaffected lanes.
Qizheng predictions and separately unapproved activation remain off; optional
pending source packs are not a new condition for this hard-off remediation.

## Subsequent cleanup, scoped-runtime proof and native retry

The user authorized the five additional targets previously listed. Read-only
check `7b9d80` found no active references across 16 mount namespaces. Cleanup
session `89703` exited 0 (`f536ce`), permanently removing only the failed run's
cache, Unity build output and dependency overlay, plus old r521 dependencies
and v216 intermediates. Free space reached 11,291,025,408 bytes; observed recovery
was 9,191,952,384 bytes. Main mobile dependencies, internal keystore, retained
APK, parent logs and failure receipt retained exact identities/timestamps, and
production still resolved to r573. Details:
`/root/artifacts/hourkey-v234-native-4fksRi/approved-additional-cleanup.private.md`.
This resolves that storage authorization, not native reproduction or release
approval. Old dependency instances were permanently deleted, not recoverable by
undo; regenerated dependencies are new instances.

A later expanded runtime attempt passed: session `56268`, exit 0 (`e8fb93`),
receipt SHA-256 `cabbed95bbcea837541310f7fd1d63a6ca797fe837b962c078e0d4ebe94652ef`.
It executed all five scoped functions through genuine runtime logins, including
rebind, revoke, record-shadow and mark-shadow, on synthetic isolated fixtures.
The owned container was removed and production remained unchanged. See the
migration-evidence document for the exact coverage, counts and exclusions.
Separate read-only installed-runtime check `4d6ee1` passed legacy Ziwei privilege
and integrity checks but found R8 relations not all installed. This is not the
complete installed-schema preflight and does not permit deployment.

A new native attempt started in actual session `40880` (`9cac4a`), parent PID
`3589909`, artifact `/root/artifacts/hourkey-v234-native-retry-wrGQVO`, with
11,290,337,280 bytes free. Launcher SHA-256:
`4a0c1f39d012e4ea19ab13625bb02c931b73f2c931c574dcfaa893948ec386c2`.
Independent `/root/cng_home_preservation` approved one attempt: the only changes
from the previous reviewed launcher were the fresh destination and two prelaunch
floors raised from 7 to 10 GB. The b610 producer, existing internal signer and
pidfd helper remain pinned; the 2 GiB low-space floor is unchanged. The 45-minute
limit requests an owned-child stop, not guaranteed parent termination.
The fresh shared-owner preseal is retained in `shared-owner-before.private.json`.
At this checkpoint the attempt was running, with no successful terminal result,
new accepted APK or deploy. Poll the actual session; do not restart based on a
stale state file. Free space is not a guarantee that compilation will fit.

## Native retry terminal result and build-fidelity diagnosis

The preceding running checkpoint is superseded. Actual session `40880` is
terminal (`7ce772`): producer exit 0 with no signal, but **outer launcher exit 1**,
`abortRequested: true`, reason `low-space`, minimum free space 2,115,960,832
bytes, and zero remaining owned mounts. This is 31,522,816 bytes below the
unchanged 2 GiB floor. No first-latch timestamp or durable stop-attempt ledger
was retained; absence of a stop message does not prove no request was dispatched.
Do not retroactively accept this run or infer that every descendant was unsignalled.

The actual producer completed its source phase (311 commands), native build
(`BUILD SUCCESSFUL in 7m 35s`, **652 actionable tasks: 652 executed**), postflight
checks and receipt publication. Parent stdout reported
`OBSERVED_INTERNAL_PREVIEW_RECEIPT_OK`. These are completed inner stages, not
an overall resource-safe or release-accepted run. Retained under the retry's
`observed/` directory:

- Child result: 2,426 bytes, SHA-256
  `13eac98e0e1dbdc4e910e49ab44a0ccb53deee2121e5e0e4dcdf09d254a3e0af`;
  native times `2026-09-05T12:50:47.933Z`–`2026-09-05T12:58:24.065Z`.
- Source result: 608 bytes, SHA-256
  `0e310808fad6b2308a2212a7dc15d7300c0bf1709959ec7a632e0c4deb981b1b`.
- Private producer receipt: 35,631 bytes, SHA-256
  `97230e70c799d02aae1ae54adfa03ad0492e4d12aa80b011b4166b99a27990e1`.
- Actual APK: **165,372,404 bytes**, signed SHA-256
  `76d66607f944de8e187e6533a5fa1b2b1c7d125614f6a6203b9c928e4382551f`,
  unsigned-content SHA-256
  `237b6ae7315a109873cfccdc9a88f9c514c18835654e222fbb0363ef8fbbd286`.

The unchanged current APK adapter **failed** (`60bf8a`, exit 1): this candidate
is 464 bytes larger than the preselected reference, with different unsigned
content. It did not pass the remaining APK postgates. Both APKs contain the
same 2,142 entry names; 11 payloads differ. Do not increase the size ceiling,
repin the reference, normalize away these differences, or call this reproduced.

Read-only diagnosis found concrete build-input/recipe differences:

1. All 410 primary app sources plus the local Unity module match the reference
   source-map texts. Hermes differs at the public API default branch: the
   observed environment explicitly injected the URL, while the reference
   daemon's retained environment-key list has no public API override. The
   equal URL still leaves different compiled instructions. The historical
   export temporary-path normalizer matches neither native HBC and is irrelevant.
2. Three native libraries embed the Gradle header cache path. Reference uses
   `/root/.gradle/caches/`; retry uses its artifact-specific cache. Expo core's
   packaged difference is only 20 build-ID bytes, but its unstripped debug
   data contains 179 cache-prefix string changes; this is actual pre-strip
   input drift, not evidence of arbitrary random build IDs.
3. Unity source realpaths changed from the canonical owner to the `/run/hourkey`
   alias. Swappy `__TIMESTAMP__` changed by seven hours. The reference daemon
   recorded no `TZ` key and logged `+0700`; its embedded source timestamp
   matches UTC+7, while the observed environment forced UTC. Explicit
   `Asia/Bangkok` is a proposed deterministic matching policy, not a claim
   about the historical literal environment value.
4. Reference Gradle ran `clean` and build in the same invocation. Expo generates
   `ExpoInlineModulesList` during configuration; reference clean removed it,
   whereas retry omitted clean and packaged an extra empty class. A separate
   clean invocation is not equivalent. Unity's private `/build` is a mount root,
   so its clean must preserve that root inode while deleting only private contents.
5. The only actual resource-value difference is
   `react_native_dev_server_ip`: reference `172.18.0.1`, retry `localhost`
   (parent read-only extraction `093e68`). React Native supports an explicit
   Gradle property; reopening networking is neither needed nor authorized.

These findings justify build-environment and private-mount corrections, not
app-formula changes or acceptance of the failed APK. No new native attempt,
deployment, migration, key change or phone-delivery test follows from this
diagnosis. Preserve the failed output, logs, seals and original baseline.
The full goal's external choices, actual phone receipt/detail checks and five
independent final signatures remain open.

### Build recipe correction committed; no new APK acceptance yet

Mobile commit `7253bc7f8651734de494b738e25b8f17adc9d8bc` changes only build/test
scripts. It removes the forced public URL, pins matching UTC+7 compilation,
privately exposes the canonical Gradle and Unity paths, pins the measured
dev-server resource, and restores same-invocation clean with private mount-root
preservation. Both receipt policy labels are explicitly v4; older v3 receipts
retain their original interpretation. App source, formulas, native export,
package/lock/config and the 311-command manifest are unchanged.

Actual parent checks: full observed receipt regression `7914e5` passed,
including real private namespace writes/read-only inputs and targeted TypeScript;
real Gradle clean fixture `e697fa` passed baseline failure, corrected cleanup
and four rejection cases. Independent `/root/v234_delivery_artifact_review`
approved this implementation slice and closed the strict reader v3/v4
compatibility finding. Reader tests passed 81 cases (`581e8e`: original 62 plus
19 recipe cases), with syntax/type checks `341bb4`. These are scoped checks,
not a new native run, final goal signatures or permission to release.

The read-only APK adapter now pins this committed mobile source, while retaining
the exact original APK size/unsigned hash, signer, historical exports and all
postgates. No candidate was substituted for the reference. Copies of the failed
retry's generated map/HBC are retained in its `observed/` directory as
`retained-candidate.index.android.bundle.map` (20,507,030 bytes, SHA-256
`418a75006db2eb54fded4bd203cdcf929bf4500dece63af5e681fd33c58da8fb`) and
`retained-candidate.index.android.bundle` (7,306,492 bytes, SHA-256
`5ed4c7bd0c2cb831cf884b6824ba3780d49341d6c8152b18035d33c0346ca528`).
Parent copy check `207725` verified both originals and copies; neither is a
successful reproduction. No further cleanup is authorized by the user's request
to reduce ceremony by 50%; the separately requested exact cache cleanup awaits
an answer. Use existing passed checks and avoid additional review frameworks.
