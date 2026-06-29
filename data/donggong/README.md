# 董公擇日 (Dong Gong Date Selection) — Dataset (tier-1 NLC)

> สถานะ: **สกัด+ลง DB แล้ว (ref_donggong_*) · ยังไม่ wire เข้า luck-engine/เว็บ** (29 มิ.ย. 2026)

ตำราเลือกวันพื้นบ้านสมัยชิง · **董德彰** (號銀峯, 董潛 字德彰) ชาว江西饒州德興縣
คำนำ蔣雲(號奇峰) 嘉慶22(1817) · ฉบับ上海文明書局 民國18(1929)

## 🟢 ที่มา = tier-1 (ต้นฉบับแท้)
**สแกนหอสมุดแห่งชาติจีน (NLC)** read.nlc.cn fid=15jh007747 · shelfmark MG B992.1 · 78 หน้า
ถอดความรายหน้าโดยเจ้าของ (น.13-44 = 12 เดือน · น.45-74 = ภาคผนวก) → แทน tier-2 (tianyugong) ของเดิมทั้งหมด

## ไฟล์ + ตาราง DB
| ไฟล์ | เนื้อหา | DB |
|---|---|---|
| `months.json` | 12 เดือน × 12 建除位 → 吉凶+宜/忌+神煞 + **273 ราย干支 exception** | `ref_donggong_day`(144) + `ref_donggong_exception`(273) |
| `jianchu_logic.json` | 建除 engine (協紀辨方) — verify vs tyme4ts 14/14 | `ref_donggong_meta` |
| `shensha_monthly.json` | 黃沙/小紅沙/天賊/受死/冰消瓦陷/往亡/六黑道 (month→branch) | meta |
| `blacklist_fixed.json` | 正四廢/天地轉煞/白虎入中宮/九土鬼/金神七煞(28宿) | meta |
| `sanxing.json` | 三星 煞貢/直星/人專 (孟仲季) | meta |
| `directions.json` | 喜神/財神/五鬼方 + 三煞 + 九宮飛宮 | meta |
| `gejue.json` | 金神七煞歌 + 黃黑道口訣 | meta |

## วิธีใช้ (lookup 3 ชั้น — ตามที่เจ้านายวาง)
1. **คำนวณ** จากวัน: 月建(節氣) + 建除位 = `(日支idx − 月建idx +12)%12` + 日干支 (ใช้ tyme4ts getSixtyCycleDay)
2. **lookup ชั้นวัน**: `ref_donggong_day(month, day_branch)` → base + 神煞 · ทับด้วย `ref_donggong_exception(month, day_ganzhi)` ถ้ามี (干支เฉพาะชนะ)
3. **ซ้อน神煞/blacklist/三星/ทิศ** จาก meta · **filter สุดท้าย**: 日干支 不冲不尅 本命เจ้าของงาน
(generator: `scripts/donggong-to-sql.cjs` · test lookup: `scripts/donggong-test.cjs`)

## ⚠️ คงเหลือ (pending)
1. **9 ตำแหน่ง `_missing`** ที่ต้นฉบับไม่ได้ถอด (เดือน3: 丑寅卯 · เดือน8: 亥未申 · เดือน11: 丑戌亥) → รอ OCR ภาพสแกน
2. **60甲子吉凶時辰 (น.45-60)** = ค่าราย-ยาม ยังเป็นภาพ → ชั้นยามใช้ **黃黑道十二神 deterministic** แทนได้ (huangdao.ts: 青龍明堂金匱天德玉堂司命=吉) จนกว่าจะ OCR
3. 火星日/月厭/十惡大敗ตารางเต็ม + 安床/安竈รายเดือน = ต้นฉบับให้บางส่วน (`pending` ในแต่ละไฟล์)
4. แปลไทย 宜/忌/神煞 + map 用事 → datepick · wire เป็น module#12 หลัง backfill _missing
5. 1-2 จุด `_check`: เดือน4 定酉 '甲庚申煞' · เดือน10 丙午 '正四廢'ขัด'大吉' — รอสแกนยืนยัน
