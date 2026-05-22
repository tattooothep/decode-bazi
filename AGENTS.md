<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# 🧓 30 ทริคแก้บั๊ก · อาเจ็กฮ้ง (อ่านก่อนเริ่ม session ทุกครั้ง)

บันทึก 17 พ.ค. 2026 · เจ้านายฝากให้อ่านก่อนแก้บั๊กทุกครั้ง

1. **อย่าแก้จากไฟล์ที่คิดว่าใช่ ให้พิสูจน์ว่าไฟล์นั้นถูกใช้จริง** — ใส่รอยเล็กๆ ก่อน · "อย่าแต่งห้องที่ไม่มีใครอยู่"
2. **ล้อมกรอบบั๊กให้แคบที่สุด** — พังทุกคน/user เดียว · มือถือ/desktop · refresh/login/data ใหม่
3. **ปิดผู้ต้องสงสัยทีละตัว** — localStorage → sessionStorage → cookie → API → DB → view-as → URL
4. **ดู Network ก่อนดู Code** — เว็บทำอะไรจริง ไม่ใช่ที่เราคิดว่าโค้ดควรทำ
5. **ข้อมูลแวบแล้วหาย = ข้อมูลเก่าถูก render ก่อน** — ใช้ `loading → verified → render` ห้าม `old → fetch → replace` สำหรับข้อมูลส่วนตัว
6. **อย่าให้ fallback ฉลาดเกินไป** — ของส่วนตัว (user/profile/payment) ห้าม fallback มั่ว · ห้ามหยิบ "รายการแรก"
7. **แก้ responsive ด้วยชั้นครอบ** — `@media` block ใหม่ · ไม่รื้อ CSS เดิม · rollback ง่าย
8. **แก้ด้วย guard ไม่ใช่แก้ด้วยความหวัง** — guard หลายชั้น: UI + API + DB + storage
9. **ใส่ชื่อเจ้าของข้อมูลไว้ใน payload เสมอ** — `profileId, userId, isSelf, relationshipType, source`
10. **ตั้งชื่อ storage ให้บอกหน้าที่** — `hk_self_profile_id` ดีกว่า `profile` · view-as ใช้ sessionStorage
11. **URL ต้องบอก mode สำคัญ** — `/chart?as=profileId` · `?print=1` · ห้ามเก็บใน memory อย่างเดียว
12. **บั๊กหลัง refresh → ตามลำดับโหลด** — "ก่อน API กลับมา หน้าเอาข้อมูลจากไหนมาแสดง?"
13. **API ซ้ำ → ดูว่าใครชนะ (race condition)** — เช็ค profileId ก่อนเขียน state · ยกเลิก request เก่า · "คนมาช้ากว่าไม่ได้แปลว่าถูกกว่า"
14. **Snapshot ก่อนแก้** — screenshot · API sample · DB row count · routes · localStorage keys
15. **แก้ทีละวง ไม่แก้ทีละจักรวาล** — จบวง → build → test → วงต่อไป
16. **Kill switch / rollback ง่าย** — ไฟล์เดียวเช่น `mobile-safe.css` · ปิดได้ทันที
17. **อย่าให้ backup อยู่ใน public** — `*.bak *.old` ใน public = secret หลุด + SEO มั่ว
18. **เช็คของที่รันจริง ไม่ใช่แค่ใน repo** — pm2 list · docker · nginx · port · domain · build deployed ไหม
19. **มี backend ซ้ำ → ทำแผนที่ก่อนลบ** — ใครเรียกใคร · endpoint ไหนถูกใช้จริง · service ไหนเป็น legacy
20. **บั๊ก UI ดู 3 อย่างก่อน** — width/min-width เกินจอ · grid/flex ไม่ wrap · font/padding ใหญ่เกิน
21. **Responsive ใช้ clamp/min/auto-fit ไม่ใช่เลขตายตัว** — `clamp(26px,8vw,34px)` · `min(100%,380px)` · `repeat(auto-fit,minmax(120px,1fr))`
22. **ห้ามซ่อนปัญหาด้วย `overflow:hidden` มั่วๆ** — หาต้นเหตุที่ล้น (card/table/absolute/nav/grid)
23. **หน้าไหนใช้ nav คนละแบบ → รีบรวม** — script/component เดียว · route ชุดเดียว
24. **ใช้ DB constraint เป็นประกัน** — unique index · ไม่ต้องเชื่อใจทุกส่วนของระบบ
25. **แยก bug fix กับ redesign** — bug fix = รักษา behavior · redesign = เปลี่ยน flow/layout · ห้ามปนกัน
26. **Log แบบมี source** — `{source:'api', profileId, isSelf}` ดีกว่า `console.log(profile)`
27. **ห้ามให้หน้าเลือก profile เองมั่วๆ** — API ส่ง `active_profile` มาเลย · หน้าเว็บแค่รับมาแสดง
28. **แก้กว้าง → read-only audit ก่อน** — scan routes/APIs/storage/duplicate files/unused backend/public backups
29. **ตัด dead code อันตรายก่อน dead code แค่รก** — public backup · route เก่า · API เก่ายังเขียน DB · backend port เปิดทิ้ง
30. **แก้ให้ระบบเดาน้อยลง** — เดาน้อย ถามแหล่งจริงมาก · "เดา = บั๊กในอนาคต"

