# รายงานวิจัย #6b: Spec หน้าแยก /tianxing + Handoff จาก datepick
> เตรียม spec · อ้าง file:line จริงจาก repo

## Route
- path `/tianxing` → `public/tianxing.html` · แก้ next.config.ts **additive 3 จุด**: rewrites(:99-134) เพิ่ม `{source:"/tianxing",destination:"/tianxing.html"}` · headers htmlSurfaces(:33-95) เพิ่ม no-store · (alias /starhour ได้)
- แม่แบบ style = **qimen.html** (มี 2 ธีม data-theme :2,17-48 · ปุ่ม .theme-switch :69-71) **ไม่ใช่ datepick** (datepick dark เดี่ยว)

## Handoff datepick→/tianxing
- การ์ดผล object `t` (mapping datepick.html:1828-1870 · render :2035-2074) มี: datetime/date/time, pillars.hour, qimen(palace/door/star/deity/ju), hex, activity, score, huangdao/richong/donggong
- 🔴 **ไม่มี lat/lng** (auspicious fix Bangkok :396) → ดาวจริง(命宮/12宮)ต้องใช้พิกัด → **เพิ่ม input "สถานที่จัดงาน"** บนหน้า tianxing (default กรุงเทพ 13.7563/100.5018)
- วิธีส่ง: **sessionStorage `hk_tianxing_handoff` (full object) + URL `?dt=<UTC>&lat=&lng=&act=`** (deep-link/refresh-safe)
- ปุ่มต่อการ์ด (per-card ใกล้ปุ่มตำรา :2072) สไตล์ gold pill: `🌌 วิเคราะห์ลึก · ดาวจริง 七政四餘`

## 🔴🔴 LANDMINE: timezone double-convert
datepick เก็บ `datetime` เป็น **localISO บวก+7 แล้ว toISOString()** (:1835-1836) = "UTC string ที่หน้าปัดเป็นเวลาไทย" · ถ้าส่งตรงให้ Swiss Eph → **เพี้ยน 7 ชม. ดาวผิดหมด** → handoff ต้องเก็บ/ส่ง **instant UTC ดิบ** (`c.datetime.start` ก่อนแปลง :1829) · API contract รับ UTC ชัด

## Layout (ยึด qimen 2ธีม/3ภาษา)
A.Header ฤกษ์(จาก handoff)+chips context+input สถานที่ · B.ผังดาวจริง(det·ฟรี) วงราศี12+28宿+7政4餘+命宮+12宮+廟旺落陷 · C.วิเคราะห์ลึก(rule·恩用仇難/格局/verdict·มี source_ref) · D.ปุ่มซินแสสังเคราะห์(stream·หักยาม) · E.disclaimer
- i18n reuse window.HK_I18N + namespace `tx.*` · จีนเป็น `.tc` รอง(ไทยนำ) · theme/lang ใน hk-user-menu.js

## Credit/Login/API
- **ผังดาว det = ฟรี** · **ซินแสสังเคราะห์ = หักยาม** reserveHour("tianxing_sifu")+drainHoursByChars(÷30) (แม่แบบ qimen/sifu:1521, spend-hours.ts:17-54)
- login: ไม่ใส่ /tianxing ใน PROTECTED (proxy.ts:65-73) ให้ดูผังฟรี · กั้นที่ API ตอนกดซินแส (getSession+401 เหมือน qimen/sifu:1501)
- **API ใหม่แยก `/api/tianxing/{chart,analyze,sifu}` · ห้ามแตะ /api/auspicious (LOCKED)**
  - chart: {dtUTC,lat,lng}→ผังดาว det · analyze: +rule(恩用仇難/格局)จาก ref_tianxing_* · sifu: AI stream (claude-max-cli) สรุปภาษาทีหลัง(กฎ9)

## 🚩 ระวัง (ไม่กระทบ datepick/auspicious เดิม)
1. LOCKED: /api/auspicious + luck-engine + combineScores + datepick เดิม · เพิ่มปุ่ม handoff = เพิ่ม element+sessionStorage เท่านั้น ห้ามแก้ logic คะแนน · **ขอ gate อนุมัติ**(แตะไฟล์ locked แม้ additive)
2. tz UTC ดิบ (ข้อบน) · 3. lat/lng input สถานที่งาน(ไม่ใช่birthLng) · 4. engine ยังไม่พร้อม→**degrade gracefully** โชว์ผัง det + "ชั้นตัดสินกำลังตรวจโดยซินแส" ห้าม fake verdict · 5. disk 95% เคลียร์ก่อน · 6. next.config additive+bump ?v= · 7. reuse ไม่ rewrite(no_rewrite) · 8. **5 ลายเซน+พ่อ** ก่อน public

ไฟล์อ้างอิง: datepick.html(:1828-1870,2035-2074,2072,1803,2531+) · qimen.html(:2,17-48,69-71) · next.config.ts(:99-134,33-95) · proxy.ts(:65-73) · spend-hours.ts(:17-54) · qimen/sifu/route.ts(:1501,1521,1484) · auspicious/route.ts LOCKED(:389,396)
