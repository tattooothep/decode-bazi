# V4 intrinsic-warning consistency — source fix, not deployed

## Confirmed defect and scope

Independent regression `test-qimen-v4-intrinsic-warning-independent-review.mts`
used the real canonical occurrence builder with a controlled synthetic engine
bridge. Its baseline correctly emitted `INTRINSIC_DEITY_BAD` for the selected
Teng She. The V4 verifier nevertheless accepted three newly rehashed snapshots
that removed or substituted that warning, including a false clear-good claim.
This is a verifier defect, not evidence that the live producer omitted warnings.

The parent cross-runtime test at mobile
`scripts/test-qimen-v4-intrinsic-warning-contract.mts` reproduced 24 invalid
acceptances across both explicit door methods and both backend/mobile verifiers:
missing warning, false clear, legacy reason hiding it, wrong component, invented
extra intrinsic warning, and a severe deity with a still-supportive seasonal pair.
An initial test setup incorrectly assumed the fixture contained Bai Hu; that setup
error was corrected before recording the 24-case implementation RED.

## Change

Only new V4 attested construction/verification and the mobile full V4 reader
now recheck the selected **hour** deity/door/star's canonical base quality:

- A severe component cannot be called an eligible recommendation.
- The intrinsic BAD warning subset must exactly match inauspicious components.
- Other existing soft warnings remain intact under the unchanged two-warning cap.
- Seasonal 旺/相 strength does not cancel intrinsic caution.
- Month/day remain inspectable context, not additional action authorities.

The advisory/score threshold, hard/soft selection policy, source formulas,
profiles, permissions, providers, preferences, database and old V2/V3 contracts
are unchanged. No new doctrine or extra recommendation gate was invented: this
rechecks an existing producer rule at the immutable contract boundary.

Changed implementation hashes:

- Backend `src/lib/qimen-three-layer-notification.cjs`:
  `25cfc642a9e4cac155c95895fe66d5dde9157007cdaf0ba1e033ac6511f93c92`
- Mobile `src/qimen/notificationContract.ts`:
  `7e9e39f56798cd53a8d0be24551f86747ff23ab7ab0692debc548a07ab28c8b1`

## Fresh parent verification

All results below finished with exit 0 against the changed sources:

- Independent canonical-builder regression: 3 omissions accepted before, 0 after.
- Cross-runtime regression: 24 invalid acceptances before, 0 after; 6 valid controls.
- Backend seasonal occurrence builder and scheduler tests.
- Backend V4 24 month/profile contracts / 216 palaces; independent contract 70 checks.
- V4 durable reservation: 24 locale/provider/privacy combinations.
- Mobile V4: 24 month/profile cases and 124 adversarial rejections.
- Backend V2 immutable snapshot/provider and V3 contract tests; mobile V2/V3
  parsing and Ziwei V3 wire tests.
- Ziwei V3 reservation 72 combinations, readable copy 126 cases / 9 locales,
  and Zibai delivery contract.
- Mobile actual native-bridge test: 32 live/cold detail loads, 64 rejected routes,
  4 App observer cases; existing hook relative order preserved.
- Qimen render: all 9 locales, font scales 1/2, 72 V4 profile renders.
- R8 truth: 216 normalization, 23 lifecycle and 6 audience-race cases.
- Backend and mobile `tsc --noEmit`; `git diff --check`.

Runtime imports were guarded with a throwing global fetch where applicable.
Mobile scripts use Node's strip-types runner. An attempted mobile `--import tsx`
run failed because that package is not installed there; rerunning with the
repository-compatible strip-types runner passed. Its existing Node
MODULE_TYPELESS_PACKAGE_JSON warning was not addressed by changing package mode.

## Fixture correction and limits

The V4 synthetic fixture formerly selected supporting pairs without checking
intrinsic severity or regenerating mandatory warnings. A separate test-only
change corrects this. Across its original 24 month/profile arrangements, 4 have
no supporting pair, 16 are intrinsically ineligible, and 4 are admissible. These
counts describe **synthetic arrangements, not real-world notification frequency**.
Explicitly rearranged whole-component synthetic controls exercise all 24 profile
readers; original ineligible charts must stay negative. Fixture/test commit
`fc85afc` explicitly selects each real supporting-but-severe synthetic pair for
the negative assertion. Mobile test commit `3ef7ba0c` adds 16 complete rehashed,
rebound severe star/door candidates; the parent reran that matrix successfully.
These checks do not mistake a stale weak direction for the severe-pair rejection.

The independent real isolated-PostgreSQL rerun is recorded in `cbb416e`, with
wording correction `6a7fdaa`: 26 checks, 14 fake sends, zero fetches and stable
start/end implementation/fixture hashes. Three new malformed intrinsic-warning
cases fail at both actual reservation and immutable retry boundaries. All five
scratch database/role pairs were removed and independently confirmed absent.
This is bounded integration evidence, not a production migration, delivery to a
phone, or a final signature. Exact artifact and full-goal reviews remain open.

No APK, production migration, deployment, credential mutation or push was made
by this fix. The earlier diagnostic Hermes export from mobile `dad3b564` predates
this guard. A newer export from `1d751099` completed with exit 0 and its source
map contains this exact guard source (see mobile
`remediation-20260905-android-bundle-evidence.md`); it is still not an APK or
complete native build. Do not distribute a
capability-4 APK before compatible DB/backend/method configuration is ready.
Rollback must preserve V4 history/retry/enrollment support once any such rows
exist; do not return to a schema-3-only sender as an alleged safe rollback.

The full goal remains active: external Expo project credential authority and the
explicit door-method choice, release builds, staged deployment, real receipt and
detail proof, and five independent final signatures remain outstanding.
