# Qimen seasonal vigor: source and integration audit, 2026-09-05

Status: source/architecture input only, NOT an approval signature or implementation completion. Read-only investigation, except this report. No external engine import, DB writes, push, or deploy. Worktree inspected at initial HEAD `23988a39`; `/root/releases/current` resolves to `/root/releases/decode-app-r573-network-morning-final`.

## Finding

The notification code assigns both stars and doors the same static `chart.wang_xiang_status` array. This is incompatible with the explicit nine-star formula in the locally held 煙波釣叟歌. The array is loaded from a reusable chart row keyed by arrangement, not the current month. Correcting only the array label or the UI does not correct either defect.

The nine-star calculation is source-resolvable. The exact door calculation is NOT uniquely resolved by the local primary corpus: it contains multiple competing methods. The ordinary five-element door table is an existing editorial/system policy, not a formula that can honestly be quoted as the unanimous primary Qimen text. Keep that distinction explicit before choosing a door-method contract.

## Primary anchors, verbatim, with conflicts retained

All paths below are relative to the worktree. Chinese quotes preserve the local transcription's simplified characters. Local corpus content is the evidence; this investigation did not independently authenticate the underlying editions.

### A. Nine stars: explicit Yanbo formula

`data/library/qmdj/yanbo-diaosou-ge.md:60–64`:

> 吉宿更能逢旺相，万举万全必成功，若遇休囚并废没，劝君不必走前程，
> 要识九星配五行，须求八卦考羲经，坎蓬水星离英火，中宫坤艮土为营，
> 乾兑为金震巽木，旺相休囚看重轻，与我同行即为相，我生之月诚为旺，
> 废于父母休于财，囚于鬼兮真不妄，假令水宿号天蓬，相在初冬与仲冬，
> 旺于正二休四五，其余仿此自研穷，急则从神缓从门，三五反复天道亨，

Let `S` be star element and `M` current month-branch element. The explicit formula is:

| Relation | Star state |
|---|---|
| `S` generates `M` | 旺 |
| `S = M` | 相 |
| `S` controls `M` | 休 |
| `M` controls `S` | 囚 |
| `M` generates `S` | 廢 |

The water-star worked example disambiguates the direction of generation: 天蓬 is 旺 in 寅卯, 相 in 亥子, 休 in 巳午. Thus ordinary five-element seasonality cannot substitute for the star formula. `廢` is the traditional rendering of the source's `废`; it is not a primary-source instruction to substitute `死`.

### B. Tongzong nine-star vocabulary variant

`data/library/qmdj/qimen-tongzong-clean.md:130–132`:

> 九星旺相
> 九星旺于子月，相于本月，死于父母月，囚于鬼月，废于妻月。如天蓬水星，正二月旺，十月十一月相，七月八月死，三六九十二月囚，四五月废。

This supports the same 旺/相 relation and explicitly identifies the four earth months for water-star 囚, but differs from Yanbo's names for parent and wife months. Here `子月` means the element's child month, not exclusively branch 子: the following 天蓬 example proves that interpretation. Do not silently combine this variant's `死` with Yanbo's `休` and call it a single verbatim source.

### C. Tongzong doors: primary evidence and competing methods

`qimen-tongzong-clean.md:27` (凡例五):

> 奇门选择最重衰旺休囚，如开门本吉，但其性属金，如临土宫、金位及季夏三秋，所谓得时得地，时之最吉者也；如在春夏而临于木火，则金气大衰，岂得为吉。凡八门皆然，三奇亦然。

This directly supports considering a door's own element, season, and palace rather than reusing star 旺 labels. It supports metal-door favorable earth/metal circumstances, but does not enumerate all five seasonal labels.

`qimen-tongzong-clean.md:771` (暗余氣) explicitly gives another complete door method:

> 余气者，以天上八门之五行，权四时之气候。当时者为旺，我生者为相，我克者为休，克我者为囚，生我者为废。假如休门属水，旺于亥子月，相于寅卯月，休于巳午月，囚于辰戌丑未月，废于申酉月。余仿此。

