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
import { buildConceptionPalace } from "./chart-table";
import { getDaymasterProfile } from "./daymaster-profile";

type Calc = Awaited<ReturnType<typeof calcBazi>>;
type Ext = ReturnType<typeof buildChartExtensions>;

export type ElementEN = "wood" | "fire" | "earth" | "metal" | "water";
export type RootLabel = "no_root" | "token_root" | "partial_root" | "rooted" | "strong_root";
type PillarKey = "year" | "month" | "day" | "hour";

/* zh interaction type ที่ engine ส่งมาจริง (รวม fan/fu yin variant) */
export type InteractionTypeZh =
  | "六沖" | "六合" | "六害" | "六破" | "五合" | "天克"
  | "伏吟" | "反吟" | "三合" | "三會" | "半合"
  | "自刑" | "三刑" | "子卯刑";

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
  /** lot1 · สิบเทพที่ reactionElements กระทบ (เทียบ DM) → "กระทบเรื่องอะไร" · ไม่ตัดสินดี-ร้าย */
  affectedTenGods?: Array<{ tenGod: string; tenGodTh: string; lifeTopics: string[] }>;
  /** lot2a · คำอ่านพฤติกรรมต่อคู่ (presentation · กลางๆ ไม่ฟันธง) */
  behavioralHint?: string;
  /** lot2b · ประเภทกระตุ้นเชิงจังหวะ · เฉพาะดวงจร (luck/annual) */
  timingActivationType?: "combination_active" | "clash_active" | "harm_active";
  /** lot2b · ภาพคู่กิ่งเชิงสัญลักษณ์ (巳申合水 ชุบโลหะ) */
  branchInteractionImagery?: { image: string; meaning: string };
  /** หมายเหตุการอ่าน · null = ปล่อย AI เติมเอง · string = คำกำกับ (เช่น กันนับปะทะซ้ำ 反吟/六沖) */
  aiReadingHint: string | null;
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
    qiPhase: { dm: string | null; pillar: string | null; hidden: string | null };
    palaceZh: string;
    nayinZh: string;
    /** 易卦 ของเสา (梅花易數 อากง · deterministic) · null ถ้าคำนวณไม่ได้ */
    hexZh: string | null;
    /** 神煞 ดาวพิเศษ · ส่งดี/ร้ายไปด้วยกัน AI ไม่ต้องเดา polarity */
    stars: Array<{ name: string; polarity: "good" | "bad" | "neutral" }>;
  }>;
  structure: {
    label: string;
    special: { typeZh: string; friendly: string[] } | null;
    /** ระดับความมั่นใจของโครงดวง (label จาก wrapper ge-ju · ไม่ใช่ % ตัวเลข) */
    confidence?: string | null;
  };
  /** 真太陽時 — เวลาจริงหลังแก้ลองจิจูด+สมการเวลา (จาก calc.tst) */
  trueSolarTime?: { appliedTimeStr: string; totalShiftMin: number; dayShift: number } | null;
  /** 起運 อายุเริ่มวัยจร 大運 (จาก ext.luck_pillars[0].age_start · computeStartAge) */
  startLuckAge?: number | null;
  /** 通根 รากธาตุ (wrapper-7 dmRootProfile + rootednessAll · route เรียกแล้ว map มาให้ · ฐานตัดสิน 從格/用神) */
  rootedness?: {
    dmElement: ElementEN;
    dmLabel: RootLabel;          // ราก DM: no_root/token_root/partial_root/rooted/strong_root
    isExtremelyWeak: boolean;    // DM อ่อนยิ่ง → เข้าเกณฑ์從格
    isTokenOnly: boolean;        // ราก DM บางมาก
    all: Record<ElementEN, RootLabel>;  // ราก 5 ธาตุ
  } | null;
  /** 五宮 เรือนเสริม 5 อย่าง (engine คำนวณ → packet map · เติมทีละเรือน)
   * 胎元=ทุนแต่เกิด · 命宮=บุคลิก/ทิศ · 身宮=ครึ่งหลัง/กาย · 司令=ธาตุแท้ฤดู · 小運=วัยเด็ก
   * 命宮/身宮/小運 = null เมื่อไม่มียามเกิด (3p) · ห้าม AI เดา */
  fivePalaces?: {
    taiYuan: { stem: string; branch: string; tenGod: string } | null;   // 胎元 (ไม่ต้องยาม)
    mingGong: { stem: string; branch: string; tenGod: string } | null;  // 命宮 (รอ verify สำนัก)
    shenGong: { stem: string; branch: string; tenGod: string } | null;  // 身宮 (=對宮命宮)
    siLing: { stem: string; element: ElementEN; phase: string; tenGod: string } | null; // 司令
    xiaoYun: { age1Stem: string; age1Branch: string; direction: "forward" | "backward" } | null; // 小運
  } | null;
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
  /* วัยจรทั้งชีวิต + ปีครอบ (เสริม currentLuck · ให้ AI รู้ว่าปีไหนอยู่วัยจรไหน · กันเดา三合ข้ามวัยจร) */
  luckTimeline: Array<{
    stem: string; branch: string; element: ElementEN;
    ageStart: number; ageEnd: number; yearStart: number; yearEnd: number; isCurrent: boolean;
  }>;
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
  自刑: "แรงลงโทษตัวเอง (自刑)", 三刑: "แรงลงโทษสามกิ่ง (三刑)", 子卯刑: "แรงลงโทษไร้มารยาท (子卯刑)",
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

