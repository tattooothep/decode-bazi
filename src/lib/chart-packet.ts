/**
 * 📦 Structured Chart Packet (Step 1 Lite) · source of truth สำหรับ AI ซินแส
 *
 * ════════════════════ HARD RULE (ห้ามฝ่าฝืน) ════════════════════
 * 1. ChartPacket (object นี้) = source of truth · ภาษาไทยทุกบรรทัดเป็น "presentation layer" เท่านั้น
 *    → renderChartPrompt() ต้อง render จาก field ใน packet เท่านั้น · ห้ามเขียนไทยมือเปล่า/Thai-only
 * 2. ไฟล์นี้เป็น read-only consumer ของ ext (chart-extensions) + calc (bazi-calc)
 *    → ห้ามคำนวณดวงเอง · ห้ามตัดสินดวงใหม่ · ห้ามแตะ wrapper-7 หรือ engine Layer 0-2
 * 3. ห้ามใส่ strengthScore (ตัวเลข %) ลงใน packet หรือ render
 * 4. ห้ามทำ full resolver · resolverStatus ใช้แค่ flag transformed ที่ engine มีอยู่แล้ว
 * 5. ห้ามให้ AI / packet นี้ "คำนวณเสา" · packet แค่ map ค่าจาก engine ออกมาเป็น structure
 * 6. usefulGodImpact / affectedTopicsLite = mapping เบา ๆ เท่านั้น · ห้ามสรุปดี-ร้าย
 * ════════════════════════════════════════════════════════════════
 */
import type { calcBazi } from "./bazi-calc";
import type { buildChartExtensions } from "./chart-extensions";
import { getDaymasterProfile } from "./daymaster-profile";

type Calc = Awaited<ReturnType<typeof calcBazi>>;
type Ext = ReturnType<typeof buildChartExtensions>;

export type ElementEN = "wood" | "fire" | "earth" | "metal" | "water";
type PillarKey = "year" | "month" | "day" | "hour";

/* zh interaction type ที่ engine ส่งมาจริง (รวม fan/fu yin variant) */
export type InteractionTypeZh =
  | "六沖" | "六合" | "六害" | "六破" | "五合" | "天克"
  | "伏吟" | "反吟" | "三合" | "三會" | "半合";

export type Interaction = {
  /** zh type จริงจาก engine */
  type: InteractionTypeZh;
  participants: Array<{ pillar: string; token: string }>;
  /** ธาตุที่เกี่ยวข้องกับปฏิกิริยา (derived จาก engine · ไม่ใช่การตัดสินใหม่) */
  reactionElements: ElementEN[];
  /** เรือนที่ได้รับผล (จาก pillars_pair → palace zh) */
  affectedPalaces: string[];
  /** หัวข้อชีวิตแบบเบา (mapping ตายตัวจาก pillar) */
  affectedTopicsLite: string[];
  /** เทียบ reactionElements ∩ yong/xi/ji · ห้ามสรุปดี-ร้าย */
  usefulGodImpact: {
    hitsYong: boolean;
    hitsXi: boolean;
    hitsJi: boolean;
    confidence: "derived";
  };
  /** flag transformed ที่ engine มี (五合) เท่านั้น · ไม่ทำ resolver เอง */
  resolverStatus: "none" | "transformed";
  /** อ่านตามคัมภีร์ · ยังไม่ฟันธง → AI เติมเอง */
  aiReadingHint: null;
};

export type ChartPacket = {
  /* ── version/level lock ── */
  packetVersion: "hourkey-chart-packet-lite-v1.0";
  packetLevel: "step1_lite";
  /* ⚠️ ยังไม่อยู่ใน Step 1 Lite (สงวนไว้ v1.1 / Step B-C) — ห้ามถือว่า "หาย":
   *   - timePillarConfidence
   *   - dayMasterStrength / stemRootStatus
   *   - strengthScore / positionWeight
   *   - resolvedInteractions / interactionConflicts
   *   - 合化 grading · 貪合忘冲 · 墓库 open-close
   *   - rootMultiplier
   * (ทั้งหมดต้องรอ engine resolver + ซินแส calibrate · ดู roadmap memory) */
  meta: {
    mode: "4p";
    dayMaster: string;
    dmElement: ElementEN | "unknown";
    dmPolarity: "yang" | "yin";
    ageNow: number;
    readingOrder: string;
  };
  pillars: Array<{
    key: PillarKey;
    stem: string;
    branch: string;
    tenGod: string;
    hiddenStems: Array<{ stem: string; element: ElementEN | "unknown"; tenGod: string }>;
    qiPhase: { dm: string | null; pillar: string | null };
    palaceZh: string;
    nayinZh: string;
    stars: string[];
  }>;
  structure: {
    label: string;
    special: { typeZh: string; friendly: string[] } | null;
  };
  usefulGods: {
    /** rank1 useful element */
    yong: ElementEN[];
    /** rank2-3 useful elements */
    xi: ElementEN[];
    /** ext.jishen.elements (ธาตุที่ระบบจัดเป็นธาตุระวัง · ไม่ใช่คำตัดสินสุดท้ายของซินแส) */
    ji: ElementEN[];
    method: "derived_from_engine_top3_useful_elements";
    confidence: "engine_derived_not_sifu_final";
  };
  elementProfile: {
    counts: { wood: number; fire: number; earth: number; metal: number; water: number };
    /** level key เท่านั้น · ห้ามใส่ % ตัวเลขโชว์ */
    voytekLevel: string;
  };
  currentLuck: {
    stem: string;
    branch: string;
    element: ElementEN;
    ageStart: number;
    ageEnd: number;
  } | null;
  annualPillar: { stem: string; branch: string };
  interactions: {
    status: "resolved_partial" | "raw_only" | "none_detected";
    raw: Interaction[];
  };
  luckInteractions: Interaction[];
  annualInteractions: Interaction[];
  profile?: {
    daymaster?: string;
    /** ตัวตนเชิงลึก (Sesheta · getDaymasterProfile) · presentation พร้อมใช้ */
    daymasterDeep?: string;
    fiveStructure?: string;
    careerIndustries?: string[];
    health?: string;
  };
  kongWang: {
    dayVoids: string[];
    yearVoids: string[];
  };
  timeline: string[];
  aiResponsePolicy: {
    sourceOfTruth: "chartPacket";
    noPercent: true;
    noPillarGuess: true;
    selectEvidence: { min: number; max: number };
    showFullChecklist: false;
  };
  degraded?: boolean;
};

