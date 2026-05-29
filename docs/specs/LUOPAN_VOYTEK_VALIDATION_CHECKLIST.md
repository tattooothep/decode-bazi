# Luopan Validation Checklist (Our vs Voytek)

วัตถุประสงค์: ตรวจความถูกต้องของหน้า `/_preview/luopan-merge-v2.html` โดยเทียบผลกับ Voytek  
ขอบเขต: **ดาว 9 ดวง (飛星)** และ **ฉีเหมิน (奇門 時家)** เฉพาะข้อมูลที่เทียบได้

## 1) Test Input ที่ต้องล็อกก่อนเทียบ

- วัน: `YYYY-MM-DD`
- เวลา: `HH:mm` (24h)
- เขตเวลา: `Asia/Bangkok` (UTC+7)
- พิกัด: `lat/lng`
- หันหน้า (Facing degree): `0-359`
- ปีสร้างบ้าน (ใช้หา period)
- โหมดเวลาที่หน้าใช้: `year | month | day | hour`

> กฎ: ถ้าตัวแปรข้างบนไม่ตรงกัน ให้ถือว่า “ผลเทียบไม่มีความหมาย”

---

## 2) Flying Stars (ดาว 9 ดวง) — Pass/Fail

### 2.1 Era Mode (山/向/基)

| ทิศ | Our 山星 | Voytek 山星 | ตรงไหม | Our 向星 | Voytek 向星 | ตรงไหม | Our 基星 | Voytek 基星 | ตรงไหม |
|---|---:|---:|---|---:|---:|---|---:|---:|---|
| N |  |  |  |  |  |  |  |  |  |
| NE |  |  |  |  |  |  |  |  |  |
| E |  |  |  |  |  |  |  |  |  |
| SE |  |  |  |  |  |  |  |  |  |
| S |  |  |  |  |  |  |  |  |  |
| SW |  |  |  |  |  |  |  |  |  |
| W |  |  |  |  |  |  |  |  |  |
| NW |  |  |  |  |  |  |  |  |  |

เกณฑ์ผ่าน Era:  
- ต้องตรงอย่างน้อย `22/24` ช่อง (8 ทิศ × 3 ค่า)

### 2.2 Time Mode (year/month/day/hour) — single star ต่อทิศ

| โหมด | ทิศ | Our Star | Voytek Star | ตรงไหม |
|---|---|---:|---:|---|
| year | N |  |  |  |
| year | NE |  |  |  |
| year | E |  |  |  |
| year | SE |  |  |  |
| year | S |  |  |  |
| year | SW |  |  |  |
| year | W |  |  |  |
| year | NW |  |  |  |
| month | N |  |  |  |
| month | NE |  |  |  |
| month | E |  |  |  |
| month | SE |  |  |  |
| month | S |  |  |  |
| month | SW |  |  |  |
| month | W |  |  |  |
| month | NW |  |  |  |
| day | N |  |  |  |
| day | NE |  |  |  |
| day | E |  |  |  |
| day | SE |  |  |  |
| day | S |  |  |  |
| day | SW |  |  |  |
| day | W |  |  |  |
| day | NW |  |  |  |
| hour | N |  |  |  |
| hour | NE |  |  |  |
| hour | E |  |  |  |
| hour | SE |  |  |  |
| hour | S |  |  |  |
| hour | SW |  |  |  |
| hour | W |  |  |  |
| hour | NW |  |  |  |

เกณฑ์ผ่าน Time Modes:  
- ต่อโหมดต้องตรงอย่างน้อย `7/8` ทิศ  
- รวม 4 โหมด ต้องตรงอย่างน้อย `30/32`

---

## 3) Qimen (時家) — Pass/Fail

> เทียบเฉพาะโหมด `hour` (ตามระบบปัจจุบัน)

| ทิศ | Our 門 | Voytek 門 | ตรงไหม | Our 神 | Voytek 神 | ตรงไหม | Our 星 | Voytek 星 | ตรงไหม |
|---|---|---|---|---|---|---|---|---|---|
| N |  |  |  |  |  |  |  |  |  |
| NE |  |  |  |  |  |  |  |  |  |
| E |  |  |  |  |  |  |  |  |  |
| SE |  |  |  |  |  |  |  |  |  |
| S |  |  |  |  |  |  |  |  |  |
| SW |  |  |  |  |  |  |  |  |  |
| W |  |  |  |  |  |  |  |  |  |
| NW |  |  |  |  |  |  |  |  |  |
| C (中宮) |  |  |  |  |  |  |  |  |  |

เกณฑ์ผ่าน Qimen-hour:  
- 8 ทิศหลัก (N..NW): อย่างน้อย `20/24` ช่อง (門/神/星)  
- 中宮: ต้องตรวจว่ามีค่าและไม่ขัดกับแผงหลัก

---

## 4) Source-of-Truth Checks (หน้าเว็บต้องแสดง)

- `FX` ต้องแสดงว่าใช้สูตร + JSON (ไม่ใช่ demo hardcode)
- `QM` ต้องแสดงสถานะ `/api/qimen` ว่า `✓/✗`
- โหมด `year/month/day` ต้องไม่แอบแสดงข้อมูล Qimen หลอก

Checklist:
- [ ] buildTag แสดง source ถูก
- [ ] inspector มีข้อความ source ต่อหมวด
- [ ] ตอน API fail มีข้อความเตือนชัดเจน

---

## 5) Final Gate (ผ่านก่อน deploy)

- [ ] Flying Stars Era ผ่านเกณฑ์
- [ ] Flying Stars Time Modes ผ่านเกณฑ์
- [ ] Qimen-hour ผ่านเกณฑ์
- [ ] Source-of-truth checks ผ่านครบ
- [ ] บันทึกผลไว้พร้อม timestamp และ tester

สรุปผลรอบนี้:
- วันที่ทดสอบ:
- ผู้ทดสอบ:
- ผลรวม: `PASS / FAIL`
- หมายเหตุ:

