/**
 * 河洛理數 Heluo Astrology Engine · deterministic (no random)
 * Source: 河圖洛書 + Chen Tuan (陳摶) 10th century
 *
 * Input: 4 pillars (year/month/day/hour stem+branch) + current date
 * Output: Pre-Heaven · Post-Heaven · Annual · Monthly hex (1-64)
 */

// 天數 河圖 mapping for stems
const STEM_NUM: Record<string, number> = {
  '甲': 10, '己': 10,  // 土 5+5
  '乙': 9,  '庚': 9,   // 金 4+9 → reduced
  '丙': 8,  '辛': 8,   // 水 1+6 → reduced
  '丁': 7,  '壬': 7,   // 木 3+8 → reduced
  '戊': 5,  '癸': 5,   // 火 2+7 → reduced
};

// 地數 洛書 mapping for branches
const BRANCH_NUM: Record<string, number> = {
  '子': 1, '午': 9,    // N-S water-fire
  '卯': 3, '酉': 7,    // E-W wood-metal
  '丑': 8, '寅': 8,    // NE
  '辰': 4, '巳': 4,    // SE
  '未': 2, '申': 2,    // SW
  '戌': 6, '亥': 6,    // NW
};

// Trigrams (先天 Houtian order for combine)
// 1乾 2兌 3離 4震 5巽 6坎 7艮 8坤
const TRIGRAM_BIN: Record<number, string> = {
  1: '111', 2: '110', 3: '101', 4: '100',
  5: '011', 6: '010', 7: '001', 8: '000',
};
const TRIGRAM_ZH: Record<number, string> = {
  1: '乾', 2: '兌', 3: '離', 4: '震', 5: '巽', 6: '坎', 7: '艮', 8: '坤',
};

// r413b (5 ก.ค. 2026) · fix ชื่อ卦ผิด (ตรวจ exhaustive แล้วผิดครบ 64/64):
// เดิม binaryToHexNum ใช้ parseInt(binary,2)+1 (ลำดับ binary) แต่ HEX_NAMES เป็นลำดับ King Wen
// → ต้อง map binary → เลข King Wen จริงผ่านตาราง KING_WEN (ตรีลักษณ์บน/ล่างตามตำรามาตรฐาน)

const HEX_NAMES: Record<number, string> = {
  1:'乾',2:'坤',3:'屯',4:'蒙',5:'需',6:'訟',7:'師',8:'比',9:'小畜',10:'履',
  11:'泰',12:'否',13:'同人',14:'大有',15:'謙',16:'豫',17:'隨',18:'蠱',19:'臨',20:'觀',
  21:'噬嗑',22:'賁',23:'剝',24:'復',25:'無妄',26:'大畜',27:'頤',28:'大過',29:'坎',30:'離',
  31:'咸',32:'恆',33:'遯',34:'大壯',35:'晉',36:'明夷',37:'家人',38:'睽',39:'蹇',40:'解',
  41:'損',42:'益',43:'夬',44:'姤',45:'萃',46:'升',47:'困',48:'井',49:'革',50:'鼎',
  51:'震',52:'艮',53:'漸',54:'歸妹',55:'豐',56:'旅',57:'巽',58:'兌',59:'渙',60:'節',
  61:'中孚',62:'小過',63:'既濟',64:'未濟',
};

