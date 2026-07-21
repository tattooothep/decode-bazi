"use strict";
/**
 * chart-personal-stars.ts · #37 Personal Stars 14 ดาว
 *
 * Codex direction:
 *   - active `star × pillar` reading (ไม่ใช่ flat 14-star catalog)
 *   - 3-lang schema (th/en/zh) · null ถ้าไม่มี
 *   - import hourkey-v5 JSON
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPersonalStars = buildPersonalStars;
const hourkey_personal_stars_bilingual_json_1 = __importDefault(require("../../data/hourkey-v5/hourkey-personal-stars-bilingual.json"));
const chart_table_1 = require("./chart-table");
const DICT = hourkey_personal_stars_bilingual_json_1.default;
/* shen-sha code → personal-stars-bilingual key + zh name · ครบ 14 (Codex fix) */
const STAR_KEY_MAP = {
    tianYi: { key: "Nobleman Star", zh: "天乙貴人" },
    taoHua: { key: "Peach Blossom", zh: "桃花" },
    yiMa: { key: "Sky Horse", zh: "驛馬" },
    wenChang: { key: "Intelligence", zh: "文昌" },
    xueTang: { key: "Elegant Seal", zh: "學堂貴人" },
    jiangXing: { key: "The General Star", zh: "將星" },
    xueRen: { key: "Blood Knife", zh: "血刃" },
    guChen: { key: "Solitary", zh: "孤辰" },
    guaSu: { key: "Lonesome", zh: "寡宿" },
    sangMen: { key: "Funeral Door", zh: "喪門" },
    jieSha: { key: "Robbery Sha", zh: "劫煞" },
    wangShen: { key: "Death God", zh: "亡神" },
    feiRen: { key: "Separating Edge", zh: "飛刃" },
};
const PILLAR_CAP = { year: "Year", month: "Month", day: "Day", hour: "Hour" };
const PILLAR_ZH = { year: "年", month: "月", day: "日", hour: "時" };
const PILLAR_TH = { year: "ปี", month: "เดือน", day: "วัน", hour: "ชั่วโมง" };
function buildPersonalStars(pillars, kongWangPerPillar) {
    const out = [];
    const hits = (0, chart_table_1.detectShenSha62)(pillars);
    /* Codex fix: เพิ่ม Kong Wang ดึงจาก kong_wang.per_pillar */
    if (kongWangPerPillar) {
        const KW_KEY = "Kong Wang";
        const KW_ZH = "空亡";
        const dictKW = DICT[KW_KEY];
        if (dictKW) {
            for (const k of ["year", "month", "day", "hour"]) {
                if (!kongWangPerPillar[k])
                    continue;
                const reading = dictKW[PILLAR_CAP[k]];
                if (!reading)
                    continue;
                out.push({
                    star_key: KW_KEY,
                    star_zh: KW_ZH,
                    pillar: k,
                    pillar_zh: PILLAR_ZH[k],
                    pillar_th: PILLAR_TH[k],
                    label_th: reading.label_th || null,
                    desc_th: reading.description_th || null,
                    label_en: reading.label_en || null,
                    desc_en: reading.description_en || null,
                    label_zh: reading.label_zh || null,
                    desc_zh: reading.description_zh || null,
                });
            }
        }
    }
    for (const star of hits) {
        const map = STAR_KEY_MAP[star.code];
        if (!map)
            continue;
        const dictEntry = DICT[map.key];
        if (!dictEntry)
            continue;
        for (const pillar of star.pillars) {
            const reading = dictEntry[PILLAR_CAP[pillar]];
            if (!reading)
                continue;
            out.push({
                star_key: map.key,
                star_zh: map.zh,
                pillar,
                pillar_zh: PILLAR_ZH[pillar],
                pillar_th: PILLAR_TH[pillar],
                label_th: reading.label_th || null,
                desc_th: reading.description_th || null,
                label_en: reading.label_en || null,
                desc_en: reading.description_en || null,
                label_zh: reading.label_zh || null,
                desc_zh: reading.description_zh || null,
            });
        }
    }
    return out;
}
