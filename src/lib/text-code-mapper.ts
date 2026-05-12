/**
 * Natal + Daily Overview · Text Code Mapper
 *
 * Maps deterministic engine output → list of i18n text_codes.
 * Pure function · no narrative / no translation / no fallback text.
 *
 * Usage:
 *   const { text_codes, debug } = buildOverviewCodes(natalCtx, dailyCtx);
 *   for (const code of text_codes) {
 *     const tx = t(code, lang, "main", "decode");   // → text or [missing:i18n:...]
 *   }
 *
 * Wait for GPT Batch 10 + sinsae approval before rendering on production.
 */
import registry from "../../data/i18n/code-registry/natal-daily-overview.json";

export type DmStrengthLabel =
  | "strong"
  | "very_strong"
  | "extremely_strong"
  | "slightly_strong"
  | "balanced"
  | "weak"
  | "very_weak"
  | "extremely_weak"
  | "slightly_weak"
  | "follow"
  | "follow_wealth"
  | "follow_official"
  | "follow_output"
  | "follow_seal"
  | "special";

export type ElementName = "wood" | "fire" | "earth" | "metal" | "water";
export type DailyNatalRelation = "supports" | "challenges" | "mixed";
export type DailyDmEffect = "strengthen" | "weaken" | "neutral";

export type NatalContext = {
  day_master: string | null;
  dm_strength: DmStrengthLabel | string | null;
  dominant_elements: ElementName[] | string[] | null;
  weak_elements: ElementName[] | string[] | null;
};

export type DailyContext = {
  supports_yongshen: boolean | null;
  activates_jishen: boolean | null;
  dm_effect: DailyDmEffect | string | null;
  daily_natal_relation: DailyNatalRelation | string | null;
};

const STEM_TO_DM_CODE = registry.stem_to_dm_code as Record<string, string>;
const STRENGTH_TO_CODE = registry.strength_to_code as Record<string, string>;
const ELEMENT_HIGH_CODES = registry.element_high_codes as Record<string, string>;
const ELEMENT_LOW_CODES = registry.element_low_codes as Record<string, string>;
const RELATION_TO_CODE = registry.daily_relation_to_code as Record<string, string>;
const DM_EFFECT_TO_CODE = registry.daily_dm_effect_to_code as Record<string, string>;

export function mapDayMaster(stem: string | null | undefined): string | null {
  if (!stem) return null;
  return STEM_TO_DM_CODE[stem] ?? null;
}

export function mapDmStrength(strength: string | null | undefined): string | null {
  if (!strength) return null;
  return STRENGTH_TO_CODE[strength] ?? null;
}

export function mapDominantElements(dominant: string[] | null | undefined): string[] {
  if (!dominant?.length) return [];
  const out: string[] = [];
  for (const el of dominant) {
    const code = ELEMENT_HIGH_CODES[el];
    if (code && !out.includes(code)) out.push(code);
  }
  return out;
}

export function mapWeakElements(weak: string[] | null | undefined): string[] {
  if (!weak?.length) return [];
  const out: string[] = [];
  for (const el of weak) {
    const code = ELEMENT_LOW_CODES[el];
    if (code && !out.includes(code)) out.push(code);
  }
  return out;
}

export function mapDailyNatalRelation(relation: string | null | undefined): string | null {
  if (!relation) return null;
  return RELATION_TO_CODE[relation] ?? null;
}

export function mapDailyDmEffect(effect: string | null | undefined): string | null {
  if (!effect) return null;
  return DM_EFFECT_TO_CODE[effect] ?? null;
}

export function mapYongshenJishen(ctx: DailyContext): string[] {
  const out: string[] = [];
  if (ctx.supports_yongshen === true) out.push("daily_yongshen_supported");
  if (ctx.activates_jishen === true) out.push("daily_jishen_activated");
  return out;
}

export type OverviewCodesResult = {
  text_codes: string[];
  debug: {
    day_master: string | null;
    dm_strength: string | null;
    dominant_elements: string[];
    weak_elements: string[];
    supports_yongshen: boolean | null;
    activates_jishen: boolean | null;
    dm_effect: string | null;
    daily_natal_relation: string | null;
    matched_groups: string[];
  };
};

export function buildNatalCodes(natal: NatalContext): string[] {
  const codes: string[] = [];
  const dm = mapDayMaster(natal.day_master);
  if (dm) codes.push(dm);
  const strength = mapDmStrength(natal.dm_strength ?? null);
  if (strength) codes.push(strength);
  codes.push(...mapDominantElements(natal.dominant_elements ?? null));
  codes.push(...mapWeakElements(natal.weak_elements ?? null));
  return codes;
}

export function buildDailyCodes(daily: DailyContext): string[] {
  const codes: string[] = [];
  const rel = mapDailyNatalRelation(daily.daily_natal_relation ?? null);
  if (rel) codes.push(rel);
  codes.push(...mapYongshenJishen(daily));
  const eff = mapDailyDmEffect(daily.dm_effect ?? null);
  if (eff) codes.push(eff);
  return codes;
}

export function buildOverviewCodes(
  natal: NatalContext,
  daily: DailyContext
): OverviewCodesResult {
  const natalCodes = buildNatalCodes(natal);
  const dailyCodes = buildDailyCodes(daily);
  const text_codes = Array.from(new Set([...natalCodes, ...dailyCodes]));

  const matched_groups: string[] = [];
  if (natalCodes.some((c) => c.startsWith("natal_dm_y"))) matched_groups.push("natal_dm_type");
  if (
    natalCodes.some((c) =>
      [
        "natal_dm_strong",
        "natal_dm_weak",
        "natal_dm_balanced",
        "natal_dm_follow_structure",
        "natal_dm_special_structure",
      ].includes(c)
    )
  ) {
    matched_groups.push("natal_dm_strength");
  }
  if (natalCodes.some((c) => c.startsWith("natal_element_"))) matched_groups.push("natal_element_balance");
  if (dailyCodes.some((c) => c.startsWith("daily_"))) matched_groups.push("daily_natal_interaction");

  return {
    text_codes,
    debug: {
      day_master: natal.day_master ?? null,
      dm_strength: natal.dm_strength ?? null,
      dominant_elements: natal.dominant_elements ?? [],
      weak_elements: natal.weak_elements ?? [],
      supports_yongshen: daily.supports_yongshen ?? null,
      activates_jishen: daily.activates_jishen ?? null,
      dm_effect: daily.dm_effect ?? null,
      daily_natal_relation: daily.daily_natal_relation ?? null,
      matched_groups,
    },
  };
}

export function listKnownCodes(): string[] {
  const out: string[] = [];
  const groups = (registry as { groups: Record<string, { codes: string[] }> }).groups;
  for (const g of Object.values(groups)) {
    for (const c of g.codes) {
      if (!out.includes(c)) out.push(c);
    }
  }
  return out;
}