/* ─────────────── maps (private · ไม่กระทบ engine) ─────────────── */
const PILLAR_KEYS: PillarKey[] = ["year", "month", "day", "hour"];
const PILLAR_ZH: Record<PillarKey, string> = { year: "年", month: "月", day: "日", hour: "時" };
const PILLAR_EN_TH: Record<PillarKey, string> = { year: "เสาปี", month: "เสาเดือน", day: "เสาวัน", hour: "เสายาม" };

const STEM_ELEMENT: Record<string, ElementEN> = {
  甲: "wood", 乙: "wood", 丙: "fire", 丁: "fire", 戊: "earth", 己: "earth",
  庚: "metal", 辛: "metal", 壬: "water", 癸: "water",
};
const STEM_POLARITY: Record<string, "yang" | "yin"> = {
  甲: "yang", 乙: "yin", 丙: "yang", 丁: "yin", 戊: "yang", 己: "yin",
  庚: "yang", 辛: "yin", 壬: "yang", 癸: "yin",
};
/* สร้าง BRANCH_ELEMENT เองในไฟล์นี้ (ของ chart-extensions เป็น private) */
const BRANCH_ELEMENT: Record<string, ElementEN> = {
  子: "water", 丑: "earth", 寅: "wood", 卯: "wood", 辰: "earth", 巳: "fire",
  午: "fire", 未: "earth", 申: "metal", 酉: "metal", 戌: "earth", 亥: "water",
};
const HIDDEN_STEMS_MAP: Record<string, string[]> = {
  子: ["癸"], 丑: ["己", "癸", "辛"], 寅: ["甲", "丙", "戊"], 卯: ["乙"],
  辰: ["戊", "乙", "癸"], 巳: ["丙", "戊", "庚"], 午: ["丁", "己"], 未: ["己", "丁", "乙"],
  申: ["庚", "壬", "戊"], 酉: ["辛"], 戌: ["戊", "辛", "丁"], 亥: ["壬", "甲"],
};
/* set ของ 三合 / 三會 → element (จาก SAN_HE_SETS / SAN_HUI_SETS ใน engine) */
const SAN_HE_ELEMENT: Record<string, ElementEN> = {
  "申子辰": "water", "亥卯未": "wood", "寅午戌": "fire", "巳酉丑": "metal",
};
const SAN_HUI_ELEMENT: Record<string, ElementEN> = {
  "寅卯辰": "wood", "巳午未": "fire", "申酉戌": "metal", "亥子丑": "water",
};

const ELEMENT_TH: Record<string, string> = { wood: "ไม้", fire: "ไฟ", earth: "ดิน", metal: "ทอง", water: "น้ำ", unknown: "-" };
const POLARITY_TH: Record<string, string> = { yang: "หยาง", yin: "หยิน" };
const STEM_TH: Record<string, string> = {
  甲: "ไม้หยาง", 乙: "ไม้หยิน", 丙: "ไฟหยาง", 丁: "ไฟหยิน", 戊: "ดินหยาง", 己: "ดินหยิน",
  庚: "ทองหยาง", 辛: "ทองหยิน", 壬: "น้ำหยาง", 癸: "น้ำหยิน",
};
const BRANCH_TH_NAME: Record<string, string> = {
  子: "ชวด", 丑: "ฉลู", 寅: "ขาล", 卯: "เถาะ", 辰: "มะโรง", 巳: "มะเส็ง",
  午: "มะเมีย", 未: "มะแม", 申: "วอก", 酉: "ระกา", 戌: "จอ", 亥: "กุน",
};
const TEN_GOD_TH: Record<string, string> = {
  比肩: "ดาวเพื่อนร่วมแรง", 劫財: "ดาวแย่งทรัพย์", 食神: "ดาวความสามารถ", 傷官: "ดาวแสดงออก",
  偏財: "ดาวทรัพย์นอกระบบ", 正財: "ดาวทรัพย์ตรง", 七殺: "ดาวแรงกดดัน", 正官: "ดาวระเบียบอำนาจ",
  偏印: "ดาวครูแปลกทาง", 正印: "ดาวครูผู้ใหญ่", 日主: "ตัวตนหลัก",
};
/* zh interaction type → ไทย (presentation เท่านั้น) */
const INTERACTION_TH: Record<string, string> = {
  六沖: "แรงปะทะ (六沖)", 六合: "แรงประสาน (六合)", 六害: "แรงแทรก (六害)", 六破: "แรงแตก (六破)",
  五合: "แรงรวมตัวก้านฟ้า (五合)", 天克: "แรงขัดก้านฟ้า (天克)",
  伏吟: "แรงซ้ำเรื่องเดิม (伏吟)", 反吟: "แรงพลิกเรื่องเดิม (反吟)",
  三合: "แรงรวมหมู่ (三合)", 三會: "แรงรวมทิศ (三會)", 半合: "แรงรวมครึ่ง (半合)",
};

