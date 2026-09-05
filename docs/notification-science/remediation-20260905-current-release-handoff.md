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

After retaining both exports, the sampled free space is 3,525,763,072 bytes
(about 3.3 GiB); `df` rounds usage to 100%. The native run needs a new measured
headroom decision, not an inference from the percentage alone. No cleanup has
been authorized or performed, and no native run was started. A read-only
process snapshot is not exclusive ownership of shared build inputs.

Expo project credential repair is a separate authority boundary; it is **not**
a prerequisite to compiling an otherwise authorized offline internal APK.
The operator connection choice and scoped cleanup/storage question are pending.
Do not export signing/service keys or delete registrations to bypass them.

Explicit Qimen door-method selection, compatible schema/backend rollout and
rollback, Expo repair, physical receipt/detail opening, and five independent
final reviews remain open. Preserve the month-based nine-star correction,
separate door traditions, readable nine-locale Ziwei Type C, Zibai leap-seam
correction, immutable history, existing profiles and all unaffected lanes.
Qizheng predictions and separately unapproved activation remain off; optional
pending source packs are not a new condition for this hard-off remediation.
