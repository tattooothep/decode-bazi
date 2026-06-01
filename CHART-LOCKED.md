# 🔒 /chart + /today + /calendar + /yongsennetwork Suite · LOCKED

**Locked date:** 14-15 พ.ค. 2026 (chart + today + calendar + network)
**Voytek match:** ~95% (4 บั๊กแก้แล้ว + 62 ดาว + ดวงพิเศษ + AI ซินแส)
**Reason:** ลงทุนเวลา debug + tune หลายชั่วโมง · ห้ามเสียของ · ตำราอากง 95 ปี verify

---

## 🆕 Token economy 時 + /account + Tier system · LOCKED 15 พ.ค. 2026 (เที่ยงคืนใหม่)

### Files locked
| File | Role |
|---|---|
| `users` table | +tier (free/premium/master) +hour_balance +sub_expires_at |
| `hour_transactions` table | ledger ของ時 spend/purchase |
| `src/lib/spend-hours.ts` | helper · ตรวจ balance + deduct + log |
| `src/app/api/account/me/route.ts` | GET tier+balance+sub status |
| `src/app/api/account/spend/route.ts` | POST deduct 時 |
| `src/app/api/account/history/route.ts` | GET 50 transactions |
| `src/app/api/account/mock-purchase/route.ts` | POST simulate buy (phase 1 mock) |
| `src/app/api/qimen/sifu/route.ts` | +spend 8 時 ก่อน Claude call |
| `src/app/api/network/sifu/route.ts` | +spend 5/15 時 (pair/team) |
| `public/account.html` | 350+ บรรทัด · tier card + packages + history |
| `public/js/hk-user-menu.js?v=14` | + tier badge + 時 balance + link to /account |

### Pricing tier (mock · phase 1)
- **Free** · 新人 · 10 時 starter
- **Premium 1 ปี** · 賢者 · ฿599 + 120 時 + 365 days
- **Master 1 ปี** · 大師 · ฿5,990 + 1,200 時 + 365 days
- Top-up: 100 時 ฿99 · 550 時 ฿449 (+50 boost) · 1700 時 ฿1290 (+200 boost)

### AI cost ต่อ call
- /qimen/sifu = **8 時**
- /network/sifu pair = **5 時**
- /network/sifu team = **15 時**
- 402 Payment Required ถ้า balance ไม่พอ

### Hard rules
❌ ห้ามแก้ tier column ใน users table โดยไม่ migrate
❌ ห้ามลบ hour_transactions ledger (audit trail)
❌ ห้ามลด spend cost ต่อ feature โดยไม่อนุมัติ
❌ ห้ามให้ AI endpoint ทำงานโดยไม่ผ่าน spendHours()
❌ ห้ามแก้ Pricing โดยไม่ confirm

### Phase 2 (รอ Stripe key + product setup)
- เปลี่ยน /mock-purchase → /stripe/checkout + webhook
- subscription auto-renew

---

## 🆕 100 ปี Timeline + 64 卦 + /datepick + ProfessBazi parity · LOCKED 15 พ.ค. 2026 (ใกล้เที่ยงคืน)

### Files locked
| File | Role |
|---|---|
| `src/lib/year-hexagram.ts` | 64 卦 + 8 trigrams + Mei Hua Yi Shu mapping + Unicode symbol U+4DC0-4DFF |
| `src/lib/chart-extensions.ts` | 流年 span **10→100 ปี** · LiuNianEntry + `age` + `hex.symbol` |
| `src/app/api/today/route.ts` | + `hex` field (64卦 ของวันนั้น) |
| `src/app/api/qimen/search/route.ts` | proxy + 8 activities + 12 ชั่วยาม × 7 วัน scan + batch 6 concurrent |
| `public/chart.html` | §11 timeline 100 ปี · scrollable max-h 520px · สีธาตุตาม stem · ขีดๆ ขาว |
| `public/today.html` | 易經 box · ขีดๆ 96px · zh/th/en + 上下卦 + 動爻 |
| `public/datepick.html` | wire real `/api/qimen/search` · 8 activities · ranked card · AI Sifu chat · avatar mount |
| `public/fengshui.html` | avatar mount + scripts (เตรียม responsive) |

