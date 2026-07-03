# แผน PWA hourkey.io · r376 (PLAN-ONLY · ยังไม่แก้โค้ดใด ๆ)

> โจทย์เจ้านาย: **"PWA วางแผนดีๆ ถูกเวอร์ชั่น อย่าสะเทือนอะไร"**
> หลักออกแบบ: Service Worker **ห้ามแตะ HTML และ /api/ เด็ดขาด** — ทำหน้าที่แค่ 3 อย่าง:
> (1) หน้า offline สำรอง (2) cache ไฟล์ static ที่มี `?v=` (3) ทำให้ติดตั้งลงหน้าจอมือถือได้
> ถ้าถอด SW ออก เว็บต้องทำงานเหมือนเดิม 100%

---

## 0. ผลสำรวจระบบจริง (อ่านแล้วเมื่อ 3 ก.ค. 2026 · read-only)

### 0.1 Release / Deploy
- `/root/releases/current` → symlink → `decode-app-r375-batch` (ปัจจุบัน)
- systemd 4 ตัว: `hourkey-decode.service` (:3349 · WorkingDirectory **hardcode ชื่อ release dir** · แก้ทุกรอบ deploy) + `hourkey-decode@{3350,3351,3352}` (WorkingDirectory=`/root/releases/current`)
- nginx `upstream hourkey_app` least_conn 4 instance · `hourkey_ai` ปักหมุด 3349
- ระหว่าง rolling restart มีช่วงสั้น ๆ ที่ instance เสิร์ฟไฟล์คนละเวอร์ชัน → แผน SW ต้องทนภาวะนี้ได้ (ดู §2.4)

### 0.2 Caching ปัจจุบัน (next.config.ts)
- ทุกหน้า HTML (~40 surface) = `no-store, max-age=0, must-revalidate` ✅ ดีอยู่แล้ว — **SW ห้าม cache HTML ซ้ำ** เพราะเว็บ deploy วันละหลายรอบ
- `/css/mobile-safe.css` + `/js/hk-user-menu.js` = no-store (ไฟล์ kill-switch เดิม)
- ไฟล์ static อื่น (js/svg) = `public, max-age=0` + ETag → browser revalidate ทุกครั้ง · ใช้ `?v=` bust ตามธรรมเนียม

### 0.3 CSP (nginx `/etc/nginx/sites-enabled/hourkey.io` บรรทัด 355)
```
script-src 'self' 'unsafe-inline' cdn.jsdelivr.net maps.googleapis.com
worker-src 'self' blob:          ← มีแล้ว · พอสำหรับ SW ✅
connect-src 'self' https: wss:   ← พอสำหรับ fetch ใน SW ✅
(ไม่มี manifest-src → fallback ไป default-src 'self' → manifest same-origin ผ่าน ✅)
```
**สรุป: ไม่ต้องแก้ CSP เลย** — เงื่อนไขคือ SW + manifest + icons ต้องอยู่ same-origin ทั้งหมด (ห้ามพึ่ง CDN/workbox ภายนอก → เขียน SW vanilla เอง)

### 0.4 Login gate (`src/proxy.ts` — LOCKED ห้ามแตะ)
- หน้า protected (/today /chart /master /master-fusion /datepick ฯลฯ) ไม่มี cookie → **307** `/signup?tab=login&next=...`
- SW แบบ pass-through navigation รองรับ 307 ได้ (navigation request เป็น redirect-mode `manual` → browser ตามเอง) แต่ต้องมีเทสยืนยัน (§5)

### 0.5 หน้า HTML 35 ไฟล์ + shared JS ใครโหลดอะไร
- **`js/hk-profile-sync.js?v=20260517b` = ตัวครอบคลุมสุด (26 หน้า)** รวม landing, signup, today, master, chart, datepick, account ฯลฯ · ไฟล์เล็ก 2.4KB · มี guard `window.__hkProfileSyncLoaded` อยู่แล้ว
- `hk-user-menu.js` (15 หน้า · no-store อยู่แล้ว) — หน้าเดียวที่มี user-menu แต่ไม่มี profile-sync คือ `master-fusion.html`
- หน้าที่ไม่โหลดทั้งคู่: `article-geometry.html` `methodology.html` `reset-password.html` `tianxing.html` (+ หน้า `-m` ที่ redirect ทิ้งแล้ว)
- **ไม่เป็นไร**: SW ลงทะเบียนจากหน้าไหนก็ได้ scope `/` คุมทั้งเว็บ — ไม่จำเป็นต้องครบ 100% ทุกหน้า จุดเข้าเว็บหลัก (landing/signup/today/master) มี profile-sync หมดแล้ว

