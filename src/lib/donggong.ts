/**
 * 董公擇日 (Dong Gong Date Selection) · 29 มิ.ย. 2026
 * ชั้นพื้นบ้าน สาย 建除黃黑道 — ตำรา 董公選要覽 (NLC scan tier-1)
 * lookup: (月建·建除位·日干支) → ดี/ร้าย + 宜/忌 + 神煞 (干支เฉพาะชนะ base)
 * ✅ display-only · pure function · ไม่แตะ score/modules/ranking ของศาสตร์อื่น (เติมของ)
 * ✅ ไทยนำ จีนรอง — ให้คนทั่วไปอ่านได้ (yiPairs/jiPairs/shenshaPairs = {th, zh})
 */
import { DG_DAY, DG_EXC } from "@/lib/donggong-data";

const MONTH_IDX: Record<string, number> = {
  寅: 1, 卯: 2, 辰: 3, 巳: 4, 午: 5, 未: 6, 申: 7, 酉: 8, 戌: 9, 亥: 10, 子: 11, 丑: 12,
};

export type DGLevel = "top" | "good" | "neutral" | "bad";
export type DGPair = { th: string; zh: string };
export type DongGong = {
  monthIdx: number;
  jianchu: string;            // 建除位 (จีน)
  jianchuTh: string;          // 建除位 (ไทย)
  verdict: string;            // ผลสุทธิ (干支 override base ถ้ามี · จีน)
  verdictTh: string;          // ผลสุทธิ (ไทย)
  base: string;
  fromException: boolean;
  level: DGLevel;
  shensha: string[];          // ดาวประจำวัน (จีน · ดิบ)
  yi: string[]; ji: string[]; // 宜/忌 (จีน · ดิบ)
  shenshaPairs: DGPair[];     // ดาว (ไทย+จีน)
  yiPairs: DGPair[];          // ทำได้ (ไทย+จีน)
  jiPairs: DGPair[];          // ห้าม (ไทย+จีน)
  note: string;
  missing: boolean;
  th: string; en: string; zh: string;   // label สั้น (th=ไทยนำ)
};

const TOP = new Set(["上吉", "全吉", "大吉"]);
const GOOD = new Set(["吉", "次吉"]);
const BAD = new Set(["凶", "大凶", "不利"]);
function levelOf(v: string): DGLevel {
  if (TOP.has(v)) return "top";
  if (GOOD.has(v)) return "good";
  if (BAD.has(v)) return "bad";
  return "neutral";
}

const JC_TH: Record<string, string> = { 建: "ก่อตั้ง", 除: "กำจัด", 滿: "เต็ม", 平: "ราบเรียบ", 定: "มั่นคง", 執: "ยึดกุม", 破: "ทลาย", 危: "เสี่ยงภัย", 成: "สำเร็จ", 收: "เก็บเกี่ยว", 開: "เปิด", 閉: "ปิด" };
const JC_EN: Record<string, string> = { 建: "Establish", 除: "Remove", 滿: "Full", 平: "Balance", 定: "Stable", 執: "Initiate", 破: "Destruction", 危: "Danger", 成: "Success", 收: "Harvest", 開: "Open", 閉: "Close" };
const V_TH: Record<string, string> = { "上吉": "ดีเยี่ยม", "全吉": "ดีล้วน", "大吉": "ดีมาก", "吉": "ดี", "次吉": "ดีรอง", "凶": "ร้าย", "大凶": "ร้ายมาก", "不利": "ไม่ดี", "—": "ขึ้นกับวัน" };
const V_EN: Record<string, string> = { "上吉": "Excellent", "全吉": "All-auspicious", "大吉": "Very good", "吉": "Good", "次吉": "Fairly good", "凶": "Inauspicious", "大凶": "Very bad", "不利": "Unfavorable", "—": "Depends on day" };

