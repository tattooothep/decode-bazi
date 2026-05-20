/**
 * rootedness-explain-v2.ts · Phase 18 · 20 พ.ค. 2026
 *
 * Plan: rewrite rootedness explain · 4 layers · ภาษาคนทั่วไป
 * Codex spec APPROVED · sifu-corrected · single source of truth
 *
 * ─── 4 Layers ───
 *   L1 · Headline    (2-3 คำ · ระดับพลัง + บทบาท)
 *   L2 · Meaning     (1-2 ประโยค · % + rootedness · ภาษาคน)
 *   L3 · Where       (รายการที่มา · "พบใน" + "แรงต้าน")
 *   L4 · Use/Advice  (จุดแข็ง · จุดเสี่ยง · ใช้กับอะไร · บาลานซ์)
 *
 * ─── 5 Labels (Rootedness Level) ───
 *   strong  · พลังเต็ม (ตัวหลัก)
 *   rooted  · พลังแน่น (ไว้ใจได้)
 *   partial · พลังพอใช้ (มีแรงช่วย)
 *   token   · พลังบาง (มีแววแต่ไม่พึ่งได้มาก)
 *   minimal · แทบไม่มีแรง (มีชื่อ แต่ไม่ค่อยมีผล)
 *
 * 3 ภาษา TH/EN/ZH · ไทยนำ · ไม่ปนกัน
 */

import type { ElementDistributionResult, HsContribution, VhsContribution } from "./element-distribution-functional";

export type Element = "wood" | "fire" | "earth" | "metal" | "water";
export type Lang = "th" | "en" | "zh";
export type RootLevel = "strong" | "rooted" | "partial" | "token" | "minimal";

/* ============================================================
 * 1) Label headline · 5 levels × 3 lang
 * ============================================================ */

export const LEVEL_HEADLINE: Record<RootLevel, Record<Lang, string>> = {
  strong:  { th: "พลังเต็ม",         en: "Full strength",   zh: "很强" },
  rooted:  { th: "พลังแน่น",         en: "Stable strength", zh: "稳定有力" },
  partial: { th: "พลังพอใช้",        en: "Moderate",         zh: "中等可用" },
  token:   { th: "พลังบาง",          en: "Thin",             zh: "偏弱" },
  minimal: { th: "แทบไม่มีแรง",     en: "Minimal",          zh: "很弱" },
};

/* ============================================================
 * 2) Element labels · 3 lang (no jargon)
 * ============================================================ */

export const EL_LABEL: Record<Element, Record<Lang, string>> = {
  wood:  { th: "ไม้",  en: "Wood",  zh: "木" },
  fire:  { th: "ไฟ",   en: "Fire",  zh: "火" },
  earth: { th: "ดิน",  en: "Earth", zh: "土" },
  metal: { th: "ทอง",  en: "Metal", zh: "金" },
  water: { th: "น้ำ",  en: "Water", zh: "水" },
};

/* ============================================================
 * 3) Position labels · 3 lang (เสาปี/เดือน/วัน/ชั่วยาม)
 * ============================================================ */

export const POS_LABEL: Record<string, Record<Lang, string>> = {
  year:  { th: "เสาปี",         en: "Year pillar",  zh: "年柱" },
  month: { th: "เสาเดือน",      en: "Month pillar", zh: "月柱" },
  day:   { th: "เสาวัน",        en: "Day pillar",   zh: "日柱" },
  hour:  { th: "เสาชั่วยาม",   en: "Hour pillar",  zh: "时柱" },
};

/* ============================================================
 * 4) Qi labels · ภาษาคน (ไม่ใช่ "แก่นหลัก/กลาง/ปลาย")
 * ============================================================ */

export const QI_LABEL: Record<string, Record<Lang, string>> = {
  main:     { th: "เด่นที่สุด",     en: "primary",   zh: "最明显" },
  middle:   { th: "รองลงมา",       en: "secondary", zh: "其次" },
  residual: { th: "แวบเดียว",      en: "trace",     zh: "一闪而过" },
};

/* ============================================================
 * 5) Layer 4 · Use/Advice · 5 elements × 5 levels × 3 lang = 75
 * ============================================================ */

