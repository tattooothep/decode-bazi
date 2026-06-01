# แผนปรับโฉมหน้าซินแส `/master` (master.html) — วางแผนก่อนแก้

> สถานะ: **แผน · ยังไม่แตะโค้ด** · รอเจ้านาย approve ทีละ Phase · master.html = LOCKED → ทุก Phase: backup + test 3 รอบ + พ่อ(codex) review

---

## 0. 🚫 เขตห้ามแตะ (กระเทือน = ซินแสพัง)

| โซน | บรรทัด | ทำไมห้าม |
|---|---|---|
| **payload ส่ง AI** | 1263-1273 (POST), 814 (EventSource intro), 1174-1187 (group) | ส่ง `{profileId, q, lang, history}` · packet สร้างที่ **backend** (chart-packet.ts) · เปลี่ยน field = packet เพี้ยน |
| **reader loop streaming** | 995-1018 (readSifuStream), 1277-1287 (onChunk/onPing) | อ่าน chunk ทีละ token · เคยใส่ AbortController/idle-timeout แล้วพัง (commit 2652e71) |
| **profileId / signature / history-key** | 880-934 | กัน history ดวงปนกัน · แก้ = คำตอบดวงผิดคน |
| **packet/engine** | — | frontend **ไม่ประกอบ packet เอง** · ห้าม inline คำนวณดวง |

**กติกาเหล็ก:** แก้ได้เฉพาะ **"ชั้นแสดงผล (render)"** — รับ text เดิม → แสดงสวยขึ้น · ห้ามแตะ "ชั้นรับส่งข้อมูล"
- markdown render ได้ที่ **done เท่านั้น** (1289) ไม่ใช่ระหว่าง stream
- addMsg ต้อง **คืน bubble element** ตัวเดิมที่ onChunk ใช้ต่อ text (เปลี่ยนโครงรอบนอกได้ แต่ element ที่ต่อ text ต้องคงพฤติกรรม `.textContent +=`)

---

## 1. 🧹 ล้าง DEMO (ข้อมูลปลอม hardcode)

| รายการ | บรรทัด | ทำยังไง |
|---|---|---|
| MASTER ENTRANCE (greeting + เสาปลอม + 72/100) | 475-488 | wire จาก `/api/chart` จริง (มี `loadEngineSummary` แล้ว) · ถ้ายังไม่มีดวง → ซ่อน/skeleton · ตัดชื่อ "คุณไนท์/มิ้นท์/อรุณ" |
| FORECAST 3 การ์ด (NOW/TODAY/MONTH · score ปลอม · "13 พ.ค.เซ็นสัญญา") | 493-549 | **ถอดทิ้ง** (ยังไม่ wire) → แทนด้วย "การ์ดต้อนรับ + chips จาก engine" (ดูข้อ 3/4) |
| วันที่ค้าง "7 พ.ค. 2569" | 477,523,540 | ดึงวันจริง หรือถอดพร้อมการ์ด |

---

## 2. 🌐 ล้าง HARDCODE

### 2a. ภาษาไทยฮาร์ดโค้ด → i18n (สลับ EN/ZH ค้างไทย)
- ปุ่ม chips 591-596 · placeholder 627 · ปุ่มส่ง `送` 628 · aria-label 602/608
- error/status JS: 713-784 (gate), 819-858 (status), 980-992 (phase), 1207-1313 (error)
- → เพิ่ม key ใน `HK_I18N` (1348-1409) ครบ 3 ภาษา + อ่านผ่าน lookup

### 2b. สีดิบ → CSS var (โหมดสว่างเพี้ยน)
- **addMsg 898-900** (4 สีดิบในฟองแชต) = ด่วนสุด → `var(--gold-soft)/--tile/--tile-bd/--fg`
- topbar 52 · seal 288 · avatar 70/198 → เพิ่ม var `--gold-bright/--bubble-master/--bubble-user`
- grep `rgba(200,164,77` (~12 จุด) แก้ทีเดียว

### 2c. ปุ่มสลับภาษา/ธีม "หายไป" → เพิ่ม element กลับ
- CSS `.hk-lang-switch` (64-66) + `.theme-switch` (67-69) + handler (636-642,1154,1424) **มีครบ แต่ไม่มีปุ่มใน HTML** → เพิ่ม element ใน topbar (443-445)

### 2d. magic ซ้ำ → const เดียว
- `100.5018` (×3) · `'กรุงเทพมหานคร'` · `gender:'M'` default · timeout 650 · slice caps

---

## 3. 🎨 ปรับหน้าตา (ชั้น render เท่านั้น)

