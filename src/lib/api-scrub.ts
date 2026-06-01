const FORMULA_TRACE_KEYS = new Set([
  "_details",
  "audit",
  "base_weight",
  "caps",
  "confidence",
  "contest_penalty",
  "contested_by",
  "debug",
  "delta",
  "distribution_score",
  "effective_weight",
  /* element_distribution = %ธาตุ ผลให้ user อ่าน (ไม่ใช่สูตรดิบ) · เจ้านายสั่งคืน · sub-key สูตร weight/finalScore ยังโดน scrub ลึกอยู่ */
  "evidence",
  "explain",
  "explain_log",
  "finalScore",
  "final_score",
  "functional_pct",
  "hs_trace",          /* element_distribution: rule-level score/classify ต่อเสา = สูตร · chart.html ไม่ใช้ */
  "net_weight",
  "position_factor",
  "reason",
  "reasonCodes",
  "reason_codes",
  "reason_en",
  "reason_th",
  "reason_zh",
  "reasons",
  "rootedness_explain",
  "rootedness_explain_v2",
  "ruleId",
  "rule_id",
  "rules",
  "score_detail",
  "scoreDetails",
  "scoring",
  "sourceIds",
  "sourceRuleIds",
  "source_ids",
  "source_rule_ids",
  "sources",
  "tiaohou_weight",
  "trace",
  "vhs_trace",         /* element_distribution: rule-level stability/score กิ่งซ่อน = สูตร · chart.html ไม่ใช้ */
  "weight",
  "weights",
]);

const YONGSHEN_PUBLIC_KEYS = [
  "stem",
  "element",
  "label",
  "label_th",
  "label_en",
  "label_zh",
  "name",
  "th",
  "en",
  "zh",
];

const YONGSHEN_V2_PUBLIC_KEYS = [
  "structure_label",
  "engine_type",
  "use_follow_override",
  "primary_yongshen",
  "xishen",
  "jishen",
  "tiaohou_required",
  "diseases",
  "medicine",
  "bridges",
  "strategy",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

function scrubValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(scrubValue);

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORMULA_TRACE_KEYS.has(key)) continue;
    out[key] = scrubValue(child);
  }
  return out;
}

export function scrubFormulaTrace<T>(payload: T): T {
  return scrubValue(payload) as T;
}

function sanitizeYongshenList(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((item) => {
    if (!isRecord(item)) return scrubValue(item);

    const out: Record<string, unknown> = {};
    for (const key of YONGSHEN_PUBLIC_KEYS) {
      const child = item[key];
      if (child !== undefined && child !== null) out[key] = scrubValue(child);
    }
    return Object.keys(out).length ? out : scrubValue(item);
  });
}

function sanitizeYongshenV2(value: unknown): unknown {
  const scrubbed = scrubValue(value);
  if (!isRecord(scrubbed)) return scrubbed;

  const out: Record<string, unknown> = {};
  for (const key of YONGSHEN_V2_PUBLIC_KEYS) {
    const child = scrubbed[key];
    if (child !== undefined && child !== null) out[key] = child;
  }

  for (const key of ["primary_yongshen", "xishen", "jishen", "tiaohou_required"]) {
    if (key in out) out[key] = sanitizeYongshenList(out[key]);
  }
  return out;
}

export function sanitizeChartPayload<T>(payload: T): T {
  const scrubbed = scrubValue(payload);
  if (!isRecord(scrubbed)) return scrubbed as T;

  if (Array.isArray(scrubbed.yongshen)) {
    scrubbed.yongshen = sanitizeYongshenList(scrubbed.yongshen);
  }

  const analysis = scrubbed.analysis;
  if (isRecord(analysis)) {
    const strengthYongshen = analysis.strength_yongshen;
    if (isRecord(strengthYongshen) && Array.isArray(strengthYongshen.yongshenFinal)) {
      strengthYongshen.yongshenFinal = sanitizeYongshenList(strengthYongshen.yongshenFinal);
    }
  }

  if (scrubbed.yongshen_v2 !== undefined && scrubbed.yongshen_v2 !== null) {
    scrubbed.yongshen_v2 = sanitizeYongshenV2(scrubbed.yongshen_v2);
  }

  return scrubbed as T;
}

export const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};
