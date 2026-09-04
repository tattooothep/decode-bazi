# Ziwei readable Type-C copy — implementation evidence

Status: additive, opt-in implementation tested; NOT production activation, APK release, phone-delivery proof, or a final goal signature.

## Reproduced defects

1. The actual Thai 2026-09-04T22:00Z witness produced title `紫微流時 · ยาม 癸卯 · 遷移`. The old 360-byte copy fallback removed ordinary-language meaning and target-palace context. The new test initially ran that actual old function and failed its Thai-readable science-name assertion.
2. Integrating a strict V3 envelope with the shared provider adapter initially inserted an extra `url` field. The new exact-envelope assertion failed on `[notificationId,url,ziweiHourlyV3]`; the mobile V3 decoder expects only `[notificationId,ziweiHourlyV3]`. The adapter now treats an exact Ziwei V3 envelope the same way as exact V2. It does not broaden arbitrary envelopes or change other science branches.

## Implemented behavior

- `buildZiweiHourlyCopy(locale,snapshot,{schema:3})` verifies the immutable snapshot and selects a new readable formatter. Calls without the explicit option continue to select the old V2-compatible formatter. No scheduler or registration has been switched by this change.
- All nine supported locales keep the FULL four-transformation meanings from the existing reviewed presentation catalog. Only palace-topic summaries are shortened; the full palace descriptions remain in the existing offline detail presentation.
- Support (祿/科), drive/pressure (權), and caution (忌) remain distinct. Each visible transformation includes its localized meaning, localized target topic, original star/transformation name, and known raw target-palace name.
- Month, day and hour focuses remain separately named and localized. A real witness has three distinct focuses: 官祿, 田宅, 遷移. All three full raw layers remain in the lossless V3 payload and the unchanged resolved V2 detail representation.
- Constant hourly flow-star presence is not presented as a selective good-hour reason. No overall lucky score, promise, disaster claim, or hybrid science rule is added.
- Unknown palace names are explicitly marked unavailable, not assigned an invented topic. Exact unsupported input is retained in the valid immutable payload for inspection. The small notification shows `?` rather than repeating an unsupported potentially long raw label seven times.
- No raw-only fallback or string truncation is used in the new formatter. The unchanged title/body limits are 120/400 characters; tests retain the conservative whole-request 4000-byte ceiling (4096 minus 96 bytes).

Readable catalog version: `ziwei-hourly-readable-copy-v1`.

Readable catalog SHA256: `23ea576b5cd9fb95c7102315620980dff1637e11540d7f07d10d090eb1f732e6`.

## Verification

- `npx tsx scripts/test-ziwei-hourly-readable-copy.mts`: GREEN, nine locales × 14 known/unknown cases = 126. Checks exact tone-line membership, all hourly flow-star exclusion, distinct layers, valid unknown-palace snapshot/digest/transport, V2 unchanged defaults, and exact FCM/Expo outer envelope. Maximum body 361 characters; FCM whole request 3882 B with a 256-character synthetic token; Expo 3593 B.
- `ZIWEI_MOBILE_ROOT=/root/worktrees/hourkey-mobile-zibai-v3-p0 ZIWEI_READABLE_COPY_MATRIX=1 npx tsx scripts/test-ziwei-hourly-wire-v3.mts`: GREEN cross-runtime lossless codec checks; 27 snapshots / 243 locale cases. Readable integration probe has zero failures, FCM max 3807 B / Expo max 3518 B. Includes 24 actual hourly engine samples, null placements, and synthetic maximum-length unknown labels. Size stress is not evidence of scientific correctness of a fabricated chart.
- `npx tsx scripts/test-push-send.mts`: 17 checks pass, mocked provider calls only; no real push.
- Existing `test-ziwei-hourly-type-c-presentation`, `test-ziwei-hourly-notification-payload`, `test-ziwei-hourly-notification-delivery-contract`: GREEN unchanged V2 behavior.
- Independent bounded review: `remediation-20260905-ziwei-readable-review.md`. The reviewer did not author the implementation.

## Still required before rollout

Schema-3 capability enrollment and safe database expansion; installation-specific scheduler selection; exact V2/V3 reservation and retry attestation; preservation of pre-existing sealed attempts; mobile registration and navigation regression checks; presentation provenance for newly emitted copies; actual release builds, staged rollback-compatible deployment, eligible device receipt/detail evidence, and the goal's five independent final signatures.

This is presentation/transport work. It does not certify classical consensus or empirically guaranteed outcomes, alter the chosen iztro lineage, rewrite old history, change user preferences, or activate R8/Qizheng predictions.
