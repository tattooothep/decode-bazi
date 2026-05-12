# P0-002 · §11 Day Activity · Production Rule Spec

**Spec ID:** `P0-002_DAY_ACTIVITY_PRODUCTION_RULE_SPEC`
**Version:** v0.1 (draft · sinsae-pending)
**Date:** 2026-05-12
**Scope:** Source mapping spec สำหรับ §11 Day Activity (6 activity codes) · derived from sinsae review (3 ท่าน)
**Status flag:** `PARTIAL_APPROVAL_FOR_MAPPING_SPEC`
**Doc type:** read-only spec · ไม่ใช่ implementation
**Approval gate:** ต้องผ่านซินแส approve formula + finance review (สำหรับ money) + health review (สำหรับ health) ก่อนเข้า production

> ⚠ ห้าม implement code · ห้ามแก้ Google Sheet · ห้ามแก้ `data/i18n/*` · ห้ามแก้ `formula.json` · ห้าม approve/lock rows · ห้าม sync production · ห้ามแตะ `public/*.html` · ห้ามแตะ auth/API/lib · เอกสารนี้ใช้เป็น blueprint รอซินแส formula สุดท้าย

---

## 1. Current status

| รายการ | ค่า |
|---|---|
| feature_id | P0-002 |
| feature_name | Daily Action Cards (§11 Day Activity) |
| spec_status | `PARTIAL_APPROVAL_FOR_MAPPING_SPEC` |
| production_status | `BLOCKED` (entries_count=0 ใน `decode.production.json`) |
| formula_status | `requires_sinsae_formula: true` · `status: needs_sinsae` (จาก `data/i18n/formula.json:daily.§11.day_activity`) |
| staging_status | draft text 6 codes พร้อม TH/EN/ZH (ใน `decode.staging.json` · `_meta.warning: review copy only; not production-approved`) |
| sheet_queue | `APP-001 · Daily Core · P0 · needs_sinsae_review` (sheet `25 · Text_Approval_Queue ✅`) |
| rows_in_scope | Sheet `07 · Frontend_Text 💬` row 69–74 |
| approval_blockers | `missing_sinsae_formula` · `missing_finance_safe_template` (money) · `missing_health_spec` (health) · `missing_red_flag_guard` (health) · `missing_medical_disclaimer` (health) |
| reviewer_approvals_needed | sinsae × 3 (formula) + finance reviewer × 1 (money) + medical reviewer × 1 (health) |
| i18n_coverage_required | TH / EN / ZH (3 ภาษา) สำหรับทุก main/short/long/advice/warning |
| theme_coverage_required | light + dark (เข้ากับ Executive ของ qimen3ai) |

---

## 2. Global rules

กฎกลางที่ใช้กับทุก activity code:

### 2.1 Priority order

```
Block rule  >  Trigger rule
```

- ถ้าเข้าเงื่อนไข block (`production_blocked`, `忌神 active`, `red flag`) ให้ตัดทิ้งก่อนเสมอ
- trigger rule ถูก override โดย block rule เสมอ · ห้าม trigger ชนะ block

### 2.2 用神/喜神/忌神 บทบาท

```
用神 (yongshen)   = filter ที่อนุญาตให้ trigger ทำงาน
喜神 (xishen)     = filter ที่เสริม strength ของ positive trigger
忌神 (jishen)     = filter ที่ block หรือกลับขั้วของ trigger
```

- `用神/喜神/忌神` **ไม่ใช่ trigger ตรงๆ** · เป็น filter layer ที่อยู่หลัง trigger
- trigger ที่ active แต่โดน `忌神` ครอบ → ไม่ recommend
- trigger ที่ active + ตรง `用神` → recommend ด้วย confidence สูง

### 2.3 Default fallback

```
ถ้า signal ไม่ชัด  →  default = activity_rest
ถ้าทุก trigger ขัดกัน (mixed)  →  default = activity_rest
ถ้าไม่มี trigger active เลย  →  default = activity_rest
```

### 2.4 Wording guardrails

