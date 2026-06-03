import {
  BRANCH_CLASH,
  BRANCH_ELEMENT,
  ELEM_CONTROLS,
  ELEM_PRODUCES,
  LIU_HAI,
  LIU_HE,
  LIU_HE_TRANSFORM,
  LIU_PO,
  SAN_HE_GROUPS,
  SAN_HUI_GROUPS,
  STEM_CLASH,
  STEM_ELEMENT,
  STEM_HE,
  STEM_HE_TRANSFORM,
  XING_PAIRS,
  XING_SELF,
  XING_TRIPLES,
  type Person,
  type Pillar,
} from "./pair-base";

type Axis = "day" | "month" | "year" | "hour";
type ElementName = "wood" | "fire" | "earth" | "metal" | "water";
type SignalKind = "support" | "bond" | "friction" | "volatility";

export type PairReactionUseful = {
  primary?: unknown;
  yongshen?: unknown;
  primary_yongshen?: unknown;
  xishen?: unknown;
  jishen?: unknown;
  medicine?: unknown;
  diseases?: unknown;
  structureLabel?: string | null;
  structure_label?: string | null;
  engineType?: string | null;
  engine_type?: string | null;
};

export type PairReactionPerson = Person & {
  useful?: PairReactionUseful | null;
};

export type PairReactionEvent = {
  kind: SignalKind;
  tag: string;
  reason: string;
  axis: Axis;
  score: number;
  weight: number;
  element?: ElementName;
};

export type PairReactionDirection = {
  score: number;
  label: { th: string; en: string; zh: string };
  tags: string[];
  flags: string[];
  breakdown: {
    support: number;
    bond: number;
    friction: number;
    volatility: number;
    axis: Record<Axis, number>;
    useful: NormalizedUseful;
    events: PairReactionEvent[];
    raw: number;
  };
};

export type PairReactionResult = {
  version: "pair-reaction-v2";
  scores: Record<"day" | "week" | "month" | "year" | "luck" | "overall", number>;
  label: { th: string; en: string; zh: string };
  tags: string[];
  flags: string[];
  directional: {
    atob: PairReactionDirection;
    btoa: PairReactionDirection;
    mutual: number;
  };
  contexts: {
    work: number;
    love: number;
    family: number;
    team: number;
  };
  guidance: {
    confidence: number;
    primary: string;
    context: string[];
    cautions: string[];
    intent: Record<"work" | "love" | "friend", { th: string; en: string; zh: string }>;
    disclaimer: string;
  };
};

type NormalizedUseful = {
  primary: ElementName[];
  xishen: ElementName[];
  jishen: ElementName[];
  medicine: ElementName[];
  diseases: ElementName[];
  structureLabel: string | null;
  engineType: string | null;
};

type Accumulator = {
  support: number;
  bond: number;
  friction: number;
  volatility: number;
  axis: Record<Axis, number>;
  tags: Map<string, number>;
  flags: Set<string>;
  events: PairReactionEvent[];
};

const AXES: Axis[] = ["day", "month", "year", "hour"];
const AXIS_WEIGHT: Record<Axis, number> = {
  day: 1,
  month: 0.72,
  year: 0.5,
  hour: 0.45,
};
const CROSS_AXIS_RATIO = 0.42;

const ELEMENT_ALIAS: Record<string, ElementName> = {
  wood: "wood",
  fire: "fire",
  earth: "earth",
  metal: "metal",
  water: "water",
  木: "wood",
  火: "fire",
  土: "earth",
  金: "metal",
  水: "water",
  ไม้: "wood",
  ไฟ: "fire",
  ดิน: "earth",
  ทอง: "metal",
  โลหะ: "metal",
  น้ำ: "water",
};

function emptyAxis(): Record<Axis, number> {
  return { day: 0, month: 0, year: 0, hour: 0 };
}

function makeAccumulator(): Accumulator {
  return {
    support: 0,
    bond: 0,
    friction: 0,
    volatility: 0,
    axis: emptyAxis(),
    tags: new Map(),
    flags: new Set(),
    events: [],
  };
}

function normalizeElement(value: unknown): ElementName | null {
  if (!value) return null;
  if (typeof value === "object" && value && "element" in value) {
    return normalizeElement((value as any).element);
  }
  const raw = String(value).trim().toLowerCase();
  return ELEMENT_ALIAS[raw] || null;
}

