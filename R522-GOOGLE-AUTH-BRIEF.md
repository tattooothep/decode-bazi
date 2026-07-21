# ใบสั่งงาน r522 — Google Sign-In จริงสำหรับแอพมือถือ (จากจาวิสฝั่งแอพ · 19 ก.ค. 2569)

**ผู้รับ:** ทีม backend (worktree candidate ปัจจุบัน `codex/backend-r521-hours-personalization`)
**ขอบเขต:** `/api/mobile/v1/auth/*` เท่านั้น · ห้ามแตะเว็บ/live · **ห้าม deploy จนเจ้านายเคาะ** (commit ใน clean backend worktree ตามกฎ r514/r515)
**ที่มา:** goal production-ready ระบุ "Google Sign-In ต้องเป็นของจริง ห้ามเพิ่มปุ่มหลอก" — ตรวจแล้วแอพ**ไม่เคยมี** implementation (DesignForms.tsx:920 มีแค่ email/password · ไม่มี OAuth endpoint ใน mobile API · docs/mobile-api-boundary.md:10) — ฝั่งแอพจะยังไม่เพิ่มปุ่มจนกว่า endpoint ชุดนี้เสร็จจริง

## งานที่ขอ (ท่อฝั่ง server ครบวงจร)
### 1. Endpoint แลก credential
- `POST /api/mobile/v1/auth/google` รับ `{ id_token, platform: "android"|"ios", nonce }`
- ตรวจครบ: **issuer** (`https://accounts.google.com`) · **audience** ตรง client ID ของ platform นั้น (Android/iOS แยกกัน — ห้ามใช้ web client เดี่ยว) · **expiry/iat** · **nonce** ตรงกับที่แอพสุ่มส่งไป (กัน replay) · **signature** ผ่าน JWKS ของ Google (cache กุญแจตามมาตรฐาน)
- กัน replay ซ้ำ: jti/nonce ใช้ครั้งเดียว (เก็บ short-TTL)
### 2. นโยบายผูกบัญชี (account-linking) — เสนอให้เจ้านายเคาะก่อน implement
- email ตรงกับบัญชี hourkey เดิม (email_verified=true) → link เข้าบัญชีเดิม
- ไม่มีบัญชี → สร้างใหม่ + ถือว่า verify อีเมลแล้ว
- email_verified=false → ปฏิเสธ (กัน account takeover)
- เก็บ `google_sub` ผูกกับ user (unique index) — login รอบถัดไปใช้ sub นำ ไม่ใช่ email
### 3. ตอบกลับ
- สำเร็จ → ออก token ระบบเดิม (รูปเดียวกับ POST /api/mobile/v1/session) + flag `is_new_account`
- ล้มเหลว → `{ok:false, error:<code>}` แยก code ชัด (invalid_token/audience_mismatch/nonce_mismatch/replay/email_unverified) ห้าม raw exception
### 4. ค่า config ที่ต้องเตรียม (ต้องให้เจ้านายสร้างใน Google Cloud Console)
- OAuth client ID **Android** (ผูก package `io.hourkey.app` + SHA-1 ของ keystore production — ตอนนี้แอพยังเซ็น debug keystore ต้องทำ keystore จริงก่อน จดเป็น dependency)
- OAuth client ID **iOS** (ผูก bundle id)
- เก็บใน env gitignored ตามแบบ Stripe/Google Play keys — ห้าม commit ค่า

## เช็คก่อนส่งงาน
tsc/build ผ่าน · เทส contract: token ปลอม/audience ผิด/nonce ซ้ำ/expiry ขาด ต้องตกครบ · ยิงจริงพอร์ตทดสอบ 3 รอบ · reviewer PASS · รายงาน 8 จุด + rollback path

## ฝั่งแอพ (จาวิสทำเอง หลัง endpoint เสร็จ)
expo-auth-session + PKCE · ปุ่ม Google ใน login (ไม่มีปุ่มจนกว่า endpoint จริงพร้อม) · เทส cancel/offline/สลับบัญชี · พิสูจน์บนเครื่องจริง Android/iOS

---
## ผลงาน (ให้ผู้ทำเติม)
- [ ] 1 endpoint แลก credential + validation ครบ
- [ ] 2 นโยบายผูกบัญชี (รอเจ้านายเคาะ)
- [ ] 3 รูปแบบตอบกลับ + error codes
- [ ] 4 เช็คลิสต์ config ให้เจ้านายสร้าง client IDs