### 0.6 Streaming / Polling ที่ห้ามสะเทือน
- `master.html`: `EventSource('/api/sifu?...')` + fetch streaming `getReader()` (text/event-stream)
- `master-fusion.html`: `pollProgress` ทุก 2 วินาที + pollJob (seen_at deliver-once r357)
- Google Places: โหลดผ่าน proxy ภายใน `/api/maps-script` (5 หน้า: input/datepick/tianxing/fengshui/compass-studio) → อยู่ใต้ `/api/` → กติกา "SW ไม่แตะ /api/" คุ้มครองให้เองอัตโนมัติ ✅

### 0.7 ไอคอน / ธีม / ภาษา
- มีแค่ `public/favicon.svg` (ตัว 鑰 ทอง `#b49052` บนพื้น `#0f0e0c`) — **ยังไม่มี PNG ใด ๆ**
- 🐞 พบของแถม: 33 หน้าอ้าง `<link rel="apple-touch-icon" href="/favicon.svg?v=2">` (iOS ไม่รับ SVG → ตอนนี้ Add to Home Screen ได้ screenshot) และหลายหน้าอ้าง `/favicon.ico?v=2` ซึ่ง **ไฟล์ไม่มีจริง (404)**
- ธีม: `localStorage['hk-theme']` (default `dark`) + attribute `data-theme` · ภาษา: `localStorage['hk_locale']` th/en/zh
- ยังไม่มี `<meta name="theme-color">` ในหน้าไหนเลย
- Mobile app (Expo · `docs/mobile-app-plan.md`): แยกขาด ห้ามแตะเว็บ — PWA ไม่ชน · อนาคตแอปจริงออกค่อยเติม `related_applications` ใน manifest

---

## 1. Scope เฟส 1 — ของใหม่ทั้งหมดเป็น "ไฟล์ใหม่" · แตะของเดิมแค่ 2 ไฟล์

### 1.1 `public/manifest.webmanifest` (ใหม่)
```json
{
  "id": "/",
  "name": "Hourkey — ดวง 5 ศาสตร์",        ← รอเจ้านายเคาะชื่อ
  "short_name": "Hourkey",
  "start_url": "/today?src=pwa",             ← รอเจ้านายเคาะ (ข้อเสนอ §7)
  "scope": "/",
  "display": "standalone",
  "background_color": "#0f0e0c",
  "theme_color": "#0f0e0c",
  "lang": "th",
  "icons": [192, 512, maskable-512]
}
```
- theme_color ใน manifest ใส่ได้ค่าเดียว → ใช้ **ธีมมืด (default ของเว็บ)** `#0f0e0c` เป็นหลัก
- 2 ธีม: `hk-pwa.js` inject `<meta name="theme-color">` แบบ dynamic ตาม `hk-theme` (มืด `#0f0e0c` / สว่างค่าจาก palette หน้า today — เก็บตอน implement) → แถบ status bar ตรงธีมเสมอ
- `start_url=/today` เป็นหน้า login-gated → คนยังไม่ login เปิดแอปแล้วเด้งไป `/signup?next=/today` = flow ปกติของเว็บ ไม่ต้องทำอะไรเพิ่ม

