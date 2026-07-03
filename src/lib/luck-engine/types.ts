/**
 * BaZi Engine · Core Types
 * =========================
 * ทุก module ต้อง return shape เดียวกัน · ทำให้ scoring layer ใช้ loop เดียวจัดการได้
 */

// =====================================================================
// PILLAR · 4 pillars ของ Chinese astrology
// =====================================================================

export type HeavenlyStem =
  | "甲" | "乙" | "丙" | "丁" | "戊"
  | "己" | "庚" | "辛" | "壬" | "癸";

export type EarthlyBranch =
  | "子" | "丑" | "寅" | "卯" | "辰" | "巳"
  | "午" | "未" | "申" | "酉" | "戌" | "亥";

export type Element = "金" | "木" | "水" | "火" | "土";

export type Pillar = {
  /** 干 · Heavenly stem */
  stem: HeavenlyStem;
  /** 支 · Earthly branch */
  branch: EarthlyBranch;
  /** 干 element */
  stemElement: Element;
  /** 支 element */
  branchElement: Element;
  /** Hidden stems in branch */
  hiddenStems: HeavenlyStem[];
};

// =====================================================================
// REASON · ทุก module ส่ง reason ใน shape นี้
// =====================================================================

export type Reason = {
  /** Unique code · e.g. "CLASH_TAISUI", "OFFICER_開" */
  code: string;
  /** Thai message · แสดงให้ลูกค้าเห็น */
  thai: string;
  /** Optional Chinese · สำหรับนักศึกษา */
  zh?: string;
  /** Score delta · +/- จาก base 50 */
  delta: number;
  /** Severity · ใช้ rank/sort */
  severity?: "info" | "warning" | "critical";
  /** Module ที่ส่ง reason นี้ */
  source?: ModuleKey;
};

// =====================================================================
// CAP RULE · กฎที่จำกัด score ขั้นต่ำ/สูงสุด
// =====================================================================

export type CapRule = {
  /** ชนิดของ cap */
  type: "min" | "max" | "absolute";
  /** Score limit */
  value: number;
  /** เหตุผล · e.g. "วันปะทะ太歲 = score ไม่เกิน 40" */
  reason: string;
  /** Module ที่เป็นต้นเหตุ */
  source: ModuleKey;
};

// =====================================================================
// MODULE RESULT · ทุกศาสตร์ return shape นี้
// =====================================================================

export type ModuleStatus = "ready" | "partial" | "missing" | "error";

export type ModuleResult = {
  /** Module identifier */
  module: ModuleKey;

  /** Compute status */
  status: ModuleStatus;

  /** Score breakdown */
  score: {
    /** Raw score ก่อน normalize · อาจติดลบ */
    raw: number;
    /** Normalized 0-100 */
    normalized: number;
    /** Module weight (สำหรับ combine) */
    weight: number;
  };

  /** Pass/fail · ใช้ใน fail-fast filter */
  pass: boolean;

  /** Tags · ใช้ index และ filter เร็ว */
  tags: string[];

  /** Reasons แยกตามทิศทาง */
  reasons: {
    up: Reason[];      // ดี
    down: Reason[];    // ไม่ดี
    warning: Reason[]; // ระวัง
    neutral?: Reason[];
  };

  /** Optional caps */
  caps?: CapRule[];

  /** Confidence 0-1 · ลดลงถ้าข้อมูลไม่ครบ */
  confidence: number;

  /** Raw data · เฉพาะ module นั้น · สำหรับ detail view */
  raw: Record<string, any>;
};

// =====================================================================
// MODULE KEYS · 11 ศาสตร์
// =====================================================================

export type ModuleKey =
  | "ze_ri"            // 擇日 / Tong Shu
  | "twelve_officers"  // 12 建除
  | "twenty_eight"     // 28 宿
  | "twelve_spirits"   // 12 神 (黃黑道)
  | "nine_stars"       // 9 飛星
  | "tai_sui"          // 太歲
  | "qi_men"           // 奇門遁甲
  | "he_luo"           // 河洛
  | "ba_zi"            // 八字 (personal)
  | "yong_shen"        // 用神 (personal)
  | "hex64"            // 64 卦 (can be personal)
  | "tian_xing"        // 七政四餘 ดาวจริง (เฟส B · opt-in · default ปิด)
  | "dong_gong";       // 董公擇日 ตงกง (r367 · opt-in · ตัดฤกษ์ผ่าน caps ใน combineScores)