### 流年 100 ปี (chart §11)
- เพิ่ม `age` per year · cur badge ทอง
- 64 卦 hexagram ต่อปี (Mei Hua Yi Shu: stem_idx + branch_idx → upper/lower trigram → hex 1-64)
- Unicode symbol ䷀-䷿ (U+4DC0 base + num-1)
- สีธาตุ: 甲乙=wood · 丙丁=fire · 戊己=earth · 庚辛=metal · 壬癸=water (data-el attribute)
- ขีดๆ สีขาว (dark theme) / สีดำ (light theme) + glow

### /today hex
- API: `td.hex = { num, zh, th, en, symbol, upper_zh/th, lower_zh/th, changing_line }`
- UI: ขีดๆ 96px ซ้าย + zh/th/en + 上下卦 + 動爻 ขวา · auto-insert ใต้ section แรก

### /datepick
- API: `/api/qimen/search` (proxy → qimen-api find-best-times)
- 8 activity mapping (UI → API): break-ground→work_start · sign-contract→decision · move-in→travel · open-shop→wealth · travel→travel · negotiate→negotiate · invest→wealth · wedding→love
- UI: real funnel · top 12 ranked card · match tags · 5 ภาษา column (date/time/門/星/神/局)
- AI Sifu: เลือก top 3 · เหตุผลตำรา · ใช้ user yongshen_v2 + search_results

### Hard rules (รอบนี้)
❌ ห้ามลด 流年 span < 100 ปี
❌ ห้ามลบ `hex` field ใน LiuNianEntry / today response
❌ ห้ามลบ data-el attribute (สีธาตุ)
❌ ห้ามแก้ Unicode symbol mapping (U+4DC0 base)
❌ ห้ามลบ AI Sifu button ใน /datepick
❌ ห้ามใช้ mock data แทน real API ใน /datepick

---

## 🆕 /qimen Suite · LOCKED 15 พ.ค. 2026 (ดึกๆ)

### Files locked
| File | Role |
|---|---|
| `src/app/api/qimen/route.ts` | proxy POST `/api/qimen/calculate` · datetime/lng/lat/school · school→profile_id (zhirun=4·chaibu=1·yinpan=5) |
| `src/app/api/qimen/sifu/route.ts` | AI Sifu ฉีเหมิน · 6 topics + chat + history |
| `public/qimen.html` | 9 palaces + yongshen overlay + AI sifu + time picker + responsive |
| `public/favicon.svg` | hourkey 鑰 logo · 100×100 |

