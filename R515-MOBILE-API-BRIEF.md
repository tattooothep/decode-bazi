# ใบสั่งงาน r515 — ชุดเส้น API มือถือ (จากจาวิสฝั่งแอพ · เจ้านายเคาะแล้ว 13 ก.ค. 2569)

**ผู้รับ:** agent/session ที่เจ้านายมอบหมายฝั่งเซิร์ฟเวอร์ · **ขอบเขต: `/api/mobile/v1/*` เท่านั้น ห้ามแตะหน้าเว็บ/เส้นเว็บ/งานทีม r510 ที่ค้างใน tree**
**ฝั่งแอพ (จาวิส) จะต่อ UI รับทันทีที่แจ้งว่าเสร็จ** — ตอบกลับผ่านไฟล์นี้ (เติมหัวข้อ "ผลงาน" ท้ายไฟล์) หรือบอกเจ้านาย

## กติกา (สำคัญ เคยพังมาแล้ว)
1. อ่าน AGENTS.md ของ repo นี้ก่อน (กฎ 30 ทริค · Codex review · git discipline)
2. deploy ตามแบบ r514 ที่พิสูจน์แล้ว: แก้ source /root/decode-app (backport) + สำเนา release ปัจจุบันเป็น dir ใหม่ r515 → แก้ → `npm run build` ในสำเนา (JAVA ไม่เกี่ยว ฝั่งนี้ node) → ทดสอบพอร์ตแยก (เช่น 3399) → สลับ symlink /root/releases/current → restart ไล่ทีละตัว 3350→3351→3352→(เช็คสาย AI ค้างก่อน) 3349 → เช็คเว็บ 4 หน้า 200 · ดูตัวอย่างสคริปต์ /root/deploy-r514-mobile-today.sh · **ห้าม commit ทับงานทีมอื่น — commit เฉพาะไฟล์ตัวเองตอน tree พร้อม**
3. ทุก endpoint ใหม่: Bearer ผ่าน getMobileSession · scope org/user · rate limit ตามแนวไฟล์ข้างเคียง · ตอบ {ok:...}
4. บัญชีทดสอบ: jarvis.mobiletest.20260712@hourkey.io / MobileTest2026! · profileId 8cf0cfa0-2e6a-4818-9ff4-68cb2bd27fe1 (มีเพื่อน 2 คนในเครือข่ายแล้ว) · login: POST /api/mobile/v1/session

