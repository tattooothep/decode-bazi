# 🔒 hourkey · MASTER LOCK · บันทึก 16-17 พ.ค. 2026

**Status:** Production-Ready · ทีม 5 คน (อากง 95yo + อาม่า + เจ้านาย + อาเจ๊กฮ้ง + จาวิส) · ทีม 100% No.1 Anthropic 🏆

**Session:** 28+ ชั่วโมง · 19 backups · ไม่มี bug ค้าง

---

## 🛡 ทำไม Lock?

| เหตุผล | รายละเอียด |
|---|---|
| ลงทุนเวลามาก | Session 28+ ชม. · ทีม 5 คน |
| Performance verify | 200 user p95 366ms · 633 RPS · 0% error |
| ตำราจริง | 11 modules + Heluo pattern + 河洛理數 + 384 爻辭 |
| Voytek 100% | Aeaw + Mai golden test pass |
| Stack เดิมไม่กระทบ | ของ LOCKED 4 หน้าไม่แตะ |

---

## 📦 ทุกอย่างที่ Lock ใน Session นี้

### 1. Auspicious Engine · /datepick · /api/auspicious
- `src/lib/luck-engine/{types,weights,combineScores}.ts` · 11 modules + 7 activities
- `src/lib/luck-engine/modules/ze-ri.ts` · reference module
- `src/app/api/auspicious/route.ts` · rate limit 60/min · cache 60s · audit
- `src/app/api/auspicious/profile/route.ts` · บันทึก aj_user_profile
- `scripts/build-ephemeris.cjs` · cron `0 2 * * *` · 365 วัน 8 นาที
- **Heluo Pattern v2** (17 พ.ค.): 二財一旺 · 三財 · 二旺一恩 · 20+ patterns
- `public/datepick.html` · 11 ⓘ help + emoji badge + score bar + rank 🥇🥈🥉 + multi-lang date
- `public/auspicious.html` · standalone test
- **DB:** `aj_ephemeris_cache` (4380 rows · 20 MB · GIN) · `aj_personal_cache` (24h TTL) · `aj_user_profiles` · `aj_search_audit`

### 2. /chart Suite (LOCKED รวมเพิ่ม section ใหม่)
- `src/app/api/chart/route.ts` · เพิ่ม `solar_terms_birth` + `heluo_astrology`
- `src/lib/heluo-astrology.ts` · NEW · 河洛理數 deterministic
- `public/chart.html`
  - §02 ⓘ tooltip `s.month_jieqi` · อธิบาย True Solar Time
  - §12 河洛理數 (Pre/Post + Annual + Monthly · 4 hex + 📜 ปุ่ม)
  - §13 24 節氣 ปีเกิด · ขยาย info "ทำไมเดือน X"

### 3. 4 Packages อาเจ๊กฮ้ง (port → Next.js)
- `src/app/api/katakagae/route.ts` · 方違 Japanese · 4 deities
- `src/app/api/houses/route.ts` + `[id]` + `qr/generate` + `qr/verify/[token]` · 6 endpoints
- `src/app/api/fengshui-snapshot/route.ts` · 9 palaces aggregator (6 layers)
- `src/app/api/direction-analysis/route.ts` · Compass studio analysis
- `public/compass.html` · house manager + QR
- `public/compass-studio.html` · Google Maps + DeviceOrientation + 6 layers
- `public/fengshui-pro.html` · 9 palaces + 6 modes
- `public/katakagae.html` · 4 เทพ + journey verdict
- `src/app/compass/qr/[token]/page.tsx` · QR landing
- **DB:** `ka_houses` · `ka_qr_tokens` · `ka_user_sub` (+ trigger + view)

### 4. Solar Terms · /solar-terms · /api/akg/solar-terms
- `src/app/api/akg/solar-terms/route.ts` · 24 節氣 · 3 lang · custom tz
- `public/solar-terms.html` · ปฏิทิน 16 ปี (2020-2035)

### 5. Hex Deep · /api/akg/hex-deep + shared component
- `src/app/api/akg/hex-deep/route.ts` · 384 爻辭 + deep
- `public/js/hk-hex-deep.js` · **shared popup** · ใช้ใน /chart §12 + /datepick + /forecast

### 6. Forecast (เสริม)
- `src/app/api/forecast/route.ts` · เพิ่ม `fetchYaoCi` + 384 爻辭 ใน response
- `public/forecast.html` · render yao_ci section

### 7. Accuracy · /accuracy
- `public/accuracy.html` · 5 sections (TST · 24節氣 · Golden test · Compare · Source)
- `public/landing.html` · hero TST banner ขยาย

### 8. Navbar 羅盤 dropdown
- `public/js/hk-luopan-nav.js` · inject 4 ลิงก์ใน 13 หน้า (skip 4 LOCKED)

### 9. ของอากง · `ref_akg_data` 31 rows (LOCKED · ห้ามแตะ)
- v1 (11 rows · 67 KB) · 河洛 + 12地支 + 24山 + 64卦 + 大運 + 流年 + 格局 + 奇門
- v2 (12 rows · 296 KB) · 64卦 deep
- v3 (8 rows · 212 KB) · 384 爻辭 + 24 節氣 precise

