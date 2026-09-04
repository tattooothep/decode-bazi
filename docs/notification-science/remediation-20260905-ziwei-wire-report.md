# Ziwei V3 lossless transport — implementation evidence, 2026-09-05

Scope: transport codec and mobile acceptance only. No enrollment, activation, native push, scheduler, provider-limit, presentation or science-engine changes are part of this patch. This is not a deployment/final approval.

## Contract

`buildZiweiHourlyProviderData(snapshot)` remains V2. Only explicit `{ schema: 3 }` emits `{ ziweiHourlyV3: <base64url> }`. The mobile provider envelope additionally requires the existing UUID `notificationId`. V2 and V3 keys together are rejected. Both transport parsers expand to the existing V2 compact/resolved evidence schema; the offline evidence screen receives no new schema or fetch requirement.

V3 is canonical UTF-8 JSON `[3, stringTable, identity, month, day, hour]`, unpadded base64url. Exact typed tuple layout and traversal are documented in `src/lib/ziwei-hourly-wire-v3.cjs` and mobile `src/ziwei/hourlyWireV3.ts`. String interning is deterministic first encounter, with no compression dependency. All nine string identity fields, numeric/boolean/date identities, original raw names, ordered four SiHua rows, ordered ten flow rows per layer and nullable placements are reconstructed exactly. The original snapshot digest is preserved; its shape and full source-snapshot signing remain the existing responsibilities, not a new client-side digest claim.

Bounds: maximum 3500 base64 characters before byte decoding, 128 table entries, 300 UTF-16 code units per string, 6000 total string code units, exact tuple/row lengths and safe nonnegative integer references. Sparse/custom-key/custom-prototype/accessor arrays and unsupported fields are rejected without invoking getters/toJSON. Row descriptors are captured before validation and canonical comparison. Duplicate/unused/reordered string tables and noncanonical JSON/base64 encodings fail closed. V3 has no object positions, so duplicate object keys cannot enter an accepted tuple. Expanded data then traverses the historical account/profile/source/date/window/schema/digest validators. Mobile additionally enforces the logged-in account equality exactly as V2 did.

## RED → GREEN

Initial test failures before implementation:

- Backend explicit schema 3 still produced `ziweiHourlyV2` (assertion failed).
- Mobile returned null for a fixed independently constructed V3 tuple (assertion failed).

After implementation:

- Actual baseline snapshot: V2 provider data **3092 B**, V3 **2314 B**, exact all-field deep equality.
- 27-fixture matrix: baseline, nullable placements in all three layers, 24 actual hourly engine samples, and one explicitly synthetic maximum-20-character palace-label transport stress fixture. Synthetic fixture is not scientific evidence.
- Nine locales × 27 fixtures = **243** transport budget cases. Largest V3 provider data **2355 B**. Minimum title/body byte allowance **1465 B** in the test's Expo-shaped envelope; all cases leave at least 1200 B under the unchanged 4000 B guard.
- Optional parent-readable-copy integration probe uses real `push.prepareMessage`, a 256-byte FCM token and full final request serialization. Observed maximum FCM **3877 B**, Expo **3584 B** among rendered cases. All actual/null snapshots fit. The invented 20-character palace stress label is rejected by the separate readable renderer in th/en/vi/ru/es with `ziwei_hourly_readable_copy_too_long`; the codec still roundtrips it exactly. No renderer fallback or shortening was added here.
- Historical renderer independently rejects all nine maximum-length synthetic-label cases; recorded separately, not hidden as successful copy cases.

Passing commands (no full builds, DB, push delivery or deployment):

```sh
# Backend worktree
ZIWEI_MOBILE_ROOT=/root/worktrees/hourkey-mobile-zibai-v3-p0 npx tsx scripts/test-ziwei-hourly-wire-v3.mts
npx tsx scripts/test-ziwei-hourly-notification-payload.mts
npx tsx scripts/test-ziwei-hourly-notification-delivery-contract.mts
# Optional parent integration probe, reports copy-specific failures separately
ZIWEI_READABLE_COPY_MATRIX=1 npx tsx scripts/test-ziwei-hourly-wire-v3.mts

# Mobile worktree
node --no-warnings --experimental-strip-types scripts/test-ziwei-hourly-wire-v3.mts
node --no-warnings --experimental-strip-types scripts/test-ziwei-hourly-notification-contract.mts
node --no-warnings --experimental-strip-types scripts/test-ziwei-hourly-notification-wiring.mts
npx tsc --noEmit --strict --target es2022 --module nodenext --moduleResolution nodenext --allowImportingTsExtensions --skipLibCheck --ignoreConfig src/ziwei/hourlyWireV3.ts src/ziwei/hourlyNotificationContract.ts
```

The cross-runtime matrix checks backend/mobile pack and unpack parity, every compact field and digest, and equal historical/new resolved payloads wherever the historical envelope is inside its existing mobile limit. Pure mobile tests do not require a server checkout. Both new test suites reject invalid references, table limits, tuple widths/counts, source/identity/date/window mismatches, duplicate SiHua types, unknown fields, foreign owners, malformed base64/UTF-8 and noncanonical JSON.

Read before mobile edits: project AGENTS and official Expo SDK 56 reference, https://docs.expo.dev/versions/v56.0.0/ (SDK56/RN0.85). The codec is pure TypeScript; no new Expo/native dependency or configuration is needed.

## Integration and rollback

Parent still owns coordinated capability enrollment, V3 selection only for proven V3 clients, readable-copy pairing and final whole-provider-request validation/approval. Existing registrations must not receive V3 by default. Preserve historical V2 occurrence resolution and offline data. `snapshots` is exported from the backend codec test for the parent matrix; optional cross-runtime and readable-copy probes are explicit environment-controlled test-only paths.

Rollback is reverting these scoped codec/parser/test/declaration commits; no data migration or external state needs restoration. Do not revert unrelated presentation/readiness work in the shared worktrees.
