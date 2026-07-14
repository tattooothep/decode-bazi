# ข้อตกลงแบ่งเขตงาน (เจ้าของเคาะ 14 ก.ค. 2569) — จาวิส(แอพ) × ทีม backend

## เขตงานถาวร
| เขต | เจ้าของ | กติกา |
|---|---|---|
| **แอพมือถือทั้งก้อน** `/root/worktrees/hourkey-mobile-p0-network-sifu` (App.tsx, src/**, implementer/**, android/**) | **จาวิส** | ทีม backend **ห้าม commit/แก้ไฟล์ในนี้อีก** — ของที่อยากส่งเข้าแอพ (component/spec/รายงาน) ให้เขียนใบส่งงานที่ `HANDOFF-TO-MOBILE.md` (สร้างในโฟลเดอร์นี้) จาวิสเป็นคนต่อเข้าแอพเอง · ของที่ commit ไปแล้ว (QimenBoard/modal/qimen model) จาวิสจะรีวิวและรวมร่างเอง |
| **backend/API/deploy** `/root/decode-app` + `/root/worktrees/hourkey-backend-*` | **ทีม backend** | จาวิสไม่แก้ (อ่าน+เขียนใบสั่งงาน `R51x-*-BRIEF.md` เท่านั้น) |
| **deploy production ทุกครั้ง** | **เจ้าของเคาะก่อนเสมอ** | ห้ามใครกดเอง — รวมถึงสคริปต์ entitlement foundation ที่เตรียมไว้ (**แช่จนกว่าเจ้าของสั่ง**) |

## งานที่มอบทีม backend ต่อ (เรียงตามลำดับ)
1. **แช่ entitlement deploy** — เตรียมดีแล้ว แต่รอเจ้าของเคาะ ห้ามรัน
2. **เก็บวินัยเอกสาร**: commit `pland.md` ฉบับแม่เข้า git (ตอนนี้ลอย untracked ผิดกติกาของแผนเอง) + เติมแถว decision log §27 (entitlement 13 ก.ค.) + สร้างไฟล์ fixtures `test-fixtures/mobile-r515/*.sanitized.json` ที่ spec อ้างไว้ให้มีจริง (หรือถอนการอ้าง)
3. **iOS ผ่าน EAS cloud** (ปลดล็อกตัวติดตั้ง iOS): ศึกษา+เตรียม pipeline eas build จาก worktree แอพ (อ่านได้ ห้ามแก้) — ต้องใช้บัญชี Expo+Apple ของเจ้าของ ให้ทำเช็คลิสต์สิ่งที่ต้องสมัคร/กรอกมาเสนอ
4. รับใบสั่ง API ชุดถัดไปจากจาวิส (จะมีหลังรวมร่างแอพเสร็จ เช่น เส้นที่ขาดจากหน้า บัญชี/ร้านค้า)

## ช่องสื่อสาร
- backend→แอพ: `HANDOFF-TO-MOBILE.md` (ในโฟลเดอร์นี้)
- แอพ→backend: `R51x-*-BRIEF.md` (แบบ R515 ที่ใช้ได้ผลแล้ว)
- ทั้งคู่รายงานเจ้าของโดยตรงเหมือนเดิม · บัญชีทดสอบร่วม: ดูใน R515-MOBILE-API-BRIEF.md
