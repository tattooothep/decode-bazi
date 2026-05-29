# Gap 1 · Classics Fetch Log (29 พ.ค. 2026)

Agent C ดึงตำราคลาสสิก 2 เล่ม จาก zh.wikisource.org · curl + python3 parse (bs4)

## 三命通會 (萬民英 · 明 1578)

แหล่งหลัก ctext.org/wiki.pl?if=gb&res=617828 → **ถูกลบ** (Wiki ขึ้น "該資料已刪除")
- fallback: zh.wikisource.org/wiki/三命通會 → ใช้ได้
- **ขาด: 卷十 卷十一 卷十二** (wikisource ระบุ "缺卷十至卷十二")
- ดังนั้น **歲運並臨** ที่ระบุในบรีฟ (卷十) **ไม่ได้** เพราะ source ไม่มี

| 卷 | URL | bytes (html) | parse bytes | สถานะ |
|----|-----|--------------|-------------|--------|
| 卷一 論納音 | …/卷一 | 163,144 | 78,996 | ✅ keep |
| 卷二 合冲刑害 | …/卷二 | 142,854 | 66,794 | ✅ keep |
| 卷三 神煞รวม | …/卷三 | 138,646 | 65,346 | ✅ keep |
| 卷四 ห้าธาตุ | …/卷四 | 116,523 | 42,769 | ⏭ skip (ไม่อยู่ในบรีฟ) |
| 卷五 名義印食官財 | …/卷五 | 101,020 | 30,733 | ✅ keep (正官 偏官) |
| 卷六 格局พิเศษ | …/卷六 | 214,212 | 105,298 | ⏭ skip (ไม่อยู่ในบรีฟ) |
| 卷七 論女命 + 六親 | …/卷七 | 113,631 | 41,502 | ✅ keep |
| 卷八 六甲日各時斷 | …/卷八 | 190,300 | 85,931 | ⏭ skip (lookup table 60×12) |
| 卷九 六己~六辛日 | …/卷九 | 190,195 | 86,558 | ⏭ skip (lookup table) |
| 卷十 歲運並臨 | (ไม่มี) | - | - | ❌ **ขาดที่ wikisource** |
| 卷十一-十二 | (ไม่มี) | - | - | ❌ ขาด |

**Sections keep:** 57 หัวข้อ
- 卷一: 总论纳音 · 论纳音取象 · 释六十甲子性质吉凶
- 卷二: 论天干阴阳生死 · 论地支 · 论十干合 · 论十干化气 · 论支元六合 · 论支元三合 · 论将星华盖 · 论咸池 · 论六害 · 论三刑 · 论冲击
- 卷三: 论十干禄 · 论驿马 · 论天乙贵人 · 论三奇 · 论天月德 · 论太极贵 · 论学堂词馆 · 论劫煞亡神 · 论羊刃 · 论空亡 · 论元辰 · 论灾煞 · 论六厄 · 论孤辰寡宿 · 论天罗地网 · 论十恶大败 · 总论诸神煞
- 卷五: 论古人立印食官财名义 · 论正官 · 论偏官
- 卷七: 论性情相貌 · 论疾病… · 论女命 + 12 ประเภท (纯/和/清/贵/浊/滥/娼/淫/旺夫克子…) · 总论阴命 · 论小儿 · 论六亲 · 定妇人孕生男女

**ไฟล์ผลลัพธ์:**
- `data/library/sifu-extra/smtg-ctext-corpus.txt` — 224,358 bytes
- `data/library/sifu-extra/smtg-clean.md` — 232,266 bytes (sha1=8e3efce7d0e5)

## 淵海子平 (徐升 · 宋 1271)

แหล่งหลัก ctext.org/wiki.pl?if=gb&res=595556 → **ถูกลบ** เช่นกัน
- fallback: zh.wikisource.org/wiki/淵海子平 → ใช้ได้ (หน้าเดียวยาว · 72 sections)
- **ขาด: 六十甲子納音注解 แยกบท** — wikisource เก็บนาอินไว้กระจาย ไม่ได้รวมเป็นบทเดียว
- ทดแทน: นาอินครบ 60 อยู่ใน **三命通會 卷一 释六十甲子性质吉凶** (smtg-clean.md)