- ห้าม guarantee wording: "สำเร็จแน่นอน" · "รวยแน่" · "โชคมาแน่" · "ปลอดภัยแน่"
- ห้าม fear-based: "อันตรายแน่" · "ห้ามออกจากบ้าน" · "เคราะห์ใหญ่"
- ห้าม medical claim: "รักษา" · "หาย" · "ป่วย" · "วินิจฉัย" · "ยา" · "อาการ"
- ห้าม financial advice: "ลงทุน" · "ซื้อหุ้น/คริปโต/ทอง" · "การันตีผลตอบแทน"
- ห้าม relationship verdict: "ต้องเลิก" · "คู่นี้แน่นอน" · "จะแต่ง"
- ใช้คำเชิง **พฤติกรรม/จังหวะ** เท่านั้น — บอกว่าช่วงนี้ "เหมาะกับ X" ไม่ใช่ "X จะเกิด"

### 2.5 i18n + theme

- ทุก activity code ต้องมี `main`, `short`, `long`, `advice`, `warning` ครบทั้ง TH/EN/ZH
- ทุกการ์ดต้อง render ได้ทั้ง light/dark theme · ฟอนต์เท่ากันทั้ง 3 ภาษา · layout สมมาตร

### 2.6 Data source allowed

- Sesheta v1–v8 (commercial rights granted · ไม่ต้อง credit)
- Voytek (analytical reference only)
- ซินแสที่ผ่าน approval

ห้าม dev-written narrative · ห้าม AI paraphrase ใน Zone 0

---

## 3. Activity table