function toElementList(value: unknown): ElementName[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(toElementList);
  const el = normalizeElement(value);
  return el ? [el] : [];
}

function uniqueElements(values: ElementName[]): ElementName[] {
  return Array.from(new Set(values));
}

export function normalizeUseful(useful?: PairReactionUseful | null): NormalizedUseful {
  const u = useful || {};
  return {
    primary: uniqueElements([
      ...toElementList(u.primary_yongshen),
      ...toElementList(u.primary),
      ...toElementList(u.yongshen),
    ]),
    xishen: uniqueElements(toElementList(u.xishen)),
    jishen: uniqueElements(toElementList(u.jishen)),
    medicine: uniqueElements(toElementList(u.medicine)),
    diseases: uniqueElements(toElementList(u.diseases)),
    structureLabel: u.structure_label || u.structureLabel || null,
    engineType: u.engine_type || u.engineType || null,
  };
}

function hasElement(list: ElementName[], el?: ElementName | null): boolean {
  return !!el && list.includes(el);
}

function getPillar(person: Person, axis: Axis): Pillar | undefined {
  return (person as any)[axis] as Pillar | undefined;
}

function pillarElement(pillar: Pillar | undefined, part: "stem" | "branch"): ElementName | null {
  if (!pillar) return null;
  const raw = part === "stem" ? STEM_ELEMENT[pillar.stem] : BRANCH_ELEMENT[pillar.branch];
  return normalizeElement(raw);
}

function axisPairWeight(aAxis: Axis, bAxis: Axis): number {
  const base = (AXIS_WEIGHT[aAxis] + AXIS_WEIGHT[bAxis]) / 2;
  return base * (aAxis === bAxis ? 1 : CROSS_AXIS_RATIO);
}

function signedAxisValue(kind: SignalKind, score: number): number {
  if (kind === "support") return score;
  if (kind === "bond") return score * 0.55;
  return -score;
}

function addEvent(
  acc: Accumulator,
  kind: SignalKind,
  score: number,
  tag: string,
  reason: string,
  axis: Axis,
  weight: number,
  element?: ElementName | null,
): void {
  const value = Math.max(0, Number.isFinite(score) ? score : 0);
  if (value <= 0) return;
  if (kind === "support") acc.support += value;
  if (kind === "bond") acc.bond += value;
  if (kind === "friction") acc.friction += value;
  if (kind === "volatility") acc.volatility += value;
  acc.axis[axis] += signedAxisValue(kind, value);
  acc.tags.set(tag, (acc.tags.get(tag) || 0) + 1);
  acc.events.push({
    kind,
    tag,
    reason,
    axis,
    score: Math.round(value),
    weight: Math.round(weight * 100) / 100,
    element: element || undefined,
  });
}

function addElementTendency(
  acc: Accumulator,
  useful: NormalizedUseful,
  element: ElementName | null,
  base: number,
  axis: Axis,
  tagPrefix: string,
  reason: string,
): void {
  if (!element) return;
  if (hasElement(useful.primary, element)) {
    addEvent(acc, "support", base * 1.1, `${tagPrefix}用神`, `${reason} → 用神 ${element}`, axis, base, element);
    acc.flags.add("element_tendency_yongshen");
  } else if (hasElement(useful.xishen, element)) {
    addEvent(acc, "support", base * 0.75, `${tagPrefix}喜神`, `${reason} → 喜神 ${element}`, axis, base, element);
  } else if (hasElement(useful.medicine, element)) {
    addEvent(acc, "support", base * 0.9, `${tagPrefix}藥`, `${reason} → 藥 ${element}`, axis, base, element);
    acc.flags.add("medicine_supported");
  } else if (hasElement(useful.jishen, element)) {
    addEvent(acc, "friction", base, `${tagPrefix}忌神`, `${reason} → 忌神 ${element}`, axis, base, element);
    acc.flags.add("element_tendency_jishen");
  } else if (hasElement(useful.diseases, element)) {
    addEvent(acc, "friction", base * 0.85, `${tagPrefix}病`, `${reason} → 病 ${element}`, axis, base, element);
    acc.flags.add("disease_triggered");
  }
}