const ELEMENT_PRODUCES: Record<ElementEN, ElementEN> = {
  wood: "fire", fire: "earth", earth: "metal", metal: "water", water: "wood",
};
const ELEMENT_CONTROLS: Record<ElementEN, ElementEN> = {
  wood: "earth", earth: "water", water: "fire", fire: "metal", metal: "wood",
};

function tenGodOf(dayMaster: string, targetStem: string): string | null {
  const dmEl = STEM_ELEMENT[dayMaster];
  const tEl = STEM_ELEMENT[targetStem];
  if (!dmEl || !tEl) return null;
  const samePol = STEM_POLARITY[dayMaster] === STEM_POLARITY[targetStem];
  if (dmEl === tEl) return samePol ? "比肩" : "劫財";
  if (ELEMENT_PRODUCES[dmEl] === tEl) return samePol ? "食神" : "傷官";
  if (ELEMENT_CONTROLS[dmEl] === tEl) return samePol ? "偏財" : "正財";
  if (ELEMENT_CONTROLS[tEl] === dmEl) return samePol ? "七殺" : "正官";
  if (ELEMENT_PRODUCES[tEl] === dmEl) return samePol ? "偏印" : "正印";
  return null;
}
function tenGodLabelTh(stem: string, dayMaster: string): string {
  const tg = stem === dayMaster ? "日主" : tenGodOf(dayMaster, stem);
  return tg ? (TEN_GOD_TH[tg] || tg) : "-";
}
function elementTh(e: string): string {
  return ELEMENT_TH[e] || e;
}

/* topic mapping เบา ๆ (ตายตัวต่อ pillar) · ห้ามตีความเกินนี้ */
const TOPIC_LITE: Record<string, string[]> = {
  year: ["ภาพรวม", "วัยเด็ก"],
  month: ["อาชีพ", "พ่อแม่"],
  day: ["ตัวตน", "คู่ครอง"],
  hour: ["ลูก", "บั้นปลาย"],
};

/* ──────── helper: สร้าง Interaction object จาก reactionElements ──────── */
function makeImpact(reaction: ElementEN[], yong: ElementEN[], xi: ElementEN[], ji: ElementEN[]): Interaction["usefulGodImpact"] {
  return {
    hitsYong: reaction.some((e) => yong.includes(e)),
    hitsXi: reaction.some((e) => xi.includes(e)),
    hitsJi: reaction.some((e) => ji.includes(e)),
    confidence: "derived",
  };
}
function palacesFromPillars(pillars: string[], palaceZh: Record<string, string>): string[] {
  return Array.from(new Set(pillars.map((p) => palaceZh[p]).filter(Boolean)));
}
function topicsFromPillars(pillars: string[]): string[] {
  return Array.from(new Set(pillars.flatMap((p) => TOPIC_LITE[p] || [])));
}

/* ════════════════════════════════════════════════════════════════
 * buildStructuredChartPacket · map ext/calc → ChartPacket (4p เท่านั้น)
 * ════════════════════════════════════════════════════════════════ */
