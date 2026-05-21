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

// 64 hex · King Wen order · index by binary "upper+lower" (6 bits · top=line6, bottom=line1)
// derived from Sequence of Earlier Heaven · use trigram_idx + trigram_idx formula
// generic formula · parseInt(binary,2)+1 = 1-64 (not King Wen · but deterministic)

const HEX_NAMES: Record<number, string> = {
  1:'乾',2:'坤',3:'屯',4:'蒙',5:'需',6:'訟',7:'師',8:'比',9:'小畜',10:'履',
  11:'泰',12:'否',13:'同人',14:'大有',15:'謙',16:'豫',17:'隨',18:'蠱',19:'臨',20:'觀',
  21:'噬嗑',22:'賁',23:'剝',24:'復',25:'無妄',26:'大畜',27:'頤',28:'大過',29:'坎',30:'離',
  31:'咸',32:'恆',33:'遯',34:'大壯',35:'晉',36:'明夷',37:'家人',38:'睽',39:'蹇',40:'解',
  41:'損',42:'益',43:'夬',44:'姤',45:'萃',46:'升',47:'困',48:'井',49:'革',50:'鼎',
  51:'震',52:'艮',53:'漸',54:'歸妹',55:'豐',56:'旅',57:'巽',58:'兌',59:'渙',60:'節',
  61:'中孚',62:'小過',63:'既濟',64:'未濟',
};

// Convert binary string → hex_num (1-64) · deterministic
function binaryToHexNum(upper: string, lower: string): number {
  const full = upper + lower;
  return parseInt(full, 2) + 1;
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
      upper: TRIGRAM_ZH[((upperTrig - 1) % 8) + 1], lower: TRIGRAM_ZH[((lowerTrig - 1) % 8) + 1],
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
