import profilesData from "../../data/library/daymaster_profiles.refined.json";
import profilesI18nData from "../../data/library/daymaster_profiles.i18n.json";

export type DaymasterProfile = {
  id: string;
  key: string;
  stem: string;
  element: string;
  polarity: string;
  strength: string;
  label_th: string;
  core: string;
  real_life: string;
  shadow: string;
  needs: string;
};

type ProfileSource = {
  profiles?: DaymasterProfile[];
};

const PROFILE_BY_KEY = new Map<string, DaymasterProfile>(
  ((profilesData as ProfileSource).profiles || []).map((p) => [p.key, p])
);

export function normalizeDaymasterStrength(input: {
  level?: string | null;
  levelTh?: string | null;
  percent?: number | null;
  supportingPct?: number | null;
}): "強" | "中和" | "弱" {
  const raw = `${input.level || ""} ${input.levelTh || ""}`.toLowerCase();
  if (raw.includes("weak") || raw.includes("อ่อน")) return "弱";
  if (raw.includes("strong") || raw.includes("แข็ง")) return "強";

  const pct = typeof input.supportingPct === "number"
    ? input.supportingPct
    : typeof input.percent === "number"
      ? input.percent
      : null;
  if (pct !== null) {
    if (pct < 45) return "弱";
    if (pct > 55) return "強";
  }
  return "中和";
}

export function getDaymasterProfile(
  stem: string | undefined | null,
  input: Parameters<typeof normalizeDaymasterStrength>[0] = {}
): DaymasterProfile | null {
  if (!stem) return null;
  const strength = normalizeDaymasterStrength(input);
  return PROFILE_BY_KEY.get(`${stem}_${strength}`) || null;
}

/* r524 · คำแปล en/zh ของโปรไฟล์ (additive · th เดิมไม่แตะ · เว็บเก่าไม่กระทบ) */
export type DaymasterProfileTranslation = {
  label: string;
  core: string;
  real_life: string;
  shadow: string;
  needs: string;
};
export type DaymasterProfileI18n = {
  en?: DaymasterProfileTranslation;
  zh?: DaymasterProfileTranslation;
};

const I18N_BY_KEY: Record<string, DaymasterProfileI18n> =
  (profilesI18nData as Record<string, DaymasterProfileI18n>) || {};

const ELEMENT_EN: Record<string, string> = { wood: "Wood", fire: "Fire", earth: "Earth", metal: "Metal", water: "Water" };
const ELEMENT_ZH: Record<string, string> = { wood: "木", fire: "火", earth: "土", metal: "金", water: "水" };

function joinElements(list: unknown, map: Record<string, string>, sep: string): string {
  return Array.isArray(list) ? list.map((e) => map[String(e)] || "").filter(Boolean).join(sep) : "";
}

/** ประกอบ needs ฉบับดวงตามกระแส (從) ให้ตรงกับข้อความไทยใน overrideNeedsForFollow */
function followNeedsI18n(yv2: any): { en: string; zh: string } {
  const label = String(yv2?.structure_label || "從");
  const yongEn = joinElements(yv2?.primary_yongshen, ELEMENT_EN, " · ");
  const xiEn = joinElements(yv2?.xishen, ELEMENT_EN, " · ");
  const jiEn = joinElements(yv2?.jishen, ELEMENT_EN, " · ");
  const yongZh = joinElements(yv2?.primary_yongshen, ELEMENT_ZH, "·");
  const xiZh = joinElements(yv2?.xishen, ELEMENT_ZH, "·");
  const jiZh = joinElements(yv2?.jishen, ELEMENT_ZH, "·");
  const en =
    `⚠️ This chart is a special "follow" structure (${label}) — the day master is so weak that the classics advise flowing with the dominant current instead of propping up the self.` +
    ` Ordinary advice for normal charts (adding elements to support the self) does not apply here` +
    (yongEn ? ` · Elements that carry this chart: ${yongEn}` : "") +
    (xiEn ? ` reinforced by ${xiEn}` : "") +
    (jiEn ? ` · Elements to be careful with: ${jiEn} (forcing them goes against the current)` : "") +
    ` — see the "Special chart" and "用神 v2" sections below`;
  const zh =
    `⚠️ 此盤屬特殊格局「${label}」— 日主極弱，古法取「順勢從之」，不宜強扶自身。` +
    `一般命盤之補身建議不適用於此盤` +
    (yongZh ? `·得力五行：${yongZh}` : "") +
    (xiZh ? `，輔以 ${xiZh}` : "") +
    (jiZh ? `·須慎五行：${jiZh}（強補即逆勢）` : "") +
    `— 詳見下方「特殊格局」與「用神 v2」`;
  return { en, zh };
}

/**
 * แนบก้อนคำแปล en/zh เข้ากับ daymaster_profile (หลังผ่าน overrideNeedsForFollow แล้ว)
 * - ปกติ: ดึงคำแปลตาม key จากคลัง i18n
 * - ดวงตามกระแส (follow_override): needs ใช้ฉบับประกอบสดให้ตรงข้อความไทย
 * - ไม่มีคำแปลในคลัง → คืน profile เดิม (ไม่ปั้น)
 */
export function attachDaymasterI18n(profile: any, yv2: any): any {
  if (!profile || typeof profile !== "object") return profile;
  const base = I18N_BY_KEY[String(profile.key || "")];
  if (!base || (!base.en && !base.zh)) return profile;
  const follow = profile.follow_override === true ? followNeedsI18n(yv2) : null;
  const pick = (lang: "en" | "zh"): DaymasterProfileTranslation | undefined => {
    const t = base[lang];
    if (!t) return undefined;
    return follow ? { ...t, needs: follow[lang] } : t;
  };
  return { ...profile, i18n: { en: pick("en"), zh: pick("zh") } };
}
