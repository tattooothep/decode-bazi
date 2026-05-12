# P0-002 · §11 Day Activity · Test Case Matrix

**Matrix ID:** `P0-002_TEST_CASE_MATRIX`
**Version:** v0.1 (draft · sinsae-pending)
**Date:** 2026-05-12
**Audience:** dev · sinsae × 3 · QA · finance reviewer · medical reviewer
**Doc type:** read-only test matrix · ไม่ใช่ implementation
**Companion:** `docs/specs/P0-002_DAY_ACTIVITY_PRODUCTION_RULE_SPEC.md`

> ⚠ ห้าม implement code · ห้ามแก้ Google Sheet · ห้ามแก้ `data/i18n/*` · ห้ามแก้ `formula.json` · ห้าม approve/lock rows · ห้าม sync production · ห้ามแตะ `public/*.html` · ห้ามแตะ auth/API/lib · เอกสารนี้เป็น test matrix ภายในเพื่อรอ implement หลังซินแส approve

---

## 1. Purpose

Matrix ฉบับนี้ระบุชุด test case ที่ engine §11 Day Activity ต้องผ่านก่อนเข้า production · ครอบคลุม:

- positive trigger ของแต่ละ activity (6 ตัว)
- block conditions และ fallback ไป `activity_rest`
- edge case ของ money / travel / meeting / work / health
- null / default / mixed signal
- wording guardrail per case

เป้าหมาย: ให้ซินแส 3 ท่าน + finance + medical reviewer ใช้ matrix นี้ตรวจสอบ formula ก่อนเปิด G1-G3 ใน spec PR #8 · และให้ dev ใช้เขียน unit test หลัง approve

---

## 2. Source spec reference

| spec | path |
|---|---|
| Production rule spec | `docs/specs/P0-002_DAY_ACTIVITY_PRODUCTION_RULE_SPEC.md` |
| Formula registry | `data/i18n/formula.json:daily.§11.day_activity` (`requires_sinsae_formula:true` · `status:needs_sinsae`) |
| Staging text | `data/i18n/decode.staging.json:activity_*` (6 codes) |
| Code registry | `data/i18n/code-registry/natal-daily-overview.json` (ไม่ครอบคลุม activity_*) |
| Interaction matrix | `data/sesheta-v8/decode-interaction-matrix.json` (11 trigger types) |
| Stars detector | `data/sesheta-v6/decode-stars-detector.js` (天乙·文昌·桃花·驛馬·華蓋·將星·天德) |
| Star activation | `data/sesheta-v8/decode-star-activation-by-transit.js` (domain tagging) |
| Sheet of record | `07 · Frontend_Text 💬` row 69–74 (status: `needs_sinsae_review`) |

---

## 3. Global expected rules (อ้างจาก spec section 2)

```
Priority order:
  Block rule (blocker_state != none)    >  Trigger rule
  忌神 filter                            >  positive trigger
  fallback default                       =  activity_rest
```

Resolution:

| signal | expected_activity |
|---|---|
| positive trigger + 用神 filter + ไม่มี blocker | activity ตาม trigger (high confidence) |
| positive trigger + neutral filter + ไม่มี blocker | activity ตาม trigger (medium confidence) |
| positive trigger + 忌神 filter | `activity_rest` (block fallback) |
| trigger ขัดกัน mixed | `activity_rest` (mixed → fallback) |
| ไม่มี trigger active | `activity_rest` (default) |
| hard blocker (沖/刑/害 day) | `activity_rest` (block > trigger) |
| red-flag keyword (health) | `BLOCKED` (ไม่ emit) |

Special:
- `activity_health` **ห้าม emit เป็น output โดยตรง** · รวมเป็น `activity_rest` recovery wording
- `activity_travel` ห้ามใช้ `六沖` เป็น trigger (driver bug ที่ป้องกัน)
- `activity_money` ต้อง block ถ้า 財 = `忌神` หรือ `比劫/劫財` แรง

---

## 4. Test case matrix

ค่าใน column ใช้ shorthand:
- `trigger_state`: `文昌+` (active), `天乙+`, `驛馬+`, `wealth+` (財星 visible), `六合+`, `三合+`, `none`
- `filter_state`: `yongshen`, `xishen`, `jishen`, `neutral`, `unknown`
- `qi_phase`: `長生·沐浴·冠帶·臨官·帝旺·衰·病·死·墓·絕·胎·養`
- `blocker_state`: `none`, `chong_day` (六沖日支), `xing_day` (三刑), `hai_day` (六害), `po_day` (六破), `zi_xing` (自刑), `wealth_chong`, `bijie_strong`, `red_flag`, `mixed_hard`
- `expected_confidence`: `high`, `medium`, `low`, `fallback`
- `priority_rule_applied`: ระบุเลขข้อจาก spec section 4.5 (1-6)
- `reviewer_status`: `needs_sinsae`, `needs_finance_review`, `health_blocked`, `ready_for_dev_test`