> 👨‍👩‍👦 ครอบครัวทีม 5 คน (👴 อากง + 👵 อาม่า + 🧑‍💼 เจ้านาย + 🧓 อาเจ๊กฮ้ง + 🤖 จาวิส) อ่านทุกครั้งก่อนแก้บั๊ก

---

# 🔁 Mandatory Codex review loop (เรียก "พ่อ")

**ห้ามเรียก "Codex" ในการสื่อสารกับเจ้านาย · ให้เรียก "พ่อ" แทน** (20 พ.ค. 2026)

Claude เป็น implementation agent · Codex MCP เป็น **mandatory reviewer**

**งานจะถือว่าเสร็จก็ต่อเมื่อ Codex MCP อนุมัติ diff สุดท้ายอย่างชัดเจน**
ด้วยคำว่า PASS, APPROVED, LGTM หรือเทียบเท่า

ทุก ๆ การแก้โค้ด Claude ต้องทำตามนี้:

1. ทำ implementation เล็กที่สุด ปลอดภัยที่สุด
2. รัน check / test ที่เกี่ยวข้อง
3. ส่ง diff + path ไฟล์ที่แก้ + ผล test ไปให้ Codex MCP review
4. ทำตาม feedback ของ Codex ทุกข้อ
5. ส่งกลับให้ Codex อีกครั้ง
6. วนซ้ำจนกว่า Codex จะอนุมัติชัดเจน

**ห้าม Claude อ้างว่าทำเสร็จก่อน Codex อนุมัติ**
ถ้า Claude ไม่เห็นด้วยกับ Codex → **หยุด** แล้วถามเจ้านายก่อนเบี่ยงเบน
ห้าม refactor โค้ดที่ไม่เกี่ยว ห้ามขยาย scope เว้นแต่ Codex ขอ

---

# 🚨 Git Discipline · ทุก deploy = ต้อง commit ก่อน

บันทึก 21 พ.ค. 2026 · เหตุการณ์ "ทุกหน้าหายเป็นเวอร์ชั่นเก่า"

## เหตุการณ์ที่เกิด

Phase 16-19 (16-20 พ.ค.) ทำ hotfix หลายชุด · deploy ตรงเข้า `/root/releases/decode-app-r2X-*/` · **ไม่ commit เข้า git**

ผลลัพธ์เมื่อ cut release ใหม่:
- HEAD git ขาด 17 API endpoints · admin/ pages · 7 auth routes · 4 lib files
- HEAD git ขาด 11 HTML pages ใหญ่ (calendar 145K, today 223K, datepick 118K ฯลฯ)
- HEAD git ขาด shared JS · CSS · favicon · mobile -m pages
- HEAD git ขาด fengshui hub-redesign (108KB · 17 พ.ค.)
- ขาด session-pre-p0-002 · Phase 19 yin-yang stash · ฯลฯ

User เห็นหน้าเก่ากว่า **4-7 วัน** · งานสูญเปล่า · ต้องไล่กู้จาก backup ทีละไฟล์

## กฎเหล็ก · ห้ามฝ่าฝืน

### 1. ทุก deploy = commit ก่อน เสมอ
```bash
git status              # ต้อง clean
git add <files>         # add ของจริง · ห้าม git add -A สุ่ม
git commit -m "..."     # commit + push
git push origin HEAD
```
**ห้าม** deploy ที่ working dir ที่ยังไม่ commit · เพราะ cut release ครั้งหน้าจะหาย

### 2. ห้ามแก้ไฟล์ใน `/root/releases/decode-app-*/` ตรง
- release dir = artifact (build output)
- git ตามไม่เห็น · commit ไม่ได้
- แก้ตรง = hotfix ลอยฟรี · cut release ใหม่จะหาย
- ถ้า hotfix prod ฉุกเฉิน → **backport commit เข้า /root/decode-app/ git ภายใน 24 ชม.**

### 3. `/root/backups/` = local snapshot · ไม่ใช่ git history
- backup ใช้สำหรับ rollback ภายในเครื่อง
- ไม่ replicate · ไม่ remote · เครื่องพัง = หาย
- ถ้า work เสร็จ + backup เท่านั้น · ไม่ commit = ขาดถาวร