export interface Advice {
  strength: string;     /* จุดแข็ง */
  risk: string;         /* จุดเสี่ยง */
  use_in: string;       /* ใช้กับอะไร */
  balance: string;      /* วิธีบาลานซ์ */
}

export const ADVICE: Record<Element, Record<RootLevel, Record<Lang, Advice>>> = {
  wood: {
    strong: {
      th: { strength: "เป็นคนมีหลักการ ตั้งใจสูง มองไกล", risk: "ดื้อ ไม่ยอมโค้ง ตึงเกินจนหัก", use_in: "งานบริหาร · วางแผน · การศึกษา · งานสร้างสรรค์", balance: "ฝึกฟัง · ยืดหยุ่นด้วยความเข้าใจคน (น้ำ/ไฟ)" },
      en: { strength: "Principled, ambitious, big-picture thinker", risk: "Stubborn, inflexible, snaps under pressure", use_in: "Management · planning · education · creative work", balance: "Listen more · soften with empathy (Water/Fire)" },
      zh: { strength: "有原则、有志向、远见好", risk: "固执、不灵活、绷得太紧易断", use_in: "管理 · 规划 · 教育 · 创意工作", balance: "多倾听 · 用同理心柔化（水/火）" },
    },
    rooted: {
      th: { strength: "มีเป้าหมายชัด · เติบโตต่อเนื่อง", risk: "ตั้งเป้าสูงแล้วเครียดเองเมื่อช้า", use_in: "งานที่ต้องวางระยะยาว · เรียนรู้สิ่งใหม่", balance: "วางจังหวะพัก · ไม่เร่งตัวเอง" },
      en: { strength: "Clear goals · steady growth", risk: "High targets cause self-stress when slow", use_in: "Long-term projects · learning new skills", balance: "Pace yourself · don't rush" },
      zh: { strength: "目标清晰、稳步成长", risk: "目标过高时容易自我压迫", use_in: "长期项目 · 学习新技能", balance: "把握节奏 · 不催促自己" },
    },
    partial: {
      th: { strength: "มีไอเดีย · พอลงมือได้บ้าง", risk: "เริ่มต้นง่ายแต่ทิ้งกลางคัน", use_in: "งานทดลอง · โปรเจกต์ระยะสั้น", balance: "หาคู่หูช่วยกดดัน · ใส่ deadline" },
      en: { strength: "Has ideas · can start things", risk: "Easy to start but drops mid-way", use_in: "Experiments · short-term projects", balance: "Find an accountability partner · use deadlines" },
      zh: { strength: "有想法、能起步", risk: "容易开始但中途放弃", use_in: "实验 · 短期项目", balance: "找伙伴督促 · 设截止日期" },
    },
    token: {
      th: { strength: "เริ่มต้นอ่อน แต่พอมีแววคิด", risk: "ขาดแรงผลักดัน · ทิ้งง่าย", use_in: "งานเล็ก ๆ ที่เริ่มแล้วจบไว", balance: "ขอความช่วยเหลือเพื่อน · ตั้งเป้าเล็ก ๆ" },
      en: { strength: "Weak but has sparks of ideas", risk: "Lacks drive · gives up easily", use_in: "Small tasks with quick completion", balance: "Ask friends for help · set tiny goals" },
      zh: { strength: "起步弱但有想法", risk: "缺动力、易放弃", use_in: "小任务、能快速完成的事", balance: "找朋友帮助 · 定小目标" },
    },
    minimal: {
      th: { strength: "อาจไม่ใช่จุดเด่น", risk: "ขาดความมุ่งมั่นระยะยาว", use_in: "อย่าฝืน · ใช้ธาตุอื่นที่แรงกว่า", balance: "เสริมด้วย partner ที่มีไม้แน่น (เพื่อน · พี่เลี้ยง)" },
      en: { strength: "May not be your strong suit", risk: "Lacks long-term drive", use_in: "Don't force · use other stronger elements", balance: "Pair with a wood-strong mentor or partner" },
      zh: { strength: "不是你的强项", risk: "缺乏长期动力", use_in: "不要勉强 · 用其他更强的五行", balance: "搭配木强的导师或伙伴" },
    },
  },
  fire: {
    strong: {
      th: { strength: "มีพลังบวก · กล้าแสดงออก · นำคนได้", risk: "ใจร้อน วูบวาบ หมดแรงเร็ว", use_in: "งานพรีเซนต์ · ขาย · สอน · บันเทิง · ผู้นำทีม", balance: "หาเวลาเงียบ ๆ คนเดียว (น้ำ) · นั่งสมาธิ" },
      en: { strength: "Charismatic · expressive · natural leader", risk: "Hot-tempered, burns out fast", use_in: "Presenting · sales · teaching · entertainment · leading", balance: "Schedule quiet time alone (Water) · meditation" },
      zh: { strength: "有魅力、善表达、天生领袖", risk: "急躁、易冲动、容易耗尽", use_in: "演讲 · 销售 · 教学 · 娱乐 · 团队领导", balance: "安排独处时间（水）· 静坐冥想" },
    },
    rooted: {
      th: { strength: "พูดเก่ง · สื่อสารชัด · มีเสน่ห์", risk: "บางครั้งพูดเกินคิด", use_in: "งานต้องสื่อสาร · บริการลูกค้า", balance: "ฟังก่อนพูด · ทบทวนก่อนตอบ" },
      en: { strength: "Articulate · clear communicator · charming", risk: "Sometimes speaks before thinking", use_in: "Communication-heavy work · customer service", balance: "Listen first · pause before responding" },
      zh: { strength: "善言、表达清晰、有魅力", risk: "有时说话不经思考", use_in: "需要沟通的工作 · 客服", balance: "先听再说 · 回应前先想" },
    },
    partial: {
      th: { strength: "อบอุ่น · ใจดี · เป็นมิตร", risk: "เก็บอารมณ์ไว้ในใจ ระเบิดทีหลัง", use_in: "งานที่ต้องเข้าใจคน · ทีมเล็ก", balance: "ระบายอารมณ์ทันที · ไม่อด" },
      en: { strength: "Warm · kind · friendly", risk: "Bottles up emotions, explodes later", use_in: "People-focused work · small teams", balance: "Express feelings on time · don't suppress" },
      zh: { strength: "温暖、善良、友好", risk: "压抑情绪、之后爆发", use_in: "以人为本的工作 · 小团队", balance: "及时表达情绪 · 不要压抑" },
    },
    token: {
      th: { strength: "เงียบ ๆ แต่อบอุ่นในวงเล็ก", risk: "ขาดความมั่นใจในที่สาธารณะ", use_in: "งานหลังบ้าน · งานเขียน · 1-on-1", balance: "ฝึกพูดในที่ปลอดภัยก่อน · เพื่อนใกล้ชิด" },
      en: { strength: "Quiet but warm in small circles", risk: "Lacks confidence in public", use_in: "Back-office work · writing · 1-on-1", balance: "Practice speaking in safe spaces first" },
      zh: { strength: "安静但在小圈子里温暖", risk: "在公共场合缺乏自信", use_in: "后台工作 · 写作 · 一对一", balance: "先在安全的环境练习说话" },
    },
    minimal: {
      th: { strength: "ไม่ใช่คนชอบแสง", risk: "เก็บตัว · เหนื่อยกับสังคม", use_in: "งานเดี่ยว · ทำคนเดียวเงียบ ๆ", balance: "อย่าฝืน social · พักเมื่อรู้สึกล้า" },
      en: { strength: "Not the spotlight type", risk: "Introverted · drained by social interaction", use_in: "Solo work · quiet independent tasks", balance: "Don't force socializing · rest when drained" },
      zh: { strength: "不喜聚光灯", risk: "内向 · 社交耗能", use_in: "独自工作 · 安静独立的任务", balance: "不要强迫社交 · 累了就休息" },
    },
  },
  earth: {
    strong: {
      th: { strength: "มั่นคง · ไว้ใจได้ · เป็นที่พึ่งของคน", risk: "ดื้อกับการเปลี่ยนแปลง · ช้าตามไม่ทัน", use_in: "งานบริหาร · บัญชี · อสังหา · ครู · งานราชการ", balance: "ฝึกเปิดใจรับสิ่งใหม่ (ไม้/น้ำ)" },
      en: { strength: "Steady · reliable · others depend on you", risk: "Resists change · slow to adapt", use_in: "Management · accounting · real estate · teaching · government", balance: "Practice openness to new things (Wood/Water)" },
      zh: { strength: "稳定、可靠、是众人依靠", risk: "抗拒变化、适应慢", use_in: "管理 · 会计 · 房地产 · 教学 · 公务员", balance: "练习接受新事物（木/水）" },
    },
    rooted: {
      th: { strength: "มีระเบียบ · ทำตามแผน · เชื่อใจได้", risk: "เครียดเมื่อแผนเปลี่ยน", use_in: "งานที่มี process ชัด · งานต่อเนื่อง", balance: "เตรียม plan B ไว้ก่อนเสมอ" },
      en: { strength: "Organized · follows plans · trustworthy", risk: "Stressed when plans change", use_in: "Process-driven work · routine work", balance: "Always have a backup plan" },
      zh: { strength: "有条理、按计划、值得信赖", risk: "计划变动时易压力", use_in: "流程驱动的工作 · 常规工作", balance: "随时准备备选方案" },
    },
    partial: {
      th: { strength: "พอจะดูแลตัวเองได้ · ไม่ปล่อยปละ", risk: "บางทียังเกียจคร้าน · ผัดวันประกันพรุ่ง", use_in: "งานประจำเบา ๆ · งานที่มีตัวช่วยเตือน", balance: "ใช้ todo list · จัดเวลาเป็นระบบ" },
      en: { strength: "Self-sufficient · doesn't slack off", risk: "Sometimes lazy · procrastinates", use_in: "Light routine work · with reminders", balance: "Use todo lists · systematic time management" },
      zh: { strength: "能自理、不松懈", risk: "有时懒散、拖延", use_in: "轻常规工作 · 有提醒系统", balance: "用待办清单 · 系统化时间管理" },
    },
    token: {
      th: { strength: "พอเป็นที่พึ่งของคนใกล้ชิด", risk: "ขาดวินัย · ทิ้งงานง่าย", use_in: "งานสั้น ๆ ที่จบเร็ว · ทีมที่มีคนคุม", balance: "หา accountability partner · ห้ามทำงานคนเดียว" },
      en: { strength: "Can support those close to you", risk: "Lacks discipline · abandons tasks easily", use_in: "Short tasks · teams with oversight", balance: "Find accountability partner · don't work solo" },
      zh: { strength: "能支持身边亲近的人", risk: "缺乏纪律、易放弃任务", use_in: "短任务 · 有监督的团队", balance: "找问责伙伴 · 不要独自工作" },
    },
    minimal: {
      th: { strength: "ไม่ใช่คนยึดติด · เคลื่อนไหวคล่อง", risk: "ไม่มีจุดยืน · เปลี่ยนตามคนรอบข้าง", use_in: "งานยืดหยุ่น · freelance · ที่ไม่ผูกมัด", balance: "หา mentor · สร้างกิจวัตรเล็ก ๆ" },
      en: { strength: "Not attached · highly mobile", risk: "Lacks grounding · easily swayed", use_in: "Flexible work · freelance · uncommitted", balance: "Find a mentor · build small daily routines" },
      zh: { strength: "不执着、灵活机动", risk: "缺根基、易被人影响", use_in: "灵活工作 · 自由职业 · 无约束", balance: "找导师 · 建立小日常" },
    },
  },
  metal: {
    strong: {
      th: { strength: "เด็ดขาด · ตัดสินใจไว · มีหลักการ", risk: "เย็นชา · ดูเย่อหยิ่ง · ตัดคนได้ง่าย", use_in: "ฝ่ายขาย · บริหารทีม · กฎหมาย · วิศวกรรม · งานที่ต้องเด็ดขาด", balance: "อ่อนโยนบ้าง (น้ำ) · แสดงความเห็นใจ" },
      en: { strength: "Decisive · quick decisions · principled", risk: "Cold · seems arrogant · cuts people off easily", use_in: "Sales · team management · law · engineering · decisive work", balance: "Show softness sometimes (Water) · express empathy" },
      zh: { strength: "果断、决策快、有原则", risk: "冷漠、显傲慢、容易与人切割", use_in: "销售 · 团队管理 · 法律 · 工程 · 需要果断的工作", balance: "偶尔柔和（水）· 表达同理心" },
    },
    rooted: {
      th: { strength: "ชัดเจน · มีระเบียบ · จัดการสิ่งของเก่ง", risk: "เครียดเมื่อสิ่งแวดล้อมเลอะเทอะ", use_in: "งานจัดการ · บัญชี · QA · ตรวจสอบ", balance: "ฝึกปล่อยวางสิ่งเล็ก ๆ" },
      en: { strength: "Clear · organized · good at handling things", risk: "Stressed in messy environments", use_in: "Management · accounting · QA · auditing", balance: "Practice letting go of small things" },
      zh: { strength: "清晰、有条理、善于处理事物", risk: "环境凌乱时压力大", use_in: "管理 · 会计 · 质检 · 审计", balance: "练习放下小事" },
    },
    partial: {
      th: { strength: "พอจะตัดสินใจในเรื่องสำคัญ", risk: "ลังเลเมื่อต้องเลือก", use_in: "งานที่มี framework ชัด · มีคู่มือ", balance: "ตั้งเกณฑ์ก่อนตัดสิน · ไม่คิดนาน" },
      en: { strength: "Can decide on important matters", risk: "Hesitates when choosing", use_in: "Work with clear frameworks · documented", balance: "Set criteria before deciding · don't overthink" },
      zh: { strength: "重要事情上能决断", risk: "选择时犹豫", use_in: "框架清晰、有文档的工作", balance: "决定前先定标准 · 不要过度思考" },
    },
    token: {
      th: { strength: "พอจัดสิ่งของตัวเองได้", risk: "ลังเลตลอด · ไม่กล้าตัดสินใจ", use_in: "งาน routine · มีคนช่วยตัดสิน", balance: "ขอคำปรึกษาทุกครั้ง · ตามคนเก่ง" },
      en: { strength: "Can manage own things", risk: "Always hesitant · scared to decide", use_in: "Routine work · with someone to decide", balance: "Always consult · follow experts" },
      zh: { strength: "能管理自己的事物", risk: "经常犹豫、不敢决定", use_in: "常规工作 · 有人帮助决断", balance: "每次咨询 · 跟随专家" },
    },
    minimal: {
      th: { strength: "ไม่ใช่นักวินัย · ผ่อนคลายอยู่ได้", risk: "ขี้ลืม · สิ่งของกระจัดกระจาย", use_in: "งานสร้างสรรค์ · ที่ไม่ต้องระเบียบ", balance: "ใช้ app/เครื่องมือช่วย · ขอคนใกล้ชิดคุม" },
      en: { strength: "Not big on discipline · stays relaxed", risk: "Forgetful · things scattered", use_in: "Creative work · doesn't need order", balance: "Use apps/tools · ask close ones to oversee" },
      zh: { strength: "不严苛、能放松", risk: "健忘、东西散乱", use_in: "创意工作 · 不需要秩序", balance: "用应用/工具辅助 · 让亲近的人监督" },
    },
  },
  water: {
    strong: {
      th: { strength: "ฉลาด · ปรับตัวเก่ง · มองหลายมุม", risk: "คิดเยอะ · ลังเล · ไหลตามสถานการณ์", use_in: "งานข้อมูล · การเงิน · การเจรจา · กลยุทธ์", balance: "เติม 'ดิน' = ตั้งกติกา · deadline · ตัดตัวเลือก" },
      en: { strength: "Smart · adaptive · multi-perspective", risk: "Overthinks · hesitates · drifts with situations", use_in: "Data · finance · negotiation · strategy", balance: "Add 'Earth' = rules, deadlines, fewer options" },
      zh: { strength: "聪明、善适应、多角度看问题", risk: "想太多、犹豫、随波逐流", use_in: "数据 · 金融 · 谈判 · 策略", balance: "加'土' = 规则、截止日期、减少选择" },
    },
    rooted: {
      th: { strength: "คิดเป็นระบบ · แก้ปัญหาเก่ง", risk: "ลังเลก่อนลงมือ", use_in: "งานวิเคราะห์ · ที่ปรึกษา · นักวิจัย", balance: "ตั้งเดดไลน์ตัวเอง · ไม่ลังเลนาน" },
      en: { strength: "Systematic thinker · good problem solver", risk: "Hesitates before action", use_in: "Analysis · consulting · research", balance: "Set self-deadlines · don't hesitate long" },
      zh: { strength: "系统思考、善解决问题", risk: "行动前犹豫", use_in: "分析 · 咨询 · 研究", balance: "自定截止日 · 不要久犹豫" },
    },
    partial: {
      th: { strength: "พอจะคิดได้รอบคอบ", risk: "บางครั้งสับสนเอง", use_in: "งานที่มีโจทย์ชัด · มีตัวอย่าง", balance: "เขียนความคิดออกมาก่อนตัดสิน" },
      en: { strength: "Can think things through", risk: "Sometimes confuses self", use_in: "Work with clear problems · with examples", balance: "Write thoughts down before deciding" },
      zh: { strength: "能仔细思考", risk: "有时会让自己困惑", use_in: "问题清晰、有范例的工作", balance: "决定前先写下想法" },
    },
    token: {
      th: { strength: "พอจะอ่านสถานการณ์ได้", risk: "ขาดเชิงลึก · ตัดสินใจตื้น", use_in: "งาน routine · มีคนสอน", balance: "ปรึกษาคนเก่ง · อย่าเดาเอง" },
      en: { strength: "Can read situations enough", risk: "Lacks depth · shallow judgment", use_in: "Routine work · with mentorship", balance: "Consult experts · don't guess" },
      zh: { strength: "能看清情况", risk: "缺深度、判断浅", use_in: "常规工作 · 有人指导", balance: "咨询专家 · 不要猜测" },
    },
    minimal: {
      th: { strength: "ไม่คิดมาก · ใจตรง", risk: "ตื้น · ขาดมุมมอง · ตัดสินใจเร็วเกิน", use_in: "งานปฏิบัติ · งานที่ไม่ต้องคิดซับซ้อน", balance: "ปรึกษาคนรอบข้างก่อนตัดสินใหญ่" },
      en: { strength: "Doesn't overthink · straightforward", risk: "Shallow · lacks perspective · decides too fast", use_in: "Hands-on work · doesn't need complex thinking", balance: "Consult others before big decisions" },
      zh: { strength: "不多想、直接", risk: "肤浅、缺角度、决定太快", use_in: "实操工作 · 不需复杂思考", balance: "重大决定前咨询他人" },
    },
  },
};

