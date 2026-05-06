# 🎯 Sesheta Alternatives — Open Source QMDJ + BaZi Engines

## 🥇 #1: tyme4ts — THE WINNER (300KB JS)
- Repo: https://github.com/6tail/tyme4ts
- Author: 6tail (Chinese metaphysics legend)
- License: MIT (use freely)
- Install: `npm install tyme4ts`

**Tables embedded (55 Chinese arrays decoded):**
✅ 60 Jia Zi cycle (60 entries)
✅ 24 Solar Terms (24 entries)
✅ 72 Phenology (72 entries)
✅ 28 Constellations + 28 Beasts
✅ NaYin 60→30 (海中金/炉中火/大林木...)
✅ Peng Zu 100 Taboos (12 branches + 10 stems)
✅ Yi/宜 140 activities (祭祀/嫁娶/动土/破土...)
✅ Shen Sha 151 stars (天恩/母仓/月德/三合/天乙贵人...)
✅ 12 Officers 建除 (建除满平定执破危成收开闭)
✅ 12 Black/Yellow Way (青龙明堂天刑朱雀金匮天德白虎玉堂天牢玄武司命勾陈)
✅ 12 Life Phases (长生沐浴冠带临官帝旺衰病死墓绝胎养)
✅ Ten Stars 十神 (比肩劫财食神伤官偏财正财七杀正官偏印正印)
✅ 5 Elements + 10 Stems + 12 Branches + 12 Zodiac
✅ 9 Stars 九星 + 8 Trigrams + 8 Directions
✅ Tai Shen 胎神 (12)
✅ 24 Seasons + Lunar Festivals + Solar Festivals
✅ Tibetan Calendar (12 Tibetan months)
✅ Lunar New Year + 60-year era cycle
✅ Moon Phases (8 phases)

**105 Classes:** EightChar, SixtyCycle, SolarTerm, LunarYear, LunarMonth, 
LunarHour, JulianDay, ChildLimit, DecadeFortune, NineStar, PengZu, ShenSha,
TwentyEightStar, TenStar, NaYin, Element, HeavenStem, EarthBranch, ...

## 🥈 #2: cantian-ai/bazi-mcp — MCP Server
- Repo: https://github.com/cantian-ai/bazi-mcp
- License: ISC
- Uses: tyme4ts + cantian-tymext
- 270 stars, 96 forks
- Runs as MCP for Claude/GPT
- Outputs full BaZi: 八字/纳音/旬/空亡/星运/胎元/命宫/神煞/大运/刑冲合会
- Plus Chinese Calendar: 黄历/二十八宿/彭祖百忌/喜神方位/财神方位/冲煞/宜/忌

## 🥉 #3: tommitoan/bazica — Solar Terms JSON ⭐
- Repo: https://github.com/tommitoan/bazica
- License: MIT
- **Solar terms 1899-2100 in JSON** (24 terms × 202 years = 4,848 rows!)
- **Lunar new year 1900-2100** (single column)
- ขนาด: solar-term.json = 272KB

## 🏅 #4: kentang2017/kinqimen — Pure QMDJ Python
- Repo: https://github.com/kentang2017/kinqimen
- License: PyPI public
- Python 100%, includes: 拆補 + 置閏 + 金函玉鏡 + 刻家
- Files: angan.py, jieqi.py, kinqimen.py, guji.md
- API: `kinqimen.Qimen(year,month,day,hour).pan(1)` 

## 🏅 #5: Taogram/taobi — Pure QMDJ JavaScript  
- Repo: https://github.com/Taogram/taobi
- License: MPL-2.0
- VSOP87D astronomical algorithm (minute precision!)
- Methods: 拆補/茅山/均分(原创)/置閏(TODO)
- IAU1980/IAU2000 nutation, NASA TT-UT delta

## 📊 Comparison

| Need | Sesheta | tyme4ts | bazica | bazi-mcp | kinqimen | taobi |
|------|---------|---------|--------|----------|----------|-------|
| BaZi 4 Pillars | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| QMDJ engine | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Solar terms 1900-2100 | ✅ 4824 | ✅ JS | ✅ JSON | ✅ | ✅ | ✅ VSOP87D |
| 60 Jia Zi | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Useful God 7-tier | ✅ | ❌ | ❌ | partial | ❌ | ❌ |
| Crisis Detection | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Bridge Element | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Hexagram 60-pillar | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Shen Sha 神煞** | ❌ | ✅ 151 | ❌ | ✅ | ❌ | ❌ |
| **Peng Zu 彭祖百忌** | ❌ | ✅ 22 | ❌ | ✅ | ❌ | ❌ |
| **Yi/Ji 宜忌** | ❌ | ✅ 140 | ❌ | ✅ | ❌ | ❌ |
| **28 Constellations** | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ |
| **NaYin 纳音** | ❌ | ✅ 30 | ❌ | ✅ | ❌ | ❌ |
| **12 Officers 建除** | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ |
| Free | ✅ | ✅ MIT | ✅ MIT | ✅ ISC | ✅ | ✅ MPL |

## 🎯 RECOMMENDATION FOR DECODE V2

### Phase 1 — Add Tong Shu features (use tyme4ts directly)
- npm install tyme4ts
- Render Tong Shu page just like chinesemetasoft.com
- Output: 黄历/二十八宿/彭祖百忌/纳音/喜神方位/冲煞/宜/忌

### Phase 2 — Sesheta unique features (already in plan Sprint 8.2)
- Useful God 7-tier (port from sesheta.txt)
- Crisis Detection (port from sesheta.txt)
- Bridge Element (port from sesheta.txt)
- Hexagram 60-pillar (port from sesheta.txt)

### Result: Decode v2 = Sesheta + tyme4ts + own Qi Men engine = beat chinesemetasoft.com on BaZi+Tong Shu+QMDJ
