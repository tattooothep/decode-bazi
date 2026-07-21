/**
 * tongshu-universal.ts · คะแนน Tongshu "สากล" (黃曆) — ไม่ขึ้นกับดวง user
 * ─────────────────────────────────────────────────────────────────────
 * ใช้ในโหมด "ทั่วไป·黃曆" ของหน้า /calendar (คู่กับโหมด "ดวงฉัน·我" เดิมที่เป็น personal)
 *
 * Classical systems provide the categorical inputs. Hourkey defines the
 * numeric weights below as a deterministic product policy; those numbers are
 * not claimed to appear in 協紀辨方書.
 *
 * แกนคะแนนวัน: 建除(หลัก ±25) > 神煞(reuse summarizeStars ×0.4 cap±24) > 黃黑道(รอง ±6) > 宜忌balance(±12)
 * 6 เป้าหมาย: คะแนนวัน + tier ของ INTENTS (good+8/bad-12) · relative (ไม่หลุดคุณภาพวัน)
 */

type Tier = 'good' | 'neutral' | 'bad';
type Verdict = '大吉' | '吉' | '中和' | '凶' | '大凶';
export interface StarSummary { total: number; verdict: Verdict; }

export const CALENDAR_SCIENCE_POLICY = {
  version: "calendar-science-v2",
  classicalInputs: ["建除十二神", "黃黑道十二神", "神煞", "宜忌"],
  numericPolicy: "hourkey-weighted-score-v2",
  deterministic: true,
  aiGenerated: false,
} as const;

/* Hourkey numeric weights applied to the classical 建除 categories. */
const OFFICER_SCORE: Record<string, number> = {
  建:+10, 除:+15, 滿:+5, 满:+5, 平:+10, 定:+15, 執:+5, 执:+5,
  破:-25, 危:-20, 成:+20, 收:+10, 開:+20, 开:+20, 閉:-15, 闭:-15,
};

/* Classical category lookup; the ±6 contribution below is Hourkey policy. */
const HUANGHEI_LUCK: Record<string, '吉' | '凶'> = {
  青龍:'吉', 青龙:'吉', 明堂:'吉', 金匱:'吉', 金匮:'吉', 天德:'吉', 玉堂:'吉', 司命:'吉',
  天刑:'凶', 朱雀:'凶', 白虎:'凶', 天牢:'凶', 玄武:'凶', 元武:'凶', 勾陳:'凶', 勾陈:'凶',
};

/* Hourkey safety caps triggered by selected severe classical categories. */
const HARD_CAP_GODS: Record<string, number> = {
  月破:28, 受死:32, 四廢:32, 四废:32, 四離:38, 四离:38, 四絕:38, 四绝:38,
};

/* 6 เป้าหมาย → intent ids (จาก INTENTS) · health เพิ่ม medical (พ่อสั่ง · ไม่ bias tag เดียว) */
export const GOAL_INTENTS: Record<string, string[]> = {
  wealth: ['invest', 'loan', 'open_business'],
  career: ['start_work', 'sign_contract', 'open_business', 'negotiate'],
  love:   ['marriage', 'engagement', 'gathering'],
  family: ['move_house', 'construct', 'renovate', 'install_bed'],
  health: ['pray_heal', 'medical'],
  travel: ['travel'],
};

/* health เป็นสาย is_destruction (祈福/治病/解除) → วันร้ายยังทำได้ (协纪辨方书 破日宜療病解除) ไม่โดน cap */
const HEALTH_EXEMPT = new Set(['health']);

const TIER_ADJ: Record<Tier, number> = { good: +8, neutral: 0, bad: -12 };
const PERSONAL_TIER_ADJ: Record<Tier, number> = { good: +6, neutral: 0, bad: -18 };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const clip595 = (v: number) => Math.max(5, Math.min(95, Math.round(v)));

export type UniversalLevel = 'best' | 'good' | 'ok' | 'caution' | 'avoid';
export function universalLevel(score: number): UniversalLevel {
  /* 1 มิ.ย. tune (พ่อ APPROVE C-เข้ม): band เข้มขึ้น แก้ best เคย 47% → ~15% */
  if (score >= 84) return 'best';
  if (score >= 68) return 'good';
  if (score >= 50) return 'ok';
  if (score >= 35) return 'caution';
  return 'avoid';
}

/**
 * คะแนนวันสากล (5-95) · ไม่ขึ้นดวง user
 * @param officer    建除 (ld.getDuty().getName())
 * @param twelveStar 黃黑道十二神 (ld.getTwelveStar().getName())
 * @param summary    ผลจาก summarizeStars(godsArr) — {total, verdict}
 * @param yi/ji      宜/忌 หลัง filterYiJiByOfficer (จะ dedupe ภายใน)
 * @param godsRaw    神煞ดิบ (godsArr) สำหรับเช็ค hard-cap
 */