Its worked water-door example resolves the pronouns: door `D=M` is 旺; `D` generates `M` is 相; `D` controls `M` is 休; `M` controls `D` is 囚; `M` generates `D` is 廢. This is NOT the ordinary five-element door policy, and differs from Yanbo stars by swapping 旺 and 相. It should only be used as an explicitly selected `Tongzong dark-residual-qi` method, not silently substituted for today's door policy.

`qimen-tongzong-clean.md:126–128` contains yet another method, 八節應八門:

> 冬至：休门旺，生门绝，伤门胎，杜门沐，景门死，死门囚，惊门休，开门废。立春生门旺，春分伤门旺，立夏杜门旺，夏至景门旺，立秋死门旺，秋分惊门旺，立冬开门旺，冬至周而复始。

This is an eight-term/eight-door progression with more states, not the five-element monthly classifier requested for the existing notification protocol. Do not fold it into the five-label map.

### D. Editorial material must not masquerade as primary text

`qimen-tongzong-clean.md:402` has an original-looking sequence followed by an explicitly bracketed modern 校註. The correction states:

> 通行五行法當作——春：木旺火相水休金囚土死；夏：火旺土相木休水囚金死；秋：金旺水相土休火囚木死；冬：水旺木相金休土囚火死。系統一律以通行法為準，不採本句訛序。

That is evidence for existing **editorial system policy**, not primary provenance for a door method. The file header still says verbatim, so it is particularly important to exclude this annotation from any purported original quotation.

`data/library/qmdj/auth-th/wangxiang-vigor-th.md` correctly derives the Yanbo star table at lines 31–43, but its introduction extends it to both stars and doors without a door-specific primary anchor. It also records an earlier reference table with reversed 旺/廢 columns. Treat it as secondary explanatory material; use the explicit Yanbo formula, not the reportedly reversed table or the introduction's star/door conflation.

`data/library/qmdj/qimen-faqiao-c4-source-excerpts.md:25` says:

> 然禽星屬土實居中宮，遇辰戌丑未月皆為乘旺，是土旺於四季，此一定不易之氣也。

This is another school/context distinction: general earth-season flourishing in a center-lodging discussion does not override the explicit Yanbo nine-star label 相 for same-element month. Do not blend 飛盤/月家 context formulas into the source-selected hour-star classifier.

## Month and element contracts

Use the **canonical month pillar branch**, not Gregorian month, lunar month ordinal, current palace element, ju number, or chart ID:

| Branch group | Element | Starting Jie boundaries |
|---|---|---|
| 寅卯 | 木 | 立春 / 驚蟄 |
| 辰 | 土 | 清明 |
| 巳午 | 火 | 立夏 / 芒種 |
| 未 | 土 | 小暑 |
| 申酉 | 金 | 立秋 / 白露 |
| 戌 | 土 | 寒露 |
| 亥子 | 水 | 立冬 / 大雪 |
| 丑 | 土 | 小寒 |

Earth months are the complete canonical 辰戌丑未 month windows under this policy. Do not implement a separate 18-day seasonal-earth allocation: no such allocation was established for this contract. The branch mapping is explicit in the secondary local star table and the primary water examples establish its five month groups. The exact astronomical/Jie boundary mechanism is the **existing runtime contract**, not an algorithm quoted from Yanbo.

`src/lib/qimen-canonical-pillars.cjs:34` already computes 年/月 at the global pinned tyme4ts BJT Jie instant and 日/時 from apparent solar time. Reuse `canonicalQimenPillars({instant, longitude}).monthPillarZh`; continue to call `assertEnginePillars`. Do not fork Layer 0/1, add a local calendar/month approximation, or apply TST to the solar-term event instant. `src/lib/zibai-solar-term-runtime.cjs` already supplies half-open month windows from the same Jie timeline.