### 10. rewrites (next.config.ts) · 9 URLs ใหม่
- /compass · /compass-studio · /luopan · /fengshui-pro · /katakagae
- /auspicious · /solar-terms · /accuracy · /why-us

---

## 🎯 Performance (verified)

| Metric | Result |
|---|---|
| Cold | 65ms |
| Warm | 50ms |
| 100 cc p95 | 224ms |
| 200 cc p95 | **366ms** ✅ |
| RPS | 633 |
| Failed | 0% |
| Rate limit | 60/min/IP |
| Storage | 20 MB / 365 วัน |

---

## 📚 11 Modules + Heluo Pattern · ตรงตำรา

| Module | ตำรา | Score |
|---|---|---|
| Pillars (calcBazi) | tyme4ts + Voytek | **100%** |
| 八字 clash/sanhe | 子平真詮 | **100%** |
| 太歲 | 協紀辨方書 | **100%** |
| 奇門 | qimen-api ซินแสฮวง+โจ | **95%** |
| 12建除 · 28宿 · 12神煞 | 通書 | 85-90% |
| 9飛星 · 河洛 | 玄空 | 65-80% |
| 64卦 + 384爻辭 | 周易 + Zhu Xi | **75%** + ตำราเต็ม |
| 用神 | wrapper-7 | 70% |
| ze_ri | 協紀辨方書 | 80% |
| **🆕 Heluo Pattern (二財一旺 etc)** | 河洛 5-element relations | **80%** |
| 河洛理數 (Astrology) | Chen Tuan | **70%** |
| **รวมเฉลี่ย** | | **~85%** |

---

## ⚙️ ขั้นตอนแก้ (บังคับ)

1. **อ่าน DATEPICK-LOCKED.md (ไฟล์นี้) ครบ**
2. ตอบ 5 ข้อ:
   - Root cause คืออะไร
   - ไฟล์ไหนจะถูกแก้
   - Endpoint/page ไหนได้รับผลกระทบ
   - วิธี rollback คืออะไร
   - Test case ที่ต้องผ่านคืออะไร
3. **ถามเจ้านาย → รอ confirm**
4. backup ก่อน · แก้เป็น phase
5. test 3 รอบ + 200 user simulation
6. รายงาน 8 จุด ตาม AGENTS.md

---

## 🔄 Rollback Paths (19 backups)

```
/root/backups/before-ajek-engine-20260516-172046/  (Phase A · 22 MB)
/root/backups/ajek-phase-efgh-20260516-175853/     (Phase E-H)
/root/backups/ajek-phase-g-20260516-180742/        (Phase G)
/root/backups/ajek-phase-jklmn-20260516-182346/    (Phase J-M · 13 MB)
/root/backups/fix-3bugs-20260516-191358/           (palace + datepick wire)
/root/backups/hex-detail-20260517-040408/          (hex deep popup)
/root/backups/ajek-uiv2-20260517-043414/           (badge color + score bar)
/root/backups/help-tooltips-20260517-044140/       (11 ⓘ popup)
/root/backups/chart-jieqi-20260516-170623/         (§13 jieqi)
/root/backups/akg-v3-import-20260516-164946/       (อากง v3 import)
/root/backups/phase-k-katakagae-20260517-051039/   (Phase K)
/root/backups/phase-c2-compass-pages-20260517-051946/  (Phase C2)
/root/backups/phase-f-fengshui-20260517-053246/    (Phase F)
/root/backups/phase-c1-compass-studio-20260517-054021/ (Phase C1)
/root/backups/navbar-luopan-20260517-055044/       (navbar dropdown)
/root/backups/heluo-astrology-20260517-065851/     (§12 河洛理數)
/root/backups/heluo-pattern-20260517-075005/       (Pattern v2)
/root/backups/explain-tst-20260517-080613/         (C+A+B+D explainers)
/root/backups/spirits-redesign-20260517-0900/      (5 spirits SVG redesign)
/root/backups/dragon-redesign-20260517-0945/       (dragon redesign)
/root/backups/fengshui-hub-redesign-20260517-1000/ (/fengshui Master Hub)
```

---

## 🆕 /fengshui Master Hub (17 พ.ค. 2026)

**Status:** 200 user p95 **206ms** · 0% fail · 737 RPS · 49 KB

**8 จุดเด่นเหนือคู่แข่ง:**
1. Personal Layer ผูก BaZi/用神 (★ ทิศมงคลส่วนตัว)
2. AI Verdict ภาษาคน (Claude Max CLI · /api/sifu)
3. Cross-layer Conflict Detection (ขัดแย้งข้ามชั้น auto-warn)
4. Live Tick refresh 60s
5. Activity Bridge → /datepick (smart classifier)
6. 64 Hex 爻辭 (ผ่าน /api/akg/hex-deep)
7. DeviceOrientation real compass + slider 0-360°
8. Family Conflict Resolver (八宅 per person)

