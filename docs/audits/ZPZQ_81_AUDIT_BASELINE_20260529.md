# ZPZQ 81 Mingli Audit Baseline

Date: 2026-05-29

## Scope

ก้อนนี้เป็น audit-only. ไม่แตะ runtime, stream, prompt, persona, chart packet live, หรือ AI Sifu behavior.

เป้าหมายคือใช้ 81 命例 จาก `data/library/sifu-extra/zpzq-mingli-golden.json` ตรวจว่า engine ปัจจุบันยังไม่หลุดจาก guard สำคัญ ก่อนเริ่มทำ resolver ก้อนเสี่ยงกว่า เช่น `hechongResolver` และ `mukuState`.

Expected oracle ที่ audit runner ใช้ถูกแยกไว้ที่ `data/library/sifu-extra/zpzq-mingli-expected-v1.json` เพื่อให้เพิ่ม human-reviewed labels ได้โดยไม่แตะ engine.

## Result

- total: 81
- xiangShen coverage: 62/81 (77%)
- null/special/fallback: 19/81 (23%)
- text polarity: positive=17, negative=1, mixed=6, unlabeled=57
- strict heuristic alignment: PASS=12, FAIL=0, REVIEW=69
- guard oracle v1: PASS=81/81, FAIL=0

## What This Means

ผลนี้ดีสำหรับ baseline: ไม่มีเคส guard fail และไม่มี strict heuristic fail.

แต่ยังห้ามเคลมว่า "engine ตรงตำรา 81/81" เพราะ corpus ส่วนใหญ่ยังเป็น raw ctext/commentary ไม่ใช่ expected verdict ที่ human label แล้ว. เคส `REVIEW=69` ต้องให้คนอ่านตำรา label ก่อนว่าแต่ละดวงควรคาดหวังอะไร เช่น 成格, 破格, 救應, special/fallback, หรือ resolver-specific phrase.

## Review Buckets

| Bucket | Count |
|---|---:|
| SPECIAL_NOT_XIANGSHEN | 19 |
| 祿劫用財須帶食傷化劫生財 (ZPZQ-5.2-07) | 9 |
| 比劫奪財 -> 食化劫/官制劫 | 5 |
| 食制殺 | 5 |
| 食神生財 | 3 |
| 傷官生財 | 2 |
| 官印雙全 | 2 |
| 官透 + 財/印 + 無傷官 | 2 |
| 財帶七殺 -> 合煞存財 (ZPZQ-5.2-02) | 2 |
| 財破印 -> 比劫制財 | 2 |
| 透官逢財印/透財逢食傷 | 2 |
| 金水傷官 · 允許見官 (例外) | 2 |
| 食帶煞制殺 | 2 |

## Safe Next Steps

1. ทำ expected-label overlay แยกไฟล์สำหรับ 69 REVIEW cases โดยยังไม่แก้ engine.
2. แยก 19 special/fallback cases ให้ชัด: 從/化/專旺, 雜氣, fallback geju, normal 8格.
3. แปลงเฉพาะเคสที่ human-reviewed แล้วเป็น hard regression tests.
4. งาน resolver ถัดไปต้อง wire แบบ evidence-only ก่อน ห้ามเอาไปบังคับ AI Sifu.

## Command

```bash
node --experimental-strip-types --loader ./scripts/ts-loader.mjs scripts/audit-zpzq-81.mjs
```

Outputs are written to:

- `/tmp/hourkey-audit/zpzq-81-audit.json`
- `/tmp/hourkey-audit/zpzq-81-audit.tsv`
- `/tmp/hourkey-audit/zpzq-81-audit.md`
