# ใบสั่งงาน R516 — เปิดเส้น "หลอมรวมศาสตร์" (master-fusion) บน API มือถือ (เจ้าของเคาะ "ลุย r516" · 14 ก.ค. 2569)

**ผู้รับ:** ทีม backend (คนเดิมที่ทำ r515) · **ขอบเขต:** `/api/mobile/v1/*` เท่านั้น · กติกา deploy/commit/ทดสอบเหมือน R515 ทุกข้อ (ดู R515-MOBILE-API-BRIEF.md) · **entitlement เดิมยังแช่**

## เหตุผล
แผน 12 หน้า (pland.md ตาราง URL): หน้า 10 "หลอมรวมศาสตร์ /master-fusion" ต้องเป็น**คนละหน้า/route/state/API กับ /master** — ตอนนี้ mobile API ไม่มีเส้น fusion เลย (`/api/sifu/fusion` เปิดเฉพาะฝั่งเว็บ) แอพจึงสร้างหน้า 10 ไม่ได้

## งาน: ห่อระบบ fusion เดิม (fusion5 durable jobs — มีครบแล้วฝั่งเว็บ: พับจอได้/resume/seen_at) เป็นชุดเส้นมือถือ
1. `POST /api/mobile/v1/fusion/ask` — สร้างงานหลอมรวม: {question, profileId, lang(th/en/zh), sciences? ตามที่ระบบเว็บรองรับ} → {ok, job_id, balance_after?} · หักยามกลไกเดียวกับเว็บ (idempotent — retry ห้ามหักซ้ำ ใช้ fusion5_jobs เดิม)
2. `GET /api/mobile/v1/fusion/jobs/[id]` — สถานะ+ผล: {status: queued/running/done/error, panels/answer ตามโครงจริงของ fusion5, spent, seen_at} — มือถือพับจอแล้วกลับมาต้อง resume ได้เหมือนเว็บ
3. `GET /api/mobile/v1/fusion/history?profileId=&limit=` — ประวัติการหลอมรวมต่อดวง
4. (ถ้าระบบเดิมมี) เส้นยกเลิกงาน/ดูคิว — ตามของจริง อย่าประดิษฐ์ใหม่
5. nginx: เส้น fusion mobile ต้องได้ timeout ยาวเท่าที่ระบบเว็บใช้ (fusion สูงสุด ~1300s ตาม config เดิม) — เพิ่ม location ตามแนวที่ทำใน r515
6. **ห้ามแตะ engine/prompt/คัมภีร์ของ fusion เดิมแม้แต่บรรทัดเดียว** — งานนี้คือ "เปิดประตู" เท่านั้น · Bearer + ownership + entitlement gate ตามแนวไฟล์ข้างเคียง

## เช็คก่อนส่ง (เหมือน R515)
tsc/build ผ่าน · ยิงจริงพอร์ตทดสอบ: ask→poll จน done→history ครบวง ด้วยบัญชีทดสอบ (ดู R515 brief · ระวังยามบัญชีทดสอบเหลือ ~700 ใช้พอประมาณ) · เว็บ 4 หน้า 200×3 รอบ · reviewer PASS · rollback path · รายงาน 8 จุด + เติมหัวข้อ "ผลงาน" ท้ายไฟล์นี้ + อัปเดต decision log ใน pland.md

## งานพ่วง B: เส้นพยากรณ์รายคนเครือข่าย (Bearer) — แอพต้องใช้ แต่ตอนนี้ไม่มี
พบตอนทำแอพ (14 ก.ค.): แถบ "30 วัน/12 เดือน/ภาพรวมปี" ในโมดัลดวงรายคนหน้าเครือข่าย เว็บดึงจาก `POST /api/network/own-score {includeForecast:true}` → คืน `forecast:{days[30],months[12],years[5]}` — แต่ route นั้นใช้ `getSession()` (cookie เท่านั้น ไม่มี Bearer) และเส้นมือถือ `/api/mobile/v1/network` ไม่คืน forecast เลย → แอพทำแถบนี้ด้วยข้อมูลจริงไม่ได้
ขอเพิ่ม: `GET /api/mobile/v1/network/own-forecast?centerProfileId=&date=YYYY-MM-DD`
- auth `getMobileSession(req)` (Bearer) · โหลด profile+yongshen จาก DB ด้วย orgId/userId เอง (แบบ network/route.ts loadProfiles) ห้ามรับ pillars จาก client
- แยก core ของ own-score `includeForecast` เป็น lib ร่วม (เช่น src/lib/scoring/own-forecast.ts) เรียกทั้งเว็บ+มือถือ (single source ห้ามก็อป)
- response: `scores:{day,week,month,year}` · `forecast.days[]{date,pillar,score,level,summary,tags[]}` · `forecast.months[]{month,pillar,score,level,summary,tags[]}` · `forecast.years[]{year,pillar,score,level,summary,tags[]}` · `insight:{element,suitable,avoid,lp,reason[]}`

---
## ผลงาน (ให้ผู้ทำเติม)
- [ ] fusion/ask:
- [ ] fusion/jobs/[id]:
- [ ] fusion/history:
- [ ] nginx timeout:
- [ ] network/own-forecast (งานพ่วง B):