| activity_code | production_status | allowed_triggers | blockers | required_debug_fields | safety_gate | test_cases_needed | implementation_note |
|---|---|---|---|---|---|---|---|
| **activity_work** | `pending_sinsae` | `wen_chang_active(hour)` · `day_master_qi_phase ∈ {長生,臨官,帝旺}` · `yongshen_in_hour` · `output_star_visible (食神/傷官)` filtered by `非忌神` | `liu_chong(hour,day_branch)` · `san_xing(day)` · `忌神 on output star` · `DM 衰/病/死` | `wen_chang_active`, `hour_branch`, `day_master`, `day_master_qi_phase`, `yongshen_in_hour`, `output_star_present`, `output_star_polarity (用神/忌神)`, `liu_chong_day`, `san_xing_day` | text_review_required · no productivity guarantee · no fear-based warning | 12 cases: 3 phase × 2 wen_chang × 2 yongshen states | wait sinsae formula · wait i18n approval · ห้าม imply income |
| **activity_money** | `BLOCKED_PENDING_FINANCE_REVIEW` | `wealth_star_visible (正財/偏財)` + `wealth = 用神` · `stem_he_positive on wealth` · `wealth_qi_phase ∈ {臨官,帝旺}` · `no clash on wealth` | `wealth = 忌神` · `比劫/劫財 strong` · `liu_chong(wealth)` · `san_xing(wealth)` · `liu_po(wealth)` · `wealth_qi_phase ∈ {墓,絕}` | `wealth_star_pillar`, `wealth_polarity (用神/忌神)`, `wealth_yongshen_match`, `bijie_jiecai_strength`, `liu_chong_wealth`, `san_xing_wealth`, `stem_he_wealth`, `wealth_qi_phase` | **finance_safe_review_required** · text_review · disclaimer "ไม่ใช่คำแนะนำการลงทุน" · no asset class mention · no guarantee | 18 cases: 3 wealth type × 3 polarity × 2 clash | wait sinsae + finance reviewer · ห้ามแนะนำสินทรัพย์/หุ้น/คริปโต/ทอง · ใช้ wording เชิงพฤติกรรม "ทบทวนตัวเลข/วางงบ" |
| **activity_meeting** | `pending_sinsae` | `tian_yi_nobleman_active(hour)` · `liu_he(hour, day_branch)` · `san_he(hour, day, year_branch)` · `stem_he_positive` filtered by `非忌神` | `liu_chong(hour, day_branch)` · `liu_hai(hour, day_branch)` · `san_xing(day)` · `nobleman = 忌神` | `tian_yi_active`, `nobleman_count`, `nobleman_polarity`, `liu_he_with_day`, `san_he_with_day`, `liu_chong_day`, `liu_hai_day`, `stem_he_positive`, `day_master_in_he` | text_review_required · no relationship guarantee · no "ปิดดีลแน่" | 10 cases: 2 nobleman × 2 he type × 2 clash overlay | wait sinsae · ใช้ wording "เปิดบทสนทนา/ฟัง/สรุปข้อตกลง" |
| **activity_health** | **`PRODUCTION_BLOCKED`** | (no positive trigger; ใช้เป็น recovery wording เท่านั้น) · `day_master_qi_phase ∈ {衰,病,死,墓,絕}` · `no yongshen in hour` | `health_spec_required` · `medical_disclaimer_required` · `red_flag_guard_required` · `symptom_keyword_filter_required` | `day_master_qi_phase`, `yongshen_absent`, `liu_chong_day`, `san_xing_day`, `zi_xing_day`, `jishen_negative`, `health_warning_level`, `red_flag_triggered` | **production_blocked** · **health_spec_required** · **medical_safety_review** · **red_flag_guard** · forbidden keywords: รักษา/หาย/ป่วย/ยา/วินิจฉัย/อาการ · disclaimer "ไม่ใช่คำแนะนำทางการแพทย์ · ปรึกษาแพทย์เมื่อมีอาการ" | 8 red-flag cases + 6 fallback cases | **ห้าม emit "activity_health" ออกสู่ UI โดยตรง** · ให้รวมเป็น `activity_rest` recovery wording เท่านั้นจนกว่าจะมี health spec |
| **activity_travel** | `pending_sinsae` | `yi_ma_active(hour)` (驛馬) · `hour_branch ∈ {寅,申,巳,亥}` (movement branches) · `no harm/punishment` | `liu_chong(hour, day_branch)` (**ห้ามใช้ chong เป็น positive trigger**) · `liu_hai(hour, day_branch)` · `san_xing(day)` · `yi_ma = 忌神` | `yi_ma_active`, `hour_branch`, `movement_branch_present`, `yi_ma_polarity`, `liu_chong_day`, `liu_hai_day`, `san_xing_day`, `direction_favorable` (optional QiMen overlay) | text_review_required · travel_safety_advisory (เช็กเอกสาร/แผนสำรอง) · no safety guarantee | 8 cases: 2 yi_ma × 2 hour branch group × 2 clash | wait sinsae · **ห้ามใช้ 六沖 เป็น movement trigger** (ตามมติซินแส) · ใช้ yi_ma เป็น primary anchor |
| **activity_rest** | `pending_sinsae` (default fallback) | `day_master_qi_phase ∈ {衰,病,墓,絕}` · `yongshen absent in hour` · (`liu_chong/liu_hai/san_xing(day) == true` **OR** `jishen_negative_active`) · **OR** signal ไม่ชัด (default) | (ไม่มี hard block) · ห้าม fear-based wording · ห้าม guarantee | `day_master_qi_phase`, `yongshen_absent_hour`, `liu_chong_day`, `liu_hai_day`, `san_xing_day`, `zi_xing_day`, `jishen_negative_active`, `pause_strength`, `fallback_reason` | text_review_required · no fear-based · ใช้ behavior advice (ชะลอ/ทบทวน/พัก) · expected output rate ≈ 30–40% ของวันใน production | 12 cases (รวม fallback cases ทุกแบบ) | fallback role · ต้องครอบคลุม edge case ทุกแบบที่ trigger อื่นไม่ดัก · expected frequency 30–40% |

---

## 4. Special decisions (จากซินแส 3 ท่าน)

### 4.1 `activity_health` = production_blocked

- **ไม่ให้ emit `activity_health` เป็น activity code แยกใน production** จนกว่าจะมี:
  1. health spec ฉบับเต็ม (ครอบคลุม red-flag keywords + medical disclaimer template)
  2. medical-safety reviewer approval
  3. red-flag guard ในระดับโค้ด (กรอง symptom keywords ออกจาก text)
  4. medical disclaimer 3 ภาษาที่ผ่านการตรวจ
- ระหว่างนี้: ให้รวม health wording เข้า `activity_rest` แทน · ใช้ภาษาเชิง recovery/restoration (พัก ฟื้นแรง ปรับสมดุล) ห้ามแตะร่างกาย/ยา/อาการ

### 4.2 `activity_travel` ใช้เฉพาะ 驛馬 เป็น trigger