export function buildStructuredChartPacket(
  calc: Calc,
  ext: Ext,
  dm: string,
  ageNow: number,
  g: Record<string, string>,
): ChartPacket {
  const dmElement = STEM_ELEMENT[dm] || "unknown";
  const dmPolarity = STEM_POLARITY[dm] || "yang";

  /* palace zh lookup (จาก ext.palace_readings) */
  const palaceZhMap: Record<string, string> = {};
  for (const k of PILLAR_KEYS) palaceZhMap[k] = ext.palace_readings[k]?.zh || PILLAR_ZH[k];

  /* ─── usefulGods (engine-derived · ไม่ใช่คำตัดสินสุดท้ายของซินแส) ───
   * normalize เป็น element มาตรฐาน (lowercase EN 5 ธาตุ) + dedupe + exclude ลำดับ
   * กฎ: ธาตุเดียวห้ามอยู่ทั้งกลุ่มช่วยและกลุ่มระวังพร้อมกัน
   *   yong(หลัก) → xi exclude yong → ji exclude (yong∪xi) */
  const VALID = new Set<ElementEN>(["wood", "fire", "earth", "metal", "water"]);
  const norm = (arr: unknown[]): ElementEN[] =>
    Array.from(new Set(arr.map((e) => String(e).toLowerCase() as ElementEN).filter((e) => VALID.has(e))));
  const ys = calc.yongshen || [];
  const yong = norm(ys.slice(0, 1).map((y) => y.element));
  const xi = norm(ys.slice(1, 3).map((y) => y.element)).filter((e) => !yong.includes(e));
  const ji = norm(ext.jishen?.elements || []).filter((e) => !yong.includes(e) && !xi.includes(e));

  /* ─── pillars ─── */
  const pillars: ChartPacket["pillars"] = PILLAR_KEYS.map((k) => {
    const p = calc.pillars[k];
    const stem = p?.stem || "-";
    const branch = p?.branch || "-";
    const tenGodZh = k === "day" ? "日主" : (ext.ten_gods_map[k]?.ten_god || "");
    const tenGod = tenGodZh ? (TEN_GOD_TH[tenGodZh] || tenGodZh) : "-";
    const hiddenStems = (HIDDEN_STEMS_MAP[branch] || []).map((h) => ({
      stem: h,
      element: (STEM_ELEMENT[h] || "unknown") as ElementEN | "unknown",
      tenGod: tenGodLabelTh(h, dm),
    }));
    const phase = ext.three_phases[k];
    const stars = (ext.special_stars[k] || []).map((s) => s.th || s.zh).slice(0, 3);
    const ny = ext.nayin[k];
    return {
      key: k,
      stem,
      branch,
      tenGod,
      hiddenStems,
      qiPhase: { dm: phase?.dm ?? null, pillar: phase?.pillar ?? null },
      palaceZh: palaceZhMap[k],
      nayinZh: ny ? (ny.zh || ny.en || "-") : "-",
      stars,
    };
  });

  /* ─── interactions (raw) ─── */
  const raw: Interaction[] = [];

  /* branch interactions (六沖/六合/六害/六破) */
  for (const i of ext.interactions) {
    const [pa, pb] = i.pillars_pair;
    const [ba, bb] = i.pair;
    const reaction = Array.from(new Set([BRANCH_ELEMENT[ba], BRANCH_ELEMENT[bb]].filter(Boolean))) as ElementEN[];
    raw.push({
      type: i.type as InteractionTypeZh,
      participants: [{ pillar: pa, token: ba }, { pillar: pb, token: bb }],
      reactionElements: reaction,
      affectedPalaces: palacesFromPillars([pa, pb], palaceZhMap),
      affectedTopicsLite: topicsFromPillars([pa, pb]),
      usefulGodImpact: makeImpact(reaction, yong, xi, ji),
      resolverStatus: "none",
      aiReadingHint: null,
    });
  }

  /* stem interactions (五合/天克) */
  for (const i of ext.stem_interactions) {
    const [pa, pb] = i.pillars_pair;
    const [sa, sb] = i.pair;
    let reaction: ElementEN[];
    if (i.type === "五合") {
      reaction = i.transformed && i.element
        ? [i.element as ElementEN]
        : (Array.from(new Set([STEM_ELEMENT[sa], STEM_ELEMENT[sb]].filter(Boolean))) as ElementEN[]);
    } else {
      reaction = Array.from(new Set([STEM_ELEMENT[sa], STEM_ELEMENT[sb]].filter(Boolean))) as ElementEN[];
    }
    raw.push({
      type: i.type as InteractionTypeZh,
      participants: [{ pillar: pa, token: sa }, { pillar: pb, token: sb }],
      reactionElements: reaction,
      affectedPalaces: palacesFromPillars([pa, pb], palaceZhMap),
      affectedTopicsLite: topicsFromPillars([pa, pb]),
      usefulGodImpact: makeImpact(reaction, yong, xi, ji),
      resolverStatus: i.type === "五合" && i.transformed ? "transformed" : "none",
      aiReadingHint: null,
    });
  }

  /* combinations 三合 / 三會 / 半合 */
  for (const set of ext.combinations.san_he) {
    const key = set.slice().sort((a, b) => "申子辰亥卯未寅午戌巳酉丑".indexOf(a) - "申子辰亥卯未寅午戌巳酉丑".indexOf(b)).join("");
    // หา element โดยเทียบ subset ของ SAN_HE set จริง
    const el = sanSetElement(set, SAN_HE_ELEMENT);
    raw.push({
      type: "三合",
      participants: set.map((b) => ({ pillar: "-", token: b })),
      reactionElements: el ? [el] : [],
      affectedPalaces: [],
      affectedTopicsLite: ["ภาพรวม"],
      usefulGodImpact: makeImpact(el ? [el] : [], yong, xi, ji),
      resolverStatus: "none",
      aiReadingHint: null,
    });
    void key;
  }
  for (const set of ext.combinations.san_hui) {
    const el = sanSetElement(set, SAN_HUI_ELEMENT);
    raw.push({
      type: "三會",
      participants: set.map((b) => ({ pillar: "-", token: b })),
      reactionElements: el ? [el] : [],
      affectedPalaces: [],
      affectedTopicsLite: ["ภาพรวม"],
      usefulGodImpact: makeImpact(el ? [el] : [], yong, xi, ji),
      resolverStatus: "none",
      aiReadingHint: null,
    });
  }
  for (const bh of ext.combinations.ban_he) {
    const [pa, pb] = bh.pillars_pair;
    const reaction = [bh.element as ElementEN];
    raw.push({
      type: "半合",
      participants: [{ pillar: pa, token: bh.pair[0] }, { pillar: pb, token: bh.pair[1] }],
      reactionElements: reaction,
      affectedPalaces: palacesFromPillars([pa, pb], palaceZhMap),
      affectedTopicsLite: topicsFromPillars([pa, pb]),
      usefulGodImpact: makeImpact(reaction, yong, xi, ji),
      resolverStatus: "none",
      aiReadingHint: null,
    });
  }

  /* fan/fu yin (伏吟/反吟 · normalize variant → base zh) */
  for (const f of ext.fan_yin_fu_yin) {
    const baseZh: InteractionTypeZh = f.type.includes("反吟") ? "反吟" : "伏吟";
    const pa = f.natal_pillar, pb = f.other_pillar;
    const reaction = Array.from(new Set([
      BRANCH_ELEMENT[f.natal.branch], BRANCH_ELEMENT[f.other.branch],
    ].filter(Boolean))) as ElementEN[];
    raw.push({
      type: baseZh,
      participants: [
        { pillar: pa, token: `${f.natal.stem}${f.natal.branch}` },
        { pillar: pb, token: `${f.other.stem}${f.other.branch}` },
      ],
      reactionElements: reaction,
      affectedPalaces: palacesFromPillars([pa, pb], palaceZhMap),
      affectedTopicsLite: topicsFromPillars([pa, pb]),
      usefulGodImpact: makeImpact(reaction, yong, xi, ji),
      resolverStatus: "none",
      aiReadingHint: null,
    });
  }

  const anyTransformed = raw.some((r) => r.resolverStatus === "transformed");
  const interactionStatus: ChartPacket["interactions"]["status"] =
    raw.length === 0 ? "none_detected" : (anyTransformed ? "resolved_partial" : "raw_only");

  /* ─── currentLuck ─── */
  const lp = ext.luck_pillars[ext.current_luck_idx];
  const currentLuck: ChartPacket["currentLuck"] = lp
    ? { stem: lp.stem, branch: lp.branch, element: lp.element, ageStart: lp.age_start, ageEnd: lp.age_end }
    : null;

  /* ─── luckInteractions (LP × natal · จาก lp_natal_interactions)
   *   หนึ่ง entry มีได้หลาย types[] (ก้าน+กิ่ง) → แตกเป็น Interaction ต่อ type ─── */
  const luckInteractions: Interaction[] = [];
  for (const li of ext.lp_natal_interactions || []) {
    for (const tRaw of li.types) {
      const t = normalizeLpType(tRaw);
      const isStem = t === "五合" || t === "天克";
      /* engine encode element/set ไว้ใน suffix หลัง "·" (เช่น 半合·water · 三合·申子辰) → ใช้เป็น truth */
      const suffix = tRaw.includes("·") ? tRaw.split("·")[1] : "";
      /* ก้านฟ้า → token เป็น stem · กิ่งดิน → token เป็น branch */
      const lpToken = isStem ? li.lp.stem : li.lp.branch;
      const natalToken = isStem ? li.natal.stem : li.natal.branch;
      let reaction: ElementEN[];
      if (t === "半合") {
        /* suffix = element โดยตรง (จาก BAN_HE_PAIRS) */
        reaction = (["wood", "fire", "earth", "metal", "water"].includes(suffix) ? [suffix as ElementEN] : []);
      } else if (t === "三合" || t === "三會") {
        /* suffix = set เต็ม (เช่น 申子辰) → element จากตาราง set */
        const setEl = t === "三合" ? SAN_HE_ELEMENT[suffix] : SAN_HUI_ELEMENT[suffix];
        reaction = setEl ? [setEl] : [];
      } else if (isStem) {
        reaction = Array.from(new Set([STEM_ELEMENT[li.lp.stem], STEM_ELEMENT[li.natal.stem]].filter(Boolean))) as ElementEN[];
      } else {
        /* 六沖/六合/六害/六破 → 2 ธาตุ branch */
        reaction = Array.from(new Set([BRANCH_ELEMENT[li.lp.branch], BRANCH_ELEMENT[li.natal.branch]].filter(Boolean))) as ElementEN[];
      }
      luckInteractions.push({
        type: t,
        participants: [
          { pillar: "luck", token: lpToken },
          { pillar: li.natal_pillar, token: natalToken },
        ],
        reactionElements: reaction,
        affectedPalaces: palacesFromPillars([li.natal_pillar], palaceZhMap),
        affectedTopicsLite: Array.from(new Set(["วัยจร", ...(TOPIC_LITE[li.natal_pillar] || [])])),
        usefulGodImpact: makeImpact(reaction, yong, xi, ji),
        resolverStatus: "none",
        aiReadingHint: null,
      });
    }
  }

  /* ─── annualInteractions (ปีจร × เสาวัน · อ่านจาก engine: liu_nian_timeline entry ของปีปัจจุบัน)
   *   vs_day_branch[] ที่ engine ตรวจไว้แล้ว = 六沖/六合/六害/六破/半合·element (ครบทุกชนิด · ไม่คำนวณเอง) ─── */
  const annualInteractions: Interaction[] = [];
  const cyp = ext.current_year_pillar;
  if (cyp?.branch) {
    const dayBranch = calc.pillars.day?.branch;
    /* หา entry ปีปัจจุบันใน timeline (match stem+branch ของ current_year_pillar) */
    const curEntry = (ext.liu_nian_timeline || []).find(
      (e) => e.pillar.stem === cyp.stem && e.pillar.branch === cyp.branch
    );
    if (dayBranch && curEntry) {
      for (const vsRaw of curEntry.vs_day_branch) {
        const t = normalizeLpType(vsRaw);
        const suffix = vsRaw.includes("·") ? vsRaw.split("·")[1] : "";
        const reaction: ElementEN[] = t === "半合"
          ? (["wood", "fire", "earth", "metal", "water"].includes(suffix) ? [suffix as ElementEN] : [])
          : (Array.from(new Set([BRANCH_ELEMENT[cyp.branch], BRANCH_ELEMENT[dayBranch]].filter(Boolean))) as ElementEN[]);
        annualInteractions.push({
          type: t,
          participants: [
            { pillar: "annual", token: cyp.branch },
            { pillar: "day", token: dayBranch },
          ],
          reactionElements: reaction,
          affectedPalaces: palacesFromPillars(["day"], palaceZhMap),
          affectedTopicsLite: ["ปีจร", "ตัวตน"],
          usefulGodImpact: makeImpact(reaction, yong, xi, ji),
          resolverStatus: "none",
          aiReadingHint: null,
        });
      }
    }
  }

  /* ─── profile (deep · จาก ext + getDaymasterProfile) ─── */
  const profile: ChartPacket["profile"] = {};
  try {
    const dp = getDaymasterProfile(dm, { level: calc.strength?.level, percent: calc.strength?.percent });
    if (dp) profile.daymasterDeep = `(${dp.label_th}) แก่น=${dp.core} · ชีวิตจริง=${dp.real_life} · ด้านเงา=${dp.shadow} · สิ่งที่ต้องการ=${dp.needs}`;
  } catch { /* ไม่มีโปรไฟล์ → ข้าม */ }
  if (ext.five_structure?.title_th) profile.fiveStructure = `${ext.five_structure.title_th} (${ext.five_structure.zh})`;
  if (ext.career_industry?.industries_th?.length) profile.careerIndustries = ext.career_industry.industries_th;
  if (ext.health_mapping?.dm_organs_th) {
    /* strip "(Functional X%)" ที่ engine ฝังมา · กฎ noPercent ห้าม % หลุดถึง AI */
    const stripPct = (s: string) => (s || "").replace(/\s*·?\s*\(Functional[^)]*%\)/g, "").replace(/\s*\(?[0-9.]+%\)?/g, "").trim();
    const weak = (ext.health_mapping.weak_organs || []).map((w) => `${w.organs_th}(${stripPct(w.reason_th)})`).join(" · ");
    const caution = (ext.health_mapping.caution_organs || []).map((w) => `${w.organs_th}(${stripPct(w.reason_th)})`).join(" · ");
    profile.health = `อวัยวะตัวตน ${ext.health_mapping.dm_organs_th}${weak ? ` · อ่อน: ${weak}` : ""}${caution ? ` · ระวัง: ${caution}` : ""}`;
  }
  profile.daymaster = `${STEM_TH[dm] || dm} · ธาตุ${elementTh(dmElement)}แบบ${POLARITY_TH[dmPolarity]}`;

  /* ─── timeline 10-year buckets (เหมือน buildChartPacket เดิม) ─── */
  const timeline = (ext.liu_nian_timeline || [])
    .filter((x) => x.age >= 0 && x.age <= ageNow)
    .reduce<Array<{ start: number; sample: string[] }>>((acc, x) => {
      const bucketStart = Math.floor(x.age / 10) * 10;
      let bucket = acc.find((b) => b.start === bucketStart);
      if (!bucket) { bucket = { start: bucketStart, sample: [] }; acc.push(bucket); }
      if (bucket.sample.length < 2) {
        bucket.sample.push(`${x.pillar.stem}${x.pillar.branch}${x.ten_god ? `/${x.ten_god}` : ""}${x.vs_day_branch.length ? `/${x.vs_day_branch.join(",")}` : ""}`);
      }
      return acc;
    }, [])
    .map((b) => `${b.start}-${b.start + 9}:${b.sample.join("|")}`)
    .slice(0, 7);

  const packet: ChartPacket = {
    packetVersion: "hourkey-chart-packet-lite-v1.0",
    packetLevel: "step1_lite",
    meta: {
      mode: "4p",
      dayMaster: dm,
      dmElement,
      dmPolarity,
      ageNow,
      readingOrder: g.READING_ORDER || "",
    },
    pillars,
    structure: {
      label: calc.geJu?.structure || "ปกติ",
      special: ext.special_chart?.applicable
        ? { typeZh: ext.special_chart.type_zh, friendly: ext.special_chart.friendly_elements || [] }
        : null,
    },
    usefulGods: {
      yong,
      xi,
      ji,
      method: "derived_from_engine_top3_useful_elements",
      confidence: "engine_derived_not_sifu_final",
    },
    elementProfile: {
      counts: ext.element_counts,
      voytekLevel: ext.voytek_strength?.level || calc.strength?.level || "-",
    },
    currentLuck,
    annualPillar: { stem: cyp?.stem || "-", branch: cyp?.branch || "-" },
    interactions: { status: interactionStatus, raw },
    luckInteractions,
    annualInteractions,
    profile,
    kongWang: {
      dayVoids: (ext.kong_wang?.void_branches || []) as string[],
      yearVoids: (ext.kong_wang?.year_xun_voids || []) as string[],
    },
    timeline,
    aiResponsePolicy: {
      sourceOfTruth: "chartPacket",
      noPercent: true,
      noPillarGuess: true,
      selectEvidence: { min: 3, max: 5 },
      showFullChecklist: false,
    },
  };
  return packet;
}