// ตาราง King Wen มาตรฐาน 64 卦 · [เลข King Wen, ตรีลักษณ์บน, ตรีลักษณ์ล่าง]
// ตรีลักษณ์ใช้ index 1乾 2兌 3離 4震 5巽 6坎 7艮 8坤 (ตาม TRIGRAM_ZH ข้างบน)
// อ้างอิงตาราง 8×8 上卦×下卦 ตำรามาตรฐาน (周易 卦序) · เช่น 3屯=坎上震下 · 63既濟=坎上離下 · 64未濟=離上坎下
const KING_WEN_TRIGRAMS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 1, 1],   // 乾 乾上乾下
  [2, 8, 8],   // 坤 坤上坤下
  [3, 6, 4],   // 屯 坎上震下
  [4, 7, 6],   // 蒙 艮上坎下
  [5, 6, 1],   // 需 坎上乾下
  [6, 1, 6],   // 訟 乾上坎下
  [7, 8, 6],   // 師 坤上坎下
  [8, 6, 8],   // 比 坎上坤下
  [9, 5, 1],   // 小畜 巽上乾下
  [10, 1, 2],  // 履 乾上兌下
  [11, 8, 1],  // 泰 坤上乾下
  [12, 1, 8],  // 否 乾上坤下
  [13, 1, 3],  // 同人 乾上離下
  [14, 3, 1],  // 大有 離上乾下
  [15, 8, 7],  // 謙 坤上艮下
  [16, 4, 8],  // 豫 震上坤下
  [17, 2, 4],  // 隨 兌上震下
  [18, 7, 5],  // 蠱 艮上巽下
  [19, 8, 2],  // 臨 坤上兌下
  [20, 5, 8],  // 觀 巽上坤下
  [21, 3, 4],  // 噬嗑 離上震下
  [22, 7, 3],  // 賁 艮上離下
  [23, 7, 8],  // 剝 艮上坤下
  [24, 8, 4],  // 復 坤上震下
  [25, 1, 4],  // 無妄 乾上震下
  [26, 7, 1],  // 大畜 艮上乾下
  [27, 7, 4],  // 頤 艮上震下
  [28, 2, 5],  // 大過 兌上巽下
  [29, 6, 6],  // 坎 坎上坎下
  [30, 3, 3],  // 離 離上離下
  [31, 2, 7],  // 咸 兌上艮下
  [32, 4, 5],  // 恆 震上巽下
  [33, 1, 7],  // 遯 乾上艮下
  [34, 4, 1],  // 大壯 震上乾下
  [35, 3, 8],  // 晉 離上坤下
  [36, 8, 3],  // 明夷 坤上離下
  [37, 5, 3],  // 家人 巽上離下
  [38, 3, 2],  // 睽 離上兌下
  [39, 6, 7],  // 蹇 坎上艮下
  [40, 4, 6],  // 解 震上坎下
  [41, 7, 2],  // 損 艮上兌下
  [42, 5, 4],  // 益 巽上震下
  [43, 2, 1],  // 夬 兌上乾下
  [44, 1, 5],  // 姤 乾上巽下
  [45, 2, 8],  // 萃 兌上坤下
  [46, 8, 5],  // 升 坤上巽下
  [47, 2, 6],  // 困 兌上坎下
  [48, 6, 5],  // 井 坎上巽下
  [49, 2, 3],  // 革 兌上離下
  [50, 3, 5],  // 鼎 離上巽下
  [51, 4, 4],  // 震 震上震下
  [52, 7, 7],  // 艮 艮上艮下
  [53, 5, 7],  // 漸 巽上艮下
  [54, 4, 2],  // 歸妹 震上兌下
  [55, 4, 3],  // 豐 震上離下
  [56, 3, 7],  // 旅 離上艮下
  [57, 5, 5],  // 巽 巽上巽下
  [58, 2, 2],  // 兌 兌上兌下
  [59, 5, 6],  // 渙 巽上坎下
  [60, 6, 2],  // 節 坎上兌下
  [61, 5, 2],  // 中孚 巽上兌下
  [62, 4, 7],  // 小過 震上艮下
  [63, 6, 3],  // 既濟 坎上離下
  [64, 3, 6],  // 未濟 離上坎下
];

// key = binary 6 บิต (upperBin + lowerBin ตาม encoding TRIGRAM_BIN เดิม) → เลข King Wen 1-64
export const KING_WEN: Record<string, number> = {};
for (const [num, up, lo] of KING_WEN_TRIGRAMS) {
  KING_WEN[TRIGRAM_BIN[up] + TRIGRAM_BIN[lo]] = num;
}

// reverse map · binary 3 บิต → trigram index (ใช้ derive ป้ายตรีลักษณ์หลัง flip เส้น)
const BIN_TO_TRIGRAM: Record<string, number> = {};
for (let i = 1; i <= 8; i++) BIN_TO_TRIGRAM[TRIGRAM_BIN[i]] = i;

// Convert binary string → hex_num (1-64) · King Wen order (ตรงกับ HEX_NAMES) · deterministic
function binaryToHexNum(upper: string, lower: string): number {
  const full = upper + lower;
  // fallback parseInt เดิมเฉพาะกรณี input ผิดรูป (ปกติเกิดไม่ได้ · ทุก combination 64 ตัวมีใน KING_WEN)
  return KING_WEN[full] ?? (parseInt(full, 2) + 1);
}

export type HeluoResult = {
  pre_heaven: { hex: number; name: string; upper: string; lower: string; changing_line: number };
  post_heaven: { hex: number; name: string; upper: string; lower: string };
  annual: { hex: number; name: string; year: number; chinese_age: number; line: number };
  monthly: { hex: number; name: string; month: number; line: number };
  numbers: { heavenly: number; earthly: number; stem_nums: number[]; branch_nums: number[] };
};

