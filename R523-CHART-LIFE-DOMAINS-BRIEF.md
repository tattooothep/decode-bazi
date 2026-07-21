# ใบสั่งงาน r523 — เปิด "มิติชีวิต 5 ด้าน" (§03 เว็บ) ให้เส้นมือถือ (จากจาวิส 19 ก.ค. 2569)

**ผู้รับ:** ทีม backend · **ขอบเขต:** `/api/mobile/v1/chart` เท่านั้น (additive) · ห้าม deploy จนเจ้านายเคาะ
**ที่มา:** เจ้านายทวง "03 · มิติชีวิต 十神 5 ด้าน ในเว็บมี แอพหาย" — แอพซ่อน section เพราะ API มือถือไม่ส่งข้อมูล (ChartScreen.tsx:922 · กฎห้ามค่าปลอม) — พอ field มา จาวิสจะ render ใน redesign ระลอก 2

## งานที่ขอ
- เพิ่ม field `life_domains` ใน response `/api/mobile/v1/chart` — **ห้ามคิดสูตรใหม่** ให้ดึงจาก engine เดิมที่เว็บ §03 ใช้ (chart-extensions: spouse/career/health/parents/children — ตัวเดียวกับที่ /api/chart ส่ง)
- โครงต่อด้าน: `{ key, level (good/mid/caution ตาม engine), score ถ้ามี, ten_god (十神 ที่เกี่ยว), summary_th/_en/_zh ถ้าคลังมี — ไม่มี en/zh ให้ส่ง th + ธง pending อย่าแต่งเอง }`
- เคารพ entitlement เดิมของหน้า chart (tier ไหนเห็นกี่ด้าน ให้ตรงเว็บ) · Bearer getMobileSession · scope org/user เหมือนเส้นข้างเคียง

## เช็คก่อนส่งงาน
tsc/build ผ่าน · ยิงจริงพอร์ตทดสอบ 3 รอบเทียบค่ากับ /api/chart ดวงเดียวกันต้องตรง 100% · เว็บ 4 หน้าไม่กระทบ · reviewer PASS · รายงาน 8 จุด + rollback

---
## ผลงาน (ให้ผู้ทำเติม)
- [ ] life_domains ใน mobile chart + เทียบเว็บตรง