function weightedElements(person: Person): Array<{ element: ElementName; axis: Axis; weight: number; source: string }> {
  const out: Array<{ element: ElementName; axis: Axis; weight: number; source: string }> = [];
  for (const axis of AXES) {
    const pillar = getPillar(person, axis);
    if (!pillar) continue;
    const stemEl = pillarElement(pillar, "stem");
    const branchEl = pillarElement(pillar, "branch");
    if (stemEl) out.push({ element: stemEl, axis, weight: AXIS_WEIGHT[axis] * 0.62, source: `${axis}.stem` });
    if (branchEl) out.push({ element: branchEl, axis, weight: AXIS_WEIGHT[axis] * 0.58, source: `${axis}.branch` });
  }
  return out;
}

function applyUsefulLayer(acc: Accumulator, aUseful: NormalizedUseful, b: Person): void {
  const elems = weightedElements(b);
  for (const item of elems) {
    if (hasElement(aUseful.primary, item.element)) {
      addEvent(acc, "support", 14 * item.weight, "用神", `${item.source} ของอีกฝ่ายเสริม 用神`, item.axis, item.weight, item.element);
    } else if (hasElement(aUseful.xishen, item.element)) {
      addEvent(acc, "support", 8 * item.weight, "喜神", `${item.source} ของอีกฝ่ายเสริม 喜神`, item.axis, item.weight, item.element);
    } else if (hasElement(aUseful.medicine, item.element)) {
      addEvent(acc, "support", 10 * item.weight, "藥", `${item.source} ของอีกฝ่ายเป็น藥`, item.axis, item.weight, item.element);
    }
    if (hasElement(aUseful.jishen, item.element)) {
      addEvent(acc, "friction", 12 * item.weight, "忌神", `${item.source} ของอีกฝ่ายกระทบ 忌神`, item.axis, item.weight, item.element);
    } else if (hasElement(aUseful.diseases, item.element)) {
      addEvent(acc, "friction", 9 * item.weight, "病", `${item.source} ของอีกฝ่ายกระตุ้น病`, item.axis, item.weight, item.element);
    }
  }
}

function applyDayElementRelation(acc: Accumulator, a: Person, b: Person): void {
  const aEl = pillarElement(a.day, "stem");
  const bEl = pillarElement(b.day, "stem");
  if (!aEl || !bEl) return;
  if (bEl === aEl) {
    addEvent(acc, "bond", 3, "比和", "ก้านวันธาตุเดียวกัน เข้าใจจังหวะกันง่าย", "day", 1, bEl);
  }
  if (ELEM_PRODUCES[bEl] === aEl) {
    addEvent(acc, "support", 8, "生我", "ธาตุก้านวันอีกฝ่ายเลี้ยงก้านวันเรา", "day", 1, bEl);
  }
  if (ELEM_CONTROLS[bEl] === aEl) {
    addEvent(acc, "friction", 8, "克我", "ธาตุก้านวันอีกฝ่ายกดก้านวันเรา", "day", 1, bEl);
  }
  if (ELEM_CONTROLS[aEl] === bEl) {
    addEvent(acc, "volatility", 4, "我克", "เราต้องใช้แรงควบคุมจังหวะอีกฝ่าย", "day", 1, bEl);
  }
  if (ELEM_PRODUCES[aEl] === bEl) {
    addEvent(acc, "volatility", 4, "我生", "เราต้องส่งพลังไปเลี้ยงอีกฝ่าย จึงมีโอกาสเหนื่อย", "day", 1, bEl);
  }
}

function isXing(aBranch: string, bBranch: string): boolean {
  if (!aBranch || !bBranch) return false;
  if (XING_SELF.includes(aBranch) && aBranch === bBranch) return true;
  if (XING_PAIRS.some(pair => pair.includes(aBranch) && pair.includes(bBranch) && aBranch !== bBranch)) return true;
  return XING_TRIPLES.some(group => group.includes(aBranch) && group.includes(bBranch) && aBranch !== bBranch);
}

