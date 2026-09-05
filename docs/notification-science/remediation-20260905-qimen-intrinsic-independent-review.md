# Independent V4 intrinsic-warning review — bounded APPROVED

## Scope and binding

APPROVED for the bounded intrinsic-warning verifier correction, not a release,
phone-delivery proof, or final-goal signature. No critical or important production
findings remain in the reviewed diff.

- Backend baseline `9b2cfbf` → production fix `5f5fa2c`,
  `src/lib/qimen-three-layer-notification.cjs` SHA-256:
  `25cfc642a9e4cac155c95895fe66d5dde9157007cdaf0ba1e033ac6511f93c92`.
- Mobile baseline `dad3b564` → production fix `1d751099`,
  `src/qimen/notificationContract.ts` SHA-256:
  `7e9e39f56798cd53a8d0be24551f86747ff23ab7ab0692debc548a07ab28c8b1`.

The independent canonical-builder regression already demonstrated that its
controlled producer emitted `INTRINSIC_DEITY_BAD` correctly. The proven defect is
acceptance of rehashed snapshots that suppress or substitute required warning
evidence, not demonstrated live producer warning loss.

## Reproduce the independent all-component matrix

From the backend worktree:

```bash
node --experimental-strip-types scripts/test-qimen-v4-intrinsic-all-components-review.mts
```

Requires Node 22.22.1, the local backend dependencies and Git baseline objects,
and the mobile checkout (default `/root/worktrees/hourkey-mobile-zibai-v3-p0`;
override with `QIMEN_MOBILE_ROOT`). The script loads old verifier logic from
read-only `git show` into memory; it does not restore files, change HEAD/index,
import the external engine/SQLite DB, connect to a database, or contact providers.
The global fetch tripwire is installed before application-module imports.

The test independently selects explicit bad/severe deity, door, and star codes.
It moves complete code/name/seasonal tuples into the selected hour palace, or
substitutes the complete unused Bai Hu deity tuple. Both seasonal methods are
tested, and every selected star/door pair is asserted to be 旺/相. Full snapshot,
selected evidence, compact evidence, and digest are coherent: rejection cannot
be attributed to a stale direction, duplicated component, or weak seasonal pair.

Assertions cover omitted warnings, false-clear and legacy-hidden claims, wrong
components, invented extra intrinsic codes, severe components, and omission of
either member of a two-intrinsic-warning set. Positive controls preserve exact
intrinsic warnings, reordered external warnings, two warnings, clean-good hours,
and harmful month/day context as context rather than action gates. Two unchanged
three-warning-cap negatives are checked against both the old and current readers.
Their compact envelopes are rebound from accepted controls because compact wire
does not contain decision reasons; this avoids asking the old builder to produce
a snapshot already invalid under the old cap.

Expected and independently observed results:

| Evidence | Result |
| --- | --- |
| Newly invalid acceptance, old → current | 84 → 0 across both verifiers |
| Invalid snapshot cases | 44, including 2 unchanged cap negatives |
| Valid snapshot controls | 18 across both verifiers |
| Public V4 provider-build rejections | 44 |
| Public backend detail-helper rejections | 44, inert query double only |
| V2/V3 canonical bytes, compact bytes, parser comparisons | 6 unchanged |
| Harmful selected month/day context controls | 2 accepted |
| Fetch calls / external engine imports | 0 / 0 |

The 84 count is 42 newly invalid snapshots × two verifiers. The 18 count denotes
snapshots tested by both verifiers, not 18 runtime checks. These are explicitly
synthetic arrangements, not ephemeris evidence or notification-frequency data.

## Production-path review

- `qimen-three-layer-notification.cjs:625` applies the guard only to schema 4 and
  derives quality from canonical components, not caller-supplied warning claims.
- V4 verification reconstructs through that builder; V4 provider construction
  calls verification before serializing (`:697`, `:878`).
- Canonical occurrence construction selects the explicit V4 builder
  (`qimen-canonical-occurrence-builder.cjs:350`).
- The public detail route uses `readQimenNotificationDetail`; its schema-4 branch
  invokes the V4 verifier (`mobile-qimen-notification-detail.cjs:41`).
- Reservation and retry attestation use the descriptor-selected V4 contract
  (`mobile-notification-delivery.cjs:112`, `:154`, `:561`). Persisted occurrence
  ownership or modern attestation markers prevent generic-policy downgrade
  (`:1390`); failed retry attestation is terminal (`:1192`).
- Mobile full parsing applies the independent guard after component attestation
  (`notificationContract.ts:994`). Dispatch at `:1039` is version-strict; the
  detail coordinator additionally verifies canonical digest before application
  (`notificationDetailCoordinator.ts:68`). Invalid/mixed provider envelopes do
  not satisfy the older readers' exact-key contracts.

Compact parsers are transport readers and do not carry warning reasons. The
recommendation safety boundary is the full snapshot, verified before provider
construction/send and before displaying full detail. No fallback bypass was found
in the reviewed production construction, read, or send paths.

## Additional fresh review checks

All completed with exit 0 and a throwing global fetch before runtime imports:

- Canonical-builder omission regression: no omissions accepted.
- Existing cross-runtime intrinsic regression: 6 controls, 24 rejections.
- Backend V4: 24 month/profile cases, 216 palaces; independent contract 70 checks;
  durable delivery 24 locale/provider/privacy combinations.
- Mobile V4: 124 adversarial rejections, plus 16 fully rebound strong/severe
  star/door selections; V2/V3 payload tests passed.
- Mobile SDK bridge review: 78 checks, 4 bridges, no failures.
- Production files match the reviewed commit objects; `git diff --check` passed.

No source formulas, score/advisory thresholds, existing soft-warning cap,
permissions, production config, credentials, or database state were changed by
this review. V2/V3 canonical history remains byte-identical in the tested controls.
The original minor coverage note (deity-only intrinsic omission controls in the
focused regression) is addressed by this new independently derived persistent
all-component matrix. Deployment and real receipt/detail proof remain separate.