### 4.1 Base positive cases (5 cases)

| test_id | activity_target | trigger_state | filter_state | qi_phase | blocker_state | expected_activity | expected_confidence | priority_rule_applied | rationale | reviewer_status | wording_guardrail |
|---|---|---|---|---|---|---|---|---|---|---|---|
| TC-WORK-01 | work | `文昌+` `yongshen_in_hour+` `output_star+` | yongshen | 臨官 | none | activity_work | high | 3 | positive trigger × 用神 × phase strong | needs_sinsae | "ปิดงาน/สมาธิ" · ห้าม "งานสำเร็จแน่" |
| TC-MONEY-01 | money | `wealth+` `stem_he_wealth+` | yongshen | 帝旺 | none | activity_money | high | 3 | wealth = 用神 + phase strong + no clash | needs_finance_review | "ทบทวนตัวเลข/วางงบ" · ห้ามแนะนำสินทรัพย์ · disclaimer "ไม่ใช่คำแนะนำการลงทุน" |
| TC-MEETING-01 | meeting | `天乙+` `六合+` `stem_he+` | yongshen | 冠帶 | none | activity_meeting | high | 3 | nobleman + 六合 + 用神 filter ตรง | needs_sinsae | "เปิดบทสนทนา/สรุปข้อตกลง" · ห้าม "ปิดดีลแน่" |
| TC-TRAVEL-01 | travel | `驛馬+` (hour ∈ 寅申巳亥) | neutral | 臨官 | none | activity_travel | high | 3 | 驛馬 anchor + movement branch + no clash | needs_sinsae | "เช็กเอกสาร/แผนสำรอง" · ห้าม "เดินทางปลอดภัยแน่" |
| TC-REST-DEFAULT-01 | rest | none | neutral | 帝旺 | none | activity_rest | fallback | 6 | ไม่มี trigger active · default fallback | ready_for_dev_test | "ทบทวนแผน/พักแบบมีเป้าหมาย" · ห้าม fear-based |

### 4.2 Hard block cases — clash/harm/punishment (8 cases)

| test_id | activity_target | trigger_state | filter_state | qi_phase | blocker_state | expected_activity | expected_confidence | priority_rule_applied | rationale | reviewer_status | wording_guardrail |
|---|---|---|---|---|---|---|---|---|---|---|---|
| TC-BLOCK-CHONG-01 | (any) | `文昌+` | neutral | 臨官 | `chong_day` | activity_rest | fallback | 1 | 六沖 day → block ทุก positive · ใช้ rest | needs_sinsae | "ชะลอ/ทบทวน" · ห้าม fear-based |
| TC-BLOCK-CHONG-02 | (any) | `天乙+` `六合+` | yongshen | 冠帶 | `chong_day` | activity_rest | fallback | 1 | block > trigger · nobleman แพ้ chong | needs_sinsae | "ชะลอ" · ห้ามแนะนำ meeting |
| TC-BLOCK-XING-01 | (any) | `wealth+` | yongshen | 帝旺 | `xing_day` | activity_rest | fallback | 1 | 三刑 day → block money | needs_finance_review | "ชะลอ" · ห้ามแนะนำการเงิน |
| TC-BLOCK-HAI-01 | (any) | `驛馬+` | neutral | 臨官 | `hai_day` | activity_rest | fallback | 1 | 六害 day → block travel | needs_sinsae | "ชะลอ" · ห้ามแนะนำ travel |
| TC-BLOCK-PO-01 | (any) | `wealth+` | yongshen | 帝旺 | `po_day` | activity_rest | fallback | 1 | 六破 day → block | needs_finance_review | "ชะลอ/ทบทวน" |
| TC-BLOCK-ZIXING-01 | (any) | `文昌+` | neutral | 衰 | `zi_xing` | activity_rest | fallback | 1 | 自刑 day → block work | needs_sinsae | "พักแบบมีเป้าหมาย" |
| TC-BLOCK-MIXED-01 | (any) | `文昌+` `驛馬+` `天乙+` | yongshen | 臨官 | `chong_day` | activity_rest | fallback | 1 | mixed positive + hard block → fallback | needs_sinsae | "ชะลอ" · บอกเหตุผลด้วย neutral tone |
| TC-BLOCK-MIXED-02 | (any) | `wealth+` `天乙+` | yongshen | 帝旺 | `xing_day` `hai_day` | activity_rest | fallback | 1 | double blocker · ปลอดภัย fallback | needs_sinsae | "ทบทวน/พัก" |