export const ALL_MODULES: ModuleKey[] = [
  "ze_ri", "twelve_officers", "twenty_eight", "twelve_spirits",
  "nine_stars", "tai_sui", "qi_men", "he_luo",
  "ba_zi", "yong_shen", "hex64", "tian_xing", "dong_gong"
];

// หมายเหตุ: tian_xing ไม่อยู่ใน UNIVERSAL — เป็น scorer (compute on-the-fly) ไม่ใช่ hard-filter
// (กันไม่ให้ไหลเข้า hardModules→SQL aj_ephemeris_cache ที่ไม่มีคอลัมน์ tian_xing · ฤกษ์หาย)
// scoring ทำงานผ่าน ALL_MODULES → baseScoreModules → combineScores
// r367: dong_gong ก็ไม่อยู่ใน UNIVERSAL ด้วยเหตุผลเดียวกัน — aj_ephemeris_cache ไม่มีคอลัมน์ dong_gong
// (ถ้าใส่ UNIVERSAL → moduleFilters ใน SQL จะ query คอลัมน์ที่ไม่มี → error → ฤกษ์หายทั้งหน้า)
// dong_gong ตัดฤกษ์ผ่าน caps (max 30/45) ใน combineScores ไม่ใช่ hard-filter SQL
export const UNIVERSAL_MODULES: ModuleKey[] = [
  "ze_ri", "twelve_officers", "twenty_eight", "twelve_spirits",
  "nine_stars", "tai_sui", "qi_men", "he_luo"
];

export const PERSONAL_MODULES: ModuleKey[] = [
  "ba_zi", "yong_shen", "hex64"
];

// =====================================================================
// PERSON · ดวงลูกค้า
// =====================================================================

export type PersonProfile = {
  personId: string;
  name: string;
  birthDatetime: string;        // ISO 8601 with timezone
  birthTimezone: string;
  pillars: {
    year: Pillar;
    month: Pillar;
    day: Pillar;                 // day stem = DM (Day Master)
    hour: Pillar;
  };
  dayMaster: HeavenlyStem;
  zodiac: EarthlyBranch;
  yongShen: Element[];           // ธาตุที่ดี
  jiShen: Element[];             // ธาตุไม่ดี
  geJu?: string;                 // 格局 special pattern
  currentDayun?: string;         // 大運 ปัจจุบัน
};

// =====================================================================
// CANDIDATE SLOT · 1 ฤกษ์ใน UI
// =====================================================================

export type CandidateSlot = {
  /** Database PK */
  id: string;

  /** เวลา */
  datetime: {
    start: string;               // ISO 8601
    end: string;
    timezone: string;
  };

  /** Calendar info */
  calendar: {
    gregorianDate: string;
    lunarDate?: string;
    solarTerm?: string;
    solarTermNo?: number;
    shichen: number;             // 0-11
    shichenBranch: EarthlyBranch;
  };

  /** 4 pillars (universal) */
  pillars: {
    year: Pillar;
    month: Pillar;
    day: Pillar;
    hour: Pillar;
  };

  /** 黃道吉時 · ยามทอง ราย時辰 (อ่านประกอบ · ไม่เข้าคะแนนรวม) */
  huangdao?: import("@/lib/huangdao").HuangDao | null;

  /** 沖煞 · วันนี้ชงราศี/อายุ (standalone · อ่านประกอบ) */
  richong?: import("@/lib/richong").RiChong | null;

  /** 董公擇日 · ฤกษ์ตงกง (display-only · ไม่เข้าคะแนนรวม · เติมของ) */
  donggong?: import("@/lib/donggong").DongGong | null;

  /** Zodiac clash (filter เร็ว) */
  zodiacClash: EarthlyBranch[];

  /** People involved (linked profiles) */
  people: PersonProfile[];

  /** All 11 modules · บางตัวอาจเป็น "partial" หรือ "missing" */
  modules: Partial<Record<ModuleKey, ModuleResult>>;

  /** Scoring result · คำนวณตาม activeModules ที่ลูกค้าเลือก */
  scoring: ScoringResult;

  /** Display data · pre-rendered สำหรับ UI */
  display: {
    badges: Badge[];
    summary: string;
    guardrails: string[];
  };
};