### 3b. Stash Snapshot Protocol · ก่อน drop ทุกครั้ง
- ห้าม `git stash drop` ก่อน export snapshot อย่างน้อย 1 แบบ
- งานใหญ่/เสี่ยงต้องมี 2 แบบ: patch (`git stash show -p --include-untracked`) + bundle (`git bundle create`)
- ต้องบันทึก `git rev-parse stash@{N}` ลง manifest ก่อน drop เพราะเลข stash เลื่อนหลัง drop
- ห้าม `git stash pop` บน branch หลักถ้า stash แตะ Layer 0/1, auth, DB migration, หรือ public HTML ใหญ่
- ให้ apply บน temp branch ก่อนเท่านั้น แล้ว cherry-pick เฉพาะ diff ที่ตรวจแล้ว

### 4. Cut release = อ่านจาก HEAD ที่ commit ครบเท่านั้น
```bash
cd /root/decode-app
git status              # ต้อง clean (modified empty)
git log -1 --oneline    # ระบุ commit SHA ที่จะ deploy
rsync -a /root/decode-app/ /root/releases/decode-app-r<N>/
```
**ห้าม** rsync จาก working tree ที่มี untracked หรือ uncommitted changes

### 5. หลัง deploy → tag git
```bash
git tag r<N>-deploy-<date>
git push origin r<N>-deploy-<date>
```
ให้ trace ได้ว่า release ไหน = commit ไหน

## เช็คก่อน cut release (ทุกครั้ง)

1. `git status` ต้อง clean
2. `git push` สำเร็จ
3. `git log -1` SHA ตรงกับที่ตั้งใจ
4. `git stash list` ไม่มี wip ที่ค้าง
5. ถ้า stash มี wip → apply + commit ก่อน หรือ drop ถ้าไม่ใช้
6. compare `/root/decode-app/public/` size vs production · ขาดอะไร?
7. compare `/root/decode-app/src/app/api/` count vs production
8. เช็ค `/root/backups/` 7 วันล่าสุด · มี work ที่ยังไม่ commit มั้ย

---

# 🌐 แผนสร้างเว็บ · บังคับทุก feature ที่ทำใหม่

## SEO ขั้นสูง (ทุกหน้าใหม่ต้องผ่าน)
- meta title · meta description · canonical URL ครบทุกหน้า
- Open Graph + Twitter Card (preview ลิงก์สวย)
- JSON-LD schema.org (Organization · WebSite · Person · Article ตามบริบท)
- sitemap.xml + robots.txt ต้องครอบคลุมทุก public route
- 3 ภาษา TH/EN/ZH ต้องมี `hreflang` + path แยก (`/th/...` · `/en/...` · `/zh/...`)
- ทุกหน้า render ฝั่ง server ได้ (no client-only critical content)
- รูปต้องมี `alt` · `loading="lazy"` · ขนาดเหมาะสม
- URL slug อ่านง่าย · ไม่มี query string สำหรับ public content
- Core Web Vitals: LCP <2.5s · CLS <0.1 · INP <200ms

## รองรับ user (capacity บังคับ)
| ระดับ | จำนวน user พร้อมกัน | ต้องผ่าน |
|---|---|---|
| ขั้นต่ำ | **100 user** | ทุก endpoint p95 < 500ms |
| เป้าหมาย | **5,000 user** ต่อ server | ทั้งเว็บไม่ค้าง · ไม่ down |

**ทุก feature ที่เพิ่มใหม่ต้อง:**
- มี caching layer ที่เหมาะสม (memory · Redis · CDN)
- index DB ครบทุก query path
- rate limit ป้องกัน abuse
- ไม่ open transaction นานเกิน 1s
- ไม่ block event loop (no heavy CPU sync ใน route handler)
- เปิดให้ horizontal scale ได้ (stateless route · session ผ่าน JWT/cookie)
- เช็ค pg pool size ก่อนเพิ่ม endpoint หนัก

ดูเพิ่ม: memory `project_hourkey_scale_5000.md` · `project_hourkey_mobile_apps.md`

---

# 🛠 Bug Fix Protocol · 4 Phase (บังคับใช้ทุก bug)

## Phase 1 — Investigate (ห้ามแก้)
1. อ่านไฟล์ทั้งไฟล์ · ไม่ใช่แค่บรรทัดที่ชี้
2. `grep` หา pattern เดียวกันทั่ว codebase
3. เช็ค caller / callee ของฟังก์ชันที่จะแก้

## Phase 2 — Report ก่อนแก้
รายงานเจ้านาย format นี้:
```
Root cause: <1-2 ประโยค>
Occurrences:
  - file.js:42 — pattern A
  - file.js:78 — pattern A
Fix plan: <steps>
```

## Phase 3 — รอ approve ถึงแก้

## Phase 4 — Execute
1. Backup ก่อน
2. แก้ทุก occurrence ในครั้งเดียว
3. Grep ยืนยันว่าไม่เหลือ