/* หา element ของ 三合/三會 set โดยเทียบ subset กับ set เต็ม */
function sanSetElement(present: string[], table: Record<string, ElementEN>): ElementEN | null {
  for (const [full, el] of Object.entries(table)) {
    if (present.every((b) => full.includes(b))) return el;
  }
  return null;
}

/* LP-natal interaction type (zh string จาก engine types[]) → normalize (read-only) */
function normalizeLpType(t: string): InteractionTypeZh {
  if (t.includes("反吟")) return "反吟";
  if (t.includes("伏吟")) return "伏吟";
  if (t.includes("六沖") || t === "沖") return "六沖";
  if (t.includes("六合") || t === "合") return "六合";
  if (t.includes("六害")) return "六害";
  if (t.includes("六破")) return "六破";
  if (t.includes("五合")) return "五合";
  if (t.includes("天克")) return "天克";
  if (t.includes("三合")) return "三合";
  if (t.includes("三會")) return "三會";
  if (t.includes("半合")) return "半合";
  return "六合";
}

/* ════════════════════════════════════════════════════════════════
 * renderChartPrompt · ChartPacket → ข้อความไทย (presentation เท่านั้น)
 *   ทุกบรรทัด render จาก field ใน packet · คงโทน "key: value" แบบเดิม
 * ════════════════════════════════════════════════════════════════ */
