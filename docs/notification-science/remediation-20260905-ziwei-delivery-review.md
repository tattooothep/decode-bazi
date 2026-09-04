# Ziwei V2/V3 scheduler and delivery integration review

Date: 2026-09-05  
Review type: bounded independent code review; not a deployment, migration execution, production test, or final rollout signature.

## Decision

PASS for the reviewed scheduler/reservation/retry integration. I found no remaining blocking defect in the current working-tree diff after the V3 readable-copy binding correction.

The review covers only:

- `scripts/mobile-ziwei-hourly-push-cron.mts`
- `src/lib/mobile-notification-delivery.cjs`
- `scripts/test-ziwei-hourly-v3-reservation.mts`
- the focused Ziwei scheduler and delivery contract fixtures
- regression isolation for the adjacent Qimen and Zibai delivery branches

It does not certify migration execution, APK behavior, provider credentials, production sending, deployment, or rollout readiness.

## Evidence and invariants

### Schema selection and compatibility

- Scheduler admission selects only explicitly registered schema `2` or `3`; schema `0`, `1`, `4`, and missing capabilities are rejected rather than treated as a future-compatible version.
- A schema-3 registration receives the V3 envelope and schema-3 readable copy. A schema-2 registration retains the historical V2 behavior.
- A sealed V2 attempt remains eligible when the same installation later registers capability 3. This is backward-compatible token upgrading, not a rewrite of the reserved payload.
- A sealed V3 attempt is terminally rejected after a capability downgrade to 2, and capabilities `0`, `1`, and `4` are also rejected. Mixed V2/V3 and extra-key envelopes are rejected before transaction admission.

### Immutable occurrence, provenance, and exact retry

- Reservation locks the token, occurrence, and installation binding and rechecks user, installation, profile, owner generation, calculation lineage/version, window, deadline, snapshot digest, and payload reconstructed from the immutable occurrence snapshot.
- V3 source facts bind the payload schema, readable-copy version, readable-copy catalog SHA-256, meaning catalog SHA-256, and the reservation-time account presentation locale.
- The initial review found a real gap: valid catalog constants alone did not prove that stored public copy came from the catalog and immutable snapshot. A caller could have supplied matching forged parent/provider copy and recomputed message hash.
- The corrected V3 reservation path now regenerates the exact readable copy from the immutable occurrence snapshot and the account locale read during reservation, rejects a mismatched `historyCopies` value before insert, and persists that presentation locale in immutable source facts.
- Retry attestation regenerates both the exact schema-specific payload and the exact V3 public copy from the immutable snapshot plus persisted historical locale. It then verifies the sealed provider message and its SHA-256 before the existing prepared message is sent. A later account-locale change cannot rewrite an already reserved message.
- Historical V2 attempts remain on their previous attestation contract and are not retroactively required to contain V3 presentation provenance.

### Privacy and branch isolation

- With lock-screen preview enabled, V3 visible copy equals the snapshot-derived, reservation-locale history copy. With preview disabled, the provider message contains only the localized private placeholder while the in-app parent history retains the canonical readable copy.
- The existing retry privacy check remains fail-closed: a public sealed attempt cannot be sent after preview is disabled.
- The delivery diff changes selection only inside the Ziwei branch; Qimen V3 copy behavior and generic/Zibai behavior are otherwise unchanged. Focused Qimen and Zibai pure contracts remained green.

## Independent RED/GREEN record

Before the copy-binding correction, the new adversarial retry assertion failed:

```text
matching forged history/provider/hash cannot replace snapshot-derived readable meaning
actual: true
expected: false
```

After the correction, I independently reran:

```text
node --import tsx scripts/test-ziwei-hourly-v3-reservation.mts
ZIWEI_V3_RESERVATION_OK accepted=72 providers=2 locales=9 privacy=2 immutable_and_capability_fences=PASS (in-memory only)

node --import tsx scripts/test-ziwei-hourly-scheduler.mts
PASS Ziwei hourly scheduler — self profile, immutable occurrence, factual copy, hard release gates

node --import tsx scripts/test-ziwei-hourly-notification-delivery-contract.mts
PASS Ziwei hourly delivery contract — immutable binding, consent, expiry, privacy, no generic cap

node --import tsx scripts/test-ziwei-hourly-readable-copy.mts
ZIWEI_HOURLY_READABLE_COPY_OK locales=9 cases=126 bodyMax=361 FCM=3882B Expo=3593B

node --import tsx scripts/test-ziwei-hourly-wire-v3.mts
PASS Ziwei V3 bounds, malformed corpus, all-field roundtrip and 9-locale size matrix

node --import tsx scripts/test-qimen-scheduler.mts
qimen dedicated scheduler policy tests passed

node --import tsx scripts/test-zibai-delivery-contract.mts
ZIBAI_DELIVERY_CONTRACT_OK
```

`git diff --check` was clean. All verification above was local and pure/in-memory; no production database, migration, service, sender, credential, push, deploy, or full build was invoked.

## Remaining rollout boundary

This review does not change the required rollout order: deploy the server compatibility code and additive expand migration before enrolling APK schema 3. Rollback must preserve schema-3 acceptance for already registered installations and their immutable delivery evidence. The separate Expo credential repair still requires external EAS project authority and is not resolved by this integration patch.