Component identity remains fixed:

- Stars: 天蓬 water; 天芮/天禽/天任 earth; 天衝/天輔 wood; 天心/天柱 metal; 天英 fire.
- Doors: 休 water; 生/死 earth; 傷/杜 wood; 開/驚 metal; 景 fire.
- Central hour palace keeps 天禽 star vigor and null door/deity; do not invent a center door.
- Month/day context layers currently declare `CONTEXT_VIGOR_NOT_DEFINED`; preserve their null vigor. This remedy does not authorize adding context scoring.

## Calculation contract recommendation

1. Implement one pure, DB-free shared seasonal helper taking validated `monthPillarZh` (or validated branch) plus component kind/code. Return separately named immutable star and door maps, method IDs, month branch/element, and source references. Do not use one ambiguous order for both components.
2. Star method: explicitly version `YANBO_NINE_STAR_MONTH_RELATION_V1` (proposed identifier), states 旺相休囚廢, relations in section A.
3. If approval already selects ordinary five-element doors, preserve and make explicit `STANDARD_FIVE_ELEMENT_DOOR_MONTH_RELATION_V1` (proposed identifier), states 旺相休囚死: `D=M` 旺; `M` generates `D` 相; `D` generates `M` 休; `D` controls `M` 囚; `M` controls `D` 死. Provenance must identify this as editorial/product method selection. Otherwise obtain that method choice or stronger approved primary evidence; this report does not supply a missing approval.
4. Do not use Tongzong 暗余氣 or 八節應八門 as an implicit fallback. Those are distinguishable methods with demonstrably different results.
5. Invalid branch/component/unknown method/mismatched canonical pillars must fail closed. Never fall back to the static stored array.

## Complete five-group truth table

Each entry lists **element order** for the labels specified in the heading; it is not a ranking of intrinsic auspiciousness.

| Month element | Yanbo stars: 旺 相 休 囚 廢 | Ordinary doors, conditional policy: 旺 相 休 囚 死 | Tongzong 暗余氣 doors, alternate only: 旺 相 休 囚 廢 |
|---|---|---|---|
| 木 (寅卯) | 水 木 金 土 火 | 木 火 水 金 土 | 木 水 金 土 火 |
| 火 (巳午) | 木 火 水 金 土 | 火 土 木 水 金 | 火 木 水 金 土 |
| 土 (辰戌丑未) | 火 土 木 水 金 | 土 金 火 木 水 | 土 火 木 水 金 |
| 金 (申酉) | 土 金 火 木 水 | 金 水 土 火 木 | 金 土 火 木 水 |
| 水 (亥子) | 金 水 土 火 木 | 水 木 金 土 火 | 水 金 土 火 木 |

Important policy consequence: under Yanbo stars plus ordinary doors, the eligible 旺/相 element sets overlap in only the current month element. For a fire month, wood/fire stars are strong, fire/earth doors are strong. Reusing the ordinary door map for stars incorrectly promotes earth stars and demotes wood stars. Under the alternative 暗余氣 door method, 旺/相 membership instead matches the Yanbo star membership, although labels differ. This is a material decision difference, not spelling.

## Observed implementation points and integration

