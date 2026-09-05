# Qimen conditional-copy size and intrinsic-warning review

Reviewer: `/root/qimen_transport_review_0905b`, 5 September 2026. Tests/report only; no implementation edits, live request, DB write, or external-engine import. This is not a final-goal signature or release approval.

## Result

The expanded **currently implemented TH/EN/ZH** conditional-copy cohort did not demonstrate a provider payload overflow, silent truncation, or a body exceeding the current 400-character limit. It did expose a separate V4 full-snapshot validation gap: mandatory selected-component warnings can be removed while the snapshot still passes verification. That gap has an independent failing regression and is not approved.

## Scope and method

`scripts/test-qimen-v4-conditional-size-independent-review.mts` reads and executes the current advisory policy through controlled engine witnesses:

- score remains 67, selected star and door remain supporting, hard count remains zero;
- reading is `caution`, not an invented clear-good reading;
- the policy's three root warning codes, three palace flag codes, one named formation warning and twelve named source-governed stem-response codes produce 125 zero/one/two-warning patterns;
- two distinct stem-response tuples are never put into one palace's single `stem_response` field;
- the actual advisory must return a conditional recommendation and exactly the requested canonical warning codes before a pattern enters the matrix.

The nineteen optional warning codes are `NEAR_HOUR_BOUNDARY`, `LARGE_TIME_CORRECTION`, `NEAR_SOLAR_TERM_START`, `KONG_WANG`, `MEN_PO`, `RU_MU`, `TENG_SHE_YAO_JIAO`, and the twelve `STEM_RESPONSE_` codes explicitly rendered by the current copy builder.

The synthetic 24-profile/month full-grid matrix independently computes mandatory selected-component intrinsic warnings from the component catalog. It excludes every combination exceeding **two total** soft warnings, including those mandatory warnings. Four original no-support fixtures are first rejected; the explicitly named fixture helper then constructs separate positive test arrangements. No production selection gate is weakened.

These are **policy/contract stress inputs, not historical engine output or proof that all named formations can coexist astronomically**. Month metadata in the contract matrix are deliberately varied independently of the fixture date. No claim of real good hours follows from these tests.

To avoid relying only on that artificial matrix, all 125 optional patterns also pass through the actual canonical occurrence builder with a controlled engine response and real canonical clock/pillars at `2026-06-22T02:25:34.852Z`, six minutes after the canonical hour boundary at longitude 100.5018, Asia/Bangkok. The ordinary door profile is explicitly selected for this test, not chosen for production. All three immutable layer contracts are built and verified. This remains a controlled engine witness, not an external engine calculation.

## Measurements

```text
125 policy-admitted warning patterns
690 full-grid snapshots after mandatory intrinsic warnings and total cap
2,310 combinations excluded because total warnings would exceed two
4,140 matrix provider envelopes
125 additional canonical-builder snapshots / 750 envelopes
0 copy-too-long exceptions
0 silent title/body truncations
0 prepared messages over 4,000 bytes
0 FCM notification+data JSON or key/value sums over 4,096 bytes
0 full Expo HTTP bodies over 4,096 bytes
```

| Scope | Max body characters | Max prepared bytes | Max FCM notification+data JSON | Max FCM keys+values | Max full Expo HTTP bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| Canonical builder + controlled engine | 346 | 3,909 | 3,793 | 3,281 | 3,671 |
| 24-profile/month matrix, largest prepared-message witness | 338 | 3,857 | 3,741 | 3,229 | 3,619 |

For the matrix, the largest prepared-message witness is Thai, dark-residual door profile, synthetic 己巳 contract, with `STEM_RESPONSE_YI_OVER_WU` plus `TENG_SHE_YAO_JIAO`. The original no-support chart was rejected before the explicitly distinct synthetic positive arrangement was constructed.

The matrix includes 576 full HTTP bodies over 4,000 bytes and 58 over 4,096, all in FCM wrappers. Those are **not evidence of FCM payload-limit violations**: the wrapper includes target and Android configuration, while the report separately measures notification/data. Targets are synthetic 256-character values. The prepared-message 4,000-byte engineering budget and provider payload 4,096-byte limits must not be conflated with total HTTP bytes.

This test measures the current known patterns and strings, not every source-governed structured warning identity the policy might accept, every warning permutation, every future locale string or every possible target length. A runtime numeric size guard still was not present in the inspected transport files. Pending nine-locale copy changes require rerunning and expanding these tests.

## Separate reproducible V4 warning omission

The original V4 fixture's default `hour_conditional_good` / `hour_reading_usable` reasons omit the mandatory inauspicious-deity warning: ordinary-profile W contains 勾陳, and dark-profile SE contains 螣蛇. It is not a clear-good default, but it still omits a condition required by the advisory policy. Earlier byte measurements establish encoded-size facts, not that this fixture's default reason list is a scientifically admissible producer decision.

`scripts/test-qimen-v4-intrinsic-warning-independent-review.mts` avoids relying on that fixture mistake:

1. It swaps complete deity tuples in the controlled engine witness so the otherwise supporting SE palace contains 螣蛇, sets its catalog-consistent inauspicious quality and leaves the score/hard/seasonal gates unchanged.
2. The actual advisory returns a conditional recommendation with `INTRINSIC_DEITY_BAD`.
3. The actual canonical builder produces a full V4 snapshot carrying that warning; baseline verification passes.
4. The test changes only the decision reasons and recomputes the full digest. The verifier incorrectly accepts omission, a clear-good claim, and substitution with an unrelated intrinsic-star warning.

Observed RED:

```text
QIMEN_V4_INTRINSIC_WARNING_REVIEW baseline=canonical_builder_controlled_engine omissionsAccepted=3 network=0
hour_conditional_good|hour_reading_caution
hour_clear_good|hour_reading_suitable
hour_conditional_good|hour_reading_caution|hour_warning_INTRINSIC_STAR_BAD
```

The baseline producer correctly included the warning. This finding concerns the V4 trust-boundary verifier and misleading fixtures, **not proof that the deployed producer is omitting these warnings**. The bounded fix should derive mandatory intrinsic warnings from the selected hour components already present in the V4 snapshot, require their exact presence, reject unrelated intrinsic labels, and prevent clear-good claims when a mandatory warning exists. Historical V2/V3 contracts and bytes must remain frozen. The implementation and independent recheck belong to the parent workflow.

## Commands

```text
npx --no-install tsx scripts/test-qimen-v4-conditional-size-independent-review.mts
  completed; measurements above, no runtime copy/provider-size failure in the tested cohort
npx --no-install tsx scripts/test-qimen-v4-intrinsic-warning-independent-review.mts
  RED; three omitted/misrepresented intrinsic-warning reason sets accepted
```

No provider delivery or device receipt is asserted. A controlled local regression result cannot replace real-device receive and open-detail evidence.
