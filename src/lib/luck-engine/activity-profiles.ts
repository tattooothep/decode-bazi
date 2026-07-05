import type { ActivityType, ModuleKey } from "./types";

export type ActivityProfileCategory =
  | "doc"
  | "talk"
  | "trade"
  | "biz"
  | "home"
  | "life";

export type ActivityProfileSafety =
  | "standard"
  | "finance_safe"
  | "medical_safe";

export type ActivityProfile = {
  key: string;
  category: ActivityProfileCategory;
  labelTh: string;
  labelZh: string;
  descriptionTh: string;
  baseActivityType: ActivityType;
  uiActivity: string;
  qimenPurpose:
    | "wealth"
    | "work"
    | "business"
    | "negotiation"
    | "travel"
    | "love"
    | "marriage"
    | "health"
    | "exam"
    | "construction";
  hardModules: ModuleKey[];
  requiredInputs: {
    personBazi: boolean;
    houseDirection: boolean;
    targetDirection: boolean;
  };
  safety: ActivityProfileSafety;
  profileMode: "alias" | "modern";
};

export const ACTIVITY_PROFILES: ActivityProfile[] = [
  // 文 · เอกสาร
  { key: "sign_contract", category: "doc", labelTh: "เซ็นสัญญา", labelZh: "立約", descriptionTh: "เอกสารผูกพัน · ซื้อขาย · ขอกู้", baseActivityType: "立約", uiActivity: "sign-contract", qimenPurpose: "work", hardModules: ["ze_ri", "tai_sui", "qi_men"], requiredInputs: { personBazi: true, houseDirection: false, targetDirection: false }, safety: "standard", profileMode: "alias" },
  { key: "close_deal", category: "doc", labelTh: "ปิดดีล/ปิดการขาย", labelZh: "立券交易", descriptionTh: "จบการเจรจา · ตกลงราคา", baseActivityType: "立約", uiActivity: "sign-contract", qimenPurpose: "negotiation", hardModules: ["ze_ri", "qi_men"], requiredInputs: { personBazi: true, houseDirection: false, targetDirection: false }, safety: "standard", profileMode: "modern" },
  { key: "permit_license", category: "doc", labelTh: "ขอใบอนุญาต", labelZh: "上書", descriptionTh: "ยื่นเอกสารราชการ · ขอ license", baseActivityType: "立約", uiActivity: "sign-contract", qimenPurpose: "work", hardModules: ["ze_ri", "tai_sui", "qi_men"], requiredInputs: { personBazi: true, houseDirection: false, targetDirection: false }, safety: "standard", profileMode: "modern" },
  { key: "loan_credit", category: "doc", labelTh: "ขอกู้/ขอเครดิต", labelZh: "求財", descriptionTh: "ยื่นกู้ · ขอวงเงินธนาคาร", baseActivityType: "求財", uiActivity: "invest", qimenPurpose: "wealth", hardModules: ["ze_ri", "tai_sui", "qi_men", "ba_zi"], requiredInputs: { personBazi: true, houseDirection: false, targetDirection: false }, safety: "finance_safe", profileMode: "modern" },
  { key: "launch_ritual", category: "doc", labelTh: "พิธีเปิด/ฤกษ์เปิดตัว", labelZh: "開光", descriptionTh: "พิธีเปิด · launch สินค้า/งานใหม่", baseActivityType: "開市", uiActivity: "open-shop", qimenPurpose: "business", hardModules: ["ze_ri", "tai_sui", "qi_men"], requiredInputs: { personBazi: true, houseDirection: false, targetDirection: false }, safety: "standard", profileMode: "modern" },

  // 談 · เจรจา
  { key: "negotiation", category: "talk", labelTh: "เจรจา/ต่อรอง", labelZh: "議事", descriptionTh: "คุยเงื่อนไข · ต่อรองราคา", baseActivityType: "立約", uiActivity: "negotiate", qimenPurpose: "negotiation", hardModules: ["ze_ri", "qi_men"], requiredInputs: { personBazi: true, houseDirection: false, targetDirection: true }, safety: "standard", profileMode: "alias" },
  { key: "meet_senior", category: "talk", labelTh: "พบผู้ใหญ่/ที่ปรึกษา", labelZh: "見貴", descriptionTh: "พบ senior · mentor · ผู้มีอำนาจช่วยเปิดทาง", baseActivityType: "立約", uiActivity: "negotiate", qimenPurpose: "negotiation", hardModules: ["ze_ri", "qi_men"], requiredInputs: { personBazi: true, houseDirection: false, targetDirection: true }, safety: "standard", profileMode: "modern" },
  { key: "ask_favor", category: "talk", labelTh: "ขอความช่วยเหลือ", labelZh: "求人", descriptionTh: "ขอ favor · ขอ intro · ขอแรงสนับสนุน", baseActivityType: "立約", uiActivity: "negotiate", qimenPurpose: "negotiation", hardModules: ["ze_ri", "qi_men"], requiredInputs: { personBazi: true, houseDirection: false, targetDirection: true }, safety: "standard", profileMode: "modern" },
  { key: "partner_meeting", category: "talk", labelTh: "พบพันธมิตร", labelZh: "結交", descriptionTh: "พบ partner ใหม่ · คุยความร่วมมือ", baseActivityType: "立約", uiActivity: "negotiate", qimenPurpose: "negotiation", hardModules: ["ze_ri", "qi_men"], requiredInputs: { personBazi: true, houseDirection: false, targetDirection: true }, safety: "standard", profileMode: "modern" },
  { key: "pitch_present", category: "talk", labelTh: "Pitch / นำเสนอ", labelZh: "上陳", descriptionTh: "นำเสนอต่อ board · นักลงทุน · ลูกค้าหลัก", baseActivityType: "開市", uiActivity: "open-shop", qimenPurpose: "business", hardModules: ["ze_ri", "qi_men"], requiredInputs: { personBazi: true, houseDirection: false, targetDirection: true }, safety: "standard", profileMode: "modern" },
  { key: "interview", category: "talk", labelTh: "สมัครงาน/สัมภาษณ์", labelZh: "面試", descriptionTh: "สมัครงาน · สัมภาษณ์ · คุย offer", baseActivityType: "立約", uiActivity: "negotiate", qimenPurpose: "exam", hardModules: ["ze_ri", "qi_men", "ba_zi"], requiredInputs: { personBazi: true, houseDirection: false, targetDirection: false }, safety: "standard", profileMode: "modern" },

  // 交 · ธุรกรรม
  { key: "collect_money", category: "trade", labelTh: "รับเงิน/เก็บเงิน", labelZh: "納財", descriptionTh: "รับชำระ · เก็บกระแสเงินสด", baseActivityType: "求財", uiActivity: "invest", qimenPurpose: "wealth", hardModules: ["ze_ri", "qi_men"], requiredInputs: { personBazi: true, houseDirection: false, targetDirection: false }, safety: "finance_safe", profileMode: "modern" },
  { key: "debt_followup", category: "trade", labelTh: "ทวงหนี้/ตามเงิน", labelZh: "索債", descriptionTh: "ตามลูกหนี้ · เร่งจ่าย · ลดข้อพิพาท", baseActivityType: "求財", uiActivity: "invest", qimenPurpose: "negotiation", hardModules: ["ze_ri", "qi_men", "ba_zi"], requiredInputs: { personBazi: true, houseDirection: false, targetDirection: false }, safety: "finance_safe", profileMode: "modern" },
  { key: "pay_transfer", category: "trade", labelTh: "จ่ายเงิน/โอน", labelZh: "出財", descriptionTh: "จ่าย supplier · โอนเงินก้อน · ปิดยอด", baseActivityType: "求財", uiActivity: "invest", qimenPurpose: "wealth", hardModules: ["ze_ri", "tai_sui"], requiredInputs: { personBazi: true, houseDirection: false, targetDirection: false }, safety: "finance_safe", profileMode: "modern" },
  { key: "invest_buy", category: "trade", labelTh: "ลงทุน/ซื้อ", labelZh: "入貨", descriptionTh: "ซื้อทรัพย์สิน · วางเงินก้อน · ตรวจตัวเลข", baseActivityType: "求財", uiActivity: "invest", qimenPurpose: "wealth", hardModules: ["ze_ri", "tai_sui", "qi_men", "ba_zi"], requiredInputs: { personBazi: true, houseDirection: false, targetDirection: false }, safety: "finance_safe", profileMode: "alias" },
  { key: "ship_goods", category: "trade", labelTh: "ออกของ/ส่งของ", labelZh: "出貨", descriptionTh: "ส่งสินค้า · เปิด shipment · กระจายของ", baseActivityType: "出行", uiActivity: "travel", qimenPurpose: "travel", hardModules: ["ze_ri", "qi_men"], requiredInputs: { personBazi: false, houseDirection: false, targetDirection: true }, safety: "standard", profileMode: "modern" },
  { key: "client_sales", category: "trade", labelTh: "พบลูกค้า/ขายของ", labelZh: "求財", descriptionTh: "พบลูกค้า · เสนอราคา · เปิดยอดขาย", baseActivityType: "求財", uiActivity: "invest", qimenPurpose: "negotiation", hardModules: ["ze_ri", "qi_men"], requiredInputs: { personBazi: true, houseDirection: false, targetDirection: true }, safety: "finance_safe", profileMode: "modern" },

  // 經 · องค์กร
  { key: "open_business", category: "biz", labelTh: "เปิดร้าน/ตั้งกิจการ", labelZh: "開市", descriptionTh: "จดทะเบียน · เปิดสาขาใหม่", baseActivityType: "開市", uiActivity: "open-shop", qimenPurpose: "business", hardModules: ["ze_ri", "tai_sui", "qi_men"], requiredInputs: { personBazi: true, houseDirection: false, targetDirection: false }, safety: "standard", profileMode: "alias" },
  { key: "open_project", category: "biz", labelTh: "เปิดโปรเจกต์/เปิดตัว", labelZh: "開業", descriptionTh: "เปิดเว็บ · เปิดเพจ · เปิด product · เริ่ม SaaS", baseActivityType: "開市", uiActivity: "open-shop", qimenPurpose: "business", hardModules: ["ze_ri", "tai_sui", "qi_men"], requiredInputs: { personBazi: true, houseDirection: false, targetDirection: false }, safety: "standard", profileMode: "modern" },
  { key: "hire_onboard", category: "biz", labelTh: "จ้าง/รับพนักงาน", labelZh: "受聘", descriptionTh: "เซ็นสัญญาจ้าง · onboard คนใหม่", baseActivityType: "立約", uiActivity: "sign-contract", qimenPurpose: "work", hardModules: ["ze_ri", "qi_men", "ba_zi"], requiredInputs: { personBazi: true, houseDirection: false, targetDirection: false }, safety: "standard", profileMode: "modern" },
  { key: "take_position", category: "biz", labelTh: "รับตำแหน่ง/เริ่มงานวันแรก", labelZh: "上任", descriptionTh: "รับตำแหน่ง · เริ่มงาน · ขึ้นบทบาทใหม่", baseActivityType: "開市", uiActivity: "open-shop", qimenPurpose: "work", hardModules: ["ze_ri", "tai_sui", "qi_men", "ba_zi"], requiredInputs: { personBazi: true, houseDirection: false, targetDirection: false }, safety: "standard", profileMode: "modern" },
  { key: "office_move", category: "biz", labelTh: "ย้ายออฟฟิศ", labelZh: "移徙", descriptionTh: "ย้ายสำนักงาน · ขนของ · เปลี่ยนที่ทำงาน", baseActivityType: "搬家", uiActivity: "move-in", qimenPurpose: "business", hardModules: ["ze_ri", "tai_sui", "qi_men"], requiredInputs: { personBazi: true, houseDirection: true, targetDirection: true }, safety: "standard", profileMode: "modern" },
  { key: "board_meeting", category: "biz", labelTh: "ประชุมใหญ่/Board", labelZh: "會親友", descriptionTh: "AGM · board meeting · town hall", baseActivityType: "立約", uiActivity: "negotiate", qimenPurpose: "negotiation", hardModules: ["ze_ri", "qi_men"], requiredInputs: { personBazi: true, houseDirection: false, targetDirection: false }, safety: "standard", profileMode: "modern" },

  // 宅 · บ้าน
  { key: "break_ground", category: "home", labelTh: "ตอกเสาเข็ม/ขุดดิน", labelZh: "動土", descriptionTh: "เริ่มก่อสร้าง · ขุดดิน · เปิดหน้างาน", baseActivityType: "動土", uiActivity: "break-ground", qimenPurpose: "construction", hardModules: ["ze_ri", "tai_sui", "qi_men"], requiredInputs: { personBazi: true, houseDirection: true, targetDirection: true }, safety: "standard", profileMode: "alias" },
  { key: "move_home", category: "home", labelTh: "ย้ายเข้าบ้าน", labelZh: "入宅", descriptionTh: "เข้าบ้านใหม่ · ย้ายที่อยู่", baseActivityType: "搬家", uiActivity: "move-in", qimenPurpose: "business", hardModules: ["ze_ri", "tai_sui", "qi_men"], requiredInputs: { personBazi: true, houseDirection: true, targetDirection: true }, safety: "standard", profileMode: "alias" },
  { key: "renovate", category: "home", labelTh: "รีโนเวท/ปรับปรุง", labelZh: "修造", descriptionTh: "ซ่อมแซม · ตกแต่ง · ปรับพื้นที่", baseActivityType: "動土", uiActivity: "break-ground", qimenPurpose: "construction", hardModules: ["ze_ri", "tai_sui", "qi_men"], requiredInputs: { personBazi: true, houseDirection: true, targetDirection: true }, safety: "standard", profileMode: "modern" },

  // 禮 · ชีวิต/พิธี
  { key: "wedding", category: "life", labelTh: "พิธีมงคล/แต่งงาน", labelZh: "嫁娶", descriptionTh: "แต่งงาน · หมั้น · งานมงคลครอบครัว", baseActivityType: "婚姻", uiActivity: "wedding", qimenPurpose: "marriage", hardModules: ["ze_ri", "tai_sui", "qi_men", "ba_zi"], requiredInputs: { personBazi: true, houseDirection: false, targetDirection: false }, safety: "standard", profileMode: "alias" },
  /* r413a fix: เดิม baseActivityType:"祭祀" (ไหว้เจ้า) เพราะ ActivityType ไม่มีหมวดการแพทย์ → ฤกษ์แพทย์ถูกตัดสินด้วยเกณฑ์ไหว้เจ้า · เพิ่ม "求醫" ตัวเดียวครอบทั้งคู่ (surgery = 求醫 เข้มกว่า) */
  { key: "medical_visit", category: "life", labelTh: "พบแพทย์/รักษา", labelZh: "求醫", descriptionTh: "นัดแพทย์ · ตรวจ · วางเวลาที่ร่างกายรับไหว", baseActivityType: "求醫", uiActivity: "sign-contract", qimenPurpose: "health", hardModules: ["ze_ri", "tai_sui", "qi_men", "ba_zi"], requiredInputs: { personBazi: true, houseDirection: false, targetDirection: false }, safety: "medical_safe", profileMode: "modern" },
  { key: "surgery", category: "life", labelTh: "ผ่าตัดแบบเลือกเวลาได้", labelZh: "手術", descriptionTh: "ใช้เฉพาะ elective case · ไม่ใช้แทนคำแนะนำแพทย์", baseActivityType: "求醫", uiActivity: "sign-contract", qimenPurpose: "health", hardModules: ["ze_ri", "tai_sui", "qi_men", "ba_zi"], requiredInputs: { personBazi: true, houseDirection: false, targetDirection: false }, safety: "medical_safe", profileMode: "modern" },
  { key: "exam_study", category: "life", labelTh: "สอบ/สมัครเรียน", labelZh: "考試", descriptionTh: "สอบ · สมัครเรียน · เริ่มคอร์ส", baseActivityType: "立約", uiActivity: "sign-contract", qimenPurpose: "exam", hardModules: ["ze_ri", "qi_men", "ba_zi"], requiredInputs: { personBazi: true, houseDirection: false, targetDirection: false }, safety: "standard", profileMode: "modern" },
  { key: "long_travel", category: "life", labelTh: "เดินทางไกล", labelZh: "出行", descriptionTh: "เดินทางไกล · บิน · ไปต่างจังหวัด/ต่างประเทศ", baseActivityType: "出行", uiActivity: "travel", qimenPurpose: "travel", hardModules: ["ze_ri", "tai_sui", "qi_men"], requiredInputs: { personBazi: true, houseDirection: false, targetDirection: true }, safety: "standard", profileMode: "alias" },
];

