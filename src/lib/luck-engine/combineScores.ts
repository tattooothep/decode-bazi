/**
 * Score Combiner
 * ===============
 * รวม score ของแต่ละ module ตาม weights · apply caps · classify tier
 *
 * Pipeline:
 *   1. Take ModuleResult[]
 *   2. Filter active modules
 *   3. Weighted sum
 *   4. Apply caps (e.g. 沖太歲 = max 40)
 *   5. Classify tier
 *   6. Sort reasons
 *   7. Return ScoringResult
 */

import type {
  CandidateSlot,
  ModuleResult,
  ModuleKey,
  ScoringResult,
  ScoreTier,
  ActionRecommendation,
  Reason,
  CapRule,
  ActivityType
} from "./types";

import { getNormalizedWeights } from "./weights";

// =====================================================================
// MAIN · combineScores
// =====================================================================

export function combineScores(
  modules: Partial<Record<ModuleKey, ModuleResult>>,
  activeModules: ModuleKey[],
  activityType: ActivityType
): ScoringResult {
  const weights = getNormalizedWeights(activityType, activeModules);

  let weightedSum = 0;
  let totalWeight = 0;
  const moduleScores: Record<string, number> = {};
  const reasonsUp: Reason[] = [];
  const reasonsDown: Reason[] = [];
  const warnings: Reason[] = [];
  const caps: CapRule[] = [];

  for (const key of activeModules) {
    const result = modules[key];
    if (!result || result.status === "missing" || result.status === "error") {
      continue;
    }

    const weight = weights[key] ?? 0;
    const normalized = result.score.normalized;
    weightedSum += normalized * weight;
    totalWeight += weight;
    moduleScores[key] = normalized;

    // Collect reasons
    reasonsUp.push(...(result.reasons.up || []));
    reasonsDown.push(...(result.reasons.down || []));
    warnings.push(...(result.reasons.warning || []));

    // Collect caps
    if (result.caps) {
      caps.push(...result.caps);
    }
  }

  // ---------------------------------------------------------------
  // Calculate raw score
  // ---------------------------------------------------------------
  let finalScore = totalWeight > 0 ? weightedSum / totalWeight : 50;

  // ---------------------------------------------------------------
  // Apply caps
  // ---------------------------------------------------------------
  finalScore = applyCaps(finalScore, caps);

  // ---------------------------------------------------------------
  // Clamp 0-100
  // ---------------------------------------------------------------
  finalScore = Math.max(0, Math.min(100, Math.round(finalScore)));

  // ---------------------------------------------------------------
  // Classify tier + action
  // ---------------------------------------------------------------
  const tier = scoreToTier(finalScore);
  const action = tierToAction(tier, warnings.length);

  // ---------------------------------------------------------------
  // Sort reasons by absolute delta (most impactful first)
  // ---------------------------------------------------------------
  const sortByImpact = (a: Reason, b: Reason) =>
    Math.abs(b.delta) - Math.abs(a.delta);

  return {
    activeModules,
    moduleScores: moduleScores as Record<ModuleKey, number>,
    finalScore,
    tier,
    action,
    reasonsUp: reasonsUp.sort(sortByImpact).slice(0, 8),
    reasonsDown: reasonsDown.sort(sortByImpact).slice(0, 8),
    warnings: warnings.sort(sortByImpact),
    caps
  };
}

// =====================================================================
// CAPS · จำกัด score ตามกฎพิเศษ
// =====================================================================

function applyCaps(score: number, caps: CapRule[]): number {
  let result = score;
  for (const cap of caps) {
    switch (cap.type) {
      case "max":
        result = Math.min(result, cap.value);
        break;
      case "min":
        result = Math.max(result, cap.value);
        break;
      case "absolute":
        result = cap.value;
        break;
    }
  }
  return result;
}

// =====================================================================
// TIER CLASSIFICATION
// =====================================================================

export function scoreToTier(score: number): ScoreTier {
  if (score >= 85) return "excellent";
  if (score >= 75) return "very_good";
  if (score >= 65) return "good";
  if (score >= 50) return "neutral";
  if (score >= 35) return "caution";
  if (score >= 20) return "avoid";
  return "danger";
}

export function tierToAction(
  tier: ScoreTier,
  warningCount: number
): ActionRecommendation {
  // ถ้ามี critical warnings · downgrade action
  if (warningCount >= 3) {
    if (tier === "excellent" || tier === "very_good") return "with_caution";
    if (tier === "good") return "with_caution";
  }

  switch (tier) {
    case "excellent":  return "highly_recommended";
    case "very_good":  return "recommended";
    case "good":       return "acceptable";
    case "neutral":    return "neutral";
    case "caution":    return "with_caution";
    case "avoid":      return "avoid";
    case "danger":     return "strictly_avoid";
  }
}

// =====================================================================
// DISPLAY HELPERS
// =====================================================================

export const TIER_LABELS: Record<ScoreTier, { thai: string; emoji: string; color: string }> = {
  excellent:  { thai: "ฤกษ์ดีที่สุด",  emoji: "🌟🌟", color: "#1d9e75" },
  very_good:  { thai: "ฤกษ์ดีมาก",      emoji: "🌟",   color: "#639922" },
  good:       { thai: "ฤกษ์ดี",          emoji: "✅",   color: "#185fa5" },
  neutral:    { thai: "ฤกษ์ปานกลาง",    emoji: "🟡",   color: "#ba7517" },
  caution:    { thai: "ระวัง",            emoji: "🟠",   color: "#993c1d" },
  avoid:      { thai: "หลีกเลี่ยง",      emoji: "🔴",   color: "#a32d2d" },
  danger:     { thai: "อันตรายมาก",      emoji: "⚠️",   color: "#501313" },
};

export const ACTION_LABELS: Record<ActionRecommendation, string> = {
  highly_recommended: "แนะนำอย่างยิ่ง",
  recommended:        "แนะนำ",
  acceptable:         "พอใช้ได้",
  neutral:            "ปานกลาง",
  with_caution:       "ใช้ได้แต่ระวัง",
  avoid:              "ไม่แนะนำ",
  strictly_avoid:     "ห้ามใช้"
};

// =====================================================================
// CANDIDATE ENRICHMENT · attach scoring + display to CandidateSlot
// =====================================================================

export function enrichCandidate(
  candidate: CandidateSlot,
  activeModules: ModuleKey[],
  activityType: ActivityType
): CandidateSlot {
  const scoring = combineScores(candidate.modules, activeModules, activityType);

  // Build display badges
  const badges = [
    ...scoring.reasonsUp.slice(0, 3).map(r => ({
      type: "auspicious" as const,
      text: r.thai,
      module: r.source,
      delta: r.delta
    })),
    ...scoring.warnings.slice(0, 2).map(r => ({
      type: "warning" as const,
      text: r.thai,
      module: r.source,
      delta: r.delta
    }))
  ];

  // Generate summary
  const tierInfo = TIER_LABELS[scoring.tier];
  const summary = `${tierInfo.emoji} ${tierInfo.thai} · คะแนน ${scoring.finalScore}`;

  // Generate guardrails
  const guardrails: string[] = [];
  if (scoring.warnings.length > 0) {
    guardrails.push(`มีคำเตือน ${scoring.warnings.length} ข้อ · ตรวจสอบก่อนใช้`);
  }
  if (scoring.caps.length > 0) {
    guardrails.push(`Score ถูกจำกัด: ${scoring.caps.map(c => c.reason).join(", ")}`);
  }

  return {
    ...candidate,
    scoring,
    display: {
      badges,
      summary,
      guardrails
    }
  };
}
