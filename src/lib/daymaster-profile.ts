import profilesData from "../../data/library/daymaster_profiles.refined.json";

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