### 4.3 Money risk cases (6 cases)

| test_id | activity_target | trigger_state | filter_state | qi_phase | blocker_state | expected_activity | expected_confidence | priority_rule_applied | rationale | reviewer_status | wording_guardrail |
|---|---|---|---|---|---|---|---|---|---|---|---|
| TC-MONEY-BLOCK-01 | money | `wealth+` | jishen | 帝旺 | none | activity_rest | fallback | 2 | 財 = 忌神 → block | needs_finance_review | "ทบทวนงบ" · ห้ามแนะนำลงมือเรื่องเงิน |
| TC-MONEY-BLOCK-02 | money | `wealth+` (身弱財旺) | jishen | 衰 | `bijie_strong` | activity_rest | fallback | 2 | 身弱財旺 → wealth crush DM · block | needs_finance_review | "ทบทวน/พัก" · ห้ามแตะการเงิน |
| TC-MONEY-BLOCK-03 | money | `wealth+` `bijie+` | neutral | 帝旺 | `bijie_strong` | activity_rest | fallback | 1 | 比劫/劫財 strong → rob wealth · block | needs_finance_review | "ชะลอ" · ห้าม "ลงทุน/ปล่อยเงิน" |
| TC-MONEY-BLOCK-04 | money | `wealth+` | yongshen | 帝旺 | `wealth_chong` | activity_rest | fallback | 1 | wealth pillar โดน 沖 → block | needs_finance_review | "ทบทวน" · ห้ามแตะตัวเลข |
| TC-MONEY-BLOCK-05 | money | `wealth+` | yongshen | 墓 | none | activity_rest | fallback | 2 | wealth_qi_phase ∈ {墓,絕} → block | needs_finance_review | "ทบทวน/วางแผน" |
| TC-MONEY-PASS-01 | money | `wealth+` `stem_he_wealth+` | xishen | 臨官 | none | activity_money | medium | 4 | wealth = 喜神 + no clash · positive | needs_finance_review | "ทบทวนตัวเลข" · ใส่ disclaimer |

### 4.4 Travel cases (5 cases)

| test_id | activity_target | trigger_state | filter_state | qi_phase | blocker_state | expected_activity | expected_confidence | priority_rule_applied | rationale | reviewer_status | wording_guardrail |
|---|---|---|---|---|---|---|---|---|---|---|---|
| TC-TRAVEL-02 | travel | `驛馬+` (hour 寅) | neutral | 長生 | none | activity_travel | high | 3 | 驛馬 + movement branch + clean | needs_sinsae | "เช็กเส้นทาง/เอกสาร" |
| TC-TRAVEL-NO-CHONG-01 | travel | `chong_only+` (no 驛馬) | neutral | 臨官 | `chong_day` | activity_rest | fallback | 1 | **六沖 ไม่ใช่ travel trigger** · ใช้ rest | needs_sinsae | "ชะลอ" · ห้ามแนะนำเดินทาง |
| TC-TRAVEL-BLOCK-01 | travel | `驛馬+` | neutral | 臨官 | `chong_day` | activity_rest | fallback | 1 | 驛馬 + chong day → block (hazard) | needs_sinsae | "ชะลอ/พัก" |
| TC-TRAVEL-BLOCK-02 | travel | `驛馬+` | jishen | 病 | none | activity_rest | fallback | 2 | 驛馬 = 忌神 → block travel | needs_sinsae | "ทบทวน/พัก" |
| TC-TRAVEL-BLOCK-03 | travel | `驛馬+` | neutral | 臨官 | `xing_day` | activity_rest | fallback | 1 | 三刑 active → block movement | needs_sinsae | "ชะลอ" |

### 4.5 Meeting cases (5 cases)