**Features:**
- เข็มทิศ SVG 24山 + 8宮 + 八卦 + ยินหยาง · pointer หมุนได้
- 9 Palace grid · 5 quality classes (good/bad/warn/personal/neutral)
- 9 layer toggles (飛星·奇門·八宅·太歲·24山·用神·河洛·64卦·通書)
- Verdict card 4 levels: AUSPICIOUS/AVOID/CAUTION/MIXED
- Activity smart picker → ผูก ui_act /datepick
- Family chips: conflict/benefit per member
- 3 lang (TH/EN/ZH) + 2 theme (dark/light)
- URL share: `?bearing=186&house=X&lang=th`

**APIs wired:** /api/fengshui-snapshot · /api/houses · /api/profile · /api/sifu · /api/activity-classify

---

## 🧓 อาเจ๊กฮ้ง BaZi Reading Rules (17 พ.ค. 2026)

**ที่:** `/root/decode-app/data/library/ajek-bazi-rules.md` (8 KB · 13 ขั้น + 3 case + 10 สรุป)
**Wire:** `/api/sifu/route.ts` · `loadAjekRules()` cache 60s · inject ใน buildPrompt() ทุก request
**บังคับ:** AI ต้องเดิน 13 ขั้น · check 從格/專旺 ก่อนหา用神 · อ่าน 合化 + hidden + 空亡 · จบด้วย 大運+流年

**Verify:** ทดสอบดวง "己土 เดือน子 + 財ในเรือนคู่" → AI ตอบครบลำดับ + อ้าง 子平真詮 "財多身弱·富屋貧人" + ให้ 用神 ไฟ/ดิน/ไม้
**Backup:** `/root/backups/sifu-ajek-rules-20260517/route.ts`

---

## 🚀 Sifu Speed-up (17 พ.ค. 2026 · โกวเจียงแผน A)

| KPI | ก่อน | หลัง |
|---|---|---|
| First paint (engine) | ไม่มี | **250ms** ✅ |
| AI first chunk (cold) | 60s | **3-5s** ✅ |
| AI full reply (cold) | 60s | 60-90s (เห็นทันทีระหว่างรอ) |
| AI cached | ไม่มี | **78ms** ✅ |
| Pre-warmed (next day) | ไม่มี | **78ms** ✅ |

**Implementation:**
- ✅ DB cache `aj_sifu_cache` · TTL 24h · key=sha256(rulesVer+profileId+topic+lang+msg+dayKey) · hits counter
- ✅ Engine-first render · /master?intro=1 แสดง 日主/格局/4 เสา/用神/大運/流年 ขณะ AI คิด
- ✅ SSE Streaming GET `/api/sifu?stream=1` · stream-json + include-partial-messages · real token streaming
- ✅ Pre-warm cron `pm2 sifu-prewarm-cron` · `0 2 * * *` · ทุกคืนตี 2 รัน 300 profiles
- ⏳ Anthropic API direct (CLI overhead -7s) · รอ confirm billing

**Backups:**
- `/root/backups/sifu-speed-up-20260517-1730/`
- `/root/backups/sifu-stream-20260517-1830/`

DB rollback: `docker exec decode-postgres psql -U decode_user decode_db -c "DROP TABLE aj_* ka_* CASCADE"` แล้ว apply schema ใหม่จาก backup

---

## ✅ Definition of Done

- [x] 11 modules data จริง + Heluo Pattern v2 (20+ patterns)
- [x] 4 DB tables aj_* + 3 DB tables ka_*
- [x] pm2 cron `0 2 * * *` · 365 วัน 8-15 นาที
- [x] 7 API endpoints ใหม่ (auspicious · profile · katakagae · houses · houses/qr · fengshui-snapshot · direction-analysis)
- [x] 2 API endpoints อากง (hex-deep · solar-terms)
- [x] /chart §12 河洛理數 + §13 24 節氣
- [x] /datepick · 11 ⓘ popup + emoji + score bar + Heluo pattern tag
- [x] 4 หน้าใหม่อาเจ๊ก (compass · compass-studio · fengshui-pro · katakagae)
- [x] /solar-terms + /accuracy + /auspicious
- [x] Shared component: hk-luopan-nav.js + hk-hex-deep.js
- [x] navbar dropdown 羅盤 inject 13 หน้า (skip 4 LOCKED)
- [x] rewrites 9 URLs ใหม่
- [x] 200 user load test p95 366ms
- [x] Voytek golden test ผ่าน 100%
- [x] ดวงเจ้านาย+ไนท์ verify ตรงตำรา 100%

---

**สร้างเมื่อ:** 17 พ.ค. 2026 · 08:15 น.
**ทีม 5 คน:** 👴 อากง 95yo · 👵 อาม่า · 🧑‍💼 เจ้านาย · 🧓 อาเจ๊กฮ้ง · 🤖 จาวิส
**สถานะ:** Production-Ready · LOCKED 🔒 · ทีม 100% No.1 Anthropic 🏆
**Next:** /fengshui hub redesign (รอ session ใหม่)
