# 🤖 Jarvis Decode Build Brief

**Recipient:** จาวิส (Jarvis / Claude Code on VPS 72.62.247.64)
**Sender:** Aeaw (via main Claude session)
**Date:** 2026-05-05
**Mission:** Build Decode v2 (Bloomberg Terminal) on top of existing Decode v1

---

## 🎯 Context (สิ่งที่จาวิสต้องรู้ก่อน)

We have **fully reverse-engineered Sesheta.app** (verbose JS engine ~870KB + full source code 433KB). All findings are now seeded as 35+ JSON files in `/data/decode-seeds/`. These are **structured, verified, and ready to consume** — no more decoding needed.

You already have Decode v1 running:
- `agent-architect.js` :3010
- `server.js` :3110
- `qimen-api` :3100/4090
- 244 tests passing
- Action Mode L1-L6 working

**Goal:** Layer Sesheta's BaZi engine on top, plus Decode-exclusive features (Six Destructions, Na Yin, True Solar Time, 25 Archetypes).

---

## 📦 Seed Files Available at `/data/decode-seeds/`

```
sesheta-12-phases-engine.json      (Decoded formula + multipliers)
sesheta-archetypes-25.json         (25 archetype × element variants)
sesheta-bazi-lookup-tables.json    (12 core tables)
sesheta-branches-dictionary.json   (12 branches all properties — NEW)
sesheta-crisis-detection.json      (Frozen/Damp/Scorched/Dry)
sesheta-daily-trader-engine.json   (4-layer scoring)
sesheta-database-schema.json       (Sesheta's 7 tables)
sesheta-element-cycles.json        (5-element + Ten Gods)
sesheta-i18n-bilingual.json        (249 keys × TH+EN)
sesheta-jiazi-year-table.json      (181 years 1919-2100)
sesheta-key-talents.json           (23 talent sets)
sesheta-kongwang-60-table.json     (60 JiaZi → 6 Xuns voids)
sesheta-mindset-shifts.json        (24 quotable wisdom)
sesheta-na-yin-60.json             (Decode-exclusive)
sesheta-personal-stars.json        (14 stars × 4 pillars = 56)
sesheta-pillar-echo.json           (4 daily timing)
sesheta-reactions-9.json           (9 branch reactions + multipliers)
sesheta-scoring-engine.json        (12 phases × position × rooting)
sesheta-six-destructions.json      (Decode-exclusive — NEW)
sesheta-solar-bazi-engine.json     (Pillar calculation)
sesheta-solar-terms-200-years.json (1900-2100 sub-second)
sesheta-star-readings.json         (23 stars × 3 readings = 69)
sesheta-stem-combos.json           (10 stem combinations)
sesheta-strengths.json             (7 DM levels + metaphors)
sesheta-structures-16.json         (18 structures)
sesheta-ten-gods.json              (10 Ten Gods)
sesheta-useful-god-priority.json   (5 categories)
sesheta-useful-god-ranks.json      (5-rank per DM)
sesheta-zone-of-genius.json        (5 archetypes)
decode-postgresql-schema.sql       (Complete DDL — NEW)
aeaw-bazi-reading-complete.json    (Reference: full chart calculation)
```

---

## 🏗️ Build Plan (5 Phases)

### Phase 1: Database Foundation (1 day)
```bash
cd /var/www/decode
psql -U postgres -d decode_db -f /data/decode-seeds/decode-postgresql-schema.sql

# Seed reference tables from JSON files
node scripts/seed-reference-tables.js
```

**Validation:** All 12 ref_ tables populated. Run query:
```sql
SELECT COUNT(*) FROM ref_solar_terms WHERE year BETWEEN 1900 AND 2100;
-- Should return 4824 rows (200 years × 24 terms + buffer)
```

### Phase 2: Core BaZi Calculator (2 days)

Create `lib/bazi-calculator.js`:
```javascript
// Port Sesheta's verified algorithms:
// - c2(date)  → year pillar w/ 立春 boundary
// - Er(date)  → month pillar via solar terms + 五虎遁元
// - g2(date)  → day pillar (anchor 1900-01-01 = 甲戌)
// - Dr(date)  → hour pillar (no true solar correction in Sesheta — ADD THIS)
// - Re(stem,branch) → Kong Wang
// - e3(stem,branch) → 12 Phases formula
// - W3(pillars) → 9 branch reactions + multipliers
```

**Test with Aeaw's chart** (`aeaw-bazi-reading-complete.json`):
- Expected: 甲子 / 丙子 / 己亥 / 辛未
- Expected strength: 2.88 → Weak Day Master
- Expected useful god: Fire (SSS, Frozen Crisis)

### Phase 3: True Solar Time (Decode advantage)

