# Qimen V4 durable transport report — 2026-09-05

Status: bounded backend implementation evidence. This is not a deployment, credential repair, or final notification-science signature.

## Outcome

Qimen snapshot schema 4 now has an additive durable reservation and retry path. The transport accepts only the exact `qimenV2`, `qimenV3`, or `qimenV4` one-key notice payload, binds V4 to its immutable occurrence snapshot and seasonal source evidence, seals the exact FCM/Expo provider message and hash, and revalidates all of those facts before every retry.

Capability is monotonic only across known schemas: capability 2 can read V2, capability 3 can read V2/V3, and capability 4 can read V2/V3/V4. Unknown capabilities fail closed. Capability 4 can finish already reserved V2/V3 retry attempts. The current scheduler also recovers claimed V3 occurrences, but does **not** reconstruct unreserved V2 notices; the transport fixture alone does not prove that scheduler path. A V4 occurrence cannot downgrade onto a capability-2 or capability-3 token.

## Changes

- [`src/lib/mobile-notification-delivery.cjs`](../../src/lib/mobile-notification-delivery.cjs)
  - recognizes V4 with a strict plain-object, single-own-data-property descriptor;
  - rejects mixed, inherited, accessor, extra-key, and unknown-schema notice/message payloads before persistence;
  - verifies account, installation, occurrence key/window/direction/version, full snapshot verifier, digest, compact payload reconstruction, deadline, and exact seasonal evidence at reservation;
  - stores the locked account locale for V4, recomputes the public copy from the immutable snapshot, and rejects copy forgery before creating history;
  - extends the existing V3 privacy-safe full-copy behavior to V4;
  - re-reads the current location lease, occurrence, current token capability, snapshot, source facts, provider message, and message hash before a retry can start;
  - resolves persisted occurrence ownership even when the compact payload is malformed; modern markers or an occurrence always require attestation, while genuine generic legacy Qimen without either retains its previous policy.
- [`src/lib/qimen-notification-presentation.cjs`](../../src/lib/qimen-notification-presentation.cjs)
  - extracts the existing pure Thai/English/Chinese Qimen copy builder without changing its text;
  - imports only the strict Qimen snapshot runtime and component catalog—no cron, delivery, PostgreSQL, environment loader, heartbeat, or worker dependency.
- [`scripts/mobile-qimen-push-cron.cjs`](../../scripts/mobile-qimen-push-cron.cjs)
  - imports the extracted pure presentation functions; scheduling, admission, source selection, occurrence ownership, and producer gates are unchanged.
- [`src/lib/push-send.cjs`](../../src/lib/push-send.cjs)
  - adds `qimenV4` to the exact Qimen provider envelope allowlist;
  - keeps `notificationId` as the only peer key and does not inject a parallel generic `url`;
  - preserves the existing provider TTL, channel, priority, target isolation, and size behavior.
- [`scripts/test-qimen-v4-durable-delivery.mts`](../../scripts/test-qimen-v4-durable-delivery.mts)
  - pure in-memory reservation/retry/provider coverage; it does not connect to a database, engine, provider, or credential source.

## Durable invariants

For V4, `source_facts.seasonalEvidence` must equal `snapshot.layers.hour.contextEvidence` exactly. This binds the selected star method, explicit door method and provenance, source digests, month pillar, month boundary clock, and month validity interval to the same strict snapshot whose digest and all three nine-palace layers are persisted.

The retry attestation reconstructs the schema-specific provider payload from that persisted snapshot and reconstructs the FCM or Expo message from the stored, snapshot-derived copy. Both reconstructed structures must match the persisted JSON and `message_sha256`. The full occurrence `version_tuple`, not just its hour field, must match. Independent public-retry tests verify malformed/mixed/missing/unknown envelopes cannot be treated as legacy to skip occurrence, location or capability checks.

Tokens are used only to choose and address the provider at send time. Tests use 256-character FCM and Expo target tokens and confirm neither target enters the persisted provider message or its hash.

## TDD evidence

RED was observed before implementation:

```text
AssertionError: expected typeof delivery.qimenPayloadDescriptor to equal "function"; actual "undefined"
```

A second focused RED exposed locale fallback as an attestation gap:

```text
AssertionError: retry rejects a fabricated locale even when it would fall back to English copy; true !== false
```

GREEN after the minimal implementation:

```text
QIMEN_V4_DURABLE_DELIVERY_OK accepted=24 locales=3 providers=2 privacy=2 capability_and_retry_binding=PASS
```

