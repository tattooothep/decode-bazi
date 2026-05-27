# Wrapper-8 Blueprint · 化氣格 + 從格 Judgment Engine (เฟส B)

> สถานะ: **DESIGN ครบ · ยังไม่ implement** · รอ golden 14案例徐樂吾 (เจ้านายหา) ก่อนแตะ engine
> ที่มา: AI sifu ร่าง (27 พ.ค. · 3 รอบ) + 5-agent review + verify โค้ดจริง
> ⚠️ แตะ `data/library/wrappers/3-ge-ju.js` (LOCKED · กระทบ 8 endpoint) → ต้อง golden + เจ้านาย approve ก่อน implement

## ทำไมต้องมี (bug ปัจจุบัน)
`findTransformation` (3-ge-ju.js:68-104) เช็คแค่ 2/6 เงื่อนไข (五合คู่+ฤดู) → over-declare 化 (用神พลิก180°)
+ **5-agent เจอเพิ่ม:** 化土ยิงไม่ออกเลย (ELEMENT_SEASON ไม่มี earth · skip ถ้า DM=化神ธาตุ) = under-declare 化土 ด้วย
ปัจจุบันมี hotfix ชั้น chart-packet (flag 真化/假化/合而不化 จากราก · 44bbf09/72604a7) — กันฝั่งซินแส แต่ engine ต้นตอ + /chart ยังผิด

## SCOPE จริง (5-agent ยืนยัน — ใหญ่กว่า gate เดี่ยว)
ทำถูกต้อง = **wrapper-8 เต็ม** ไม่ใช่ findTransformation เดี่ยว เพราะ:
1. partial_root conditional → ต้องอ่าน reactions (沖/刑/合去 บนกิ่งราก) = แตะระบบ **從格**
2. 假化 แกน B (得劫印→flip) → ผูก **year-flip/revival ปีจร**
→ ต้องทำพร้อม golden 14案例 (judgment engine) · ห้ามทำครึ่งเดียว

## 2 จุดศาสตร์ที่ AI sifu เคาะแล้ว
**Q1 — partial_root = conditional (ไม่ map ตาย):** caller **ห้ามส่ง hair/real** · ส่ง root5(5-level)+root_branches+reactions เข้า gate → gate คำนวณเอง
- `no→none` · `token→hair` · `rooted/strong→real เสมอ` (ห้าม degrade · กัน over-declare從)
- `partial→` conditional: ราก被沖/刑/合去 → hair (假從eligible) · นิ่ง → real (不從)
- เคสไนท์: 己 ราก中氣ใน午 (partial) โดน 子午冲×2 → ถอนเป็น hair → 假從財 (ถ้า map partial→real ตาย = ไนท์เป็น不從 regression)

**Q2 — 假化 = 2 แกนตั้งฉาก (ไม่ใช่ 7 enum · ไม่ใช่แค่微根+被剋):**
- แกน A (化神ไม่เต็ม): 失令/失地/無元神/被剋 = got_month/got_ground/has_guide/no_killer
- แกน B (日主มีที่พึ่ง): 得劫印/帶根苗/孤弱無根 = dm_root+rescue
- เก็บ `flip_strength`: 得劫印→high (ปีฟื้นนิดเดียวเด้งกลับแรง) · 孤弱無根→low (เกือบ真化)
- ⚠️ ขาดแกน B (得劫印) = flip-loop พัง (ประเภท 5 任氏 = เวกเตอร์ flip)

## Gate function (Python ref · port → JS ใน 3-ge-ju.js)

### WUHE table (months verify แล้ว = ครบ三合+三會 ทุกคู่ · agent#3 อ่านผิดว่าขาด旺支)
```
甲己→土 guide戊 months{辰戌丑未}
乙庚→金 guide庚 months{巳酉丑申戌}
丙辛→水 guide壬 months{亥子丑申辰}
丁壬→木 guide甲 months{寅卯辰亥未}
戊癸→火 guide丙 months{巳午未寅戌}
```

### 6 เงื่อนไข真化 (ตรงคัมภีร์ conghua Part 3.2)
(a)緊貼adjacency · (b)得令月支∈months · (c)得地化神รากในกิ่ง≥2 (นับรวม藏干/餘氣 · Fixture C) · (d)ไม่มี爭合(นับก้านซ้ำ) · (e)不受剋 · (f)有元神guide

### 妒合-exception (烈女不更二夫 · verbatim 化象)
`core_strong = b+c+e+f ครบ` → ถ้า core_strong override contention(d) (真化เกิดแล้ว 再見甲乙不作爭合)

### resolve_dm_root (5→3 level)
```python
def resolve_dm_root(root5, root_branches, reactions):
    base = {"no":"none","token":"hair","partial":"partial","rooted":"real","strong":"real"}[root5]
    if base != "partial": return base
    attacked = any(r["type"] in ("沖","刑","合去") and r["hits"] in root_branches for r in reactions)
    return "hair" if attacked else "real"
```

### classify_cong (從格 · กิน reactions เอง · ไม่รับ dm_root สำเร็จรูป)
- dm_root==real → 不從 · 印/比劫 rooted → 不從 (ม่านรอด)
- none+ไม่มีม่านรอด+從神overwhelming+月令หนุน → 真從
- none/hair + 從神 dominant/overwhelming → 假從 (flip บนปี印/比劫/祿刃)
- else → 不從