function applyPillarInteractions(acc: Accumulator, a: Person, b: Person, aUseful: NormalizedUseful): void {
  for (const aAxis of AXES) {
    const aP = getPillar(a, aAxis);
    if (!aP) continue;
    for (const bAxis of AXES) {
      const bP = getPillar(b, bAxis);
      if (!bP) continue;
      const weight = axisPairWeight(aAxis, bAxis);
      const sameAxis = aAxis === bAxis;
      const axisLabel = sameAxis ? aAxis : `${aAxis}/${bAxis}`;

      if (aP.stem && bP.stem && STEM_HE[aP.stem] === bP.stem) {
        addEvent(acc, "bond", 8 * weight, sameAxis ? "天干合" : "跨柱天干合", `${axisLabel} 天干五合`, aAxis, weight);
        const tendency = normalizeElement(STEM_HE_TRANSFORM[aP.stem + bP.stem]);
        addElementTendency(acc, aUseful, tendency, 4 * weight, aAxis, "合勢", `${axisLabel} 五合傾向`);
      }
      if (aP.stem && bP.stem && STEM_CLASH[aP.stem] === bP.stem) {
        addEvent(acc, "friction", 7 * weight, sameAxis ? "天干沖" : "跨柱天干沖", `${axisLabel} 天干相沖`, aAxis, weight);
      }

      if (aP.branch && bP.branch && LIU_HE[aP.branch] === bP.branch) {
        addEvent(acc, "bond", 10 * weight, sameAxis ? "六合" : "跨柱六合", `${axisLabel} 地支六合`, aAxis, weight);
        const tendency = normalizeElement(LIU_HE_TRANSFORM[aP.branch + bP.branch]);
        addElementTendency(acc, aUseful, tendency, 4 * weight, aAxis, "六合勢", `${axisLabel} 六合傾向`);
      }
      if (aP.branch && bP.branch && BRANCH_CLASH[aP.branch] === bP.branch) {
        const aEl = pillarElement(aP, "branch");
        const bEl = pillarElement(bP, "branch");
        addEvent(acc, "friction", 13 * weight, sameAxis ? "沖" : "跨柱沖", `${axisLabel} 地支相沖`, aAxis, weight, bEl);
        if (
          hasElement(aUseful.jishen, aEl) || hasElement(aUseful.diseases, aEl) ||
          hasElement(aUseful.jishen, bEl) || hasElement(aUseful.diseases, bEl)
        ) {
          addEvent(acc, "support", 6 * weight, "沖去忌神", `${axisLabel} ปะทะสิ่งที่เป็น忌/病ของเรา`, aAxis, weight, bEl);
          acc.flags.add("clash_removes_avoid");
        }
        if (
          hasElement(aUseful.primary, aEl) || hasElement(aUseful.medicine, aEl) ||
          hasElement(aUseful.primary, bEl) || hasElement(aUseful.medicine, bEl)
        ) {
          addEvent(acc, "friction", 6 * weight, "沖動用神", `${axisLabel} ปะทะสิ่งที่เป็น用/藥ของเรา`, aAxis, weight, bEl);
          acc.flags.add("clash_hits_useful");
        }
      }
      if (aP.branch && bP.branch && LIU_HAI[aP.branch] === bP.branch) {
        addEvent(acc, "friction", 6 * weight, sameAxis ? "害" : "跨柱害", `${axisLabel} 地支相害`, aAxis, weight);
      }
      if (aP.branch && bP.branch && LIU_PO[aP.branch] === bP.branch) {
        addEvent(acc, "friction", 5 * weight, sameAxis ? "破" : "跨柱破", `${axisLabel} 地支相破`, aAxis, weight);
      }
      if (aP.branch && bP.branch && isXing(aP.branch, bP.branch)) {
        addEvent(acc, "friction", 7 * weight, sameAxis ? "刑" : "跨柱刑", `${axisLabel} 地支刑`, aAxis, weight);
      }
    }
  }
}

function branchSet(person: Person): Set<string> {
  const out = new Set<string>();
  for (const axis of AXES) {
    const b = getPillar(person, axis)?.branch;
    if (b) out.add(b);
  }
  return out;
}

function groupAxis(a: Person, branches: string[]): Axis {
  for (const axis of AXES) {
    const b = getPillar(a, axis)?.branch;
    if (b && branches.includes(b)) return axis;
  }
  return "month";
}

