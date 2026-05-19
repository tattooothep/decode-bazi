/**
 * chart-personal-stars.ts · #37 Personal Stars 14 ดาว
 *
 * Codex direction:
 *   - active `star × pillar` reading (ไม่ใช่ flat 14-star catalog)
 *   - 3-lang schema (th/en/zh) · null ถ้าไม่มี
 *   - import sesheta-v5 JSON
 */

import personalStarsJson from "../../data/sesheta-v5/sesheta-personal-stars-bilingual.json";
import { detectShenSha62, type StarHit, type Pillars } from "./chart-table";

type DictReading = {
  label_en?: string;
  description_en?: string;
  label_th?: string;
  description_th?: string;
  label_zh?: string;
  description_zh?: string;
};
type DictPerStar = Record<string, DictReading>;
type Dict = Record<string, DictPerStar>;

const DICT = personalStarsJson as Dict;

/* shen-sha code → personal-stars-bilingual key + zh name · ครบ 14 (Codex fix) */
const STAR_KEY_MAP: Record<string, { key: string; zh: string }> = {
  tianYi:    { key: "Nobleman Star",    zh: "天乙貴人" },
  taoHua:    { key: "Peach Blossom",    zh: "桃花" },
  yiMa:      { key: "Sky Horse",        zh: "驛馬" },
  wenChang:  { key: "Intelligence",     zh: "文昌" },
  xueTang:   { key: "Elegant Seal",     zh: "學堂貴人" },
  jiangXing: { key: "The General Star", zh: "將星" },
  xueRen:    { key: "Blood Knife",      zh: "血刃" },
  guChen:    { key: "Solitary",         zh: "孤辰" },
  guaSu:     { key: "Lonesome",         zh: "寡宿" },
  sangMen:   { key: "Funeral Door",     zh: "喪門" },
  jieSha:    { key: "Robbery Sha",      zh: "劫煞" },
  wangShen:  { key: "Death God",        zh: "亡神" },
  feiRen:    { key: "Separating Edge",  zh: "飛刃" },
};

const PILLAR_CAP: Record<string, string> = { year:"Year", month:"Month", day:"Day", hour:"Hour" };
const PILLAR_ZH:  Record<string, string> = { year:"年",   month:"月",    day:"日",   hour:"時" };
const PILLAR_TH:  Record<string, string> = { year:"ปี",   month:"เดือน", day:"วัน", hour:"ชั่วโมง" };

export type PersonalStarReading = {
  star_key: string;
  star_zh: string;
  pillar: "year"|"month"|"day"|"hour";
  pillar_zh: string;
  pillar_th: string;
  label_th: string | null;
  desc_th: string | null;
  label_en: string | null;
  desc_en: string | null;
  label_zh: string | null;
  desc_zh: string | null;
};

export function buildPersonalStars(
  pillars: Pillars,
  kongWangPerPillar?: Record<"year"|"month"|"day"|"hour", boolean>
): PersonalStarReading[] {
  const out: PersonalStarReading[] = [];
  const hits: StarHit[] = detectShenSha62(pillars);
  /* Codex fix: เพิ่ม Kong Wang ดึงจาก kong_wang.per_pillar */
  if (kongWangPerPillar) {
    const KW_KEY = "Kong Wang";
    const KW_ZH = "空亡";
    const dictKW = DICT[KW_KEY];
    if (dictKW) {
      for (const k of ["year","month","day","hour"] as const) {
        if (!kongWangPerPillar[k]) continue;
        const reading = dictKW[PILLAR_CAP[k]];
        if (!reading) continue;
        out.push({
          star_key: KW_KEY,
          star_zh: KW_ZH,
          pillar: k,
          pillar_zh: PILLAR_ZH[k],
          pillar_th: PILLAR_TH[k],
          label_th: reading.label_th || null,
          desc_th:  reading.description_th || null,
          label_en: reading.label_en || null,
          desc_en:  reading.description_en || null,
          label_zh: reading.label_zh || null,
          desc_zh:  reading.description_zh || null,
        });
      }
    }
  }
  for (const star of hits) {
    const map = STAR_KEY_MAP[star.code];
    if (!map) continue;
    const dictEntry = DICT[map.key];
    if (!dictEntry) continue;
    for (const pillar of star.pillars) {
      const reading = dictEntry[PILLAR_CAP[pillar]];
      if (!reading) continue;
      out.push({
        star_key: map.key,
        star_zh: map.zh,
        pillar,
        pillar_zh: PILLAR_ZH[pillar],
        pillar_th: PILLAR_TH[pillar],
        label_th: reading.label_th || null,
        desc_th:  reading.description_th || null,
        label_en: reading.label_en || null,
        desc_en:  reading.description_en || null,
        label_zh: reading.label_zh || null,
        desc_zh:  reading.description_zh || null,
      });
    }
  }
  return out;
}
