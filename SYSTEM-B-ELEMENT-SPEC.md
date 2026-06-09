# 📐 System B — สูตร%ธาตุใหม่ (สำหรับ wire session หน้า)

บันทึก 9 มิ.ย. 2026 · จากงานทั้งวัน (research ภายนอก + หอสมุด + ground truth ไนท์/Mai/malika)

## ปัญหาเดิม (ทำไมต้องเปลี่ยน)
- เว็บ `/chart` ใช้ `src/lib/element-distribution-functional.ts` (Plan C v6) — น้ำหนัก **hardcode 4:2:1** (`QI_WEIGHT main1.0/mid0.5/res0.25`) เขียน comment เอง "engine calibration" — **ไม่ใช่คัมภีร์ ไม่ใช่หอสมุด**
- ผล: ทอง用神หาย (庚ก้านบนลอยถูกลงโทษ floating×0.3 → ทอง1%) · ไนท์ดิน12(ควร4) → 從財ไม่ชัด
- พิสูจน์จากหอสมุด (DB `library_scriptures` 7 เล่ม · id7 淵海子平·子平真詮 + id13 滴天髓·穷通宝鉴) — **คัมภีร์ต้นฉบับไม่มีตัวเลข%ธาตุ มีแค่หลักการ**

## 🔑 หลักจาก research ภายนอก (เจ้านายแปะ · verify แล้ว)
- **% ≠ 用神** — ห้าม auto-select用神จาก% · 用神 = 格局(從格/扶抑) structural แยก
- **月令 = 40-50%** (หนักสุด) · **旺相休囚死: 旺100/相80/休60/囚40/死20** (ใช้ใน強弱 ไม่ใช่%display)
- 2 ระบบมีตัวเลข: A(天干36/本60中30餘10) · **B(透干5/本5中2餘1/純8/月令×2)** ← เลือก B

## สูตร System B (ที่จะ wire)
```
ก้านบน(透干): มีราก=5 · ลอย(虚浮)=2.5  [ก้านบนมีธาตุเดียวกันใน藏干กิ่งใดๆ=มีราก]
ก้านซ่อน(藏干): 1ตัว[純氣8] · 2ตัว[本5,餘3] · 3ตัว[本5,中2,餘1]
เสาเดือน(月令): ×2 (ทุกค่าในเสาเดือน)
ไม่ตัด DM (นับ比劫 · ต่าง Voytek ที่ตัดก้านวัน)
%ธาตุ = คะแนนธาตุ ÷ รวมทั้งหมด × 100
```

## ผล 3 ดวง (floating penalty 0.5) + ตรงตำรา子平真詮 3/3 ✅
| ดวง | %ธาตุ System B | 身強弱(同党vs异党) | 用神(扶抑) | ตำรา |
|---|---|---|---|---|
| malika 丁 | ไม้29ไฟ26ดิน40ทอง4น้ำ2 | 身強 55>46 (印旺) | ดิน(食傷)+ทอง(財) | ✅「印多逢財」zpzq:2 |
| Mai 壬 | ไม้14ไฟ19ดิน22ทอง4น้ำ40 | 身弱 44<56 | ทอง(印)+น้ำ(比劫) | ✅「身弱用印比」 |
| ไนท์ 己 | ไม้13ไฟ24ดิน13ทอง4น้ำ46 | 身弱 37<63+丙印透 | ไฟ(印)+ดิน(比劫) | ✅「透印不從·用印」zpzq:286 |

**🔑 ไนท์:** 用ไฟ = ตรง子平真詮(扶抑·透印用印) แต่ขัดชีวิตจริง(從財·大運庚辰รวย=用ทอง) → **2 สำนักตำราขัดกัน** (子平真詮 透印不從 vs 滴天髓 印被水克→假從) · ต้องเลือกสำนัก