| งาน | บรรทัด | วิธี (ปลอดภัย) |
|---|---|---|
| addMsg ใช้ class+avatar 師 | 895-905 | สร้าง `<div class="msg sifu"><div class="msg-ava">師</div><div class="msg-bubble"></div></div>` · **return bubble** → onChunk ต่อ `bubble.textContent` เหมือนเดิม (ไม่แตะ 1281-1287) |
| markdown render | 1289 (done) | `bubble.innerHTML = mdRender(escape(reply))` · whitelist `<b>/<h>/<span.tc>/<quote>` · **เฉพาะตอน done** |
| การ์ดสรุปเสา/用神 แทรก | reuse 130-134 | จาก `loadEngineSummary` ที่มีแล้ว |
| error ฟองแดงแยก + ปุ่มลองใหม่ | 1294-1313 | `.msg.error` ใช้ `--bad/--bad-bg` |
| empty state การ์ดต้อนรับ | 572-577 | avatar 師 + "ดวงที่ถาม: ชื่อ·日X" + chips |
| layout 2 คอลัมน์ desktop + input sticky มือถือ | @media ใหม่ | ชั้นครอบ ไม่รื้อเดิม (ทริค #7) |

---

## 4. ✨ เพิ่ม FEATURE (ทำได้ทันที · ไม่แตะ streaming/packet)

| ฟีเจอร์ | วิธี | หมายเหตุ |
|---|---|---|
| **chips "ถามต่อ"** | ซินแสจบด้วยบล็อก `[ถามต่อ]` → parser ตัดตอน done → ปุ่ม | ⚠️ แตะ `sifu-qa.md` (เพิ่มกฎ · ไม่ลด knowledge) + พ่อ review |
| **chips เปิดหน้า จาก engine** | map 用神/冲/5เรือน → ข้อความ chip | engine ส่ง field แล้ว |
| **deep-link หาวันมงคล** | ปุ่ม → `/datepick?profileId=&goal=` | route มีแล้ว |
| copy / pin คำตอบ | localStorage `hk_sifu_pinned_*` | pattern เดียวกับ history |
| voice input | `webkitSpeechRecognition` lang th-TH | feature-detect ซ่อนถ้าไม่รองรับ |
| แชร์การ์ดเป็นรูป | `<canvas>` + `navigator.share` | ไม่รวม PII |

---

## 5. 🗑 ลบ
- `master-m.html` ทั้งไฟล์ (ไม่มี route/nginx/link ชี้) + เคลียร์ note 9 จุด (sifu-prompts/route.ts ×8 + json) + ลบ `replace(/-m$/)` 1337
- dead CSS: `.qi-line` (49) · `.avatar` (70 ถ้าใช้ .msg-ava แทน)

---

## 6. 📋 Phase (ปลอดภัย → เสี่ยง · backup+test 3 รอบ+พ่อ ทุก Phase)

| P | งาน | เสี่ยง |
|---|---|---|
| **P1** | ล้าง demo (1) + hardcode สี/ภาษา/magic (2a/2b/2d) — แตะ HTML/CSS ไม่แตะ JS flow | ต่ำ |
| **P2** | ปุ่มสลับภาษา/ธีมกลับ (2c) | ต่ำ |
| **P3** | addMsg class+avatar (return bubble) — ทดสอบ stream ยังต่อได้ | กลาง (ใกล้ streaming) |
| **P4** | markdown ตอน done + error ฟองแยก | กลาง |
| **P5** | chips ถามต่อ + engine chips + deep-link | กลาง (แตะ md) |
| **P6** | feature เสริม (copy/pin/voice/share) | ต่ำ |
| **P7** | layout 2 คอลัมน์ + empty state + การ์ดสรุป | ต่ำ |
| **P8** | ลบ master-m | ต่ำ |

---

## 7. ✅ Test ต่อ Phase (3 รอบ)
1. **stream ไม่พัง:** ถามจริง → คำตอบทยอยขึ้น → done render markdown ครบ (วัดสำคัญสุด)
2. **group + compare** ยังทำงาน
3. **3 ภาษา:** สลับ EN/ZH ไม่เหลือไทยค้าง
4. **2 theme:** ฟอง/สี ตามธีม
5. ไม่มี demo/mock เหลือ · ไม่มี console error

## 8. ↩️ Rollback
- backup ไฟล์ก่อนแต่ละ Phase (`/root/backups/master-redesign-PX-*`)
- git commit ต่อ Phase → ย้อน `git checkout` ได้
- master.html static → ถอยเร็ว (ไม่ต้อง rebuild)