URL: zh.wikisource.org/wiki/淵海子平 → 311,584 bytes html → parse 171,972 bytes

**Sections keep:** 50 หัวข้อ (จาก 72 ในต้นฉบับ)
- 基础: 论天干地支暗藏总诀 · 又地支藏遁歌 · 论日为主 · 论月令 · 论太岁吉凶 · 论征太岁 · 论大运 · 论疾病 · 论性情
- **五干通變 (10干通変):** 论伤官 · 伤官说 · 论食神 · 论正财 · 正官论 · 论七杀 · 论官星太过 · 论官杀混杂要制伏 · 论印綬 · 论倒食 · 论劫财 · 论阳刃 · 论日刃 · 论日贵 · 论日德 · 论魁罡 · 论金神
- 六亲: 六亲总篇 · 论父 · 论母 · 论兄弟姊妹 · 论妻妾 · 论子息 · 论小儿 · 论小儿关煞
- 婦人: 论妇人总诀 · 阴命赋 · 女命总断歌 · 女命富贵贫贱篇 · 滚浪桃花 · 女命贵格 · 女命贱格
- 子平 核心: 子平举要歌 · 详解定真论 · **喜忌篇** · 看命入式 · 神趣八法 · 杂论口诀 · 格局生死引用 · 论八字撮要法 · 会要命书说

**ไฟล์ผลลัพธ์:**
- `data/library/sifu-extra/yhzp-ctext-corpus.txt` — 81,153 bytes
- `data/library/sifu-extra/yhzp-clean.md` — 88,274 bytes (sha1=eae7763b8aa0)

## สรุปขนาด (กัน token bloat)

| ไฟล์ | bytes | MB |
|------|-------|-----|
| smtg-clean.md (โหลด prompt) | 232,266 | 0.22 |
| yhzp-clean.md (โหลด prompt) | 88,274 | 0.08 |
| smtg-ctext-corpus.txt (raw) | 224,358 | 0.21 |
| yhzp-ctext-corpus.txt (raw) | 81,153 | 0.08 |
| **รวม 4 ไฟล์** | **626,051** | **0.59** |
| **เป้า ≤** | 1,258,291 | 1.20 |

ผ่านเป้า · เหลือ buffer 50%

## บทที่ขาด (ตามบรีฟ)

| ที่ระบุในบรีฟ | สถานะ | หมายเหตุ |
|---------------|--------|----------|
| 三命通會 卷十 歲運並臨 | ❌ ขาด | wikisource ไม่มี 卷10-12 |
| 淵海子平 六十甲子納音注解 | ❌ ขาด | wikisource ไม่รวมเป็นบท · ใช้ smtg-clean.md 卷一 แทน |
| 三命通會 卷一 論納音取象 | ✅ ได้ |  |
| 三命通會 卷二 三合/六合/衝擊/三刑 | ✅ ได้ครบ |  |
| 三命通會 卷三 總論諸神煞 | ✅ ได้ |  |
| 三命通會 卷五 古人立印食官財名義 | ✅ ได้ |  |
| 三命通會 卷七 論女命 | ✅ ได้ครบ 12 ประเภท |  |
| 淵海子平 五干通變圖 | ✅ ได้ (16 ก้าน sections) |  |
| 淵海子平 喜忌篇 | ✅ ได้ |  |
| 淵海子平 八格 | ✅ ได้ (ผ่าน 五干通變 + 喜忌篇 + 格局生死引用) |  |

## Pipeline

```
curl wikisource HTML  →  python3 bs4 parser  →  filter sections (keep list)  →
  smtg-ctext-corpus.txt + smtg-clean.md
  yhzp-ctext-corpus.txt + yhzp-clean.md
↓
src/app/api/sifu/route.ts        SIFU_EXTRA_FILES += { smtg, yhzp }
src/app/api/sifu/group/route.ts  SIFU_EXTRA_FILES += { smtg, yhzp }
↓
loadSifuExtraKnowledge() · cache 60s · version hash · ยัดเข้า prompt sifu-extra-header.md
```

Test: `node scripts/test-classics-presence.mjs` · 4/4 PASS