export function renderChartPrompt(packet: ChartPacket): string {
  const lines: string[] = [];

  /* รายเสา */
  const pillarBlock = packet.pillars.map((p) => {
    const hidden = p.hiddenStems.length
      ? p.hiddenStems.map((h, idx) => `${idx === 0 ? "แกนหลัก" : `แรงแฝง${idx}`}:${STEM_TH[h.stem] || h.stem}/${elementTh(h.element)}/${h.tenGod}`).join(" · ")
      : "-";
    const stars = p.stars.length ? p.stars.join(" · ") : "-";
    return `${PILLAR_EN_TH[p.key]} ${PILLAR_ZH[p.key]}: ฟ้า=${STEM_TH[p.stem] || p.stem}/${p.tenGod}; ดิน=${BRANCH_TH_NAME[p.branch] || p.branch}; ธาตุซ่อน=${hidden}; วัฏจักร=ตัวตน:${p.qiPhase.dm || "-"} เสา:${p.qiPhase.pillar || "-"}; เรือน=${p.palaceZh}; ดาวประกอบเท่านั้น=${stars}; นับเสียงประกอบ=${p.nayinZh}`;
  });
  lines.push(`CHART PACKET รายเสา:\n${pillarBlock.join("\n")}`);

  /* ลำดับการอ่าน */
  if (packet.meta.readingOrder) lines.push(packet.meta.readingOrder);

  /* โครงดวง + ดวงพิเศษ */
  let structureLine = `โครงดวง: ${packet.structure.label}`;
  if (packet.structure.special) {
    structureLine += ` · ดวงพิเศษ ${packet.structure.special.typeZh}` +
      (packet.structure.special.friendly.length ? ` · ธาตุเกื้อ ${packet.structure.special.friendly.map((e) => elementTh(e)).join("·")}` : "");
  }
  lines.push(structureLine);

  /* ธาตุช่วย (engine-derived · ไม่ฟันธงดี-ร้าย) */
  const fmtEls = (arr: string[]) => arr.length ? arr.map((e) => elementTh(e)).join(" · ") : "-";
  lines.push(
    `ธาตุช่วยจากระบบ (engine-derived · ไม่ใช่คำตัดสินสุดท้ายของซินแส): ` +
    `ธาตุช่วยหลัก=${fmtEls(packet.usefulGods.yong)} · ` +
    `ธาตุช่วยรอง=${fmtEls(packet.usefulGods.xi)} · ` +
    `ธาตุที่ระบบจัดเป็นธาตุระวัง=${fmtEls(packet.usefulGods.ji)}`
  );

  /* ธาตุรวม (level key เท่านั้น · ไม่มี %) */
  const c = packet.elementProfile.counts;
  lines.push(`ธาตุรวม: ไม้ ${c.wood} · ไฟ ${c.fire} · ดิน ${c.earth} · ทอง ${c.metal} · น้ำ ${c.water} · กำลังตัวตนระดับ ${packet.elementProfile.voytekLevel} (ห้ามพูดตัวเลขเปอร์เซ็นต์)`);

  /* ช่องว่างของดวง */
  lines.push(`ช่องว่างของดวง: วัน=${packet.kongWang.dayVoids.map((b) => BRANCH_TH_NAME[b] || b).join("/") || "-"} · ปี=${packet.kongWang.yearVoids.map((b) => BRANCH_TH_NAME[b] || b).join("/") || "-"}`);

  /* วัยจร + ปีจร */
  lines.push(
    `วัยจรปัจจุบัน: ${packet.currentLuck
      ? `${STEM_TH[packet.currentLuck.stem] || packet.currentLuck.stem}/${BRANCH_TH_NAME[packet.currentLuck.branch] || packet.currentLuck.branch} อายุ ${packet.currentLuck.ageStart}-${packet.currentLuck.ageEnd} · ธาตุ${elementTh(packet.currentLuck.element)}`
      : "-"}`
  );
  lines.push(`ปีจรปัจจุบัน: ${STEM_TH[packet.annualPillar.stem] || packet.annualPillar.stem}/${BRANCH_TH_NAME[packet.annualPillar.branch] || packet.annualPillar.branch}`);

  /* ปฏิกิริยาในดวง */
  lines.push(renderInteractionGroup("ปฏิกิริยาในดวง", packet.interactions.raw, packet.interactions.status));
  if (packet.luckInteractions.length) lines.push(renderInteractionGroup("ปฏิกิริยาวัยจร×ดวงเกิด", packet.luckInteractions, "raw_only"));
  if (packet.annualInteractions.length) lines.push(renderInteractionGroup("ปฏิกิริยาปีจร×เสาวัน", packet.annualInteractions, "raw_only"));

  /* profile เชิงลึก */
  if (packet.profile) {
    if (packet.profile.daymaster) lines.push(`ตัวตนหลัก: ${packet.profile.daymaster}`);
    if (packet.profile.daymasterDeep) lines.push(`📿 ตัวตนเชิงลึก: ${packet.profile.daymasterDeep}`);
    if (packet.profile.fiveStructure) lines.push(`🏗 โครง 5 ธาตุ: ${packet.profile.fiveStructure}`);
    if (packet.profile.careerIndustries?.length) lines.push(`💼 อาชีพที่เสริมดวง: ${packet.profile.careerIndustries.join(" · ")}`);
    if (packet.profile.health) lines.push(`🩺 สุขภาพ: ${packet.profile.health}`);
  }

  /* timeline */
  lines.push(`timeline 10 ปี: ${packet.timeline.length ? packet.timeline.join(" ; ") : "-"}`);

  return lines.join("\n");
}

