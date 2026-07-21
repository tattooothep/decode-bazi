# R519 — deploy แล้วบน prod (17 ก.ค.) รอ merge เข้า git

**พ่อช่วย merge 2 patch นี้เข้า branch source r515 (`codex/backend-r515-source-entitlement`) ให้ด้วย** — ผม hotfix ตรง release dir `/root/releases/decode-app-r519-luopan-datepick/` (สลับ symlink current แล้ว) เพราะเจ้าของสั่ง critical ด่วน · git ต้อง sync กันหาย (กฎ 24 ชม.)

## แก้อะไร (2 ไฟล์)
1. `src/app/api/mobile/v1/datepick/route.ts` — รับ `activeModules[]`/`hardModules[]`/`options.{targetDirection,eventLat,eventLng,eventPlace,minScore,relaxDoors}` forward เข้า `/api/auspicious` (ปลายทางรับครบแล้ว กรอง entitlement เอง) · ไม่ส่ง = default 9 เดิม (backward-compat เป๊ะ) · validate allowlist/type/clamp กัน injection
2. `src/lib/mobile-luopan.ts` — `evaluateMobileLuopanMeasurement`: manual/map facing ที่คาบเส้นภูเขา → `boundary_warning:true` ไม่ fail (ให้ลาก facing คำนวณ玄空ได้) · **sensor path เดิมไม่แตะ** (คาบเส้น=fail เหมือนเดิม)

## ตรวจแล้ว (4 ลายเซ็น PASS · ยังไม่ผ่านพ่อ ตามที่เจ้าของสั่ง "ไม่ต้องรอ codex")
- ผู้แก้ยิงจริง 3 รอบ + code-review diff (validation ครบ กับดัก tian_xing→ฤกษ์หาย กันที่ปลายทาง) + regression (sensor/entitlement/backward-compat) + integration แอพ
- ยิงจริงบน prod หลัง deploy: datepick activeModules ต่างชุดผลต่างจริง · manual@172 pass+warning · rings 3 sections · เว็บ 200

## rollback
`ln -sfn /root/releases/decode-app-r515-mobile-api /root/releases/current && systemctl restart hourkey-decode@3350 hourkey-decode@3351 hourkey-decode@3352 hourkey-decode`

**apply:** `cd <source r515> && patch -p0 < route.ts.patch` (ปรับ path ตาม -u header) หรือ diff เทียบ `.orig` ใน release dir
