# QiMen ctext Audit — 2026-05-29

Status: 值符/值使 metadata resolver is live on `qimen-api` (verified 2026-05-29 16:50 ICT). No QiMen prompt change in this pass.

Source of truth for this pass:
- ctext `奇門遁甲統宗卷之一`: `https://ctext.org/wiki.pl?chapter=666094&if=en`
- ctext `奇門遁甲統宗卷之二`: `https://ctext.org/wiki.pl?chapter=491157&if=en`
- ctext catalog confirms `奇門遁甲秘笈大全` exists but base text is unknown: `https://ctext.org/wiki.pl?if=en&res=953105`

Local systems checked:
- Main app proxy: `/root/decode-app/src/app/api/qimen/route.ts`
- QiMen AI prompt route: `/root/decode-app/src/app/api/qimen/sifu/route.ts`
- QiMen prompt: `/root/decode-app/data/library/prompts/qimen-sifu.md`
- QiMen engine service: `/root/qimen-api/src/qimenEngine.js`
- QiMen tables: `/root/qimen-api/lib/qimen-shared-tables.js`
- QiMen 1080 charts: `/root/qimen-api/data/qimen.sqlite`, table `qimen_charts`
- Year/month/day shared builder: `/root/qimen-api/lib/qimen-chart-builder.js`

## 1. ตรงตำราแล้ว

### 1.1 三奇 / 六儀 / 旬首 mapping

ctext `奇門遁甲統宗卷之二` states:
- `三奇`: 乙, 丙, 丁.
- `六儀`: 戊, 己, 庚, 辛, 壬, 癸.
- 甲子->戊, 甲戌->己, 甲申->庚, 甲午->辛, 甲辰->壬, 甲寅->癸.

Local:
- `SAN_QI = ['乙','丙','丁']`
- `LIU_YI = ['戊','己','庚','辛','壬','癸']`
- `XUN_TO_YI` matches ctext.

Verdict: OK.

### 1.2 九星 / 八門 home palace

ctext gives:
- 九星: 坎一天蓬, 坤二天芮, 震三天衝, 巽四天輔, 中五天禽, 乾六天心, 兌七天柱, 艮八天任, 離九天英.
- 八門: 坎休, 艮生, 震傷, 巽杜, 離景, 坤死, 兌驚, 乾開.

Local `NINE_PALACES` and DB dict `home_palace` match this base mapping.

Verdict: OK for base palace.

### 1.3 陰陽二遁 / 三元 / 拆補符頭

ctext gives:
- 陽遁順布六儀逆布三奇.
- 陰遁逆布六儀順布三奇.
- 三元 by 符頭 branch: 子午卯酉 upper, 寅申巳亥 middle, 辰戌丑未 lower.

Local:
- `SOLAR_TERM_JU` / DB `qimen_ju_mapping` match the standard 24-term ju table.
- `getYuanCycleByChaiBu()` uses branch-of-fu-tou lookup and matches ctext's 三元 rule.
- `getSolarTermInfo()` uses exact JieQi time, not midnight snap.

Verdict: OK.

## 2. เป็น variant ต้องติดป้ายให้ชัด

### 2.1 八神: 勾陳/朱雀 vs 白虎/玄武

ctext's main list for 八神 uses:
- 陽遁: 值符, 騰蛇, 太陰, 六合, 勾陳, 朱雀, 九地, 九天.
- 陰遁: 值符, 九天, 九地, 朱雀, 勾陳, 六合, 太陰, 騰蛇.
- It also notes 朱雀 under 玄武 and 勾陳 under 白虎.

Local has both systems mixed:
- `qimen-shared-tables.js` exports 白虎/玄武 variant.
- `qimen-chart-builder.js` uses 勾陳/朱雀 variant.
- DB `qimen_charts` only has `deity_variant = xuan_wu_all_year`.
- Runtime has optional `xuan_wu_winter_zhu_que_summer` swap.

Verdict: not necessarily wrong, but currently mixed. Need one selected school/tag per chart and expose source/variant to AI/UI.

## 3. เสี่ยงผิดหรือควรแก้ก่อนขยาย

### 3.1 Chart-level `chief_star_code`, `zhi_shi_*` metadata mismatch

ctext rules:
- `以旬首取符使法`: the star at the xun-head palace is 值符; the door at that palace is 值使.
- `值符加時干法`: move 值符 star to the palace of the current hour stem on the earth plate.
- The following method moves 值使 door by the current hour branch.

Local palace layers often look consistent with this, but chart-level metadata is inconsistent with the palace list.

Automated check against DB `qimen_charts` + `qimen_chart_palaces`:
- total charts: 1080.
- `chief_star_code` mismatches expected ctext value star: 504.
- `zhi_fu_palace_id` mismatches current palace of expected value star: 120.
- `zhi_shi_door_code` mismatches expected ctext value door: 960.
- `zhi_shi_palace_id` mismatches current palace of expected value door: 960.