## งาน 4 ชิ้น (เรียงตามคุ้ม)
### 1. วางฤกษ์: หลายคน + บันทึกฤกษ์
- `/api/mobile/v1/datepick` (src/app/api/mobile/v1/datepick/route.ts): เพิ่มรับ `peopleIds: string[]` (เดิมรับ profileId เดียว → ส่งเข้า /api/auspicious แบบเว็บที่ส่ง peopleIds array ได้ · ตรวจ ownership ทุก id ใน org)
- ใหม่: `POST /api/mobile/v1/datepick/save` บันทึกฤกษ์ที่เลือก {candidateId?, activityType, datetime{start,end}, pillars, summary} + `GET .../datepick/saved` รายการที่บันทึก + `DELETE .../datepick/saved/[id]` — เก็บ table ใหม่ mobile_saved_dates (org_id,user_id,payload jsonb,created_at) หรือ reuse ตารางเดิมถ้าเว็บมีระบบบันทึกฤกษ์อยู่แล้ว (ตรวจก่อน! ถ้าเว็บมี ให้ใช้ร่วม)
### 2. ซินแสมือถือ: เปิดสตรีม + แนบรูป
- `/api/mobile/v1/sifu/chat` (route.ts:~121 ตั้ง `stream:false` ตายตัว): เพิ่มโหมด `?stream=1` ส่งต่อ SSE จาก /api/sifu ตรงๆ (text/event-stream) — ค่าเริ่มต้นคง JSON เดิม (แอพเก่าไม่พัง)
- แนบรูป: รับ field `image_base64`/`image_url` (จำกัดขนาด ~5MB · ส่งต่อเข้า pipeline เดิมของ /api/sifu ถ้ารองรับ ไม่งั้นแจ้งว่าทำไม่ได้เพราะอะไร อย่าฝืน)
### 3. หน้า "วันนี้" การ์ดเป้าหมาย 財業情健
- ใหม่: `GET /api/mobile/v1/today/goals?date=&profileId=` — คืน per-goal (เงิน/งาน/รัก/สุขภาพ/ครอบครัว/เดินทาง) ของวันนั้นสำหรับดวงนั้น · **ห้ามคิดสูตรใหม่** ให้ดึงจาก engine เดิมที่ /api/calendar ใช้ (days[].goals + intentStatus ของวันเดียว) — ประหยัดสุดคือเรียก logic calendar เฉพาะวันเดียวแล้วตัด field
### 4. nginx: เส้นมือถือโดนตัด 60 วิ (อัปเดต 13 ก.ค. 08:20 — ยืนยัน 504 จริงเพิ่ม 1 เส้น)
- ยืนยันแล้ว: `/api/mobile/v1/qimen/sifu` ตอบจริง 72 วิ → โดน 60s ตัด 504 (ยิงตรง upstream :3349 สำเร็จ) — ต้องได้ **200s** · `/api/mobile/v1/qimen/search` ให้ **120s**
- อาการยืนยันแล้ว: POST /api/mobile/v1/network/sifu (AI ตอบ >60s) โดนตัด body ว่าง แต่ยามถูกหัก — เพิ่ม location เฉพาะ `/api/mobile/v1/(network/sifu|sifu/|qimen/sifu|luopan/sifu|forecast)` proxy_read_timeout 620s (ตามแนว /api/sifu ของเว็บ) ใน /etc/nginx/sites-enabled/hourkey.io + nginx -t + reload (reload ไม่ตัด connection)

## เช็คก่อนส่งงาน (ทุกข้อ)
tsc/build ผ่าน · ยิงจริงพอร์ตทดสอบ 3 รอบ/เส้น · เว็บ 4 หน้า (/  /today /chart /pricing) ไม่กระทบ · rollback path เขียนไว้ · รายงาน 8 จุดตามกฎ AGENTS.md

---
## ผลงาน (ให้ผู้ทำเติม)
- [x] 1 วางฤกษ์ peopleIds+save: ตรวจ ownership ทุก profile ด้วย org+user, dedupe/legacy profileId, plan gate เดิม; save/list/delete ผูก org+user และ migration `mobile_saved_dates` แบบ additive (ACL SELECT/INSERT/DELETE เท่านั้น)
- [x] 2 sifu stream+image: JSON เดิมผ่าน, `?stream=1` relay SSE ตรงและ bypass JSON cache; image_base64/image_url คืน unsupported/too-large ก่อน upstream และ live test ยืนยัน Yam ไม่เปลี่ยน
- [x] 3 today/goals: คืนหก goals + intentStatus จาก Mobile Calendar เดิม, default Bangkok, บังคับ Today day_window และ ownership; ไม่เพิ่มสูตร/ไม่ bypass entitlement
- [x] 4 nginx timeout: Mobile Qimen Search 120s; Mobile AI wrappers 620s, buffering/cache/gzip off; `nginx -t` และ reload ผ่าน

หลักฐาน: source code `f1c849b`, test follow-up `cb1fb9e`, build `qIBSITj5vGcLb8Mpf_GxM`, unit 9/9, contract 26/26, port 3399 228/228, production 114/114, reviewer PASS, เว็บ 4 หน้า 3 รอบเป็น 200

Rollback: ชี้ `/root/releases/current` กลับ `/root/releases/decode-app-r514-mobile-today-yongshen` แล้ว restart `3350→3351→3352→3349` หลังรอ connection 3349 เป็นศูนย์; คงตาราง/ข้อมูล `mobile_saved_dates` ไว้ ห้าม drop/restore DB
