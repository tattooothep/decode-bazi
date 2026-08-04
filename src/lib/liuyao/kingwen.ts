/**
 * เลขกว้าตามลำดับโจวอี้ 1-64 (King Wen) — 2 ส.ค. 2569
 *
 * ── ปัญหาที่ไฟล์นี้แก้ ────────────────────────────────────────
 * ท่อลิ่วเหยาส่งออกแค่ชื่อกว้ากับเลขฐานสอง ไม่มีเลขกว้าเลย
 * แต่คลังคำอธิบายเชิงลึก (/api/akg/hex-deep) รับเฉพาะเลข 1-64
 * ผลคือปุ่ม "เปิดคัมภีร์เต็ม" กดไม่ได้มาตลอด
 *
 * 🔴 กับดักที่เกือบพลาด — najia64.json มีช่อง position อยู่แล้ว
 * แต่นั่นคือ "ลำดับในวัง 1-8" (乾為天=1 天風姤=2 天山遯=3 …) ไม่ใช่เลขกว้า
 * ตรวจแล้วมีค่า 1-8 ค่าละ 8 ครั้งพอดี ใครหยิบไปใช้เป็นเลขกว้าคือทำนายผิดทั้งใบ
 *
 * ── ทำไมถึงไม่พิมพ์ตาราง 64 ตัวลงไปตรงๆ ───────────────────────
 * ตารางที่มนุษย์พิมพ์เอง สลับกันสองช่องแล้วไม่มีใครรู้ จนกว่าจะมีคนทักว่าทำนายผิด
 * ไฟล์นี้จึงให้เครื่องจับคู่เอง จากของที่มีอยู่แล้วสองชุดในเครื่อง
 * แล้วมีด่านกันพลาดสามชั้น ผิดเมื่อไรคือพังตั้งแต่ตอนสร้าง ไม่หลุดถึงผู้ใช้
 *   ① ชื่อกว้าเต็มต้องเข้าคู่กับชื่อสั้นได้ "ตัวเดียวเท่านั้น" กำกวมเมื่อไรโยนทิ้ง
 *   ② ต้องได้ครบ 64 ใบ ขาดใบเดียวก็โยนทิ้ง
 *   ③ เลขที่ได้เรียงแล้วต้องเท่ากับ 1..64 พอดี ซ้ำหรือขาดก็โยนทิ้ง
 *
 * ยิงจริงแล้วผ่าน 64/64 ไม่มีคู่กำกวมเลยแม้แต่คู่เดียว
 * สุ่มตรวจ: 111111→1乾為天 · 000000→2坤為地 · 100010→3水雷屯 · 010111→6天水訟
 */
import najiaRaw from "./data/najia64.json";

/** ชื่อกว้าสั้น 64 ใบตามลำดับโจวอี้ — ย้ายมาจาก /api/akg/hex-deep เพื่อให้มีที่เดียว */
export const HEX_NAMES: Record<number, string> = {
  1: "乾", 2: "坤", 3: "屯", 4: "蒙", 5: "需", 6: "訟", 7: "師", 8: "比",
  9: "小畜", 10: "履", 11: "泰", 12: "否", 13: "同人", 14: "大有", 15: "謙", 16: "豫",
  17: "隨", 18: "蠱", 19: "臨", 20: "觀", 21: "噬嗑", 22: "賁", 23: "剝", 24: "復",
  25: "無妄", 26: "大畜", 27: "頤", 28: "大過", 29: "坎", 30: "離", 31: "咸", 32: "恆",
  33: "遯", 34: "大壯", 35: "晉", 36: "明夷", 37: "家人", 38: "睽", 39: "蹇", 40: "解",
  41: "損", 42: "益", 43: "夬", 44: "姤", 45: "萃", 46: "升", 47: "困", 48: "井",
  49: "革", 50: "鼎", 51: "震", 52: "艮", 53: "漸", 54: "歸妹", 55: "豐", 56: "旅",
  57: "巽", 58: "兌", 59: "渙", 60: "節", 61: "中孚", 62: "小過", 63: "既濟", 64: "未濟",
};

/**
 * ตัวเขียนที่ตำราสองเล่มใช้ต่างกัน — ไม่ใช่คนละกว้า เป็นตัวเดียวกันคนละรูป
 * 遯 กับ 遁 (กว้าที่ 33) เจอจริงในคลังเรา ที่เหลือใส่กันไว้เผื่อคลังเปลี่ยนรูปตัวอักษร
 */
const NAME_VARIANTS: Record<string, string[]> = {
  "遯": ["遁"],
  "無妄": ["无妄"],
  "賁": ["贲"],
  "歸妹": ["归妹"],
  "既濟": ["既济"],
  "未濟": ["未济"],
};

function buildKingWenByBinary(): Record<string, number> {
  const rows = najiaRaw as Array<{ binary: string; name_zh: string }>;
  const result: Record<string, number> = {};
  const claimedBy: Record<number, string> = {};

  for (const row of rows) {
    const matches: number[] = [];
    for (const [numberText, shortName] of Object.entries(HEX_NAMES)) {
      const candidates = [shortName, ...(NAME_VARIANTS[shortName] ?? [])];
      if (candidates.some((candidate) => row.name_zh.includes(candidate))) {
        matches.push(Number(numberText));
      }
    }

    // ด่าน ① กำกวมคือหยุด ไม่เดาให้ตัวไหนตัวหนึ่ง
    if (matches.length !== 1) {
      throw new Error(
        `เลขกว้า: ชื่อ "${row.name_zh}" เข้าคู่ได้ ${matches.length} ใบ (${matches.join(",")}) — ต้องเข้าคู่ได้ใบเดียวเท่านั้น`,
      );
    }
    const hexNumber = matches[0];
    if (claimedBy[hexNumber]) {
      throw new Error(
        `เลขกว้า: เลข ${hexNumber} ถูกใช้ซ้ำโดย "${claimedBy[hexNumber]}" และ "${row.name_zh}"`,
      );
    }
    claimedBy[hexNumber] = row.name_zh;
    result[row.binary] = hexNumber;
  }

  // ด่าน ② ครบ 64 ใบ
  const total = Object.keys(result).length;
  if (total !== 64) {
    throw new Error(`เลขกว้า: จับคู่ได้ ${total} ใบ ต้องได้ 64 ใบพอดี`);
  }

  // ด่าน ③ เรียงแล้วต้องเท่ากับ 1..64 ไม่ขาดไม่เกิน
  const sorted = Object.values(result).sort((a, b) => a - b);
  for (let index = 0; index < 64; index += 1) {
    if (sorted[index] !== index + 1) {
      throw new Error(
        `เลขกว้า: ลำดับไม่ครบ 1..64 — ช่องที่ ${index + 1} ได้ ${sorted[index]}`,
      );
    }
  }

  return result;
}

const KINGWEN_BY_BINARY = buildKingWenByBinary();

/** แปลงเลขฐานสองหกเส้น (อ่านจากเส้นล่างขึ้นบน) เป็นเลขกว้า 1-64 */
export function kingWenNumberOf(binary: string): number {
  const hexNumber = KINGWEN_BY_BINARY[binary];
  if (!hexNumber) {
    throw new Error(`เลขกว้า: ไม่รู้จักผังเส้น "${binary}"`);
  }
  return hexNumber;
}
