# 🔒 LOCKED Routes / Tables / Files

**Last updated:** 2026-05-13
**Reason:** Deploy live แล้ว · ซินแสฮวง + ซินแสโจกำลังตรวจ/กรอกข้อมูล
**Rule:** ห้ามแก้ก่อนได้รับอนุญาตจากเจ้านาย (tattoothep@gmail.com)

---

## 1. API Routes

### /api/admin/* (ใช้โดยซินแส)
| Endpoint | Purpose | Status |
|---|---|---|
| `/api/admin/paraphrase/types` | list 53 admin types | 🔒 LOCKED |
| `/api/admin/paraphrase/[type]` | list rows of type | 🔒 LOCKED |
| `/api/admin/paraphrase/[type]/[id]` | GET/PUT single row | 🔒 LOCKED |
| `/api/admin/paraphrase/import` | bulk import JSON | 🔒 LOCKED |
| `/api/admin/paraphrase/export` | export JSON | 🔒 LOCKED |
| `/api/admin/paraphrase/audit` | view audit log | 🔒 LOCKED |
| `/api/admin/paraphrase/translate` | AI translate (Haiku) | 🔒 LOCKED |
| `/api/admin/engine` | list 23 modules | 🔒 LOCKED |
| `/api/admin/engine/[id]` | PUT update + revert | 🔒 LOCKED |
| `/api/admin/engine/import` | bulk import | 🔒 LOCKED |
| `/api/admin/engine/export` | export JSON | 🔒 LOCKED |
| `/api/admin/engine/audit` | view history | 🔒 LOCKED |
| `/api/admin/formulas` | list 99 formulas | 🔒 LOCKED |
| `/api/admin/formulas/[id]` | GET/PUT + verify/dispute | 🔒 LOCKED |
| `/api/admin/formulas/import` | bulk import | 🔒 LOCKED |
| `/api/admin/formulas/export` | export JSON | 🔒 LOCKED |

### /api/* (public, ใช้โดย UI)
| Endpoint | Purpose | Status |
|---|---|---|
| `/api/formulas` | list 99 formulas (public) | 🔒 LOCKED |
| `/api/formulas/[code]` | single formula | 🔒 LOCKED |
| `/api/formulas/[code]/test` | run formula on real profile | 🔒 LOCKED |
| `/api/formulas/presets` | preset profile list | 🔒 LOCKED |
| `/api/dictionary/types` | 53 types list | 🔒 LOCKED |
| `/api/dictionary/[type]` | browse entries | 🔒 LOCKED |
| `/api/dictionary/[type]/[id]` | single entry | 🔒 LOCKED |
| `/api/dictionary/search` | cross-table search | 🔒 LOCKED |
| `/api/auth/me` | session + avatar (Google/LINE) | 🔒 LOCKED |
| `/api/chart` | bazi calculation core | 🔒 LOCKED |
| `/api/today/*` | daily verdict + actions + hours | 🔒 LOCKED |
| `/api/qimen` | qimen chart cast | 🔒 LOCKED |

---

## 2. Pages

| Page | Purpose | Status |
|---|---|---|
| `/admin/paraphrase` | ซินแสแก้ content 53 หมวด | 🔒 LOCKED |
| `/admin/engine` | ซินแสปรับ weights 23 modules | 🔒 LOCKED |
| `/admin/formulas` | ซินแส verify 99 สูตร | 🔒 LOCKED |
| `/formulas/print` | PDF print 99 สูตร | 🔒 LOCKED |
| `/formulas` · `/formulas/[code]` | public formula viewer | 🔒 LOCKED |
| `/dictionary` · `/dictionary/[type]` · `/dictionary/[type]/[id]` | public dictionary | 🔒 LOCKED |
| `/chart-v2` | 39 หมวด + §39 ภาพรวม | 🔒 LOCKED |

---

## 3. DB Tables (Postgres `decode_db`)

### Locked (production data · ซินแสใช้)
- **ref_* tables 65 ตาราง** · text content + weights + formulas + lookups
- `audit_paraphrase_log` · `audit_engine_log` · `audit_formula_log` (ห้าม TRUNCATE/DROP)
- `users` · `org_members` · `profiles` (production user data)

### Locked SQLite
- `/root/qimen-api/data/qimen.sqlite` (75 MB legacy) · คง backward compat

---

## 4. Library / Engine Files

| File | Layer | Reason |
|---|---|---|
| `src/lib/db.ts` | 3 | pg-types DATE parser · มีผลทั่วทั้ง app |
| `src/lib/auth.ts` | 3 | JWT signing · session |
| `src/lib/admin-guard.ts` | 3 | admin role check |
| `src/lib/paraphrase-types.ts` | 4 config | 53 types map |
| `src/lib/paraphrase-db.ts` | 3 | DB cache 5min |
| `src/lib/dictionary-cache.ts` | 3 | dictionary cache |
| `src/lib/formula-output-map.ts` | 4 | 31 formula→output mapping |
| `src/lib/tyme-tst.ts` | 0-1 | Golden ref · TST |
| `src/lib/bazi-calc.ts` | 0-1 | Golden ref · calcBazi |
| `data/library/wrappers/*.js` | 2 | 7 engine wrappers · single source (1-6 + 7-yongshen-v2) |
| `data/library/wrappers/7-yongshen-v2.js` | 2 | wrapper-7 · 7 layer synthesizer · 45/45 test |
| `src/app/chart-v2/load-profile.ts` | 3 | 39 หมวด loader |