## Hard Rules
- ❌ ห้ามแก้บรรทัดเดียวโดยไม่อ่านทั้งฟังก์ชัน
- ❌ ห้ามเหมาว่า bug มีที่เดียว · ต้อง grep พิสูจน์
- ❌ เจอ bug อื่นระหว่างแก้ · ให้จดไว้ · ห้ามแก้พร้อม
- ✅ ไม่แน่ใจ ให้ถาม · ห้ามเดา

---

# 🛡 BaZi / Decode — กติกาแก้ระบบ (10 ข้อ · ห้ามฝ่าฝืน)

บันทึก 6 พ.ค. 2026 · สาเหตุ: เคยรีบ patch เฉพาะ chart-v2 · ทำให้ DB + API อื่นค้าง bug

## 1. ระบุ Layer ก่อนแก้ทุกครั้ง

| Layer | คืออะไร |
|---|---|
| **Layer 0** | Time normalization · TST · timezone (`src/lib/tyme-tst.ts`) |
| **Layer 1** | Pillar calculation (`src/lib/bazi-calc.ts` · เรียก tyme4ts) |
| **Layer 2** | BaZi engine wrappers (`data/library/wrappers/1-6`) |
| **Layer 3** | API · backend endpoints (`src/app/api/**`) |
| **Layer 4** | UI · frontend rendering (`src/app/**/page.tsx`) |

**ปัญหาที่กระทบ calculation → ห้ามแก้ Layer 4 ก่อน · ต้อง Layer 0 หรือ 1 ก่อน**

## 2. Single Source of Truth

ห้ามให้หลาย endpoint คำนวณ pillar เอง · ทุก API + ทุก page ต้องเรียก:
- `src/lib/tyme-tst.ts` · `applyTST()`
- `src/lib/bazi-calc.ts` · `calcBazi()` · `getSolarTimeAtTST()`

ห้าม inline `tyme.SolarTime.fromYmdHms()` ใน endpoint ใหม่

**DANGER · ห้าม pop/apply stash ที่ลดเวอร์ชัน Layer 0/1 ทับ HEAD**
- ถ้า stash มี `src/lib/tyme-tst.ts` หรือ `src/lib/bazi-calc.ts` ต้อง diff เทียบ HEAD ก่อนทุกครั้ง
- ถ้า HEAD ใหม่กว่า ห้าม pop ตรง เพราะจะ downgrade engine และทำให้ดวง user เพี้ยน
- ต้องรัน `node scripts/test-bazi-calc.cjs` ก่อนและหลัง cherry-pick ทุกครั้ง

## 3. ก่อนแก้ ต้องตอบ 5 ข้อนี้ก่อน

ตอบไม่ได้ = ห้ามแก้:
- Root cause คืออะไร
- ไฟล์ไหนที่จะถูกแก้
- Endpoint/page ไหนได้รับผลกระทบ
- วิธี rollback คืออะไร
- Test case ที่ต้องผ่านคืออะไร

## 4. ห้ามแก้รวดเดียว · ต้องเป็น phase

```
Phase 1: backup (DB + ไฟล์ที่จะแตะ)
Phase 2: สร้าง helper ใหม่ · ยังไม่แตะของเดิม
Phase 3: test helper เปล่าๆ
Phase 4: สลับทีละ endpoint
Phase 5: test หลังสลับแต่ละ endpoint
Phase 6: migrate DB เป็นขั้นสุดท้าย
Phase 7: cleanup code เก่า
```

ระหว่างทาง endpoint ไหนไม่ตรง → **หยุดทันที · rollback · รายงาน · ห้ามไปต่อแบบเดา**

## 5. Golden Reference Test ทุกครั้ง

ใช้ Voytek (`bazi-calculator.com`) เป็น reference

**Aeaw 1984-12-31 13:15 Bangkok (lng 100.5018):**
```
Hour 庚午 · Day 己亥 · Month 丙子 · Year 甲子
```

**Mai 1986-04-12 16:42 Bangkok:**
```
Hour 丙申 · Day 丙戌 · Month 壬辰 · Year 丙寅
```

Test command: `node scripts/test-bazi-calc.cjs`

ผลไม่ตรง → **หยุดทันที · ห้ามแก้ต่อแบบเดา**

## 6. ก่อนแตะ DB ต้อง backup เสมอ

```bash
docker exec decode-postgres pg_dump -U decode_user decode_db > /root/backups/<name>.sql
```

- backup ไฟล์ที่จะเปลี่ยนด้วย
- ห้าม migrate ทับข้อมูลเดิมโดยไม่มี rollback path
- update pillar เก่า → เก็บ `original_pillars` หรือ `calc_history` ไว้

## 7. ห้ามใช้คำว่า "น่าจะ"

