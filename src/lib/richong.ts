/**
 * 沖煞 รายวัน · "วันนี้ชงราศี/อายุ" · 29 มิ.ย. 2026
 * 日支 六沖 → 生肖ที่ถูกชง + ปีเกิด/อายุ (虛歲) ของ生肖นั้น
 * ใช้ในหน้าวางฤกษ์ · standalone (ไม่ต้องเลือกคนก็เห็น) · อ่านประกอบ ไม่เข้าคะแนนรวม
 * pure function · verify: 2026=ม้า · 戌日沖辰(มังกร)
 */

const BRANCHES = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
const ZODIAC_TH = ["หนู", "วัว", "เสือ", "กระต่าย", "มังกร", "งู", "ม้า", "แพะ", "ลิง", "ไก่", "หมา", "หมู"];
const ZODIAC_EN = ["Rat", "Ox", "Tiger", "Rabbit", "Dragon", "Snake", "Horse", "Goat", "Monkey", "Rooster", "Dog", "Pig"];
const ZODIAC_ZH = ["鼠", "牛", "虎", "兔", "龍", "蛇", "馬", "羊", "猴", "雞", "狗", "豬"];

/** ปี ค.ศ. → index กิ่งปีนักษัตร (子=0) · 甲子 = ค.ศ.4 */
function yearToBranchIndex(year: number): number {
  return (((year - 4) % 12) + 12) % 12;
}

export type RiChong = {
  clash_branch_zh: string;   // 地支ที่ชง (เช่น 辰)
  zodiac_th: string;         // มังกร
  zodiac_en: string;
  zodiac_zh: string;         // 龍
  birth_years: number[];     // ปีเกิดของ生肖นี้ (ใหม่→เก่า)
  ages: number[];            // อายุ (虛歲) สอดคล้องกับ birth_years
};

/** สิ่งที่ชงในวันนั้น · day_pillar branch + ปีอ้างอิง (ค.ศ.) */
export function riChongDay(dayBranch: string, refYear: number): RiChong | null {
  const di = BRANCHES.indexOf(dayBranch);
  if (di < 0) return null;
  const clashIdx = (di + 6) % 12; // 六沖 = กิ่งตรงข้าม
  const birth_years: number[] = [];
  const ages: number[] = [];
  for (let y = refYear; y >= refYear - 96 && birth_years.length < 8; y--) {
    if (yearToBranchIndex(y) === clashIdx) {
      birth_years.push(y);
      ages.push(refYear - y + 1); // 虛歲 (นับปีเกิด = 1)
    }
  }
  return {
    clash_branch_zh: BRANCHES[clashIdx],
    zodiac_th: ZODIAC_TH[clashIdx],
    zodiac_en: ZODIAC_EN[clashIdx],
    zodiac_zh: ZODIAC_ZH[clashIdx],
    birth_years,
    ages,
  };
}
