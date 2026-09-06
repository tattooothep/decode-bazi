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