function renderInteractionGroup(title: string, list: Interaction[], status: string): string {
  if (!list.length) return `${title}: ไม่พบปฏิกิริยา (none_detected)`;
  const items = list.map((it) => {
    const typeTh = INTERACTION_TH[it.type] || it.type;
    const pairTxt = it.participants
      .map((p) => `${p.pillar !== "-" ? `${PILLAR_EN_TH[p.pillar as PillarKey] || p.pillar}:` : ""}${p.token}`)
      .join("↔");
    /* ธาตุดิบของปฏิกิริยา (เช่น 子午冲 = น้ำ+ไฟ) · ให้ AI เห็นว่าปะทะ/ประสานด้วยธาตุอะไร · ไม่ตัดสินดี-ร้าย */
    const reactEl = Array.from(new Set(it.reactionElements || []))
      .map((e) => elementTh(e))
      .filter((e) => e && e !== "-");
    const reactTxt = reactEl.length ? ` · กระทบธาตุ: ${reactEl.join("+")}` : "";
    const palaces = it.affectedPalaces.length ? ` · เรือน ${it.affectedPalaces.join("/")}` : "";
    const topics = it.affectedTopicsLite.length ? ` · แตะเรื่อง ${it.affectedTopicsLite.join("/")}` : "";
    const impactTags: string[] = [];
    if (it.usefulGodImpact.hitsYong) impactTags.push("แตะธาตุช่วยหลัก用神");
    if (it.usefulGodImpact.hitsXi) impactTags.push("แตะธาตุช่วยรอง");
    if (it.usefulGodImpact.hitsJi) impactTags.push("แตะธาตุระวัง忌神");
    const impact = impactTags.length ? ` · ${impactTags.join("+")} [derived]` : "";
    const transformed = it.resolverStatus === "transformed" ? " · รวมแล้ว(transformed)" : "";
    return `  - ${typeTh} ${pairTxt}${reactTxt}${palaces}${topics}${impact}${transformed} · อ่านตามคัมภีร์ ยังไม่ฟันธงดี-ร้าย`;
  });
  return `${title} [${status}]:\n${items.join("\n")}`;
}