function applyBranchGroups(acc: Accumulator, a: Person, b: Person, aUseful: NormalizedUseful): void {
  const aBranches = branchSet(a);
  const bBranches = branchSet(b);
  const combined = new Set([...aBranches, ...bBranches]);

  const scan = (
    groups: { branches: string[]; element: string }[],
    fullTag: string,
    partialTag: string,
    fullBond: number,
    partialBond: number,
  ) => {
    for (const group of groups) {
      const count = group.branches.filter(x => combined.has(x)).length;
      const aCount = group.branches.filter(x => aBranches.has(x)).length;
      const bCount = group.branches.filter(x => bBranches.has(x)).length;
      const eachSideContributes = aCount >= 1 && bCount >= 1;
      const unionGainsNewBranch = count > Math.max(aCount, bCount);
      if (count < 2 || !eachSideContributes || !unionGainsNewBranch) continue;
      const axis = groupAxis(a, group.branches);
      const element = normalizeElement(group.element);
      if (count >= 3) {
        addEvent(acc, "bond", fullBond, fullTag, `${fullTag} ${group.branches.join("")}`, axis, 1, element);
        addElementTendency(acc, aUseful, element, fullBond * 0.35, axis, fullTag, `${fullTag} 成勢`);
      } else {
        addEvent(acc, "bond", partialBond, partialTag, `${partialTag} ${group.branches.join("")}`, axis, 0.6, element);
        addElementTendency(acc, aUseful, element, partialBond * 0.3, axis, partialTag, `${partialTag} 成勢`);
      }
    }
  };

  scan(SAN_HUI_GROUPS, "三會", "半三會", 18, 7);
  scan(SAN_HE_GROUPS, "三合", "半三合", 16, 6);
}

function cap(value: number, max: number): number {
  return Math.min(Math.max(0, value), max);
}

function softClamp(value: number): number {
  if (value > 80) return Math.min(100, 80 + (value - 80) * 0.35);
  if (value < -80) return Math.max(-100, -80 + (value + 80) * 0.35);
  return Math.max(-100, Math.min(100, value));
}

function sortedTags(acc: Accumulator): string[] {
  return Array.from(acc.tags.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([tag]) => tag);
}

export function makePairReactionLabel(score: number): { th: string; en: string; zh: string } {
  if (score >= 60) return { th: "หนุนแรง", en: "Strong support", zh: "強助" };
  if (score >= 30) return { th: "หนุนกัน", en: "Supportive", zh: "相助" };
  if (score >= 10) return { th: "พอเดินร่วมกัน", en: "Workable", zh: "可行" };
  if (score >= -10) return { th: "กลาง", en: "Neutral", zh: "中性" };
  if (score >= -30) return { th: "ต้องวางจังหวะ", en: "Needs care", zh: "慎" };
  if (score >= -60) return { th: "ปะทะชัด", en: "Friction", zh: "沖" };
  return { th: "ปะทะแรง", en: "Severe friction", zh: "重沖" };
}

function scoreDirection(a: PairReactionPerson, b: PairReactionPerson): PairReactionDirection {
  const acc = makeAccumulator();
  const useful = normalizeUseful(a.useful);

  applyUsefulLayer(acc, useful, b);
  applyDayElementRelation(acc, a, b);
  applyPillarInteractions(acc, a, b, useful);
  applyBranchGroups(acc, a, b, useful);

  const support = cap(acc.support, 88);
  const bond = cap(acc.bond, 78);
  const friction = cap(acc.friction, 92);
  const volatility = cap(acc.volatility, 28);
  const mixedPenalty = support >= 28 && friction >= 28 ? Math.min(12, (support + friction) / 14) : 0;
  const raw = support + bond * 0.55 - friction - volatility - mixedPenalty;
  const score = Math.round(softClamp(raw));
  const events = acc.events
    .slice()
    .sort((aEvent, bEvent) => bEvent.score - aEvent.score)
    .slice(0, 18);

  if (mixedPenalty) acc.flags.add("mixed_high_signal");
  if (!useful.primary.length && !useful.xishen.length && !useful.jishen.length) acc.flags.add("useful_missing");

  return {
    score,
    label: makePairReactionLabel(score),
    tags: sortedTags(acc),
    flags: Array.from(acc.flags),
    breakdown: {
      support: Math.round(support),
      bond: Math.round(bond),
      friction: Math.round(friction),
      volatility: Math.round(volatility + mixedPenalty),
      axis: {
        day: Math.round(acc.axis.day),
        month: Math.round(acc.axis.month),
        year: Math.round(acc.axis.year),
        hour: Math.round(acc.axis.hour),
      },
      useful,
      events,
      raw: Math.round(raw),
    },
  };
}

