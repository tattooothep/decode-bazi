<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# 🛡 BaZi / Decode — กติกาแก้ระบบ (10 ข้อ · ห้ามฝ่าฝืน)

บันทึก 6 พ.ค. 2026 · สาเหตุ: เคยรีบ patch เฉพาะ chart-v2 · ทำให้ DB + API อื่นค้าง bug

## 1. ระบุ Layer ก่อนแก้ทุกครั้ง

| Layer | คืออะไร |
|---|---|
| **Layer 0** | Time normalization · TST · timezone (`src/lib/tyme-tst.ts`) |
| **Layer 1** | Pillar calculation (`src/lib/bazi-calc.ts` · เรียก tyme4ts) |
| **Layer 2** | BaZi engine wrappers (`data/library/wrappers/1-6`) |
| **Layer 3** | API · backend endpoints (`src/app/api/**`) |
| **Layer 4** | UI · frontend rendering (`src/app/**/page.tsx`) |

**ปัญหาที่กระทบ calculation → ห้ามแก้ Layer 4 ก่อน · ต้อง Layer 0 หรือ 1 ก่อน**

## 2. Single Source of Truth

ห้ามให้หลาย endpoint คำนวณ pillar เอง · ทุก API + ทุก page ต้องเรียก:
- `src/lib/tyme-tst.ts` · `applyTST()`
- `src/lib/bazi-calc.ts` · `calcBazi()` · `getSolarTimeAtTST()`

ห้าม inline `tyme.SolarTime.fromYmdHms()` ใน endpoint ใหม่

## 3. ก่อนแก้ ต้องตอบ 5 ข้อนี้ก่อน

ตอบไม่ได้ = ห้ามแก้:
- Root cause คืออะไร
- ไฟล์ไหนที่จะถูกแก้
- Endpoint/page ไหนได้รับผลกระทบ
- วิธี rollback คืออะไร
- Test case ที่ต้องผ่านคืออะไร

## 4. ห้ามแก้รวดเดียว · ต้องเป็น phase

```
Phase 1: backup (DB + ไฟล์ที่จะแตะ)
Phase 2: สร้าง helper ใหม่ · ยังไม่แตะของเดิม
Phase 3: test helper เปล่าๆ
Phase 4: สลับทีละ endpoint
Phase 5: test หลังสลับแต่ละ endpoint
Phase 6: migrate DB เป็นขั้นสุดท้าย
Phase 7: cleanup code เก่า
```

ระหว่างทาง endpoint ไหนไม่ตรง → **หยุดทันที · rollback · รายงาน · ห้ามไปต่อแบบเดา**

## 5. Golden Reference Test ทุกครั้ง

ใช้ Voytek (`bazi-calculator.com`) เป็น reference

**Aeaw 1984-12-31 13:15 Bangkok (lng 100.5018):**
```
Hour 庚午 · Day 己亥 · Month 丙子 · Year 甲子
```

**Mai 1986-04-12 16:42 Bangkok:**
```
Hour 丙申 · Day 丙戌 · Month 壬辰 · Year 丙寅
```

Test command: `node scripts/test-bazi-calc.cjs`

ผลไม่ตรง → **หยุดทันที · ห้ามแก้ต่อแบบเดา**

## 6. ก่อนแตะ DB ต้อง backup เสมอ

```bash
docker exec decode-postgres pg_dump -U decode_user decode_db > /root/backups/<name>.sql
```

- backup ไฟล์ที่จะเปลี่ยนด้วย
- ห้าม migrate ทับข้อมูลเดิมโดยไม่มี rollback path
- update pillar เก่า → เก็บ `original_pillars` หรือ `calc_history` ไว้

## 7. ห้ามใช้คำว่า "น่าจะ"

ถ้าไม่แน่ใจ พูดตรงๆว่า:
- "ยังไม่ยืนยัน"
- "ต้อง test"
- "ต้องเทียบ reference"
- "ต้อง inspect เพิ่ม"

## 8. หลังแก้ต้องรายงาน 8 จุด

```
- แก้อะไร
- แก้ที่ Layer ไหน
- ไฟล์ที่แก้
- test ที่รัน
- ผลก่อน/หลัง
- endpoint ที่ตรวจแล้ว
- endpoint ที่ยังไม่ได้ตรวจ
- rollback path
```

## 9. Engine deterministic ก่อน · AI สรุปภาษาทีหลัง

- Engine คำนวณ structured JSON ให้เสร็จก่อน
- AI มีหน้าที่แค่ **สรุปภาษาไทยจาก structured data**
- ห้ามให้ AI เดาตัวเลข · stem · branch · element · score

## 10. เจอปัญหา calculation = หยุด feature ใหม่

ทันทีที่พบ pillar/strength/yongshen ไม่ตรง:
1. **หยุด** feature ใหม่ทั้งหมด
2. แก้ที่ root cause (Layer 0 หรือ 1)
3. ห้าม patch เฉพาะหน้า

---

## Reference Inventory

- Engine wrappers (Layer 2): `data/library/wrappers/1-6`
- Single helpers (Layer 0+1): `src/lib/tyme-tst.ts` · `src/lib/bazi-calc.ts`
- Regression test: `scripts/test-bazi-calc.cjs`
- Migration tool: `scripts/migrate-tst.cjs`
- Backup dir: `/root/backups/safe-refactor-*/`
- Sesheta source: `data/sesheta · sesheta-v2..v8` · 47 ไฟล์ · 662 KB