/* ============================================================
 * 6) Level mapping · pct → RootLevel
 *    ใช้ pctRaw (float) ไม่ใช่ pctDisplay · กัน boundary flip
 *    เกณฑ์: >40 strong · >25 rooted · >15 partial · >5 token · <=5 minimal
 * ============================================================ */

function levelFromPct(pctRaw: number): RootLevel {
  if (pctRaw > 40) return "strong";
  if (pctRaw > 25) return "rooted";
  if (pctRaw > 15) return "partial";
  if (pctRaw > 5)  return "token";
  return "minimal";
}

/* ============================================================
 * 7) Layer 2 · Meaning (dynamic · per element + level + lang)
 * ============================================================ */

function buildMeaning(el: Element, level: RootLevel, pctDisplay: number, isDm: boolean, lang: Lang): string {
  const elLabel = EL_LABEL[el][lang];
  const dmTag: Record<Lang, string> = {
    th: isDm ? "(ตัวเรา) " : "",
    en: isDm ? "(Self) " : "",
    zh: isDm ? "（自身）" : "",
  };
  const tpl: Record<RootLevel, Record<Lang, (el: string, pct: number) => string>> = {
    strong: {
      th: (el, pct) => `ธาตุ${el}ของคุณเด่นมาก (ประมาณ ${pct}% ของภาพรวม) เป็น "โหมดพื้นฐาน" ของนิสัยและการตัดสินใจ · ใช้เป็นจุดแข็งได้จริง`,
      en: (el, pct) => `Your ${el} is very prominent (~${pct}% of the overall mix). It becomes your default mode, reliable to build decisions and skills on.`,
      zh: (el, pct) => `你的${el}非常突出（约${pct}%），是做事的底层风格，能当成长期优势经营。`,
    },
    rooted: {
      th: (el, pct) => `ธาตุ${el}ของคุณมีสัดส่วน ${pct}% และ "ตั้งหลักได้" · ไว้ใจเป็นจุดเด่นในชีวิตประจำวันได้`,
      en: (el, pct) => `Your ${el} sits at ${pct}% with stable footing · reliable as a daily strength.`,
      zh: (el, pct) => `你的${el}占${pct}%，根基稳定，日常可作为优势使用。`,
    },
    partial: {
      th: (el, pct) => `ธาตุ${el}ของคุณ ${pct}% · มีแรงช่วยพอใช้ · เป็นจุดเสริม ไม่ใช่จุดหลัก`,
      en: (el, pct) => `Your ${el} is at ${pct}% with usable strength · a supporting trait, not a core one.`,
      zh: (el, pct) => `你的${el}占${pct}%，有可用力量，是辅助特质，不是核心。`,
    },
    token: {
      th: (el, pct) => `ธาตุ${el}มีเพียง ${pct}% · มีสัญญาณแต่ไม่มีฐานรองรับเต็ม · พึ่งได้บาง ๆ`,
      en: (el, pct) => `${el} sits only at ${pct}% · has signals but lacks full backing · use sparingly.`,
      zh: (el, pct) => `${el}仅占${pct}%，有信号但根基不全，仅可少量依靠。`,
    },
    minimal: {
      th: (el, pct) => `ธาตุ${el}แทบไม่มี (${pct}%) · อาจเห็นชื่อในผัง แต่ไม่ค่อยมีผลในชีวิตจริง`,
      en: (el, pct) => `${el} is minimal (${pct}%) · may appear in the chart but rarely affects daily life.`,
      zh: (el, pct) => `${el}很弱（${pct}%），盘中虽现，但对生活影响很小。`,
    },
  };
  return dmTag[lang] + tpl[level][lang](elLabel, pctDisplay);
}