---

## 4d. chart.html Orchestrator (13 พ.ค. Phase 23 · reviewer 9/10)

**LOCKED · ห้ามแก้:**
- `<script>` HKChartPage controller (single snapshot · single fetch · single render pass · run token · view-as strict id match)
- `window.HK_RENDER_BASIC` · `HK_RENDER_CHART` · `HK_RENDER_ALL`
- View-as banner: strict `?as=ID` ↔ `hk_view_as.id` match
- clearChartRoots: writes hero name always (no leak)

**Reviewer (gpt-5.4 xhigh):** GO for production · 9/10
Trace: `/root/.aris/traces/research-review/2026-05-13_run01/summary.md`
Backup: `/root/backups/phase21-settings-20260513/chart.html.before-dedup`

---

## 4c. Google Places Autocomplete (13 พ.ค. Phase 22)

**LOCKED · ห้ามแก้:**
- API · `/api/maps-script` (proxy ไป Google Maps JS API · ใช้ browser key จาก env)
- ENV · `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` · `GOOGLE_MAPS_BROWSER_KEY`
- /input.html ส่วน `hkInitPlaces` + `<script async src="/api/maps-script">`

**Why:** ใช้เพื่อ autocomplete สถานที่เกิด · pin lat/lng ลง form · ห้าม leak API key ใน HTML

---

## 4a. Settings Drawer (13 พ.ค. Phase 21)

**LOCKED · ห้ามแก้:**
- API · `PUT /api/profile/[id]` (update profile + recompute BaZi)
- API · `GET /api/profile/[id]` (single profile)
- JS · `/public/js/hk-settings-drawer.js` (drawer UI · TST calc)
- JS · `/public/js/hk-user-menu.js` (settings button handler)
- 9 HTML files ที่ include drawer script

Backup: `/root/backups/phase21-settings-20260513/`

---

## 4b. Static .html · Font Loading (13 พ.ค. Phase 20)

ทุกไฟล์ใน `/root/decode-app/public/*.html` ที่ใช้ Google Fonts
มี preconnect + display=optional แล้ว · ห้าม revert เป็น display=swap
(ป้องกัน FOUT · ตัวอักษรซ้อน)

20 ไฟล์: today, chart, qimen, master, calendar, datepick, fengshui,
mygoal, network, heluo, comparison, landing, signup, input, goal,
picker, picker-m, master-m, calendar-m, mygoal-m

Backup: `/root/backups/font-preconnect-20260513/`

---

## 5. Migration Files (ห้ามแก้ที่ apply แล้ว)

- `migrations/admin-paraphrase-20260513.sql`
- `migrations/group-b-20260513.sql`
- `migrations/engine-configs-20260513.sql`
- `migrations/phase18a-*.sql` · `phase18b-*.sql` · `phase18c-*.sql`
- `migrations/formulas-schema-20260513.sql`
- `migrations/seed-*.py` (12 ไฟล์)

ถ้าจะแก้ → สร้าง migration ใหม่ (`migrations/YYYYMMDD-<name>.sql`)

---

## 6. ขั้นตอนเมื่ออยากแก้

1. **ถามเจ้านาย** + ระบุไฟล์/route/table
2. **รอ confirm** ("ได้" / "ลุย" / "yes")
3. **Backup ก่อน** → `/root/backups/admin-paraphrase-20260513-0740/`
4. ทำเป็น **phase** · backup → migrate helper → test → swap
5. **Test 3 รอบ** · roundtrip OK · audit log clean
6. **Rollback path** ระบุชัด (sql file · before-* backup)

---

## 7. Rollback References

```
DB snapshots:
  /root/backups/admin-paraphrase-20260513-0740/decode_db_full.sql      (เริ่ม)
  decode_db_before_groupB.sql      (Phase 18A)
  decode_db_before_engine.sql       (Phase 14)
  decode_db_before_formulas.sql     (Phase 16A)
  decode_db_before_qimen25.sql      (qimen formulas)
  decode_db_before_18a.sql · 18b.sql · 18c.sql
  decode_db_before_engineV2.sql · before_engine_v3.sql
  decode_db_before_test.sql · before_formulas40.sql
  decode_db_before_notes.sql

Code snapshots:
  load-profile.ts.before-db-swap
  page.tsx.before-39
  editor.tsx.before-import / before-activitylog
  detail.tsx.before-test
  paraphrase-types.ts.before-groupB
  me-route.ts.before-avatar
```