/* ──────── lot1: สิบเทพที่ปฏิกิริยากระทบ (element → ten god → เรื่องชีวิต) ──────── */
/* ten god zh → เรื่องชีวิตไทย (mapping เบา · บอก "กระทบเรื่องอะไร" · ไม่ตัดสินดี-ร้าย) */
const LIFE_TOPICS: Record<string, string[]> = {
  正財: ["เงิน", "ทรัพย์", "คู่ครอง(ชาย)"],
  偏財: ["เงิน", "ทรัพย์", "คู่ครอง(ชาย)"],
  正官: ["งาน", "อำนาจ", "สามี(หญิง)"],
  七殺: ["งาน", "อำนาจ", "สามี(หญิง)"],
  正印: ["แม่", "การเรียน", "ที่พึ่ง", "สุขภาพ"],
  偏印: ["แม่", "การเรียน", "ที่พึ่ง", "สุขภาพ"],
  食神: ["ผลงาน", "ความสามารถ", "ลูก(หญิง)"],
  傷官: ["ผลงาน", "ความสามารถ", "ลูก(หญิง)"],
  比肩: ["เพื่อน", "หุ้นส่วน", "พี่น้อง", "การแข่งขัน"],
  劫財: ["เพื่อน", "หุ้นส่วน", "พี่น้อง", "การแข่งขัน"],
};
/* element ปลายทาง → ten god zh ที่เป็นไปได้ (คืนทั้ง yin+yang · reactionElement ไม่มี polarity จึงไม่เดาข้าง)
 * ใช้ relation เดียวกับ tenGodOf เดิม (ทิศตรงกัน) */
function tenGodOfElement(dmElement: ElementEN | "unknown", targetElement: ElementEN): string[] {
  if (dmElement === "unknown") return [];
  const dmEl = dmElement, tEl = targetElement;
  if (dmEl === tEl) return ["比肩", "劫財"];
  if (ELEMENT_PRODUCES[dmEl] === tEl) return ["食神", "傷官"];
  if (ELEMENT_CONTROLS[dmEl] === tEl) return ["偏財", "正財"];
  if (ELEMENT_CONTROLS[tEl] === dmEl) return ["七殺", "正官"];
  if (ELEMENT_PRODUCES[tEl] === dmEl) return ["偏印", "正印"];
  return [];
}
/* reactionElements → affectedTenGods · dedupe · derived ล้วน ไม่ตัดสินดี-ร้าย */
function makeTenGods(reaction: ElementEN[], dmElement: ElementEN | "unknown"): NonNullable<Interaction["affectedTenGods"]> {
  const seen = new Set<string>();
  const out: NonNullable<Interaction["affectedTenGods"]> = [];
  for (const el of reaction) {
    for (const tg of tenGodOfElement(dmElement, el)) {
      if (seen.has(tg)) continue;
      seen.add(tg);
      out.push({ tenGod: tg, tenGodTh: TEN_GOD_TH[tg] || tg, lifeTopics: LIFE_TOPICS[tg] || [] });
    }
  }
  return out;
}

