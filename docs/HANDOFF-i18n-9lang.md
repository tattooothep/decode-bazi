# HANDOFF: งานเว็บ 9 ภาษา hourkey.io — ให้ AI ตัวไหนก็มาทำต่อได้
อัปเดต: 6 ก.ค. 2569 ~18:45 · เขียนโดยจาวิส (session 075fcd4e) · เจ้านายสั่งพักเพราะ token

## เป้าหมาย (goal ที่ยังเปิดอยู่ — เงื่อนไขผ่านข้อเดียว)
รัน `node scripts/i18n-final-gate.mjs` กับ **production** แล้วบรรทัดสุดท้ายต้องเป็น `ALL PASS · FAIL 0`
แนบผลดิบทั้งก้อนในรายงาน · **ห้ามแก้ gate ให้อ่อนลง** (เข้มขึ้นได้) · gate = เบราว์เซอร์จริง+ล็อกอินจริง
9 ภาษา (th en zh cn vi ja ko ru es) × 6 หน้า (datepick today chart qimen luopan master-fusion)
ต้องมีผลเครื่องคำนวณจริงบนจอแล้วอักษรไทย=0 (ยกเว้นโหมด th) + AI ซินแส 5 ภาษาใหม่ต้องตอบภาษานั้นจริง

## กติกาเหล็กจากเจ้านาย
1. **ห้ามแตะ logic การคำนวณเด็ดขาด** — งานนี้คือชั้นแสดงผล/คำแปล/route additive เท่านั้น
2. ภาษาใหม่ (vi ja ko ru es) คำไหนไม่มีแปล → ตก **อังกฤษ** ห้ามตกไทย
3. **บรรทัดแรกของทุกรายงาน = สิ่งที่ยังไม่ผ่าน** (ห้ามพาดหัวชัยชนะ)
4. Sonnet/Haiku เขียนโค้ด → ตัวหลักตรวจทุกบรรทัดก่อน commit · backup ไป /root/backups/ ก่อนแก้
5. นับ "เสร็จ" เฉพาะหลัง deploy production แล้ว gate เขียว
6. **ก่อน deploy ต้อง `readlink /root/releases/current`** — เครื่องนี้มีหลาย session deploy แข่งกัน
   (เคยพลาดทับสาย r422-426 ของเจ้านายมาแล้ว 6 ก.ค. 17:10 กู้ด้วย r427-merged-lines)

## สถานะตอนพัก
- **LIVE**: `/root/releases/decode-app-r427-merged-lines` (unit ใช้ symlink `/root/releases/current` · สลับ=flip symlink+restart hourkey-decode.service + @3350-52 · health `curl :3349/api/health`)
- **gate รอบ 1: FAIL 50/59** — log เต็ม: scratchpad session เดิม `gate-run1.log` · สรุป: th ผ่าน 6/6 · en/zh/cn ผ่านแค่ luopan · ภาษาใหม่ 0 · AI ตอบไทยทั้ง 5
- **commit แล้วยังไม่ deploy**: `b7c087b` (luopan ภาษาใหม่ตก en — เทสแล้ว 1534→135) · `ffe85b0` (gate script)
- **repo**: /home/jarvis/decode-app (= /root/decode-app inode เดียวกัน) · branch main
- **บัญชีเทส gate**: `.gate-account.json` (gitignored · สคริปต์ self-provision ได้ถ้าหาย)

## งานค้าง 4 ก้อน (working tree มีงานครึ่งทางอยู่แล้ว — `git status` ก่อน อย่าทับ)
### ก. เปลือกหน้า/เมนู (ทีมเดิมค้างที่ qimen.html)
- เมนูล่าง+drawer จาก `public/js/hk-user-menu.js` โผล่ไทยทุกภาษา ("หน้าวันนี้/ดวงของฉัน/หนังสือของฉัน") → entry มี {th,en,zh} แล้ว แต่ตัวเลือกภาษาต้อง fallback en สำหรับภาษาใหม่
- master-fusion เหลือป้าย "ไทย TH" 3 จุด
### ข. datepick ผลค้นหา en/zh (ค้าง: หา consumer ของ data.layers/layerReport ที่พิมพ์ desc/mode ลง HTML)
- en เหลือไทย 10,387 / zh 13,694 ในการ์ดผลค้นหา+ตงกง+คำอธิบาย
### ค. เนื้อหาเครื่องคำนวณ today/chart/qimen (en เหลือ 1,950/1,204/6,306)
- 🔑 เจอแล้ว: `qmContentLang` ใน qimen.html อ่าน html.lang ก่อน hk_locale → หน้าไม่สลับ ต้องพลิกลำดับ
- today: `src/app/api/today/actions/route.ts`+`directions/route.ts` แก้ค้างอยู่ใน working tree
- chart: แผนที่จุดไทยครบ 7 ข้อ (ดูใน memory `project_i18n_8lang_roadmap.md` / transcript task a217199df886181a6) — ข้อเด็ด: `advice_en`/`partner_traits_en` มีใน API แล้วแต่หน้า chart.html อ่านแต่ `_th` (บรรทัด ~4608/4610/4620)
### ง. AI ซินแส (ทีมเดิมแก้ prompt+route แล้ว กำลังรีเทส es/ru ตอนโดนหยุด)
- `src/app/api/sifu/route.ts:2327,3008` allowlist lang เดิมรับแค่ th/en/zh
- แก้แล้วใน working tree: `data/library/prompts/sifu-lang.md`, `sifu-intro-lang.md`
- 🔴 บั๊กแถม: CLI noise "The full chart context was offloaded…" หลุดขึ้นต้นคำตอบ user ทุกภาษา — ต้องกรองใน route (กรองเฉพาะ pattern ชัดเจน)

## ทางลัดที่เจ้านายยังไม่เคาะ (ถามก่อนทำ)
"ด่านแปลเดียว+cache": ประโยคที่ engine แต่ง (คำอ่านผัง/เหตุผล) ให้ผ่าน AI แปล ณ จุดส่งออก + บังคับศัพท์จาก `data/i18n/science-terms.json` + cache ประโยคซ้ำ — แทนการไล่เติม _en/_zh ทีละ field

## เช็คก่อนเริ่มเสมอ
```
cd /home/jarvis/decode-app && git log --oneline -5 && git status --short
readlink /root/releases/current
node --version && ls scratchpad ของ session ที่รัน playwright (chromium ติดตั้งที่ scratchpad เดิม)
```
ห้าม commit ไฟล์วงอื่น: next.config.ts · src/app/api/payment/** · landing*.html · public/assets/
เทส JS: เขียน temp file แล้ว node --check (ห้าม /dev/stdin) · ld+json ใช้ JSON.parse
ห้าม pkill -f (เคยฆ่าตัวเอง 3 รอบ) — kill ด้วย PID จาก ss -ltnp
