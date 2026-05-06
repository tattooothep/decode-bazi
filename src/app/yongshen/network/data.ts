// ─────────────────────────────────────────────────────────────────────
// Yongshen Network · sample constellation data
// Star chart 星圖 — nodes orbit the user (DM 己) on 3 rings
// ─────────────────────────────────────────────────────────────────────

export type Tier = "S" | "A+" | "A" | "B" | "F";
export type ElementCode = "Wood" | "Fire" | "Earth" | "Metal" | "Water";
export type Bucket = "support" | "bridge" | "friction";
export type Mode = "personal" | "team" | "recruit";

export interface StarNode {
  id: string;
  name: string;
  stemZh: string;
  element: ElementCode;
  relationship: string;
  tier: Tier;
  bucket: Bucket;
  /** angle 0 = top (north), clockwise. Set per node. */
  angle: number;
  /** label hint: "left"/"right" of star, controls anchor + offset */
  side: "left" | "right";
  /** Short note for hover/insight panel */
  note: string;
}

export interface ModeDataset {
  label: string;
  labelZh: string;
  meZh: string; // center character override (我 / 司 / 募)
  meSub: string;
  nodes: StarNode[];
}

// ─────────────────────────────────────────────────────────────────────
// Personal — 11 contacts (mirrors /yongshen/connections)
// ─────────────────────────────────────────────────────────────────────

const PERSONAL_NODES: StarNode[] = [
  // Inner orbit · supporters (S/A+/A) — distributed broadly
  { id: "p1", name: "คุณแม่",     stemZh: "己", element: "Earth", relationship: "ครอบครัว · มารดา", tier: "S",   bucket: "support",  angle:  340, side: "right", note: "DM ตรงกัน · เพื่อนร่วมธาตุที่อยู่ใกล้ที่สุด" },
  { id: "p2", name: "คุณสมชาย",   stemZh: "戊", element: "Earth", relationship: "ครอบครัว · พี่ชาย",  tier: "S",   bucket: "support",  angle:   30, side: "right", note: "ดินแกร่ง · ค้ำให้ยืนตรงเมื่อเหนื่อย" },
  { id: "p3", name: "พี่อรุณ",    stemZh: "丙", element: "Fire",  relationship: "งาน · เจ้านาย",      tier: "S",   bucket: "support",  angle:   95, side: "right", note: "ไฟใหญ่ · ปลุกพลัง DM ที่หนาวให้กระปรี้กระเปร่า" },
  { id: "p4", name: "คุณนภา",    stemZh: "丁", element: "Fire",  relationship: "ลูกค้า A",           tier: "A+",  bucket: "support",  angle:  150, side: "left",  note: "ไฟอ่อน · ดีลคุยจบที่ใจ ไม่ต้องเค้น" },
  { id: "p5", name: "พี่วิทย์",   stemZh: "甲", element: "Wood",  relationship: "ธุรกิจ · หุ้นส่วน",   tier: "A",   bucket: "support",  angle:  215, side: "left",  note: "ไม้ใหญ่ · ให้กรอบและวินัย เปิดทางเติบโต" },
  { id: "p6", name: "น้องใหม่",   stemZh: "乙", element: "Wood",  relationship: "ทีม · ลูกน้อง",      tier: "A",   bucket: "support",  angle:  280, side: "left",  note: "ไม้อ่อน · ปรับตัวเก่ง ตามทันความเปลี่ยน" },

  // Middle orbit · bridges (B) — 2 nodes
  { id: "p7", name: "พี่ก้อง",    stemZh: "壬", element: "Water", relationship: "เพื่อนเก่า",          tier: "B",   bucket: "bridge",   angle:  118, side: "right", note: "น้ำใหญ่ · เจอนานๆครั้งพอ · ดีกว่าใกล้ไกล" },
  { id: "p8", name: "อาจารย์เปรม", stemZh: "癸", element: "Water", relationship: "ที่ปรึกษา",          tier: "B",   bucket: "bridge",   angle:  255, side: "left",  note: "น้ำอ่อน · สนทนาเย็นๆเรื่องลึก ห้ามขอความช่วย" },

  // Outer orbit · frictions (F) — 3 nodes
  { id: "p9",  name: "คุณวรุณ",   stemZh: "庚", element: "Metal", relationship: "ลูกค้า B",           tier: "F",   bucket: "friction", angle:   60, side: "right", note: "ทองใหญ่ · ดูดพลัง DM อย่ายืดยาดในห้องประชุม" },
  { id: "p10", name: "คุณสายฝน", stemZh: "辛", element: "Metal", relationship: "คู่แข่ง",            tier: "F",   bucket: "friction", angle:  185, side: "right", note: "ทองอ่อน · เลียบเคียง อย่าเจอตรง · เจอผ่านบุคคลที่ 3" },
  { id: "p11", name: "พี่นที",   stemZh: "癸", element: "Water", relationship: "เพื่อนเก่า",          tier: "F",   bucket: "friction", angle:  305, side: "left",  note: "น้ำอ่อน · ดูดพลัง · เจอแล้วจบเร็ว · ไม่ดื่มต่อ" },
];