| test_id | activity_target | trigger_state | filter_state | qi_phase | blocker_state | expected_activity | expected_confidence | priority_rule_applied | rationale | reviewer_status | wording_guardrail |
|---|---|---|---|---|---|---|---|---|---|---|---|
| TC-MEETING-02 | meeting | `三合+` `stem_he+` | yongshen | 臨官 | none | activity_meeting | high | 3 | 三合 strong + 用神 filter | needs_sinsae | "ฟังครบ/สรุปข้อตกลง" |
| TC-MEETING-03 | meeting | `天乙+` | neutral | 冠帶 | none | activity_meeting | medium | 4 | nobleman alone + neutral filter | needs_sinsae | "เปิดบทสนทนา" · no relationship guarantee |
| TC-MEETING-BLOCK-01 | meeting | `天乙+` `六合+` | yongshen | 冠帶 | `chong_day` | activity_rest | fallback | 1 | block > trigger · nobleman+六合 แพ้ 沖 | needs_sinsae | "ชะลอ" · ห้ามแนะนำเจรจาใหญ่ |
| TC-MEETING-BLOCK-02 | meeting | `天乙+` | jishen | 冠帶 | `hai_day` | activity_rest | fallback | 1 | nobleman = 忌神 + 害 day → block | needs_sinsae | "ชะลอ/พัก" |
| TC-MEETING-BLOCK-03 | meeting | `天乙+` `六合+` | yongshen | 冠帶 | `xing_day` | activity_rest | fallback | 1 | 三刑 active แม้ nobleman+六合 | needs_sinsae | "ชะลอ" |

### 4.6 Work cases (5 cases)

| test_id | activity_target | trigger_state | filter_state | qi_phase | blocker_state | expected_activity | expected_confidence | priority_rule_applied | rationale | reviewer_status | wording_guardrail |
|---|---|---|---|---|---|---|---|---|---|---|---|
| TC-WORK-02 | work | `文昌+` `output_star+` | yongshen | 長生 | none | activity_work | medium | 4 | wen_chang + output star · phase กลาง | needs_sinsae | "ปิดงาน/สมาธิ" |
| TC-WORK-BLOCK-01 | work | `文昌+` | neutral | 臨官 | `chong_day` | activity_rest | fallback | 1 | 沖 day แม้มี 文昌 → block | needs_sinsae | "ชะลอ" |
| TC-WORK-WEAK-01 | work | `output_star+` `yongshen+` | yongshen | 死 | none | activity_rest | fallback | 2 | DM qi_phase 死/絕 → ไม่มีแรงทำงาน · mark `needs_sinsae` (อาจเปิด `activity_work_weak` ในอนาคต) | needs_sinsae | "พักแบบมีเป้าหมาย" · ห้ามฝืน |
| TC-WORK-WEAK-02 | work | `文昌+` | yongshen | 絕 | none | activity_rest | fallback | 2 | DM 絕 phase · แม้ wen_chang + 用神 · ยังต้อง rest | needs_sinsae | "พัก/ทบทวน" |
| TC-WORK-BLOCK-02 | work | `文昌+` | jishen | 臨官 | none | activity_rest | fallback | 2 | output star = 忌神 → block work | needs_sinsae | "ชะลอ/ทบทวน" |

### 4.7 Health / recovery cases (5 cases · `activity_health` **ห้ามเป็น output**)

| test_id | activity_target | trigger_state | filter_state | qi_phase | blocker_state | expected_activity | expected_confidence | priority_rule_applied | rationale | reviewer_status | wording_guardrail |
|---|---|---|---|---|---|---|---|---|---|---|---|
| TC-HEALTH-RECOVERY-01 | (health-like) | none | neutral | 衰 | none | activity_rest | fallback | 6 | weak phase · merge เป็น rest recovery (no health emit) | health_blocked | "พัก/ฟื้นแรง/หายใจช้า" · ห้ามคำการแพทย์ |
| TC-HEALTH-RECOVERY-02 | (health-like) | none | neutral | 病 | `chong_day` | activity_rest | fallback | 1 | weak + clash → rest recovery wording | health_blocked | "พัก" · ห้ามใช้ "ป่วย/รักษา/ยา" |
| TC-HEALTH-RECOVERY-03 | (health-like) | none | neutral | 墓 | `zi_xing` | activity_rest | fallback | 1 | 墓 + 自刑 → rest recovery | health_blocked | "พัก/ปรับสมดุล" |
| TC-HEALTH-REDFLAG-01 | (health-like) | none | neutral | 衰 | `red_flag` | BLOCKED | n/a | n/a | red-flag keyword detected (เช่น "ปวด/หาย/อาการ") → ห้าม emit แม้ rest | health_blocked | ตัด text ทิ้ง · log + alert |
| TC-HEALTH-REDFLAG-02 | (health-like) | none | neutral | 死 | `red_flag` | BLOCKED | n/a | n/a | symptom keyword + qi_phase 死 → BLOCKED + monitor | health_blocked | log + reviewer alert · ห้ามตอบ |