// =====================================================================
// SCORING RESULT
// =====================================================================

export type ScoringResult = {
  /** Active modules ที่ใช้ในการคำนวณ */
  activeModules: ModuleKey[];

  /** Score แยกตาม module */
  moduleScores: Record<ModuleKey, number>;

  /** Final score 0-100 */
  finalScore: number;

  /** Tier classification */
  tier: ScoreTier;

  /** Recommended action */
  action: ActionRecommendation;

  /** Reasons (sorted by severity) */
  reasonsUp: Reason[];
  reasonsDown: Reason[];
  warnings: Reason[];

  /** Caps applied */
  caps: CapRule[];
};

export type ScoreTier =
  | "excellent"    // 85-100 🌟🌟
  | "very_good"    // 75-84  🌟
  | "good"         // 65-74  ✅
  | "neutral"      // 50-64  🟡
  | "caution"      // 35-49  🟠
  | "avoid"        // 20-34  🔴
  | "danger";      // 0-19   ⚠️

export type ActionRecommendation =
  | "highly_recommended"
  | "recommended"
  | "acceptable"
  | "neutral"
  | "with_caution"
  | "avoid"
  | "strictly_avoid";

// =====================================================================
// BADGE · pre-rendered display chips
// =====================================================================

export type Badge = {
  type: "auspicious" | "warning" | "neutral";
  text: string;
  module?: ModuleKey;
  delta?: number;
};

// =====================================================================
// ACTIVITY · ประเภทกิจกรรม (จาก UI · 7 หมวด)
// =====================================================================

export type ActivityType =
  | "立約"      // เซ็นสัญญา (Contract)
  | "出行"      // เดินทาง (Travel)
  | "動土"      // ตอกเสาเข็ม / ก่อสร้าง (Ground-breaking)
  | "搬家"      // ย้ายบ้าน (Move home)
  | "開市"      // เปิดกิจการ (Open business)
  | "婚姻"      // แต่งงาน (Marriage)
  | "求財"      // หาเงิน (Wealth)
  | "祭祀";     // พิธีกรรม (Ritual)

// =====================================================================
// FUNNEL STATS · สำหรับวาด funnel bar ใน UI
// =====================================================================

export type FunnelStats = {
  total: number;
  perModule: Record<ModuleKey, {
    passed: number;
    failed: number;
  }>;
  finalCount: number;
};

// =====================================================================
// API REQUEST/RESPONSE
// =====================================================================

export type SearchRequest = {
  activityType: ActivityType;
  activityProfileKey?: string;
  dateFrom: string;            // YYYY-MM-DD
  dateTo: string;
  peopleIds: string[];         // ลูกค้า + ครอบครัว
  activeModules: ModuleKey[];  // ที่ติ๊กไว้
  options?: {
    limit?: number;            // top N · default 50
    minScore?: number;         // exclude score ต่ำกว่า
    includeRaw?: boolean;      // include raw module data
  };
};

export type SearchResponse = {
  candidates: CandidateSlot[];
  funnelStats: FunnelStats;
  meta: {
    durationMs: number;
    cacheHits: number;
    cacheMisses: number;
  };
};

// =====================================================================
// MODULE INTERFACE · ทุก module ต้อง implement
// =====================================================================

export type ModuleInput = {
  slot: Omit<CandidateSlot, "modules" | "scoring" | "display">;
  person?: PersonProfile;
  activityType: ActivityType;
  /** ทิศเป้าหมายของกิจกรรม ใช้กับ日煞/ฉีเหมิน/งานเดินทาง */
  targetDirection?: "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW" | null;
};

export interface LuckModule {
  /** Module key */
  readonly key: ModuleKey;

  /** Display label (Thai/Chinese) */
  readonly label: { thai: string; zh: string; en: string };

  /** Heavy computation? · ถ้า true จะ lazy-load */
  readonly isHeavy: boolean;

  /** Personal? · ถ้า true ต้องการ person profile */
  readonly isPersonal: boolean;

  /** Other modules ที่ต้อง compute ก่อน */
  readonly dependencies?: ModuleKey[];

  /** Main compute function */
  compute(input: ModuleInput): Promise<ModuleResult>;
}
