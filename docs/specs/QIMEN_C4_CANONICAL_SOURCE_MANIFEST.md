# Qimen C4 canonical source manifest

Status: editorial 日家 boundary and center-lodging rulings adopted; independent signatures pending; producer disabled
Decision date: 2026-08-21

## Release lineages

| Layer | Calculation version | School/method | Decision role |
| --- | --- | --- | --- |
| Month 月家 | `QIMEN_FAQIAO_FEIPAN_YUEJIA_V1` | 《奇門法竅》飛盤月家 | Raw context only |
| Day 日家 | `FAQIAO_RIJIA_FOUR_QI_TERM_BOUNDARY_V1` | 《奇門法竅》飛盤日家 + explicit nominal four-qi boundary policy (not 拆補) | Raw context only |
| Shichen 時家 | `QIMEN_ZHUANPAN_SHIJIA_CHAIBU_TST_V1`, bound to the allowlisted source-verified engine for `profile_id=1` | 轉盤時家拆補 with true-solar time | Sole send, direction, purpose, and validity authority |

Month/day and hour are intentionally different chart lineages. They may be juxtaposed only by the same compass palace. They are never averaged, overlaid, relabeled as one flight, or used to reorder the hour result.

## Pinned primary transcription

- Local evidence: `data/library/qmdj/qimen-faqiao-c4-source-excerpts.md`
- Exact byte size: `10629`
- SHA-256: `987997fa7ee6cbd148c337272975ac14c3b7e720f392d7671f93549b9315a460`
- Upstream 卷二: `https://ctext.org/wiki.pl?chapter=118328&if=en`
- Upstream 卷六: `https://ctext.org/wiki.pl?chapter=600483&if=en`
- Work record: `https://ctext.org/wiki.pl?if=en&res=562001`
- Catalog limitation: the upstream base edition is not identified. The manifest therefore identifies a pinned transcription, not a critical edition.

Runtime activation must verify the local evidence digest byte-for-byte. A missing or changed file returns `QIMEN_CANONICAL_SOURCE_DIGEST_MISMATCH` and disables the producer.

## Pinned hour engine contract

- Contract version: `QIMEN_HOUR_ENGINE_CANONICAL_CLOCKS_V2`
- Engine profile: `1`
- Exact `/root/qimen-api/src/qimenEngine.js` SHA-256: `7848711e49126054883a37b53e229d2e294eff07ba5eb0db38b08bb824e0db84`
- Apparent-solar coordinate: `UTC + 4 × longitude + equation-of-time`, interpreted as a timezone-free monotonic coordinate
- Shichen policy: half-open `[boundary_n,boundary_n+1)` with no DST gap, overlap, or reversal
- Year/month pillars: pinned astronomical Jie instants on the global Beijing-time lineage; day/hour pillars: canonical apparent-solar date with Zi beginning at 23:00

The occurrence builder compares the independent canonical pillars and the exact engine contract tuple with the engine response. Any mismatch fails closed before an occurrence can be reserved.

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
- The pinned source does not continuously resolve Fu-head/超接拆補 for this product. The adopted nominal profile is `[T,next selected four-Qi boundary)` at the astronomical instant with no carry: 冬至→陽1, 雨水→陽7, 穀雨→陽4, 夏至→陰9, 處暑→陰3, 霜降→陰6. It must be labeled with its exact version and never as 拆補. The 卷六 `冬至丁未` example is a 時家/36-Ju example and is forbidden as proof of a 日家 60-day transition.
- The profile intentionally makes no claim about five-day Fu-head state. No nearest-Jia-Zi heuristic, range clamp, or silent default Ju is permitted; an unavailable astronomical boundary fails closed.
- Literal construction fixtures cover Yang 1 `庚子`, Yang 7 `庚子`, Yang 4 `甲戌`, Yin 9 `丁卯`, Yin 3 `丁卯`, and Yin 6 `甲戌`, including the two source-worked plates.

### Components and center lodging

- Nine-star order: `蓬芮衝輔禽心柱任英`.
- Eight-door order: `休死傷杜開驚生景`; a raw door never occupies center five.
- Instruments/wonders order: `戊己庚辛壬癸丁丙乙`, flown in the source-governed Yin/Yang direction.
- Raw center evidence and effective lodging evidence are retained separately. The work contains a 卷二 seasonal-four-corner lodging statement and a competing 卷六 Yang-to-Gen/Yin-to-Kun statement.
- The release candidate explicitly selects `FAQIAO_VOL6_FIXED_YINYANG_LODGING_V1`: Yang effective lodging is Gen 8 and Yin effective lodging is Kun 2. This is a versioned product policy, not a claim of unanimity inside the work. It may annotate an effective display palace but may not move, delete, or duplicate palace-5 raw data or create a ninth raw door/deity.
- A raw deity never occupies center five. Effective lodging must remain explicit and testable.

## Product rulings, not source quotations

- Month/day validity windows and notification snapshot boundaries are product contracts and must be versioned.
- The first release exposes month/day raw evidence only. It does not call them supportive, cautionary, neutral, or conflicting.
- The hour chart alone selects eligibility and direction.
- Every immutable layer records its state, deterministic explanation codes, declared source conflicts, explicitly unavailable fields, boundary policy, and all nine palaces. Month/day retain raw and effective center-lodging targets separately. Hour palaces retain available vigor and clash evidence.
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