export function universalDayScore(
  officer: string,
  twelveStar: string,
  summary: StarSummary,
  yi: string[],
  ji: string[],
  godsRaw: string[],
): { score: number; level: UniversalLevel; hardBlocked: boolean } {
  let s = 50;
  s += OFFICER_SCORE[officer] ?? 0;
  const luck = HUANGHEI_LUCK[twelveStar];
  s += luck === '吉' ? +6 : luck === '凶' ? -6 : 0;
  /* 1 มิ.ย. tune (พ่อ APPROVE C-เข้ม): ลด神煞/宜忌ให้建除+黃黑道เป็นตัวแยกวันหลัก · แก้ saturation 95 (best เคย 47%) */
  s += clamp(Math.round((summary?.total ?? 0) * 0.28), -14, +14);
  /* 宜忌 หลัง dedupe + filter (พ่อสั่ง · กันรายการยาวผิดปกติดันคะแนน) */
  const yiN = new Set(yi).size;
  const jiN = new Set(ji).size;
  s += clamp(Math.round((yiN - jiN) * 1.2), -7, +7);

  s = clip595(s);

  /* hard cap (เอาต่ำสุดชนะ) */
  let hardBlocked = false;
  if (officer === '破') { s = Math.min(s, 30); hardBlocked = true; }
  for (const g of godsRaw || []) {
    const cap = HARD_CAP_GODS[g];
    if (cap != null) { s = Math.min(s, cap); hardBlocked = true; }
  }
  if (summary?.verdict === '大凶') { s = Math.min(s, 25); hardBlocked = true; }

  return { score: s, level: universalLevel(s), hardBlocked };
}

/**
 * คะแนน 6 เป้าหมายสากล (5-95) · relative กับคะแนนวัน
 * @param dayScore     คะแนนวันสากล (จาก universalDayScore)
 * @param status       intentStatus (computeIntentStatus → Record<id, Tier>)
 * @param hardBlocked  วันถูก hard-cap ไหม (เป้าที่ไม่ใช่ health จะ cap 35)
 */
export function universalGoals(
  dayScore: number,
  status: Record<string, Tier>,
  hardBlocked: boolean,
): Record<string, { score: number; level: UniversalLevel }> {
  const out: Record<string, { score: number; level: UniversalLevel }> = {};
  for (const [goal, ids] of Object.entries(GOAL_INTENTS)) {
    const tally = ids.reduce((a, id) => a + (TIER_ADJ[status[id] ?? 'neutral']), 0);
    let v = clip595(dayScore + clamp(tally, -20, +20));
    if (hardBlocked && !HEALTH_EXEMPT.has(goal)) v = Math.min(v, 35);
    out[goal] = { score: v, level: universalLevel(v) };
  }
  return out;
}

/**
 * Hourkey product heuristic for broad personal goals. Classical intent status
 * remains an independent input; the numeric blend is not presented as a
 * classical formula. A forbidden activity can never retain a high score.
 */
export function personalGoals(
  personalDayScore: number,
  tenGodBoost: Record<string, number>,
  status: Record<string, Tier>,
  hardBlocked: boolean,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [goal, ids] of Object.entries(GOAL_INTENTS)) {
    const tiers = ids.map((id) => status[id] ?? "neutral");
    const intentAdjustment = clamp(
      tiers.reduce((sum, tier) => sum + PERSONAL_TIER_ADJ[tier], 0),
      -24,
      16,
    );
    const boost = clamp(Number(tenGodBoost[goal] || 0), -12, 12);
    let score = clip595(personalDayScore + intentAdjustment + boost);
    if (tiers.includes("bad")) score = Math.min(score, 49);
    if (hardBlocked && !HEALTH_EXEMPT.has(goal)) score = Math.min(score, 35);
    out[goal] = score;
  }
  return out;
}

export type IntentScore = {
  score: number;
  level: UniversalLevel;
  status: Tier;
  universalScore: number;
  personalScore: number | null;
  policy: "tongshu" | "hourkey-personal-blend-v1";
};

/** Activity-specific scores used by ranked cards. */
export function scoreIntents(
  universalScore: number,
  universalStatus: Record<string, Tier>,
  personalDayScore?: number | null,
  personalStatus?: Record<string, Tier> | null,
): { universal: Record<string, IntentScore>; personal: Record<string, IntentScore> | null } {
  const universal: Record<string, IntentScore> = {};
  const personal: Record<string, IntentScore> | null = personalStatus && personalDayScore != null ? {} : null;
  const ids = new Set([...Object.keys(universalStatus), ...Object.keys(personalStatus || {})]);
  for (const id of ids) {
    const uStatus = universalStatus[id] ?? "neutral";
    let uScore = clip595(universalScore + TIER_ADJ[uStatus]);
    if (uStatus === "bad") uScore = Math.min(uScore, 39);
    universal[id] = {
      score: uScore,
      level: universalLevel(uScore),
      status: uStatus,
      universalScore,
      personalScore: null,
      policy: "tongshu",
    };
    if (personal && personalDayScore != null && personalStatus) {
      const pStatus = personalStatus[id] ?? "neutral";
      let pScore = clip595(Math.round(universalScore * 0.45 + personalDayScore * 0.55) + PERSONAL_TIER_ADJ[pStatus]);
      if (pStatus === "bad") pScore = Math.min(pScore, 34);
      personal[id] = {
        score: pScore,
        level: universalLevel(pScore),
        status: pStatus,
        universalScore,
        personalScore: personalDayScore,
        policy: "hourkey-personal-blend-v1",
      };
    }
  }
  return { universal, personal };
}

/* label 6 เป้าหมาย 3 ภาษา (ไทยนำ จีนรอง) · icon */
export const GOAL_LABELS: Record<string, { icon: string; th: string; en: string; zh: string }> = {
  wealth: { icon: '財', th: 'เงิน', en: 'Wealth', zh: '財' },
  career: { icon: '業', th: 'งาน', en: 'Career', zh: '業' },
  love:   { icon: '情', th: 'รัก', en: 'Love', zh: '情' },
  family: { icon: '家', th: 'ครอบครัว', en: 'Family', zh: '家' },
  health: { icon: '健', th: 'สุขภาพ', en: 'Health', zh: '健' },
  travel: { icon: '出', th: 'เดินทาง', en: 'Travel', zh: '出' },
};
