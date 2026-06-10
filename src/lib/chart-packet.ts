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
import { buildConceptionPalace, buildLifePalace, buildBodyPalace, buildSiLing, buildMinorLuck } from "./chart-table";
import { getDaymasterProfile } from "./daymaster-profile";
import { buildHehuaVerdicts, type HehuaVerdict } from "./bazi-hehua-resolver";
import { buildMukuStates, buildMukuTransitStates, type MukuState, type MukuTransitInput, type MukuTransitState } from "./bazi-muku-state";
import { auditStrictGeJuFromMonth, type StrictGeJuAudit } from "./bazi-strict-geju-audit";
import { resolveXch, type XchResolution } from "./bazi-xch-resolver";
import { buildShenShaTransit, type ShenShaTransit } from "./bazi-shensha-transit";
import { buildSixRelativesEvents, type RelativeEvent } from "./bazi-six-relatives-events";
import { buildElementRoles, type ElementRole } from "./element-roles";
import { createRequire } from "node:module";

/* wrapper-8 化氣格 (CJS) · dynamic require + cache · sync-safe สำหรับ buildStructuredChartPacket
 * promote จาก scripts/proto-huaqi-gate-v2.cjs (8/8 PASS · 29 พ.ค.)
 * ไม่กระทบ wrapper-7 (อ่านแค่ findTransformation เดิม) · ไม่กระทบ usefulGods output
 *
 * ใช้ createRequire กัน ESM context (Next.js bundler + ts-loader) ที่ require อาจไม่ใช่ global
 *   - ใน CJS build → createRequire ก็ใช้ได้
 *   - ใน ESM runtime (ts-loader/strip-types) → ต้องผ่าน createRequire เท่านั้น */
type _HuaQiRaw = {
  verdict: "真化" | "假化" | "合而不化";
  transformElement: "wood" | "fire" | "earth" | "metal" | "water";
  stems: { dm: string | null; partner: string };
  partnerPosition: "year" | "month" | "hour";
  monthSupport: boolean;
  dmRootLabel: "no_root" | "token_root" | "rooted";
  dmRootGate?: string;
  confidence: "high" | "medium" | "low";
  sourceRuleIds: string[];
  reasonZh?: string;
  thaiSummary: string;
};
type _HuaQiAnalyzerInput = Record<string, { stem: string; branch: string } | null | undefined>;
type _HuaQiAnalyzer = (n: _HuaQiAnalyzerInput) => _HuaQiRaw | null;
let _analyzeHuaQiCached: _HuaQiAnalyzer | null | undefined; // undefined=not tried · null=load failed
function _getAnalyzeHuaQi(): _HuaQiAnalyzer | null {
  if (_analyzeHuaQiCached !== undefined) return _analyzeHuaQiCached;
  try {
    const req = createRequire(import.meta.url);
    const mod = req("../../data/library/wrappers/3-ge-ju.js") as { analyzeHuaQiVerdict?: _HuaQiAnalyzer };
    _analyzeHuaQiCached = typeof mod?.analyzeHuaQiVerdict === "function" ? mod.analyzeHuaQiVerdict : null;
  } catch {
    _analyzeHuaQiCached = null;
  }
  return _analyzeHuaQiCached;
}

type Calc = Awaited<ReturnType<typeof calcBazi>>;
type Ext = ReturnType<typeof buildChartExtensions>;

export type ElementEN = "wood" | "fire" | "earth" | "metal" | "water";
export type RootLabel = "no_root" | "token_root" | "partial_root" | "rooted" | "strong_root";
export type DayBoundary = "23:00" | "00:00";
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
  /** lot2a · คำอ่านพฤติกรรมต่อคู่ (presentation) */
  behavioralHint?: string;
  /** lot2b · ประเภทกระตุ้นเชิงจังหวะ · เฉพาะดวงจร (luck/annual) */
  timingActivationType?: "combination_active" | "clash_active" | "harm_active";
  /** lot2b · ภาพคู่กิ่งเชิงสัญลักษณ์ (巳申合水 ชุบโลหะ) */
  branchInteractionImagery?: { image: string; meaning: string };
  /** หมายเหตุการอ่าน · null = ปล่อย AI เติมเอง · string = คำกำกับ (เช่น กันนับปะทะซ้ำ 反吟/六沖) */
  aiReadingHint: string | null;
};

export type InteractionConflictSummary = {
  scope: "natal" | "luck" | "annual";
  participantKey: string;
  types: InteractionTypeZh[];
  affectedPalaces: string[];
  affectedTopicsLite: string[];
  note: string;
};

export type ChartPacketBuildOptions = {
  /** ขอบวันจริงที่ caller ใช้ตอน calcBazi · ถ้าไม่ส่ง = default 23:00 (ไม่เดาเอง) */
  dayBoundary?: DayBoundary;
  dayBoundarySource?: "explicit" | "default";
  /** 月柱ก้ำกึ่ง節氣 (route คำนวณจาก bazi-boundary.monthPillarBoundary ส่งเข้า · เฉพาะ 3 เสา)
   *  packet ไม่ import bazi-boundary เอง (กันคู่พึ่งพา) · inline type พอ */
  monthBoundary?: { boundary: boolean; termName?: string; before?: string; after?: string; jieqiIctApprox?: string } | null;
};

/** field ที่ค่าพึ่งเสาเดือน(月支) → เมื่อเสาเดือนก้ำกึ่ง ทุกตัวนี้ inherit เพดานมั่นใจ "กลาง" (flat cap · ไม่ใช่ graph)
 *  constant เดียวคุม · เพิ่ม field derive จาก月ใหม่ ต้องมาเติมที่นี่ กันหลุดเพดานเงียบ */
const MONTH_DERIVED_FIELDS = ["格局", "司令", "空亡(เสาเดือน)", "半合/三合(子辰)", "大運ลำดับ", "synastry(เสาเดือน)", "ธาตุรวม(tally)", "ราก5ธาตุ", "透干", "用神/喜忌+ธาตุช่วย", "病藥(BY)"];