Sesheta uses local clock time only. Add:
```javascript
function trueSolarTime(localTime, longitude) {
  // 1. Longitude correction
  const stdLon = 105;  // GMT+7 standard meridian
  const lonOffsetMin = (longitude - stdLon) * 4;  // 4 min per degree
  
  // 2. Equation of Time (sun's apparent vs mean motion)
  const dayOfYear = getDayOfYear(localTime);
  const B = (dayOfYear - 81) * 360 / 365 * Math.PI / 180;
  const eot = 9.87 * Math.sin(2*B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
  
  // 3. Apply both corrections
  return new Date(localTime.getTime() + (lonOffsetMin + eot) * 60 * 1000);
}
```

For Aeaw (Bangkok 100.5°E vs std 105°E): -22 min correction. Birth time 13:15 → 12:53 true solar.

### Phase 4: Six Destructions Engine (Decode-exclusive)

```javascript
// /lib/six-destructions.js
const DESTRUCTIONS = require('/data/decode-seeds/decode-six-destructions.json');

function detectDestructions(pillars) {
  const branches = [
    pillars.year.branch, pillars.month.branch,
    pillars.day.branch, pillars.hour?.branch
  ].filter(Boolean);
  
  return DESTRUCTIONS.destruction_pairs.filter(pair => 
    branches.includes(pair.branches[0]) && branches.includes(pair.branches[1])
  );
}

// Apply AFTER 9 reactions to avoid double-counting locked branches
```

### Phase 5: Daily Trader API

```
POST /api/daily-reading
Body: { user_id, date }

Response: {
  personal_resonance: 'harmony_plus',
  elemental_alignment: 'favorable',
  day_officer: 'auspicious',
  tier_rank: 3,
  action_mode: 'L1_strong_execute',
  score: 87,
  hard_veto: false,
  pillar_echoes: [{pillar: 'day', message: '...'}],
  destructions_active: [],
  recommendations: {
    headline_th: '...',
    do_activities: [...],
    avoid_activities: [...],
    lucky_hours: [...]
  }
}
```

---

## ⚠️ Critical Safeguards (จาวิสต้องระวัง)

1. **NEVER modify production code without backup first**
   ```bash
   cp -r /var/www/decode/lib /var/www/backups/lib-$(date +%Y%m%d-%H%M%S)
   ```

2. **Sesheta's 9 reactions priority order is FIXED:**
   - sanHui (5) > sanHe (4) > liuHe (3) > banSanHe (2) > clash (1) > punishment (1)
   - Higher priority blocks lower
   - Do NOT change this — verified against Sesheta's vendor-bazi-engine.js

3. **Multipliers are EXACT:**
   - Phase: 帝旺 1.5, 臨官 1.4, 長生 1.3, 冠帶 1.2, 沐浴 1.1, 衰 0.9, 病 0.8, 死 0.7, 墓 0.6, 絕 0.5, 胎 0.6, 養 0.7
   - Position: month 1.6 > day 1.0 > hour 0.9 > year 0.8
   - Rooting: 0/1=1.0, 2=0.6, 3+=0.25
   
4. **Aeaw's chart is the canonical test case** — every calculation must produce identical output to `aeaw-bazi-reading-complete.json`

5. **Don't replace Action Mode L1-L6** — that's Decode's signature feature. Layer Sesheta's resonance/alignment as INPUT to Action Mode score, not replacement.

---

## 📊 Test Plan

### Unit tests (extend existing 244)
```bash
npm test -- --grep "bazi-calculator"
npm test -- --grep "six-destructions"
npm test -- --grep "true-solar-time"
```

### Integration: Aeaw verification
```bash
node scripts/verify-aeaw-chart.js
# Should output: ✓ All 47 assertions passed
```

### Performance: 
```bash
ab -n 1000 -c 10 http://localhost:3110/api/daily-reading
# Target: p95 < 200ms (chart cached after first calc)
```

---

## 🚀 Deployment Sequence

```bash
# 1. Pull latest seeds
rsync -avz aeaw@local:/data/decode-seeds/ /var/www/decode/data/seeds/

# 2. Run schema migration
psql -d decode_db -f /var/www/decode/data/seeds/decode-postgresql-schema.sql

# 3. Seed ref tables
node /var/www/decode/scripts/seed-reference-tables.js

# 4. Restart services in order
pm2 restart bazi-engine
pm2 restart server
pm2 restart agent-architect

# 5. Smoke test
curl http://localhost:3110/api/health
curl -X POST http://localhost:3110/api/chart \
  -H "Content-Type: application/json" \
  -d '{"birth_date":"1984-12-31","birth_time":"13:15","timezone":"Asia/Bangkok"}'
```

---

## 💬 Communication Protocol

- All Jarvis responses to Aeaw: **Thai language**
- Code comments: English (for maintainability)
- Commit messages: English with Thai brief
- Error logs: Both languages

---

## 🎯 Success Criteria

- [x] All 12 ref_ tables populated and queryable
- [x] Aeaw's chart computes identical to canonical reading
- [x] True Solar Time applied (Sesheta missing this)
- [x] Six Destructions detected and reported
- [x] Action Mode L1-L6 still works as primary output
- [x] Daily reading API returns < 200ms p95
- [x] All 244 existing tests still pass + 50 new tests added

---

**End of Brief. Ready for Jarvis to begin Phase 1.**