- **ห้ามใช้ `六沖` (liu_chong) เป็น movement trigger** แม้ในตำราจะมีคำว่า "沖動主動"
- เหตุผล: 六沖 ที่ปะทะ day branch เป็น **negative trigger หลัก** ของ self/health (ตาม interaction-matrix v8) · ถ้าใช้ผสม จะเกิด false positive ที่ recommend travel ตอน user ควร rest
- 驛馬 (yi_ma) เป็น anchor เดียวที่อนุญาต · เสริมด้วย hour branch ∈ {寅,申,巳,亥} (movement quartet)
- ห้ามแนะนำ travel ตอน `san_xing` หรือ `liu_hai` active

### 4.3 `activity_money` block conditions

ห้าม emit `activity_money` ถ้าเข้าเงื่อนไขใดเงื่อนไขหนึ่ง:

1. ดาวทรัพย์ (`正財/偏財`) เป็น `忌神` ของ chart นั้น
2. `比劫/劫財` (companion/rob wealth) แรง · มี trigger active ใน hour/day
3. `wealth pillar` โดน `liu_chong/san_xing/liu_po`
4. `wealth_qi_phase ∈ {墓,絕}`

ในกรณี block → fallback ไป `activity_rest` พร้อม wording "ทบทวน/วางแผน" (ไม่ใช่ลงมือเรื่องเงิน)

### 4.4 `activity_rest` เป็น fallback หลัก

- เป็น default safety net เมื่อ signal ไม่ชัด หรือทุก trigger ขัดกัน
- expected production output rate ≈ **30–40% ของวัน** (ประมาณ 4–5 ชั่วโมงต่อวัน 12 ชั่วยาม)
- ต้องไม่เป็น fear-based · ใช้ภาษาเชิง "ชะลอ/ทบทวน/เตรียมรอบถัดไป"
- ต้องครอบคลุม edge case ทุกแบบที่ trigger อื่นไม่ดัก
- ห้ามใช้คำว่า "พัก" เป็นข้ออ้างให้ user เลี่ยงการตัดสินใจ — wording ต้องส่งเสริม "พักแบบมีเป้าหมาย"

### 4.5 Priority resolution เมื่อ trigger หลายตัวพร้อมกัน

ตามมติซินแส 3 ท่าน · ลำดับ resolve เมื่อมี trigger ขัดกัน:

```
1. Block rule (任何 blocker active)              → fallback rest
2. 忌神 filter ครอบ trigger                       → fallback rest
3. positive trigger × 用神 filter ตรง            → emit primary recommendation
4. positive trigger × neutral filter             → emit with lower confidence
5. mixed positive/negative trigger ไม่ชัด        → fallback rest
6. ไม่มี trigger เลย                             → fallback rest
```

---

## 5. Test cases draft

Test cases ที่ต้องตรวจก่อน implementation · ทั้งหมดต้อง verify กับซินแส 3 ท่าน:

| test_id | input_condition | expected_activity | rationale |
|---|---|---|---|
| TC-WORK-01 | `文昌 active(hour)` + `用神 in hour` + `no liu_chong` + `DM 臨官` | `activity_work` | positive trigger × 用神 filter × phase strong = full work signal |
| TC-MONEY-01 | `wealth_star visible(day)` + `wealth = 忌神` | `activity_rest` (block fallback) | wealth visible แต่เป็น 忌神 → block money · fallback rest |
| TC-MONEY-02 | `wealth_star visible(hour)` + `wealth = 用神` + `比劫 weak` + `no clash` | `activity_money` | wealth + 用神 + ไม่มี rob = clear money signal |
| TC-MONEY-03 | `wealth_star visible` + `比劫 strong active` | `activity_rest` (block fallback) | 劫財 strong → block money แม้ wealth visible |
| TC-MEETING-01 | `天乙 active(hour)` + `六合(hour,day)` + `no liu_hai` + `no san_xing` | `activity_meeting` | nobleman + 六合 ไม่มี harm = clear meeting signal |
| TC-MEETING-02 | `天乙 active` + `天乙 = 忌神` | `activity_rest` (block fallback) | nobleman เป็น 忌神 → block · fallback rest |
| TC-TRAVEL-01 | `驛馬 active(hour)` + `no liu_chong with day` + `no san_xing` | `activity_travel` | 驛馬 anchor ชัด + ไม่มี clash/punishment |
| TC-TRAVEL-02 | `六沖(hour, day)` only · `驛馬 inactive` | `activity_rest` (NOT travel) | 六沖 ไม่ใช่ travel trigger · เป็น self/health negative → fallback rest |
| TC-HEALTH-01 | `DM qi_phase 衰/病` + `yongshen absent` + `liu_chong day` | `activity_rest` (recovery wording) | health condition แต่ block · emit เป็น rest recovery |
| TC-HEALTH-02 | `DM 病` + `red_flag keyword in suggested text` | `BLOCKED` (red flag triggered) | red-flag guard ตัดทิ้ง · ห้าม emit |
| TC-REST-01 | `DM qi_phase 墓` + `忌神 in hour` + `no positive trigger` | `activity_rest` | weak phase + 忌神 = clear pause signal |
| TC-REST-02 | trigger ทุกตัว inactive | `activity_rest` (default fallback) | no signal → default rest |
| TC-MIXED-01 | `文昌 active` + `六沖(hour, day)` พร้อมกัน | `activity_rest` (mixed → fallback) | mixed positive/negative · resolution rule #5 |
| TC-MIXED-02 | `天乙 active` + `六沖(hour, day)` พร้อมกัน | `activity_rest` (block > trigger) | block rule (chong) > trigger (nobleman) |
| TC-FALLBACK-01 | `DM 帝旺` + `no specific star active` + `no clash` | `activity_rest` (signal ไม่ชัด) | strong DM แต่ไม่มี anchor → default rest |