- `/root/qimen-api/src/qimenEngine.js:1496`: chart lookup includes system/plate/chart/deity variant, dun, ju, pillar and active version, but no month. Line 1511 parses the stored `wang_xiang_status`. The static chart property therefore cannot establish current month vigor.
- `src/lib/qimen-notification-advisory.cjs:348,586–596`: one map is applied to deity, door, and star; both door/star 旺相 membership gates eligibility before selection.
- `src/lib/qimen-canonical-occurrence-builder.cjs:178–181,233–234`: duplicates the same mapping for all nine hour palaces. Both advisory and builder must consume the shared seasonal helper, or selected evidence and full-grid snapshot can disagree.
- `src/lib/qimen-canonical-pillars.cjs:4`: already imports advisory at module scope for apparent-solar math. Adding a top-level reverse import in advisory creates a CommonJS cycle. Prefer a pure helper with no pillar/advisory imports; advisory can lazily resolve the canonical pillar runtime inside its build function after initialization, while builder passes its independently validated canonical pillars. A broader extraction of time math would be a separate refactor.
- Builder currently validates canonical pillars after receiving a recommended advisory. Validate the month at the advisory boundary too; do not classify using unverified engine pillar text. The builder should still independently verify its supplied engine snapshot.
- A Jie can occur inside a true-solar hour. Because month-sensitive evidence changes at that instant, retain existing fail-closed containment checks or intersect validity with the canonical month window. Do not let a pre-transition vigor snapshot claim validity across a month transition. Any change to occurrence IDs/windows requires a separate contract review, not an incidental UI fix.

## Protocol, provenance, and 廢 compatibility

- `src/lib/qimen-three-layer-notification.cjs:228–233` currently accepts only 旺相休囚死 for both component kinds. Literal Yanbo 廢 will fail snapshot parsing even if the selected star is strong, because all nine hour stars are validated.
- `src/lib/qimen-notification-advisory.cjs:636–638` routes any weak state other than 休/囚 to suffix `SI`; `:779` renders `STAR_VIGOR_SI` as dead 死. Literal 廢 needs an explicit `STAR_VIGOR_FEI` warning and appropriate language copy, not an implicit SI alias.
- Separate allowed states by component method. Do not globally permit any sixth character without checking method/version. Do not re-label historical 死 snapshots to 廢 on read: immutable facts and digests must continue to represent the method used when emitted.
- `wangXiangOrder` in advisory `:670` is singular and currently mirrors the static input. Preserve it only as clearly named raw legacy evidence, or migrate to explicit `starVigorOrder` and `doorVigorOrder` under a versioned contract. It cannot remain authoritative for both.
- `src/lib/mobile-qimen-notification-detail.cjs:33–42` validates stored schema-2/schema-3 snapshots with the strict shared verifier. A simple allowlist replacement can therefore invalidate historical detail records. New and historical contracts need deliberate version routing and tests.
- External engine version `QIMEN_HOUR_NOTIFICATION_PIPELINE_CLOSURE_V6` / dependency closure V2 is pinned in both advisory and `qimen-canonical-source-manifest.cjs`. `/root/qimen-api/src/qimenEngine.js:27–43` closure covers external engine files and package locks, **not** application advisory, canonical pillar code, or the proposed vigor helper. A vigor remedy needs explicit source/method provenance in the application contract (or an intentionally expanded closure); leaving the external engine hash unchanged is not proof of the new classifier's identity.
- Changing external engine files requires recalculated source and closure digests and matching manifest/tests. Do not just replace the pin with an arbitrary value or import the engine merely to compute it: its DB module performs initialization.
- Authoritative mobile candidate subsequently supplied by parent: `/root/worktrees/hourkey-mobile-zibai-v3-p0`, HEAD `dcbbeabfaf442ed52cd1abdd0de92a77bf3db27a`. Its `src/qimen/notificationContract.ts:78–79` type unions and `:542–546` runtime allowlist accept only 旺相休囚死 for both components. `readFullPalaceV3` delegates to that validation, so both full snapshot schemas reject 廢. `:710–717` strictly pins external V6/closure V2 plus digests/runtime/reference profile; `captureRecord` uses exact allowed keys, so adding vigor provenance requires coordinated schema-key updates, not only server output changes.
- Mobile `src/i18n/qimenNotification.ts:56,68,80,92,104,116,128,140,152` labels vigor as 旺相休囚死 across nine locale entries. `src/components/design/qimen/QimenNotificationDetailScreen.tsx:553` renders raw door/star states once parsed, so it can display 廢 but currently never receives an accepted snapshot containing it. Update semantic labels alongside parser/type changes and preserve unrelated shrine/Liuyao vocabularies. Existing relevant tests include `scripts/test-qimen-notification-payload-v2.mts`, `-payload-v3.mts`, `-detail-contract.mts`, and `-render.mts` in that mobile worktree. No mobile code was edited or run here.