### 1.2 `public/sw.js` (ใหม่ · vanilla ไม่ใช้ workbox/CDN — CSP บังคับ + คุมได้ 100%)
กติกาเหล็กใน fetch handler (เรียงตามลำดับ ตัดออกก่อนถึงจะเข้า cache logic):
```
1. method !== 'GET'                    → return (ไม่เรียก respondWith เลย = browser จัดการเอง)
2. url.origin !== self.origin          → return (Google Fonts/jsdelivr/maps ไม่แตะ)
3. url.pathname.startsWith('/api/')    → return  ⛔ เด็ดขาด — sifu stream/EventSource/
                                                    fusion polling/maps-script ไม่ผ่าน SW logic
4. request.mode === 'navigate' (HTML)  → respondWith( fetch(req).catch(() => offline.html จาก cache) )
                                          = network-ONLY · ไม่ cache · ไม่อ่าน cache
                                          ล้มเหลว (ออฟไลน์) เท่านั้นถึงเสิร์ฟ offline.html
5. เป็น static เวอร์ชัน?               → cache-first เฉพาะเมื่อครบทุกข้อ:
     - มี query ?v=  (ธรรมเนียม bump ของเรา → URL เปลี่ยน = cache ใหม่เอง)
     - destination ∈ {script, style, image, font}
     - ไม่ใช่ /js/hk-user-menu.js และ /css/mobile-safe.css (2 ไฟล์ no-store kill-switch เดิม)
   + /icons/* และ /favicon.svg → cache-first (precache ตอน install)
6. อื่น ๆ ทั้งหมด                       → return (ไม่แตะ)
```
- `install`: precache `offline.html` + icons + `self.skipWaiting()`
- `activate`: ลบ cache ชื่อเก่าทุกอัน + `clients.claim()`
- ตัวเช็ค kill-switch: ตอน activate + ทุก 24 ชม. fetch `/pwa-flag.json` (no-store) — ถ้า `"off"` → `registration.unregister()` + ล้าง cache (ดู §2.3)

### 1.3 `public/offline.html` (ใหม่ · หน้าเดียว · self-contained ไม่พึ่งไฟล์อื่น)
- inline CSS ทั้งหมด · รองรับ 2 ธีม (อ่าน `hk-theme` จาก localStorage) + 3 ภาษา (อ่าน `hk_locale`)
- ข้อความโทน: **"ตอนนี้ออฟไลน์อยู่ · การดูดวงต้องเชื่อมฟ้าเชื่อมเน็ต 🌙"** + ปุ่ม "ลองใหม่" (location.reload)
- ไอคอน 鑰 ทองแบบ inline SVG จาก favicon เดิม

### 1.4 `public/js/hk-pwa.js` (ใหม่) — สมองฝั่งหน้าเว็บ
- เช็ค `/pwa-flag.json` → ถ้า on: `navigator.serviceWorker.register('/sw.js')`
- inject `<link rel="manifest">` + `<link rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png">` (ทับตัว SVG เดิมที่ iOS ไม่รับ) + `<meta name="theme-color">` ตามธีม — **ไม่ต้องแก้ HTML LOCKED สักหน้า**
- banner "มีเวอร์ชันใหม่ กดรีเฟรช" (§2.2) + install UX (§4)
- กัน error ทั้งไฟล์ด้วย try/catch — พังเงียบ ห้ามลามหน้าเว็บ

### 1.5 การฉีด registration โดยไม่แตะ HTML (ข้อเสนอที่แตะไฟล์น้อยสุด)
- **แก้ `public/js/hk-profile-sync.js` ต่อท้าย ~8 บรรทัด** (มี guard เดิมอยู่แล้ว): โหลด `/js/hk-pwa.js?v=1` แบบ async เมื่อ `serviceWorker` in navigator → ครอบคลุม 26 หน้า รวมทุกจุดเข้าหลัก
- ให้ไฟล์นี้ขึ้น no-store: **แก้ `next.config.ts` เพิ่ม 1 รายการ** `{ source: "/js/hk-profile-sync.js", headers: noStoreHeaders }` (pattern เดียวกับ hk-user-menu.js เป๊ะ) → user ได้โค้ดใหม่โดย **ไม่ต้องไล่ bump `?v=` ใน HTML 26 ไฟล์** (ซึ่งหลายไฟล์ LOCKED)
- `master-fusion.html` / `tianxing.html` ไม่โหลด profile-sync → ไม่ลงทะเบียนจากหน้านั้น แต่ SW จาก scope `/` คุมอยู่แล้วถ้า user เคยเข้าหน้าอื่น — ยอมรับได้ ไม่แตะเพิ่ม

---

## 2. Versioning — "ถูกเวอร์ชั่น" ผูกกับ release tag