/* ──────── lot2a: คำอ่านพฤติกรรมต่อคู่ + 自刑 ──────── */
const BRANCH_ORDER = "子丑寅卯辰巳午未申酉戌亥";
function sortedPairKey(a: string, b: string): string {
  return [a, b].sort((x, y) => BRANCH_ORDER.indexOf(x) - BRANCH_ORDER.indexOf(y)).join("");
}
/* key = `${zhType}|${sortedPair}` · กลางๆ ไม่ฟันธง (子午/丑未 มีในคัมภีร์แล้ว ไม่ซ้ำ) */
const BEHAVIORAL_HINT: Record<string, string> = {
  "六沖|寅申": "มักเกี่ยวกับความคิดสร้างสรรค์ปะทะกับระเบียบ/ระบบ อาจมีแรงปรับวิธีทำงานหรือโครงสร้าง",
  "六沖|卯酉": "มักเกี่ยวกับความสัมพันธ์/ภาพลักษณ์ที่ถูกแรงตัดสิน ระวังคำพูดและมาตรฐานที่แข็งเกินไป",
  "六沖|辰戌": "มักเกี่ยวกับการสั่นคลอนโครงสร้างเก่า/การเปิดของสะสมเดิม เป็นจังหวะทบทวนระบบ",
  "六沖|巳亥": "มักเกี่ยวกับการเปลี่ยนสถานที่/แนวทาง/กระบวนทัศน์ มีแรงปรับทิศ",
  "六破|巳申": "ภายนอกดูลงตัวแต่ภายในมีแรงเปลี่ยนแผน/ความไม่ไว้ใจซ่อนอยู่",
  "六破|未戌": "มักเกี่ยวกับภาระ/ทางเลือกที่คล้ายกันแย่งศูนย์ถ่วงกัน ตัดสินใจได้ยาก ระบบเดิมเริ่มร้าว",
  "六害|子未": "มักเกี่ยวกับการแบกภาระ/ความคาดหวังที่ไม่ตรงจริง เสี่ยงถูกเอาเปรียบ",
  "六害|丑午": "มักเกี่ยวกับความมั่นคงกับความรีบที่ชนกัน ต้องจัดจังหวะให้ลงตัว",
  "六害|寅巳": "มักเกี่ยวกับความทะเยอทะยานที่ผลักดันแต่เผากันเอง ควรคุมจังหวะของทีม",
  "六害|卯辰": "มักเกี่ยวกับรายละเอียดกับภาพรวมที่ไม่ลงรอย ควรทำขอบเขต/เอกสารให้ชัด",
  "六害|申亥": "มักเกี่ยวกับความลับ/ความระแวงที่กัดเซาะความไว้ใจ ควรทำข้อมูลให้โปร่งใส",
  "六害|酉戌": "มักเกี่ยวกับมาตรฐานสูงที่ขาดความผ่อนปรน ระวังคำวิจารณ์กระทบความร่วมมือ",
};
/* ชั้นจิตวิทยา 自刑 · key = กิ่งที่ซ้ำ · กลางๆ ไม่ฟันธง */
const SELF_PUNISH_HINT: Record<string, string> = {
  辰: "มักมีแนวโน้มคิดวนกับอดีต/ระบบ/ความทรงจำ-เอกสาร และแรงกดดันที่มาจากภายในตัวเอง",
  午: "มักมีพลังร้อนแรงในใจ ใจร้อน-พักยาก และแรงกดดันเรื่องการแสดงออก/ชื่อเสียง",
  酉: "มักมีแนวโน้มวิจารณ์ตัวเองและตั้งมาตรฐานสูง ความสัมพันธ์อาจตึงเพราะใช้ความถูกต้องเป็นเครื่องตัดสิน",
  亥: "มักมีแนวโน้มคิดลึก เก็บความลับ/ความกลัว และครุ่นคิดจนหมกมุ่น",
};