// ─────────────────────────────────────────────────────────────────────
// Team — 8 colleagues (smaller dataset · workplace lens)
// ─────────────────────────────────────────────────────────────────────

const TEAM_NODES: StarNode[] = [
  { id: "t1", name: "พี่อรุณ",   stemZh: "丙", element: "Fire",  relationship: "CEO",                tier: "S",  bucket: "support",  angle:   60, side: "right", note: "ผู้นำธาตุไฟ · ตรงกับยงเฉิน · ผลักงานได้แรง" },
  { id: "t2", name: "พี่ฝน",     stemZh: "戊", element: "Earth", relationship: "COO",                tier: "S",  bucket: "support",  angle:  140, side: "left",  note: "ดินใหญ่ · ตัวยึดทีม · เชื่อใจในการบริหาร" },
  { id: "t3", name: "น้องใหม่",  stemZh: "乙", element: "Wood",  relationship: "Designer",           tier: "A",  bucket: "support",  angle:  220, side: "left",  note: "ไม้อ่อน · creative · ทำงานเสริมกัน" },
  { id: "t4", name: "พี่ชัย",    stemZh: "丁", element: "Fire",  relationship: "Marketing",          tier: "A+", bucket: "support",  angle:  300, side: "left",  note: "ไฟอ่อน · จุดประกายแคมเปญ · มอบหน้าที่ pitch ได้" },
  { id: "t5", name: "คุณติ่ง",   stemZh: "壬", element: "Water", relationship: "Sales",              tier: "B",  bucket: "bridge",   angle:   30, side: "right", note: "น้ำใหญ่ · ปิดดีลใหญ่ได้ · แต่ต้องมีคุมจังหวะ" },
  { id: "t6", name: "ลุงเล็ก",   stemZh: "甲", element: "Wood",  relationship: "Advisor",            tier: "B",  bucket: "bridge",   angle:  200, side: "left",  note: "ไม้ใหญ่ · ที่ปรึกษา · ขอความเห็นเฉพาะเรื่อง" },
  { id: "t7", name: "คุณวรุณ",   stemZh: "庚", element: "Metal", relationship: "Ops",                tier: "F",  bucket: "friction", angle:  100, side: "right", note: "ทองใหญ่ · มีประโยชน์เชิงระบบ · แต่ดราม่าเก่ง" },
  { id: "t8", name: "คุณวีรา",   stemZh: "癸", element: "Water", relationship: "Vendor",             tier: "F",  bucket: "friction", angle:  260, side: "left",  note: "น้ำอ่อน · เจรจาสั้น เลี่ยงดีลยาว" },
];

// ─────────────────────────────────────────────────────────────────────
// Recruit — 6 candidate matches (hiring lens)
// ─────────────────────────────────────────────────────────────────────