/* ════════════════════════════════════════════════════════════════
 * validateChartPacket · warn-only (ยกเว้น SIFU_STRICT_PACKET=1 → throw)
 * ════════════════════════════════════════════════════════════════ */
export function validateChartPacket(packet: ChartPacket): { ok: boolean; degraded: boolean; warnings: string[] } {
  const warnings: string[] = [];

  if (!packet.usefulGods || packet.usefulGods.yong.length === 0) {
    warnings.push("usefulGods.yong ว่าง (ไม่มีธาตุช่วยหลักจาก engine)");
  }
  if (!packet.interactions || !Array.isArray(packet.interactions.raw)) {
    warnings.push("interactions.raw ไม่ใช่ array");
  }
  const okStatus = ["resolved_partial", "raw_only", "none_detected"];
  if (!packet.interactions || !okStatus.includes(packet.interactions.status)) {
    warnings.push(`interactions.status ไม่ถูกต้อง: ${packet.interactions?.status}`);
  }
  const pol = packet.aiResponsePolicy;
  if (!pol || pol.sourceOfTruth !== "chartPacket" || pol.noPercent !== true ||
      pol.noPillarGuess !== true || !pol.selectEvidence ||
      typeof pol.selectEvidence.min !== "number" || typeof pol.selectEvidence.max !== "number" ||
      pol.showFullChecklist !== false) {
    warnings.push("aiResponsePolicy ไม่ครบ/ไม่ถูกต้อง");
  }
  /* regression guard: ธาตุเดียวห้ามอยู่ทั้งกลุ่มช่วยและกลุ่มระวัง (yong/xi/ji แยกขาด) */
  const ug = packet.usefulGods;
  if (ug) {
    const ovYX = ug.yong.filter((e) => ug.xi.includes(e));
    const ovYJ = ug.yong.filter((e) => ug.ji.includes(e));
    const ovXJ = ug.xi.filter((e) => ug.ji.includes(e));
    if (ovYX.length || ovYJ.length || ovXJ.length) {
      warnings.push(`usefulGods ธาตุซ้ำข้ามกลุ่ม: yong∩xi=${ovYX} yong∩ji=${ovYJ} xi∩ji=${ovXJ}`);
    }
  }
  /* regression guard: render ต้องไม่มี % / undefined / {{ }} leak (Thai เป็น presentation จาก packet) */
  try {
    const rendered = renderChartPrompt(packet);
    const leak = rendered.match(/undefined|\{\{|\}\}|[0-9.]+%/);
    if (leak) warnings.push(`render leak พบ: "${leak[0]}"`);
  } catch (e) {
    warnings.push(`renderChartPrompt error: ${(e as Error).message}`);
  }
  /* regression guard: version/level lock ต้องตรง */
  if (packet.packetVersion !== "hourkey-chart-packet-lite-v1.0" || packet.packetLevel !== "step1_lite") {
    warnings.push("packetVersion/packetLevel ไม่ตรง lock");
  }

  const degraded = warnings.length > 0;
  if (degraded) {
    packet.degraded = true;
    console.warn("[chart-packet] validate degraded:", warnings.join(" | "));
    if (process.env.SIFU_STRICT_PACKET === "1") {
      throw new Error(`[chart-packet] strict validation failed: ${warnings.join(" | ")}`);
    }
  }
  return { ok: !degraded, degraded, warnings };
}