/* ============================================================
 * 8) Layer 3 · Where it comes from (sources + resistance)
 *    ใช้ distribution.vhs_trace (hidden) + hs_trace (visible)
 * ============================================================ */

interface SourceLine {
  th: string;
  en: string;
  zh: string;
}

function buildSourceLine(c: VhsContribution, lang: Lang): SourceLine | null {
  /* Phase 18 · Option B · เก็บ branch (午/子/...) เป็น tag · ตัด stem char ออก · ใช้ element label */
  const pos = POS_LABEL[c.pos]?.[lang] || c.pos;
  const qi = QI_LABEL[c.qi]?.[lang] || c.qi;
  const elLabel = EL_LABEL[c.element][lang];
  if (lang === "th") {
    return { th: `${pos} (${c.branch}) — แหล่งพลัง${elLabel} (${qi})`, en: "", zh: "" };
  } else if (lang === "en") {
    return { th: "", en: `${pos} (${c.branch}) — ${elLabel} source (${qi})`, zh: "" };
  } else {
    return { th: "", en: "", zh: `${pos}（${c.branch}）— ${elLabel}能量（${qi}）` };
  }
}

function buildHsLine(c: HsContribution, lang: Lang): string {
  /* Phase 18 · Option B · ตัด stem char (丁/己/...) ออก · เก็บ element word */
  const pos = POS_LABEL[c.pos]?.[lang] || c.pos;
  const elLabel = EL_LABEL[c.element][lang];
  if (lang === "th") return `${pos} — ก้านบนฟ้าเป็น${elLabel}`;
  if (lang === "en") return `${pos} — visible ${elLabel.toLowerCase()} on top`;
  return `${pos} — 天干透出${elLabel}`;
}