Example: 陽一局 乙丑
- ctext expectation from 甲子旬: 值符 star = 天蓬; 值使 door = 休門.
- DB palace list has 天蓬 at palace 9 and 休門 at palace 2, which fits the movement rule.
- But chart metadata says `chief_star_code=TIAN_QIN`, `zhi_shi_door_code=DU_MEN`, `zhi_shi_palace_id=1`.

Verdict: likely metadata bug. If UI/AI uses palace list, output may still be mostly right. If UI/AI/scoring uses `chart.zhi_shi_palace_id` or `chart.chief_star_code`, it can choose the wrong palace or explain the wrong value star/door.

### 3.2 Year/month/day builder fixes stars and doors in place

Local `/root/qimen-api/lib/qimen-chart-builder.js` says:
- Stars fixed to palaces.
- Doors fixed to palaces.

ctext for hour chart explicitly rotates 值符 and 值使. For year/month it also says use the year's/month's branch/stem to place 值使/值符. For day chart it gives a separate day method; it is not simply "fixed star + fixed door".

This builder is used by:
- `ri-jia-engine.js`
- `yue-jia-engine.js`
- `nian-jia-engine.js`

Verdict: high risk for 年家/月家/日家 QiMen endpoints. Do not rely on these as classical ctext-correct until audited with golden examples.

### 3.3 Scoring numbers are heuristic, not ctext verbatim

Local scoring assigns numeric weights:
- 生門 +40, 開門 +30, 死門 -50, etc.
- 天心 +14, 天蓬 -20, etc.
- deity scores such as 值符 +10, 白虎 -14.

ctext provides qualitative use cases and auspicious/inauspicious tendencies, not these numeric weights.

Verdict: scores can remain as product heuristic, but must be labeled as `engine heuristic`, not `ctext text rule`.

### 3.4 Prompt says "ตอบสั้นกระชับ"

`data/library/prompts/qimen-sifu.md` and fallback in route include concise instruction. This is outside ctext correctness but affects answer depth.

Verdict: not an engine correctness bug, but important UX note.

## 4. Recommended next steps

1. Freeze changes to QiMen output until metadata audit is fixed.
2. Add `qimenCtextAudit` or equivalent diagnostics endpoint/test:
   - verify 1080 chart metadata against ctext rules.
   - verify deity variant selected per profile.
3. Fix chart-level metadata or derive it at runtime from palace list and ctext rules:
   - `value_star_code`
   - `value_star_current_palace_id`
   - `value_door_code`
   - `value_door_current_palace_id`
4. Add source tagging:
   - `ctext_verbatim`
   - `ctext_derived`
   - `school_variant`
   - `engine_heuristic`
5. Treat 年/月/日 builders as experimental until their rotation rules are ctext-audited.

## 5. Runtime patch status (2026-05-29)

Implemented and live:

- Added `/root/qimen-api/lib/qimen-ctext-fushi-resolver.js`.
- Patched `/root/qimen-api/src/qimenEngine.js` to derive canonical `值符/值使` at runtime from palace data and ctext rules.
- Patched `/root/qimen-api/src/divinationService.js` and `/root/qimen-api/src/claudeService.js` to use `chart.zhi_shi_palace_id` before falling back to `chart.zhi_shi_door_code`.
- Added `/root/qimen-api/scripts/test-ctext-fushi.js`.
- Runtime API now returns:
  - `chart.ctext_fushi`
  - `chart.ctext_fushi_enabled: true`
  - corrected `chart.chief_star_code`, `chart.zhi_fu_palace_id`, `chart.zhi_shi_door_code`, `chart.zhi_shi_palace_id`
  - `chart.legacy_fushi_metadata` for rollback/audit comparison.

Rollback:

- Immediate runtime rollback: set `QIMEN_CTEXT_FUSHI=0`.
- File rollback backups: `/root/qimen-api/_backup_ctext_fushi_20260529/`.
- Note: `/root/qimen-api` is not a git repo, so keep the backup folder until this patch is confirmed live.

Verification:

- `node -c` passed for resolver, engine, divination, and Claude prompt helper files.
- `node /root/qimen-api/scripts/test-ctext-fushi.js` passed `1085/1085`.
- Direct `calculateQimenChart` test shows canonical mode changes a wrong legacy `chief_star_code` while preserving `legacy_fushi_metadata`.
- `QIMEN_CTEXT_FUSHI=0` direct test returns legacy metadata, confirming rollback flag works.
- Live smoke:
  - `POST http://localhost:4090/api/qimen/calculate` returns `ctext_fushi_enabled: true`.
  - `POST http://localhost:3209/api/qimen` and `POST http://localhost:3186/api/qimen` both return `ctext_fushi_enabled: true`.
  - `https://hourkey.io/` returns HTTP 200.