function frameScore(direction: PairReactionDirection, axes: Axis[], axisWeight: number): number {
  const axisSignal = axes.reduce((sum, axis) => sum + (direction.breakdown.axis[axis] || 0), 0) / Math.max(1, axes.length);
  return Math.round(softClamp(direction.score * (1 - axisWeight) + axisSignal * axisWeight));
}

function buildScores(direction: PairReactionDirection): PairReactionResult["scores"] {
  const day = frameScore(direction, ["day"], 0.38);
  const week = frameScore(direction, ["day", "month"], 0.32);
  const month = frameScore(direction, ["month"], 0.34);
  const year = frameScore(direction, ["year"], 0.32);
  const luck = Math.round(softClamp(direction.score));
  const overall = Math.round((day + week + month + year + luck) / 5);
  return { day, week, month, year, luck, overall };
}

function buildContexts(atob: PairReactionDirection, btoa: PairReactionDirection): PairReactionResult["contexts"] {
  const mutual = (atob.score + btoa.score) / 2;
  const dayBlend = ((atob.breakdown.axis.day || 0) + (btoa.breakdown.axis.day || 0)) / 2;
  const monthBlend = ((atob.breakdown.axis.month || 0) + (btoa.breakdown.axis.month || 0)) / 2;
  const yearBlend = ((atob.breakdown.axis.year || 0) + (btoa.breakdown.axis.year || 0)) / 2;
  return {
    work: Math.round(softClamp(mutual * 0.72 + monthBlend * 0.28)),
    love: Math.round(softClamp(mutual * 0.68 + dayBlend * 0.32)),
    family: Math.round(softClamp(mutual * 0.7 + yearBlend * 0.3)),
    team: Math.round(softClamp(mutual * 0.75 + (monthBlend + yearBlend) * 0.125)),
  };
}

function intentValue(score: number, mode: "work" | "love" | "friend"): { th: string; en: string; zh: string } {
  if (score >= 25) {
    if (mode === "work") return { th: "เหมาะร่วมงาน มีแรงส่ง", en: "Good for work", zh: "宜共事" };
    if (mode === "love") return { th: "เปิดใจได้ แต่ต้องคุยตรง", en: "Open, with clear talks", zh: "宜情但須明" };
    return { th: "เป็นเพื่อนที่หนุนกัน", en: "Supportive friend", zh: "宜友" };
  }
  if (score >= -15) {
    if (mode === "work") return { th: "ทำได้ถ้าแบ่งบทบาทชัด", en: "OK with clear roles", zh: "明分工則可" };
    if (mode === "love") return { th: "ดูจังหวะ อย่าเร่ง", en: "Go slowly", zh: "視時機" };
    return { th: "คบได้แบบมีระยะ", en: "Keep healthy distance", zh: "淡交可" };
  }
  if (mode === "work") return { th: "ตั้งกติกาก่อนร่วมงาน", en: "Set rules first", zh: "先立規矩" };
  if (mode === "love") return { th: "อย่ารีบผูกมัด", en: "Do not rush commitment", zh: "慎勿急定" };
  return { th: "รักษาระยะและขอบเขต", en: "Keep boundaries", zh: "留距" };
}