function buildResistance(stabTags: string[], lang: Lang): string | null {
  /* Phase 18 · Option B · ตัด tag "子午沖" ออกจาก headline · พูดเชิงอธิบาย */
  if (!stabTags || stabTags.length === 0) return null;
  if (lang === "th") return `ถูก "ชน" จากเสาอื่น · พลังออกอาการยากเมื่อเร่งรีบหรือเครียด`;
  if (lang === "en") return `Clashed by other pillars · harder to express under pressure`;
  return `被其他柱"冲" · 紧张时不太顺畅`;
}

/* ============================================================
 * 9) Main · buildRootednessExplainV2
 * ============================================================ */

export interface ElementExplainV2 {
  element: Element;
  element_label: { th: string; en: string; zh: string };
  pct: number;                /* pctDisplay · for UI bar */
  level: RootLevel;
  is_dm: boolean;
  /* Layer 1 */
  headline: { th: string; en: string; zh: string };
  /* Layer 2 */
  meaning: { th: string; en: string; zh: string };
  /* Layer 3 */
  sources: { th: string[]; en: string[]; zh: string[] };
  resistance: { th: string | null; en: string | null; zh: string | null };
  /* Layer 4 */
  advice: { th: Advice; en: Advice; zh: Advice };
}

const STEM_EL_LOCAL: Record<string, Element> = {
  甲: "wood", 乙: "wood", 丙: "fire", 丁: "fire", 戊: "earth",
  己: "earth", 庚: "metal", 辛: "metal", 壬: "water", 癸: "water",
};