export function calcHeluo(
  pillars: { year: {stem:string;branch:string}; month: {stem:string;branch:string};
             day: {stem:string;branch:string}; hour: {stem:string;branch:string} },
  birthYear: number,
  currentDate: Date = new Date()
): HeluoResult {
  // Step 1: numbers
  const stems = ['year','month','day','hour'].map(k => (pillars as any)[k].stem);
  const branches = ['year','month','day','hour'].map(k => (pillars as any)[k].branch);
  const stemNums = stems.map(s => STEM_NUM[s] || 0);
  const branchNums = branches.map(b => BRANCH_NUM[b] || 0);

  const heavenly = stemNums.reduce((a, b) => a + b, 0);
  const earthly = branchNums.reduce((a, b) => a + b, 0);

  // Step 2: Pre-Heaven hex
  const upperTrig = ((heavenly - 1) % 8) + 1;  // 1-8
  const lowerTrig = ((earthly - 1) % 8) + 1;
  const upperBin = TRIGRAM_BIN[upperTrig];
  const lowerBin = TRIGRAM_BIN[lowerTrig];
  const preHex = binaryToHexNum(upperBin, lowerBin);
  const preChangingLine = ((heavenly + earthly - 1) % 6) + 1;

  // Step 3: Post-Heaven hex (flip changing line)
  const fullBin = (upperBin + lowerBin).split('');
  const flipIdx = 6 - preChangingLine;  // line 1 = bottom (idx 5)
  fullBin[flipIdx] = fullBin[flipIdx] === '1' ? '0' : '1';
  const postUpper = fullBin.slice(0, 3).join('');
  const postLower = fullBin.slice(3, 6).join('');
  const postHex = binaryToHexNum(postUpper, postLower);

  // Step 4: Annual hex (ตามอายุจีน · 1 hex = 6 ปี)
  const chineseAge = currentDate.getFullYear() - birthYear + 1;
  // Use Pre-Heaven hex line that contains current age
  const annualLineInPre = ((chineseAge - 1) % 6) + 1;
  // Each age range gets a derived annual hex (rotate based on age block)
  const ageBlock = Math.floor((chineseAge - 1) / 6);
  const annualUpperBin = TRIGRAM_BIN[((upperTrig - 1 + ageBlock) % 8) + 1];
  const annualLowerBin = TRIGRAM_BIN[((lowerTrig - 1 + ageBlock) % 8) + 1];
  const annualHex = binaryToHexNum(annualUpperBin, annualLowerBin);

  // Step 5: Monthly hex (ตามเดือนจีน 1-12)
  const month = currentDate.getMonth() + 1;
  const monthLine = ((month - 1) % 6) + 1;
  const monthBlock = Math.floor((month - 1) / 2);
  const monthlyUpperBin = TRIGRAM_BIN[((upperTrig - 1 + monthBlock + chineseAge) % 8) + 1];
  const monthlyLowerBin = TRIGRAM_BIN[((lowerTrig - 1 + monthBlock) % 8) + 1];
  const monthlyHex = binaryToHexNum(monthlyUpperBin, monthlyLowerBin);

  return {
    pre_heaven: {
      hex: preHex, name: HEX_NAMES[preHex] || '?',
      upper: TRIGRAM_ZH[upperTrig], lower: TRIGRAM_ZH[lowerTrig],
      changing_line: preChangingLine,
    },
    post_heaven: {
      hex: postHex, name: HEX_NAMES[postHex] || '?',
      // r413b: derive ตรีลักษณ์จาก binary หลัง flip เส้นจริง (เดิม ((x-1)%8)+1 = no-op ไม่สะท้อน flip)
      upper: TRIGRAM_ZH[BIN_TO_TRIGRAM[postUpper]] || '?', lower: TRIGRAM_ZH[BIN_TO_TRIGRAM[postLower]] || '?',
    },
    annual: {
      hex: annualHex, name: HEX_NAMES[annualHex] || '?',
      year: currentDate.getFullYear(), chinese_age: chineseAge, line: annualLineInPre,
    },
    monthly: {
      hex: monthlyHex, name: HEX_NAMES[monthlyHex] || '?',
      month, line: monthLine,
    },
    numbers: { heavenly, earthly, stem_nums: stemNums, branch_nums: branchNums },
  };
}