/* ──────── lot2b: timing activation + ภาพคู่กิ่ง ──────── */
const TIMING_ACTIVATION: Partial<Record<InteractionTypeZh, Interaction["timingActivationType"]>> = {
  六合: "combination_active", 三合: "combination_active", 三會: "combination_active",
  半合: "combination_active", 五合: "combination_active",
  六沖: "clash_active", 天克: "clash_active", 反吟: "clash_active",
  六害: "harm_active",
};
const TIMING_ACTIVATION_TH: Record<NonNullable<Interaction["timingActivationType"]>, string> = {
  combination_active: "ช่วงเชื่อม/พันธมิตร/เจรจา",
  clash_active: "ช่วงปรับโครงสร้าง/เปลี่ยน",
  harm_active: "ช่วงระวังเข้าใจผิด/ข้อตกลง",
};
/* 巳申合水 = ภาพชุบโลหะ · detect จาก 六合 ที่คู่มี 巳+申 (token อาจเป็น stem+branch รวม → ใช้ includes) */
function detectBranchImagery(type: InteractionTypeZh, tokens: string[]): Interaction["branchInteractionImagery"] | undefined {
  if (type !== "六合") return undefined;
  const joined = tokens.join("");
  if (joined.includes("巳") && joined.includes("申")) {
    return { image: "quenching_metal", meaning: "ไฟ+ทองเกิดน้ำ ภาพชุบโลหะ คิดไวคม ดูดซับเร็ว แต่มีแรงกดดันซ่อน(破/刑)" };
  }
  return undefined;
}
/* post-process เติม derived fields (lot1+2a+2b) ให้ Interaction ที่สร้างแล้ว · mutate in place
 * isTransit=true เฉพาะดวงจร (luck/annual) → ใส่ timingActivationType */