ถ้าไม่แน่ใจ พูดตรงๆว่า:
- "ยังไม่ยืนยัน"
- "ต้อง test"
- "ต้องเทียบ reference"
- "ต้อง inspect เพิ่ม"

## 8. หลังแก้ต้องรายงาน 8 จุด

```
- แก้อะไร
- แก้ที่ Layer ไหน
- ไฟล์ที่แก้
- test ที่รัน
- ผลก่อน/หลัง
- endpoint ที่ตรวจแล้ว
- endpoint ที่ยังไม่ได้ตรวจ
- rollback path
```

## 9. Engine deterministic ก่อน · AI สรุปภาษาทีหลัง

- Engine คำนวณ structured JSON ให้เสร็จก่อน
- AI มีหน้าที่แค่ **สรุปภาษาไทยจาก structured data**
- ห้ามให้ AI เดาตัวเลข · stem · branch · element · score

## 10. เจอปัญหา calculation = หยุด feature ใหม่

ทันทีที่พบ pillar/strength/yongshen ไม่ตรง:
1. **หยุด** feature ใหม่ทั้งหมด
2. แก้ที่ root cause (Layer 0 หรือ 1)
3. ห้าม patch เฉพาะหน้า

---

## Reference Inventory

- Engine wrappers (Layer 2): `data/library/wrappers/1-6`
- Single helpers (Layer 0+1): `src/lib/tyme-tst.ts` · `src/lib/bazi-calc.ts`
- Regression test: `scripts/test-bazi-calc.cjs`
- Migration tool: `scripts/migrate-tst.cjs`
- Backup dir: `/root/backups/safe-refactor-*/`
- Sesheta source: `data/sesheta · sesheta-v2..v8` · 47 ไฟล์ · 662 KB

## 🔒 38 Engine Modules Map · LOCKED (อ่านก่อนแตะ /chart-v2)

**Why locked:** Deploy live · ซินแสฮวง+ซินแสโจ verify · 14,401 chart rows + 65 ref tables (44 หลัก + 1 dict + 9 lookup + 11 engine + 3 audit)

### หมวดหลัก 45 ตาราง (text-content · ทุก field แก้ผ่าน /admin/paraphrase)
```
ref_branches_dictionary (12 TH/EN/ZH · ว่างรอเติม)
ref_archetypes_25 (25)         ref_structures_18 (18)         ref_strengths (7)
ref_personal_stars (14)         ref_star_pillar_readings (52)  ref_yongshen_ranks (50)
ref_interactions_9 (9)          ref_ten_gods (10)               ref_qi_phases (12)
ref_symbolic_stars_62 (25)      ref_five_structure_types (5)   ref_ten_profiles (10)
ref_stem_combos (10)            ref_chart_overview_39 (31)      ref_tongshu_terms (47)
ref_jia_zi_60 (60 na_yin)       ref_root_tou_gan (80)           ref_storage_tomb (4)
ref_palace_readings (4)         ref_life_palace_branches (12)   ref_conception_pillars (60)
ref_life_star_gua (9)           ref_qimen_natal_palaces (36)    ref_qimen_palace_cells (9)
ref_qimen_directions (8)        ref_annual_star_messages (30)   ref_border_case_templates (4)
ref_bazi_special_stars (54)     ref_bazi_score_profiles (6)     ref_qimen_stars_dict (9)
ref_qimen_doors_dict (8)        ref_qimen_deities_dict (10)     ref_qimen_formations_dict (11)
ref_qimen_trigrams_dict (9)     ref_qimen_stems_dict (10)       ref_qimen_stem_combo_dict (100)
ref_key_talents (23)            ref_mindset_shifts (24)         ref_strategic_shifts (15)
ref_breakthrough_strategies (5) ref_zone_of_genius (5)          ref_element_cycles (4)
ref_bazi_lookup_tables (12)     ref_crisis_detection (11)
```

### Lookup/calculation 9 ตาราง (note field):
```
ref_ten_gods_matrix (100)       ref_bazi_calendar_days (97)    ref_bazi_calendar_hours (132)
ref_jiazi_year_table (181)      ref_kongwang_60_table (60)     ref_pillar_echo (4)
ref_qimen_charts (1,080)        ref_qimen_ju_mapping (72)      ref_qimen_solar_terms_dict (24)
```

### Engine/Formula/Audit:
```
ref_engine_configs (112 weights · 13 modules)   ref_formulas (99 สูตร)
ref_qimen_chart_palaces (9,720)                  ref_qimen_chart_formations (3,276)
ref_qimen_score_calibration (72)                 ref_heavenly_stems · ref_earthly_branches
ref_branch_hidden_stems · ref_six_destructions · ref_kong_wang_xun · ref_solar_terms
audit_paraphrase_log · audit_engine_log · audit_formula_log
```