### 2.1 กลไก
- บรรทัดแรกของ `sw.js`: `const HK_SW_VERSION = 'r376';` → ชื่อ cache = `hk-pwa-r376`
- `sw.js` + `pwa-flag.json` + `manifest.webmanifest` ต้องได้ header **no-store** (เพิ่มใน `headers()` ของ next.config.ts) → browser เช็ค byte-diff ทุก navigation → **deploy ใหม่ = SW ใหม่ถูกเห็นภายใน navigation ถัดไป** ไม่มีทางค้าง 24 ชม.
- สคริปต์กันลืม (ใหม่ · optional แต่แนะนำ): `scripts/check-sw-version.mjs` — เทียบ `HK_SW_VERSION` กับชื่อ release dir ตอน cut release · แค่เตือน ไม่ block · ผูกเข้า checklist "เช็คก่อน cut release" ใน AGENTS.md (ขั้นตอนที่ 6-8 เดิม)
- กติกา bump: **แก้ sw.js / offline.html / icons เมื่อไหร่ → bump HK_SW_VERSION เป็น rXXX ปัจจุบันเสมอ** (ธรรมเนียมเดียวกับ feedback_bump_version_param) · release ที่ไม่แตะไฟล์ PWA ไม่ต้อง bump (SW เดิมใช้ต่อได้เพราะไม่ cache HTML — ไม่มี version skew)

### 2.2 update flow — user ไม่ค้าง SW เก่าเกิน 1 release
- `skipWaiting()` ตอน install **แบบไม่มีเงื่อนไข** + `clients.claim()` — ปลอดภัยเพราะ SW เราไม่ cache HTML → ไม่มีปัญหา HTML เก่าคู่ asset ใหม่
- `hk-pwa.js` เรียก `registration.update()` ทุกครั้งที่เปิดหน้า + ฟัง `updatefound` → เมื่อ SW ใหม่ activate แล้วโชว์ banner ล่างจอ (ไม่บังเนื้อหา):
  - th: "มีเวอร์ชันใหม่ · แตะเพื่อรีเฟรช" / en: "New version available · Tap to refresh" / zh: "有新版本 · 点击刷新"
  - อ่านภาษาจาก `hk_locale` · สี 2 ธีมตาม `data-theme`
  - **ยกเว้นไม่โชว์** ขณะ master/master-fusion กำลัง stream/มี job วิ่ง (เช็ค `state.busy`/มี answer กำลังพิมพ์ → เลื่อนไปโชว์ตอน idle) — กันรีเฟรชกลางคำทำนาย

### 2.3 Kill-switch 2 ชั้น
1. **ชั้นเบา (ไม่ต้อง deploy โค้ด)**: `public/pwa-flag.json` = `{"pwa":"on"}` (no-store) → สลับเป็น `off` = หน้าเว็บเลิก register + SW ที่ activate อยู่ตรวจ flag แล้ว unregister ตัวเอง+ล้าง cache · หมายเหตุ: การแก้ flag ใน production ต้องทำผ่าน release เล็ก หรือ hotfix ใน release dir + backport commit ภายใน 24 ชม. ตามกฎ Git Discipline
2. **ชั้นนิวเคลียร์**: เตรียม `scripts/pwa-killswitch-sw.js.txt` (stub SW: activate → unregister + caches ลบหมด + clients.claim) ไว้ในแผน — เหตุฉุกเฉินเอาไปทับ `public/sw.js` แล้ว deploy → ทุก client โดน unregister ใน navigation ถัดไป (< 1 นาทีสำหรับ user ที่ active)

### 2.4 ทนภาวะ 4 instance เวอร์ชันปนกันระหว่าง rolling restart
- SW ไม่ precache อะไรที่อ้างข้าม release นอกจาก offline.html+icons (มีอยู่ทุก release) → mixed-version window ไม่ทำให้ install fail
- ถ้า install fail กลางคัน browser เก็บ SW เดิมไว้ → ปลอดภัยโดยธรรมชาติ

---

## 3. จุดเสี่ยงที่ต้อง "ไม่สะเทือน" — วิธีคุมทีละข้อ

