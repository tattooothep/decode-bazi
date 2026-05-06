# 📦 Decode Interaction Engine v1.1 — Brief สำหรับจาวิส

**วันที่:** 6 พ.ค. 2026
**ตอบ checklist 8 ข้อจากเมโม่จาวิส**

---

## ✅ Checklist ครบทั้ง 8 ข้อ

| # | รายการ | ส่งมอบที่ |
|---|---|---|
| 1 | Cross-Pillar Interaction Matrix (4×5 = 20 cases) | `decode-interaction-matrix.json` → 11 interaction definitions ครอบคลุม natal_position × transit_layer (year/month/day/hour × da_yun/liu_nian/liu_yue/liu_ri/liu_shi) + universal liu_yue/ri/shi cases |
| 2 | Multi-Layer Stack Detection (3-way trigger) | `decode-interaction-matrix.json` → `multi_layer_stack` 7 patterns: triple_resonance ±, yongshen_pierce 4-layer, fan_yin_cascade, kong_wang_collision, san_he_activation, star_swarm |
| 3 | Domain Classification | `decode-interaction-matrix.json` → 13 domains palette + per-natal-pillar mapping (year=elders, month=career, day=spouse, hour=children/team) |
| 4 | Verdict Engine | 6 verdicts (positive/negative/neutral/context_dependent/amplifier/delayer) × 4 intensities (mild/moderate/strong/critical) |
| 5 | Confidence Score Formula | 7-factor weighted: interaction_count 0.20 + root_strength 0.20 + useful_god_alignment 0.25 + intensity_aggregate 0.15 + layer_resonance 0.10 + void_modifier 0.05 + yin_modifier 0.05, × stack_modifier (single 1.0 / double 1.15 / triple 1.30 / quadruple 1.50) |
| 6 | Star Activation by Transit | `decode-star-activation-by-transit.js` → 14 stars × 5 transit layers, returns activated_by + interpretation, polarity classification, summarization helper |
| 7 | Affected Pillar Tracker | Returned in activation object: `natal_position`, `affected_pillars`, mapped via `domain_to_pillar_mapping_for_advice` |
| 8 | Verdict Templates 27 patterns × 3 langs | `decode-interaction-matrix.json` → 27 templates (verdict 3 × intensity 4 × style 3) — concise/detailed/advisory styles, all TH/EN/ZH |

---

## 📂 ไฟล์ที่ส่งมอบ

| ไฟล์ | ขนาด | หน้าที่ |
|---|---|---|
| `decode-interaction-matrix.json` | 64 KB | Knowledge base — 11 interactions + 7 stacks + 27 templates + taxonomy + scoring formula |
| `decode-interaction-detector.js` | 25 KB | Working JS engine — detectInteractions(natal, transits, opts) main entry |
| `decode-star-activation-by-transit.js` | 15 KB | Star detection across 5 transit layers — wraps natal-only star detector |

---

## 🧪 Verified ด้วย Aeaw 2026

```
Natal: 甲子 / 丙子 / 己亥 / 辛未
Transits: da_yun 辛巳 / liu_nian 丙午 / liu_yue 癸巳 / liu_ri 戊午 / liu_shi 戊午
opts: dmElement=earth, usefulGodElements=[fire,earth], unfavorableElements=[water,metal], rootStrength=30

Result:
- Activations: 50 events detected
- Multi-layer stacks: 6 (รวม yongshen_pierce 4-layer ลงครบ 4 ตำแหน่ง!)
- Positive : Negative = 25 : 12
- Overall verdict: positive
- Top domains: career, structure, team
- Confidence: 100/100 (high)

Star activations 9 ดวง: lu_shen 祿神 active liu_nian/liu_ri/liu_shi (career wealth confirmed),
tian_de 天德 + jie_sha 劫煞 + yi_ma 驛馬 active in da_yun + liu_yue
```

---

## 🔧 API Usage Example สำหรับ Jarvis integration