### derive_year_flags (PHASE 5 · ปิด flip-loop)
```python
yr_clash_dm_root      = 沖/刑 hits ∈ dm_branches
yr_combine_away_rescue = 合去/合 hits ∈ rescue_branches
```
predicate "รากโดนถอน" ใช้ 2 ชั้น: 原局 (partial→hair) + ปีจร (從override revival)

### assemble_packet_reactions (verify แล้ว = เบา · ไม่ parse string)
packet `Interaction{type:六沖, participants:[{pillar,token}]}` structured อยู่แล้ว → map:
- type: 六沖→沖 · 三刑/自刑/子卯刑→刑 · 六合→合/合去
- hits: participants[].token ที่ตรง root_branch · อีกตัว=from

## return shape (caller ไม่ต้องแก้ · 5-agent ยืนยัน)
- 真化 → คืน `{structure:'化X格',transformsTo,confidence,detail:{verdict}}` (เดิม) → wrapper-7 ทำ HUA_QI ปกติ
- 假化/合而不化 → คืน `null` → ไม่ใช่化格 → wrapper-7:601 isTransformation=false → ไม่ push 化神 อัตโนมัติ → /chart special_chart ไม่ขึ้นการ์ด化 (regex ไม่ match) · **ไม่ต้องแตะ chart-extensions/wrapper-7 LOCKED**

## Port notes (5-agent)
- reuse: S.STEM_ELEMENT/BRANCH_ELEMENT/S.STEM_COMBOS/isStemHe/activePositions
- S.HIDDEN_STEMS เป็น object {main,middle,residual} (ไม่ใช่ array) → branch_root_count แปลง: `[hs.main,hs.middle,hs.residual].filter(Boolean)` · **ห้ามแตะ shared.js**
- rootedness: คำนวณใน wrapper-3 เอง (reuse wrapper-7 = circular · wrapper-7 require wrapper-3 อยู่แล้ว) · มี precedent 魁罡:241/fake-follow:364
- 3p: activePositions ตัด hour อัตโนมัติ (ก้านข้าง=月เท่านั้น)
- แตะไฟล์เดียว: 3-ge-ju.js (+ ELEMENT_SEASON เพิ่ม earth/4季 สำหรับ化土)

## Golden (ไม่ต้องรอ 14案例สำหรับ化氣格 · มีในคัมภีร์แล้ว)
- คัมภีร์ conghua Fixture C (真化 戊辰/己未/甲戌) + D (合而不化) + A/B (從)
- 9 fixtures AI sifu (F1 ไนท์假從財·月子→合而不化 = regression หลัก · F2-6 ไม่มีคู่→[] · F7 妒合override→真化 · F8 假化 · F9 合而不化)
- golden เดิมต้องไม่พัง: Aeaw(假從財)/Mai(雜氣) ไม่ใช่化 + test-bazi-calc 2/2 + palaces 15/15
- ⚠️ 14案例徐樂吾 = จำเป็นสำหรับ judgment engine ส่วน 相神/成敗/救應 (wrapper-8 อีกครึ่ง) ไม่ใช่ 化氣格

## 🔴 BLOCKER พิสูจน์แล้ว (27 พ.ค. · prototype `scripts/proto-huaqi-gate.cjs` · 42c74c5)
เขียน gate ครบ (6 เงื่อนไข+findCombo แก้sort+化土+3สถานะ) รันกับ golden → **ผ่าน 4/8**
- **Fixture C (真化 golden คัมภีร์) → engine อ่าน假化** : 甲 ราก中氣乙ใน辰 · 辰戌冲 → rule `dmRoot=hair` → ตก假化 · แต่คัมภีร์ถือ甲 rootless→真化 (乙陰木+墓庫+沖 ตำราไม่นับราก)
- **ไนท์ (假從) ก็ DM ราก中氣被沖เหมือนกัน** → root model ง่าย (本氣/中氣/沖) **แยก 真化(C) vs 假從(ไนท์) ไม่ได้**
- F8 假化 ก็ผิด (得地นับก้านไม่นับกิ่งถูก)
→ **ต้อง root model wrapper-7 จริง** (5-level + 墓庫 + 陰陽ก้าน + 沖開vs沖去) + แก้ circular (refactor verifyRoot ไป shared.js LOCKED) + **golden 14案例 calibrate threshold**
→ ห้าม force deploy 4/8 (Fixture C真化→假化 = อ่านผิด = ทำร้ายคน · กฎ BaZi 10 หยุด)
→ **ไม่แตะ 3-ge-ju.js** · chart-packet hotfix (flag เตือน · 44bbf09/72604a7) = ชั้นกันจนกว่าได้ golden

## ประเมิน (ซื่อสัตย์)
- งาน: กลาง-ใหญ่ (rewrite findTransformation + รากในไฟล์ + 化土 + year-flip wire + 9 fixtures · ครึ่ง-1วัน) · กระทบ 8 หน้า → regression หนัก
- คุ้ม: 化格 = ดวงหายาก (rare) → แม่นขึ้นเฉพาะดวงนั้น (มาก) แต่ระบบเฉลี่ยขยับน้อย
- chart-packet hotfix (ทำแล้ว) กันฝั่งซินแส user ~80% แล้ว → เฟส B = เก็บ /chart + ต้นตอ + 化土
- **แนะนำ:** ทำพร้อม wrapper-8 judgment (相神/成敗) รอบเดียวตอนได้ 14案例 · ระหว่างนี้ไป 六親 (ทุกดวงใช้ · คุ้มกว่า)
