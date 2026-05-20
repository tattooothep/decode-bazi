/**
 * POST /api/insights
 *
 * รับ: { day_master, strength_level, lang? }
 * คืน: { strength: { label, metaphor, meaning, core_strategy, dos[], donts[] }, yongshen_advice: [{element, rank, meaning, strategy}] }
 *
 * Source: ref_strengths + ref_yongshen_ranks (Sesheta canon · 3 ภาษา)
 */
import { NextResponse } from "next/server";
import { q1, q } from "@/lib/db";

/* Map wrapper-6 levels → DB ref_strengths codes (DB has 7 · code missing 'balanced' + 'slightly_strong') */
const STRENGTH_MAP: Record<string, string> = {
  extremely_weak:   "extremely_weak",
  very_weak:        "very_weak",
  weak:             "weak",
  slightly_weak:    "slightly_weak",
  balanced:         "slightly_weak",   /* ใช้ slightly_weak เป็น proxy */
  slightly_strong:  "strong",          /* ใช้ strong เป็น proxy */
  strong:           "strong",
  very_strong:      "very_strong",
  extremely_strong: "extremely_strong",
};

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const dm: string = body.day_master || "";
  const lvl: string = body.strength_level || "";
  const lang: string = ["th","en","zh"].includes(body.lang) ? body.lang : "th";

  if (!dm || !lvl) {
    return NextResponse.json({ error: "day_master + strength_level required" }, { status: 400 });
  }

  const dbCode = STRENGTH_MAP[lvl] || "weak";

  /* ดึง strength row */
  type StrengthRow = {
    code: string;
    label_th: string|null; label_en: string|null; label_zh: string|null;
    metaphor_th: string|null; metaphor_en: string|null; metaphor_zh: string|null;
    meaning_th: string|null; meaning_en: string|null; meaning_zh: string|null;
    core_strategy_th: string|null; core_strategy_en: string|null; core_strategy_zh: string|null;
    dos_th: string[]|null; dos_en: string[]|null; dos_zh: string[]|null;
    donts_th: string[]|null; donts_en: string[]|null; donts_zh: string[]|null;
  };
  const sRow = await q1<StrengthRow>(
    `SELECT code, label_th, label_en, label_zh, metaphor_th, metaphor_en, metaphor_zh,
            meaning_th, meaning_en, meaning_zh, core_strategy_th, core_strategy_en, core_strategy_zh,
            dos_th, dos_en, dos_zh, donts_th, donts_en, donts_zh
     FROM ref_strengths WHERE code=$1::day_master_strength`, [dbCode]
  );

  /* ดึง yongshen rank ทั้ง 5 ของ DM */
  type RankRow = {
    rank: number; element: string;
    meaning_th: string|null; meaning_en: string|null; meaning_zh: string|null;
    strategy_th: string|null; strategy_en: string|null; strategy_zh: string|null;
  };
  const ranks = await q<RankRow>(
    `SELECT rank, element, meaning_th, meaning_en, meaning_zh, strategy_th, strategy_en, strategy_zh
     FROM ref_yongshen_ranks WHERE day_master=$1 ORDER BY rank`, [dm]
  );

  const pick = <T,>(th: T|null, en: T|null, zh: T|null): T|null => {
    if (lang === "en" && en != null) return en;
    if (lang === "zh" && zh != null) return zh;
    return th;
  };

  const strength = sRow ? {
    code: sRow.code,
    label: pick(sRow.label_th, sRow.label_en, sRow.label_zh) || sRow.code,
    metaphor: pick(sRow.metaphor_th, sRow.metaphor_en, sRow.metaphor_zh) || "",
    meaning: pick(sRow.meaning_th, sRow.meaning_en, sRow.meaning_zh) || "",
    core_strategy: pick(sRow.core_strategy_th, sRow.core_strategy_en, sRow.core_strategy_zh) || "",
    dos: pick(sRow.dos_th, sRow.dos_en, sRow.dos_zh) || [],
    donts: pick(sRow.donts_th, sRow.donts_en, sRow.donts_zh) || [],
  } : null;

  const yongshen_advice = (ranks || []).slice(0, 3).map(r => ({
    rank: r.rank,
    element: r.element,
    meaning: pick(r.meaning_th, r.meaning_en, r.meaning_zh) || "",
    strategy: pick(r.strategy_th, r.strategy_en, r.strategy_zh) || "",
  }));

  return NextResponse.json({ day_master: dm, strength, yongshen_advice, lang });
}
