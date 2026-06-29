# รายงานวิจัย #3: Swiss Ephemeris สำหรับ engine ฤกษ์ดาวจริง
> เตรียมข้อมูล 29 มิ.ย. 2026 · agent research · ⚠️ มีประเด็น "ต้องตัดสินใจ" 2 อัน (license + 紫氣)

## 🔴 สรุปต้องตัดสินใจก่อน
1. **License SE = dual (AGPL หรือ Commercial)** — hourkey.io = SaaS ปิดซอร์ส → **ต้องซื้อ commercial license** (~CHF 750 ใบแรก + CHF 400 ใบถัด · **ต้องยืนยันราคากับ Astrodienst**) · ❌ AGPL บังคับเปิดซอร์สทั้งแอป · ❌ **Moshier ไม่ช่วยหนี license** (license คุมโค้ด ไม่ใช่ไฟล์ .se1)
2. **紫氣 ห้าม fake** — ไม่มีดาราศาสตร์รองรับ + มี ≥2 lineage ขัดกัน → ห้าม implement ก่อนยืนยันสำนัก+epoch

## lib แนะนำ: `sweph` (timotejroiko)
- active สุด (v2.10.x มิ.ย.2026) · N-API รองรับ Node ใหม่ · typed · มี prebuilt · version-lock กับ SE ทางการ
- รัน **ฝั่ง server เท่านั้น** (กันหลุด client bundle Next) · เลี่ยง swetest CLI (spawn ช้า/เปราะ) · WASM = plan B
- Moshier (flag SEFLG_MOSEPH) = ไม่ต้องไฟล์ .se1 · แม่น <1 arcsec (พอสำหรับฤกษ์) · ช้ากว่า ~10x · **แต่ยังอยู่ใต้ license SE**
- ถ้าจะหนี license จริง = ใช้โค้ด Moshier ต้นฉบับ (aa.c, public domain) เอง/reimplement — เสีย feature สำเร็จรูป(node/apogee/sidereal)

## 四餘 คำนวณยังไง
| ดาว | ธาตุ | ดาราศาสตร์ | SE |
|---|---|---|---|
| 羅睺 | ไฟ | node ดวงจันทร์ | ✅ SE_MEAN_NODE/SE_TRUE_NODE |
| 計都 | ดิน | node ตรงข้าม (+180°) | ✅ จาก node |
| 月孛 | น้ำ | lunar apogee/Lilith | ✅ SE_MEAN_APOG/SE_OSCU_APOG |
| **紫氣** | ไม้ | **ไม่มี (虛星)** | ❌ **สร้างสูตรเอง — หลาย lineage** |

- 羅睺/計都: นิยามเปลี่ยนตามยุค (ascending↔descending สลับ) + mean vs true → **ล็อกตามตำรา**
- 月孛: mean vs osculating apogee → สาย七政四餘ดั้งเดิมใกล้ mean
- **紫氣 2 สาย**: (ก) รอบ 28 ปี (閏法) ~0.0352°/วัน "每日行两分六秒" — นิยมสุด แต่**ต้องมี epoch/起算 longitude จากตำรา** · (ข) ผูก lunar perigee (近地点) — ขัดสายแรก · ❌ ห้ามเดา epoch → flag ให้ซินแส/พ่อตัดสิน

## แปลง longitude → 宮/宿
- SE default = **tropical** · 七政四餘+28宿 = **sidereal** → ต้อง swe_set_sid_mode(ayanamsa)+SEFLG_SIDEREAL หรือ tropical−ayanamsa
- ⚠️ **歲差/ayanamsa ต้องตรงสำนักจีน** (ไม่ใช่ Lahiri อินเดีย) อาจต้อง custom epoch (SE_SIDM_USER) → **ยืนยัน lineage**
- 十二宮 = floor(lon/30) · **二十八宿 = ช่องไม่เท่ากัน (距度) ต้องใช้ตารางขอบเขต ไม่ใช่ 360/28** · 24山 = ระบบทิศ(azimuth) คนละระนาบ อย่าปนกับ ecliptic

## checklist เทคนิค
sweph server-only · ตำแหน่งดาว=SE(Moshier พอ) · sidereal+ayanamsaสำนักจีน · 28宿ตารางขอบเขต · 紫氣+ayanamsa+node lineage = รอยืนยันตำรา · **license = ซื้อก่อน production**