### Engine wire (15 พ.ค.)
- school toggle 4 ปุ่ม (zhirun/chaibu/yinpan/**maoshan disabled**)
- time picker live: year (6) · month (12) · day (28-31 auto) · hour (12 ชั่วยาม) · default current
- chart-meta wired: 局/dun_gan/直符/直使/旬/空 จาก API
- stats card wired: 局 · 遁干 · 元
- yuanju header wired

### 中宮 (palace 5) ตำราคลาสสิก
- ❌ ห้ามแสดง 八門 (door)
- ❌ ห้ามแสดง 八神 (deity)
- ✅ แสดง 天禽星 + ป้าย "寄宮 · จี้กง"
- ตำราอ้าง: 煙波釣叟賦 "八門·八神 居八方; 中宮無門無神, 天禽寄坤宮"

### Yongshen overlay (ดวงผู้ใช้)
- ✦ 用神 (primary) · ◇ 喜神 · ⛔ 忌神 · badge บน palace ตามธาตุ
- "ทิศแนะนำ" / "ทิศระวัง" panel ใต้ palace grid

### AI Sifu ฉีเหมิน
- 6 topics: overview · direction · action · timing · formation · search_advice
- payload: { qimen (chart+palaces+formations), user_yongshen_v2, search_results? }
- history 6 turns · Claude Max CLI · timeout 60s

### Mobile responsive (15 พ.ค. ดึกๆ)
- @media (max-width:768px) + (max-width:480px) ท้าย style · isolation
- topbar: flex-wrap + logo order 1 + top-r order 2 + margin-left:auto (avatar ขวาเสมอ)
- q10x palace: font ลด · 480px ซ่อน TH label
- time-grid: 2 col mobile · stack 1 col 480px
- school-toggle: 2×2 mobile · 1 col 480px
- ❌ ห้ามแก้ base CSS · เพิ่ม override ใน @media เท่านั้น

### Hard rules /qimen
❌ ห้ามแสดง door/deity ใน palace 5 (中宮)
❌ ห้ามลบ 寄宮 label ใน palace 5
❌ ห้ามเปลี่ยน SCHOOL_TO_PROFILE mapping
❌ ห้ามเปิดปุ่ม maoshan ก่อน engine implement
❌ ห้าม revert hardcode (陽八局/甲申旬/forecast paragraph 7 พ.ค.)
❌ ห้ามแก้ base CSS responsive · ต้องใช้ @media block

---

## 🆕 AI Sifu + scoring-explain v2 · LOCKED 15 พ.ค. 2026 (ดึก)

### Files locked (รอบดึก)
| File | Role |
|---|---|
| `src/app/api/network/sifu/route.ts` | AI Sifu pair/team analysis · Claude Max CLI · 2 mode · 6+6 topics |
| `public/yongsennetwork.html` | + 💬 ซินแส AI · pair chat panel + Team Modal + 5 group filter + scoring-explain ขยายเป็น 7 ชั้น 15 ปรับ |

### Endpoint contract `/api/network/sifu`
```
POST { mode: 'pair'|'team', message, history[], lang, topic, payload }
  payload (pair): { self, other, scores, tags, yongshen_v2 }
  payload (team): { self, members[≤30], yongshen_v2_map }
→ { reply, mode, model: 'claude-max-cli' }
```

### Hard rules (รอบดึก)
❌ ห้ามแก้ system prompt ของ buildPairPrompt / buildTeamPrompt
❌ ห้ามลบ 6 topics ใน pair chat (overview/work/love/friend/family/business)
❌ ห้ามลบ 6 topics ใน team (overview/strength/allies/watch/element/advice)
❌ ห้ามลบ 5 group filter (all/family/friend/work/love)
❌ ห้ามลด history น้อยกว่า 6 turns
❌ ห้ามลบ scoring-explain 7 มิติ + 15 rules + AI section + Engine version note

### Engine version: phase3.6-structure-resonance · ใน CHART-LOCKED ทุก subsection

---

## 🆕 wrapper-7 · Yongshen v2 · LOCKED 15 พ.ค. 2026 (ค่ำ)

### Files locked (เพิ่มในวันนี้)
| File | Role |
|---|---|
| `data/library/wrappers/7-yongshen-v2.js` | Phase 6.1-6.7 · 45/45 test pass · Root + BingYao + TongGuan + Sentimental + Synthesizer + Flipping + Self-Refutation |
| `data/library/wrappers/3-ge-ju.js` | + 假從格 (P1) + 雜氣格 (P2) + 專旺格 5 sub (P3) + 從強/從旺 (P4) + 魁罡格 (P5) |
| `data/library/wrappers/follow-detector.js` | TiaoHou regulator → downgrade true→fake follow |
| `src/app/api/network/score/route.ts` | + yongshen_v2 + structure resonance · version `phase3.6-structure-resonance` |
| `src/app/api/chart/route.ts` | + yongshen_v2 ใน response (additive · ไม่กระทบ Voytek anchors) |
| `public/yongsennetwork.html` | §06b YONGSHEN v2 ใน chart modal · per-person cache |
| `public/chart.html` | §06b YONGSHEN v2 section · ลบ yong-card เดิม (mechanical) · el-grid 1 column |

### Engine v2 · 7 Layer (synthesizeYongshen)
1. **Real Rooting** — 本氣/中氣/餘氣 weights 1.0/0.5/0.25 · contested by 沖/刑/害/破 · self_xing
2. **BingYao** — 8 โรค: cold_excess_wealth · hot_drought · output_glory_wealth_starvation · companion_swarm · killer_pressure_no_resource · resource_overflow_smothering · wealth_drowning_dm_weak · dry_resource_burned
3. **TongGuan** — สะพาน 5 pair (wood-earth · earth-water · water-fire · fire-metal · metal-wood) + 殺印相生
4. **Sentimental** — progressive (正官·正財·正印·食神·偏財) vs regressive (七殺·傷官·劫財·比肩·偏印)
5. **Synthesizer** — รวม Fuyi+TiaoHou+BingYao+TongGuan → primary + xishen + jishen + tiaohou + diseases + medicine + bridges + strategy + confidence + explain_log
6. **Structure Flipping by 大運** — ดวงพิเศษพลิกเมื่อ LP เข้า root/resource
7. **Self-Refutation** — reject special ถ้า evidence count ≥ 2

### Structure Resonance · 5 tag ใน pair scoring (v3.6)
- 結構共鳴 +5 (same structure_label)
- 同用神 +4 (a.primary ∩ b.primary)
- B·助A用神 +5 (a.primary ∩ b.xishen)
- B·剋A用神 -6 (a.primary ∩ b.jishen)
- A·剋B用神 -4 (b.primary ∩ a.jishen · asymmetric)

### Aeaw v2 expected (golden · research item 10)
```
structure_label    = "假從財格"
engine_type        = "WEAK_DM_WATER_HEAVY"
use_follow_override = false
primary_yongshen   = ["fire"]
xishen             = ["earth"]   ← warm_earth (ของเดิมจัด earth ⛔ ผิด · v2 ตรงตำรา)
jishen             = ["water","metal"]
tiaohou_required   = "fire" · weight 1.0
diseases           = ["cold_excess_wealth_pressure"]
medicine           = ["fire","warm_earth"]
confidence         = "high"
```

### Hard rules · wrapper-7 + Yongshen v2
❌ ห้ามแก้ wrapper-7 7 layer logic โดยไม่ verify Aeaw golden
❌ ห้าม revert §06b → yong-card เดิม (earth ⛔ ผิดตำรา)
❌ ห้ามเปลี่ยน QI_WEIGHT (main 1.0 / middle 0.5 / residual 0.25)
❌ ห้ามลบ structure resonance 5 tag ใน TAG_WEIGHT
❌ ห้ามลบ yongshen_v2 ใน /api/chart + /api/network/score response
❌ ห้ามลบ §06b YONGSHEN v2 section ใน chart.html + yongsennetwork.html

### Test guard
- `node data/library/wrappers/7-yongshen-v2.js` → 45/45 pass
- `node data/library/wrappers/3-ge-ju.js` → 13/13 pass (10 special structures)
- `node scripts/test-bazi-calc.cjs` → 2/2 golden Aeaw/Mai

---

## 🔗 /yongsennetwork · เพิ่ม Lock 15 พ.ค. 2026

### Files locked
| File | Role |
|---|---|
| `public/yongsennetwork.html` | Solar/Grid/Team views · scoring explain · 3 lang · 2 theme |
| `src/app/api/network/score/route.ts` | **Engine 10 rules** · pair scoring + yongshen + 沖去忌神 + 合化 |
| `src/app/api/profile/[id]/route.ts` | DELETE soft (is_archived=true) |

### Engine · 5 Layers + 10 Rules ตำราคลาสสิก (อากง 95 ปี verify)
**5 Layers:**
1. 天干 (stem) — 合·沖
2. 地支 (branch) — 六合/六沖/六害/六破/刑/自刑
3. 三合 + **三會 (พลังฤดู +35)**
4. 五行生克 — 比/生/被生/克/被克
5. **用神/忌神** layer

**10 Rules:**
1. 三會 แรงกว่า 三合 · ใช้ก่อนเสมอ
2. 半三會 มีพลัง (2 ใน 3)
3. 合化用神 = keep full +
4. 合化เฉย = ×0.5
5. 合化忌神 = penalty
6. **沖去忌神** = flip clash to + with caution flag
7. **貪合忘剋** = suppress 克 if 天合
8. 忌神แรง = -18 if jishenInMonth + selfDmWeak
9. yongshen uncertain → cap +8
10. follow_structure → structure-specific yongshen

### Frontend Context (Wire จาก /api/chart)
- `selfDmWeak`: strength.percent < 40
- `selfStrengthUncertain`: 40-55
- `jishenInMonth`: monthBranchEl ∈ jishen
- `structureYongshen`: ถ้า geJu = 從/專 → override

### Key features (/yongsennetwork)
- 🌌 Solar / Grid / Team 3 views · 5 timeframes (day/week/month/year/luck)
- 🎯 用神/忌神 tag + score กรอง
- 🧹 Junk filter + DELETE API (auto-archive ขยะ profiles)
- 📜 Scoring explain block (ตำรา 5 ชั้น 10 ปรับ) ใต้ filter-bar
- 🌐 100+ data-i18n + 140 i18n keys · 3 ภาษา
- 🌗 Theme persist (localStorage hk-theme)
- 🛡 Migration v3 · ล้าง cache เก่าครั้งเดียว

### Hard rules /yongsennetwork
❌ ห้ามแก้ engine weights (W.*) โดยไม่ verify อากง
❌ ห้ามลบ 10 rules · ต้องคงตรรกะตำราคลาสสิก
❌ ห้าม implement engine โดยลด wrapper-6 yongshen
❌ ห้ามลบ compound_flags ใน response
❌ ห้ามลบ scoring explain block (สำคัญต่อ trust)
❌ ห้ามลบ 4 ส่วนเพิ่ม (Phase 1+4+5) · ในตำราเชิงลึก

### 📜 Phase 1+4+5 · ส่วนเพิ่ม (15 พ.ค. 2026)
- **Phase 1 · Four Pillars stem matching**: เทียบ year-year · month-month · hour-hour stem (ratio 0.6/0.7/0.6)
- **Phase 4 · Cross-pillar branch**: 六合·六沖·六害·六破 ระหว่าง same-pillar branches (ratio 0.5/0.6/0.5)
- **Phase 5 · Guidance 70%**: confidence dynamic + primary + context + intent ×3 + cautions + disclaimer
- **Engine version**: `phase3.4-guidance`

### Engine Response Shape (LOCKED)
```
{
  scores: { [id]: { day, week, month, year, luck, overall } },
  tags:   { [id]: [...] },
  compound_flags: { [id]: [...] },
  directional: { [id]: { atob, btoa } },
  breakdown:   { [id]: { atob: {bonus,penalty,base,events,...}, btoa: {...} } },
  labels:      { [id]: { th, en, zh } },          /* 7 ระดับ */
  guidance:    { [id]: {                          /* Phase 5 · ห้ามลบ */
    confidence, primary, context[], cautions[],
    intent: { work, love, friend } × 3 lang, disclaimer
  }},
  version: 'phase3.4-guidance'
}
```

---

## 📅 /calendar · เพิ่ม Lock 14 พ.ค. 2026

### Files locked
| File | Role |
|---|---|
| `public/calendar.html` | UI · grid 31 วัน + side panel + month nav · 3 ภาษา · 2 theme |
| `src/app/api/calendar/route.ts` | GET batch endpoint · 31 days + month_pillar_transitions + jieqi_list |

### Engine pipeline (3 Phases)
- **Phase 1** · `/api/calendar?year&month&birthDate&birthTime&birthLng` · ดึง 31 วัน batch
- **Phase 2** · lazy fetch `/api/today/hours` + `/api/today/directions` per day click
- **Phase 3** · 3 lang TH/EN/ZH + 2 theme + 41 i18n keys + 44 data-i18n

### Key features (ตำราจริง · ไม่ mock)
- 🐉 **月柱 transitions** · ตาม jieqi (五虎遁) · 壬辰 → 癸巳 หลัง立夏
- 🌅 **節氣 list** · 2-3 jieqi/เดือน · ครอบ 24 jieqi/ปี
- 💰 **6 เป้าหมาย** · ten god mapping ตำราคลาสสิก · 正財=wealth+18 ฯลฯ
- 🔥 **wrapper-6 yongshen** · score base · Fix A/B/E
- 🌟 **62 神煞** · classify good/bad จาก tyme4ts getGods()
- 🟢 **14 swatch สี** ตรงธาตุย่งเสิน
- ⏰ **六沖/六害** ในชั่วยาม side panel
- 🌗 **Neutral hours** จางลง · opacity 0.55 (อากงเตือน UX)

### Hard rules /calendar
❌ ห้ามใช้ wrapper-4 ใน score (ต้อง wrapper-6 yongshenFinal)
❌ ห้ามแสดง month_pillar เดียวต่อเดือน · ต้องใช้ transitions
❌ ห้ามแต่งสูตรเป้าหมายใหม่ · ใช้ GOAL_BOOST ตำรา 10 ten gods
❌ ห้ามใช้ STARS/YI_JI mock dict · ใช้ tyme4ts gods() / yi() / ji()
❌ ห้ามเปลี่ยน 五虎遁 mapping · ห้ามเปลี่ยน 六沖/六害 dict
❌ ห้ามเปลี่ยน i18n key naming convention (`cal.*`)

---

## 🌅 /today · เพิ่ม Lock 14 พ.ค. 2026

### Files locked
| File | Role |
|---|---|
| `public/today.html` | 11 sections · DAY VERDICT + 5 สัตว์มงคล + PILLAR + HOURS + ACTION + COLOR + DIRECTIONS + INSIGHTS + PEOPLE + EXTRAS |
| `public/js/hk-settings-drawer.js` | Settings drawer ?v=8 · type=text + 6-layer autofill block + duplicate guard + focus select-all |
| `public/js/hk-user-menu.js` | Topbar avatar menu · fallback v=8 |

### API endpoints (/today)
| Endpoint | Verb | Purpose |
|---|---|---|
| `/api/today` | GET | day verdict + tongshu + pillars |
| `/api/today/hours` | POST | 12 hourly pillars · golden/calm/avoid windows |
| `/api/today/actions` | POST | 4 action cards · personalized tips |
| `/api/today/directions` | POST | 8 directions · element-based |
| `/api/insights` | POST | ref_strengths + yongshen_ranks · 3 lang |
| `/api/sifu` | POST | Claude Max CLI BaZi Q&A |

### Key features (/today)
- 🐲 **5 สัตว์มงคล** ตามคุณภาพวัน · best→鳳凰 · good→青龍 · ok→朱雀 · caution→白虎 · avoid→玄武
- 📅 **Date nav** · ?date=YYYY-MM-DD · เมื่อวาน/วันนี้/พรุ่งนี้ ทุก section ตามกัน
- 🎨 **14 swatch colors** ตรงกับธาตุย่งเสิน (c-green/red/yellow/white/blue ฯลฯ)
- 🛡️ **Profile consistency** ใช้ `hk_profile_id` ตรงทุก section (Chunk A + Section 10 PEOPLE)
- ⚙️ **Settings drawer** type=text + 6-layer autofill block + maxlength snap fix + focus select-all

### Hard rules /today
❌ ห้ามเปลี่ยน 5 สัตว์มงคล mapping
❌ ห้ามเปลี่ยน 14 swatch class names
❌ ห้ามแตะ `hk_profile_id` logic
❌ ห้ามเปลี่ยน drawer ?v= โดยไม่ bump ทุก 9 หน้า
❌ ห้ามเปลี่ยน drawer input type จาก text กลับ number

---

## 📋 Inventory (/chart)

### Engine layer (Layer 3 · derived data)

| File | Role |
|---|---|
| `src/lib/chart-extensions.ts` | Engine 1+2 · LP×natal · 天地合 · 流年 timeline · ดวงพิเศษ · spouse · career · health · Voytek strength |
| `src/lib/chart-table.ts` | **62 神煞 detector** · Voytek anchors (YP/DP/MP/DS) · Kong Wang 2 xun · 12 phases · Na Yin · Life Palace · 5 Structure |
| `src/lib/chart-personal-stars.ts` | 14 personal stars · Hourkey v5 bilingual |
| `src/lib/qimen-destiny.ts` | QiMen natal mini-card · async timeout |

### Layer 0-1 (already SINGLE SOURCE LOCKED · ดูใน AGENTS.md หลัก)
- `src/lib/tyme-tst.ts` · True Solar Time + EoT
- `src/lib/bazi-calc.ts` · calcBazi + day boundary toggle (23:00 / 00:00)

### API endpoints

| Endpoint | Verb | Purpose |
|---|---|---|
| `/api/chart` | POST | คำนวณดวง + ทุก analysis · expose 25+ fields |
| `/api/sifu` | POST | Claude Max CLI · BaZi Q&A · 3 ภาษา · 6 topics |

### UI

| File | Sections |
|---|---|
| `public/chart.html` | §01-§11 · 11 sections · help tooltips ⓘ ทั่วหน้า |

#### §01-§11 layout (ห้าม renumber)
```
01 Hero (DM glyph + Voytek strength bar)
02 STRUCTURE (4 เสา · 10 แถว tooltip)
03 LIFE DOMAINS (radar + 5 cards · สีสันเต็ม)
04 PERSONAL (ดวงพิเศษ · คู่ · อาชีพ · สุขภาพ)
05 INSIGHTS (用神 · 喜神)
06 ELEMENTS (5 ธาตุ %)
07 INTERACTIONS (4 cards · 合·沖·三合·害刑·吟)
08 大運 (8 เสาโชค + interaction tags)
09 個人星 (14 ดาว Hourkey)
10 基礎 (BaZi basic + matrix)
11 流年 (timeline 10 ปี + ซินแสตอบ)
```

### Test (ห้ามลบ)
- `scripts/test-bazi-calc.cjs` · Golden reference Aeaw + Mai
- ผ่าน 2/2 ทุกครั้ง

### Data sources

| Path | Use |
|---|---|
| `data/hourkey-v5/hourkey-personal-stars-bilingual.json` | 14 personal stars 3 ภาษา |
| `data/hourkey-v3/hourkey-na-yin-60.json` | Na Yin 60 jiazi |
| `data/hourkey-v8/decode-fan-yin-fu-yin-detector.js` | Fan/Fu Yin classical |
| `data/hourkey-v8/decode-interaction-matrix.json` | 11 patterns prose |

---

## ✅ ความสามารถปัจจุบัน (95% Voytek)

### Calculation (ตรง 100%)
- 4 เสา 8 อักษร · ทุกดวง
- True Solar Time · longitude + EoT
- Day boundary toggle (23:00 ตำรา / 00:00 Voytek)
- 12 phases (DM·Pillar·Hidden)
- Na Yin 60 jiazi
- Kong Wang **2 xun** (year + day)
- 藏干 main/middle/residual
- ก้าน-กิ่ง 10 เทพ
- เสาโชค forward/backward (year stem polarity × gender)
- startAge จาก ChildLimit (jieqi)

### Interactions (ตรง 100%)
- 六沖 · 六合 · 六害 · 六破
- 三合 · 三會 · 半合
- 五合 (with transformation + required branches)
- 天克
- 反吟 · 伏吟 (natal × natal + natal × LP + natal × current year)
- 天地合 cross-pillar
- LP × natal interactions matrix
- 流年 10-year timeline + flag

### Stars (62 ดวง · ครบ Voytek)
- DS anchored: 天乙 · 文昌 · 祿神 · 羊刃 · 紅艷 · 金輿 · 血刃 · 太極 · 學堂 · 詞館 · 天廚 · 福星 · 流霞 · 天官 · 天賦 · 節度
- DB anchored: 天醫
- YP anchored: 將星 · 驛馬 · 桃花 · 華蓋 · 劫煞 · 亡神 · 紅鸞 · 天喜 · 孤辰 · 寡宿 · 喪門 · 弔客 · 災煞 · 天煞 · 劍鋒 · 披麻 · 龍德 · 福德 · 五鬼 · 勾絞 · 八座 · 三台 · 飛刃 · 病符 · 死符 · 官符 · 歲破 · 歲刑 · 大耗 · 小耗 · 桃花殺 · 元辰 · 隔角 · 白虎 · 飛符 · 月空 · 天羅 · 地網
- MP anchored: 天德 · 月德
- DP anchored: 魁罡 · 十惡大敗 · 天赦 · 十靈日 · 三奇

### Analytics (ตรง 95%)
- DM Strength · classical (wrapper 6) + Voytek-style cú (Layer 3)
- 用神 · climate · regulator
- ge_ju (格局 · 從財·從殺·正格)
- Special chart rules · inverted yongshen logic
- Spouse Palace (TCM partner element + traits)
- Career Industries · 5 element × 6 industries × 3 ภาษา
- Health Mapping · TCM 5 organs + caution detection

### UI (ใหม่)
- Voytek strength bar §01
- Help tooltips ⓘ 22 จุด · 3 ภาษา
- §03 LIFE DOMAINS · 5 สี (career=ฟ้า · wealth=ทอง · love=ชมพู · arts=ม่วง · self=เขียว)
- §04 PERSONAL · 4 การ์ดสีสันใหม่
- §08 LP · interaction tags (六沖/三合/天克/反吟)
- §11 流年 · 10-year timeline + AI ซินแสตอบ
- ปี+เดือน format · ไม่ใช่ decimal
- Day boundary toggle ใน drawer

---

## 🛡 5 ข้อต้องตอบก่อนแก้

ก่อน edit ไฟล์ใน chart suite ใด ๆ ต้องตอบ 5 ข้อ:

1. **Root cause:** ที่อยากแก้นี้คือบั๊กจริง หรือ feature ใหม่?
2. **Files affected:** จะแตะไฟล์ไหนบ้าง · ตรงกับ inventory ข้างบนไหม?
3. **Side effects:** กระทบ section อื่น/dữ ลำดับ §01-§11/3 ภาษา/2 theme/tooltips/help dict ไหม?
4. **Rollback:** backup ที่ไหน · git revert ได้ไหม?
5. **Test plan:** golden test 2/2 ผ่าน + Voytek 6 ดวงเทียบ + 3 ภาษา + light/dark theme

**ตอบไม่ได้ครบ = หยุด · ถามเจ้านายก่อน**

---

## 🚫 Hard rules

❌ **ห้าม renumber sections** (§01-§11)
❌ **ห้ามลบ help tooltips ⓘ** (22 จุด · 3 ภาษา)
❌ **ห้ามแตะ AGENTS list ของ 62 ดาว**
❌ **ห้ามเปลี่ยน Voytek strength weighting** (stem=4 · main=1.5 · mid=0.5 · res=0.2)
❌ **ห้ามแก้ day boundary toggle** (23:00 default · 00:00 Voytek)
❌ **ห้ามเปลี่ยน /api/sifu prompt structure** (Claude Max CLI · BaZi context format)
❌ **ห้ามรวม engine 1+2 fields** เข้าด้วยกัน (separate APIs concerns)

---

## ✅ Allowed (ทำได้โดยไม่ต้องถาม)

✓ เพิ่ม section ใหม่ (§12+)
✓ เพิ่ม help tooltip entries ใน HK_HELP dict
✓ เพิ่ม stars ใหม่ใน detector (ถ้ามีตำราอ้างอิง)
✓ ปรับ CSS visual (สี · spacing · responsive) โดยไม่กระทบ structure
✓ เพิ่ม industries ใน INDUSTRY_MAP
✓ เพิ่ม language entries ใน LANG_INSTR
✓ Refactor internal helpers (ไม่กระทบ API contract)

---

## 📞 Contact

ถ้า session AI มาแก้โดยไม่ถาม → **STOP · rollback · ขอโทษ · ถามเจ้านาย**

Backup directory: `/root/backups/<name>-YYYYMMDD/`

Last verified: 2026-05-14
