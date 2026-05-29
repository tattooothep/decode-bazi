/* 六親 Event-Level Forecast (Gap 4)
   อ้าง: 三命通會·卷七 論六親 (六親總篇/論父母妻子) + 淵海子平·喜忌篇
   อ่าน timeline ของดาวญาติ (พ่อ/แม่/คู่/ลูก/พี่น้อง) × LiuNian
   ไม่ใช่ engine ตัดสิน · เป็น evidence layer
*/

type PillarKey = "year" | "month" | "day" | "hour";

export type RelativeEvent = {
  year: number;
  relativeZh: string;          // 配偶/父/母/子女/兄弟姊妹
  relativeTh: string;
  starsZh: string[];           // ดาวที่แทนญาติ (正財/偏財/正印 ฯลฯ)
  eventType: "clash_palace" | "clash_star" | "combine_palace" | "combine_star" | "void";
  eventTh: string;             // คำอธิบายภาษาไทย
  triggerBranch: string;       // กิ่งปีจรที่เป็น trigger
  sourceRuleIds: string[];
};

const SIX_CLASHES: Record<string, string> = {
  子: "午", 午: "子", 丑: "未", 未: "丑", 寅: "申", 申: "寅",
  卯: "酉", 酉: "卯", 辰: "戌", 戌: "辰", 巳: "亥", 亥: "巳",
};

const SIX_COMBINES: Record<string, string> = {
  子: "丑", 丑: "子", 寅: "亥", 亥: "寅", 卯: "戌", 戌: "卯",
  辰: "酉", 酉: "辰", 巳: "申", 申: "巳", 午: "未", 未: "午",
};

const RELATIVE_PALACE: Record<string, PillarKey> = {
  配偶: "day",     // 日支 = เรือนคู่
  父: "month",     // 月支 = เรือนพ่อแม่/พี่น้อง
  母: "month",
  兄弟姊妹: "month",
  子女: "hour",   // 時支 = เรือนลูก
};

const RELATIVE_TH: Record<string, string> = {
  配偶: "คู่ครอง", 父: "พ่อ", 母: "แม่", 兄弟姊妹: "พี่น้อง", 子女: "ลูก",
};

type Pillars = Record<PillarKey, { stem: string; branch: string } | null>;

export type SixRelativeItem = {
  relativeZh: string;
  starsZh: string[];
  element?: string;
  foundAt?: string[];
};

export type LuckYearItem = { year: number; branch: string };

/**
 * คำนวณ event timeline ของ 六親 ตามปีจร
 * @param pillars ผัง 4 เสา
 * @param sixRelatives รายการดาวญาติ (จาก buildSixRelatives)
 * @param yearTimeline list ปีจร {year, branch}
 * @param maxYears cap จำนวนปีที่ scan (default 10)
 */
export function buildSixRelativesEvents(
  pillars: Pillars,
  sixRelatives: SixRelativeItem[],
  yearTimeline: LuckYearItem[],
  maxYears: number = 10,
): RelativeEvent[] {
  const events: RelativeEvent[] = [];
  if (!sixRelatives.length || !yearTimeline.length) return events;

  // สแกนเฉพาะ window ที่ใกล้ปัจจุบัน (cap = maxYears)
  const scan = yearTimeline.slice(0, maxYears);

  for (const rel of sixRelatives) {
    const palaceKey = RELATIVE_PALACE[rel.relativeZh];
    const palaceBranch = palaceKey ? pillars[palaceKey]?.branch || "" : "";
    const relTh = RELATIVE_TH[rel.relativeZh] || rel.relativeZh;

    for (const yr of scan) {
      // (1) ปีจรชนเรือนญาติ
      if (palaceBranch && SIX_CLASHES[yr.branch] === palaceBranch) {
        events.push({
          year: yr.year,
          relativeZh: rel.relativeZh, relativeTh: relTh, starsZh: rel.starsZh,
          eventType: "clash_palace",
          eventTh: `ปี ${yr.year} (${yr.branch}) ชนเรือน${relTh} (${palaceBranch}) → ระวังเรื่อง${relTh} เปลี่ยนแปลง/แยก/กระทบสุขภาพ`,
          triggerBranch: yr.branch,
          sourceRuleIds: ["SMTG-Vol7", "YHZP-XJP", "HK-RELATIVE-EVENT-001"],
        });
      }
      // (2) ปีจรฮะเรือนญาติ
      if (palaceBranch && SIX_COMBINES[yr.branch] === palaceBranch) {
        events.push({
          year: yr.year,
          relativeZh: rel.relativeZh, relativeTh: relTh, starsZh: rel.starsZh,
          eventType: "combine_palace",
          eventTh: `ปี ${yr.year} (${yr.branch}) ฮะเรือน${relTh} (${palaceBranch}) → เรื่อง${relTh}ใกล้ชิด/ผูกพัน/ตัดสินใจร่วม`,
          triggerBranch: yr.branch,
          sourceRuleIds: ["SMTG-Vol7", "YHZP-XJP", "HK-RELATIVE-EVENT-002"],
        });
      }
      // (3) ถ้า relative ไม่ปรากฏในผังเลย (foundAt=[]) + ปีจรนำดาว relative มา → flag
      if (rel.foundAt && rel.foundAt.length === 0) {
        // skip — แค่ไม่ flag เพิ่ม เพราะไม่มีตำราตรง
      }
    }
  }

  // dedupe by year+relative+eventType + sort by year asc
  const seen = new Set<string>();
  const dedup: RelativeEvent[] = [];
  for (const e of events) {
    const key = `${e.year}|${e.relativeZh}|${e.eventType}`;
    if (seen.has(key)) continue;
    seen.add(key); dedup.push(e);
  }
  dedup.sort((a, b) => a.year - b.year);
  return dedup;
}