หมายเหตุ:
- expected output frequency: `activity_rest` ≈ 30–40% · 5 ที่เหลือรวมกัน ≈ 60–70% (ซินแส verify ภายหลัง)
- ต้อง run 200-user simulation ก่อน production release (ตาม DECODE BUILD MODE rule 12)

---

## 6. Approval gates ก่อน implementation

| gate | owner | criteria | current |
|---|---|---|---|
| G1 · sinsae formula approval | ซินแส × 3 | ยืนยัน trigger conditions + priority resolution + edge cases | ❌ ยังไม่ผ่าน |
| G2 · finance review (money) | finance reviewer × 1 | wording + disclaimer + no asset class · เห็นชอบ block conditions | ❌ ยังไม่ผ่าน |
| G3 · health spec + medical review (health) | medical reviewer × 1 | red-flag keyword list + disclaimer + symptom guard | ❌ ยังไม่ผ่าน · health code ยัง `production_blocked` |
| G4 · text approval (sinsae + PM) | sinsae + PM | text ใน sheet `07 · Frontend_Text` row 69–74 ผ่าน · `text_review_status = approved/locked` | ❌ ยัง `needs_sinsae_review` |
| G5 · 3-language coverage | translator + sinsae | TH/EN/ZH ครบ main/short/long/advice/warning | ✅ draft พร้อมใน staging · รอ approve |
| G6 · 200-user simulation | dev | test 200 user signup→bazi→qimen→member flow ผ่าน · bug list ครบ | ❌ ยังไม่รัน |

---

## 7. Out of scope (เอกสารฉบับนี้ไม่ครอบคลุม)

- การเขียน code · การแก้ `formula.json` · การ approve/lock rows
- การ sync production · การแก้ Google Sheet
- การ deploy
- ขอบเขต Decision Engine (Decode build งานหลักส่วน D) — แยก spec อื่น
- ขอบเขต QiMen direction overlay — แยก spec อื่น
- ขอบเขต Tongshu overlay — แยก spec อื่น

---

## 8. ที่ยังหาไม่เจอ (ไม่เหมาว่าไม่มี)

- ยังไม่พบไฟล์ใน Sesheta ที่ map `hour_branch → activity_code` แบบ explicit 12×6 lookup table
- ยังไม่พบ weight/score ของแต่ละ trigger ที่จะรวมเป็น final activity recommendation (ต้องซินแส)
- ยังไม่ได้ดูชีต `19 · GPT_Rewrite_Batch_01` / `26 · §11 sheet` ฉบับเต็มจาก Google Sheet (ไม่มี local access)
- ยังไม่ตรวจ `data/library/wrappers/*.js` ว่ามี §11 wrapper ที่มี mapping ฝังในโค้ดไหม

---

**END OF SPEC · v0.1 draft · pending sinsae approval**