### 4.8 Null / default / mixed signal (6 cases)

| test_id | activity_target | trigger_state | filter_state | qi_phase | blocker_state | expected_activity | expected_confidence | priority_rule_applied | rationale | reviewer_status | wording_guardrail |
|---|---|---|---|---|---|---|---|---|---|---|---|
| TC-NULL-01 | (none) | none | neutral | 帝旺 | none | activity_rest | fallback | 6 | ไม่มี trigger เลย · default | ready_for_dev_test | "ทบทวนแผน" |
| TC-NULL-02 | (none) | none | unknown | 養 | none | activity_rest | fallback | 6 | filter ไม่รู้ + 養 phase กลาง · fallback | needs_sinsae | "พักแบบมีเป้าหมาย" |
| TC-MIXED-01 | (any) | `文昌+` `驛馬+` | neutral | 臨官 | none | activity_rest | fallback | 5 | mixed positive 2 ตัวขัดทิศ (work vs travel) · fallback | needs_sinsae | "เลือกสิ่งสำคัญที่สุด/ทบทวน" |
| TC-MIXED-02 | (any) | `天乙+` `驛馬+` | xishen | 冠帶 | none | activity_rest | fallback | 5 | mixed meeting vs travel → ขอ priority จากซินแส · ระหว่างนี้ fallback | needs_sinsae | "ทบทวน" |
| TC-MIXED-03 | (any) | `wealth+` `文昌+` | yongshen | 帝旺 | none | activity_rest | fallback | 5 | mixed money vs work → ซินแสตัดสิน | needs_sinsae | "เลือกอย่างเดียว/ทบทวน" |
| TC-FALLBACK-01 | (none) | none | neutral | 帝旺 | none | activity_rest | fallback | 6 | DM 帝旺 strong · แต่ไม่มี anchor → default rest | ready_for_dev_test | "ทบทวน/พักแบบมีเป้าหมาย" |

### 4.9 Frequency / distribution sanity cases (2 cases)

| test_id | activity_target | trigger_state | filter_state | qi_phase | blocker_state | expected_activity | expected_confidence | priority_rule_applied | rationale | reviewer_status | wording_guardrail |
|---|---|---|---|---|---|---|---|---|---|---|---|
| TC-DIST-01 | rest_frequency | (sample 12 hours/day) | mixed | mixed | mixed | activity_rest ≈ 30–40% ของวัน | n/a | n/a | distribution sanity (spec section 4.4) | needs_sinsae | n/a |
| TC-DIST-02 | health_frequency | (sample 365 days × 12 hours) | mixed | mixed | mixed | activity_health emission = 0% (ห้ามออก) | n/a | n/a | hard rule: health ไม่ emit | health_blocked | n/a |

---

## 5. Coverage summary

| section | จำนวน cases |
|---|---|
| 4.1 Base positive | 5 |
| 4.2 Hard block (clash/harm/punishment) | 8 |
| 4.3 Money risk | 6 |
| 4.4 Travel | 5 |
| 4.5 Meeting | 5 |
| 4.6 Work | 5 |
| 4.7 Health / recovery | 5 |
| 4.8 Null / default / mixed | 6 |
| 4.9 Frequency / distribution | 2 |
| **รวม** | **47 cases** |

Distribution ของ expected output ใน matrix:

| expected_activity | จำนวน | สัดส่วน |
|---|---|---|
| activity_work | 2 | 4.3% |
| activity_money | 2 | 4.3% |
| activity_meeting | 3 | 6.4% |
| activity_travel | 2 | 4.3% |
| activity_rest (fallback) | 35 | 74.5% |
| BLOCKED (red-flag) | 2 | 4.3% |
| activity_health (emitted) | **0** | **0%** ✓ |
| distribution sanity | 1 (rest 30-40%) + 1 (health 0%) | — |

(หมายเหตุ: matrix นี้เน้น block/fallback path เพราะเป็นจุดเสี่ยงสูงสุด · production จริงต้องเก็บข้อมูล distribution หลัง 200-user sim เพื่อเทียบกับ spec 4.4 ที่บอก rest ≈ 30–40%)

---

## 6. Not covered / future tests

ที่ยังหาไม่เจอหรือต้องเพิ่มภายหลัง:

