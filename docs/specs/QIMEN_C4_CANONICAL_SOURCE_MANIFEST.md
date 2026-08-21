# Qimen C4 canonical source manifest

Status: source family selected; producer remains disabled until golden fixtures, three signatures, and the real-device canary pass  
Decision date: 2026-08-21

## Release lineages

| Layer | Calculation version | School/method | Decision role |
| --- | --- | --- | --- |
| Month 月家 | `QIMEN_FAQIAO_FEIPAN_YUEJIA_V1` | 《奇門法竅》飛盤月家 | Raw context only |
| Day 日家 | `QIMEN_FAQIAO_FEIPAN_RIJIA_CHAIBU_V1` | 《奇門法竅》飛盤日家超接拆補 | Raw context only |
| Shichen 時家 | existing allowlisted source-verified version for `profile_id=1` | 轉盤時家拆補 with true-solar time | Sole send, direction, purpose, and validity authority |

Month/day and hour are intentionally different chart lineages. They may be juxtaposed only by the same compass palace. They are never averaged, overlaid, relabeled as one flight, or used to reorder the hour result.

## Pinned primary transcription

- Local evidence: `data/library/qmdj/qimen-faqiao-c4-source-excerpts.md`
- Exact byte size: `8597`
- SHA-256: `846e4e9f7393f6451e78f9daa87bea1202ab4b36b6161ba60c570f9f7bd9e690`
- Upstream 卷二: `https://ctext.org/wiki.pl?chapter=118328&if=en`
- Upstream 卷六: `https://ctext.org/wiki.pl?chapter=600483&if=en`
- Work record: `https://ctext.org/wiki.pl?if=en&res=562001`
- Catalog limitation: the upstream base edition is not identified. The manifest therefore identifies a pinned transcription, not a critical edition.

Runtime activation must verify the local evidence digest byte-for-byte. A missing or changed file returns `QIMEN_CANONICAL_SOURCE_DIGEST_MISMATCH` and disables the producer.

## Source-governed rules

### Month 月家

- The complete sexagenary year grouping in `論月奇法` is normative; a branch-only shortcut is forbidden.
- The listed four-Meng groups use one Ju beginning at Kan, the four-Zhong groups use four Ju beginning at Xun, and the four-Ji groups use seven Ju beginning at Dui.
- The passage specifies reverse Six Instruments and forward Three Wonders. The runtime records these as Yin flying arrangements `陰1`, `陰4`, and `陰7` rather than inferring a direction from a modern product label.
- Required grouping fixtures include `甲子 -> 陰1`, `己巳 -> 陰4`, and `甲戌 -> 陰7`, plus every one of the sixty listed years.
- The plate construction follows the work's flying-plate component order. It must not reuse the existing rotating hour chart.

### Day 日家

- Operational count is 24 solar terms: the source text's preserved `四十` is normalized only because the same passage explicitly enumerates two groups of twelve.
- Nominal Yang Ju sequence is `1, 7, 4`; nominal Yin Ju sequence is `9, 3, 6` exactly as transcribed. A `9, 2, 6` sequence from another work is forbidden in this lineage.
- Exact astronomical term instants from the repository-pinned calendar runtime are mandatory. Mean dates and fixed civil dates are forbidden.
- Fu-head is governed by the source's `甲/己` and upper/middle/lower branch classes. Super, receive, split, and supplement transitions must follow a signed decision table and golden boundary fixtures.
- No nearest-Jia-Zi heuristic, range clamp, or default Ju is permitted. An unresolved or out-of-range boundary returns `QIMEN_CONTEXT_BOUNDARY_UNRESOLVED`.
- Worked construction fixtures include the source's Yang 1 `庚子` example and Yin 9 `丁卯` example.

### Components and center lodging

- Nine-star order: `蓬芮衝輔禽心柱任英`.
- Eight-door order: `休死傷杜開驚生景`; a raw door never occupies center five.
- Instruments/wonders order: `戊己庚辛壬癸丁丙乙`, flown in the source-governed Yin/Yang direction.
- Yang center lodging is Gen 8; Yin center lodging is Kun 2. Raw and effective center evidence are retained separately.
- A raw deity never occupies center five. Effective lodging must remain explicit and testable.

## Product rulings, not source quotations

- Month/day validity windows and notification snapshot boundaries are product contracts and must be versioned.
- The first release exposes month/day raw evidence only. It does not call them supportive, cautionary, neutral, or conflicting.
- The hour chart alone selects eligibility and direction.
- Provider TTL is five minutes; late/quiet occurrences are terminal skips and are never replayed in a later shichen.
- Any missing/preliminary/malformed layer fails closed. The old `preliminary_simplified_dmy` engine is permanently forbidden from Qimen C4 notifications.

## Activation gates

The runtime manifest stays `producerEnabled: false` until all of the following refer to the exact same clean source tuple:

1. all month/day source, construction, boundary, mutation, and full-nine-palace fixtures pass;
2. the independent science reviewer signs the exact engine/source digest;
3. the independent delivery reviewer signs the exact backend commit;
4. the independent mobile reviewer signs the exact mobile commit and artifact digest; and
5. that exact artifact receives one natural remote notification in the Android system tray with sound while backgrounded/closed, then opens the digest-matching immutable C4 detail when tapped.

Provider acceptance, an in-app history row, a local test notification, or an emulator result does not satisfy gate 5.