function buildGuidance(
  scores: PairReactionResult["scores"],
  atob: PairReactionDirection,
  btoa: PairReactionDirection,
  contexts: PairReactionResult["contexts"],
): PairReactionResult["guidance"] {
  const overall = scores.overall;
  const mixed = atob.breakdown.support >= 28 && atob.breakdown.friction >= 28;
  const confidence = Math.max(
    0.55,
    Math.min(0.9, 0.68 + Math.abs(overall) / 220 - (mixed ? 0.1 : 0) - (atob.flags.includes("useful_missing") ? 0.08 : 0)),
  );
  const context: string[] = [];
  if (atob.tags.includes("用神") || atob.tags.includes("藥")) {
    context.push("อีกฝ่ายมีธาตุที่ช่วยพยุงโจทย์หลักของเรา ใช้ร่วมงานหรือขอแรงได้เมื่อเป้าหมายชัด");
  }
  if (atob.tags.includes("忌神") || atob.tags.includes("病")) {
    context.push("มีธาตุที่กระตุ้นจุดอ่อนไหวของเรา ต้องตั้งขอบเขตและอย่าตัดสินใจตอนอารมณ์ขึ้น");
  }
  if (atob.tags.some(tag => tag.includes("沖") || tag.includes("害") || tag.includes("刑"))) {
    context.push("มีแรงปะทะจริง เหมาะใช้กับงานที่ต้องผลักดัน แต่ไม่ควรปล่อยให้คลุมเครือ");
  }
  if (atob.tags.some(tag => tag.includes("合") || tag.includes("六合") || tag.includes("三合") || tag.includes("三會"))) {
    context.push("มีแรงดึงดูดหรือแรงประสาน ใช้ให้ดีด้วยการกำหนดบทบาทและจังหวะคุยให้ชัด");
  }
  if (Math.abs(atob.score - btoa.score) >= 24) {
    context.push("ทิศทางสองฝั่งไม่เท่ากัน ฝ่ายหนึ่งอาจรู้สึกได้ประโยชน์มากกว่าอีกฝ่าย");
  }
  if (!context.length) {
    context.push(overall >= 10 ? "ความสัมพันธ์พอเดินต่อได้ จุดสำคัญคือเลือกบริบทให้ถูก" : "ความสัมพันธ์เป็นกลางหรือมีแรงเสียดทาน ใช้ตัวเลขนี้เป็นตัวช่วยวางระยะ");
  }

  const cautions: string[] = [];
  if (mixed) cautions.push("สัญญาณบวกและลบแรงพร้อมกัน อย่าตัดสินจากความรู้สึกช่วงแรกอย่างเดียว");
  if (atob.breakdown.friction >= 45) cautions.push("มีแรงปะทะหลายชั้น ควรคุยเรื่องเงิน งาน และความคาดหวังให้ชัด");
  if (Math.abs(atob.score - btoa.score) >= 24) cautions.push("คะแนนสองทิศไม่เท่ากัน ต้องดูว่าฝ่ายไหนเสียพลังมากกว่า");

  let primary = "ใช้ได้แบบมีเงื่อนไข ต้องวางจังหวะให้ดี";
  if (overall >= 30) primary = "ความสัมพันธ์นี้มีแรงหนุน ใช้ให้เกิดผลด้วยบทบาทที่ชัด";
  else if (overall <= -30) primary = "ความสัมพันธ์นี้มีแรงปะทะชัด ต้องตั้งขอบเขตก่อนเข้าใกล้";
  else if (overall >= 10) primary = "พอเดินร่วมกันได้ แต่ต้องเลือกเรื่องและเวลาที่เหมาะ";
  else if (overall <= -10) primary = "ควรระวังจังหวะและคำพูด ความใกล้มากเกินไปทำให้เสียดสีง่าย";

  return {
    confidence: Math.round(confidence * 100) / 100,
    primary,
    context: context.slice(0, 4),
    cautions,
    intent: {
      work: intentValue(contexts.work, "work"),
      love: intentValue(contexts.love, "love"),
      friend: intentValue(contexts.team, "friend"),
    },
    disclaimer: "คะแนนนี้อ่านปฏิกิริยาดวงสองคน ไม่ใช่คำตัดสินคนดีหรือไม่ดี ผลจริงขึ้นกับเจตนา เวลา และการสื่อสาร",
  };
}

export function computePairReactionV2(input: { a: PairReactionPerson; b: PairReactionPerson; date?: string }): PairReactionResult {
  const atob = scoreDirection(input.a, input.b);
  const btoa = scoreDirection(input.b, input.a);
  const scores = buildScores(atob);
  const mutual = Math.round(softClamp((atob.score + btoa.score) / 2));
  const contexts = buildContexts(atob, btoa);
  const tags = uniqueStrings([...atob.tags, ...btoa.tags]).slice(0, 12);
  const flags = uniqueStrings([...atob.flags, ...btoa.flags]);
  const label = makePairReactionLabel(scores.overall);

  return {
    version: "pair-reaction-v2",
    scores,
    label,
    tags,
    flags,
    directional: { atob, btoa, mutual },
    contexts,
    guidance: buildGuidance(scores, atob, btoa, contexts),
  };
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}
