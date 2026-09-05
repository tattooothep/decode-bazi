# Qimen V4 fixture correction and refreshed matrix evidence

5 September 2026. Author: `/root/qimen_transport_review_0905b`. Scope is test fixtures, existing test matrices and this report only. Parent implementation commits are backend `5f5fa2c` and mobile `1d751099`; this author did not write those intrinsic-consistency guards. No deployment, external-engine calculation, DB write, credential operation or push was performed.

## Why the previous fixture evidence was insufficient

Of the original twelve-month × two-profile arrangements:

- four have no noncentral palace with both star and door 旺/相;
- sixteen have a 旺/相 pair, but that pair contains an intrinsically **severe star or door**;
- only four have an intrinsically admissible supporting pair, with a mandatory inauspicious-deity warning.

The old fixture selector checked seasonal support but did not exclude intrinsic severity or derive required warnings. Its default ordinary-profile W contains 勾陳 and dark-profile SE contains 螣蛇; both need `INTRINSIC_DEITY_BAD`. A passing synthetic contract did not establish a scientifically admissible recommendation.

The original four no-support cases remain negative. The sixteen severe cases are now separately negative, not counted as positive recommendations. The backend test explicitly selects each **actual original 旺/相 severe pair** in a raw clone and supplies all genuine non-severe intrinsic warning reasons before asserting rejection. This prevents an irrelevant stale, weak August direction from being the reason a negative test passes.

## Test-only corrections

The V4 fixture now:

- resolves intrinsic qualities from the canonical component catalog;
- distinguishes `no_supporting_pair`, `hard_ineligible`, and `admissible`;
- selects only an existing non-severe 旺/相 pair with at most two required intrinsic warnings;
- derives those exact mandatory warning codes in its conditional/usable test decision;
- never changes an intrinsic quality or seasonal label to manufacture eligibility.

For complete positive reader/formula coverage, `arrangeSyntheticAdmissibleDirection` deliberately creates a **different synthetic arrangement**, only after a caller rejects the original. It exchanges entire noncentral star/door/deity tuples, preserving code, Chinese name, optional intrinsic quality and associated seasonal vigor together. The central star and earth/heaven instruments remain unchanged. Backend tests compare the before/after component-tuple multisets and instruments, and verify the complete resulting snapshot. This is explicitly a test arrangement operation, not a production fallback or a claim that the new arrangement occurred on a fixture date.

All 24 branch/profile oracle cases still have separate admissible synthetic positive controls. No V2/V3 fixture or historical wire format was changed.

## Independent mobile hard-negative coverage

For each of the sixteen original strong-but-severe cases, the mobile matrix restores the complete original hour arrangement into a full candidate, with canonical component qualities. It selects the actual severe star/door palace while retaining both 旺/相 states, updates month/day/hour selected evidence, updates the compact identities, and recomputes/binds the full snapshot digest. Both backend verification and mobile parsing reject it. Thus the rejection does not rely on stale direction, stale digest, wrong quality label, weak vigor or an unrelated extra field.

Observed results:

```text
Backend: 24 branch/profile cases; no-support=4; hard-ineligible=16; 216 palace checks
Mobile: 24 month/profile cases; 124 existing adversarial rejections;
        no-support=4; hard-ineligible=16; strong-severe-mobile=16
```

## Refreshed size evidence — supersedes earlier fixture matrices

The size measurements in the earlier 144-case and 690-snapshot reports describe their then-current bytes. They must **not** be reused as evidence of admissible decisions, because those fixtures had the omissions and severe selections described above. The following reruns use the corrected fixture under the new production guards.

### Base matrix

144 envelopes, four no-support negatives and sixteen intrinsic-hard negatives before separate positive rearrangement. No visible copy is truncated. Maximum Thai FCM prepared message is 3,744 B; notification+data JSON 3,628 B; direct key/value UTF-8 sum 3,116 B. Maximum full Expo body is 3,506 B. Eleven FCM HTTP wrappers reach 4,000 B, but none reaches a tested provider payload limit; full HTTP bytes are not equated to FCM notification/data limits.

### Conditional matrix

125 policy-admitted zero/one/two-warning patterns are combined with the corrected 24-profile/month arrangements, including mandatory selected intrinsic warnings. The 420 combinations that would exceed two total warnings are excluded.

```text
2,580 full-grid snapshots / 15,480 provider envelopes
4 original no-support negatives + 16 original intrinsic-hard negatives
0 copy-too-long exceptions or silent truncations
0 prepared messages over 4,000 bytes
0 FCM notification/data JSON or key/value sums over 4,096 bytes
0 full Expo bodies over 4,096 bytes
```

The largest prepared-message witness is ordinary-profile synthetic 壬申, Thai, with required `INTRINSIC_DEITY_BAD` and `STEM_RESPONSE_YI_OVER_WU`: 349 body characters; 3,851 B prepared; 3,735 B FCM notification/data JSON; 3,223 B key/value bytes. Full Expo reaches 3,613 B. Some full FCM HTTP wrappers exceed 4,096 B, but the notification/data metrics do not; no provider-limit rejection is claimed from the wrapper metric.

The additional actual canonical-builder/controlled-engine bridge remains unchanged: 125 snapshots / 750 envelopes; maximum body 346 characters, prepared 3,909 B, FCM notification/data JSON 3,793 B, key/value bytes 3,281 B, and full Expo 3,671 B. These are controlled policy/transport inputs, not historical external-engine output or proof all warning combinations coexist astronomically.

## Verification and remaining limits

Fresh passing checks include the backend 24/216 matrix, independent contract 70, public retry 19, durable reservation 24, seasonal/root review 72, mobile 24/124+16, mobile parent duplicate/weak-selection checks, and 72 explicit-profile renders across nine UI locales. Both size scripts completed with the measurements above. V2/V3 immutable fixture files have no diff; their hardcoded historical digests remain covered by the backend matrix.

Only three provider-copy languages are covered by the size tests. Pending nine-language provider copy, runtime size enforcement, PostgreSQL lock behavior, release gates and device receive/open-detail proof remain outside this fixture task. This author cannot supply an independent signature for the fixture/test changes written here, and this report is not one of the five final goal signatures.
