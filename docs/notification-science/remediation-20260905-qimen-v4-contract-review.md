# Independent backend Qimen V4 contract review — 2026-09-05

Reviewed implementation commit `919e56a` against parent `a8fbe2330e182d1a812bd34e6cb2704a993f7af7`. Scope: source manifest, full snapshot/provider codec, detail reader, new fixture and focused tests. Reviewer did not implement those files. Concurrent advisory/registration/delivery work and the reviewer's own mobile implementation are not approved by this review.

## Verdict

- **SPEC: CHANGES REQUIRED.** Two new-path validation gaps remain.
- **QUALITY: CHANGES REQUIRED.** The existing green suite accepts a contradictory recommended fixture and misses non-travel values.

These are bounded task verdicts, not any final deployment signature, goal closure, production method selection, or claim of predictive validity.

## Findings

### P2 — V4 accepts purposes outside the travel-only contract

`src/lib/qimen-three-layer-notification.cjs:424` validates only `cleanCode(top.purpose, 48)`, while line 432 binds the decision to that arbitrary purpose. The compact reader repeats the permissive check at line 975. With a genuinely supportive selected direction, setting both input purpose fields to `wealth` produces a V4 full snapshot that verifies true and compact JSON that parses successfully. Re-signing an otherwise valid full snapshot after the same mutation also verifies true. This permits new V4 records and provider messages outside the supported travel contract, inconsistent with the stricter mobile reader.

Bounded remedy: enforce `purpose === "travel"` in the schema-4 full builder/rebuild verification path and schema-4 compact reader only. Preserve historical V2/V3 acceptance and bytes.

### P2 — V4 verifies recommended directions with non-supportive seasonal states

`src/lib/qimen-three-layer-notification.cjs:432` validates the decision's shape; lines 456–460 derive selected component identities but never require the selected hour star and door to be 旺/相. The new fixture itself selects N with star 旺 and ordinary door 死, or Tongzong door 囚, while its decision says `recommended`; both full verifiers accept it. Independent re-signed tests also accept S (weak star and door) and SW (weak star, 旺 door), proving that neither side is enforced.

This contradicts the parent's explicit only-good-directions requirement even though every individual state is correctly recomputed from the declared month and method. A producer-side filter does not make the full contract reject contradictory immutable evidence; the detail endpoint trusts this verifier.

Bounded remedy: in V4 only, derive the selected hour palace and require **both** `starVigor` and `doorVigor` in `{旺, 相}`. Do not broaden the criterion or conflate intrinsic component quality with seasonal vigor. Compact contains no vigor, so this check belongs in full validation and producer construction, not an invented compact field. Update the V4 synthetic fixture and matrix to select actual supportive palaces; retain weak states in nonselected palaces and keep V2/V3 fixtures unchanged.

Both findings were reported to the parent and implementation owner before any implementation edit. This reviewer changed only the independent test/report.

## Independent evidence

Command: `node --no-warnings --experimental-strip-types scripts/test-qimen-v4-contract-review.mts`.

Initial result against the reviewed implementation: **70 checks, 18 failures**, exit 1. All failures are the two findings above across both explicit profiles: six non-travel failures (builder, re-signed full, compact per profile), and twelve selected-state failures (builder and re-signed full for N/S/SW per profile). The other 52 checks pass.

Passing independent checks include:

- Full canonical snapshot **and compact provider bytes** compared directly with modules compiled from `git show 919e56a^`, not merely author-supplied expected hashes; V2/V3 readers still accept those original records.
- A literal, helper-independent 申/metal-month star and two-door-profile table; supportive W ordinary and SE Tongzong controls.
- Symbols, foreign prototypes and throwing accessors at top level, hour evidence, palace and selected-evidence levels. All reject; accessors execute zero times.
- Mixed V2/V3/durable-UUID outer keys reject at the inner compact codec boundary. The durable outer wrapper remains a separate delivery concern.
- Re-signed duplicate earth/heaven instruments and complete star/door/deity component tuples reject.
- Canonical V4 compact route and `<3500 B` inner limit.

The implementation's existing focused tests were also executed successfully: `test-qimen-three-layer-v4.mts` (24 profile/month cases, 216 palace checks, compact 1873/1873 B, full 17060/17064 B), `test-qimen-three-layer-v3.mts`, `test-qimen-three-layer-snapshot.mts`, `test-qimen-three-layer-payload.mts`, and `test-qimen-notification-detail.mts`. Their green status does not override the independent RED evidence.

## Other inspected contracts

The V4 path pins the exact ten evidence keys and named source/profile tuple, separately recomputes all nine star and eight door states, preserves null context vigor and null center door/deity, and does not install a global six-state allowlist. Historical default manifests retain the old hour version and engine/source tuple; only explicit schema 4 uses the new application hour version.

Full validation binds the evidence month pillar to the month layer's actual subject, requires day subject/day pillar coherence and matching day month metadata, matches evidence clock and bounds, enforces 90–150 minute whole-hour duration and full month/day containment, and rebuilds selected evidence and canonical digest. Existing tests isolate both Jie boundaries and reject straddling hours. These are consistency checks against supplied pinned context, not a fresh ephemeris or external-engine attestation.

The detail SQL retains both log and occurrence owner predicates; its schema-4 dispatch preserves account and stored-digest equality checks. Existing pure stub tests cover owner and digest mismatches. No DB was contacted.

The **4000 B complete-provider-request guard and locale-specific final envelope are downstream of commit `919e56a`**; the 1873 B compact measurement is not proof of that final request budget. Parent-owned durable-delivery integration requires its separate pure envelope tests and review. No release approval is inferred from this codec review.

No external engine import, network operation, service/DB access, full build, deployment, push, historical rewrite or enrollment change was performed.