const PROFILE_BY_KEY = new Map(ACTIVITY_PROFILES.map((profile) => [profile.key, profile]));

export function getActivityProfile(key: unknown): ActivityProfile | null {
  if (typeof key !== "string") return null;
  return PROFILE_BY_KEY.get(key.trim()) || null;
}

export function resolveActivityType(activityType: unknown, profile: ActivityProfile | null): ActivityType | null {
  if (profile) return profile.baseActivityType;
  if (typeof activityType !== "string") return null;
  const known = new Set<ActivityType>(["立約", "出行", "動土", "搬家", "開市", "婚姻", "求財", "祭祀", "求醫"]); // r413a: เพิ่ม 求醫 (การแพทย์)
  return known.has(activityType as ActivityType) ? (activityType as ActivityType) : null;
}

export function mergeProfileHardModules(input: {
  requestedHardModules: ModuleKey[];
  activeModules: ModuleKey[];
  profile: ActivityProfile | null;
  hasPeople: boolean;
}): ModuleKey[] {
  const active = new Set(input.activeModules);
  const out = new Set(input.requestedHardModules.filter((m) => active.has(m)));
  if (!input.profile) return Array.from(out);
  for (const mod of input.profile.hardModules) {
    if (!active.has(mod)) continue;
    if (mod === "ba_zi" && !input.hasPeople) continue;
    out.add(mod);
  }
  return Array.from(out);
}