/* 宜/忌 กิจกรรม → ไทย (ถ้าไม่มี = แสดงจีน) */
const ACT_TH: Record<string, string> = {
  造: "สร้าง", 起造: "สร้างบ้าน", 修造: "ซ่อมสร้าง", 修方: "ซ่อมทิศ", 小修: "ซ่อมเล็ก", 偷修: "ซ่อมเงียบ", 興工: "เริ่มงานก่อสร้าง", 動土: "ขุดดิน/ลงเข็ม", 定磉: "วางฐานเสา", 拴架: "ตั้งโครง", 栓架: "ตั้งโครง", 伐木: "ตัดไม้", 上樑: "ยกขื่อ", 笠柱: "ตั้งเสา",
  娶: "แต่งฝ่ายชาย", 娶親: "แต่งงาน", 嫁: "ออกเรือน", 嫁娶: "แต่งงาน", 婚姻: "แต่งงาน", 納采: "สู่ขอ", 納彩: "สู่ขอ", 會親: "พบญาติคู่",
  入宅: "ขึ้นบ้านใหม่", 移居: "ย้ายเข้าอยู่", 移徙: "ย้ายบ้าน",
  開市: "เปิดร้าน", 開張: "เปิดกิจการ", 商買: "ค้าขาย", 立約: "ทำสัญญา", 造倉庫: "สร้างคลัง", 倉庫: "คลังสินค้า",
  出行: "ออกเดินทาง", 遠行: "เดินทางไกล", 參官見貴: "เข้าพบผู้ใหญ่", 上學: "เข้าเรียน", 入學: "เข้าเรียน",
  安葬: "ฝังศพ", 葬: "ฝังศพ", 埋葬: "ฝังศพ", 開山: "เปิดหน้าดินสุสาน", 斬草: "ถางหญ้าสุสาน", 開山斬草: "เปิดหน้าดิน-ถางหญ้า", 請魂入墓: "เชิญวิญญาณเข้าสุสาน", 破土: "เปิดหลุม",
  生基: "ทำฮวงซุ้ยเป็น", 做生基: "ทำฮวงซุ้ยเป็น", 作生基: "ทำฮวงซุ้ยเป็น", 合板: "ต่อโลงไม้", 掘樹: "ขุดต้นไม้", 營為: "ลงมือการงาน", 營謀百事: "วางแผนทุกเรื่อง",
  栽種: "เพาะปลูก", 娛親: "เลี้ยงฉลองญาติ", 還福願: "แก้บน",
  百事: "ทุกการงาน", 百事皆忌: "ห้ามทุกการงาน", 諸事: "ทุกเรื่อง", 諸事不宜: "ไม่เหมาะทุกเรื่อง", 用事: "ลงมือการงาน", 大用: "งานใหญ่", 小用: "งานเล็ก", 小作: "งานเล็ก", 大事: "เรื่องใหญ่", 小小營為: "งานเล็กน้อย", 大工開張: "งานใหญ่เปิดกิจการ",
  鼓樂喧嘩: "งานรื่นเริงเสียงดัง", 釘丁: "ตอกตะปู/ลงเข็ม", 修: "ซ่อมแซม", 動神煞: "กระทบเทพอาถรรพ์", 安葬營為: "งานฝังศพ",
};
/* 神煞 → ไทย (ถ้าไม่มี = แสดงจีน) */
const SHEN_TH: Record<string, string> = {
  天德: "คุณธรรมฟ้า", 月德: "คุณธรรมเดือน", 天月二德: "คุณธรรมฟ้า-เดือน", 天德合: "คุณธรรมฟ้าร่วม", 天喜: "มงคลยินดี", 天富: "ทรัพย์ฟ้า", 福生: "เกิดบุญ", 文昌: "ปัญญา", 庫樓: "คลังทรัพย์", 黃羅: "ม่านทอง", 紫檀: "จันทน์ม่วง", 天皇: "เง็กอ๋อง", 駕馬御星: "ทรงม้าควบดาว", 文章貴顯: "วาสนาวิชา", 聯珠星: "ดาวเรียงไข่มุก", 天成: "สำเร็จฟ้า",
  天羅: "ตาข่ายฟ้า", 地網: "ตาข่ายดิน", 朱雀: "หงส์แดง", 勾絞: "เกี่ยวรัด", 小紅沙: "ทรายแดงเล็ก", 紅沙: "ทรายแดง", 黃沙: "ทรายเหลือง", 天賊: "โจรฟ้า", 白虎: "เสือขาว", 騰蛇: "งูเหิน", 玄武: "เต่าดำ", 天牢: "คุกฟ้า", 月厭: "เบื่อเดือน", 天罡: "ดาวเทียนกัง", 到州: "เต้าโจว", 到州星: "เต้าโจว", 土瘟: "โรคดิน", 火星: "ดาวไฟ", 天地轉煞: "แปรอาถรรพ์ฟ้าดิน", 九土鬼: "ผีดินเก้า", 正四廢: "สี่สิ้นกำลัง", 往亡: "ไปไม่กลับ", 受死: "รับมรณะ", 瘟疫: "โรคระบาด",
};
const pair = (zh: string, map: Record<string, string>): DGPair => ({ th: map[zh] || zh, zh });

/** lookup 董公 จากกิ่งเดือน(月建) + กิ่งวัน(日支) + 干支วัน */
export function dongGong(monthBranch: string, dayBranch: string, dayGanzhi: string): DongGong | null {
  const monthIdx = MONTH_IDX[monthBranch];
  if (!monthIdx || !dayBranch) return null;
  const d = DG_DAY[`${monthIdx}|${dayBranch}`];
  if (!d) return null;
  const e = dayGanzhi ? DG_EXC[`${monthIdx}|${dayGanzhi}`] : undefined;
  const base = d.verdict || "—";
  const verdict = (e && e.verdict) ? e.verdict : base;
  const note = (e && e.note) ? e.note : d.note;
  const level = levelOf(verdict);
  const jcTh = JC_TH[d.pos] || d.pos;
  const verdictTh = V_TH[verdict] || verdict;
  return {
    monthIdx, jianchu: d.pos, jianchuTh: jcTh, verdict, verdictTh, base, fromException: !!(e && e.verdict),
    level, shensha: d.shensha, yi: d.yi, ji: d.ji,
    shenshaPairs: d.shensha.map((z) => pair(z, SHEN_TH)),
    yiPairs: d.yi.map((z) => pair(z, ACT_TH)),
    jiPairs: d.ji.map((z) => pair(z, ACT_TH)),
    note, missing: d.missing,
    th: `${verdictTh} · ${jcTh}`,
    en: `${V_EN[verdict] || verdict} · ${JC_EN[d.pos] || d.pos}`,
    zh: `${verdict} · ${d.pos}日`,
  };
}