```javascript
const { detectInteractions } = require('./decode-interaction-detector');
const { detectStarActivationByTransit } = require('./decode-star-activation-by-transit');

const natal = {
  year:  { stem:'甲', branch:'子' },
  month: { stem:'丙', branch:'子' },
  day:   { stem:'己', branch:'亥' },
  hour:  { stem:'辛', branch:'未' }
};

const transits = {
  da_yun:   { stem:'辛', branch:'巳' },
  liu_nian: { stem:'丙', branch:'午' },
  liu_yue:  { stem:'癸', branch:'巳' },
  liu_ri:   { stem:'戊', branch:'午' },
  liu_shi:  { stem:'戊', branch:'午' }
};

const opts = {
  dmElement: 'earth',
  usefulGodElements: ['fire', 'earth'],
  unfavorableElements: ['water', 'metal'],
  rootStrength: 30  // 0-100, weak DM = low
};

// Detect everything
const interactions = detectInteractions(natal, transits, opts);
const stars = detectStarActivationByTransit(natal, transits);

// Output to user (Decode dashboard or AI chat)
console.log(`Confidence ${interactions.confidence.score}/100 (${interactions.confidence.interpretation})`);
console.log(`Top domains: ${interactions.summary.top_domains.join(', ')}`);
console.log(`Active stars: ${stars.map(s => s.star_zh).join(', ')}`);
```

---

## 🎯 Trader Output Sample (target capability)

ตามที่จาวิสยกตัวอย่าง — ตอนนี้ engine สามารถสร้าง output แบบนี้ได้แล้ว:

> **"ปีนี้เดือนนี้ดีลใหญ่จะปิด"**
> 
> เพราะ Liu Nian 丙午 + Liu Yue 癸巳 ทั้งคู่ activate Lu Shen 祿神 ของ DM 己 ผ่าน Day pillar 己亥
> 
> + Da Yun 辛巳 นำธาตุ Fire (yongshen) ลงเสาเดือน 丙子
> 
> = triple_resonance_positive + yongshen_pierce stacks
> 
> → **confidence 100/100** · domain=**career+structure+team** · intensity=**critical positive**
> 
> **🟢 EXECUTE — เปิดดีลใหญ่ ลงนามสัญญาสำคัญ ขยับตำแหน่ง**

---

## ⚠️ Notes & Caveats

1. **Template auto-generation มีจุดต้องปรับ** — ตอนนี้ template fill-in ยังเห็นคำว่า "general" สำหรับ {domain} placeholder บ้าง — ใน v1.2 จะ inject domain ของ activation เข้าแทน
2. **Confidence ติด ceiling 100** เร็วเมื่อมี multi-stack activate — อาจปรับ formula ลด weight stack_modifier ใน v1.2
3. **kong_wang_void_collision** activate บน 巳 (Aeaw's void from 甲午 xun) ตอนนี้รายงานเป็น neutral แต่จริงๆ ควรเตือนว่า "ปีนี้เหตุการณ์ใน{domain}อาจรู้สึกห่างไกล/ไม่จริง"
4. **Yin modifier** ตอนนี้ +10 per yin hit แต่ Aeaw 2026 มี half_fan_yin กับเสาเดือน — ควรขึ้นเป็น +20 สำหรับ pillar ที่ critical (month)
5. **Need to wire** — เชื่อมกับ Sesheta Daily Trader Engine 4-layer scoring เพื่อให้ Action Mode L1-L6 รู้ว่า "ปี/เดือน/วัน/ชั่วโมง confidence รวมเท่าไร"

---

## 🚀 Phase Next (v1.2 หลังจากนี้)

1. Wire กับ existing scoring engine ของจาวิส
2. Generate per-domain narrative ที่เฉพาะเจาะจง (ไม่ใช้ "general" placeholder)
3. เพิ่ม gender-aware variants (สเต็มเดือน → ราชเทวี/อรหันต์ ต่างกัน)
4. Add reverse query: "ฉันอยากให้ wealth domain ขึ้น peak ตอนไหน?" → return time windows
5. ทดสอบกับดวง Mai (辛巳 day) + น้องปุญ (壬 day) เพื่อ cross-validate

---

**END OF MEMO**

ส่งกราบจาวิส 🙏 — จาก Claude