| # | จุดเสี่ยง | วิธีคุม | เหลือความเสี่ยง |
|---|---|---|---|
| a | **login gate 307 → /signup** (`src/proxy.ts` LOCKED) | ไม่แตะ proxy.ts · navigation = pass-through fetch (redirect-mode manual → browser ตาม 307 เอง) · มีเทสเฉพาะ §5.4 | ต่ำ (มี browser quirk เก่าเรื่อง opaqueredirect — เทสจริง iOS+Android ก่อนเปิด) |
| b | **/api/* ห้ามผ่าน SW cache** (sifu/fusion stream + jobs poll 2s + maps-script) | ตัดที่ด่านที่ 3 ของ fetch handler — return ก่อนเข้า logic ใด ๆ = พฤติกรรมเท่ากับไม่มี SW · POST ถูกตัดตั้งแต่ด่าน 1 | ต่ำมาก |
| c | **CSP** | `worker-src 'self' blob:` มีแล้ว · manifest-src fallback `default-src 'self'` ผ่าน · ทุกไฟล์ PWA same-origin · **ไม่แก้ nginx เลย** | ต่ำมาก |
| d | **Google Places** | โหลดผ่าน `/api/maps-script` → ได้กติกา (b) คุ้มครองอัตโนมัติ · script จาก maps.googleapis.com เป็น cross-origin → ด่าน 2 ตัดทิ้ง | ต่ำมาก |
| e | **หน้า LOCKED ห้ามแก้ HTML** | manifest/apple-icon/theme-color inject ผ่าน `hk-pwa.js` (โหลดจาก hk-profile-sync) · **ศูนย์ไฟล์ HTML ถูกแก้** | ต่ำ — ข้อจำกัด: iOS บางเวอร์ชันอ่าน apple-touch-icon ที่ inject ไม่ทัน → ถ้าเจอจริงค่อยขออนุมัติเติม `<link>` static ใน landing/signup (2 ไฟล์) เป็นเฟสถัดไป |
| f | **iOS Safari quirks** | ไม่มี beforeinstallprompt → banner สอน "แชร์ → เพิ่มลงหน้าจอโฮม" · ต้องมี `apple-touch-icon` PNG 180px (ตอนนี้ชี้ SVG = พัง อยู่แล้ว — ของเราแก้ให้ดีขึ้น) · iOS ≥16.4 รับ manifest/SW แล้ว · display standalone บน iOS: EventSource/streaming ใช้ได้ปกติ | กลาง — iOS เป็นตัวแปรเยอะสุด ต้องเทสเครื่องจริง |
| g | ชนกับ **hourkey-mobile (Expo)** | PWA = เว็บล้วน ไม่แตะ /api/mobile · เมื่อแอปจริงออก ค่อยเติม `related_applications` ชี้ store เพื่อชวนย้าย | ไม่มีตอนนี้ |
| h | **no-store 2 ไฟล์เดิม** (hk-user-menu.js / mobile-safe.css) | อยู่ใน exclusion list ของ SW ชัดเจน — ยังเป็น kill-switch สดได้เหมือนเดิม | ต่ำมาก |

---

## 4. Install UX — ชวนแบบไม่รบกวน

- `hk-pwa.js` ดักฟัง `beforeinstallprompt` → `preventDefault()` เก็บ event ไว้
- เงื่อนไขโชว์ปุ่ม/แถบชวนเล็ก ๆ (มุมล่าง ไม่ใช่ modal):
  1. อุปกรณ์มือถือ (UA + จอแคบ) และ **ไม่ใช่** โหมด standalone อยู่แล้ว (`display-mode: standalone` / `navigator.standalone`)
  2. เข้าเว็บครั้งที่ ≥ 2 (นับใน `localStorage['hk_pwa_visits']` — นับวันละ 1)
  3. ไม่เคยกดปิด หรือกดปิดมาแล้ว > 30 วัน (`hk_pwa_dismissed_at`)
- Android/Chrome: กดแล้วเรียก `deferredPrompt.prompt()` · iOS: โชว์การ์ดสอน 2 ขั้น (ไอคอนแชร์ → Add to Home Screen) 3 ภาษา
- ข้อความ th: "ติดตั้ง Hourkey ไว้หน้าจอ — เปิดดูดวงได้ในแตะเดียว" (en/zh เทียบเคียง)

### ไอคอน — สร้างจาก favicon.svg เดิม (鑰 ทอง #b49052 บนพื้น #0f0e0c)
สร้างด้วย `rsvg-convert` หรือ `sharp` (มีใน node_modules ของโปรเจกต์อยู่แล้ว — เช็คตอน implement, ถ้าไม่มีใช้ rsvg-convert ของระบบ):
- `public/icons/icon-192.png` · `icon-512.png` (ตรงจาก SVG เดิม)
- `public/icons/icon-maskable-512.png` — ขยาย padding พื้น `#0f0e0c` เป็น 20% กันโดน mask ตัดตัว 鑰
- `public/icons/apple-touch-icon-180.png` — พื้นทึบ (iOS ไม่รับโปร่งใส)
- แถมแก้ 404 เดิม: `public/favicon.ico` (16+32px จาก SVG เดียวกัน) — 33 หน้าอ้างอยู่แล้วแต่ไฟล์ไม่มี

---

## 5. Test plan (ก่อนเปิดจริงทุกข้อต้องผ่าน · ทดสอบ 3 รอบตามกฎ)

1. **Lighthouse PWA checklist**: `/` (logged-out) + `/today` (logged-in) — installable + manifest ครบ + SW registered
2. **จำลอง offline** (DevTools + โหมดเครื่องบินเครื่องจริง): เปิดหน้าใหม่ → เห็น offline.html สวย 2 ธีม 3 ภาษา · กลับ online → กดลองใหม่ → หน้าจริงกลับมา
3. **SW ไม่แตะ API** (สำคัญสุด): เปิด SW แล้วรัน (ก) master ถามซินแส — EventSource + fetch stream พิมพ์ครบไม่ขาดกลางคัน (ข) master-fusion ยิง fusion 5 ศาสตร์ — poll 2s + พับจอ resume (r357) ยังทำงาน (ค) DevTools Network: ทุก request `/api/*` ไม่มีคำว่า "(from ServiceWorker cache)" (ง) `/input` Google Places autocomplete ทำงาน
4. **login gate**: logout → เข้า `/today` ตรง ๆ (มี SW คุม) → เด้ง `/signup?tab=login&next=/today` → login → กลับ /today · ทำซ้ำในโหมด standalone (แอปที่ติดตั้งแล้ว) ทั้ง Android + iOS เครื่องจริง
5. **headers**: `curl -I` เช็ค `/sw.js` `/pwa-flag.json` `/manifest.webmanifest` = no-store · manifest content-type = `application/manifest+json`
6. **update flow**: deploy รุ่นถัดไป (bump HK_SW_VERSION) → เปิดหน้า → banner "มีเวอร์ชันใหม่" โผล่ · กด → ได้ของใหม่ · cache เก่า `hk-pwa-rXXX` ถูกลบ (DevTools Application)
7. **rolling restart 4 instance**: deploy ระหว่างมี tab เปิดค้าง → ไม่มี error console · SW เดิมยังทำงาน
8. **rollback drill (ต้องซ้อมจริงก่อนเปิด)**: (ก) สลับ pwa-flag=off → client unregister ใน navigation ถัดไป (ข) ทับ sw.js ด้วย stub นิวเคลียร์ → เครื่องเทสทุกเครื่องหลุดจาก SW ภายใน 1 นาที + เว็บใช้ได้ปกติ
9. **regression เดิม**: `node scripts/test-bazi-calc.cjs` + `test-bazi-palaces.cjs` ผ่าน (ไม่แตะ engine อยู่แล้ว — ยืนยันเปล่า ๆ) + ไล่เปิด 10 หน้าหลัก 3 ภาษา × 2 ธีม
10. **cluster โหลด**: ยิง `hey`/`ab` เบา ๆ ที่ /landing + /js/hk-profile-sync.js ยืนยัน p95 < 500ms เท่าเดิม (SW เป็นฝั่ง client ไม่ควรกระทบ server เลย — เช็คเพื่อปิดข้อสงสัย)

---

## 6. แบ่งงาน · ไฟล์ที่แตะ · ความเสี่ยง · ข้อห้าม

### แนะนำ **2 release** (อย่าเหมารวดเดียว)

**Release A — "วางท่อ + canary" (เช่น r376)** · user ทั่วไปยังไม่เห็นอะไรเปลี่ยน
| ไฟล์ | สถานะ | เสี่ยง |
|---|---|---|
| `public/sw.js` | ใหม่ | ต่ำ (ยังไม่มีใคร register นอกจาก canary) |
| `public/manifest.webmanifest` | ใหม่ | ต่ำมาก |
| `public/offline.html` | ใหม่ | ต่ำมาก |
| `public/js/hk-pwa.js` | ใหม่ | ต่ำ |
| `public/pwa-flag.json` | ใหม่ · เริ่มค่า `"canary"` | ต่ำมาก |
| `public/icons/*` (4 PNG) + `public/favicon.ico` | ใหม่ | ศูนย์ (แถมแก้ 404 เดิม) |
| `public/js/hk-profile-sync.js` | **แก้** ต่อท้าย ~8 บรรทัด (โหลด hk-pwa.js) | **จุดเสี่ยงสูงสุดของงานนี้** — ไฟล์นี้อยู่ใน 26 หน้า · ต้อง try/catch ครอบ + ไม่แตะโค้ดเดิมข้างบน + เทส 3 รอบ |
| `next.config.ts` | **แก้** เพิ่ม headers 4 รายการ (sw.js / pwa-flag.json / manifest / hk-profile-sync.js = no-store) | ต่ำ (pattern เดิมเป๊ะ · มีประวัติแก้บ่อย) |
| `scripts/check-sw-version.mjs` | ใหม่ (optional) | ศูนย์ |
- โหมด canary: `hk-pwa.js` register เฉพาะเมื่อ `pwa-flag="canary"` **และ** `localStorage['hk_pwa_beta']==='1'` (ทีมภายในเปิดเอง) → ทดลองเครื่องจริง iOS+Android 3-7 วัน · user จริง = ไม่มีอะไรเปลี่ยนเลย

**Release B — "เปิดจริง" (เช่น r377+)** หลัง canary ผ่านครบ §5
| ไฟล์ | สถานะ |
|---|---|
| `public/pwa-flag.json` | แก้ค่าเป็น `"on"` |
| `public/js/hk-pwa.js` | เปิด install banner + update banner เต็มรูป (โค้ดมีแล้วจาก A แค่ปลดเงื่อนไข canary) · bump `HK_SW_VERSION` |
- ไม่แตะไฟล์อื่นเพิ่มเลย → rollback = สลับ flag กลับ `off`

### ⛔ สิ่งที่ห้ามทำเด็ดขาด (สรุปรวม)
1. **ห้าม SW intercept/cache `/api/*`** ทุกกรณี — โดยเฉพาะ sifu/fusion streaming + jobs polling + maps-script
2. **ห้าม cache HTML/navigation** — network-only + offline fallback เท่านั้น (เว็บ deploy วันละหลายรอบ)
3. **ห้ามแก้ HTML หน้า LOCKED** (chart/today/calendar/datepick/master/landing ฯลฯ) — ทุกอย่าง inject ผ่าน JS
4. **ห้ามแตะ** `src/proxy.ts` · engine Layer 0-2 · `src/app/api/**` · CSP nginx — งานนี้ไม่จำเป็นต้องแตะเลยสักไฟล์
5. **ห้าม SW cache** `/js/hk-user-menu.js` + `/css/mobile-safe.css` (no-store kill-switch เดิม)
6. **ห้ามใช้ workbox/CDN ภายนอก** — CSP ไม่อนุญาต + คุมไม่ได้ · เขียน vanilla เอง
7. **ห้าม deploy โดย HK_SW_VERSION ไม่ตรง release** ที่แตะไฟล์ PWA (สคริปต์เตือน + checklist)
8. **ห้ามข้ามกฎ Git Discipline** — commit ก่อน deploy · ห้ามแก้ตรงใน release dir (รวม pwa-flag ฉุกเฉินต้อง backport ใน 24 ชม.)
9. **ห้ามโชว์ update banner กลางคำทำนาย** — รอ stream/job จบก่อน

---

## 7. คำถามรอเจ้านายเคาะ (ก่อนเริ่ม implement)

1. **start_url**: ผมเสนอ `/today?src=pwa` — เหตุผล: เป็นหน้า "ดวงวันนี้" ที่ใช้ทุกวัน เหมาะกับพฤติกรรมเปิดแอป · ตัวเลือกอื่น `/` (landing · ปลอดภัยสุดแต่คนที่ login แล้วต้องกดต่อ 1 ที) หรือ `/master-fusion` (ของขายหลัก แต่หนัก ไม่เหมาะเปิดบ่อย)
2. **ชื่อแอป**: เสนอ name = "Hourkey — ดวง 5 ศาสตร์" · short_name = "Hourkey" (ใต้ไอคอนจอมือถือได้ ~12 ตัวอักษร)
3. **ไอคอน**: เสนอใช้ 鑰 ทอง `#b49052` บนพื้นเข้ม `#0f0e0c` จาก favicon เดิม (แบรนด์ตรงกันทั้งเว็บ) — หรือเจ้านายอยากได้โลโก้ใหม่ให้บอก
4. **จังหวะเปิด**: เสนอ canary ภายใน 3-7 วัน (Release A) ก่อนเปิด user จริง (Release B) — โอเคไหม

---

*เอกสารนี้เป็น PLAN-ONLY · ยังไม่มีการแก้โค้ด/ไฟล์ production ใด ๆ · สำรวจ read-only 3 ก.ค. 2026 บน r375-batch*