const ELS_LOCAL: Element[] = ["wood", "fire", "earth", "metal", "water"];

export function buildRootednessExplainV2(
  dmStem: string,
  distribution: ElementDistributionResult,
): ElementExplainV2[] {
  const dmEl = STEM_EL_LOCAL[dmStem] || "earth";

  return ELS_LOCAL.map(el => {
    const pctRaw = distribution.pctRaw[el] ?? 0;
    const pctDisplay = distribution.pctDisplay[el] ?? 0;
    const level = levelFromPct(pctRaw);
    const isDm = el === dmEl;

    /* Layer 1 · Headline */
    const headline = {
      th: LEVEL_HEADLINE[level].th + (isDm ? " · ตัวเรา" : ""),
      en: LEVEL_HEADLINE[level].en + (isDm ? " · Self" : ""),
      zh: LEVEL_HEADLINE[level].zh + (isDm ? " · 自身" : ""),
    };

    /* Layer 2 · Meaning */
    const meaning = {
      th: buildMeaning(el, level, pctDisplay, isDm, "th"),
      en: buildMeaning(el, level, pctDisplay, isDm, "en"),
      zh: buildMeaning(el, level, pctDisplay, isDm, "zh"),
    };

    /* Layer 3 · Sources + Resistance */
    const vhsContribs = (distribution.vhs_trace || []).filter(c => c.element === el && c.score > 0);
    const hsContribs = (distribution.hs_trace || []).filter(c => c.element === el && c.score > 0);

    const sources_th: string[] = [];
    const sources_en: string[] = [];
    const sources_zh: string[] = [];
    for (const c of vhsContribs) {
      const line = buildSourceLine(c, "th");
      if (line?.th) sources_th.push(line.th);
      const lineEn = buildSourceLine(c, "en");
      if (lineEn?.en) sources_en.push(lineEn.en);
      const lineZh = buildSourceLine(c, "zh");
      if (lineZh?.zh) sources_zh.push(lineZh.zh);
    }
    for (const c of hsContribs) {
      sources_th.push(buildHsLine(c, "th"));
      sources_en.push(buildHsLine(c, "en"));
      sources_zh.push(buildHsLine(c, "zh"));
    }
    if (sources_th.length === 0) {
      sources_th.push("ไม่พบในผังเลย");
      sources_en.push("Not present in chart");
      sources_zh.push("盘中未现");
    }

    /* Resistance · ใช้ tag จาก vhs_trace แรกที่มี (ถ้ามี) */
    const resTag = vhsContribs.find(c => (c.stability_tags || []).length > 0)?.stability_tags || [];
    const resistance = {
      th: buildResistance(resTag, "th"),
      en: buildResistance(resTag, "en"),
      zh: buildResistance(resTag, "zh"),
    };

    /* Layer 4 · Advice */
    const advice = {
      th: ADVICE[el][level].th,
      en: ADVICE[el][level].en,
      zh: ADVICE[el][level].zh,
    };

    return {
      element: el,
      element_label: EL_LABEL[el],
      pct: pctDisplay,
      level,
      is_dm: isDm,
      headline,
      meaning,
      sources: { th: sources_th, en: sources_en, zh: sources_zh },
      resistance,
      advice,
    };
  });
}