## 🗺️ ROADMAP สเตปแก้ (เจ้านายเคาะ 9 มิ.ย. · /goal)
```
สเตป 0: verify System B หลายดวง + จูน floating penalty (กัน overfit · ยังไม่แตะ engine)
สเตป 1: [%ธาตุ] wire System B (mode param·default legacy·ENV) — ไม่ลาม sifu · test golden เสา/เรือน + caller ไม่พัง
สเตป 2: [wrapper-6:86 bug] strength double-count (1 บรรทัด·มีแม่แบบ·verified)
สเตป 3: [正格扶抑] malika/Mai → System B+同党/异党
สเตป 4: [假從財用神กลับขั้ว] ไนท์ → wrapper-7
สเตป 5: [รวม 2 ที่用神] ภาพรวมตัวตน vs 用神v2 → แหล่งเดียว
```
**กฎทุกสเตป:** 3 ลายเซน(3 agent) · backup+golden(เสา2/2·เรือน15/15) · ไม่ deploy จนเจ้านายเคาะ
**🔴 CHECK SIFU บังคับทุกสเตปที่กระทบ用神 (2-5) — เจ้านายสั่งเพิ่ม:**
1. **เช็คว่าไม่กระทบ AI sifu โดยไม่ตั้งใจ** — สเตป 1(%ธาตุ)ต้องไม่ลาม sifu (sifu ใช้ wrapper-6/7 ไม่ใช่ element-dist) · ยืนยันด้วย grep + test:sifu 9/9
2. **เช็คว่าข้อมูลใหม่(用神แก้แล้ว)ถูกส่งให้ AI sifu จริง** — dump packet (SIFU_DUMP_PROMPT=1) ดู usefulGods ใหม่เข้า prompt จริง + AI ตอบตาม用神ใหม่ (ไม่ใช่แก้ wrapper แล้ว packet ยังส่งค่าเก่า)
**+ packet:** เปลี่ยนตาม wrapper อัตโนมัติ · แต่ต้อง (ก)verify ส่ง用神ใหม่จริง (ข)ถอด P4 HK_YONG_LOCK_V1 (route.ts·lock ค่าเก่าผิด) (ค)อัปเดต golden test-sifu-yongshen (P0 เดิม lock malika=ไม้ ผิด·ปนเปื้อน)

## แผน wire (session หน้า · ทุกขั้น 3 ลายเซน)
1. **verify System B ดวงเพิ่ม** (หา庚มีราก vs ลอย · จูน floating penalty 0.5/0.3) — กัน overfit 3 ดวง
2. **ตัดสินสำนัก用神** ไนท์: 扶抑(子平真詮)เดี่ยว หรือ +假從detector(滴天髓)
3. **wire เข้า element-distribution-functional** — เพิ่ม mode param (`"legacy"|"systemB"`) · default legacy · ENV `ELEMENT_DIST_MODE` · **%ธาตุเท่านั้น**
4. **用神 ยังใช้ wrapper-7 格局 (% ไม่ feed用神)** — research ย้ำ %≠用神
5. test: golden เสา(2/2)+เรือน(15/15) + caller(strength-functional/health/daymaster-profile)ไม่พัง + sifu ไม่ลาม (sifu ใช้ wrapper-6/7 ไม่ใช่ element-dist)
6. ไม่ deploy จนผ่าน 3 ลายเซน + เจ้านายเคาะ

## หมายเหตุ state
- element-distribution-functional **= HEAD เดิม** (voytek mode draft revert แล้ว · overfit ไนท์ดวงเดียว · backup: `/root/backups/element-voytek-20260609/element-dist.AFTER-voytekmode-draft.ts`)
- wrapper-6 bug:86 (friendlyElements double-count) **ยังไม่แตะ** — คนละงาน (strength wrapper · ดู memory project_bazi_strength_formula_canon)
- golden Voytek (อ้างอิง·ไม่ใช่เกณฑ์ตาย): ไนท์ ไม้12ไฟ24ดิน4ทอง9น้ำ51 · Mai ไม้10ไฟ16ดิน19ทอง13น้ำ42
- /chart = หน้าเดียวที่ใช้ · /chart-v2 ทิ้ง 100%

## 🔓 ปลดความสับสนไนท์ (verify engine จริง · เจ้านายชี้ "ดวงพิเศษทำไว้แล้ว เราไม่เข้าข่าย")
รัน calcBazi: ไนท์=**假從財格**·用ไฟ(กลับขั้ว) · malika=**正印格**·用ไม้ · Mai=**雜氣傷官格**·用ไฟ
→ **ไนท์ = ดวงพิเศษ · detector(wrapper-3) จับถูกแล้ว · เลือกสำนัก滴天髓(假從)แล้ว** · แต่用神กลับขั้ว(調候ไฟ แทน從財ทอง/น้ำ)
→ **malika/Mai = 正格 (ไม่เข้าข่ายพิเศษ)** = เป้าของ System B+扶抑

### 用神 = 2 กองแยกเด็ดขาด (คนละ fix · อย่าปน)
1. **正格 (malika/Mai)** → System B + 同党/异党扶抑 → ✅ ทิศถูกแล้ว (ดิน/ทอง · ทอง/น้ำ)
2. **ดวงพิเศษ (ไนท์假從財 · detector จับแล้ว)** → 用神**กลับขั้ว** ที่ wrapper-7 假從財 (ให้調候ไฟ · ควร用財ทอง/น้ำ) = **bug แยก · ไม่เกี่ยว System B**
⚠️ ไนท์ห้ามเอามาคำนวณ扶抑(System B) — เป็นดวงพิเศษ ต้องใช้ detector

ดู memory: `project_bazi_strength_formula_canon.md`