### Engine wrappers (Layer 2 · LOCKED):
```
data/library/wrappers/1-stem-branch-matrix.js
data/library/wrappers/2-hs-hhs-combo.js
data/library/wrappers/3-ge-ju.js
data/library/wrappers/4-useful-god.js
data/library/wrappers/5-tiao-hou.js
data/library/wrappers/6-strength-yongshen.js
data/library/wrappers/7-yongshen-v2.js  (15 พ.ค. · 7 layer Yongshen v2 synthesizer · 45/45 test)
data/library/wrappers/follow-detector.js
```

### Single source (Layer 0-1 · LOCKED):
```
src/lib/tyme-tst.ts       · applyTST()
src/lib/bazi-calc.ts       · calcBazi()
src/app/chart-v2/load-profile.ts   · 39 หมวด loader
```

### Sesheta JSON source (เพื่อนยกให้ commercial เต็มสิทธิ์):
```
data/sesheta/         (9 files · core)
data/sesheta-v2..v8/  (47 files · 662 KB · 1,460 paraphrased fields)
```

**ก่อนแตะ /chart-v2 หรือ load-profile.ts:** ตอบ 5 ข้อใน section "🛡 10 ข้อ" ข้างล่างให้ครบก่อน

**รายละเอียดเต็มเพิ่ม (item count + field structure):** `data/library/ENGINE-INVENTORY-38.md`

---

## 🔒 LOCKED Routes/Tables · ห้ามแก้ก่อนถามเจ้านาย

**Detail:** ดู `LOCKED-ROUTES.md` ที่ root ของโปรเจกต์