The 24 main reservations cover V3 and V4 across Thai, English, Chinese, FCM, Expo, and both privacy-preview settings. Additional cases cover capability-4 V2 transport compatibility, the complete known capability matrix, V4 downgrade rejection, unknown schemas/capabilities, inherited/accessor/mixed payloads, forged seasonal method and locale, owner changes, forged history/provider/hash combinations, locked-locale copy, both provider envelope shapes, and 256-character targets. The original size assertion measures the credential-free prepared message, **not** a whole HTTP request or a runtime 4,000-byte guard.

The extraction also pins byte-for-byte V3 presentation compatibility with SHA-256 fixtures for all three supported copy languages:

| Locale | Existing V3 copy SHA-256 |
| --- | --- |
| Thai | `787acb7e2fbd8943e317ee3eea5e252cef20c5840e663577e38dc359a98b74d2` |
| English | `24ac71c0bfef94ecb081e933ace54de70208ffa16daeaee359f11b43b8b46673` |
| Chinese | `35f7318424178e68ca4083cf091f210b834e89bf41ac14867eb91b28b57b5ac1` |

## Focused regression results

The focused transport suites below are local pure/in-memory tests. The earlier author also reported running the existing `test-qimen-scheduler.mts`, but that script contains eight live engine calculate POSTs without dependency injection. Its source requests `skip_save: true`, which skips calculation-run persistence in `qimenEngine.js`; this does not prove the absence of all service-side effects. It is excluded from pure-test/no-network evidence and was not replayed by the parent or independent reviewer. No test push was sent to a phone by these transport tests.

| Command | Result |
| --- | --- |
| `npx tsx scripts/test-qimen-v4-durable-delivery.mts` | PASS |
| `npx tsx scripts/test-qimen-three-layer-v4.mts` | PASS: 2 explicit door profiles, 24 branch cases, 216 palace checks |
| `npx tsx scripts/test-qimen-seasonal-scheduler.mts` | PASS |
| `npx tsx scripts/test-qimen-seasonal-root-review.mts` | PASS |
| `npx tsx scripts/test-qimen-push-registration.mts` | PASS |
| `npx tsx scripts/test-qimen-scheduler.mts` | Earlier author-reported PASS; contains live engine requests, excluded from pure evidence |
| `npx tsx scripts/test-qimen-v223-transport-contract.mts` | PASS: historical V2/V3 FCM+Expo compatibility |
| `npx tsx scripts/test-push-send.mts` | PASS: 17 cases |
| `npx tsx scripts/test-ziwei-hourly-v3-reservation.mts` | PASS: 72 cases |
| `npx tsx scripts/test-ziwei-hourly-notification-delivery-contract.mts` | PASS |
| `npx tsx scripts/test-zibai-delivery-contract.mts` | PASS |

Syntax checks passed for the two transport files, the pure presentation module, and the Qimen cron.

## Boundaries and rollback

No migration, preference rewrite, decoder change, credential repair or deployment is performed by this transport implementation. The existing 3,500-byte strict compact limit and V2/V3 wire bytes remain unchanged. Independent size evidence in `remediation-20260905-qimen-v4-transport-independent-review.md` covers 144 branch/profile/language/provider cases: the maximum prepared FCM message is 3,777 B, full HTTP request with a 256-character target is 4,056 B, and notification+data JSON is 3,661 B; Expo full HTTP max is 3,539 B. Twelve full HTTP requests exceed 4,000 B, so the earlier blanket claim was incorrect. No measured payload in that cohort exceeds the documented 4,096-byte provider limit; this is not provider acceptance proof or an exhaustive conditional-warning size proof. See [Firebase limits](https://firebase.google.com/docs/cloud-messaging/error-codes) and [Expo receipt errors](https://docs.expo.dev/push-notifications/sending-notifications/).

Parent read-only PostgreSQL check at `2026-09-05T00:12:53.784Z` found one historical reserved V2 occurrence and zero recoverable unreserved V2 occurrences. Repeat this preflight before release; do not infer end-to-end claimed-V2 recovery or silently recreate historical notices.

Independent public retry review `2dd454d` passes 19 cases, including genuine generic legacy handling and fully stripped modern payloads still bound to an occurrence. Size evidence is committed in `548fae9`. These are bounded reviews, not final goal signatures.

Rollback is the scoped revert of this transport commit. Rollout ordering still requires the additive schema-4 enrollment migration and compatible server code before any capability-4 client creates V4 occurrences. Once a V4 occurrence exists, rollback must not remove V4 readability; it must first stop new V4 creation and drain or retain a V4-capable delivery runtime. This report does not authorize deployment.
