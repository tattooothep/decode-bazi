# Backend artifact identity — bounded remediation evidence

Date: 2026-09-05. This adds an offline, read-only measurement helper and fixture
tests. It is not an R8 release verifier, migration, deployment, provider repair,
phone acceptance or final five-reviewer goal approval.

## Why two historical hashes must remain distinct

`scripts/lib/remediation-backend-artifact.mts` directly reuses the unchanged
`computeBuildArtifactDigest` from `notification-observability-preflight.cjs` for
the **installed** hash. Its separately versioned **reproducible** hash preserves
the historical normalized-Next `filesTreeDigest(..., true)` algorithm.

| Property | Installed preflight | Historical reproducibility |
| --- | --- | --- |
| BUILD_ID | Normalized | Normalized |
| App/output paths and Next random keys | Preserved | Historical replacements only |
| `.next/cache` | Included | Excluded |
| `trace` / `trace-build` | Excluded | Excluded |
| Allowed `pg` / `sharp` links | Link plus resolved dependency contents | Link only |

Neither digest replaces exact archive identity or source/dependency/build
receipts. The helper deliberately does not accept an archive path or emit an
archive-binding/readiness/approval field. A separately typed raw input scan
includes modes, raw bytes, traces, cache and resolved permitted dependency
files; matching before/after scans detect sampled changes, **not** an atomic
snapshot, an ABA-proof journal or immutable provenance. Allowed-package cycles
are rejected before invoking the unchanged installed preflight traversal.

## Verification performed

- RED before the helper existed: `ERR_MODULE_NOT_FOUND`.
- GREEN: `unshare -n /usr/bin/node --import tsx scripts/test-remediation-backend-artifact.mts`.
- The fixture test executes only the historical pure digest function extracted
  from its source. It does not import/run the historical final-gate workflow.
- Cases include separately changed build roots/random output, BUILD_ID-only
  changes, real application changes, cache, trace, both permitted dependency
  links, changed dependency bytes, canonical roots, invalid BUILD_ID and escaped
  links. Injected changes after a real installed-hash read reject both code
  changes and raw changes excluded by both historical policies.
- Additional RED: a synthetic permitted-package cycle produced `RangeError`.
  GREEN after an explicit ancestor-cycle rejection; no real dependency modified.
- Final `tsc --noEmit` exited 0. No network, DB or provider call in these checks.

The fixture-only race injection wraps the real preflight function within its
test process; it does not add a caller override to the production helper.

## Actual previously built artifact, not a new build

Compiled backend commit: `c2d89a181da7536f4dfe0e73ad369bb7ac1a3a6c`.
Build ID: `WyxmNpHuFUJjMbJXBKWg-`.

Retained archive:
`/root/artifacts/hourkey-notification-backend-build-0bMXdy/next-build-c2d89a1.tar.gz`

- Exact archive SHA-256: `4bf605bcf19da3197e18fed008230df38bf4f3c975c31e14e964702dd5026be7`.
- Size: 11,109,507 bytes; 2,999 unique entries, only regular files/directories
  under `.next/`. Canonical relative paths verified before extraction.
- Fresh private extraction:
  `/root/artifacts/hourkey-remediation-next-inspection-LPfCZB` (43 MiB).
- `tar --compare` against that same retained archive exited 0.
- This is Next output only, not a standalone installed application. The new
  helper/report are not relabelled as part of the earlier compiled source.

| Measurement | Original worktree output with cache | Extracted retained archive without cache |
| --- | --- | --- |
| Installed preflight | `1c782dcf008255421e183bf5f64c8457fbcff9c9bcc20132c365a6de5ea1c279` | `dec923c17750868ef9695bb6075a542982a9fe48ffce2c6555524086b7adadee` |
| Historical reproducibility | `a9deca90e625dab881d040098406d8e7c12b0339b8be703cb499803f4a5bad35` | `a9deca90e625dab881d040098406d8e7c12b0339b8be703cb499803f4a5bad35` |
| Raw observed inputs | `fce47263bf52d9c4085661aa8809a5295943803c3dfae925b441046a6822c975` | `63dea1872e0512d1193445a84e7aa939b90826e22cf02f3d7b36443e664ef67e` |

A future dossier must measure the exact staged release and its complete
dependencies. It must not use the cache-bearing workspace's installed hash for
the cache-free archive, nor substitute the reproducibility hash for either.

## Preserved gates and next requirements

The historical verifier, historical evidence and installed preflight were not
edited. Their respective SHA-256 values remain:

- `4d8bcfd7b5751293261bd56783cfa441025b55defe2bad1667da5da45b2cc845`
- `bfed5ecbae59eaf7764e1e1c514e22082afdae7fd08d1b28b23850697aa6b044`
- `1a6e21e35ac47378b7525f83aa0841561d6dd2d5c5ded01819aa688f33052590`

Still required: a complete current external evidence dossier and strict
source-delta/receipt verifier; safe observed-native build policy/resources and
actual structured receipts; current full release reviews; existing migration
and installed-runtime-role gates; explicit Qimen door choice; authenticated
Expo project repair; real phone receipt/detail acceptance. Current astronomy
foundation and pending Qizheng sources remain hard-off. No historical signature
was transferred and no whole-goal completion is claimed.

Independent reviewer `/root/qimen_fresh_v4_gate_review` approved the exact
two-file helper/test slice, with no critical, important or minor findings.
The reviewer independently ran the supplied fixture suite, 22 additional
adversarial cases and syntax checks, with zero forbidden network/DB/provider or
subprocess activity inside its test boundaries. This is not a final goal or
release signature and does not independently certify the parent artifact runs.

Private review:
`/root/artifacts/hourkey-notification-backend-build-0bMXdy/remediation-backend-artifact-review.md`

- Review SHA-256: `a7d15cb9c7ee60af149b8ef9cc1d63dc7620b398057c3fe13fdc5f44cff34e2a`.
- Helper SHA-256: `2c4e640f627d55dea4c6bdc4c8c56cf78f373314c2cb57a8d52262b200c3b3b2`.
- Test SHA-256: `616be8431cc8fda110cf888393a7c3ce039a63aade45f4c16b62ab22ca1a2c11`.

The parent read the full review and rechecked all three hashes before commit.