export type ChartPacket = {
  /* ── version/level lock ── */
  packetVersion: "hourkey-chart-packet-lite-v1.1";
  packetLevel: "step1_lite";
  /* ⚠️ ยังไม่อยู่ใน Step 1 Lite (สงวนไว้ v1.1 / Step B-C) — ห้ามถือว่า "หาย":
   *   - dayMasterStrength / stemRootStatus
   *   - strengthScore / positionWeight
   *   - full resolvedInteractions / resolver conflict graph
   *   - 合化 grading · 貪合忘冲 · 墓库 open-close
   *   - rootMultiplier
   * (ทั้งหมดต้องรอ engine resolver + ซินแส calibrate · ดู roadmap memory) */
  meta: {
    mode: "4p" | "3p";
    dayMaster: string;
    dmElement: ElementEN | "unknown";
    dmPolarity: "yang" | "yin";
    ageNow: number;
    readingOrder: string;
    /** ขอบวัน 子時 ที่ใช้คำนวณเสาวัน · ต้องเปิดเผยให้ AI เห็นเพื่อกัน 23:00/00:00 สับสน */
    dayBoundary: DayBoundary;
    /** explicit=caller/user ส่งมา · default=ระบบไม่ได้รับค่าเฉพาะ profile จึงใช้ 23:00 */
    dayBoundarySource: "explicit" | "default";
    /** ความมั่นใจเสายาม/เสาวันแถบเที่ยงคืน · derived จาก mode + TST + dayBoundary */
    timePillarConfidence: {
      level: "known" | "unknown" | "boundary_sensitive";
      reason: string;
    };
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
  /** HK_HUAQI_VERDICT_V1 (wrapper-8 · 29 พ.ค. · promoted จาก proto v2 8/8 PASS)
   * 化氣格 verdict (真化/假化/合而不化) · derived จาก wrapper-8 (analyzeHuaQi)
   * additive-only · null = ไม่มีคู่ 五合 (DM ไม่อยู่ candidate ของ化氣格)
   * ไม่กระทบ structure.label เดิม + ไม่กระทบ wrapper-7 (อ่านแค่ findTransformation) */
  huaQi?: {
    verdict: "真化" | "假化" | "合而不化" | null;
    transformElement: ElementEN | null;
    stems: { dm: string; partner: string };
    /** position ของก้านคู่หู (year/month/hour) · null=ไม่มี (ไม่ adjacency) */
    partnerPosition: "year" | "month" | "hour" | null;
    monthSupport: boolean;
    /** map dmRootGate (none/hair/real) → packet root label (no_root/token_root/rooted) */
    dmRootLabel: RootLabel;
    confidence: "high" | "medium" | "low";
    sourceRuleIds: string[];
    thaiSummary: string;
  } | null;
  /** HK_STRICT_GEJU_AUDIT_V1
   * audit-only: เทียบ格局เดิมกับ strict 月令取用 ตาม子平真詮 · ไม่แทน structure.label เดิม */
  strictGeJuAudit?: {
    tag: "HK_STRICT_GEJU_AUDIT_V1";
    currentLabel: string;
    strictLabel: string | null;
    selectedStem: string | null;
    selectedSource: StrictGeJuAudit["selectedSource"];
    tenGod: string | null;
    confidence: StrictGeJuAudit["confidence"];
    matchesCurrent: boolean;
    reasonCodes: string[];
    sourceRuleIds: string[];
    thaiSummary: string;
    canonicalChinese: string;
    noteTh: string;
  };
  /** 月柱ก้ำกึ่ง節氣 (เกิดคาบ節氣 + 3 เสาไม่รู้เวลา) → field ที่พึ่งเสาเดือน inherit เพดานมั่นใจ "กลาง"
   *  คนละแกนกับ timePillarConfidence (นั่น=เสายาม時 คาบเที่ยงคืน · นี่=เสาเดือน月 คาบ節氣) · ห้ามยุบรวม
   *  additive · null=เดือนนิ่ง · render path เท่านั้นที่อ่าน (ไม่กระทบ /chart) */
  monthAmbiguity?: {
    ambiguous: boolean;
    termName: string;           // 立夏
    jieqiIctApprox?: string;    // 1996-05-05 12:26 (เวลาไทยโดยประมาณ)
    before: string;             // 壬辰 (เกิดก่อน節氣)
    after: string;              // 癸巳 (เกิดหลัง節氣)
    used: string;               // เสาที่ engine ฟันจริง (= เสาเดือนใน calc) → AI รู้ว่าอ่านข้างไหน
    dependentFields: string[];  // MONTH_DERIVED_FIELDS
    maxConfidence: "medium";    // เพดานมั่นใจ field ลูก (flat cap)
  } | null;
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
  /** 六親 ญาติ (derived จาก十神+宮位+ราก · ไม่คำนวณ engine ใหม่ · แปรตามเพศ)
   * 配偶(ชาย財/หญิง官殺·เรือน日支) · 父(偏財) · 母(正印) · 子女(ชาย官殺/หญิง食傷·เรือน時·3p=null) · 兄弟(比劫)
   * gender=null → null (เดาเพศไม่ได้ · ห้ามมั่ว) */
  sixRelatives?: {
    gender: "M" | "F";
    items: Array<{
      relativeZh: string;        // 配偶/父/母/子女/兄弟姊妹
      relativeTh: string;        // คู่ครอง/พ่อ/แม่/ลูก/พี่น้อง
      starsZh: string[];         // สิบเทพแทนญาติ (正財/偏財...)
      element: ElementEN;        // ธาตุของดาวญาติ
      palaceZh: string;          // เรือนหลักของญาติ (日支配偶 · 月父母兄弟 · 時子女)
      foundAt: string[];         // เสาที่ดาวญาติปรากฏจริง (ก้าน/ซ่อน) · [] = ไม่ปรากฏในผัง
      rootLabel: RootLabel | null; // ราก element ของดาวญาติ (จาก rootedness.all · null=ไม่มีข้อมูล)
      isUseful: "yong" | "xi" | "ji" | "neutral"; // เทียบ usefulGods
      palaceClashed: boolean;    // เรือนญาติถูก 沖/刑/害/破 (จาก interactions)
      palaceVoid: boolean;       // เรือนญาติตก 空亡
    }>;
  } | null;
  /** 相神/成格破格救應 (子平真詮 §8.2 · ตัดสินโครงดวงสำเร็จ/พัง · derived 格局+十神 · ไม่แตะ engine)
   * เฉพาะ 8 正格 (化/從/專旺/魁罡=null·相神ไม่ applicable) · ใช้คัมภีร์ xiangshen ประกอบ */
  xiangShen?: {
    geZh: string;          // 格 (RULES key · เช่น 正官格)
    verdict: "成格" | "破格" | "救應" | "合格普通";
    reason: string;        // เหตุผลตามสูตร §8.2
    subLabel?: string | null;  // 相神 sub-case (佩印/無印/用財/生官/食制...) → RUN_RULES key สำหรับ Layer 5 · null=map ไม่ได้
  } | null;
  chengBaiNow?: {
    geZh: string; subLabel: string;
    verdict: string;       // 成/破(เบา)/破(หนัก)/平/UNMAPPED
    reason: string; ruleId: string; annual?: string;
  } | null;
  /** 病藥 v1 (Disease-Medicine · 子平真詮/滴天髓)
   * derived จาก rootedness/usefulGods/xiangShen/Layer5 · ไม่ใช่โรคสุขภาพตรงๆ
   * gate เฉพาะ真從/真化/專旺 ก่อน; 假從/假化 ยังต้องอ่าน病藥ประกอบ เพราะยังไม่ใช่真從 */
  bingYao?: {
    status: "ok" | "not_applicable" | "needs_review";
    primary: {
      id: string;
      diseaseType: string;
      diseaseElements: ElementEN[];
      diseaseGods: string[];
      medicineElements: ElementEN[];
      medicineGods: string[];
      /** 橋藥/相神 — ธาตุสะพาน (เช่น 金生水/泄土) แยกจาก主藥 · มีเงื่อนไข ไม่ใช่ยาหลัก */
      bridgeMedicine?: ElementEN[];
      reason: string;
      sourceIds: string[];
      guard: string;
    } | null;
    candidates: Array<{
      id: string;
      diseaseType: string;
      diseaseElements: ElementEN[];
      diseaseGods: string[];
      medicineElements: ElementEN[];
      medicineGods: string[];
      bridgeMedicine?: ElementEN[];
      reason: string;
      sourceIds: string[];
      guard: string;
    }>;
  } | null;
  /** HK_YONGSHEN_PROTOCOL_SPLIT_V1
   * ใช้แก้ชื่อให้ตรงตำรา: 子平真詮 用神(月令/格局) ≠ ธาตุช่วยรวมของ engine
   * additive-only · ถอดออกได้ทั้งก้อนโดยค้น marker นี้ · ไม่เปลี่ยน usefulGods เดิม */
  yongShenProtocols?: {
    tag: "HK_YONGSHEN_PROTOCOL_SPLIT_V1";
    ctextPrinciple: string;
    structure: {
      protocol: "格局/月令用神";
      geJuLabel: string;
      basis: string | null;
      noteTh: string;
      sourceRuleId: "ZPZQ-GJ-001";
      canonicalChinese: "八字用神，專求月令";
    };
    xiangShen: {
      protocol: "相神";
      geZh: string | null;
      verdict: string | null;
      subLabel: string | null;
      noteTh: string;
    };
    tiaoHou: {
      protocol: "調候用神";
      climate: string | null;
      regulator: ElementEN | null;
      bridge: ElementEN | null;
      strict: {
        dmStem: string;
        monthBranch: string;
        primaryStems: string[];
        secondaryStems: string[];
        tertiaryStems: string[];
        primaryElements: ElementEN[];
        secondaryElements: ElementEN[];
        tertiaryElements: ElementEN[];
        rationaleZh: string;
        sourceRuleId: "QTBJ-TIAOHOU-120";
        noteTh: string;
      } | null;
      noteTh: string;
    };
    fuyi: {
      protocol: "扶抑用神";
      dmRootLabel: RootLabel | null;
      mode: "扶" | "抑/泄" | "從勢/特殊格優先" | "unknown";
      candidateElements: ElementEN[];
      noteTh: string;
    };
    bingYao: {
      protocol: "病藥";
      status: "ok" | "not_applicable" | "needs_review" | null;
      primaryId: string | null;
      medicineElements: ElementEN[];
      noteTh: string;
    };
    finalCombined: {
      protocol: "engine_final_combined";
      yong: ElementEN[];
      xi: ElementEN[];
      ji: ElementEN[];
      noteTh: string;
    };
  };
  usefulGods: {
    /** rank1 useful element */
    yong: ElementEN[];
    /** rank2-3 useful elements */
    xi: ElementEN[];
    /** ext.jishen.elements (ธาตุที่ระบบจัดเป็นธาตุระวัง · ไม่ใช่คำตัดสินสุดท้ายของซินแส) */
    ji: ElementEN[];
    /** 有條件之喜 / 相神橋藥 — ธาตุที่เป็นสะพาน/相神 มีเงื่อนไข (เช่น 金生水/泄土 แต่忌傷官見官)
     * derived จาก BY-08P bridgeMedicine · 滴天髓「隨其所向論喜忌」 · post-processed ไม่ใช่ blanket ji */
    conditionalUse?: Array<{ element: ElementEN; role: string; goodWhen: string[]; badWhen: string[]; source: string }>;
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
  /** ปีจร/เดือนจรในวัยจรปัจจุบัน · engine precomputed จาก chart-extensions
   * ส่งให้ AI ใช้เป็น source of truth เวลา user ถามย้อนหลัง/รายเดือน · ห้าม AI คำนวณเสาเอง */
  transitDrilldown: {
    source: "engine_luck_decade_drilldown";
    monthPillarMethod: "jieqi_major_terms_with_mid_month_fallback";
    currentDecade: {
      luckIndex: number;
      luckPillar: { stem: string; branch: string };
      ageStart: number;
      ageEnd: number;
      ageStartDetail?: string;
      ageEndDetail?: string;
      startDate?: string;
      endDate?: string;
      timingMethod?: string;
      direction?: "forward" | "backward";
      directionTh?: string;
      yearStart: number;
      yearEnd: number;
      years: Array<{
        year: number;
        age: number;
        pillar: { stem: string; branch: string };
        baziYearStart: { name: string; date: string } | null;
        baziYearEnd: { name: string; date: string } | null;
        calendarNote: string;
        stemElement: ElementEN | "unknown";
        branchElement: ElementEN | "unknown";
        stemUsefulRole: "yong" | "xi" | "ji" | "neutral";
        branchUsefulRole: "yong" | "xi" | "ji" | "neutral";
        hiddenStems: Array<{ stem: string; element: ElementEN | "unknown"; tenGod: string | null; usefulRole: "yong" | "xi" | "ji" | "neutral" }>;
        tenGod: string | null;
        flag: "auspicious" | "cautious" | "neutral";
        vsDayBranch: string[];
        vsLuckBranch: string[];
        impacts: Array<{ type: string; typeTh: string; pair: string; target: string; targetTh: string; palaceTh: string; domainsTh: string[]; strength: "low" | "medium" | "high" | "critical"; summaryTh: string }>;
        months: Array<{
          month: number;
          label: string;
          pillar: { stem: string; branch: string };
          jieqiStart: { name: string; date: string } | null;
          jieqiEnd: { name: string; date: string } | null;
          monthMethod: "jieqi_major_term" | "mid_month_fallback";
          stemElement: ElementEN | "unknown";
          branchElement: ElementEN | "unknown";
          stemUsefulRole: "yong" | "xi" | "ji" | "neutral";
          branchUsefulRole: "yong" | "xi" | "ji" | "neutral";
          hiddenStems: Array<{ stem: string; element: ElementEN | "unknown"; tenGod: string | null; usefulRole: "yong" | "xi" | "ji" | "neutral" }>;
          tenGod: string | null;
          flag: "auspicious" | "cautious" | "neutral";
          vsDayBranch: string[];
          vsLuckBranch: string[];
          impacts: Array<{ type: string; typeTh: string; pair: string; target: string; targetTh: string; palaceTh: string; domainsTh: string[]; strength: "low" | "medium" | "high" | "critical"; summaryTh: string }>;
        }>;
      }>;
    } | null;
  } | null;
  annualPillar: { stem: string; branch: string };
  interactions: {
    status: "resolved_partial" | "raw_only" | "none_detected";
    raw: Interaction[];
  };
  /** 天干五合 verdict v1 · หลักฐานกลไกเสริมสำหรับ AI Sifu
   * ใช้บอกว่า 合 นี้แปร/ไม่แปร/มีตัวแย่ง/ตัวคั่นอย่างไร · ไม่ใช่กรอบจำกัดสไตล์คำตอบ */
  hehuaVerdicts?: HehuaVerdict[];
  /** 墓庫 state v1 · หลักฐานกลไกเสริมสำหรับ AI Sifu
   * ใช้บอกว่าคลัง 辰戌丑未 ปิด/เปิดแล้วหนุน/ต้าน/ปนอย่างไร · ไม่ใช่ full resolver และไม่ใช่กรอบจำกัดสไตล์คำตอบ */
  mukuStates?: MukuState[];
  /** 合冲 resolver v1 (HK-XCH · ZPZQ-XCH-001/002/003) · หลักฐานกลไกเสริมสำหรับ AI Sifu
   * - 三合解六沖 (weakened_by_combination)
   * - 貪合忘冲 (suppressed_by_stem_combo)
   * - 因解而反得刑衝 (secondary_clash_exposed)
   * ใช้บอกว่า沖ในผังโดน合คลายแค่ไหน / มี刑/沖รองที่ถูกเปิดออกมาแทน · ไม่ตัดสินดี-ร้าย */
  xchResolution?: XchResolution[];
  /** 神煞 × transit activation (HK-SHENSHA-TRANSIT · SMTG-Vol3) · ดาวพิเศษที่ถูกกระตุ้นโดยวัยจร/ปีจร */
  shenshaTransit?: ShenShaTransit[];
  /** 六親 event-level forecast (HK-RELATIVE-EVENT · SMTG-Vol5 + YHZP) · เหตุการณ์ครอบครัวรายปี */
  sixRelativesEvents?: RelativeEvent[];
  /** 墓庫 state v2 · หลักฐานคลังตามเวลา (大運/流年/流月) สำหรับคำถามย้อนหลัง/ล่วงหน้า */
  mukuTransitStates?: MukuTransitState[];
  luckInteractions: Interaction[];
  annualInteractions: Interaction[];
  /** สรุปปฏิกิริยาซ้อนคู่เดียวกัน (เช่น 反吟 ครอบ 六沖/天克) · derived summary ไม่ใช่ full resolver */
  interactionConflictSummary: InteractionConflictSummary[];
  profile?: {
    daymaster?: string;
    /** ตัวตนเชิงลึก (Hourkey · getDaymasterProfile) · presentation พร้อมใช้ */
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
/* key = `${zhType}|${sortedPair}` · (子午/丑未 มีในคัมภีร์แล้ว ไม่ซ้ำ) */
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
/* ชั้นจิตวิทยา 自刑 · key = กิ่งที่ซ้ำ */
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

function normalizeBuildOptions(opts: ChartPacketBuildOptions = {}): Required<ChartPacketBuildOptions> {
  return {
    dayBoundary: opts.dayBoundary === "00:00" ? "00:00" : "23:00",
    dayBoundarySource: opts.dayBoundarySource || (opts.dayBoundary ? "explicit" : "default"),
    monthBoundary: opts.monthBoundary ?? null,
  };
}

function buildTimePillarConfidence(calc: Calc, dayBoundary: DayBoundary): ChartPacket["meta"]["timePillarConfidence"] {
  if (calc.mode === "3p") {
    return {
      level: "unknown",
      reason: "ไม่ทราบเวลาเกิด → ไม่มีเสายาม時/起運จริง และขอบวันใช้ไม่ได้กับดวง 3 เสา",
    };
  }
  const applied = calc.tst?.appliedTimeStr || "";
  const dayShift = calc.tst?.appliedDayShift || 0;
  const nearBoundary = /^23:|^00:/.test(applied) || dayShift !== 0;
  if (nearBoundary) {
    return {
      level: "boundary_sensitive",
      reason: `เวลาจริงหลัง TST=${applied || "-"} อยู่แถบขอบวัน · ใช้ขอบวัน ${dayBoundary} จึงต้องระวังเสาวัน/Day Master`,
    };
  }
  return {
    level: "known",
    reason: "มีเวลาเกิดและเวลาจริงไม่อยู่แถบ 23:00/00:00 · เสายามใช้ได้ตาม engine",
  };
}

const PARTICIPANT_ORDER: Record<string, number> = { year: 0, month: 1, day: 2, hour: 3, luck: 4, annual: 5 };
function participantKeyForConflict(scope: InteractionConflictSummary["scope"], it: Interaction): string | null {
  const names = it.participants
    .map((p) => p.pillar)
    .filter((p) => p && p !== "-");
  if (names.length < 2) return null;
  const uniq = Array.from(new Set(names))
    .sort((a, b) => (PARTICIPANT_ORDER[a] ?? 99) - (PARTICIPANT_ORDER[b] ?? 99) || a.localeCompare(b));
  return `${scope}:${uniq.join("↔")}`;
}
function buildInteractionConflictSummary(
  raw: Interaction[],
  luck: Interaction[],
  annual: Interaction[],
): InteractionConflictSummary[] {
  const groups = new Map<string, {
    scope: InteractionConflictSummary["scope"];
    participantKey: string;
    types: InteractionTypeZh[];
    affectedPalaces: Set<string>;
    affectedTopicsLite: Set<string>;
  }>();
  const add = (scope: InteractionConflictSummary["scope"], it: Interaction) => {
    const key = participantKeyForConflict(scope, it);
    if (!key) return;
    let g = groups.get(key);
    if (!g) {
      g = { scope, participantKey: key.replace(`${scope}:`, ""), types: [], affectedPalaces: new Set(), affectedTopicsLite: new Set() };
      groups.set(key, g);
    }
    if (!g.types.includes(it.type)) g.types.push(it.type);
    it.affectedPalaces.forEach((x) => g!.affectedPalaces.add(x));
    it.affectedTopicsLite.forEach((x) => g!.affectedTopicsLite.add(x));
  };
  raw.forEach((it) => add("natal", it));
  luck.forEach((it) => add("luck", it));
  annual.forEach((it) => add("annual", it));
  return Array.from(groups.values())
    .filter((g) => g.types.length > 1)
    .map((g) => {
      const hasFanYinCover = g.types.includes("反吟") && (g.types.includes("六沖") || g.types.includes("天克"));
      const note = hasFanYinCover
        ? "反吟เต็มเสาครอบแรงก้าน/กิ่งคู่เดียวกัน · อ่านเป็นชั้นเดียวก่อน ห้ามบวกผลซ้ำ"
        : "คู่เดียวกันมีหลายปฏิกิริยา · อ่านเป็นแรงซ้อนและจัดลำดับหลัก/รองก่อนสรุป";
      return {
        scope: g.scope,
        participantKey: g.participantKey,
        types: g.types,
        affectedPalaces: Array.from(g.affectedPalaces),
        affectedTopicsLite: Array.from(g.affectedTopicsLite),
        note,
      };
    });
}

/* ════════════════════════════════════════════════════════════════
 * buildStructuredChartPacket · map ext/calc → ChartPacket (4p เท่านั้น)
 * ════════════════════════════════════════════════════════════════ */
/* ── 六親 helper (27 พ.ค.) — สิบเทพ group → ธาตุญาติ (มาตรฐานความสัมพันธ์ธาตุ) ── */
function controllerElementOf(el: ElementEN): ElementEN | null {
  return (Object.keys(ELEMENT_CONTROLS) as ElementEN[]).find((k) => ELEMENT_CONTROLS[k] === el) || null;
}
function producerElementOf(el: ElementEN): ElementEN | null {
  return (Object.keys(ELEMENT_PRODUCES) as ElementEN[]).find((k) => ELEMENT_PRODUCES[k] === el) || null;
}
function tenGodGroupElement(group: string, dmEl: ElementEN): ElementEN | null {
  switch (group) {
    case "比劫": return dmEl;
    case "食傷": return ELEMENT_PRODUCES[dmEl] || null;
    case "財":   return ELEMENT_CONTROLS[dmEl] || null;
    case "官殺": return controllerElementOf(dmEl);
    case "印":   return producerElementOf(dmEl);
    default: return null;
  }
}
/* 六親: map ดาว(十神)+宮位+ราก เป็นญาติ · ไม่คำนวณ engine ใหม่ · แปรเพศ */
export function buildSixRelatives(
  pillars: Record<string, { stem: string; branch: string } | null>,
  dm: string, dmEl: ElementEN, gender: "M" | "F",
  rootedness: ChartPacket["rootedness"],
  voids: Set<string>, clashedBranches: Set<string>,
  isUsefulFn: (el: ElementEN) => "yong" | "xi" | "ji" | "neutral",
  is3p: boolean,
): NonNullable<ChartPacket["sixRelatives"]> {
  const PT: Record<string, string> = { year: "เสาปี", month: "เสาเดือน", day: "เสาวัน", hour: "เสายาม" };
  const DEFS = [
    { zh: "配偶", th: "คู่ครอง", group: gender === "M" ? "財" : "官殺", stars: gender === "M" ? ["正財", "偏財"] : ["正官", "七殺"], palaceKey: "day", palaceZh: "日支 (เรือนคู่ครอง·กิ่งวัน)" },
    { zh: "父",   th: "พ่อ",     group: "財", stars: ["偏財"], palaceKey: "month", palaceZh: "月 (เรือนพ่อแม่)" },
    { zh: "母",   th: "แม่",     group: "印", stars: ["正印"], palaceKey: "month", palaceZh: "月 (เรือนพ่อแม่)" },
    { zh: "子女", th: "ลูก",     group: gender === "M" ? "官殺" : "食傷", stars: gender === "M" ? ["正官", "七殺"] : ["食神", "傷官"], palaceKey: "hour", palaceZh: "時 (เรือนลูก)" },
    { zh: "兄弟姊妹", th: "พี่น้อง", group: "比劫", stars: ["比肩", "劫財"], palaceKey: "month", palaceZh: "月 (เรือนพี่น้อง)" },
  ];
  const POS = ["year", "month", "day", "hour"];
  const items = DEFS
    .filter((d) => !(is3p && d.palaceKey === "hour")) // 3p ไม่มี時 → ตัดลูก (กันเดา)
    .map((d) => {
      const el = tenGodGroupElement(d.group, dmEl);
      const foundAt: string[] = [];
      for (const pos of POS) {
        const p = pillars[pos]; if (!p) continue;
        const stemTg = tenGodOf(dm, p.stem);
        if (stemTg && d.stars.includes(stemTg)) foundAt.push(`${PT[pos]}(ก้าน)`);
        for (const hs of (HIDDEN_STEMS_MAP[p.branch] || [])) {
          const hsTg = tenGodOf(dm, hs);
          if (hsTg && d.stars.includes(hsTg)) { foundAt.push(`${PT[pos]}(ซ่อน)`); break; }
        }
      }
      const pb = pillars[d.palaceKey]?.branch || "";
      return {
        relativeZh: d.zh, relativeTh: d.th, starsZh: d.stars,
        element: (el || "unknown") as ElementEN,
        palaceZh: d.palaceZh, foundAt,
        rootLabel: el && rootedness ? rootedness.all[el] : null,
        isUseful: el ? isUsefulFn(el) : "neutral",
        palaceClashed: pb ? clashedBranches.has(pb) : false,
        palaceVoid: pb ? voids.has(pb) : false,
      };
    });
  return { gender, items };
}

/* ── 相神/成格破格 (子平真詮 §8.2 · port proto-xiangshen-v2 16/16) ── */
function geToRuleKey(label: string): string | null {
  const l = label.replace("雜氣", "");  // 雜氣正印格 → 正印格
  if (l.includes("從") || l.includes("化")) return null;  // 從格/化格 → 相神ไม่ applicable (กันก่อน · 假從財格 includes 財)
  if (l.includes("傷官")) return "傷官格";
  if (l.includes("七殺") || l.includes("七杀")) return "七殺格";
  if (l.includes("正官")) return "正官格";
  if (l.includes("陽刃") || l.includes("羊刃")) return "陽刃格";
  if (l.includes("比肩") || l.includes("劫財") || l.includes("建祿") || l.includes("月劫")) return "建祿月劫格"; // ก่อน財 (劫財 includes 財!)
  if (l.includes("財")) return "財格";
  if (l.includes("印")) return "印綬格";
  if (l.includes("食神")) return "食神格";
  return null;  // 曲直/炎上/稼穡/從革/潤下/魁罡 → 相神 ไม่ applicable
}
function godsInChartXS(pillars: Record<string, { stem: string; branch: string } | null>, dm: string): Set<string> {
  const g = new Set<string>();
  for (const pos of PILLAR_KEYS) {
    const p = pillars[pos]; if (!p) continue;
    if (pos !== "day") { const tg = tenGodOf(dm, p.stem); if (tg) g.add(tg); }  // ข้าม 日主 (DM ไม่ใช่ 比肩ตัวเอง)
    const main = (HIDDEN_STEMS_MAP[p.branch] || [])[0];
    if (main) { const h = tenGodOf(dm, main); if (h) g.add(h); }
  }
  return g;
}
const STEM_COMBO_PAIRS_XS = new Set(["甲己", "乙庚", "丙辛", "丁壬", "戊癸"]);
function isStemComboXS(a: string, b: string): boolean {
  return STEM_COMBO_PAIRS_XS.has(`${a}${b}`) || STEM_COMBO_PAIRS_XS.has(`${b}${a}`);
}
function visibleStemGodsXS(pillars: Record<string, { stem: string; branch: string } | null>, dm: string): Array<{ pos: PillarKey; stem: string; god: string }> {
  const out: Array<{ pos: PillarKey; stem: string; god: string }> = [];
  for (const pos of PILLAR_KEYS) {
    if (pos === "day") continue; // 日主ก้านวันไม่ใช่สิบเทพ และไม่ใช้เป็นตัวกู้ใน resolver 5.2
    const p = pillars[pos]; if (!p) continue;
    const god = tenGodOf(dm, p.stem);
    if (god) out.push({ pos, stem: p.stem, god });
  }
  return out;
}
function visibleHasGodXS(pillars: Record<string, { stem: string; branch: string } | null>, dm: string, god: string): boolean {
  return visibleStemGodsXS(pillars, dm).some((x) => x.god === god);
}
function hasVisibleComboTargetGodXS(
  pillars: Record<string, { stem: string; branch: string } | null>,
  dm: string,
  targetGod: string,
  combinerGods?: string[],
): boolean {
  const stems = visibleStemGodsXS(pillars, dm);
  return stems.some((target, i) => target.god === targetGod && stems.some((other, j) =>
    i !== j && isStemComboXS(target.stem, other.stem) && (!combinerGods || combinerGods.includes(other.god))
  ));
}
export function buildXiangShen(pillars: Record<string, { stem: string; branch: string } | null>, dm: string, geJuLabel: string): NonNullable<ChartPacket["xiangShen"]> | null {
  const ge = geToRuleKey(geJuLabel); if (!ge) return null;
  const g = godsInChartXS(pillars, dm); const has = (x: string) => g.has(x);
  const 印 = has("正印") || has("偏印"), 財 = has("正財") || has("偏財");
  const 食 = has("食神"), 傷 = has("傷官"), 殺 = has("七殺"), 官 = has("正官");
  const 比劫 = has("比肩") || has("劫財");
  const 合煞 = hasVisibleComboTargetGodXS(pillars, dm, "七殺");
  const 印合傷 = hasVisibleComboTargetGodXS(pillars, dm, "傷官", ["正印", "偏印"]);
  const 官透 = visibleHasGodXS(pillars, dm, "正官");
  const 殺透 = visibleHasGodXS(pillars, dm, "七殺");
  const 印透 = visibleHasGodXS(pillars, dm, "正印") || visibleHasGodXS(pillars, dm, "偏印");
  const 食傷透 = visibleHasGodXS(pillars, dm, "食神") || visibleHasGodXS(pillars, dm, "傷官");
  const help = ["比肩", "劫財", "正印", "偏印"].filter((x) => g.has(x)).length;
  const drain = ["正財", "偏財", "正官", "七殺", "食神", "傷官"].filter((x) => g.has(x)).length;
  const strong = help >= drain;
  const 癸日庚申 = dm === "癸" && pillars.hour?.stem === "庚" && pillars.hour?.branch === "申";
  // subLabel = 相神 sub-case (RUN_RULES key สำหรับ Layer 5) · derive จากจุดตัดสินเดิม (กฎเดียวกับ verdict · single-source) · null=map ไม่ได้→UNMAPPED ตอน timing
  const R = (verdict: "成格" | "破格" | "救應" | "合格普通", reason: string, subLabel: string | null = null) => ({ geZh: ge, verdict, reason, subLabel });
  switch (ge) {
    case "正官格":
      if (傷) return 印 ? R("救應", "傷官見官 → 透印制傷 (敗中有成)", "佩印") : R("破格", "傷官見官 (PO_OFFICIAL_1)", "無印");
      if (殺 && 官 && 合煞) return R("救應", "官煞混雜 → 合煞留官取清 (ZPZQ-5.2-01)", null);
      if (殺 && 官透 && 殺透) return R("破格", "官煞混雜 (PO_OFFICIAL_3)", null);  // 官煞พร้อม透ออกมาจึงลงโทษเต็ม
      return (財 || 印) ? R("成格", "官透 + 財/印 + 無傷官", 印 ? "佩印" : "用財") : R("合格普通", "官透ไม่มี財/印ค้ำ", "無印");
    case "財格":
      if (癸日庚申) return R("救應", "癸日庚申 → 申合巳得財朋 (ZPZQ-5.2-10)", null);
      if (比劫 && !食 && !官) return R("破格", "比劫奪財 (PO_WEALTH_1)", null);  // 比劫奪財ไม่มีตัวค้ำ
      if (比劫 && (食 || 官)) return R("救應", "比劫奪財 → 食化劫/官制劫", 食 ? "食生" : "生官");
      if (殺 && !食) return R("破格", "財生殺攻身 (PO_WEALTH_3)", null);
      return (官 || 食 || 印) ? R("成格", "財旺生官/食生財/財透印", 官 ? "生官" : 食 ? "食生" : "佩印") : R("合格普通", "財ไม่มีค้ำ", null);
    case "印綬格":
      if (官 && 印透 && 食傷透) return R("救應", "印制食傷護官 (ZPZQ-5.2-05)", "用官");
      if (財 && !比劫) return R("破格", "財重破印 (PO_SEAL_1)", "財為忌");
      if (財 && 比劫) return R("救應", "財破印 → 比劫制財", "財為忌");
      return (官 || 殺) ? R("成格", "官印雙全", "用官") : (食 || 傷) ? R("成格", "印旺透食傷洩秀", "用傷食") : R("合格普通", "印ไม่มีค้ำ", null);
    case "食神格":
      if (殺透 && 印) return R("成格", "食神帶煞印 (ZPZQ-5.2-06)", "帶煞");
      if (has("偏印") && !財) return R("破格", "梟印奪食 (PO_FOOD_1)", null);  // 梟奪食破·用神พัง
      if (has("偏印") && 財) return R("救應", "梟印奪食 → 透財化梟", "生財");
      return 財 ? R("成格", "食神生財", "生財") : 殺 ? R("成格", "食帶煞制殺", "帶煞") : R("合格普通", "食ไม่มีค้ำ", null);
    case "七殺格":
      if (!食 && !印 && !比劫 && !strong) return R("破格", "煞重身輕無制無印 (PO_KILL_3)", null);
      return (食 || 傷) ? R("成格", "食制殺", "食制") : 印 ? R("成格", "印化殺", "用印") : (strong && 財) ? R("成格", "身強財滋殺", null) : R("合格普通", "殺ไม่มีตัวคุมชัด", null);
    case "傷官格":
      if (官) {
        if (STEM_ELEMENT[dm] === "metal") return R("成格", "金水傷官 · 允許見官 (例外)", 印 ? "佩印" : "生財");
        return 財 ? R("救應", "傷官見官 → 財通關", "生財") : R("破格", "傷官見官 非金水 (PO_HURT_1)", null);
      }
      return 財 ? R("成格", "傷官生財", "生財") : 印 ? R("成格", "傷官佩印", "佩印") : 殺 ? R("成格", "傷官駕殺", null) : R("合格普通", "傷ไม่มีค้ำ", null);
    case "陽刃格":
      if (!官 && !殺) return R("破格", "無官煞制刃 (PO_BLADE_1)", null);
      if ((官 || 殺) && 傷 && !印) return R("破格", "官遭傷 (PO_BLADE_2)", 官 ? "用官" : "用煞");
      return R("成格", "透官煞制刃 + 財印", 官 ? "用官" : "用煞");
    case "建祿月劫格":
      if (!財 && !官 && !殺) return R("破格", "純比劫無財官煞 (PO_LU_1)", null);
      if (財 && 殺 && 合煞) return R("救應", "財帶七殺 → 合煞存財 (ZPZQ-5.2-02)", "用財");
      if (財 && (食 || 傷) && !印) return R("成格", "祿劫用財須帶食傷化劫生財 (ZPZQ-5.2-07)", "用財");
      if (官 && 傷 && 印 && 印合傷) return R("救應", "用官被傷 → 印護合傷護官 (ZPZQ-5.2-03)", "用官");
      if (官 && 傷 && 印) return R("救應", "用官被傷 → 印制傷護官 (ZPZQ-5.2-04)", "用官");
      if (官 && 傷) return R("破格", "用官而官被傷 (PO_LU_2)", "用官");
      if (財 && (食 || 傷)) return R("成格", "祿劫用財須帶食傷化劫生財 (ZPZQ-5.2-07)", "用財");
      return R("成格", "透官逢財印/透財逢食傷", 官 ? "用官" : 財 ? "用財" : null);
    default: return null;
  }
}

/* ═══ Layer 5 行運成敗 timing (port จาก proto-layer5-v1 · APPROVED · derived · ไม่แตะ wrapper LOCKED) ═══
   §1a 子平真詮論行運ตารางทองคำ喜運/忌運 per格×相神 + §2d 滴天髓日主旺衰 + §2c-lite ปีจรหนุน/ต้าน
   ทุก verdict อ้าง rule-id · UNMAPPED ไม่ false-neutral · spec: data/library/sifu-extra/bazi-layer5-timing-spec.md */
const RUN_RULES_L5: Record<string, { xi: string[]; ji: string[]; src: string }> = {
  "正官格|佩印":   { xi:["正印","偏印"],          ji:["正財","偏財"],            src:"ZP-1a-01 官用印制傷·運助印/忌財去印" },
  "正官格|無印":   { xi:["正財","偏財"],          ji:["傷官","食神"],            src:"ZP-1a-02 正官無印·運行傷則破" },
  "正官格|用財":   { xi:["正印","偏印"],          ji:["傷官","食神","七殺"],     src:"ZP-1a-03 正官用財·喜印身旺·忌食傷" },
  "財格|生官":     { xi:["正印","偏印","比肩","劫財"], ji:["七殺","傷官"],       src:"ZP-1a-04 財旺生官·喜身旺印·不利煞傷" },
  "財格|食生":     { xi:["正財","偏財","比肩","劫財"], ji:["正官","七殺"],       src:"ZP-1a-05 財用食生·財食重喜幫身·官煞晦" },
  "財格|佩印":     { xi:["正官","正印","偏印"],   ji:["比肩","劫財"],            src:"ZP-1a-06 財佩印·喜官鄉·身弱喜印旺" },
  "財格|帶傷":     { xi:["正財","偏財"],          ji:["七殺"],                   src:"ZP-1a-07 財帶傷官·財運亨·煞運不利" },
  "印綬格|用官":   { xi:["正財","偏財","傷官","食神"], ji:[],                    src:"ZP-1a-08 印用官·財運反吉·傷食最利" },
  "印綬格|用傷食": { xi:["正財","偏財","傷官","食神"], ji:["正官","七殺"],       src:"ZP-1a-09 印旺洩秀·財傷食吉·官煞太過" },
  "印綬格|印重用財":{ xi:["正財","偏財"],         ji:["比肩","劫財"],            src:"ZP-1a-10a 印多透財抑太過·忌比劫去財" },  // ⏳ inactive until buildXiangShen แยก身強印重 (5.2) — forward-compat ไม่ใช่ dead-code
  "印綬格|財為忌":  { xi:["比肩","劫財"],         ji:["正財","偏財"],            src:"ZP-1a-10b 印帶財為忌·運劫財去財救印=喜" },
  "食神格|生財":   { xi:["正財","偏財"],          ji:["正官","七殺","偏印"],     src:"ZP-1a-11 食神生財·忌官煞·畏梟奪食" },
  "食神格|帶煞":   { xi:["正印","偏印","比肩","劫財"], ji:["正財","偏財"],       src:"ZP-1a-12 食用煞印·喜印旺身旺·忌財鄉" },
  "七殺格|食制":   { xi:["食神","傷官","比肩","劫財"], ji:["正印","偏印","正財","偏財","正官"], src:"ZP-1a-13 煞用食制·喜食傷制煞/比劫助身·畏印奪食·忌財黨煞·忌官混" },
  "七殺格|用印":   { xi:["傷官","食神","比肩","劫財"], ji:["正財","偏財"],       src:"ZP-1a-14 煞用印·不利財鄉·傷食美" },
  "傷官格|佩印":   { xi:["正官","七殺","正印","偏印"], ji:["正財","偏財"],       src:"ZP-1a-15 傷官佩印·運行官煞美·忌財" },
  "傷官格|生財":   { xi:["正財","偏財"],          ji:["七殺","正印","偏印"],     src:"ZP-1a-16 傷官生財·財運亨·煞印不利" },
  "陽刃格|用官":   { xi:["正財","偏財","正官"],   ji:["食神","傷官"],            src:"ZP-1a-17 陽刃用官·運助財鄉·忌食傷制官" },
  "陽刃格|用煞":   { xi:["正財","偏財","七殺"],   ji:["食神"],                   src:"ZP-1a-18 陽刃用煞·忌食制煞" },
  "建祿格|用官":   { xi:["正財","正官"],          ji:["傷官"],                   src:"ZP-1a-19 建祿用官·運逢傷則破" },
  "建祿格|用財":   { xi:["傷官","食神","正財","偏財"], ji:["比肩","劫財"],       src:"ZP-1a-20 月劫用財·運行傷食·忌比劫" },
};
// fail-fast: กัน xi∩ji overlap (เคส 七殺食制 เดิม) — รันตอน module load
for (const [k, r] of Object.entries(RUN_RULES_L5)) {
  const ov = r.xi.filter((x) => r.ji.includes(x));
  if (ov.length) throw new Error(`RUN_RULES_L5 xi∩ji overlap ${k}: ${ov.join("/")}`);
}
function dmVigorL5(label: string | undefined): "旺相" | "休囚" {
  return (label === "strong_root" || label === "rooted") ? "旺相" : "休囚"; // partial/token/no_root → 休囚
}
/* judge: วัยจรปัจจุบัน vs ตารางกฎ → 成/破 + §2d旺衰 + §2c-liteปีจร · ทุกอย่างจากค่าที่ engine มีแล้ว */
export function buildChengBaiNow(
  xiangShen: { geZh: string; subLabel?: string | null } | null,
  dm: string,
  currentLuck: { stem: string; branch: string } | null,
  annualPillar: { stem: string; branch: string } | null,
  dmRootLabel: string | undefined,
  is3p: boolean,
): NonNullable<ChartPacket["chengBaiNow"]> | null {
  if (is3p || !xiangShen || !currentLuck) return null;            // ปิด 3p (วัยจรไม่นิ่ง)
  const sub = xiangShen.subLabel;
  if (!sub) return null;                                          // 相神 map sub-label ไม่ได้ → ไม่ตัดสิน timing
  const geKey = xiangShen.geZh === "建祿月劫格" ? "建祿格" : xiangShen.geZh;  // align RUN key
  const key = `${geKey}|${sub}`;
  const rule = RUN_RULES_L5[key];
  if (!rule) return { geZh: geKey, subLabel: sub, verdict: "UNMAPPED", reason: `ไม่มีกฎ ${key} (ห้าม false-neutral)`, ruleId: "UNMAPPED_RULE" };
  // luckGods = สิบเทพของวัยจร (ก้าน + กิ่งซ่อนหลัก · lock ตาม consensus)
  const luckGods: string[] = [];
  const lt = tenGodOf(dm, currentLuck.stem); if (lt) luckGods.push(lt);
  const lm = (HIDDEN_STEMS_MAP[currentLuck.branch] || [])[0]; if (lm) { const h = tenGodOf(dm, lm); if (h) luckGods.push(h); }
  const hitXi = luckGods.filter((g) => rule.xi.includes(g));
  const hitJi = luckGods.filter((g) => rule.ji.includes(g));
  let verdict: string, reason: string;
  if (hitJi.length && !hitXi.length) { verdict = "破"; reason = `วัยจร ${hitJi.join("/")} = 忌運 (ขัดโครงดวง)`; }
  else if (hitXi.length && !hitJi.length) { verdict = "成"; reason = `วัยจร ${hitXi.join("/")} = 喜運 (หนุนโครงดวง)`; }
  else if (hitXi.length && hitJi.length) { verdict = "平"; reason = `วัยจรมีทั้งหนุน(${hitXi.join("/")})และขัด(${hitJi.join("/")})`; }
  else { verdict = "平"; reason = "วัยจรเป็นกลางต่อโครงดวง"; }
  // §2d 滴天髓 旺衰ปรับความหนักของ破
  if (verdict === "破") {
    if (dmVigorL5(dmRootLabel) === "旺相") { verdict = "破(เบา)"; reason += " · DTS-2d 日主旺相→ทนได้ (เบาลง)"; }
    else { verdict = "破(หนัก)"; reason += " · DTS-2d 日主休囚→รับเต็ม"; }
  }
  // §2c-lite ปีจรปัจจุบัน (太歲重天干 → ใช้ก้านปีจร)
  let annual: string | undefined;
  if (annualPillar) {
    const yg = tenGodOf(dm, annualPillar.stem);
    if (yg) annual = rule.xi.includes(yg) ? `DTS-2c ปีจร ${yg}=หนุนซ้ำ` : rule.ji.includes(yg) ? `DTS-2c ปีจร ${yg}=ต้าน` : `DTS-2c ปีจร ${yg}=กลาง`;
  }
  return { geZh: geKey, subLabel: sub, verdict, reason, ruleId: rule.src, annual };
}

type BingYaoCandidate = NonNullable<NonNullable<ChartPacket["bingYao"]>["primary"]>;
const ROOT_RANK_BY: Record<RootLabel, number> = {
  no_root: 0, token_root: 1, partial_root: 2, rooted: 3, strong_root: 4,
};
function rootRankBY(label: RootLabel | undefined): number {
  return label ? ROOT_RANK_BY[label] ?? 0 : 0;
}
function uniqElsBY(arr: Array<ElementEN | null | undefined>): ElementEN[] {
  return Array.from(new Set(arr.filter(Boolean) as ElementEN[]));
}
function godsForElementsBY(dmElement: ElementEN, els: ElementEN[]): string[] {
  return Array.from(new Set(els.flatMap((el) => tenGodOfElement(dmElement, el))));
}
function isFalseFollowCandidateLabel(label: string): boolean {
  return /^假從/.test((label || "").trim());
}
function isFalseFollowAuditConflict(a: ChartPacket["strictGeJuAudit"] | undefined): a is NonNullable<ChartPacket["strictGeJuAudit"]> {
  return !!a && isFalseFollowCandidateLabel(a.currentLabel) && !a.matchesCurrent && !!a.strictLabel;
}
function isConfirmedSpecialStructureForProtocol(label: string): boolean {
  const l = (label || "").trim();
  if (/^假(從|化)/.test(l)) return false; // 假從/假化 ยังต้องอ่านราก+病藥 ไม่ปิดแบบ真從/真化
  return /^(真從|從|真化|化)/.test(l) || /曲直|炎上|稼穡|從革|潤下|魁罡/.test(l);
}
function hasSupportDirection(
  dmElement: ElementEN,
  usefulGods: ChartPacket["usefulGods"],
): boolean {
  const support = uniqElsBY([producerElementOf(dmElement), dmElement]);
  return support.some((el) => usefulGods.yong.includes(el) || usefulGods.xi.includes(el));
}
function candidateBY(
  id: string,
  diseaseType: string,
  diseaseElements: ElementEN[],
  medicineElements: ElementEN[],
  dmElement: ElementEN,
  reason: string,
  guard: string,
  sourceIds: string[],
  diseaseGods: string[] = godsForElementsBY(dmElement, diseaseElements),
  medicineGods: string[] = godsForElementsBY(dmElement, medicineElements),
): BingYaoCandidate {
  return { id, diseaseType, diseaseElements, diseaseGods, medicineElements, medicineGods, reason, sourceIds, guard };
}
type BingYaoContext = {
  pillars?: Record<PillarKey, { stem: string; branch: string } | null>;
  dmStem?: string;
  monthBranch?: string | null;
  climate?: string | null;
};
function countVisibleElementBY(pillars: BingYaoContext["pillars"], el: ElementEN | null | undefined): number {
  if (!pillars || !el) return 0;
  return PILLAR_KEYS.filter((k) => STEM_ELEMENT[pillars[k]?.stem || ""] === el).length;
}
function shouldUseSealHeavyWealthMedicine(
  ctx: BingYaoContext,
  dmElement: ElementEN,
  rootedness: ChartPacket["rootedness"],
  elementProfile: ChartPacket["elementProfile"],
  wealthEl: ElementEN | null | undefined,
): boolean {
  if (!rootedness || !wealthEl) return false;
  const sealEl = producerElementOf(dmElement);
  const hotDryMonth = ["巳", "午", "未", "戌"].includes(ctx.monthBranch || "");
  const sealCount = sealEl ? (elementProfile.counts[sealEl] || 0) : 0;
  const sealVisible = countVisibleElementBY(ctx.pillars, sealEl);
  const wealthCount = elementProfile.counts[wealthEl] || 0;
  const dmNotWeak = !["no_root", "token_root", "partial_root"].includes(rootedness.dmLabel);
  return hotDryMonth && sealCount >= 2 && sealVisible >= 1 && (wealthCount < 2 || dmNotWeak);
}
/* 病藥 v1 — จุดเสียของโครงดวง + ตัวยาแก้ (ไม่ใช่โรคสุขภาพ)
   子平真詮: 傷其扶/去其抑者為病，除病神為藥 · 滴天髓: 旺太過宜泄, 弱有根宜扶, 弱無根從勢 */
export function buildBingYao(
  structureLabel: string,
  dmElement: ElementEN | "unknown",
  rootedness: ChartPacket["rootedness"] | null,
  usefulGods: ChartPacket["usefulGods"],
  xiangShen: ChartPacket["xiangShen"] | null,
  chengBaiNow: ChartPacket["chengBaiNow"] | null,
  elementProfile: ChartPacket["elementProfile"],
  ctx: BingYaoContext = {},
): ChartPacket["bingYao"] {
  if (dmElement === "unknown" || !rootedness) return { status: "needs_review", primary: null, candidates: [] };
  const yong = usefulGods.yong[0] || null;
  const xi = usefulGods.xi || [];
  const ji = usefulGods.ji || [];
  if (isConfirmedSpecialStructureForProtocol(structureLabel)) {
    return { status: "not_applicable", primary: null, candidates: [] };
  }
  const candidates: BingYaoCandidate[] = [];
  const add = (c: BingYaoCandidate) => candidates.push(c);
  const xsReason = xiangShen?.reason || "";

  // 假從 guard: ถ้า usefulGods กลับไปทาง印/比劫 แปลว่าไม่ควรปิด病藥แบบ真從
  if (isFalseFollowCandidateLabel(structureLabel) && hasSupportDirection(dmElement, usefulGods)) {
    const medicine = uniqElsBY([producerElementOf(dmElement), dmElement].filter((el) => el && (usefulGods.yong.includes(el) || usefulGods.xi.includes(el))));
    add(candidateBY("BY-11", "身弱有根: ตัวตนอ่อนแต่ยังมี印/比可救 ไม่ใช่從แท้", ji.length ? ji : uniqElsBY([ELEMENT_PRODUCES[dmElement], controllerElementOf(dmElement)]), medicine, dmElement,
      "raw engine label เป็น假從候選 แต่ธาตุช่วยรวมกลับมาทาง印/比劫 → 病คือแรง忌神/泄身ที่กดตัวตน ไม่ใช่ป้าย假從เอง; อ่าน病藥ประกอบ ไม่ปิดแบบ真從",
      "gate: ใช้เมื่อ usefulGods ชี้กลับหนุนตัวตน · candidate ระดับต่ำเมื่อ engine ดิบ label=假從 · reason: 任氏假從 — 印/比劫ต้องช่วยตัวตนได้จริง", ["DTS-BY-11", "HK-FALSE-FOLLOW-GUARD-001"]));
  }

  // BY-08/BY-10/BY-09/BY-05: rule-table tied to 相神/成敗 reason first.
  if (xiangShen?.subLabel === "財為忌" || /財破印|財重破印/.test(xsReason)) {
    const wealthEl = ELEMENT_CONTROLS[dmElement];
    const sealEl = producerElementOf(dmElement);
    if (shouldUseSealHeavyWealthMedicine(ctx, dmElement, rootedness, elementProfile, wealthEl)) {
      /* 主藥=財(水) · 橋藥=食傷(金 = 生水之源/泄土之道 · 相神) แยกบทบาท ไม่รวมเป็น忌
       * 子平真詮論印 印多用財 + 食傷泄秀生財 (ZPZQ บรรทัด 190) */
      const bridgeEl = producerElementOf(wealthEl);   // ธาตุที่ผลิต財 = 食傷 = สะพาน生財
      const by08p = candidateBY("BY-08P", "印多用財: อิน/ไฟหนาในดวงร้อนแห้ง → 主藥=財/น้ำ · 橋藥=食傷/ทอง", uniqElsBY([sealEl, controllerElementOf(dmElement)]), uniqElsBY([wealthEl]), dmElement,
        `เดือน${ctx.monthBranch || "-"}ร้อนแห้ง + 印(${ELEMENT_TH[sealEl || "unknown"]}) count=${sealEl ? elementProfile.counts[sealEl] : "-"} และ透干=${countVisibleElementBY(ctx.pillars, sealEl)} → 子平論印 印多逢財 + 調候 ${ctx.dmStem || "-"}日${ctx.monthBranch || "-"}月 ${wealthEl ? ELEMENT_TH[wealthEl] : "-"}不可缺 · ${bridgeEl ? ELEMENT_TH[bridgeEl] : "-"}เป็น橋藥(生財/泄秀·相神)`,
        "pattern: 印多用財 (印重+ดวงร้อนแห้ง) · 主藥=財 · 橋藥=食傷(生財/泄土·相神·忌傷官見官) · อ้าง 子平真詮論印 + 窮通寶鑑調候", ["ZPZQ-BY-08P", "ZPZQ-PRINT-001", "QTBJ-TIAOHOU-戊未"]);
      if (bridgeEl) by08p.bridgeMedicine = [bridgeEl];
      add(by08p);
    } else {
      add(candidateBY("BY-08", "財破印: ดาวทรัพย์ทำลายอิน/ตัวหนุน", [wealthEl], [dmElement], dmElement,
        `相神=${xiangShen?.verdict || "-"}: ${xsReason}`, "gate: ใช้เมื่อไม่เข้าเงื่อนไข從財/化格 · reason: 任從化 ต้องตาม勢ก่อนใช้สูตร扶抑", ["ZPZQ-BY-08"]));
    }
  }
  if (/煞重身輕|殺重|財黨煞|財生殺/.test(xsReason) || (xiangShen?.geZh === "七殺格" && xiangShen.verdict === "破格")) {
    add(candidateBY("BY-10", "殺重身輕/財黨殺: แรงกดดันฆาตแรงกว่าตัวดวง", [controllerElementOf(dmElement) || dmElement], uniqElsBY([ELEMENT_PRODUCES[dmElement], producerElementOf(dmElement), dmElement]), dmElement,
      `相神=${xiangShen?.verdict || "-"}: ${xsReason || "七殺格破"}`, "ถ้า engine จัดเป็น從殺 ต้องไม่ใช้สูตร扶身/制殺นี้", ["ZPZQ-BY-10", "DTS-BY-10"]));
  }
  if (/梟印奪食/.test(xsReason)) {
    add(candidateBY("BY-09", "梟奪食: อินเกินจนกดการระบาย/ผลงาน", [producerElementOf(dmElement) || dmElement], [ELEMENT_CONTROLS[dmElement]], dmElement,
      `相神=${xiangShen?.verdict || "-"}: ${xsReason}`, "ถ้าเป็น食神帶煞印หรือ印為調候 ต้องให้ resolver ชนะก่อน", ["ZPZQ-BY-09"]));
  }
  if (xiangShen?.verdict === "破格" || chengBaiNow?.verdict?.startsWith("破")) {
    add(candidateBY("BY-05", "忌神傷用/傷相: ตัวขัดทำลาย用神หรือ相神", ji, uniqElsBY([yong, ...xi]), dmElement,
      `โครงดวง/วัยจรมีจุดขัด: ${xiangShen?.reason || ""}${chengBaiNow ? ` · ${chengBaiNow.reason}` : ""}`.trim(),
      "v1 ใช้เป็นคำเตือนเชิงโครงสร้าง ถ้า resolver ยังไม่ชี้ชัดให้ซินแสอ่านประกอบ", ["ZPZQ-BY-05"]));
  }

  // BY-01/BY-03: root/useful balance fallback.
  const counts = elementProfile.counts;
  const elements = Object.keys(counts) as ElementEN[];
  const strongest = elements
    .filter((el) => rootRankBY(rootedness.all[el]) >= 3)
    .sort((a, b) => (counts[b] - counts[a]) || (rootRankBY(rootedness.all[b]) - rootRankBY(rootedness.all[a])))[0];
  if (strongest && counts[strongest] >= 3 && !usefulGods.yong.includes(strongest)) {
    add(candidateBY("BY-01", "旺神太過: ธาตุหนึ่งแรงเกิน", [strongest], [ELEMENT_PRODUCES[strongest]], dmElement,
      `${ELEMENT_TH[strongest]}ราก=${rootedness.all[strongest]} และปรากฏ ${counts[strongest]} จุด → ใช้泄 ระบายแรง`,
      "ถ้าเป็น專旺/從旺 ต้อง not_applicable ไม่ใช่ใช้泄", ["DTS-BY-01"]));
  }
  if (yong && rootRankBY(rootedness.all[yong]) >= 1 && rootRankBY(rootedness.all[yong]) <= 2 && !rootedness.isExtremelyWeak) {
    add(candidateBY("BY-03", "弱神有根/รากบาง: ธาตุที่ใช้ยังไม่มั่นคง", [yong], uniqElsBY([yong, producerElementOf(yong)]), dmElement,
      `用神 ${ELEMENT_TH[yong]} ราก=${rootedness.all[yong]} → ใช้扶 เติมแม่/พวกเดียวกัน`,
      "ถ้า no_root และดวงเข้า從/化 ห้ามฝืน扶", ["DTS-BY-03"]));
  }

  // BY-06: 通關缺 lite from direct yong/ji clash.
  for (const bad of ji) {
    for (const good of uniqElsBY([yong, ...xi])) {
      if (ELEMENT_CONTROLS[bad] === good) {
        const bridge = ELEMENT_PRODUCES[bad]; // bad -> bridge -> good
        add(candidateBY("BY-06", "通關缺: ตัวขัดชนธาตุสำคัญ ต้องมีตัวกลาง", [bad, good], [bridge], dmElement,
          `${ELEMENT_TH[bad]}剋${ELEMENT_TH[good]} → ใช้${ELEMENT_TH[bridge]}เป็นตัวผ่านด่าน`, "ใช้เมื่อสองฝ่ายยังต้องเก็บไว้ ไม่ใช่ตัดฝ่ายหนึ่งทิ้ง", ["ZPZQ-BY-06"]));
      }
    }
  }

  const primary = candidates[0] || null;
  return { status: primary ? "ok" : "needs_review", primary, candidates };
}

const TIAOHOU_PROTOCOL: Record<string, { regulator: ElementEN; bridge: ElementEN; th: string }> = {
  cold:     { regulator: "fire",  bridge: "wood",  th: "หนาว/เย็น → ใช้ไฟอุ่น ไม้ช่วยเลี้ยงไฟ" },
  damp:     { regulator: "fire",  bridge: "wood",  th: "ชื้น/หนัก → ใช้ไฟตาก ไม้ช่วยเปิดทางไฟ" },
  scorched: { regulator: "water", bridge: "metal", th: "ร้อนจัด → ใช้น้ำลดร้อน ทองช่วยตั้งน้ำ" },
  dry:      { regulator: "water", bridge: "metal", th: "แห้ง → ใช้น้ำหล่อ ทองช่วยเก็บความชื้น" },
};

type StrictTiaoHouRule = {
  primary: string[];
  secondary: string[];
  tertiary: string[];
  rationaleZh: string;
};
const STRICT_TIAOHOU_TABLE: Record<string, StrictTiaoHouRule> = {
  "壬|戌": { primary: ["甲"], secondary: ["丙"], tertiary: [], rationaleZh: "以甲制戌中戊土，丙火為佐" },
  "戊|未": { primary: ["癸"], secondary: ["丙"], tertiary: ["甲"], rationaleZh: "調候為急，癸不可缺，丙火配用，土重不能無甲" },
};
function stemsToElements(stems: string[]): ElementEN[] {
  return uniqElsBY(stems.map((s) => STEM_ELEMENT[s]).filter(Boolean));
}
function buildStrictTiaoHouProtocol(
  dmStem: string | undefined,
  monthBranch: string | undefined,
): NonNullable<NonNullable<ChartPacket["yongShenProtocols"]>["tiaoHou"]["strict"]> | null {
  if (!dmStem || !monthBranch) return null;
  const rule = STRICT_TIAOHOU_TABLE[`${dmStem}|${monthBranch}`];
  if (!rule) return null;
  return {
    dmStem,
    monthBranch,
    primaryStems: rule.primary,
    secondaryStems: rule.secondary,
    tertiaryStems: rule.tertiary,
    primaryElements: stemsToElements(rule.primary),
    secondaryElements: stemsToElements(rule.secondary),
    tertiaryElements: stemsToElements(rule.tertiary),
    rationaleZh: rule.rationaleZh,
    sourceRuleId: "QTBJ-TIAOHOU-120",
    noteTh: `strict調候 ${dmStem}日${monthBranch}月: 主=${rule.primary.join("/") || "-"} · 次=${rule.secondary.join("/") || "-"} · 再=${rule.tertiary.join("/") || "-"} — ${rule.rationaleZh}`,
  };
}

function buildYongShenProtocols(
  structureLabel: string,
  structureBasis: string | null | undefined,
  climate: string | null | undefined,
  dmElement: ElementEN | "unknown",
  rootedness: ChartPacket["rootedness"] | null,
  usefulGods: ChartPacket["usefulGods"],
  xiangShen: ChartPacket["xiangShen"] | null,
  bingYao: ChartPacket["bingYao"] | null,
  dmStem?: string,
  monthBranch?: string,
): NonNullable<ChartPacket["yongShenProtocols"]> {
  const climateRule = climate ? TIAOHOU_PROTOCOL[climate] : null;
  const strictTiaoHou = buildStrictTiaoHouProtocol(dmStem, monthBranch);
  let mode: NonNullable<ChartPacket["yongShenProtocols"]>["fuyi"]["mode"] = "unknown";
  let fuyiEls: ElementEN[] = [];
  if (dmElement !== "unknown") {
    if (isConfirmedSpecialStructureForProtocol(structureLabel)) {
      mode = "從勢/特殊格優先";
      fuyiEls = [];
    } else if (!rootedness || ["no_root", "token_root", "partial_root"].includes(rootedness.dmLabel)) {
      mode = "扶";
      fuyiEls = uniqElsBY([producerElementOf(dmElement), dmElement]);
    } else {
      mode = "抑/泄";
      fuyiEls = uniqElsBY([ELEMENT_PRODUCES[dmElement], controllerElementOf(dmElement)]);
    }
  }
  const byPrimary = bingYao?.primary || null;
  return {
    tag: "HK_YONGSHEN_PROTOCOL_SPLIT_V1",
    ctextPrinciple: "子平真詮: 用神先看月令/格局；調候、扶抑、病藥、相神ต้องแยกชั้น ไม่เรียกปนกัน",
    structure: {
      protocol: "格局/月令用神",
      geJuLabel: structureLabel || "ปกติ",
      basis: structureBasis || null,
      noteTh: "ชื่อ格และ用神ชั้นโครงสร้างจาก月令/格局 ไม่ใช่ธาตุบาลานซ์รวมของ engine",
      sourceRuleId: "ZPZQ-GJ-001",
      canonicalChinese: "八字用神，專求月令",
    },
    xiangShen: {
      protocol: "相神",
      geZh: xiangShen?.geZh || null,
      verdict: xiangShen?.verdict || null,
      subLabel: xiangShen?.subLabel || null,
      noteTh: "相神คือตัวช่วยให้格局ใช้งานได้ ไม่ใช่調候หรือ扶抑",
    },
    tiaoHou: {
      protocol: "調候用神",
      climate: climate || null,
      regulator: climateRule?.regulator || null,
      bridge: climateRule?.bridge || null,
      strict: strictTiaoHou,
      noteTh: strictTiaoHou
        ? `${strictTiaoHou.noteTh} · climate engine=${climateRule ? climateRule.th : "ไม่พบ climate พิเศษ"}`
        : climateRule ? climateRule.th : "ไม่พบ climate พิเศษจาก engine",
    },
    fuyi: {
      protocol: "扶抑用神",
      dmRootLabel: rootedness?.dmLabel || null,
      mode,
      candidateElements: fuyiEls,
      noteTh: mode === "扶"
        ? "ตัวตนอ่อน/รากบาง → ชั้น扶抑อ่านแนวเติมแม่/พวกเดียวกัน"
        : mode === "抑/泄"
          ? "ตัวตนมีราก → ชั้น扶抑อ่านแนวระบายหรือควบให้สมดุล"
        : mode === "從勢/特殊格優先"
            ? "真從/真化/專旺 → อ่านตาม勢ก่อน ไม่ยัดสูตร扶抑ปกติทับ"
            : "ข้อมูลรากไม่พอสำหรับชั้น扶抑",
    },
    bingYao: {
      protocol: "病藥",
      status: bingYao?.status || null,
      primaryId: byPrimary?.id || null,
      medicineElements: byPrimary?.medicineElements || [],
      noteTh: byPrimary
        ? "病藥คือจุดเสียกับตัวยาเชิงโครงสร้าง แยกจากชื่อ格และ調候"
        : bingYao?.status === "not_applicable"
          ? "ดวงพิเศษไม่ใช้病藥แบบ扶抑ตรงๆ"
          : "engine ยังไม่พบ病หลักที่ชัด",
    },
    finalCombined: {
      protocol: "engine_final_combined",
      yong: usefulGods.yong,
      xi: usefulGods.xi,
      ji: usefulGods.ji,
      noteTh: "นี่คือธาตุช่วย/ระวังที่ engine สรุปรวมแล้ว ไม่ใช่ 子平真詮 用神(月令) อย่างเดียว",
    },
  };
}

function buildStrictGeJuAuditPacket(
  pillars: Record<PillarKey, { stem: string; branch: string } | null>,
  currentLabel: string,
): NonNullable<ChartPacket["strictGeJuAudit"]> {
  const audit = auditStrictGeJuFromMonth(pillars);
  const strictLabel = audit.structure;
  return {
    tag: "HK_STRICT_GEJU_AUDIT_V1",
    currentLabel: currentLabel || "ปกติ",
    strictLabel,
    selectedStem: audit.selectedStem,
    selectedSource: audit.selectedSource,
    tenGod: audit.tenGod,
    confidence: audit.confidence,
    matchesCurrent: !!strictLabel && currentLabel === strictLabel,
    reasonCodes: audit.reasonCodes,
    sourceRuleIds: audit.sourceRuleIds,
    thaiSummary: audit.thaiSummary,
    canonicalChinese: audit.canonicalChinese,
    noteTh: "audit-only: ใช้แยกชื่อ格ตาม月令 strict ออกจากพลังที่ engine อ่านใช้งานจริง ไม่ใช่การเปลี่ยนผลดวง",
  };
}

/* 橋藥 reconciler (30 พ.ค.) — แก้ความขัด BY-08P藥 vs usefulGods.ji
 * ดวง印多用財: 金เป็น橋藥/相神(生水·泄土) ไม่ใช่忌本身 · ที่忌คือ傷官見官
 * ย้าย bridge element ออกจาก blanket ji → ใส่ conditionalUse (有條件之喜)
 * 滴天髓「隨其所向論喜忌」· ZPZQ 論相神 · ไม่แตะ wrapper-7 (ทำหลัง build)
 * caveat: badWhen 傷官見官 เตือนเฉพาะเมื่อ官星(剋DM element)透干จริง */
function reconcileBy08pBridgeMedicine(packet: ChartPacket): void {
  const by = packet.bingYao;
  const primary = by?.primary;
  if (!primary || primary.id !== "BY-08P" || !primary.bridgeMedicine?.length) return;
  if (!packet.usefulGods) return;
  const dmEl = STEM_ELEMENT[packet.meta?.dayMaster || ""] || null;
  /* 官星 = ธาตุที่剋 DM · ถ้า官透干จริง → badWhen 傷官見官 active */
  const officerEl = dmEl ? controllerElementOf(dmEl) : null;
  const officerVisible = officerEl
    ? (packet.pillars as Array<{ stem?: string }>).some((p) => {
        const st = p?.stem;
        return st ? STEM_ELEMENT[st] === officerEl : false;
      })
    : false;
  const conditional = packet.usefulGods.conditionalUse || [];
  const fc = packet.yongShenProtocols?.finalCombined;
  for (const el of primary.bridgeMedicine) {
    /* ย้ายออกจาก blanket ji (ถ้ามี) — ไม่ใช่忌เดี่ยว · ทั้ง usefulGods + finalCombined (用神分層) */
    if (packet.usefulGods.ji.includes(el)) {
      packet.usefulGods.ji = packet.usefulGods.ji.filter((x) => x !== el);
    }
    if (fc?.ji?.includes(el)) {
      fc.ji = fc.ji.filter((x) => x !== el);
    }
    conditional.push({
      element: el,
      role: "bridge_medicine_相神",
      goodWhen: ["生水之源", "泄土之道", "傷官佩印", "開食傷"],
      badWhen: officerVisible ? ["傷官見官(官星透干·ระวังจริง)"] : ["傷官見官(ถ้า官透干)"],
      source: "BY-08P",
    });
  }
  packet.usefulGods.conditionalUse = conditional;
}

export function buildStructuredChartPacket(
  calc: Calc,
  ext: Ext,
  dm: string,
  ageNow: number,
  g: Record<string, string>,
  rootedness: ChartPacket["rootedness"] = null,  // 通根 (route เรียก wrapper-7 ส่งมา · optional · undefined=group/ไม่ส่ง)
  gender: "M" | "F" | null = null,               // 小運 ทิศ (route ส่ง · null=ไม่คำนวณ小運)
  siLingDays: number | null = null,              // 司令 วันนับจาก節 (route เรียก computeSiLingDays ส่ง · null=本氣 fallback)
  opts: ChartPacketBuildOptions = {},
): ChartPacket {
  const dmElement = STEM_ELEMENT[dm] || "unknown";
  const dmPolarity = STEM_POLARITY[dm] || "yang";
  const packetOpts = normalizeBuildOptions(opts);

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
  /* 3p (ไม่ทราบเวลาเกิด): กรองเสายาม(時)ออก · ห้าม render "-" เปล่า (กัน AI เดายาม · ทริค#6) */
  const activePillarKeys = calc.mode === "3p" ? PILLAR_KEYS.filter((k) => k !== "hour") : PILLAR_KEYS;
  const pillars: ChartPacket["pillars"] = activePillarKeys.map((k) => {
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
     * cap 15/เสา ให้ AI เห็นดาวช่วยสำคัญที่มักตามหลังดาวเตือน · ส่ง polarity ไปด้วย AI จะได้ไม่เดาดี-ร้าย */
    const POL_ORDER: Record<string, number> = { bad: 0, good: 1, neutral: 2 };
    const stars = [...(ext.special_stars[k] || [])]
      .sort((a, b) => (POL_ORDER[a.polarity] ?? 3) - (POL_ORDER[b.polarity] ?? 3))
      .slice(0, 15)
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

  /* ─── transitDrilldown (วัยจรปัจจุบัน → ปีจร 10 ปี → เดือนจร 12 เดือน)
   * source = ext.luck_decade_drilldown ที่ engine คำนวณแล้ว · packet แค่ map/annotate useful role
   * ไม่ส่งทุกวัยจรทั้งชีวิตเข้า prompt เพื่อคุมขนาด แต่ให้ AI ตอบย้อนหลัง/รายเดือนในรอบปัจจุบันได้โดยไม่คำนวณเสาเอง */
  const asElement = (el: unknown): ElementEN | "unknown" => {
    const v = String(el || "").toLowerCase() as ElementEN;
    return VALID.has(v) ? v : "unknown";
  };
  const usefulRole = (el: ElementEN | "unknown"): "yong" | "xi" | "ji" | "neutral" => {
    if (el === "unknown") return "neutral";
    if (yong.includes(el)) return "yong";
    if (xi.includes(el)) return "xi";
    if (ji.includes(el)) return "ji";
    return "neutral";
  };
  const hiddenTransit = (xs: Array<{ stem: string; element: string; ten_god: string | null; useful_role?: string }> = []) =>
    xs.map((h) => {
      const el = asElement(h.element);
      const role = (h.useful_role === "yong" || h.useful_role === "xi" || h.useful_role === "ji" || h.useful_role === "neutral")
        ? h.useful_role
        : usefulRole(el);
      return { stem: h.stem, element: el, tenGod: h.ten_god, usefulRole: role };
    });
  const transitImpacts = (xs: Array<{
    type: string; type_th: string; pair: string; target: string; target_th: string; palace_th: string;
    domains_th: string[]; strength: "low" | "medium" | "high" | "critical"; summary_th: string;
  }> = []) => xs.map((x) => ({
    type: x.type,
    typeTh: x.type_th,
    pair: x.pair,
    target: x.target,
    targetTh: x.target_th,
    palaceTh: x.palace_th,
    domainsTh: x.domains_th || [],
    strength: x.strength,
    summaryTh: x.summary_th,
  }));
  const drill = calc.mode === "3p"
    ? null
    : ((ext.luck_decade_drilldown || [])[ext.current_luck_idx] || null);
  const transitDrilldown: ChartPacket["transitDrilldown"] = drill ? {
    source: "engine_luck_decade_drilldown",
    monthPillarMethod: "jieqi_major_terms_with_mid_month_fallback",
    currentDecade: {
      luckIndex: drill.luck_index,
      luckPillar: drill.luck_pillar,
      ageStart: drill.age_start,
      ageEnd: drill.age_end,
      ageStartDetail: drill.age_start_detail,
      ageEndDetail: drill.age_end_detail,
      startDate: drill.start_date,
      endDate: drill.end_date,
      timingMethod: drill.timing_method,
      direction: drill.direction,
      directionTh: drill.direction_th,
      yearStart: drill.year_start,
      yearEnd: drill.year_end,
      years: (drill.years || []).map((y) => {
        const stemElement = asElement(y.element);
        const branchElement = asElement(y.branch_element);
        return {
          year: y.year,
          age: y.age,
          pillar: y.pillar,
          baziYearStart: y.bazi_year_start ?? null,
          baziYearEnd: y.bazi_year_end ?? null,
          calendarNote: y.calendar_note || "",
          stemElement,
          branchElement,
          stemUsefulRole: usefulRole(stemElement),
          branchUsefulRole: usefulRole(branchElement),
          hiddenStems: hiddenTransit(y.hidden_stems),
          tenGod: y.ten_god,
          flag: y.flag,
          vsDayBranch: y.vs_day_branch || [],
          vsLuckBranch: y.vs_luck_branch || [],
          impacts: transitImpacts(y.impacts),
          months: (y.months || []).map((m) => {
            const mStemElement = asElement(m.element);
            const mBranchElement = asElement(m.branch_element);
            return {
              month: m.month,
              label: m.label,
              pillar: m.pillar,
              jieqiStart: m.jieqi_start ?? null,
              jieqiEnd: m.jieqi_end ?? null,
              monthMethod: m.month_method || "mid_month_fallback",
              stemElement: mStemElement,
              branchElement: mBranchElement,
              stemUsefulRole: usefulRole(mStemElement),
              branchUsefulRole: usefulRole(mBranchElement),
              hiddenStems: hiddenTransit(m.hidden_stems),
              tenGod: m.ten_god,
              flag: m.flag,
              vsDayBranch: m.vs_day_branch || [],
              vsLuckBranch: m.vs_luck_branch || [],
              impacts: transitImpacts(m.impacts),
            };
          }),
        };
      }),
    },
  } : null;

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

  const mukuTransitInputs: MukuTransitInput[] = [];
  const mukuTransitSeen = new Set<string>();
  const addMukuTransit = (input: MukuTransitInput | null | undefined) => {
    if (!input?.pillar?.branch) return;
    const key = `${input.scope}|${input.year ?? ""}|${input.month ?? ""}|${input.pillar.stem}${input.pillar.branch}`;
    if (mukuTransitSeen.has(key)) return;
    mukuTransitSeen.add(key);
    mukuTransitInputs.push(input);
  };
  addMukuTransit(currentLuck ? {
    scope: "luck",
    label: "大運",
    pillar: { stem: currentLuck.stem, branch: currentLuck.branch },
  } : null);
  if (cyp?.branch) {
    addMukuTransit({
      scope: "annual",
      label: `ปีจร ${new Date().getFullYear()}`,
      year: new Date().getFullYear(),
      pillar: { stem: cyp.stem, branch: cyp.branch },
    });
  }
  for (const y of transitDrilldown?.currentDecade?.years || []) {
    addMukuTransit({ scope: "annual", label: `ปีจร ${y.year}`, year: y.year, pillar: y.pillar });
    for (const m of y.months || []) {
      addMukuTransit({
        scope: "month",
        label: `${y.year}-M${String(m.month).padStart(2, "0")}`,
        year: y.year,
        month: m.month,
        pillar: m.pillar,
      });
    }
  }
  const mukuUsefulOpts = { usefulElements: [...yong, ...xi], avoidElements: ji };
  const mukuStates = buildMukuStates(
    calc.pillars as Record<PillarKey, { stem: string; branch: string } | null>,
    mukuUsefulOpts,
  );
  const mukuTransitStates = buildMukuTransitStates(
    calc.pillars as Record<PillarKey, { stem: string; branch: string } | null>,
    mukuTransitInputs,
    mukuUsefulOpts,
  );

  const packet: ChartPacket = {
    packetVersion: "hourkey-chart-packet-lite-v1.1",
    packetLevel: "step1_lite",
    meta: {
      mode: calc.mode === "3p" ? "3p" : "4p", // 27 พ.ค. · เลิก hardcode · 3 เสาติดป้ายถูก
      dayMaster: dm,
      dmElement,
      dmPolarity,
      ageNow,
      readingOrder: g.READING_ORDER || "",
      dayBoundary: packetOpts.dayBoundary,
      dayBoundarySource: packetOpts.dayBoundarySource,
      timePillarConfidence: buildTimePillarConfidence(calc, packetOpts.dayBoundary),
    },
    pillars,
    structure: {
      label: calc.geJu?.structure || "ปกติ",
      special: ext.special_chart?.applicable
        ? { typeZh: ext.special_chart.type_zh, friendly: ext.special_chart.friendly_elements || [] }
        : null,
      confidence: calc.geJu?.confidence ?? null,
    },
    strictGeJuAudit: buildStrictGeJuAuditPacket(
      calc.pillars as Record<PillarKey, { stem: string; branch: string } | null>,
      calc.geJu?.structure || "ปกติ",
    ),
    /* HK_HUAQI_VERDICT_V1 · wrapper-8 化氣格 verdict (真化/假化/合而不化)
     * additive-only · ไม่ override structure.label · ไม่กระทบ wrapper-7 (อ่านแค่ findTransformation) */
    huaQi: (() => {
      const fn = _getAnalyzeHuaQi();
      if (!fn) return null;
      try {
        const v = fn(calc.pillars as _HuaQiAnalyzerInput);
        if (!v) return null;
        return {
          verdict: v.verdict,
          transformElement: v.transformElement as ElementEN,
          stems: { dm: v.stems.dm || dm, partner: v.stems.partner },
          partnerPosition: v.partnerPosition,
          monthSupport: v.monthSupport,
          dmRootLabel: v.dmRootLabel as RootLabel,
          confidence: v.confidence,
          sourceRuleIds: v.sourceRuleIds,
          thaiSummary: v.thaiSummary,
        };
      } catch {
        return null;
      }
    })(),
    /* กลุ่ม ก (เชื่อมท่อ · 26 พ.ค.) — ของที่ engine คำนวณแล้วแต่ packet ไม่เคย expose
       หมายเหตุ: 命宮 ถอดออกชั่วคราว — สูตร buildLifePalace anchor (子=0) ต่างจากตำราคลาสสิก (寅=1)
       benchmark 正月子時: โค้ด→子 · ตำรา→卯 · รอ verify สำนักกับซินแสก่อนเปิด (กันอ่านเรือนผิด) */
    trueSolarTime: calc.tst
      ? { appliedTimeStr: calc.tst.appliedTimeStr, totalShiftMin: calc.tst.totalShiftMin, dayShift: calc.tst.appliedDayShift }
      : null,
    /* 月柱ก้ำกึ่ง節氣 · เฉพาะ 3 เสา (ไม่รู้เวลา → การันตีเกี่ยว) + route ส่ง boundary มา · 4 เสาเสาตายตัว=null */
    monthAmbiguity: (calc.mode === "3p" && opts.monthBoundary?.boundary)
      ? {
          ambiguous: true,
          termName: opts.monthBoundary.termName || "節氣",
          jieqiIctApprox: opts.monthBoundary.jieqiIctApprox,
          before: opts.monthBoundary.before || "",
          after: opts.monthBoundary.after || "",
          used: calc.pillars.month ? (calc.pillars.month.stem + calc.pillars.month.branch) : "",
          dependentFields: MONTH_DERIVED_FIELDS,
          maxConfidence: "medium" as const,
        }
      : null,
    startLuckAge: calc.mode === "3p" ? null : (ext.luck_pillars?.[0]?.age_start ?? null), // 3p: computeStartAge ปลอม → ตัด 起運 (กันมโนยาม)
    rootedness: rootedness ?? null,
    fivePalaces: (() => {
      const tai = buildConceptionPalace(calc.pillars);
      const ming = buildLifePalace(calc.pillars);          // 27 พ.ค. สูตร 卯安命 節氣法 (4−M−H) + 五虎遁
      const shen = buildBodyPalace(calc.pillars, ming);     // 對宮ของ命宮
      const sl = buildSiLing(calc.pillars.month?.branch ?? "", siLingDays);  // 司令 (route ส่ง siLingDays)
      const xy = gender ? buildMinorLuck(calc.pillars, gender) : null;        // 小運 Option B (ต้อง gender + 時柱)
      return {
        taiYuan: tai ? { stem: tai.stem, branch: tai.branch, tenGod: tenGodLabelTh(tai.stem, dm) } : null,
        mingGong: ming ? { stem: ming.stem, branch: ming.branch, tenGod: tenGodLabelTh(ming.stem, dm) } : null,
        shenGong: shen ? { stem: shen.stem, branch: shen.branch, tenGod: tenGodLabelTh(shen.stem, dm) } : null,
        siLing: sl ? { stem: sl.stem, element: sl.element as ElementEN, phase: sl.phase, tenGod: tenGodLabelTh(sl.stem, dm) } : null,
        xiaoYun: xy ? { age1Stem: xy.entries[0].stem, age1Branch: xy.entries[0].branch, direction: xy.direction } : null,
      };
    })(),
    sixRelatives: gender ? (() => {
      const voidSet = new Set<string>(([...(ext.kong_wang?.void_branches || []), ...(ext.kong_wang?.year_xun_voids || [])] as string[]).filter(Boolean));
      const clashed = new Set<string>();
      for (const it of raw) {
        if (!["六沖", "六害", "六破", "三刑", "自刑", "子卯刑"].includes(it.type)) continue;
        for (const pp of it.participants) if (BRANCH_ELEMENT[pp.token]) clashed.add(pp.token);
      }
      const usefulFn = (el: ElementEN): "yong" | "xi" | "ji" | "neutral" =>
        yong.includes(el) ? "yong" : xi.includes(el) ? "xi" : ji.includes(el) ? "ji" : "neutral";
      return buildSixRelatives(
        calc.pillars as Record<string, { stem: string; branch: string } | null>,
        dm, dmElement as ElementEN, gender, rootedness ?? null, voidSet, clashed, usefulFn, calc.mode === "3p",
      );
    })() : null,
    xiangShen: buildXiangShen(
      calc.pillars as Record<string, { stem: string; branch: string } | null>,
      dm, calc.geJu?.structure || "",
    ),
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
    transitDrilldown,
    annualPillar: { stem: cyp?.stem || "-", branch: cyp?.branch || "-" },
    interactions: { status: interactionStatus, raw },
    hehuaVerdicts: buildHehuaVerdicts(calc.pillars as Record<PillarKey, { stem: string; branch: string } | null>),
    mukuStates,
    xchResolution: resolveXch({
      pillars: calc.pillars as Record<PillarKey, { stem: string; branch: string } | null>,
      interactions: raw,
    }).resolutions,
    shenshaTransit: buildShenShaTransit(
      calc.pillars as Record<PillarKey, { stem: string; branch: string } | null>,
      {
        luckBranch: currentLuck?.branch ?? null,
        luckLabel: currentLuck ? `${currentLuck.stem}${currentLuck.branch}` : undefined,
        luckAgeStart: currentLuck?.ageStart,
        yearBranch: cyp?.branch ?? null,
        yearLabel: cyp ? `${cyp.stem}${cyp.branch}` : undefined,
      },
    ),
    sixRelativesEvents: [],
    mukuTransitStates,
    luckInteractions,
    annualInteractions,
    interactionConflictSummary: buildInteractionConflictSummary(raw, luckInteractions, annualInteractions),
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
  // Layer 5 行運成敗 timing (derived · reuse packet.xiangShen/currentLuck/annualPillar · ปิด 3p)
  packet.chengBaiNow = buildChengBaiNow(
    packet.xiangShen ?? null, dm, currentLuck,
    cyp ? { stem: cyp.stem, branch: cyp.branch } : null,
    rootedness?.dmLabel, calc.mode === "3p",
  );
  packet.bingYao = buildBingYao(
    `${packet.structure.label} ${packet.structure.special?.typeZh || ""}`,
    dmElement,
    packet.rootedness ?? null,
    packet.usefulGods,
    packet.xiangShen ?? null,
    packet.chengBaiNow ?? null,
    packet.elementProfile,
    { pillars: calc.pillars as Record<PillarKey, { stem: string; branch: string } | null>, dmStem: dm, monthBranch: calc.pillars.month?.branch, climate: calc.climate },
  );
  packet.yongShenProtocols = buildYongShenProtocols(
    packet.structure.label,
    calc.geJu?.basis,
    calc.climate,
    dmElement,
    packet.rootedness ?? null,
    packet.usefulGods,
    packet.xiangShen ?? null,
    packet.bingYao ?? null,
    dm,
    calc.pillars.month?.branch,
  );
  /* Gap 4 post-processing: 六親 event-level (อาศัย sixRelatives + luckTimeline) */
  if (packet.sixRelatives && packet.luckTimeline?.length) {
    const BR_LIST = ["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"];
    const yt: { year: number; branch: string }[] = [];
    const now = Number(process.env.HK_CURRENT_YEAR) || 2026;
    for (let y = now; y <= now + 12; y++) {
      const offset = ((y - 4) % 12 + 12) % 12;
      yt.push({ year: y, branch: BR_LIST[offset] });
    }
    packet.sixRelativesEvents = buildSixRelativesEvents(
      calc.pillars as Record<PillarKey, { stem: string; branch: string } | null>,
      packet.sixRelatives.items.map((it) => ({ relativeZh: it.relativeZh, starsZh: it.starsZh, foundAt: it.foundAt })),
      yt,
      12,
    );
  }
  reconcileBy08pBridgeMedicine(packet);
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
export function renderChartPrompt(packet: ChartPacket, opts: { includeTransitDrilldown?: boolean; subjectLabel?: string } = {}): string {
  const includeTransitDrilldown = opts.includeTransitDrilldown !== false;
  const subjectPrefix = opts.subjectLabel ? `[${opts.subjectLabel}] ` : "";
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
  if (packet.meta.mode === "3p") {
    lines.push("⚠️ ดวง 3 เสา (ไม่ทราบเวลาเกิด · ไม่มีเสายาม時) — อ่านได้ครบ年月日 แต่ห้ามเดา/อนุมาน: เสายาม · สิบเทพยาม · 命宮/身宮/小運/起運 · ดวงคู่จากยาม");
    lines.push("⚠️ วัยจร大運 3 เสา: ลำดับธาตุ/ก้านกิ่งถูกต้อง แต่ \"อายุที่เข้าวัยจร + ปีครอบ\" เป็นค่าประมาณ (ไม่ทราบ起運จริงเพราะไม่มีเวลาเกิด) — อ่านจังหวะและน้ำหนักได้ แต่ให้บอกผู้ใช้ว่าอายุ/ปีเปลี่ยนวัยจรเป็นค่าประมาณ");
    lines.push("⚠️ ถ้าเกิดใกล้เที่ยงคืน (子時 ~23:00-01:00) เสาวัน/Day Master อาจคลาด ±1 วัน — engine ใช้ตามวันที่ที่ระบุ · เตือนผู้ใช้ได้ถ้าผลดูไม่ตรงตัว");
  }
  if (packet.meta.dayBoundary && packet.meta.timePillarConfidence) {
    const src = packet.meta.dayBoundarySource === "explicit" ? "ผู้ใช้/endpoint ส่งมาโดยตรง" : "default ระบบ (profile ยังไม่มี column day_boundary)";
    const CONF_TH: Record<string, string> = {
      known: "รู้เวลาและไม่ชนขอบวัน",
      unknown: "ไม่ทราบเวลา",
      boundary_sensitive: "ไวต่อขอบวัน/เที่ยงคืน",
    };
    const tc = packet.meta.timePillarConfidence;
    lines.push(`ขอบวัน/Day boundary ที่ใช้คำนวณ: ${packet.meta.dayBoundary} (${src}) · ความมั่นใจเสายาม=${CONF_TH[tc.level] || tc.level} — ${tc.reason}`);
  }

  /* ลำดับการอ่าน */
  if (packet.meta.readingOrder) lines.push(packet.meta.readingOrder);

  /* โครงดวง + ดวงพิเศษ */
  const falseFollowAudit = isFalseFollowAuditConflict(packet.strictGeJuAudit) ? packet.strictGeJuAudit : null;
  let structureLine = falseFollowAudit
    ? `โครงดวง: candidate หลัก=${falseFollowAudit.strictLabel} (strict月令 · มั่นใจ=สูง) · raw engine候選=${packet.structure.label} (candidate รอง · ยังไม่ถึงเกณฑ์從แท้ · ดู gate ใน 從格ตรวจทาน)`
    : `โครงดวง: ${packet.structure.label}`;
  if (packet.structure.special) {
    if (falseFollowAudit && isFalseFollowCandidateLabel(packet.structure.special.typeZh || packet.structure.label)) {
      structureLine += ` · ดวงพิเศษ候選 ${packet.structure.special.typeZh} (ไม่ใช่ข้อสรุปหลัก)`;
    } else {
      structureLine += ` · ดวงพิเศษ ${packet.structure.special.typeZh}` +
        (packet.structure.special.friendly.length ? ` · ธาตุเกื้อ ${packet.structure.special.friendly.map((e) => elementTh(e)).join("·")}` : "");
    }
  }
  if (packet.structure.confidence) structureLine += ` · ความมั่นใจโครง ${packet.structure.confidence}`;
  /* 月柱ก้ำกึ่ง → suffix inline บนบรรทัด格局 · ต้องเติม "ก่อน" 化氣 block ข้างล่าง (ที่เติม \n)
   * ไม่งั้น suffix จะหลุดไปติดบรรทัด 化氣 แทนบรรทัด格局 (Codex รอบ 54) · บทเรียน r142: เตือนต้องผูกกับ field */
  const _ma = packet.monthAmbiguity;
  const monthAmbSuffix = _ma ? ` ⚠️[เสาเดือนก้ำกึ่ง ${_ma.before}/${_ma.after} · มั่นใจ≤กลาง · อ่าน 2 ทาง]` : "";
  if (_ma) structureLine += monthAmbSuffix;
  /* 31 พ.ค. (AI sifu ภายนอกชี้) · 藏干เสาเดือน 2 ฝั่ง — กัน AI ฟันธง "ธาตุX=0" ข้างเดียว
   * เคส na: 壬辰(藏 戊乙癸) vs 癸巳(藏 丙戊庚) → 庚金โผล่ภายใต้癸巳 = ทองไม่เป็น 0 · "ลูกขาดทอง แม่เติม" พังถ้า癸巳
   * เลเยอร์ packet: ใช้ HIDDEN_STEMS_MAP+STEM_ELEMENT (ไม่ recompute tally engine · ไม่แตะ wrapper · กัน weight เพี้ยน) · AI ตีความเอง */
  if (_ma && _ma.before && _ma.after) {
    const brOf = (pillar: string) => [...pillar][1] || "";
    const hsDesc = (br: string) => (HIDDEN_STEMS_MAP[br] || []).map((s) => `${s}(${elementTh(STEM_ELEMENT[s])})`).join(" ");
    const elsOf = (br: string) => new Set((HIDDEN_STEMS_MAP[br] || []).map((s) => STEM_ELEMENT[s]));
    const bBr = brOf(_ma.before), aBr = brOf(_ma.after);
    const bEls = elsOf(bBr), aEls = elsOf(aBr);
    const added = [...aEls].filter((e) => !bEls.has(e)).map((e) => elementTh(e));
    const lost = [...bEls].filter((e) => !aEls.has(e)).map((e) => elementTh(e));
    const delta = (added.length || lost.length)
      ? `ธาตุที่เปลี่ยน: ฝั่ง${_ma.after}${added.length ? " เพิ่ม " + added.join("·") : ""}${lost.length ? " · หาย " + lost.join("·") : ""}`
      : "ก้านซ่อนให้ธาตุชุดเดียวกัน";
    structureLine += `\n⚠️ 藏干เสาเดือน 2 ฝั่ง (ธาตุรวม/ราก/透干/用神/病藥 ขึ้นกับฝั่งนี้ทั้งหมด · ห้ามฟันธงจำนวนธาตุ/ราก/用神 ข้างเดียว · ดู MONTH_DERIVED_FIELDS): ฝั่ง${_ma.before}=藏干 ${hsDesc(bBr)} · ฝั่ง${_ma.after}=藏干 ${hsDesc(aBr)} · ${delta} → ประเมิน 2 ทาง จนกว่าจะยืนยันเวลาเกิด`;
  }
  /* 🔒 化氣格 guard (27 พ.ค. · option A · 5-agent · ระดับ1+2) — engine (wrapper-3 findTransformation) declare 化X格
     จากแค่ 2/6 เงื่อนไข (五合คู่ + เดือนตรงฤดู) ไม่เช็คราก DM → over-declare 化 (用神พลิก180° อ่านผิดทั้งใบ)
     hotfix เลเยอร์ packet (rootedness จาก wrapper-7 · ไม่คำนวณใหม่ · ไม่แก้ค่าดิบ · ไม่แตะ wrapper LOCKED · /chart แยก):
       • ตัวตนมีราก (partial/rooted/strong) → มัก 合而不化 (ไม่แปร) → flag "เบื้องต้น ตรวจก่อน"
       • ตัวตนรากบางมาก 微根 (token_root) → 假化 (แปรปลอม·เปราะ·เด้งกลับปี印/比劫เสริมราก·沖去รากยิ่งเข้าทางแปร) → flag "แปรแบบไม่มั่นคง"
       • ไร้รากเลย (no_root) → 真化ได้จริง → ไม่ flag
     ยังเหลือ 競合/月令 (ต้องอ่านก้าน+เดือน) = เฟส B แก้ engine + รอ golden 14案例 (ดู header กฎ10ข้อ จ) */
  {
    const HUAQI_RE = /^化[木火土金水]格$/;
    const isHuaQi = HUAQI_RE.test(packet.structure.label) ||
      (!!packet.structure.special?.typeZh && HUAQI_RE.test(packet.structure.special.typeZh));
    const r = packet.rootedness;
    if (isHuaQi && r) {
      const elTh = elementTh(r.dmElement);
      if (r.dmLabel === "partial_root" || r.dmLabel === "rooted" || r.dmLabel === "strong_root") {
        const ROOT_HUA: Partial<Record<RootLabel, string>> = {
          partial_root: "รากบางส่วน", rooted: "มีราก", strong_root: "รากแข็ง",
        };
        structureLine += `\n⚠️ 化氣格 หลักฐาน 3 ทาง (真化/假化/合而不化): ตัวตน(日干 ธาตุ${elTh}) ${ROOT_HUA[r.dmLabel]}` +
          ` · flip ตามรากตัวตน+เดือนเกิด · candidate=合而不化 ถ้ารากยังเหลือ (合แต่ไม่แปร · ทั้งคู่ทำงานครึ่งเดียว)` +
          ` · confidence=กลาง · ตำราอ้าง 子平真詮論化 · 滴天髓·從化論`;
      } else if (r.dmLabel === "token_root") {
        structureLine += `\n⚠️ 化氣格 หลักฐาน假化 (แปรแบบไม่มั่นคง): ตัวตน(日干 ธาตุ${elTh}) รากบางมาก(微根)` +
          ` · pattern: แปรตามคู่ได้แต่ไม่เต็มใจ ยังมีรากเล็กค้างอยู่ · จังหวะปี/วัยจรที่ดาวหนุนตัวตน(印·比劫)มาเสริมราก → มัก "เด้งกลับเป็นตัวเดิม" (ชีวิตพลิก) · ส่วนปีที่沖去/克รากเดิม กลับยิ่งเข้าทางแปร` +
          ` · confidence=กลาง-ต่ำ · ตำราอ้าง 子平真詮·化氣 · 滴天髓·從化論`;
      }
      /* no_root → 真化ได้จริง · ไม่ flag */
    }
  }
  lines.push(structureLine);
  if (_ma) {
    lines.push(`⚠️ 月柱ก้ำกึ่ง(${_ma.termName}${_ma.jieqiIctApprox ? " ~" + _ma.jieqiIctApprox + " เวลาไทย" : ""}): เสาเดือนอยู่ระหว่าง "${_ma.before}"(เกิดก่อน節氣) / "${_ma.after}"(เกิดหลัง節氣) · engine ใช้ "${_ma.used}" เพราะไม่รู้เวลาเกิด`);
    lines.push(`→ ผลที่พึ่งเสาเดือน (${_ma.dependentFields.join(" / ")}) มั่นใจไม่เกิน "กลาง" · ต้องอ่าน 2 ทางหรือบอก "ขึ้นกับเวลาเกิด" ห้ามฟันธงข้างเดียว · ผลที่พึ่ง 日干/日支/十神/大運(ทิศ順逆) ฟันธงต่อได้ตามน้ำหนักดวง`);
  }
  /* HK_HUAQI_VERDICT_V1 (29 พ.ค. · wrapper-8 promote) — verdict block
   * 真化/假化/合而不化 จาก analyzeHuaQi (8/8 golden) · แสดงเฉพาะเมื่อมีคู่ 五合 ติด DM
   * additive · ไม่ override structure.label เดิม · ไม่กระทบ wrapper-7 */
  if (packet.huaQi && packet.huaQi.verdict) {
    const hq = packet.huaQi;
    const CONF_TH: Record<string, string> = { high: "สูง", medium: "กลาง", low: "ต่ำ" };
    const POS_TH: Record<string, string> = { year: "ปี", month: "เดือน", hour: "ยาม" };
    const huaTh = hq.transformElement ? elementTh(hq.transformElement) : "-";
    const partnerSrc = hq.partnerPosition ? POS_TH[hq.partnerPosition] : "-";
    const monthFlag = hq.monthSupport ? "หนุน" : "ไม่หนุน";
    const dmRootTh: Record<RootLabel, string> = {
      no_root: "ไร้ราก", token_root: "ราก微根(บางมาก)", partial_root: "รากบางส่วน",
      rooted: "มีราก", strong_root: "รากแข็ง",
    };
    const ruleIds = hq.sourceRuleIds.length ? hq.sourceRuleIds.join(", ") : "-";
    lines.push(
      `化氣格 verdict (wrapper-8): ${hq.verdict} → ธาตุที่แปร=${huaTh} · ก้านคู่=${hq.stems.partner}(${partnerSrc}) · ` +
      `เดือนเกิด=${monthFlag} · ราก日干=${dmRootTh[hq.dmRootLabel] || hq.dmRootLabel} · ` +
      `confidence=${CONF_TH[hq.confidence] || hq.confidence} · กฎอ้าง: ${ruleIds}`
    );
    lines.push(`化氣格 สรุป: ${hq.thaiSummary}`);
  }
  /* HK_STRICT_GEJU_AUDIT_V1 — audit-only แยกชื่อ格 strict จาก practical engine label */
  if (packet.strictGeJuAudit?.tag === "HK_STRICT_GEJU_AUDIT_V1") {
    const a = packet.strictGeJuAudit;
    const verdict = a.matchesCurrent ? "ตรงกับ engine label" : "ต่างจาก engine label";
    const stemTxt = a.selectedStem ? `${a.selectedStem}${a.tenGod ? `/${a.tenGod}` : ""}` : "-";
    const auditHead = falseFollowAudit
      ? `raw engine候選=${a.currentLabel} · strict月令(candidate หลัก)=${a.strictLabel || "-"}`
      : `engine=${a.currentLabel} · strict月令=${a.strictLabel || "-"}`;
    lines.push(
      `格局 strict audit (audit-only): ` +
      `${auditHead} · 選用=${stemTxt} · ` +
      `${verdict} · ${a.noteTh} · ตำราอ้าง ${a.canonicalChinese}`
    );
    if (falseFollowAudit) {
      lines.push(
        `從格ตรวจทาน (หลักฐานเทียบสองทาง · ไม่จำกัดลีลาซินแส): ` +
        `candidate หลัก=strict月令=${a.strictLabel || "-"} (มั่นใจ=สูง · 子平真詮 月令取用) · ` +
        `candidate รอง=raw engine=${a.currentLabel} (มั่นใจ=ต่ำ · 候選/ป้ายเตือน) · ` +
        `gate ของ從แท้: ตัวตนไร้ราก + ไม่มี印/比劫เข้ามาช่วย · ` +
        `flip reason: ถ้าธาตุช่วยรวมกลับไปทาง印/比劫 → 扶抑+病藥ตามปกติ · ` +
        `ตำราอ้าง: 任氏假從 "局中雖有劫印、亦自顧不暇"`
      );
    }
  }

  /* ธาตุช่วย (engine-derived · เป็นฐานให้ซินแสตัดสิน) */
  const fmtEls = (arr: string[]) => arr.length ? arr.map((e) => elementTh(e)).join(" · ") : "-";
  /* HK_YONGSHEN_CONFIDENCE_TAG_V1 — ดึง 格局 confidence มาติดบรรทัด用神 (เดิมอยู่ไกลที่ structureLine
   * → AI ไม่เชื่อมโยง → ตัดสิน用神ข้างเดียว/พลิกตาม user) · ไม่แก้ค่า usefulGods · additive render เท่านั้น
   * 用神ไม่มี confidence แยก → อิง 格局 confidence (用神ขึ้นกับ格局: โครงก้ำกึ่ง=用神ก้ำกึ่งตาม) */
  const _yongConf = packet.structure.confidence;
  const _yongConfNote = _yongConf
    ? ` · [ความมั่นใจชุดธาตุช่วยนี้ (อิงความมั่นใจโครง格局) = ${_yongConf}${_yongConf !== "high"
        ? " → ⚠️ก้ำกึ่ง: อ่านได้ 2 ทาง ต้องบอกลูกค้าว่าก้ำกึ่ง + อธิบายทั้งสองด้าน + ชี้ทางที่ engine ให้น้ำหนัก · ห้ามฟันธาตุช่วยข้างเดียวเด็ดขาด · ห้ามพลิกตามที่ลูกค้าแย้งถ้าลูกค้าไม่ชี้หลักฐานในผัง (ดูกฎ 4.2)"
        : " → มั่นใจชัด ฟันธาตุช่วยได้ตามนี้"}]`
    : "";
  lines.push(
    `ธาตุช่วยจากระบบ (engine-derived · ใช้เป็นฐานให้ซินแสตัดสิน): ` +
    `ธาตุช่วยหลัก=${fmtEls(packet.usefulGods.yong)} · ` +
    `ธาตุช่วยรอง=${fmtEls(packet.usefulGods.xi)} · ` +
    `ธาตุระวัง=${fmtEls(packet.usefulGods.ji)}` +
    _yongConfNote
  );
  /* 有條件之喜/相神橋藥 — ธาตุที่มีบทบาทสะพาน มีเงื่อนไข (ไม่ใช่忌เดี่ยว) */
  if (packet.usefulGods.conditionalUse?.length) {
    const items = packet.usefulGods.conditionalUse.map((c) =>
      `${elementTh(c.element)}(${c.role} · ดีเมื่อ ${c.goodWhen.join("/")} · ระวังเมื่อ ${c.badWhen.join("/")} · จาก ${c.source})`
    );
    lines.push(`ธาตุสะพาน/相神 มีเงื่อนไข (有條件之喜 · ไม่ใช่忌เดี่ยว · 滴天髓 隨其所向論喜忌): ${items.join(" · ")}`);
  }
  /* HK_ELEMENT_ROLES_PROMPT_V1 (10 มิ.ย.) · บทบาทธาตุในชีวิต (ภาษาเดียวกับหน้าเว็บ 06b)
   * ให้ AI แยก 財星/เปิดทางเงิน/งาน/調候/พยุงตัว ออกจาก 用神/忌神 — กันตอบเหมารวม "ธาตุ X เป็นพิษ" ทั้งที่มีบทบาทเฉพาะ */
  try {
    const _erDmEl = STEM_ELEMENT[packet.meta?.dayMaster || ""] || null;
    if (_erDmEl) {
      const _erRoles = buildElementRoles({
        dmElement: _erDmEl,
        structureLabel: packet.structure.label,
        engineType: packet.structure.special?.typeZh || null,
        primaryYongshen: packet.usefulGods.yong,
        xishen: packet.usefulGods.xi,
        jishen: packet.usefulGods.ji,
        tiaohouRequired: packet.yongShenProtocols?.tiaoHou?.regulator || null,
        strengthLevel: null,
      });
      if (_erRoles.length) {
        const _erIcon: Record<string, string> = { main: "✅", conditional: "⚠️มีเงื่อนไข", caution: "⛔ระวังถ้ามาก" };
        lines.push(
          `บทบาทธาตุในชีวิต (ใช้ภาษานี้กับลูกค้า · ธาตุหนึ่งมีหลายหน้าที่ ไม่ใช่แค่ดี/ร้าย): ` +
          _erRoles.map((r: ElementRole) => `${r.label.th}=${r.elements.map((e: string) => elementTh(e)).join("+")}(${_erIcon[r.status] || r.status} · ${r.verdict.th})`).join(" · ")
        );
      }
    }
  } catch { /* additive */ }
  /* HK_DUAL_SCHOOL_V1 (10 มิ.ย.) · ดวง從/假從 = ก้ำกึ่ง 2 สำนัก (滴天髓順勢 vs 子平真詮扶抑·透印不從)
   * ตำราเองไม่ฟันธง (假從=ตามแบบไม่สนิท) → สั่งซินแสอ่าน 2 มุม + ใช้เหตุการณ์จริงใน大運เป็นตัวเฉลยสำนัก
   * (วิธีเดียวกับที่เฉลยดวง Aeaw: 大運庚辰=รุ่งจริง → ยืนยันสาย順勢) · additive render · ไม่แก้ usefulGods */
  const _dsLabel = `${packet.structure.label || ""} ${packet.structure.special?.typeZh || ""}`;
  const _dsDmEl = (STEM_ELEMENT[packet.meta?.dayMaster || ""] || null) as ElementEN | null;
  if (/從/.test(_dsLabel) && _dsDmEl) {
    const _dsYinEl = producerElementOf(_dsDmEl);
    const _dsSchoolB = [_dsYinEl, _dsDmEl].filter(Boolean) as ElementEN[];   /* 扶抑: 印+比劫 */
    /* 順勢: engine yong+xi + 食傷(DM生·生財ตาม勢 — 從格喜食傷財 ตำราชัด · เช่น Aeaw 庚=食傷 大運庚辰รุ่งจริง) */
    const _dsOutEl = (["wood", "fire", "earth", "metal", "water"] as ElementEN[]).find((e) => producerElementOf(e) === _dsDmEl) || null;
    const _dsSchoolA = Array.from(new Set([...packet.usefulGods.yong, ...packet.usefulGods.xi, ...(_dsOutEl ? [_dsOutEl] : [])]))
      .filter((e) => !_dsSchoolB.includes(e as ElementEN)) as ElementEN[];
    /* คำถามเฉลยชีวิต: วัยจรอดีต/ปัจจุบันที่ 2 สำนักให้ขั้วตรงข้ามชัด (ธาตุอยู่ฝั่งดีสำนักเดียว) · เอาอันล่าสุดที่ user ตอบได้
     * robust: age อาจ NaN (caller บางทางไม่ส่ง start age) → fallback ทั้ง timeline + ละอายุในข้อความ */
    const _dsTl = packet.luckTimeline || [];
    const _dsCurStart = _dsTl.find((x) => x.isCurrent)?.ageStart ?? Infinity;
    const _dsSplits = (l: { element: ElementEN }) =>
      (_dsSchoolA.includes(l.element) && !_dsSchoolB.includes(l.element)) ||
      (_dsSchoolB.includes(l.element) && !_dsSchoolA.includes(l.element));
    const _dsPast = _dsTl.filter((l) => l.isCurrent || (Number.isFinite(l.ageEnd) && l.ageEnd <= _dsCurStart));
    const _dsTest = [...(_dsPast.length ? _dsPast : _dsTl)].reverse().find(_dsSplits);
    const _dsAgeTxt = _dsTest && Number.isFinite(_dsTest.ageStart) && Number.isFinite(_dsTest.ageEnd)
      ? `ช่วงอายุ ${_dsTest.ageStart}-${_dsTest.ageEnd} ` : "";
    const _dsTestTxt = _dsTest
      ? ` · คำถามเฉลยชีวิต (ใช้ถามลูกค้าเพื่อยืนยันสำนัก · เลือกช่วงที่ผ่านมาแล้วเท่านั้น): "${_dsAgeTxt}(วัยจร ${_dsTest.stem}${_dsTest.branch} ธาตุ${elementTh(_dsTest.element)}) ชีวิตคุณรุ่งหรือฝืด?" → ${_dsSchoolA.includes(_dsTest.element) ? "รุ่ง=สาย①順勢(ยืนยันชุด engine) · ฝืด=สาย②扶抑" : "รุ่ง=สาย②扶抑 · ฝืด=สาย①順勢(ยืนยันชุด engine)"}`
      : "";
    lines.push(
      `⚖️ ดวงก้ำกึ่ง 2 สำนัก (${packet.structure.label} · 假從=ตำราเองไม่ฟันธง 100%): ` +
      `สำนัก①順勢ตามกระแส(滴天髓 · engine ให้น้ำหนักทางนี้): ธาตุดี=${fmtEls(_dsSchoolA)} / ระวัง=${fmtEls(_dsSchoolB)} (從格忌印比·ฝืนพยุง=สวนกระแส) · ` +
      `สำนัก②扶抑พยุงตัว(子平真詮 透印不從): ธาตุดี=${fmtEls(_dsSchoolB)} / ระวัง=${fmtEls(_dsSchoolA.filter((e) => !_dsSchoolB.includes(e)))} · ` +
      `กฎซินแสสำหรับดวงนี้: (ก)เมื่อพูดเรื่องธาตุช่วย/แนวทางชีวิต ให้บอกลูกค้าตรงๆ ว่าดวงนี้ตำราอ่านได้ 2 ทาง พร้อมสรุปทั้งสองมุมสั้นๆ ` +
      `(ข)ชวนลูกค้าเทียบเหตุการณ์จริงด้วยคำถามเฉลยชีวิต ` +
      `(ค)ถ้าลูกค้ายืนยันเหตุการณ์ชัดแล้ว → อ่านตามสำนักที่ชีวิตจริงยืนยัน และระบุว่า "ยืนยันจากชีวิตจริงของคุณแล้ว" ` +
      `(ง)ยังไม่มีคำตอบ → ใช้สำนัก①(engine)เป็นหลัก พ่วงหมายเหตุสำนัก② · ห้ามฟันธงสำนักเดียวโดยไม่บอกอีกมุม (ยกเว้นมีบรรทัด "สำนักยืนยันแล้วจากชีวิตจริง" — ให้อ่านตามสำนักนั้นได้เลย)${_dsTestTxt}`
    );
  }
  /* HK_YONGSHEN_PROTOCOL_SPLIT_V1 — แยกชื่อ用神ตามตำรา ไม่เปลี่ยน logic เดิม */
  if (packet.yongShenProtocols?.tag === "HK_YONGSHEN_PROTOCOL_SPLIT_V1") {
    const yp = packet.yongShenProtocols;
    const fmtStems = (stems: string[]) => stems.length
      ? stems.map((s) => `${s}/${elementTh(STEM_ELEMENT[s] || "unknown")}`).join("/")
      : "-";
    const tiao = yp.tiaoHou.regulator
      ? `${fmtEls([yp.tiaoHou.regulator])}${yp.tiaoHou.bridge ? ` · สะพาน=${fmtEls([yp.tiaoHou.bridge])}` : ""} (${yp.tiaoHou.climate || "-"})`
      : "-";
    const strictTiao = yp.tiaoHou.strict
      ? `strict ${yp.tiaoHou.strict.dmStem}日${yp.tiaoHou.strict.monthBranch}月 主=${fmtStems(yp.tiaoHou.strict.primaryStems)} 次=${fmtStems(yp.tiaoHou.strict.secondaryStems)} 再=${fmtStems(yp.tiaoHou.strict.tertiaryStems)} · ${yp.tiaoHou.strict.rationaleZh}`
      : "-";
    const fuyi = `${yp.fuyi.mode}${yp.fuyi.candidateElements.length ? `=${fmtEls(yp.fuyi.candidateElements)}` : ""}`;
    const by = yp.bingYao.primaryId
      ? `${yp.bingYao.primaryId} · 藥=${fmtEls(yp.bingYao.medicineElements)}`
      : (yp.bingYao.status || "-");
    const xs = yp.xiangShen.geZh
      ? `${yp.xiangShen.geZh}/${yp.xiangShen.verdict || "-"}${yp.xiangShen.subLabel ? `/${yp.xiangShen.subLabel}` : ""}`
      : "-";
    const geJuForPrompt = falseFollowAudit
      ? `${falseFollowAudit.strictLabel} (strict月令; raw候選=${yp.structure.geJuLabel})`
      : yp.structure.geJuLabel;
    lines.push(
      `用神分層 (หลักฐาน 5 ชั้นตามตำรา · ไม่จำกัดสไตล์คำตอบ): ` +
      `格局/月令用神=${geJuForPrompt} · ` +
      `調候用神=${strictTiao} · climate補助=${tiao} · 扶抑用神=${fuyi} · 病藥=${by} · 相神=${xs} · ` +
      `engineรวมภาพรวม=${fmtEls(yp.finalCombined.yong)} / 喜=${fmtEls(yp.finalCombined.xi)} / 忌=${fmtEls(yp.finalCombined.ji)} · ` +
      `${yp.finalCombined.noteTh} · ตำราอ้าง ${yp.structure.canonicalChinese}`
    );
    /* HK_YONGSHEN_RECONCILE_V1 — ชั้น扶抑(泄/抑)กับ engineรวม(忌) อาจจัดธาตุเดียวกันคนละมุม
     * (เช่น น้ำ = ทางระบายในชั้น扶抑 แต่ = 忌ใน engineรวม) → AI สับสน · ชี้ว่าใช้ engineรวมเป็นข้อสรุป
     * additive render · ไม่แก้ค่า usefulGods/protocols */
    const _fuyiEls = new Set(yp.fuyi.candidateElements || []);
    const _conflictEls = (yp.finalCombined.ji || []).filter((e) => _fuyiEls.has(e));
    if (_conflictEls.length) {
      lines.push(
        `⚠️ ปรับให้ตรงกัน (扶抑 vs engineรวม): ธาตุ ${fmtEls(_conflictEls)} — ชั้น扶抑มองเป็นทางระบาย/ควบ (泄/抑) แต่ engineรวมจัดเป็น "ระวัง(忌)" · ` +
        `ให้ยึด "engineรวม (用神/喜/忌)" เป็นข้อสรุปสุดท้าย ชั้น扶抑เป็นเหตุผลประกอบ (隨勢 — ธาตุนี้ดีเฉพาะเมื่อมีตัวกลางส่งต่อ ไม่ใช่เติมตรงๆ) · ห้ามรายงานธาตุนี้เป็น "ตัวช่วย" ลอยๆ`
      );
    }
  }

  /* ธาตุรวม (level key เท่านั้น · ไม่มี %) */
  const c = packet.elementProfile.counts;
  lines.push(`ธาตุรวม: ไม้ ${c.wood} · ไฟ ${c.fire} · ดิน ${c.earth} · ทอง ${c.metal} · น้ำ ${c.water} · กำลังตัวตนระดับ ${packet.elementProfile.voytekLevel} (ห้ามพูดตัวเลขเปอร์เซ็นต์)`);

  /* ช่องว่างของดวง */
  lines.push(`ช่องว่างของดวง: 日旬空(ฐานวัน)=${packet.kongWang.dayVoids.map((b) => BRANCH_TH_NAME[b] || b).join("/") || "-"} · 年旬空(ฐานปี)=${packet.kongWang.yearVoids.map((b) => BRANCH_TH_NAME[b] || b).join("/") || "-"} · 空亡เป็นข้อมูลรอง ต้องอ่านคู่กับ用神/冲合/填實`);

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
      lines.push(`空亡ตกที่เสา (ข้อมูลรองเรื่องสิ่งที่ "ว่าง/ไม่เต็ม" · แยกฐานวัน/ฐานปีชัด · ใช้ประกอบ填實/沖合 ไม่ใช้เป็นแกนเดี่ยว): ${hits.join(" · ")}`);
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
    lines.push(`胎元 เรือนปฏิสนธิ (ทุนแต่เกิด·รากฐานก่อนลืมตา): ${STEM_TH[t.stem] || t.stem}/${t.tenGod} ${BRANCH_TH_NAME[t.branch] || t.branch} (${t.stem}${t.branch}) · ใช้ดูธาตุเสริมที่ติดตัวมาก่อนเกิด (มักเติมธาตุที่ 4 เสาขาด)`);
  }
  /* 命宮 เรือนชีวิต (27 พ.ค. · 卯安命 節氣法 · บุคลิก/ทิศทางชีวิต · ต้องมีเวลาเกิด) */
  if (packet.fivePalaces?.mingGong) {
    const m = packet.fivePalaces.mingGong;
    lines.push(`命宮 เรือนชีวิต (บุคลิกแกน·ทิศทางชีวิต): ${STEM_TH[m.stem] || m.stem}/${m.tenGod} ${BRANCH_TH_NAME[m.branch] || m.branch} (${m.stem}${m.branch}) · อ่านแนวทางชีวิต/นิสัยพื้นฐาน`);
  }
  /* 身宮 เรือนกาย (對宮ของ命宮 · ครึ่งหลังชีวิต/สิ่งที่ทุ่มจริง) */
  if (packet.fivePalaces?.shenGong) {
    const s = packet.fivePalaces.shenGong;
    lines.push(`身宮 เรือนกาย (ครึ่งหลังชีวิต·สิ่งที่ลงมือทำจริง): ${STEM_TH[s.stem] || s.stem}/${s.tenGod} ${BRANCH_TH_NAME[s.branch] || s.branch} (${s.stem}${s.branch}) · คู่ตรงข้าม命宮`);
  }
  /* 司令 ธาตุบัญชาฤดู (27 พ.ค. · 子平真詮 · ธาตุแท้ที่คุมเดือน ณ วันเกิด · ละเอียดกว่าดูแค่เดือน) */
  if (packet.fivePalaces?.siLing) {
    const sl = packet.fivePalaces.siLing;
    lines.push(`司令 ธาตุบัญชาฤดู (ธาตุแท้ที่คุมเดือนเกิด·ระยะ${sl.phase}): ${STEM_TH[sl.stem] || sl.stem}/${sl.tenGod} ธาตุ${elementTh(sl.element)} · ดูธาตุที่แรงจริงตามจังหวะฤดู (ระยะ本氣=เต็มแรง 中氣/餘氣=รองลงมา)${monthAmbSuffix}`);
  }
  /* 小運 วัยจรเล็ก (Option B 時柱=ขวบ1 · โชควัยเด็กก่อนเข้า大運) */
  if (packet.fivePalaces?.xiaoYun) {
    const x = packet.fivePalaces.xiaoYun;
    lines.push(`小運 วัยจรเล็ก (โชควัยเด็กก่อนเข้าวัยจรใหญ่): ขวบ1=${STEM_TH[x.age1Stem] || x.age1Stem} ${BRANCH_TH_NAME[x.age1Branch] || x.age1Branch} (${x.age1Stem}${x.age1Branch}) เดิน${x.direction === "forward" ? "หน้า順" : "ถอย逆"} · ใช้อ่านช่วงเด็กก่อน大運เริ่ม`);
  }
  /* 六親 ญาติ (27 พ.ค. · derived 十神+宮位+ราก · แปรเพศ · AI ใช้คัมภีร์六親 bazi-shishen-classical ประกอบ) */
  if (packet.sixRelatives) {
    const sr = packet.sixRelatives;
    const USEFUL_TH: Record<string, string> = { yong: "ธาตุช่วยหลัก(用)", xi: "ธาตุช่วยรอง(喜)", ji: "ธาตุระวัง(忌)", neutral: "กลาง" };
    const ROOT_REL: Record<string, string> = { no_root: "ไร้ราก", token_root: "รากบางมาก", partial_root: "รากบางส่วน", rooted: "มีราก", strong_root: "รากแข็ง" };
    const relLines = sr.items.map((r) => {
      const starsTh = r.starsZh.map((s) => TEN_GOD_TH[s] || s).join("/");
      const where = r.foundAt.length ? r.foundAt.join("·") : "ไม่ปรากฏในก้าน/ซ่อนของผังเกิด (ไม่ได้แปลว่าไม่มีญาติ · ห้ามเดา)";
      const rootTxt = r.rootLabel ? (ROOT_REL[r.rootLabel] || r.rootLabel) : "-";
      const flags = [r.palaceClashed ? "เรือนถูกกระทบ(沖/刑/害/破)" : "", r.palaceVoid ? "เรือนตกว่าง(空亡)" : ""].filter(Boolean).join(" · ");
      return `${r.relativeZh} ${r.relativeTh}: ดาวแทน=${starsTh} (ธาตุ${elementTh(r.element)}·${USEFUL_TH[r.isUseful]}) · เรือน=${r.palaceZh} · พบดาวที่=${where} · รากดาว=${rootTxt}${flags ? ` · ${flags}` : ""}`;
    });
    lines.push(`六親 ญาติ (อ่านตาม "เพศ${sr.gender === "M" ? "ชาย" : "หญิง"}" ที่บันทึกในระบบ · ⚠️ ถ้าเพศไม่ตรงจริง ดาวคู่ครอง/ลูกจะสลับ ให้ทักผู้ใช้ยืนยันเพศก่อนอ่านลึก · ดาวแทนญาติจากสิบเทพ+เรือน · อ่านสภาพ/ความสัมพันธ์ญาติตามคัมภีร์六親 · ดาวแรง/ถูกกระทบ/ตกว่าง = จุดเด่น-จุดต้องระวังตามน้ำหนักดวง · อ่านให้ชัดตามหลักฐานในดวง พูดผลตรงๆ ได้ · ข้อจำกัดเดียว: อย่าทำนายว่าญาติเป็น/ตาย):\n  ${relLines.join("\n  ")}`);
  }
  /* 相神/成格破格 (27 พ.ค. · 子平真詮 §8.2 · derived 格局+十神 · ตัดสินโครงดวงสำเร็จ/พัง) */
  if (packet.xiangShen) {
    const xs = packet.xiangShen;
    const VTH: Record<string, string> = { 成格: "โครงดวงสำเร็จ (成格)", 破格: "โครงดวงเสีย (破格)", 救應: "เสียแล้วมีตัวกู้ (救應·敗中有成)", 合格普通: "เข้าโครงแต่ไม่เด่น (普通)" };
    lines.push(`相神/成格破格 (โครงดวง${xs.geZh} · ${VTH[xs.verdict] || xs.verdict}): ${xs.reason} · อ่านลึกตามคัมภีร์相神/成格破格救應 (子平真詮) ประกอบ · ใช้เป็นแกนตัดสินว่าโครงดวงทำงานดี/ติดขัดตรงไหน และแปลเป็นชีวิตจริงได้เมื่อมีวัยจร/ปีจรมารองรับ`);
  }
  /* 行運成敗 Layer 5 (28 พ.ค. · derived จาก相神×วัยจรปัจจุบัน · ตัวบทจริง子平真詮論行運+滴天髓歲運 · ปิด 3p) */
  if (packet.chengBaiNow && packet.chengBaiNow.verdict !== "UNMAPPED") {
    const c = packet.chengBaiNow;
    const VTH2: Record<string, string> = { "成": "วัยจรช่วงนี้หนุนโครงดวง (成)", "破(เบา)": "วัยจรช่วงนี้ขัดโครงดวง·แต่日主旺พอทน (破·เบา)", "破(หนัก)": "วัยจรช่วงนี้ขัดโครงดวง·日主อ่อนรับเต็ม (破·หนัก)", "平": "วัยจรช่วงนี้เป็นกลางต่อโครงดวง (平)" };
    lines.push(`行運成敗 (จังหวะวัยจรกับโครงดวง${c.geZh}·相神${c.subLabel}): ${VTH2[c.verdict] || c.verdict} — ${c.reason}${c.annual ? ` · ${c.annual}` : ""} · ตำราอ้าง [${c.ruleId}] · หลักฐานน้ำหนักช่วงวัยจร`);
  }
  /* 病藥 v1 (28 พ.ค. · 子平真詮/滴天髓 · จุดเสียเชิงโครงสร้าง + ตัวยาแก้ · ไม่ใช่โรคสุขภาพ) */
  if (packet.bingYao) {
    const by = packet.bingYao;
    if (by.status === "not_applicable") {
      lines.push("病藥 (จุดเสีย/ตัวยา): ไม่ใช้สูตร扶抑病藥ตรงๆ เพราะดวงนี้เข้าโครงพิเศษ/從化/專旺 · ให้อ่านตาม勢ของโครงพิเศษก่อน");
    } else if (by.primary) {
      const p = by.primary;
      const dis = p.diseaseElements.length ? fmtEls(p.diseaseElements) : "-";
      const med = p.medicineElements.length ? fmtEls(p.medicineElements) : "-";
      const dg = p.diseaseGods.length ? p.diseaseGods.map((g) => TEN_GOD_TH[g] || g).join("/") : "-";
      const mg = p.medicineGods.length ? p.medicineGods.map((g) => TEN_GOD_TH[g] || g).join("/") : "-";
      const bridgeTxt = p.bridgeMedicine?.length ? ` · 橋藥/相神(สะพาน·มีเงื่อนไข)=${p.bridgeMedicine.map((e) => elementTh(e)).join("/")}` : "";
      lines.push(`病藥 (จุดเสีย/ตัวยา · ${p.id}): 病=${p.diseaseType} · ธาตุ/ดาวที่เป็น病=${dis}/${dg} · 主藥=ใช้${med}/${mg}เป็นตัวยาหลัก${bridgeTxt} · เหตุผล=${p.reason} · อ้างอิง=${p.sourceIds.join(",")} · guard=${p.guard} · ⚠️ นี่คือจุดเสียเชิงโครงดวง ไม่ใช่โรคสุขภาพตรงๆ`);
    } else {
      lines.push("病藥 (จุดเสีย/ตัวยา): ยังต้องให้ซินแสอ่านประกอบจาก用神/相神/รากธาตุ · engine v1 ไม่พบ病หลักที่ชัดพอจะฟันธง");
    }
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

  /* 透干 (ก้านซ่อนในกิ่ง โผล่ขึ้นเป็นก้านบนฟ้า · ธาตุมีพลังเปิดเผยแสดงผลชัด · ดี/ร้ายขึ้นกับ用神หรือ忌神 · derived จาก packet ไม่คำนวณเสาใหม่) */
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
    `${subjectPrefix}วัยจรปัจจุบัน: ${packet.currentLuck
      ? `${STEM_TH[packet.currentLuck.stem] || packet.currentLuck.stem}/${BRANCH_TH_NAME[packet.currentLuck.branch] || packet.currentLuck.branch} อายุ ${packet.currentLuck.ageStart}-${packet.currentLuck.ageEnd} · ธาตุ${elementTh(packet.currentLuck.element)}`
      : "-"}`
  );
  /* วัยจรทั้งชีวิต + ปีครอบ · ให้ AI อ่านปีไหนใช้วัยจรของปีนั้น (กันเดาปฏิกิริยาข้ามวัยจร) */
  if (packet.luckTimeline.length) {
    const curIdx = packet.luckTimeline.findIndex((t) => t.isCurrent);
    const cur = curIdx >= 0 ? packet.luckTimeline[curIdx] : null;
    const prev = curIdx > 0 ? packet.luckTimeline[curIdx - 1] : null;
    if (cur) {
      lines.push(
        `${subjectPrefix}ล็อกช่วงวัยจร (กันสับสน): ` +
        `大運ปัจจุบัน=${cur.stem}${cur.branch} อายุ${cur.ageStart}-${cur.ageEnd} ปี${cur.yearStart}-${cur.yearEnd}` +
        `${prev ? ` · 大運ก่อนหน้า=${prev.stem}${prev.branch} อายุ${prev.ageStart}-${prev.ageEnd} ปี${prev.yearStart}-${prev.yearEnd}` : ""}`
      );
      const regulator = packet.yongShenProtocols?.tiaoHou.regulator || null;
      const bridge = packet.yongShenProtocols?.tiaoHou.bridge || null;
      const curStemEl = STEM_ELEMENT[cur.stem] || null;
      const curBranchEl = BRANCH_ELEMENT[cur.branch] || null;
      const prevStemEl = prev ? (STEM_ELEMENT[prev.stem] || null) : null;
      const prevBranchEl = prev ? (BRANCH_ELEMENT[prev.branch] || null) : null;
      const curHasRegulator = !!regulator && (curStemEl === regulator || curBranchEl === regulator);
      const prevHasRegulator = !!regulator && !!prev && (prevStemEl === regulator || prevBranchEl === regulator);
      /* symmetric — 調候用神 พลิกได้ 2 ทาง: เข้ามา(ฤดูเปิด) / หายไป(ฤดูปิด) · 窮通寶鑑·調候 ฤดูพลิกทั้งขาขึ้น-ขาลง */
      if (regulator && prev && curHasRegulator !== prevHasRegulator) {
        const regTxt = `${elementTh(regulator)}${bridge ? `+${elementTh(bridge)}` : ""}`;
        const flipTh = curHasRegulator
          ? `調候用神 ${regTxt} เข้าวัยจรปัจจุบัน (ก่อนหน้าไม่มี) → ฤดูดวงเปิด/คลาย`
          : `調候用神 ${regTxt} หายจากวัยจรปัจจุบัน (ก่อนหน้าเคยมี) → ฤดูดวงปิด/กลับเข้มข้น ระวัง`;
        lines.push(
          `${subjectPrefix}大運氣候轉折 candidate: อายุ ${cur.ageStart} (ปี ${cur.yearStart}) · ` +
          `gate=${curHasRegulator ? "มี" : "ไม่มี"}調候用神ในวัยจรปัจจุบัน · ` +
          `flip reason=${flipTh} · confidence=สูง · ตำราอ้าง 窮通寶鑑·調候`
        );
      }
    }
    lines.push(
      `${subjectPrefix}วัยจรทั้งชีวิต (อ่านปีไหนใช้วัยจรของปีนั้น · อย่าดึงวัยจรผิดช่วงมาปน): ` +
      packet.luckTimeline
        .map((t) => `${STEM_TH[t.stem] || t.stem}/${BRANCH_TH_NAME[t.branch] || t.branch}(อายุ${t.ageStart}-${t.ageEnd}·ปี${t.yearStart}-${t.yearEnd}·ธาตุ${elementTh(t.element)})${t.isCurrent ? "◀ปัจจุบัน" : ""}`)
        .join(" · ")
    );
  }
  /* ปีจร/เดือนจรในวัยจรปัจจุบัน (engine precomputed)
   * ให้ AI ใช้ block นี้ตอบคำถามย้อนหลัง/รายเดือนในรอบ 10 ปีปัจจุบัน โดยไม่ต้องคำนวณเสาเอง */
  if (includeTransitDrilldown && packet.transitDrilldown?.currentDecade) {
    const d = packet.transitDrilldown.currentDecade;
    const flagTh: Record<string, string> = { auspicious: "ผสาน", cautious: "ต้องคุม", neutral: "กลาง" };
    const roleTh: Record<string, string> = { yong: "用", xi: "喜", ji: "忌", neutral: "กลาง" };
    const strengthTh: Record<string, string> = { critical: "แรงมาก", high: "แรง", medium: "กลาง", low: "เบา" };
    const tgTh = (g: string | null) => g ? (TEN_GOD_TH[g] || g) : "-";
    const tags = (xs: string[]) => xs.length ? xs.join("+") : "-";
    const hiddenTxt = (hs: Array<{ stem: string; element: ElementEN | "unknown"; tenGod: string | null; usefulRole: string }>) =>
      hs.length ? hs.map((h) => `${h.stem}${tgTh(h.tenGod)}=${roleTh[h.usefulRole] || h.usefulRole}`).join(",") : "-";
    const impactTxt = (xs: Array<{ summaryTh: string; strength: "low" | "medium" | "high" | "critical" }>) =>
      xs.length ? xs.slice(0, 3).map((x) => `${x.summaryTh}[${strengthTh[x.strength] || x.strength}]`).join(" | ") : "-";
    const monthTxt = (m: NonNullable<NonNullable<ChartPacket["transitDrilldown"]>["currentDecade"]>["years"][number]["months"][number]) =>
      `流月${String(m.month).padStart(2, "0")}:${m.pillar.stem}${m.pillar.branch}/${tgTh(m.tenGod)}/${flagTh[m.flag] || m.flag}` +
      `${m.jieqiStart ? `/เริ่ม${m.jieqiStart.name}:${m.jieqiStart.date}` : "/fallbackกลางเดือน"}` +
      `${m.jieqiEnd ? `/จบ${m.jieqiEnd.date}` : ""}` +
      `/ฟ้า${elementTh(m.stemElement)}=${roleTh[m.stemUsefulRole]}` +
      `/ดิน${elementTh(m.branchElement)}=${roleTh[m.branchUsefulRole]}` +
      `/藏:${hiddenTxt(m.hiddenStems)}` +
      `${m.vsDayBranch.length ? `/日:${tags(m.vsDayBranch)}` : ""}` +
      `${m.vsLuckBranch.length ? `/運:${tags(m.vsLuckBranch)}` : ""}` +
      `/กระทบ:${impactTxt(m.impacts)}`;
    const years = d.years.map((y) =>
      `${subjectPrefix}流年${y.year}(อายุ${y.age}) ${y.pillar.stem}${y.pillar.branch}/${tgTh(y.tenGod)}/${flagTh[y.flag] || y.flag}` +
      `${y.baziYearStart ? `/เริ่ม${y.baziYearStart.name}:${y.baziYearStart.date}` : ""}` +
      `${y.baziYearEnd ? `/จบ${y.baziYearEnd.date}` : ""}` +
      `/ฟ้า${elementTh(y.stemElement)}=${roleTh[y.stemUsefulRole]}` +
      `/ดิน${elementTh(y.branchElement)}=${roleTh[y.branchUsefulRole]}` +
      `/藏:${hiddenTxt(y.hiddenStems)}` +
      `${y.vsDayBranch.length ? `/เทียบกิ่งวัน:${tags(y.vsDayBranch)}` : ""}` +
      `${y.vsLuckBranch.length ? `/เทียบกิ่งวัยจร:${tags(y.vsLuckBranch)}` : ""}` +
      `/กระทบหลัก:${impactTxt(y.impacts)}` +
      `; เดือนจร=${y.months.map(monthTxt).join(" | ")}`
    );
    lines.push(
      `${subjectPrefix}ปีจร/เดือนจรในวัยจรปัจจุบัน (engine precomputed · เสาปี/เดือนคำนวณมาแล้ว ไม่ต้องคำนวณเสาเอง · ใช้เป็นหลักฐานให้ซินแสอ่านย้อนหลัง/ล่วงหน้าได้เต็มที่): ` +
      `大運 ${d.luckPillar.stem}${d.luckPillar.branch} อายุ ${d.ageStartDetail || d.ageStart}-${d.ageEndDetail || d.ageEnd}` +
      `${d.startDate && d.endDate ? ` · วันที่จริง ${d.startDate} ถึงก่อน ${d.endDate}` : ""}` +
      `${d.directionTh ? ` · เดิน運 ${d.directionTh}` : ""} · ปีที่คร่อมจริง ${d.yearStart}-${d.yearEnd} · ` +
      `เดือนจรใช้節氣หลักจริง (立春/惊蛰/清明...) จาก engine; รายการ fallbackกลางเดือนใช้เมื่อไม่มีจุด節氣ละเอียด · ถ้าถามวันใกล้เวลาเปลี่ยน節氣ให้บอกว่าจังหวะอยู่แถวรอยต่อ\n` +
      years.join("\n")
    );
  }
  /* 交運 วันสลับวัยจร大運 (27 พ.ค. · derived จาก luckTimeline · ปีรอยต่อ + เตือน交脫ไม่นิ่ง · กัน 3p เพราะไม่มี起運จริง) */
  if (packet.meta.mode !== "3p" && packet.luckTimeline.length >= 2) {
    const tl = packet.luckTimeline;
    const transitions = tl.slice(1).map((t) =>
      `อายุ${t.ageStart}(ปี${t.yearStart}) เข้า${STEM_TH[t.stem] || t.stem}/${BRANCH_TH_NAME[t.branch] || t.branch}`);
    const curIdx = tl.findIndex((t) => t.isCurrent);
    let nextTxt = "";
    if (curIdx >= 0 && curIdx + 1 < tl.length) {
      const nx = tl[curIdx + 1];
      nextTxt = ` · ⏭ รอยต่อถัดไป: อายุ ${nx.ageStart} (ปี ${nx.yearStart}) สลับเข้า ${STEM_TH[nx.stem] || nx.stem}/${BRANCH_TH_NAME[nx.branch] || nx.branch} ธาตุ${elementTh(nx.element)} — ช่วง交脫 (รอยต่อ ~ปี ${nx.yearStart - 1}-${nx.yearStart + 1}) ดวงผันผวน/ปรับตัว ก่อนวัยจรใหม่ลงหลัก`;
    }
    lines.push(`交運 จังหวะสลับวัยจร大運 (ปีที่เปลี่ยนวัยจร · ช่วงรอยต่อ交脫 ดวงไม่นิ่ง ต้องปรับตัว · ใช้จับจังหวะเปลี่ยนเกม): ${transitions.join(" · ")}${nextTxt}`);
  }
  lines.push(`ปีจรปัจจุบัน: ${STEM_TH[packet.annualPillar.stem] || packet.annualPillar.stem}/${BRANCH_TH_NAME[packet.annualPillar.branch] || packet.annualPillar.branch}`);

  /* ปฏิกิริยาในดวง */
  lines.push(renderInteractionGroup("ปฏิกิริยาในดวง", packet.interactions.raw, packet.interactions.status));
  if (packet.hehuaVerdicts?.length) {
    const items = packet.hehuaVerdicts.map((v) => {
      const pairTxt = v.stems.map((s) => `${PILLAR_EN_TH[s.pillar] || s.pillar}:${s.stem}`).join("↔");
      const confidenceTh = v.confidence === "high" ? "น้ำหนักสูง" : v.confidence === "medium" ? "น้ำหนักกลาง" : "น้ำหนักเบา";
      const rules = v.sourceRuleIds.length ? ` · rule ${v.sourceRuleIds.join("/")}` : "";
      return `${v.pair}(${pairTxt}) → ${v.verdictZh}/${v.finalVerdict} · ${v.thaiSummary} · ${confidenceTh}${rules}`;
    });
    lines.push(`ข้อมูลเสริมก้านฟ้า五合 (hehuaVerdicts · หลักฐานเสริม): ${items.join(" · ")} · ใช้ประกอบการอ่านร่วมกับ用神/忌神 วัยจร ปีจร และคำถามจริง · ไม่ลดอิสระการอ่านของซินแส`);
  }
  if (packet.mukuStates?.length) {
    const items = packet.mukuStates.map((v) => {
      const hidden = v.hiddenStems.map((h) => `${h.stem}${h.element}${h.role === "neutral" ? "" : `:${h.role}`}`).join("/");
      const clash = v.clashedBy.length ? ` · ชงโดย ${v.clashedBy.map((x) => `${PILLAR_EN_TH[x.pillar] || x.pillar}:${x.branch}/${x.distance}`).join(",")}` : "";
      const visible = v.visibleStoredStems.length ? ` · 透干 ${v.visibleStoredStems.map((x) => `${PILLAR_EN_TH[x.pillar] || x.pillar}:${x.stem}`).join(",")}` : "";
      const rules = v.sourceRuleIds.length ? ` · rule ${v.sourceRuleIds.join("/")}` : "";
      return `คลัง${v.branch}${v.storageElement}庫@${PILLAR_EN_TH[v.pillar] || v.pillar} → ${v.verdictZh}/${v.finalVerdict}${clash}${visible} · 藏干 ${hidden} · ${v.thaiSummary}${rules}`;
    });
    lines.push(`ข้อมูลเสริมคลัง墓庫 (mukuStates · หลักฐานเสริม): ${items.join(" · ")} · เป็นข้อมูลกลไกเพิ่มสำหรับซินแส ใช้อธิบายจังหวะคลัง/ก้านซ่อนร่วมกับ用神/忌神 วัยจร ปีจร และคำถามจริง · ไม่เปลี่ยนสไตล์และไม่ลดอิสระการอ่าน`);
  }
  if (packet.xchResolution?.length) {
    const verdictTh: Record<string, string> = {
      weakened_by_combination: "ชงอ่อนเพราะฮะ",
      suppressed_by_stem_combo: "ชงถูกระงับเพราะ天干合",
      secondary_clash_exposed: "เปิดชง/刑รองหลังแก้",
    };
    const items = packet.xchResolution.map((r) => {
      const parts = r.participants
        .map((p) => `${PILLAR_EN_TH[p.pillar] || p.pillar}:${p.token}(${p.role})`)
        .join(",");
      const sec = r.secondaryClash
        ? ` · 刑/沖รอง:${r.secondaryClash.kind}${r.secondaryClash.branches.join("")}`
        : "";
      const conf = r.confidence === "high" ? "น้ำหนักสูง" : r.confidence === "medium" ? "น้ำหนักกลาง" : "น้ำหนักเบา";
      const rules = r.sourceRuleIds.length ? ` · rule ${r.sourceRuleIds.join("/")}` : "";
      return `${r.ruleId}/${verdictTh[r.verdict] || r.verdict} · ${r.reasonTh} · [${parts}]${sec} · ${conf}${rules}`;
    });
    lines.push(
      `合冲resolver (xchResolution · หลักฐานเสริมการคลายชง/เปิดชงรอง · ZPZQ-XCH-001/002/003): ${items.join(
        " · ",
      )} · ใช้ประกอบการอ่านร่วมกับ用神/忌神 วัยจร ปีจร และคำถามจริง · ไม่ลดอิสระการอ่านของซินแส และไม่ใช่ฟันธงดี-ร้าย`,
    );
  }
  /* Gap 4: 神煞 × transit activation (HK-SHENSHA-TRANSIT) */
  if (packet.shenshaTransit?.length) {
    const items = packet.shenshaTransit.slice(0, 10).map((s) => {
      const ptTh: Record<string, string> = { year: "เสาปี", month: "เสาเดือน", day: "เสาวัน", hour: "เสายาม" };
      const place = ptTh[s.natalPillar] || s.natalPillar;
      const period = s.activatorPeriod.label ? ` · ช่วง ${s.activatorPeriod.label}` : "";
      return `${s.starTh}(${s.starZh}) @${place}/${s.natalBranch} · ${s.verdict}${period} · ${s.thaiSummary}`;
    });
    lines.push(`神煞 transit activation (หลักฐานเสริม · SMTG-Vol3 ตำราอ้าง): ${items.join(" · ")}`);
  }
  /* Gap 4: 六親 event-level (HK-RELATIVE-EVENT) */
  if (packet.sixRelativesEvents?.length) {
    const items = packet.sixRelativesEvents.slice(0, 12).map((e) =>
      `ปี ${e.year}/${e.triggerBranch}: ${e.relativeTh}(${e.relativeZh}) · ${e.eventType} · ${e.eventTh}`
    );
    lines.push(`六親 event timeline (หลักฐานเสริม · SMTG-Vol5 + YHZP ตำราอ้าง): ${items.join(" · ")}`);
  }
  if (packet.mukuTransitStates?.length) {
    const scopeRank: Record<string, number> = { luck: 0, annual: 1, month: 2 };
    const scopeTh: Record<string, string> = { luck: "วัยจร", annual: "ปีจร", month: "เดือนจร" };
    const sorted = [...packet.mukuTransitStates].sort((a, b) =>
      (scopeRank[a.scope] ?? 9) - (scopeRank[b.scope] ?? 9) ||
      (a.year ?? 0) - (b.year ?? 0) ||
      (a.month ?? 0) - (b.month ?? 0)
    );
    /* dedup: verdict ซ้ำ (เช่นเดือนเดียวชงคลังเดิมทุกปี) ยุบเป็นรายการเดียว + ช่วงปี · กัน noise ซ้ำ 13 รอบ */
    const seen = new Map<string, { v: typeof sorted[number]; years: number[] }>();
    for (const v of sorted) {
      const key = `${v.scope}|${v.branch}|${v.storageElement}|${v.verdictZh}|${v.finalVerdict}`;
      const ex = seen.get(key);
      if (ex) { if (v.year) ex.years.push(v.year); }
      else seen.set(key, { v, years: v.year ? [v.year] : [] });
    }
    const items = Array.from(seen.values()).slice(0, 8).map(({ v, years }) => {
      const hidden = v.hiddenStems.map((h) => `${h.stem}${h.element}${h.role === "neutral" ? "" : `:${h.role}`}`).join("/");
      const rules = v.sourceRuleIds.length ? ` · rule ${v.sourceRuleIds.join("/")}` : "";
      const yrTxt = years.length > 1 ? `ปี${Math.min(...years)}-${Math.max(...years)}(${years.length}ครั้ง)` : (years[0] ? `ปี${years[0]}` : (scopeTh[v.scope] || v.scope));
      return `${yrTxt} ชงคลัง${v.branch}${v.storageElement}庫@${PILLAR_EN_TH[v.pillar] || v.pillar} = ${v.verdictZh}/${v.finalVerdict} · 藏干 ${hidden} · ${v.thaiSummary}${rules}`;
    });
    const more = seen.size > items.length ? ` · ยังมีอีก ${seen.size - items.length} รูปแบบใน packet` : "";
    lines.push(`ข้อมูลเสริมคลังตามเวลา墓庫流動 (mukuTransitStates · ยุบรายการซ้ำ · 大運/流年/流月): ${items.join(" · ")}${more} · หลักฐานเพิ่มสำหรับอ่านจังหวะย้อนหลัง/ล่วงหน้า`);
  }
  if (packet.luckInteractions.length) lines.push(renderInteractionGroup("ปฏิกิริยาวัยจร×ดวงเกิด", packet.luckInteractions, "raw_only"));
  if (packet.annualInteractions.length) lines.push(renderInteractionGroup("ปฏิกิริยาปีจร×เสาวัน", packet.annualInteractions, "raw_only"));
  if (packet.interactionConflictSummary?.length) {
    const scopeTh: Record<string, string> = { natal: "ดวงเกิด", luck: "วัยจร×ดวงเกิด", annual: "ปีจร×ดวงเกิด" };
    const items = packet.interactionConflictSummary.map((s) =>
      `${scopeTh[s.scope] || s.scope}:${s.participantKey} มี ${s.types.join("+")}` +
      `${s.affectedPalaces.length ? ` · เรือน ${s.affectedPalaces.join("/")}` : ""}` +
      `${s.affectedTopicsLite.length ? ` · เรื่อง ${s.affectedTopicsLite.join("/")}` : ""}` +
      ` · ${s.note}`
    );
    lines.push(`สรุปปฏิกิริยาซ้อน (derived summary · ไม่ใช่ full resolver): ${items.join(" · ")}`);
  }

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
    return `  - ${typeTh} ${pairTxt}${reactTxt}${tgTxt}${palaces}${topics}${impact}${transformed}${timing}${imagery}${behavior}${note} · ใช้เป็นหลักฐานให้ซินแสชั่งน้ำหนักและตัดสิน`;
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
  if (packet.packetVersion !== "hourkey-chart-packet-lite-v1.1" || packet.packetLevel !== "step1_lite") {
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