- **12 branch sweep** — case ละเอียดแต่ละ hour branch (子丑寅卯辰巳午未申酉戌亥) × DM 10 ตัว = 120 combinations · ต้องซินแสยืนยัน table
- **Annual / monthly modifier** — ผล liu_nian / liu_yue ที่ override hour signal
- **QiMen direction overlay** — direction layer ทับ activity_travel
- **Tongshu (通書) overlay** — 二十八宿/十二建除/黃黑道 modifier
- **Voytek strength scoring** — DM strength score ต่อ trigger threshold
- **Multi-language wording test** — TH/EN/ZH wording variation ตอนซินแส approve text แล้ว (spec G5)
- **200-user simulation** — flow signup→bazi→qimen→member (spec G6 · DECODE BUILD MODE rule 12)
- **Edge case: leap month / DST / timezone** — pillar accuracy ต่อ activity calculation
- **Priority resolution table** — กรณี trigger × 4 ตัวขึ้นไป ขัดกัน · ต้องซินแสให้ตารางลำดับ

---

## 7. Guardrails

ทุก case ต้องผ่าน wording guard เหล่านี้ก่อน emit:

| guard | คำที่ห้าม | ใช้แทนด้วย |
|---|---|---|
| no_guarantee | "สำเร็จแน่/รวยแน่/โชคมาแน่/ปลอดภัยแน่/กำไรแน่" | "เหมาะกับ.../ใช้จังหวะ.../ทบทวน..." |
| no_fear_based | "อันตรายแน่/เคราะห์ใหญ่/ห้ามออกจากบ้าน" | "ชะลอ/พัก/ทบทวน/เก็บแรง" |
| no_medical | "รักษา/หาย/ป่วย/ยา/วินิจฉัย/อาการ" | "ฟื้นแรง/ปรับสมดุล/หายใจช้า" |
| no_financial_advice | "ลงทุน/ซื้อหุ้น/ซื้อคริปโต/ซื้อทอง/การันตีผลตอบแทน" | "ทบทวนตัวเลข/วางงบ/จัดลำดับทรัพยากร" + disclaimer "ไม่ใช่คำแนะนำการลงทุน" |
| no_relationship_verdict | "ต้องเลิก/คู่นี้แน่/จะแต่ง/ปิดดีลแน่" | "เปิดบทสนทนา/ฟังครบ/สรุปข้อตกลง" |
| no_dev_narrative | dev-written text | Sesheta source หรือซินแส approved text เท่านั้น |

### Block emission rules

| code | rule |
|---|---|
| activity_health | **ห้าม emit เลย** · merge เป็น `activity_rest` recovery wording จนกว่าจะมี G3 approval |
| activity_money | ต้องผ่าน G2 finance review · ทุก output ต้องมี disclaimer |
| activity_travel | ห้ามใช้ `六沖` เป็น movement trigger (false positive ป้องกัน) |
| activity_rest | expected output rate ≈ 30–40% · ห้ามต่ำกว่า 20% หลัง 200-user sim |

### Red-flag guard

ก่อน emit ทุก code · scan text สำหรับ:

```
keywords: ปวด, เจ็บ, หาย, ป่วย, อาการ, รักษา, ยา, แพทย์, โรค, วินิจฉัย,
          ลงทุน, หุ้น, คริปโต, ทอง, ผลตอบแทน, การันตี,
          ห้ามออก, อันตราย, เคราะห์, ตาย, อุบัติเหตุ
```

พบ → log + reviewer alert + ห้าม emit (fallback ไป `activity_rest` แบบ neutral)

---

## 8. Approval gates (อ้างจาก spec section 6)

Matrix นี้ใช้เป็นหลักฐานในแต่ละ gate:

| gate | owner | matrix sections ที่ใช้ |
|---|---|---|
| G1 · sinsae formula | ซินแส × 3 | 4.1–4.6, 4.8 |
| G2 · finance review | finance reviewer | 4.3, 7 (no_financial_advice + disclaimer) |
| G3 · health spec + medical | medical reviewer | 4.7, 7 (no_medical + red-flag guard) |
| G4 · text approval | sinsae + PM | 7 (wording guardrails) |
| G5 · 3-language coverage | translator + sinsae | (future · §6 not covered) |
| G6 · 200-user simulation | dev | 4.9 distribution + complete matrix run |

---

**END OF MATRIX · v0.1 draft · 47 test cases · pending sinsae × 3 + finance + medical approval**
