# เฟส B · Wire 天星 เข้า datepick (opt-in · ตัวบนสุด) — DESIGN (read-only · ยังไม่แก้)
> 30 มิ.ย. · LOCKED files (datepick/luck-engine/auspicious) → ออกแบบก่อน · wire ตอน engine A2/A5 เสร็จ + พ่อ + 5 ลายเซน
> เป้า: 天星 = checkbox บนสุด · **default ปิด** · ติ๊กถึงรัน+ให้คะแนน · **ไม่ติ๊ก = zero effect** (พิสูจน์ด้านล่าง)

## 🔒 พิสูจน์ zero-effect (กฎเจ้านาย "ไม่ติ๊ก=ไม่มีผล")
1. `combineScores` (combineScores.ts:49) วน `for (key of activeModules)` เท่านั้น → ไม่ติ๊ก = ไม่อยู่ใน activeModules = ข้าม
2. `getNormalizedWeights` (weights.ts:192) normalize เฉพาะ active → ดาวอื่น normalize กันเองเหมือนเดิมเป๊ะ
3. route.ts คำนวณ module เฉพาะที่ active (เติม on-the-fly) → ไม่ active = ไม่คำนวณเลย
→ **default ปิด = ผลลัพธ์ datepick เดิม 100% ไม่เปลี่ยน 1 คะแนน**

## จุดแก้ (6 จุด · additive ล้วน)
| # | ไฟล์ | แก้ | LOCKED |
|---|---|---|---|
| 1 | `src/lib/luck-engine/types.ts` | + `"tian_xing"` ใน ModuleKey + ALL_MODULES + UNIVERSAL_MODULES | 🔒 |
| 2 | `src/lib/luck-engine/weights.ts` | + tian_xing weight ใน 8 activity (เช่น 0.10 · normalize รับเอง · off=ไม่กระทบ) | 🔒 |
| 3 | `src/lib/luck-engine/modules/tian-xing.ts` (ใหม่) | wrap `tianxingReading(dtUTC,lat,lng)` → ModuleResult (level→normalized 0-100 + reasons up/down) | ✅ ไฟล์ใหม่ |
| 4 | `src/app/api/auspicious/route.ts` | ถ้า "tian_xing" ∈ active → compute on-the-fly ต่อ candidate (dtUTC=datetime.start · lat/lng Bangkok 13.75/100.5) แนบ cand.modules (แบบเดียว ze_ri fallback :295) | 🔒 |
| 5 | `public/datepick.html` | + `<label class="filter-item" data-filter="tianxing">` **บนสุด · ไม่ใส่ active · checkbox ไม่ checked** + badge "ขั้นสูง" + ⓘ · + map tianxing→tian_xing + MODULE_ORDER + I18N 3 ภาษา | 🔒 additive |
| 6 | showHelp/help content | + 'tianxing' (อธิบาย 七政四餘 ดาวจริง · 3 ภาษา) | 🔒 additive |

## map UI→key (datepick มี data-filter→ModuleKey + MODULE_ORDER:1277)
- data-filter="tianxing" → "tian_xing" · เพิ่มหัว MODULE_ORDER (บนสุด)
- ระดับ badge: ใช้ class ใหม่ "advanced" (ทอง) หรือ "score" · label "ศาสตร์สูงสุด · ให้คะแนน"

## tian-xing.ts module (ร่าง mapping)
```
level top→normalized 90 · good→72 · neutral→55 · bad→32   (รอบ B จูนกับ 200 user)
reasons.up = reasons ดี (用神ได้กำลัง/合格/恩星) · reasons.down = เสีย (難/仇/忌格)
status: "ready" · confidence: 0.6 (beta · ก่อน距度ครบ) → 0.85 (หลัง距度)
weight: ปานกลาง (ไม่ override ศาสตร์หลัก · เป็น "ชั้นสูงเสริม")
isHeavy:false (คำนวณเร็ว · ดาวจริง astronomy-engine ~ms) · isPersonal:false (event-based)
```
⚠️ lat/lng: datepick fix Bangkok (landmine เดิม) → V1 ใช้ 13.75/100.5 · เพิ่มเลือกสถานที่ทีหลัง

## ลำดับทำ (ตอน engine A2/A5 เสร็จ)
1. backup datepick.html + luck-engine/* 2. จุด 1-3 (engine·ไฟล์ใหม่) → test 3. จุด 4 (route) → test off=เดิม 4. จุด 5-6 (UI) 5. 200 user sim (off=คะแนนเดิม · on=มีคะแนน) 6. พ่อ review 7. 5 ลายเซน 8. deploy