function enrichInteraction(it: Interaction, dmElement: ElementEN | "unknown", isTransit: boolean): void {
  /* lot1: affectedTenGods จาก reactionElements */
  it.affectedTenGods = makeTenGods(it.reactionElements, dmElement);
  /* branch ของแต่ละ token (token ยาว 2 = stem+branch → เอา branch ตัวท้าย) */
  const branches = it.participants.map((p) => (p.token.length >= 2 ? p.token.slice(-1) : p.token));
  /* lot2a: behavioralHint (คู่กิ่ง) */
  if (branches.length === 2) {
    const bh = BEHAVIORAL_HINT[`${it.type}|${sortedPairKey(branches[0], branches[1])}`];
    if (bh) it.behavioralHint = bh;
  }
  /* lot2a: 自刑 ชั้นจิตวิทยา */
  if (it.type === "自刑" && branches[0]) {
    const sh = SELF_PUNISH_HINT[branches[0]];
    if (sh) it.behavioralHint = sh;
  }
  /* lot2b: timing activation เฉพาะดวงจร */
  if (isTransit) {
    const ta = TIMING_ACTIVATION[it.type];
    if (ta) it.timingActivationType = ta;
  }
  /* lot2b: ภาพชุบโลหะ 巳申合水 */
  const img = detectBranchImagery(it.type, it.participants.map((p) => p.token));
  if (img) it.branchInteractionImagery = img;
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
  rootedness: ChartPacket["rootedness"] = null,  // 通根 (route เรียก wrapper-7 ส่งมา · optional · undefined=group/ไม่ส่ง)
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
    /* 神煞: เรียงดาวร้ายขึ้นก่อน (กัน slice ตัดดาวร้ายสำคัญ 災煞/劍鋒/歲破 ที่อยู่ท้าย array ทิ้ง)
     * cap 8/เสา กัน prompt ยาว · ส่ง polarity ไปด้วย AI จะได้ไม่เดาดี-ร้าย (เคยขาด → อ่านอุบัติเหตุ/ขัดแย้งไม่ได้) */
    const POL_ORDER: Record<string, number> = { bad: 0, good: 1, neutral: 2 };
    const stars = [...(ext.special_stars[k] || [])]
      .sort((a, b) => (POL_ORDER[a.polarity] ?? 3) - (POL_ORDER[b.polarity] ?? 3))
      .slice(0, 8)
      .map((s) => ({ name: s.th || s.zh, polarity: s.polarity }));
    const hex = ext.palace_readings[k]?.hex;
    const ny = ext.nayin[k];
    return {
      key: k,
      stem,
      branch,
      tenGod,
      hiddenStems,
      qiPhase: { dm: phase?.dm ?? null, pillar: phase?.pillar ?? null, hidden: phase?.hidden_main ?? null },
      palaceZh: palaceZhMap[k],
      nayinZh: ny ? (ny.zh || ny.en || "-") : "-",
      hexZh: hex ? `${hex.zh}${hex.changing_line ? `·เคลื่อนเหยา${hex.changing_line}` : ""}` : null,
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

  /* fan/fu yin · ตำราเข้ม เฉพาะ packet ซินแส (26 พ.ค. · 子平: 伏吟=流年/大運=命柱 ทั้งก้าน+กิ่ง · "伏吟比反吟还更伤脑筋")
   * กรอง 1 ชั้น: เฉพาะเต็มเสา 伏吟/反吟 (ก้าน+กิ่งซ้ำ/ชนทั้งคู่) ตัด variant เดี่ยว (伏吟·ก้าน/·กิ่ง) ที่เคยทำ AI มั่ว
   * 27 พ.ค. · เจ้านายยืนยันปัญหา伏吟มั่วแก้แล้ว → ปลด filter natal×natal · ส่งเต็มเสาทุกแหล่ง (natal+วัยจร+ปีจร)
   *   ให้ตรง /chart (เช่น Aeaw 年甲子↔時庚午 反吟เต็มเสา natal · ซินแสขอ) · ยังคงตัด variant เดี่ยวกัน AI มั่วซ้ำ */
  for (const f of ext.fan_yin_fu_yin) {
    if (f.type !== "伏吟" && f.type !== "反吟") continue;
    const baseZh: InteractionTypeZh = f.type === "反吟" ? "反吟" : "伏吟";
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
      /* กัน AI นับการปะทะซ้ำ: 反吟เต็มเสา = ก้านชน+กิ่งชน ครอบ 六沖(กิ่ง)+天克(ก้าน) คู่เดียวกันไว้แล้ว
       * 伏吟 = ก้าน+กิ่งซ้ำเต็มเสา (พลังกดซ้ำ ไม่ใช่ปะทะ) · เมื่อสรุปอย่านับคู่เสานี้ซ้ำกับ 六沖/天克 ที่ส่งแยก */
      aiReadingHint: baseZh === "反吟"
        ? "เต็มเสา (ก้านชน+กิ่งชน) ครอบ 六沖/天克 คู่นี้ไว้แล้ว · อย่านับการปะทะซ้ำ"
        : "เต็มเสา (ก้าน+กิ่งซ้ำ) = พลังกดซ้ำย้ำเดิม ไม่ใช่ปะทะ",
    });
  }

  /* lot2a: 刑/自刑 (packet เดิมไม่ดึง ext.punishments) · engine ไม่ส่ง pillar → affectedPalaces ว่าง (ไม่เดา) */
  for (const p of (ext.punishments || [])) {
    const uniq = Array.from(new Set(p.branches));
    const reaction = Array.from(new Set(uniq.map((b) => BRANCH_ELEMENT[b]).filter(Boolean))) as ElementEN[];
    raw.push({
      type: p.type as InteractionTypeZh,
      participants: p.branches.map((b) => ({ pillar: "-", token: b })),
      reactionElements: reaction,
      affectedPalaces: [],
      affectedTopicsLite: ["ภาพรวม"],
      usefulGodImpact: makeImpact(reaction, yong, xi, ji),
      resolverStatus: "none",
      aiReadingHint: null,
    });
  }

  /* lot1+2a+2b: เติม derived fields ให้ raw (ผังเกิด · isTransit=false) */
  for (const it of raw) enrichInteraction(it, dmElement, false);

  const anyTransformed = raw.some((r) => r.resolverStatus === "transformed");
  const interactionStatus: ChartPacket["interactions"]["status"] =
    raw.length === 0 ? "none_detected" : (anyTransformed ? "resolved_partial" : "raw_only");

  /* ─── currentLuck ─── */
  const lp = ext.luck_pillars[ext.current_luck_idx];
  const currentLuck: ChartPacket["currentLuck"] = lp
    ? { stem: lp.stem, branch: lp.branch, element: lp.element, ageStart: lp.age_start, ageEnd: lp.age_end }
    : null;

  /* ─── luckTimeline (วัยจรทั้งชีวิต + ปีครอบ · เสริม currentLuck · ไม่ลบเดิม)
   *   birthYear: liu_nian_timeline[0] (year-age · engine ใส่ year จริง) · fallback ปีปัจจุบัน-ageNow ─── */
  const lnFirst = (ext.liu_nian_timeline || [])[0];
  const birthYear = lnFirst ? lnFirst.year - lnFirst.age : (new Date().getFullYear() - ageNow);
  const luckTimeline: ChartPacket["luckTimeline"] = (ext.luck_pillars || []).map((p) => {
    const aStart = Math.round(p.age_start);
    const aEnd = Math.round(p.age_end);
    return {
      stem: p.stem, branch: p.branch, element: p.element,
      ageStart: aStart, ageEnd: aEnd,
      yearStart: birthYear + aStart, yearEnd: birthYear + aEnd,
      isCurrent: ageNow >= aStart && ageNow <= aEnd,
    };
  });

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
  /* lot1+2a+2b: เติม derived fields ให้วัยจร (isTransit=true → มี timingActivationType) */
  for (const it of luckInteractions) enrichInteraction(it, dmElement, true);

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
  /* lot1+2a+2b: เติม derived fields ให้ปีจร (isTransit=true) */
  for (const it of annualInteractions) enrichInteraction(it, dmElement, true);

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
    .filter((x) => x.age >= Math.max(0, ageNow - 10) && x.age <= ageNow + 10)  /* เปิดอนาคต ±10 ปี (เดิมตัด age<=ageNow → อ่านปีหน้าไม่ได้) */
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
      confidence: calc.geJu?.confidence ?? null,
    },
    /* กลุ่ม ก (เชื่อมท่อ · 26 พ.ค.) — ของที่ engine คำนวณแล้วแต่ packet ไม่เคย expose
       หมายเหตุ: 命宮 ถอดออกชั่วคราว — สูตร buildLifePalace anchor (子=0) ต่างจากตำราคลาสสิก (寅=1)
       benchmark 正月子時: โค้ด→子 · ตำรา→卯 · รอ verify สำนักกับซินแสก่อนเปิด (กันอ่านเรือนผิด) */
    trueSolarTime: calc.tst
      ? { appliedTimeStr: calc.tst.appliedTimeStr, totalShiftMin: calc.tst.totalShiftMin, dayShift: calc.tst.appliedDayShift }
      : null,
    startLuckAge: ext.luck_pillars?.[0]?.age_start ?? null,
    rootedness: rootedness ?? null,
    fivePalaces: (() => {
      const tai = buildConceptionPalace(calc.pillars);
      return {
        taiYuan: tai ? { stem: tai.stem, branch: tai.branch, tenGod: tenGodLabelTh(tai.stem, dm) } : null,
        mingGong: null,  // เฟสถัดไป · รอซินแสฟันธงการนับยาม (酉 vs 亥)
        shenGong: null,  // เฟสถัดไป (=對宮命宮 · รอ命宮)
        siLing: null,    // เฟสถัดไป (ต้อง節氣 ephemeris)
        xiaoYun: null,   // เฟสถัดไป (時柱+เพศ)
      };
    })(),
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
    luckTimeline,
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
    const POL_TH: Record<string, string> = { bad: "ร้าย", good: "ดี", neutral: "กลาง" };
    const stars = p.stars.length ? p.stars.map((s) => `${s.name}(${POL_TH[s.polarity] || "กลาง"})`).join(" · ") : "-";
    return `${PILLAR_EN_TH[p.key]} ${PILLAR_ZH[p.key]}: ฟ้า=${STEM_TH[p.stem] || p.stem}/${p.tenGod}; ดิน=${BRANCH_TH_NAME[p.branch] || p.branch}; ธาตุซ่อน=${hidden}; วัฏจักร=ตัวตน:${p.qiPhase.dm || "-"} เสา:${p.qiPhase.pillar || "-"} ซ่อน:${p.qiPhase.hidden || "-"}; เรือน=${p.palaceZh}; 易卦=${p.hexZh || "-"}; 神煞ดาวพิเศษ(ดี/ร้าย)=${stars}; นับเสียงประกอบ=${p.nayinZh}`;
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
  if (packet.structure.confidence) structureLine += ` · ความมั่นใจโครง ${packet.structure.confidence}`;
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

  /* 空亡 ตกเสาไหน → เรือน + สิบเทพที่ "ไม่เต็ม" (derived จาก packet · กิ่งว่าง × กิ่งของเสาในผัง · ไม่คำนวณใหม่) */
  {
    const voidSet = new Set([...packet.kongWang.dayVoids, ...packet.kongWang.yearVoids].filter((b) => b && b !== "-"));
    const hits: string[] = [];
    packet.pillars.forEach((p) => {
      if (voidSet.has(p.branch)) {
        const gods = p.hiddenStems.map((h) => h.tenGod).filter((t) => t && t !== "-").join("/");
        const inD = packet.kongWang.dayVoids.includes(p.branch), inY = packet.kongWang.yearVoids.includes(p.branch);
        const src = inD && inY ? "ฐานวัน+ปี (年日空亡)" : inD ? "ฐานวัน" : "ฐานปี";
        hits.push(`${PILLAR_EN_TH[p.key]}(กิ่ง${BRANCH_TH_NAME[p.branch] || p.branch} · เรือน${p.palaceZh}${gods ? " · สิบเทพที่ตกว่าง: " + gods : ""} · จาก旬空${src})`);
      }
    });
    if (hits.length) {
      lines.push(`空亡ตกที่เสา (สิ่งที่ "ว่าง/ไม่เต็ม" · ต้องรอเติมเต็ม/填實ปีจร): ${hits.join(" · ")}`);
    }
  }

  /* กลุ่ม ก (26 พ.ค. · เชื่อมท่อ engine ที่มีค่าแล้ว) — 真太陽時 / 起運 (命宮 ถอดชั่วคราว รอ verify สำนัก) */
  if (packet.trueSolarTime) {
    const t = packet.trueSolarTime;
    lines.push(`真太陽時 (เวลาจริงหลังแก้ลองจิจูด+สมการเวลา): ${t.appliedTimeStr}` +
      (t.totalShiftMin ? ` · เลื่อน ${t.totalShiftMin} นาทีจากเวลานาฬิกา` : "") +
      (t.dayShift ? ` · ข้ามวัน ${t.dayShift > 0 ? "+1" : "-1"}` : ""));
  }
  if (packet.startLuckAge != null) {
    lines.push(`起運 (เริ่มเดินวัยจร 大運): อายุ ${packet.startLuckAge} ปี`);
  }
  /* 胎元 เรือนปฏิสนธิ (27 พ.ค. · 月干進一月支進三 · engine คำนวณ · ทุนแต่เกิด/รากฐาน · ตีความด้วยสิบเทพเทียบ日干) */
  if (packet.fivePalaces?.taiYuan) {
    const t = packet.fivePalaces.taiYuan;
    lines.push(`胎元 เรือนปฏิสนธิ (ทุนแต่เกิด·รากฐานก่อนลืมตา): ${STEM_TH[t.stem] || t.stem}/${t.tenGod} ${BRANCH_TH_NAME[t.branch] || t.branch} (${t.stem}${t.branch}) · ใช้ดูธาตุเสริมที่ติดตัวมาก่อนเกิด (มักเติมธาตุที่ 4 เสาขาด) · ไม่ฟันธงดี-ร้าย`);
  }
  /* 通根 รากธาตุ (wrapper-7 · ฐานตัดสิน 從格/用神 · ห้ามคำนวณใหม่ · engine ให้มา) */
  if (packet.rootedness) {
    const r = packet.rootedness;
    const ROOT_TH: Record<RootLabel, string> = {
      no_root: "ไร้ราก", token_root: "รากบางมาก", partial_root: "รากบางส่วน", rooted: "มีราก", strong_root: "รากแข็ง",
    };
    const allTxt = (["wood","fire","earth","metal","water"] as ElementEN[])
      .map((e) => `${elementTh(e)}=${ROOT_TH[r.all[e]] || r.all[e]}`).join(" · ");
    let dmLine = `通根 (ราก): ตัวตน(日干 ธาตุ${elementTh(r.dmElement)}) = ${ROOT_TH[r.dmLabel] || r.dmLabel}`;
    if (r.isExtremelyWeak) dmLine += " · DM อ่อนยิ่ง (พิจารณาเกณฑ์從格)";
    else if (r.isTokenOnly) dmLine += " · รากบางมาก (ระวังเกณฑ์從格)";
    lines.push(dmLine);
    lines.push(`ราก 5 ธาตุ: ${allTxt}`);
  }

  /* 透干 (ก้านซ่อนในกิ่ง โผล่ขึ้นเป็นก้านบนฟ้า · ธาตุมีพลังเปิดเผยแสดงผลชัด · ดี/ร้ายขึ้นกับ用神หรือ忌神 · ห้ามฟันธง · derived จาก packet ไม่คำนวณเสาใหม่) */
  {
    const heavenStems = packet.pillars.map((p) => p.stem);
    const revealed: string[] = [];
    const seen = new Set<string>();
    packet.pillars.forEach((p) => {
      p.hiddenStems.forEach((h) => {
        if (heavenStems.includes(h.stem) && !seen.has(h.stem + p.branch)) {
          seen.add(h.stem + p.branch);
          const elTh = h.element === "unknown" ? "-" : elementTh(h.element);
          revealed.push(`${h.stem}(ธาตุ${elTh} · ซ่อนในกิ่ง${BRANCH_TH_NAME[p.branch] || p.branch} ${PILLAR_EN_TH[p.key]} · ${h.tenGod})`);
        }
      });
    });
    if (revealed.length) {
      lines.push(`透干 (ก้านซ่อนโผล่ขึ้นก้านบนฟ้า · ธาตุมีพลังเปิดเผย แสดงผลชัด · ดีหรือร้ายขึ้นกับว่าเป็น用神หรือ忌神): ${revealed.join(" · ")}`);
    }
  }

  /* วัยจร + ปีจร */
  lines.push(
    `วัยจรปัจจุบัน: ${packet.currentLuck
      ? `${STEM_TH[packet.currentLuck.stem] || packet.currentLuck.stem}/${BRANCH_TH_NAME[packet.currentLuck.branch] || packet.currentLuck.branch} อายุ ${packet.currentLuck.ageStart}-${packet.currentLuck.ageEnd} · ธาตุ${elementTh(packet.currentLuck.element)}`
      : "-"}`
  );
  /* วัยจรทั้งชีวิต + ปีครอบ · ให้ AI อ่านปีไหนใช้วัยจรของปีนั้น (กันเดาปฏิกิริยาข้ามวัยจร) */
  if (packet.luckTimeline.length) {
    lines.push(
      `วัยจรทั้งชีวิต (อ่านปีไหนใช้วัยจรของปีนั้น · ห้ามจับปฏิกิริยาข้ามวัยจร): ` +
      packet.luckTimeline
        .map((t) => `${STEM_TH[t.stem] || t.stem}/${BRANCH_TH_NAME[t.branch] || t.branch}(อายุ${t.ageStart}-${t.ageEnd}·ปี${t.yearStart}-${t.yearEnd}·ธาตุ${elementTh(t.element)})${t.isCurrent ? "◀ปัจจุบัน" : ""}`)
        .join(" · ")
    );
  }
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
    /* lot1: สิบเทพ→เรื่องชีวิต (derived · ไม่ตัดสินดี-ร้าย) */
    const tgList = it.affectedTenGods || [];
    const tgTopics = Array.from(new Set(tgList.flatMap((t) => t.lifeTopics)));
    const tgZh = Array.from(new Set(tgList.map((t) => t.tenGod)));
    const tgTxt = tgTopics.length ? ` · กระทบ: ${tgTopics.join("/")}${tgZh.length ? `(${tgZh.join("")})` : ""}` : "";
    /* lot2a: คำอ่านพฤติกรรม · lot2b: จังหวะดวงจร + ภาพคู่กิ่ง */
    const behavior = it.behavioralHint ? ` · พฤติกรรม: ${it.behavioralHint}` : "";
    const timing = it.timingActivationType ? ` · จังหวะ: ${TIMING_ACTIVATION_TH[it.timingActivationType]}` : "";
    const imagery = it.branchInteractionImagery ? ` · ภาพชุบโลหะ: คิดไวคม แต่ซ่อนแรงกดดัน` : "";
    const note = it.aiReadingHint ? ` · หมายเหตุ: ${it.aiReadingHint}` : "";
    return `  - ${typeTh} ${pairTxt}${reactTxt}${tgTxt}${palaces}${topics}${impact}${transformed}${timing}${imagery}${behavior}${note} · อ่านตามคัมภีร์ ยังไม่ฟันธงดี-ร้าย`;
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