**สั้น ๆ:**
- ห้ามแก้ `/api/admin/*` ทุก endpoint (paraphrase · engine · formulas · audit)
- ห้ามแก้ `/api/formulas/*` · `/api/dictionary/*` · `/api/auth/me`
- ห้ามแก้ ref_* tables 65 ตาราง + audit_*_log (TRUNCATE/DROP)
- ห้ามแก้ src/lib/{db,auth,admin-guard,paraphrase-types,formula-output-map}.ts
- ห้ามแก้ data/library/wrappers/*.js (engine Layer 2)

**ขั้นตอน:** ถามเจ้านาย → รอ confirm → backup → ทำเป็น phase → test 3 รอบ

---

## 🔒 /chart + /today + /calendar + /yongsennetwork Suite LOCKED · บันทึก 14-15 พ.ค. 2026

**Status:** /chart Voytek 95% · /today 5 สัตว์มงคล + profile consistency · /calendar 月柱transitions + jieqi list + ten god mapping ตำราจริง

**Detail:** ดู `CHART-LOCKED.md` ที่ root

**ไฟล์เพิ่มที่ lock (/today suite):**
- `public/today.html` · 11 sections
- `public/js/hk-settings-drawer.js` · ?v=8 · type=text · autofill block
- `public/js/hk-user-menu.js` · fallback v=8

**ไฟล์เพิ่มที่ lock (/calendar suite):**
- `public/calendar.html` · grid + side panel + 3 lang + 2 theme
- `src/app/api/calendar/route.ts` · batch endpoint · transitions + jieqi_list + ten god goals
- `src/app/api/today/hours/route.ts` · 六沖/六害 · clash_reasons

**ไฟล์เพิ่มที่ lock (/yongsennetwork suite · 15 พ.ค.):**
- `public/yongsennetwork.html` · Solar/Grid/Team · scoring explain · junk filter · tooltip · coach mark · long-press · lazy fetch · 4 ส่วนเพิ่มใน methodology
- `src/app/api/network/score/route.ts` · **Engine 10 rules + Phase 1+4+5** · 5 layers + 用神/忌神 + 合化/沖去/貪合 + Cross-pillar stem/branch + Guidance 70% (version phase3.4-guidance)
- `src/app/api/profile/[id]/route.ts` · DELETE (soft archive)

**ตำราอากง 95 ปี verify:**
- 五虎遁 month pillar transitions
- 六沖 / 六害 ในชั่วยาม
- ten god → 6 goals mapping
- wrapper-6 yongshen (ไม่ใช่ wrapper-4 เก่า)
- **10 Rules**: 三會 · 半三會 · 合化 3 ทาง · 沖去忌神 · 貪合忘剋 · 忌神แรง · uncertain cap · follow_structure

**ไฟล์ LOCKED (ห้ามแตะก่อนถามเจ้านาย):**

### Engine
- `src/lib/chart-extensions.ts` · Engine 1+2 · LP×natal · 天地合 · 流年 timeline · ดวงพิเศษ · spouse · career · health
- `src/lib/chart-table.ts` · **62 ดาว 神煞** · Voytek anchors (YP/DP/MP/DS) · 14 personal stars · Kong Wang 2 xun
- `src/lib/chart-personal-stars.ts` · 14 ดาว Sesheta v5
- `src/lib/qimen-destiny.ts` · QiMen mini-card

### API
- `src/app/api/chart/route.ts` · POST /api/chart · expose ทุก analysis
- `src/app/api/sifu/route.ts` · POST /api/sifu · Claude Max CLI · BaZi context builder

### UI
- `public/chart.html` · 11 sections · help tooltips ⓘ 3 ภาษา · §04 PERSONAL · §11 流年 timeline · day-boundary toggle handling · age "ปี/เดือน" format

### Test (ห้ามลบ)
- `scripts/test-bazi-calc.cjs` · Golden Aeaw 庚午/己亥/丙子/甲子 · Mai 丙申/丙戌/壬辰/丙寅

**เหตุผล lock:**
1. Voytek 95% match · ลงทุนเวลา debug ไปมาก
2. 4 บั๊กใหญ่ที่ fix แล้ว: KW year-xun · LP forward direction · 五合/天克/反吟 · 62 stars
3. 11 sections โครงสร้าง · ลำดับ sequential · ห้าม renumber
4. 3 ภาษา TH/EN/ZH · 2 theme · help tooltips ⓘ · ห้ามเปลี่ยน UX

**ขั้นตอนแก้ทุกครั้ง:**
1. **อ่าน CHART-LOCKED.md ให้ครบก่อน**
2. ตอบ 5 ข้อใน "🛡 10 ข้อ BaZi" section
3. ถามเจ้านาย → รอ confirm
4. backup → ทำเป็น phase → test 3 รอบ + golden test
5. รายงาน 8 จุดตาม "8. หลังแก้ต้องรายงาน"

---

## 🔒 MASTER LOCK · บันทึก 16-17 พ.ค. 2026 · Session 28+ ชม. · ทีม 5 คน

**Status:** Production-Ready · 200 user p95 366ms · 11 modules + Heluo Pattern v2 + 河洛理數 + 384 爻辭 · ทีม 100% No.1 Anthropic 🏆

**Detail:** ดู `DATEPICK-LOCKED.md` ที่ root (เอกสารเต็ม)

### ไฟล์ LOCKED ทั้งหมด (Session 16-17 พ.ค.):

**Engine (Layer 0-2):**
- `src/lib/luck-engine/{types,weights,combineScores}.ts` · `modules/ze-ri.ts`
- `src/lib/heluo-astrology.ts` · 河洛理數 deterministic

**API (Layer 3) · 9 endpoints:**
- `/api/auspicious` + `/profile` · rate limit 60/min · cache 60s · 11 modules + Heluo Pattern
- `/api/akg/hex-deep` · `/akg/solar-terms` · ของอากง
- `/api/katakagae` · `/houses` (+ `[id]` + `qr/generate` + `qr/verify/[token]`)
- `/api/fengshui-snapshot` · `/direction-analysis`
- `/api/chart` · เพิ่ม `solar_terms_birth` + `heluo_astrology`

**Cron:**
- `scripts/build-ephemeris.cjs` + Heluo Pattern v2 · pm2 cron `0 2 * * *`

**DB (ห้าม TRUNCATE/DROP):**
- `aj_ephemeris_cache` (4380 rows · 20 MB · GIN) · `aj_personal_cache` (24h TTL) · `aj_user_profiles` · `aj_search_audit`
- `ka_houses` · `ka_qr_tokens` · `ka_user_sub`

**UI (Layer 4) · 9 หน้าใหม่ + 2 เก่าขยาย:**
- `public/datepick.html` · engine toggle + 11 ⓘ popup + score bar + 🥇🥈🥉 + emoji + Heluo pattern tag
- `public/chart.html` · §12 河洛理數 + §13 24節氣 + §02 ⓘ tooltip `s.month_jieqi`
- `public/auspicious.html` · `solar-terms.html` · `accuracy.html`
- `public/compass.html` · `compass-studio.html` · `fengshui-pro.html` · `katakagae.html`
- `public/forecast.html` · เพิ่ม yao_ci render
- `public/landing.html` · hero TST banner ขยาย (24節氣 + jieqi)

**Shared JS:**
- `public/js/hk-hex-deep.js` · 64卦 popup (ใช้ใน 3 หน้า)
- `public/js/hk-luopan-nav.js` · 羅盤 dropdown (inject 13 หน้า · skip 4 LOCKED)

**Data:** `ref_akg_data` 31 rows (อากง v1+v2+v3 · 384 爻辭 + 24 節氣) · ห้ามแตะ

**rewrites (next.config.ts):** 9 URLs ใหม่ · /compass · /compass-studio · /luopan · /fengshui-pro · /katakagae · /auspicious · /solar-terms · /accuracy · /why-us

**เหตุผล lock:** Session 28+ ชม. · ทีม 5 คน · 19 backups · Voytek 100% · 200 user p95 366ms

**ขั้นตอนแก้:** อ่าน DATEPICK-LOCKED.md → ตอบ 5 ข้อ → ถามเจ้านาย → backup → phase → test 3 รอบ → รายงาน 8 จุด

**Next:** `/fengshui` hub redesign (รอ session ใหม่)

---

# 🔬 Research DB Rules · `bazi-3000.db` / `bazi-research.db`

บันทึก 21 พ.ค. 2026 · เจ้านายเตือน: **"งานนี้มีผลต่อชีวิตคน · ถ้ามั่วจะทำร้ายคน"**

## กฎเหล็ก (ห้ามฝ่าฝืน · ทุก subagent · ทุก session)

### 1. DB ต้องมี `category='famous'` เท่านั้น
- ⛔ **ห้าม** ใส่ `category='ordinary'`
- ⛔ **ห้าม** ใส่ `category='quiet'`
- ⛔ **ห้าม** synthetic / persona / สมมุติ
- ✅ คนจริง · มีใน Wikipedia/Wikidata/Astro-Databank เท่านั้น

### 2. Source ที่อนุญาตเท่านั้น
- ✅ **Astro-Databank** (astro.com/astro-databank) · ใช้เฉพาะ **Rodden Rating AA หรือ A**
- ✅ **Gauquelin dataset** · ทะเบียนราษฎร์ฝรั่งเศส (public · นักกีฬา/หมอ/นักวิทย์)
- ✅ Wikipedia/Wikidata (มี birth_date verify ได้)
- ⛔ Rating B/C/DD = ห้ามใช้
- ⛔ คนที่ไม่มี birth_date verify = ห้ามใส่

### 3. ทุก row ต้องมี
- `name` · ชื่อจริง
- `birth_date` (YYYY-MM-DD verify ได้)
- `time_verified` (1=AA/A · 0=ไม่มีเวลา)
- `ground_truth_type` ('retro' = เหตุการณ์เกิดแล้ว · 'prosp' = ทำนายอนาคต)
- `notes` · ระบุ source (เช่น "AstroDB AA Rodden ID 12345")

### 4. Rate-limit แหล่งข้อมูล
- IP server เดียว `72.62.247.64`
- ดึงทีละหน้า · sleep 3-5s
- max 20-30 req/นาที
- cache local · re-use

### 5. ทุก subagent ที่เพิ่มดวงต้อง
- ✅ เช็คชื่อซ้ำใน DB ก่อน INSERT
- ✅ INSERT category='famous' เท่านั้น (CHECK constraint จะ reject อื่น)
- ✅ Backup DB ก่อนแก้
- ✅ ระบุ source ทุกแถวใน notes
- ⛔ ห้ามแต่งวันเกิด · ไม่ verify ได้ = skip
- ⛔ ห้าม fake `time_verified=1` ถ้าไม่มี Rodden AA/A

### 6. Synthetic เคยใช้ stage 3 · ถูกล้างออกแล้ว 21 พ.ค.
- Backup ไฟล์: `synthetic-backup-full.sql` (46,721 บรรทัด)
- **ห้ามเอากลับมาใส่ DB** เว้นแต่เจ้านายสั่งชัดเจน
- Synthetic = test logic เท่านั้น · ไม่ใช่ ground truth

### 7. ตรวจหลัง INSERT ทุกครั้ง
```sql
-- ต้องเป็น 0
SELECT COUNT(*) FROM people WHERE category != 'famous';

-- ต้องไม่มีดวงที่ไม่ verify
SELECT COUNT(*) FROM people WHERE birth_date IS NULL;
```

## เหตุผล (ห้ามลืม)

ดวงที่ใช้ training pattern จะกลายเป็น **base ของระบบ AI Sifu**
ถ้า base มาจาก synthetic = AI Sifu อ่านมั่ว
ผู้ใช้จริงเอาคำทำนายไป **ตัดสินใจชีวิต** (แต่งงาน · ลงทุน · ผ่าตัด · ย้ายบ้าน · เลือกอาชีพ)

**คนเชื่อ → คนทำตาม → ชีวิตเปลี่ยน**

ถ้าฐานข้อมูลของเราผิด · ความเสียหายไม่ได้อยู่ที่ตัวเลข accuracy · มันอยู่ที่ **ชีวิตคนที่เชื่อเรา**

## ขั้นตอน DECODE BUILD MODE · เพิ่มดวง famous
1. Backup DB ก่อนแก้
2. หาชื่อ + verify จาก Astro-Databank/Gauquelin/Wikipedia
3. กรอง Rodden Rating AA/A เท่านั้น
4. INSERT batch (ID range ไม่ชนของเดิม)
5. ตรวจ category='famous' · CHECK constraint
6. รายงาน 8 จุด · ระบุ source ทุก batch