## Read-only checks actually run

A Node probe imported only existing application canonical pillar/solar-term helpers (not the external engine). It returned for `2026-06-22T03:00:00Z`, Bangkok longitude `100.5018`:

```text
year 丙午; month 甲午; day 丁卯; hour 乙巳
apparent 2026-06-22 09:40:24
year/month clock PINNED_TYME4TS_BJT_JIE_GLOBAL_V1
```

Thus June witness expected star order is 木火水金土 under Yanbo. The parent-provided engine witness is 陰9/chart1062, stored 火土木水金; this report independently reproduced its canonical pillars but did not re-query its chart row or import the external engine.

The same read-only probe checked canonical month pillars at T−1ms, T, T+1ms:

| Boundary UTC (pinned runtime) | Before | At / after |
|---|---|---|
| 清明 2026-04-04 18:40:00 | 辛卯 | 壬辰 |
| 小暑 2026-07-07 01:56:57 | 甲午 | 乙未 |
| 寒露 2026-10-08 06:29:17 | 丁酉 | 戊戌 |
| 小寒 2026-01-05 08:23:10 | 戊子 | 己丑 |

These are observed pinned-runtime outputs, not an independent astronomical validation. No implementation test suite was run because this subtask only produces source input.

## Required implementation tests

1. All 12 branches × 9 stars, and all 12 branches × 8 doors using the separately approved table. Assert source/method IDs and fifth-state vocabulary. Include 天禽 at center.
2. Each relationship, not just 旺/相: especially water star 巳午=休, earth star 巳午=廢, metal star 巳午=囚; ordinary water door 巳午=囚 and metal door 巳午=死.
3. June witness must derive 木火水金土 for stars regardless of static chart array. Deliberately replace the raw array with a valid wrong permutation, omit it, and corrupt it: none may select a seasonal method or change derived results.
4. All 12 Jie at T−1ms/T/T+1ms over Bangkok/New York/Tokyo longitudes: same month tuple and vigor at the same UTC instant. Assert four earth-month transitions explicitly. Assert intervening Zhongqi does not change month or vigor.
5. Same reusable chart arrangement in different month branches must obtain different seasonal maps. Same branch with different month stems must obtain the same maps.
6. Advisory selected components exactly match builder full-grid components; weak-star/strong-door and strong-star/weak-door cannot become recommended solely through map confusion. Preserve score/hard/soft-warning policy.
7. Invalid month, unknown component, wrong engine pillar, stale source version, and unavailable method fail closed; no array fallback. Context layer vigor remains null.
8. 廢 through canonical serialization/digest/detail response/mobile parser and all language renderers. Include historical schema-2/schema-3 records with 死, plus method-inconsistent labels rejected under the new version. Confirm all nine palaces validate, not only the selected one.
9. Month transition inside true-solar hour cannot produce an occurrence claiming unchanged vigor across the transition. Re-run existing pillar/boundary and notification contract suites after implementation.

## Source fingerprints

```text
yanbo-diaosou-ge.md
cc3a5a5dbc4742467551456b3f296efd7e7c4b36336cbb4b9133162093b5c16e
qimen-tongzong-clean.md (includes modern editorial annotation)
2fa78ecd8ad36c07ff372d2786a0b0c974c7e2761267afd537ab7f9031bc0a51
auth-th/wangxiang-vigor-th.md (secondary summary)
79bc0ba0d6c4c44d217f01e75167bdce92b77566c9ca82a4397dc72658b4b3e4
```

Open gaps: approved exact door method; coordinated mobile compatibility verification after implementation; immutable-history/version migration policy; independent authentication of source editions. No scientific evidence of predictive validity is established by these textual or implementation checks.
