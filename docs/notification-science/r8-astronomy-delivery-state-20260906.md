# R8 astronomy delivery transition checkpoint — 2026-09-06

Status: **source-only, unintegrated; no production activation or full-goal acceptance**.

Parent source commit: `d5f07296e6c53faa0dd533461e94bd4dc4a16e5a`.
The deployed backend remains application commit `9cc455c84cea3f9a132e2e1261da3086c59ca1da`; the distributed APK remains v234 `dd50877f19e761eff599e5618274c570ab289956`. This checkpoint does not rebuild, replace, or reattribute either artifact or its existing signatures.

## Confirmed missing implementation

The existing R8 implementation plan intentionally ends at a hard-off release. Its astronomy scheduler writes provider-free shadow occurrences. The installed migration has no R8 provider outbox/attempt state machine. Qizheng source evidence is still incomplete. Opening a UI switch would not create a working delivery system.

Do not route astronomy through generic `push-send.cjs` category preparation: its unknown-category fallback selects `daily`, not the separate astronomy channel/expiry contract. Do not treat legacy transport retryability as authoritative proof of non-acceptance.

## Added code

- `src/lib/mobile-astronomy-delivery-state-r8.ts`: pure transitions for the astronomy civil-two-hour lane only; no imports, database, credentials, scheduler or provider calls.
- `scripts/test-mobile-astronomy-delivery-state-r8.mts`: isolated in-memory regression tests.

The reducer retains original deadlines, stable chain/unit identifiers, immutable per-attempt correlation/payload evidence, and bounded attempts. Unknown in-flight outcomes cannot retry. Expiry/revocation cannot erase accepted or uncertain attempts. A verified device acknowledgment can precede the provider response, and late evidence updates the same attempt.

Creation time is independent of due time, permitting pre-due revocation. UUIDs are canonicalized; result/ack events require explicit scalar correlation IDs. Object coercion cannot introduce mutable identifiers into frozen evidence.

## Evidence and limits

- Initial missing-module test failed (`7bb4f6`); subsequent regression failures reproduced ordering (`243ed7`), UUID identity (`f8e267`), and missing-correlation (`8b00b6`) defects before their fixes.
- Final pure test: **139 checks**, no provider/database calls (`ecc6d2`).
- Final TypeScript `--noEmit --incremental false`: exit 0 (`62d583`).
- Independent reviewers `/root/r8_delivery_gap`, `/root/r8_reducer_safety`, and `/root/r8_reducer_tests` each returned scoped PASS on the exact final pair. The adversarial reviewer additionally ran 23 independent assertions (`875e64`). These are **three component reviews, not five full-goal signatures**.
- Module SHA256: `4f137e6a698993c9b0e3b7ec24ad699065543f3edc8f9d5aa39e13e9d30d814d`.
- Test SHA256: `7bb07ec7e4d8a91e961ac81926edc6151a20a3ee3317192a4639c4fa65d82d57`.
- No production consumer imports this reducer. No production migration, service/configuration change, provider test, preference change or historical-row correction occurred in this checkpoint.

## Required integration remains

1. A separate durable store/outbox with serialized chain/unit transitions across revisions/aliases, persisted-state validation, event deduplication and retained acceptance tombstones. Do not use a rotatable HMAC as the stable lineage identity.
2. Audited provider classification and a dedicated prepared astronomy payload/channel/TTL path, with original-deadline retry scheduling and consent/revocation fencing through durable completion.
3. Actual consent/eligibility controls, independently gated activation migration, and the previously approved rollout/soak requirements. The pure reducer is not an activation permission.
4. Real-device receipt/detail evidence, cross-science regression evidence, and five final independent signatures on the completed implemented bundle.

`astronomy_fact` remains sky data without good/bad judgments. No source-approved non-hybrid hourly Qizheng verdict has been established; all ten canonical source sets still require double verification. Natal calculations and astronomy positions must not be relabelled as hourly 七政四餘 predictions.

Rollback of this source-only checkpoint means reverting its additive commit after preserving any later dependent work. There is no production rollback to perform because nothing here was deployed.

## Durable store checkpoint (source only, still no activation)

Following reducer commit `0495c93`, added an event-sourced PostgreSQL store and an **unapplied draft** additive migration. The stable `(chain UUID, unit)` is unique. Creation never replaces an existing ledger. A row-locked transaction deduplicates the event UUID before version comparison, replays and validates persisted evidence, then appends the event and checkpoint atomically. Failure to roll back discards the connection.

The new tables deliberately have no cascading dependency on shadow chains or tokens: those existing records can disappear on transfer. This protects the stored tombstone but does **not** solve the future production registry's responsibility to reuse the same chain UUID across device/consent changes. No new-table runtime grants, provider integration or legacy table mutations were introduced.

Verification:

- Missing store module failed first (`3d23f2`); failed-rollback regression reproduced before its fix (`fc7588`).
- A real disposable PostgreSQL run reproduced the SQL `CHECK` null-identity weakness (`cd005d`); the three comparisons now require `IS TRUE`.
- Corrected real PostgreSQL suite passed **25 counted checks plus setup assertions** (`f16c6b`): 8 concurrent creations, 8 identical-event submissions, competing same-version events, conflicting replay, durable reread, uncertainty recovery, late acknowledgment, attempted accepted-lineage reset, and a transaction failure injected between event INSERT and checkpoint UPDATE. This was not a killed production worker test or a real provider send.
- TypeScript check exit 0 (`b02b65`); pure reducer remains 139 checks. The test helper has a separately reviewed fixed-image, network-disabled disposable cluster with an explicit Unix socket and no installed environment/credentials. Cleanup left no labeled test containers (`908741`). Only regenerable test data were removed.
- Existing-lane **synthetic sentinels** stayed unchanged; this is scoped isolation evidence, not a production end-to-end nonregression or capacity result.
- Independent store reviewers `/root/r8_delivery_gap` and `/root/r8_reducer_tests` returned scoped PASS on the pinned final store/draft/test. The latter also ran 18 fake-PG adversarial assertions (`412fbf`) covering corrupt evidence/checkpoints and caller mutation. The helper's author is not counted as its independent reviewer. None of these component reviews is a full-goal signature.

Pinned files:

- Store: `a567e40170272bd854be793092834fe18c9bd863de20c93450e194ed8557dbb1`.
- Draft SQL: `8fd0fcc3eb96f89dcb6615912b5595fecf111c96b1801b32b4778fb3f5f6f3a9`.
- Store test: `2a974681d2f7c98df0401f7a86394f3d3c44a4971e6d179be6f2a93f5f46c53f`.
- Disposable helper: `6f01b15425e3822ee47872591f08b5830493410bfc47198b5897e884f815d7e0`.

The production authorization/chain registry, true dispatch fencing, provider adapter, retry scheduler, rollout gates and physical-device proof above remain required. The database draft is **not** an activation migration. The existing live release and APK are unchanged, and the full goal remains open.
