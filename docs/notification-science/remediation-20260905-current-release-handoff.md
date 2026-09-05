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

Remaining mobile evidence comprises:

1. Fresh Android/iOS/web export and the existing semantic comparison. CNG
   prebuild parity and an Android-only Hermes export do not satisfy this.
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
syntax/type checks in parent execution `50376`. Independent implementation
review remains a separate requirement. It checks retained bytes and selected
crosslinks only. Its `validationScope` and
`RECORDED_SANDBOX_POLICY_EQUIVALENCE` missing-proof entry explicitly leave full
mount/overlay policy equivalence unverified. Self-consistent receipts,
expected hashes and synthetic PASS fixtures do not establish actual execution,
cryptographic verification, watcher continuity or release readiness. Neither
this reader nor its tests are connected to the unchanged release gate.

## External boundaries and the full goal

The volume currently has about 6.0 GiB free and is 99% used. This is a risk
requiring a measured build-headroom decision, not proof that a build cannot
fit. No cleanup has been authorized or performed. A read-only process snapshot
is not exclusive ownership of shared build inputs.

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