const RECRUIT_NODES: StarNode[] = [
  { id: "r1", name: "ผู้สมัคร A", stemZh: "戊", element: "Earth", relationship: "ตำแหน่ง · COO",      tier: "S",  bucket: "support",  angle:   45, side: "right", note: "ดินแกร่ง · เข้ากับวัฒนธรรมบริษัท · ทำงานยาว" },
  { id: "r2", name: "ผู้สมัคร B", stemZh: "丙", element: "Fire",  relationship: "ตำแหน่ง · Sales Lead", tier: "A+", bucket: "support",  angle:  130, side: "left",  note: "ไฟใหญ่ · ปิดดีลเก่ง · ระวังลาออกเร็ว" },
  { id: "r3", name: "ผู้สมัคร C", stemZh: "甲", element: "Wood",  relationship: "ตำแหน่ง · Designer", tier: "A",  bucket: "support",  angle:  235, side: "left",  note: "ไม้ใหญ่ · มีโครงสร้าง · ทดลองงานก่อนรับเต็ม" },
  { id: "r4", name: "ผู้สมัคร D", stemZh: "壬", element: "Water", relationship: "ตำแหน่ง · Engineer", tier: "B",  bucket: "bridge",   angle:  330, side: "right", note: "น้ำใหญ่ · ทักษะสูง · ต้องคู่กับคนยึดเหนี่ยว" },
  { id: "r5", name: "ผู้สมัคร E", stemZh: "庚", element: "Metal", relationship: "ตำแหน่ง · Manager", tier: "F",  bucket: "friction", angle:   80, side: "right", note: "ทองใหญ่ · กดทับ DM · ไม่แนะนำให้รายงานตรง" },
  { id: "r6", name: "ผู้สมัคร F", stemZh: "辛", element: "Metal", relationship: "ตำแหน่ง · Analyst",  tier: "F",  bucket: "friction", angle:  200, side: "left",  note: "ทองอ่อน · ดี analytic · แต่บุคลิกขัด · พิจารณาทีมข้างเคียง" },
];

// ─────────────────────────────────────────────────────────────────────
export const DATASETS: Record<Mode, ModeDataset> = {
  personal: {
    label: "ส่วนตัว",
    labelZh: "個人",
    meZh: "我",
    meSub: "DM 己 · ตัวคุณ",
    nodes: PERSONAL_NODES,
  },
  team: {
    label: "ทีม",
    labelZh: "團隊",
    meZh: "司",
    meSub: "ทีมคุณ · 8 คน",
    nodes: TEAM_NODES,
  },
  recruit: {
    label: "รับสมัคร",
    labelZh: "招募",
    meZh: "募",
    meSub: "ผู้สมัคร · 6 คน",
    nodes: RECRUIT_NODES,
  },
};

export const ME = {
  dmZh: "己",
  dmEn: "Yin Earth",
  yongshen: ["Earth", "Fire", "Wood"] as ElementCode[],
};

// ─────────────────────────────────────────────────────────────────────
// Element palette helper — uses globals.css chart tokens
export const ELEM: Record<
  ElementCode,
  { color: string; subTh: string; zh: string }
> = {
  Wood:  { color: "var(--chart-1)", subTh: "ไม้",  zh: "木" },
  Fire:  { color: "var(--chart-2)", subTh: "ไฟ",   zh: "火" },
  Earth: { color: "var(--chart-3)", subTh: "ดิน",  zh: "土" },
  Metal: { color: "var(--chart-4)", subTh: "ทอง",  zh: "金" },
  Water: { color: "var(--chart-5)", subTh: "น้ำ",  zh: "水" },
};

// ─────────────────────────────────────────────────────────────────────
// Geometry constants — used by the SVG chart
export const VIEWBOX = 700;
export const CENTER = VIEWBOX / 2;
export const ORBIT = {
  support:  130,
  bridge:   210,
  friction: 290,
};
export const COMPASS_RADIUS = 330;

// 8 cardinal directions in order, starting north (子) clockwise
export const COMPASS: { angle: number; zh: string; th: string }[] = [
  { angle:   0, zh: "子", th: "เหนือ" },
  { angle:  45, zh: "丑", th: "ตะวันออกเฉียงเหนือ" },
  { angle:  90, zh: "卯", th: "ตะวันออก" },
  { angle: 135, zh: "巳", th: "ตะวันออกเฉียงใต้" },
  { angle: 180, zh: "午", th: "ใต้" },
  { angle: 225, zh: "未", th: "ตะวันตกเฉียงใต้" },
  { angle: 270, zh: "酉", th: "ตะวันตก" },
  { angle: 315, zh: "戌", th: "ตะวันตกเฉียงเหนือ" },
];
