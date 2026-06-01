/**
 * chart-table.ts · helpers สำหรับ §02 Four Pillars table (Joey Yap-style)
 *
 * Codex direction: extract local logic · no DB queries on /api/chart hot path.
 * Source of truth ของ tables ทั้งหมด: data/hourkey-v3/hourkey-na-yin-60.json
 * + คลาสสิก formulas ที่ใช้ใน /chart-v2/load-profile.ts (locked · ไม่แตะ).
 */

import naYinData from "../../data/hourkey-v3/hourkey-na-yin-60.json";

export type Pillar = { stem: string; branch: string };
export type Pillars = { year: Pillar; month: Pillar; day: Pillar; hour: Pillar | null };

/* 19 พ.ค. Option α · active position helper (4p path byte-equal · 3p filters hour) */
const _ACTIVE_4P: (keyof Pillars)[] = ["year", "month", "day", "hour"];
function _activeKeys(p: Pillars): (keyof Pillars)[] {
  return _ACTIVE_4P.filter(k => p[k] != null);
}

const STEMS_ALL = ["甲","乙","丙","丁","戊","己","庚","辛","壬","癸"];
const BRANCHES_ALL = ["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"];

const STEM_ANCHOR_MAP: Record<string, { start: string; dir: number }> = {
  甲:{start:"亥",dir:1}, 丙:{start:"寅",dir:1}, 戊:{start:"寅",dir:1},
  庚:{start:"巳",dir:1}, 壬:{start:"申",dir:1},
  乙:{start:"午",dir:-1}, 丁:{start:"酉",dir:-1}, 己:{start:"酉",dir:-1},
  辛:{start:"子",dir:-1}, 癸:{start:"卯",dir:-1},
};
const PHASE_ORDER_12 = ["長生","沐浴","冠帶","臨官","帝旺","衰","病","死","墓","絕","胎","養"];

/* ── Na Yin (60 jiazi · jsondata) ─────────────────────────── */
export function naYinOf(pillar: string): { zh: string; en: string; element: string; symbol: string } | null {
  const d = (naYinData as Record<string, { na_yin: string; en: string; element: string; symbol: string }>)[pillar];
  if (!d) return null;
  return { zh: d.na_yin, en: d.en, element: d.element, symbol: d.symbol };
}

/* ── 12 phases (DM phase · pillar phase · hidden phase) ───── */
export function twelvePhaseOf(stem: string, branch: string): string | null {
  const a = STEM_ANCHOR_MAP[stem]; if (!a) return null;
  const startIdx = BRANCHES_ALL.indexOf(a.start);
  const branchIdx = BRANCHES_ALL.indexOf(branch);
  let offset = (branchIdx - startIdx) * a.dir;
  offset = ((offset % 12) + 12) % 12;
  return PHASE_ORDER_12[offset];
}

/* ── Kong Wang (void branches per xun) ─────────────────────── */
export function kongWangOf(stem: string, branch: string): [string, string] {
  const si = STEMS_ALL.indexOf(stem);
  const bi = BRANCHES_ALL.indexOf(branch);
  const offset = ((bi - si) % 12 + 12) % 12;
  const v1 = BRANCHES_ALL[(offset + 10) % 12];
  const v2 = BRANCHES_ALL[(offset + 11) % 12];
  return [v1, v2];
}

/* ── Hidden stems · main + sub (canonical BaZi table) ─────── */
export const HIDDEN_STEMS: Record<string, string[]> = {
  子:["癸"],
  丑:["己","癸","辛"],
  寅:["甲","丙","戊"],
  卯:["乙"],
  辰:["戊","乙","癸"],
  巳:["丙","戊","庚"],
  午:["丁","己"],
  未:["己","丁","乙"],
  申:["庚","壬","戊"],
  酉:["辛"],
  戌:["戊","辛","丁"],
  亥:["壬","甲"],
};

/* ── 神煞 Special Stars · 21 ดาวคลาสสิก ───────────────────── */
export type StarHit = {
  code: string;
  zh: string;
  th: string;
  polarity: "good" | "bad" | "neutral";
  pillars: ("year"|"month"|"day"|"hour")[];
  anchor?: "YP" | "DP" | "MP" | "DS"; /* Voytek alignment · year-pillar / day-pillar / month-pillar / day-stem */
};

export function detectShenShaStars(pillars: Pillars): StarHit[] {
  const ds = pillars.day.stem, db = pillars.day.branch;
  const yb = pillars.year.branch, mb = pillars.month.branch;

  const T_DS: Record<string, Record<string, string[]>> = {
    tianYi:    {"甲":["丑","未"],"戊":["丑","未"],"庚":["丑","未"],"乙":["申","子"],"己":["申","子"],"丙":["酉","亥"],"丁":["酉","亥"],"辛":["寅","午"],"壬":["卯","巳"],"癸":["卯","巳"]},
    wenChang:  {"甲":["巳"],"乙":["午"],"丙":["申"],"丁":["酉"],"戊":["申"],"己":["酉"],"庚":["亥"],"辛":["子"],"壬":["寅"],"癸":["卯"]},
    luShen:    {"甲":["寅"],"乙":["卯"],"丙":["巳"],"丁":["午"],"戊":["巳"],"己":["午"],"庚":["申"],"辛":["酉"],"壬":["亥"],"癸":["子"]},
    yangRen:   {"甲":["卯"],"乙":["寅"],"丙":["午"],"丁":["巳"],"戊":["午"],"己":["巳"],"庚":["酉"],"辛":["申"],"壬":["子"],"癸":["亥"]},
    hongYan:   {"甲":["午"],"乙":["午"],"丙":["寅"],"丁":["未"],"戊":["辰"],"己":["辰"],"庚":["戌"],"辛":["酉"],"壬":["子"],"癸":["申"]},
    jinYu:     {"甲":["辰"],"乙":["巳"],"丙":["未"],"丁":["申"],"戊":["未"],"己":["申"],"庚":["戌"],"辛":["亥"],"壬":["丑"],"癸":["寅"]},
    xueRen:    {"甲":["酉"],"乙":["戌"],"丙":["子"],"丁":["丑"],"戊":["卯"],"己":["辰"],"庚":["午"],"辛":["未"],"壬":["酉"],"癸":["戌"]},
  };
  /* Trio-based stars: ตำราคลาสสิก check จาก BOTH year-branch (YP) + day-branch (DP) */
  const T_TRIO: Record<string, Record<string, string[]>> = {
    taoHua:    {"寅":["卯"],"午":["卯"],"戌":["卯"],"巳":["午"],"酉":["午"],"丑":["午"],"申":["酉"],"子":["酉"],"辰":["酉"],"亥":["子"],"卯":["子"],"未":["子"]},
    yiMa:      {"寅":["申"],"午":["申"],"戌":["申"],"申":["寅"],"子":["寅"],"辰":["寅"],"巳":["亥"],"酉":["亥"],"丑":["亥"],"亥":["巳"],"卯":["巳"],"未":["巳"]},
    huaGai:    {"寅":["戌"],"午":["戌"],"戌":["戌"],"申":["辰"],"子":["辰"],"辰":["辰"],"巳":["丑"],"酉":["丑"],"丑":["丑"],"亥":["未"],"卯":["未"],"未":["未"]},
    jiangXing: {"寅":["午"],"午":["午"],"戌":["午"],"申":["子"],"子":["子"],"辰":["子"],"巳":["酉"],"酉":["酉"],"丑":["酉"],"亥":["卯"],"卯":["卯"],"未":["卯"]},
    jieSha:    {"寅":["亥"],"午":["亥"],"戌":["亥"],"申":["巳"],"子":["巳"],"辰":["巳"],"巳":["寅"],"酉":["寅"],"丑":["寅"],"亥":["申"],"卯":["申"],"未":["申"]},
    wangShen:  {"寅":["巳"],"午":["巳"],"戌":["巳"],"申":["亥"],"子":["亥"],"辰":["亥"],"巳":["申"],"酉":["申"],"丑":["申"],"亥":["寅"],"卯":["寅"],"未":["寅"]},
  };
  const T_DB: Record<string, Record<string, string[]>> = {};  /* moved to T_TRIO · checked from both YP+DP */
  const T_YB: Record<string, Record<string, string[]>> = {
    hongLuan:  {"子":["卯"],"丑":["寅"],"寅":["丑"],"卯":["子"],"辰":["亥"],"巳":["戌"],"午":["酉"],"未":["申"],"申":["未"],"酉":["午"],"戌":["巳"],"亥":["辰"]},
    tianXi:    {"子":["酉"],"丑":["申"],"寅":["未"],"卯":["午"],"辰":["巳"],"巳":["辰"],"午":["卯"],"未":["寅"],"申":["丑"],"酉":["子"],"戌":["亥"],"亥":["戌"]},
    guChen:    {"寅":["巳"],"卯":["巳"],"辰":["巳"],"巳":["申"],"午":["申"],"未":["申"],"申":["亥"],"酉":["亥"],"戌":["亥"],"亥":["寅"],"子":["寅"],"丑":["寅"]},
    guaSu:     {"寅":["丑"],"卯":["丑"],"辰":["丑"],"巳":["辰"],"午":["辰"],"未":["辰"],"申":["未"],"酉":["未"],"戌":["未"],"亥":["戌"],"子":["戌"],"丑":["戌"]},
    sangMen:   {"子":["寅"],"丑":["卯"],"寅":["辰"],"卯":["巳"],"辰":["午"],"巳":["未"],"午":["申"],"未":["酉"],"申":["戌"],"酉":["亥"],"戌":["子"],"亥":["丑"]},
    diaoKe:    {"子":["戌"],"丑":["亥"],"寅":["子"],"卯":["丑"],"辰":["寅"],"巳":["卯"],"午":["辰"],"未":["巳"],"申":["午"],"酉":["未"],"戌":["申"],"亥":["酉"]},
  };
  const T_MB_STEM: Record<string, Record<string, string[]>> = {
    tianDe: {"寅":["丁"],"卯":["申"],"辰":["壬"],"巳":["辛"],"午":["亥"],"未":["甲"],"申":["癸"],"酉":["寅"],"戌":["丙"],"亥":["乙"],"子":["巳"],"丑":["庚"]},
    yueDe:  {"寅":["丙"],"午":["丙"],"戌":["丙"],"申":["壬"],"子":["壬"],"辰":["壬"],"巳":["庚"],"酉":["庚"],"丑":["庚"],"亥":["甲"],"卯":["甲"],"未":["甲"]},
  };
  /* 天官 TianGuan · day-stem driver · Voytek classical */
  const T_TIANGUAN: Record<string, string[]> = {
    甲:["未"], 乙:["辰"], 丙:["巳"], 丁:["寅"], 戊:["卯"],
    己:["酉"], 庚:["亥"], 辛:["申"], 壬:["戌"], 癸:["午"],
  };
  /* +10 ดาวใหม่ · year-branch driver */
  const T_NEW_YB: Record<string, Record<string, string[]>> = {
    longDe:  {"子":["未"],"丑":["申"],"寅":["酉"],"卯":["戌"],"辰":["亥"],"巳":["子"],"午":["丑"],"未":["寅"],"申":["卯"],"酉":["辰"],"戌":["巳"],"亥":["午"]},
    fuDe:    {"子":["酉"],"丑":["戌"],"寅":["亥"],"卯":["子"],"辰":["丑"],"巳":["寅"],"午":["卯"],"未":["辰"],"申":["巳"],"酉":["午"],"戌":["未"],"亥":["申"]},
    wuGui:   {"子":["辰"],"丑":["巳"],"寅":["午"],"卯":["未"],"辰":["申"],"巳":["酉"],"午":["戌"],"未":["亥"],"申":["子"],"酉":["丑"],"戌":["寅"],"亥":["卯"]},
    gouJiao: {"子":["卯","酉"],"丑":["辰","戌"],"寅":["巳","亥"],"卯":["午","子"],"辰":["未","丑"],"巳":["申","寅"],"午":["酉","卯"],"未":["戌","辰"],"申":["亥","巳"],"酉":["子","午"],"戌":["丑","未"],"亥":["寅","申"]},
    baZuo:   {"子":["申"],"丑":["酉"],"寅":["戌"],"卯":["亥"],"辰":["子"],"巳":["丑"],"午":["寅"],"未":["卯"],"申":["辰"],"酉":["巳"],"戌":["午"],"亥":["未"]},
  };
  /* +ดาวใหม่ · day-stem driver */
  const T_NEW_DS: Record<string, Record<string, string[]>> = {
    tianFu: {"甲":["寅"],"乙":["丑"],"丙":["酉"],"丁":["未"],"戊":["丑"],"己":["申"],"庚":["子"],"辛":["亥"],"壬":["巳"],"癸":["卯"]},
    jieDu:  {"甲":["申"],"乙":["酉"],"丙":["巳"],"丁":["卯"],"戊":["寅"],"己":["子"],"庚":["亥"],"辛":["戌"],"壬":["未"],"癸":["午"]},
  };
  /* 三台 · year-stem driver · 3 consecutive branches */
  const T_SANTAI: Record<string, string[]> = {
    甲:["寅","卯","辰"], 乙:["丑","寅","卯"], 丙:["子","丑","寅"], 丁:["亥","子","丑"], 戊:["戌","亥","子"],
    己:["酉","戌","亥"], 庚:["申","酉","戌"], 辛:["未","申","酉"], 壬:["午","未","申"], 癸:["巳","午","未"],
  };
  /* 天赦 · 4 specific day pillars (season-based) */
  const TIAN_SHE_DAYS = ["戊寅","甲午","戊申","甲子"];
  /* 十靈日 · 10 specific day pillars */
  const SHI_LING_DAYS = ["甲辰","乙亥","丙辰","丁酉","戊午","庚戌","庚寅","辛卯","壬寅","癸未"];
  const META: Record<string, { zh: string; th: string; polarity: "good"|"bad"|"neutral" }> = {
    tianYi:{zh:"天乙貴人",th:"ขุนนาง",polarity:"good"},
    wenChang:{zh:"文昌",th:"อักษร",polarity:"good"},
    luShen:{zh:"祿神",th:"ทรัพย์",polarity:"good"},
    yangRen:{zh:"羊刃",th:"ดาบแกะ",polarity:"bad"},
    hongYan:{zh:"紅艷煞",th:"เสน่ห์รัก",polarity:"neutral"},
    jinYu:{zh:"金輿",th:"ราชรถ",polarity:"good"},
    xueRen:{zh:"血刃",th:"ดาบเลือด",polarity:"bad"},
    taoHua:{zh:"桃花",th:"เสน่ห์",polarity:"neutral"},
    yiMa:{zh:"驛馬",th:"ม้าเดินทาง",polarity:"neutral"},
    huaGai:{zh:"華蓋",th:"หลังคาฟ้า",polarity:"neutral"},
    jiangXing:{zh:"將星",th:"แม่ทัพ",polarity:"good"},
    jieSha:{zh:"劫煞",th:"โจรปล้น",polarity:"bad"},
    wangShen:{zh:"亡神",th:"อสูรหาย",polarity:"bad"},
    hongLuan:{zh:"紅鸞",th:"หงส์แดง",polarity:"good"},
    tianXi:{zh:"天喜",th:"ฟ้ายินดี",polarity:"good"},
    guChen:{zh:"孤辰",th:"อ้างว้าง",polarity:"bad"},
    guaSu:{zh:"寡宿",th:"หม้ายเหงา",polarity:"bad"},
    sangMen:{zh:"喪門",th:"ประตูศพ",polarity:"bad"},
    diaoKe:{zh:"弔客",th:"แขกอาลัย",polarity:"bad"},
    tianDe:{zh:"天德貴人",th:"คุณฟ้า",polarity:"good"},
    yueDe:{zh:"月德貴人",th:"คุณเดือน",polarity:"good"},
    tianGuan:{zh:"天官貴人",th:"คุณราชการ",polarity:"good"},
    /* +10 ใหม่ · เติมให้ครบ 62 ดวงเทียบ Voytek */
    longDe:{zh:"龍德",th:"คุณมังกร",polarity:"good"},
    fuDe:{zh:"福德",th:"คุณบุญ",polarity:"good"},
    wuGui:{zh:"五鬼",th:"ห้าผี · แทงข้างหลัง",polarity:"bad"},
    gouJiao:{zh:"勾絞",th:"ปมขัดแย้ง",polarity:"bad"},
    baZuo:{zh:"八座",th:"แปดบัลลังก์",polarity:"good"},
    tianFu:{zh:"天賦貴人",th:"คุณพรสวรรค์ · อาชีพ",polarity:"good"},
    jieDu:{zh:"節度貴人",th:"คุณวินัย",polarity:"good"},
    sanTai:{zh:"三台",th:"สามแท่น · เกียรติยศ",polarity:"good"},
    tianShe:{zh:"天赦",th:"ฟ้าอภัย",polarity:"good"},
    shiLingRi:{zh:"十靈日",th:"วันสิบเทพ",polarity:"good"},
  };
  const positions = _activeKeys(pillars);
  const pp = (p: keyof Pillars) => pillars[p]!;
  const found: StarHit[] = [];

  const checkBranch = (code: string, targets: string[]) => {
    const hits = positions.filter(p => targets.includes(pp(p).branch));
    if (hits.length) found.push({ code, ...META[code], pillars: [...hits] });
  };
  /* Codex fix: 天德/月德 target ตามตำราอาจเป็น stem หรือ branch · ต้อง check ทั้งคู่ */
  const checkStemOrBranch = (code: string, targets: string[]) => {
    const hits = positions.filter(p => targets.some(t => {
      if (STEMS_ALL.includes(t)) return pp(p).stem === t;
      if (BRANCHES_ALL.includes(t)) return pp(p).branch === t;
      return false;
    }));
    if (hits.length) found.push({ code, ...META[code], pillars: [...hits] });
  };
  for (const [code, t] of Object.entries(T_DS)) checkBranch(code, t[ds] || []);
  for (const [code, t] of Object.entries(T_DB)) checkBranch(code, t[db] || []);
  for (const [code, t] of Object.entries(T_YB)) checkBranch(code, t[yb] || []);
  for (const [code, t] of Object.entries(T_MB_STEM)) checkStemOrBranch(code, t[mb] || []);
  /* Trio stars · check from BOTH year-branch (YP) and day-branch (DP) · ตำราคลาสสิก */
  for (const [code, tbl] of Object.entries(T_TRIO)) {
    const ypTargets = tbl[yb] || [];
    const dpTargets = tbl[db] || [];
    const ypHits = positions.filter(p => ypTargets.includes(pp(p).branch));
    const dpHits = positions.filter(p => dpTargets.includes(pp(p).branch));
    if (ypHits.length) found.push({ code, ...META[code], pillars: [...ypHits], anchor: "YP" });
    if (dpHits.length && dpTargets.join(",") !== ypTargets.join(",")) {
      found.push({ code, ...META[code], pillars: [...dpHits], anchor: "DP" });
    }
  }
  /* 天官貴人 · day-stem driver */
  const tgTargets = T_TIANGUAN[ds] || [];
  const tgHits = positions.filter(p => tgTargets.includes(pp(p).branch));
  if (tgHits.length) found.push({ code: "tianGuan", ...META.tianGuan, pillars: [...tgHits], anchor: "DS" });
  /* +10 ดาวใหม่ · year-branch driven */
  for (const [code, tbl] of Object.entries(T_NEW_YB)) {
    const targets = tbl[yb] || [];
    const hits = positions.filter(p => targets.includes(pp(p).branch));
    if (hits.length) found.push({ code, ...META[code], pillars: [...hits], anchor: "YP" });
  }
  /* +ดาวใหม่ · day-stem driven */
  for (const [code, tbl] of Object.entries(T_NEW_DS)) {
    const targets = tbl[ds] || [];
    const hits = positions.filter(p => targets.includes(pp(p).branch));
    if (hits.length) found.push({ code, ...META[code], pillars: [...hits], anchor: "DS" });
  }
  /* 三台 · year-stem driven (3 consecutive branches) */
  const ys = pillars.year.stem;
  const stTargets = T_SANTAI[ys] || [];
  const stHits = positions.filter(p => stTargets.includes(pp(p).branch));
  if (stHits.length) found.push({ code: "sanTai", ...META.sanTai, pillars: [...stHits], anchor: "YP" });
  /* 天赦 · day pillar match */
  const dayPillarKey = pillars.day.stem + pillars.day.branch;
  if (TIAN_SHE_DAYS.includes(dayPillarKey)) {
    found.push({ code: "tianShe", ...META.tianShe, pillars: ["day"], anchor: "DP" });
  }
  /* 十靈日 · day pillar match */
  if (SHI_LING_DAYS.includes(dayPillarKey)) {
    found.push({ code: "shiLingRi", ...META.shiLingRi, pillars: ["day"], anchor: "DP" });
  }
  return found;
}

/* ── 62 神煞 extended detector (Codex direction: ใช้ logic ที่ครบกว่า) ── */
export function detectShenSha62(pillars: Pillars): StarHit[] {
  const base = detectShenShaStars(pillars);
  const extra: StarHit[] = [];
  const ds = pillars.day.stem;
  const yb = pillars.year.branch;
  const mb = pillars.month.branch;
  const positions = _activeKeys(pillars);
  const allStems = positions.map(p => pillars[p]!.stem);
  const dayPillar = pillars.day.stem + pillars.day.branch;
  const branchOffset = (start: string, n: number) => BRANCHES_ALL[(BRANCHES_ALL.indexOf(start) + n + 12) % 12];

  const META_EXT: Record<string, { zh: string; th: string; polarity: "good"|"bad"|"neutral" }> = {
    taiJi:{zh:"太極貴人",th:"ไท่จี๋",polarity:"good"},
    xueTang:{zh:"學堂貴人",th:"หอเรียน",polarity:"good"},
    ciGuan:{zh:"詞館",th:"หอวรรณ",polarity:"good"},
    tianChu:{zh:"天廚",th:"ครัวฟ้า",polarity:"good"},
    fuXing:{zh:"福星",th:"ดาวบุญ",polarity:"good"},
    tianYiDoc:{zh:"天醫",th:"หมอฟ้า",polarity:"good"},
    sanQi:{zh:"三奇貴人",th:"สามพิเศษ",polarity:"good"},
    yuanChen:{zh:"元辰",th:"ดาวต้น",polarity:"neutral"},
    kuiGang:{zh:"魁罡",th:"อำนาจสูงสุด",polarity:"neutral"},
    shiE:{zh:"十惡大敗",th:"สิบมหาวินาศ",polarity:"bad"},
    feiRen:{zh:"飛刃",th:"ดาบเหิน",polarity:"bad"},
    zaiSha:{zh:"災煞",th:"ภัยพิบัติ",polarity:"bad"},
    tianSha:{zh:"天煞",th:"ฟ้าสังหาร",polarity:"bad"},
    baiHu:{zh:"白虎",th:"เสือขาว",polarity:"bad"},
    jianFeng:{zh:"劍鋒",th:"คมดาบ",polarity:"bad"},
    piMa:{zh:"披麻",th:"คลุมป่าน",polarity:"bad"},
    bingFu:{zh:"病符",th:"ป้ายป่วย",polarity:"bad"},
    siFu:{zh:"死符",th:"ป้ายตาย",polarity:"bad"},
    guanFu:{zh:"官符",th:"คดีความ",polarity:"bad"},
    suiPo:{zh:"歲破",th:"ปีแตก",polarity:"bad"},
    suiXing:{zh:"歲刑",th:"ปีลงโทษ",polarity:"bad"},
    daHao:{zh:"大耗",th:"สูญใหญ่",polarity:"bad"},
    xiaoHao:{zh:"小耗",th:"สูญน้อย",polarity:"bad"},
    tianLuo:{zh:"天羅",th:"ตาข่ายฟ้า",polarity:"bad"},
    diWang:{zh:"地網",th:"ตาข่ายดิน",polarity:"bad"},
    geJiao:{zh:"隔角",th:"มุมขวาง",polarity:"bad"},
    feiFu:{zh:"飛符",th:"ป้ายเหิน",polarity:"bad"},
    yueKong:{zh:"月空",th:"ฟ้าโล่งเดือน",polarity:"neutral"},
    liuXia:{zh:"流霞",th:"แสงร่วง",polarity:"bad"},
    taoHuaSha:{zh:"桃花殺",th:"เสน่ห์สังหาร",polarity:"bad"},
  };
  const push = (code: string, hits: typeof positions[number][]) => {
    if (hits.length === 0) return;
    const m = META_EXT[code]; if (!m) return;
    extra.push({ code, ...m, pillars: hits });
  };

  /* A. Day Stem driver */
  const T_DS_EXT: Record<string, Record<string, string[]>> = {
    taiJi:{"甲":["子","午"],"乙":["子","午"],"丙":["卯","酉"],"丁":["卯","酉"],"戊":["辰","戌","丑","未"],"己":["辰","戌","丑","未"],"庚":["寅","亥"],"辛":["寅","亥"],"壬":["巳","申"],"癸":["巳","申"]},
    xueTang:{"甲":["亥"],"乙":["午"],"丙":["寅"],"丁":["酉"],"戊":["寅"],"己":["酉"],"庚":["巳"],"辛":["子"],"壬":["申"],"癸":["卯"]},
    ciGuan:{"甲":["巳"],"乙":["午"],"丙":["申"],"丁":["酉"],"戊":["申"],"己":["酉"],"庚":["亥"],"辛":["子"],"壬":["寅"],"癸":["卯"]},
    tianChu:{"甲":["巳"],"乙":["午"],"丙":["子"],"丁":["酉"],"戊":["寅"],"己":["午"],"庚":["亥"],"辛":["巳"],"壬":["寅"],"癸":["丑"]},
    fuXing:{"甲":["寅"],"乙":["寅"],"丙":["子"],"丁":["子"],"戊":["申"],"己":["申"],"庚":["午"],"辛":["午"],"壬":["辰"],"癸":["辰"]},
    liuXia:{"甲":["酉"],"乙":["戌"],"丙":["未"],"丁":["申"],"戊":["巳"],"己":["午"],"庚":["辰"],"辛":["卯"],"壬":["亥"],"癸":["寅"]},
  };
  for (const [code, tbl] of Object.entries(T_DS_EXT)) {
    const targets = tbl[ds] || [];
    const hits = positions.filter(p => targets.includes(pillars[p]!.branch));
    push(code, hits);
  }
  /* B. Year Branch driver */
  const T_YB_EXT: Record<string, Record<string, string[]>> = {
    zaiSha:{"寅":["子"],"午":["子"],"戌":["子"],"巳":["卯"],"酉":["卯"],"丑":["卯"],"申":["午"],"子":["午"],"辰":["午"],"亥":["酉"],"卯":["酉"],"未":["酉"]},
    tianSha:{"寅":["辰"],"午":["辰"],"戌":["辰"],"巳":["未"],"酉":["未"],"丑":["未"],"申":["戌"],"子":["戌"],"辰":["戌"],"亥":["丑"],"卯":["丑"],"未":["丑"]},
    jianFeng:{"寅":["酉"],"卯":["酉"],"辰":["酉"],"巳":["子"],"午":["子"],"未":["子"],"申":["卯"],"酉":["卯"],"戌":["卯"],"亥":["午"],"子":["午"],"丑":["午"]},
    piMa:{"子":["酉"],"丑":["戌"],"寅":["亥"],"卯":["子"],"辰":["丑"],"巳":["寅"],"午":["卯"],"未":["辰"],"申":["巳"],"酉":["午"],"戌":["未"],"亥":["申"]},
    tianLuo:{"寅":["戌","亥"],"午":["戌","亥"],"戌":["戌","亥"]},
    diWang:{"巳":["辰","巳"],"酉":["辰","巳"],"丑":["辰","巳"]},
  };
  for (const [code, tbl] of Object.entries(T_YB_EXT)) {
    const targets = tbl[yb] || [];
    const hits = positions.filter(p => targets.includes(pillars[p]!.branch));
    push(code, hits);
  }
  /* C. Year/Month branch + offset */
  const offsetTargets: Record<string, number> = {
    bingFu:1, guanFu:4, siFu:5, suiPo:6, xiaoHao:6, daHao:7, geJiao:2, baiHu:8, feiFu:5, yueKong:6, tianYiDoc:-1,
  };
  for (const [code, off] of Object.entries(offsetTargets)) {
    const driver = (code === "tianYiDoc" || code === "yueKong") ? mb : yb;
    const target = branchOffset(driver, off);
    const hits = positions.filter(p => pillars[p]!.branch === target);
    push(code, hits);
  }
  /* D. Day pillar match */
  const KUIGANG = ["庚辰","庚戌","壬辰","戊戌"];
  if (KUIGANG.includes(dayPillar)) push("kuiGang", ["day"]);
  const SHIEDAY = ["甲辰","乙巳","丙申","丁亥","戊戌","己丑","庚辰","辛巳","壬申","癸亥"];
  if (SHIEDAY.includes(dayPillar)) push("shiE", ["day"]);
  /* E. 飛刃 (沖 of 羊刃) */
  const yangRen: Record<string,string> = {"甲":"卯","乙":"寅","丙":"午","丁":"巳","戊":"午","己":"巳","庚":"酉","辛":"申","壬":"子","癸":"亥"};
  const yangRenBr = yangRen[ds];
  if (yangRenBr) {
    const sixClash: Record<string,string> = {"子":"午","午":"子","丑":"未","未":"丑","寅":"申","申":"寅","卯":"酉","酉":"卯","辰":"戌","戌":"辰","巳":"亥","亥":"巳"};
    const feiTarget = sixClash[yangRenBr];
    const hits = positions.filter(p => pillars[p]!.branch === feiTarget);
    push("feiRen", hits);
  }
  /* F. 三奇貴人 */
  const heaven3 = ["甲","戊","庚"], earth3 = ["乙","丙","丁"], people3 = ["壬","癸","辛"];
  const stemsSet = new Set(allStems);
  if (heaven3.every(s => stemsSet.has(s))) push("sanQi", ["year","month","day"]);
  else if (earth3.every(s => stemsSet.has(s))) push("sanQi", ["year","month","day"]);
  else if (people3.every(s => stemsSet.has(s))) push("sanQi", ["year","month","day"]);
  /* G. 桃花殺 */
  const taoShaTbl: Record<string,string[]> = {"寅":["卯"],"午":["卯"],"戌":["卯"],"巳":["午"],"酉":["午"],"丑":["午"],"申":["酉"],"子":["酉"],"辰":["酉"],"亥":["子"],"卯":["子"],"未":["子"]};
  const tsTargets = taoShaTbl[yb] || [];
  const tsHits = positions.filter(p => tsTargets.includes(pillars[p]!.branch));
  if (tsHits.length > 0) push("taoHuaSha", tsHits);
  /* H. 元辰 */
  const yuanChenTbl: Record<string,string> = {"子":"未","丑":"午","寅":"酉","卯":"申","辰":"亥","巳":"戌","午":"丑","未":"子","申":"卯","酉":"寅","戌":"巳","亥":"辰"};
  const ycTarget = yuanChenTbl[yb];
  if (ycTarget) {
    const hits = positions.filter(p => pillars[p]!.branch === ycTarget);
    push("yuanChen", hits);
  }
  /* I. 歲刑 */
  const xingMap: Record<string, string[]> = {
    "寅":["巳"],"巳":["申"],"申":["寅"],
    "丑":["戌"],"戌":["未"],"未":["丑"],
    "子":["卯"],"卯":["子"],
    "辰":["辰"],"午":["午"],"酉":["酉"],"亥":["亥"],
  };
  const xTargets = xingMap[yb] || [];
  const xHits = positions.filter(p => xTargets.includes(pillars[p]!.branch));
  if (xHits.length > 0) push("suiXing", xHits);

  return [...base, ...extra];
}

/* ── Build types · expose ผ่าน chart-extensions ──────────── */
export type NaYinPillar = { stem: string; branch: string; zh: string; en: string; th: string; element: string; symbol: string };
export type NaYinPerPillar = { year: NaYinPillar|null; month: NaYinPillar|null; day: NaYinPillar|null; hour: NaYinPillar|null };

export type KongWangInfo = {
  void_branches: [string, string];
  year_xun_voids: [string, string];
  per_pillar: { year: boolean; month: boolean; day: boolean; hour: boolean };
  per_pillar_year: { year: boolean; month: boolean; day: boolean; hour: boolean };
  per_pillar_day: { year: boolean; month: boolean; day: boolean; hour: boolean };
};

export type ThreePhases = {
  year:  { dm: string|null; pillar: string|null; hidden_main: string|null };
  month: { dm: string|null; pillar: string|null; hidden_main: string|null };
  day:   { dm: string|null; pillar: string|null; hidden_main: string|null };
  hour:  { dm: string|null; pillar: string|null; hidden_main: string|null };
};

export type StarsPerPillar = {
  year:  StarHit[];
  month: StarHit[];
  day:   StarHit[];
  hour:  StarHit[];
};

const ELEMENT_TH: Record<string, string> = { Wood:"ไม้", Fire:"ไฟ", Earth:"ดิน", Metal:"ทอง", Water:"น้ำ" };

export function buildNayin(pillars: Pillars): NaYinPerPillar {
  const ks = _activeKeys(pillars);
  const out: Partial<NaYinPerPillar> = { year: null, month: null, day: null, hour: null };
  for (const k of ks) {
    const pp = pillars[k]!;
    const sig = pp.stem + pp.branch;
    const ny = naYinOf(sig);
    out[k] = ny ? { stem: pp.stem, branch: pp.branch, zh: ny.zh, en: ny.en, th: ELEMENT_TH[ny.element]+"·"+ny.zh, element: ny.element, symbol: ny.symbol } : null;
  }
  return out as NaYinPerPillar;
}

export function buildKongWang(pillars: Pillars): KongWangInfo {
  /* Classical Voytek alignment · void by EITHER year-xun OR day-xun */
  const [dv1, dv2] = kongWangOf(pillars.day.stem, pillars.day.branch);
  const [yv1, yv2] = kongWangOf(pillars.year.stem, pillars.year.branch);
  const inDay = (b: string) => b === dv1 || b === dv2;
  const inYear = (b: string) => b === yv1 || b === yv2;
  const inAny = (b: string) => inDay(b) || inYear(b);
  return {
    void_branches: [dv1, dv2],
    year_xun_voids: [yv1, yv2],
    per_pillar: {
      year:  inAny(pillars.year.branch),
      month: inAny(pillars.month.branch),
      day:   inAny(pillars.day.branch),
      hour:  pillars.hour ? inAny(pillars.hour.branch) : false,
    },
    per_pillar_year: {
      year:  inYear(pillars.year.branch),
      month: inYear(pillars.month.branch),
      day:   inYear(pillars.day.branch),
      hour:  pillars.hour ? inYear(pillars.hour.branch) : false,
    },
    per_pillar_day: {
      year:  inDay(pillars.year.branch),
      month: inDay(pillars.month.branch),
      day:   inDay(pillars.day.branch),
      hour:  pillars.hour ? inDay(pillars.hour.branch) : false,
    },
  };
}

export function buildThreePhases(pillars: Pillars): ThreePhases {
  const ks = _activeKeys(pillars);
  const dmStem = pillars.day.stem;
  const out: Partial<ThreePhases> = { year: null as any, month: null as any, day: null as any, hour: null as any };
  for (const k of ks) {
    const pp = pillars[k]!;
    const mainHidden = (HIDDEN_STEMS[pp.branch] || [])[0] || null;
    out[k] = {
      dm: twelvePhaseOf(dmStem, pp.branch),
      pillar: twelvePhaseOf(pp.stem, pp.branch),
      hidden_main: mainHidden ? twelvePhaseOf(mainHidden, pp.branch) : null,
    };
  }
  return out as ThreePhases;
}

export function buildSpecialStars(pillars: Pillars): StarsPerPillar {
  /* Codex direction: ใช้ detector ที่ครบกว่า (62 ดาว) ไม่ใช่แค่ 21 */
  const hits = detectShenSha62(pillars);
  const out: StarsPerPillar = { year: [], month: [], day: [], hour: [] };
  for (const h of hits) {
    for (const p of h.pillars) {
      out[p].push(h);
    }
  }
  return out;
}

/* ────────────────────────────────────────────────────────────────
 * G4 · 4 BaZi sections (Codex direction: no DB hot path)
 * ──────────────────────────────────────────────────────────────── */

const BRANCH_IDX: Record<string, number> = {子:0,丑:1,寅:2,卯:3,辰:4,巳:5,午:6,未:7,申:8,酉:9,戌:10,亥:11};
const BRANCH_ELEMENT: Record<string, string> = {子:"water",丑:"earth",寅:"wood",卯:"wood",辰:"earth",巳:"fire",午:"fire",未:"earth",申:"metal",酉:"metal",戌:"earth",亥:"water"};
const STEM_ELEMENT: Record<string, string> = {甲:"wood",乙:"wood",丙:"fire",丁:"fire",戊:"earth",己:"earth",庚:"metal",辛:"metal",壬:"water",癸:"water"};
const ELEMENT_TH_MAP: Record<string, string> = {wood:"ไม้",fire:"ไฟ",earth:"ดิน",metal:"ทอง",water:"น้ำ"};
const BRANCH_TH_MAP: Record<string, string> = {子:"ชวด",丑:"ฉลู",寅:"ขาล",卯:"เถาะ",辰:"มะโรง",巳:"มะเส็ง",午:"มะเมีย",未:"มะแม",申:"วอก",酉:"ระกา",戌:"จอ",亥:"กุน"};

/* 五虎遁年起月 · ก้านของกิ่งใดๆ จากก้านปี (寅เป็นจุดเริ่ม) · ใช้กับ 命宮/身宮
 * 甲己→丙寅起 · 乙庚→戊寅 · 丙辛→庚寅 · 丁壬→壬寅 · 戊癸→甲寅 */
function fiveTigersStem(yearStem: string, targetBranch: string): string {
  const start: Record<string, number> = { 甲: 2, 己: 2, 乙: 4, 庚: 4, 丙: 6, 辛: 6, 丁: 8, 壬: 8, 戊: 0, 癸: 0 };
  const s = start[yearStem];
  if (s === undefined) return "";
  const steps = (BRANCH_IDX[targetBranch] - 2 + 12) % 12; // ระยะจาก 寅
  return STEMS_ALL[(s + steps) % 10];
}

/* #24 · 命宮 Life Palace · 27 พ.ค. แก้สูตร: 子平 卯安命 節氣法 (4−M−H) + เพิ่มก้าน 五虎遁
 * (เดิม子=0 ทั้งคู่+ไม่มีก้าน = ผิด · ใหม่ผ่าน worked 午月酉時→寅 · 巳月未時→巳 · cross-check 中氣法/月將) */
export type LifePalaceInfo = {
  stem: string;       // ก้าน 命宮 (五虎遁) · 27 พ.ค.
  pillar: string;     // 干支เต็ม
  branch: string;
  branch_th: string;
  element: string;
  element_th: string;
  hidden: string[];
  title_th: string;
  title_en: string;
  title_zh: string;
};

export function buildLifePalace(pillars: Pillars): LifePalaceInfo | null {
  /* 命宮 ต้องการ month + hour · ถ้า 3p (hour=null) คำนวณไม่ได้ → null */
  if (!pillars.hour) return null;
  const mIdx = BRANCH_IDX[pillars.month.branch];
  const hIdx = BRANCH_IDX[pillars.hour.branch];
  if (mIdx === undefined || hIdx === undefined) return null;
  /* 子平 卯安命 節氣法: 命宮支(子=0) = (4 − M − H) mod 12
   * M = ลำดับเดือน節氣 寅=1…子=11,丑=12 · H = ลำดับยาม 子時=0…亥時=11 · ก้าน 五虎遁
   * golden: Aeaw 子月午時→乙亥 · Mai 辰月申時→癸巳 · worked 午月酉時→寅 · 巳月未時→巳 */
  const M = ((mIdx - 2 + 12) % 12) + 1;   // 寅=1
  const H = hIdx;                          // 子=0
  const lpIdx = (((4 - M - H) % 12) + 12) % 12;
  const lpBranch = BRANCHES_ALL[lpIdx];
  const lpStem = fiveTigersStem(pillars.year.stem, lpBranch);
  const el = BRANCH_ELEMENT[lpBranch] || "earth";
  return {
    stem: lpStem,
    pillar: `${lpStem}${lpBranch}`,
    branch: lpBranch,
    branch_th: BRANCH_TH_MAP[lpBranch] || lpBranch,
    element: el,
    element_th: ELEMENT_TH_MAP[el] || el,
    hidden: HIDDEN_STEMS[lpBranch] || [],
    title_th: `เรือนชีวิต · ${lpStem}${lpBranch} · ${BRANCH_TH_MAP[lpBranch] || lpBranch} · ธาตุ${ELEMENT_TH_MAP[el] || el}`,
    title_en: `Life Palace · ${lpStem}${lpBranch} · ${el}`,
    title_zh: `命宮 · ${lpStem}${lpBranch} · ${el}`,
  };
}

/* #26 · 身宮 Body Palace · 對宮(六沖)ของ命宮 + ก้าน 五虎遁 (淵海子平「身宮對命宮也」)
 * golden: Aeaw 命宮亥→身宮己巳 · Mai 命宮巳→身宮己亥 · ต้องมี 命宮ก่อน → 3p (no hour) = null */
export type BodyPalaceInfo = LifePalaceInfo;
export function buildBodyPalace(pillars: Pillars, lifePalace: LifePalaceInfo | null): BodyPalaceInfo | null {
  if (!lifePalace) return null;
  const oppIdx = (BRANCH_IDX[lifePalace.branch] + 6) % 12; // 對宮 = +6 (六沖)
  const bpBranch = BRANCHES_ALL[oppIdx];
  const bpStem = fiveTigersStem(pillars.year.stem, bpBranch);
  const el = BRANCH_ELEMENT[bpBranch] || "earth";
  return {
    stem: bpStem,
    pillar: `${bpStem}${bpBranch}`,
    branch: bpBranch,
    branch_th: BRANCH_TH_MAP[bpBranch] || bpBranch,
    element: el,
    element_th: ELEMENT_TH_MAP[el] || el,
    hidden: HIDDEN_STEMS[bpBranch] || [],
    title_th: `เรือนกาย · ${bpStem}${bpBranch} · ${BRANCH_TH_MAP[bpBranch] || bpBranch} · ธาตุ${ELEMENT_TH_MAP[el] || el}`,
    title_en: `Body Palace · ${bpStem}${bpBranch} · ${el}`,
    title_zh: `身宮 · ${bpStem}${bpBranch} · ${el}`,
  };
}

/* #27 · 司令 人元司令分野 · 27 พ.ค. · ตาราง 子平真詮 (徐樂吾1934 · 韋千里1940 · 元亨利貞/文墨天機 default)
 * verify: 5 ดวงผ่าน (Aeaw子月→癸 · Mai辰月→乙 · 巳1990→戊 · 午1995→己 · 申1988→戊 · ต่าง三命通會ที่巳午申)
 * half-open [start,end) · ก้านที่คุมเดือน ณ วันเกิด (ลึกกว่าดูแค่เดือน) */
const SILING_ZIPING: Record<string, Array<{ stem: string; days: number }>> = {
  子: [{ stem: "壬", days: 10 }, { stem: "癸", days: 20 }],
  丑: [{ stem: "癸", days: 9 }, { stem: "辛", days: 3 }, { stem: "己", days: 18 }],
  寅: [{ stem: "戊", days: 7 }, { stem: "丙", days: 7 }, { stem: "甲", days: 16 }],
  卯: [{ stem: "甲", days: 10 }, { stem: "乙", days: 20 }],
  辰: [{ stem: "乙", days: 9 }, { stem: "癸", days: 3 }, { stem: "戊", days: 18 }],
  巳: [{ stem: "戊", days: 7 }, { stem: "庚", days: 7 }, { stem: "丙", days: 16 }],
  午: [{ stem: "丙", days: 9 }, { stem: "己", days: 10 }, { stem: "丁", days: 11 }],
  未: [{ stem: "丁", days: 9 }, { stem: "乙", days: 3 }, { stem: "己", days: 18 }],
  申: [{ stem: "戊", days: 7 }, { stem: "壬", days: 7 }, { stem: "庚", days: 16 }],
  酉: [{ stem: "庚", days: 10 }, { stem: "辛", days: 20 }],
  戌: [{ stem: "辛", days: 9 }, { stem: "丁", days: 3 }, { stem: "戊", days: 18 }],
  亥: [{ stem: "戊", days: 7 }, { stem: "甲", days: 5 }, { stem: "壬", days: 18 }],
};
export type SiLingInfo = {
  stem: string;
  element: string;
  element_th: string;
  phase: string;        // 餘氣/中氣/本氣
  days_since_jie: number | null;
  month_branch: string;
  title_th: string;
  title_en: string;
  title_zh: string;
};
/* นับวันจาก節(jie) ที่ผ่านมา · ICT clock → BJT (+1h) เทียบ節氣 (ห้ามใช้ 真太陽時 ฝั่งนี้)
 * คืน daysSinceJie (เศษทศนิยม) หรือ null ถ้าคำนวณไม่ได้ (3p ใช้ noon) */
export function computeSiLingDays(year: number, month: number, day: number, hour: number, minute: number): number | null {
  try {
    const tyme = require("tyme4ts");
    const st = tyme.SolarTime.fromYmdHms(year, month, day, hour + 1, minute, 0); // +1h: ICT→BJT
    let term = st.getTerm();
    for (let i = 0; i < 3 && !term.isJie(); i++) term = term.next(-1); // ถอยถึง 節 (เปลี่ยนเดือน)
    const jieSt = term.getJulianDay().getSolarTime();
    return st.subtract(jieSt) / 86400;
  } catch { return null; }
}
export function buildSiLing(monthBranch: string, daysSinceJie: number | null): SiLingInfo | null {
  const table = SILING_ZIPING[monthBranch];
  if (!table) return null;
  const phaseLabels = table.length === 3 ? ["餘氣", "中氣", "本氣"] : ["中氣", "本氣"]; // 四正(子卯酉)=2 stage
  let idx = table.length - 1;          // fallback = 本氣 (ถ้า daysSinceJie=null)
  if (daysSinceJie != null) {
    let acc = 0;
    for (let i = 0; i < table.length; i++) {
      if (daysSinceJie < acc + table[i].days) { idx = i; break; }
      acc += table[i].days;
    }
  }
  const stem = table[idx].stem;
  const el = STEM_ELEMENT[stem] || "earth";
  return {
    stem,
    element: el,
    element_th: ELEMENT_TH_MAP[el] || el,
    phase: phaseLabels[idx] || "本氣",
    days_since_jie: daysSinceJie,
    month_branch: monthBranch,
    title_th: `ธาตุบัญชาฤดู · ${stem}(${ELEMENT_TH_MAP[el] || el}) · ระยะ${phaseLabels[idx] || "本氣"}`,
    title_en: `Month Command · ${stem} · ${phaseLabels[idx] || "benqi"}`,
    title_zh: `司令 · ${stem} · ${phaseLabels[idx] || "本氣"}`,
  };
}

/* #28 · 小運 Minor Luck · 27 พ.ค. · Option B (時柱=虛歲1 เอง · 韋千里1940/徐樂吾1934/元亨利貞)
 * ทิศ 陽男陰女順 / 陰男陽女逆 (陽=ปีก้าน甲丙戊庚壬) · verify Aeaw庚午順 · Mai丙申逆 · ต้องมี時柱 → 3p=null */
export type MinorLuckInfo = {
  direction: "forward" | "backward";
  convention: "hour_pillar_self";
  entries: Array<{ age: number; stem: string; branch: string; pillar: string }>;
} | null;
export function buildMinorLuck(pillars: Pillars, gender: "M" | "F", count = 6): MinorLuckInfo {
  if (!pillars.hour) return null;                 // ต้องใช้ 時柱
  const ys = pillars.year.stem;
  const yangYear = STEMS_ALL.indexOf(ys) % 2 === 0; // 甲丙戊庚壬 = 陽
  const forward = (yangYear && gender === "M") || (!yangYear && gender === "F");
  let si = STEMS_ALL.indexOf(pillars.hour.stem);
  let bi = BRANCHES_ALL.indexOf(pillars.hour.branch);
  if (si < 0 || bi < 0) return null;
  const entries: Array<{ age: number; stem: string; branch: string; pillar: string }> = [];
  for (let age = 1; age <= count; age++) {
    entries.push({ age, stem: STEMS_ALL[si], branch: BRANCHES_ALL[bi], pillar: `${STEMS_ALL[si]}${BRANCHES_ALL[bi]}` });
    if (forward) { si = (si + 1) % 10; bi = (bi + 1) % 12; }
    else { si = (si + 9) % 10; bi = (bi + 11) % 12; }
  }
  return { direction: forward ? "forward" : "backward", convention: "hour_pillar_self", entries };
}

/* #25 · 胎元 Conception Palace · 27 พ.ค. · สูตร 子平: 「月干進一位、月支進三位」
 * (三命通會 卷二「論胎元」· 淵海子平 卷一 · ทุกสำนักตรงกัน ไม่มี fork)
 * golden: Aeaw 月柱丙子→丁卯 · Mai 月柱壬辰→癸未 · ไม่ใช้ยาม → 3p คำนวณได้
 * ⚠️ ห้ามสับสนกับ 胎息 (六合ของเสาวัน คนละเรื่อง) */
export type ConceptionPalaceInfo = {
  stem: string;
  branch: string;
  pillar: string;
  branch_th: string;
  element: string;
  element_th: string;
  hidden: string[];
  title_th: string;
  title_en: string;
  title_zh: string;
};
export function buildConceptionPalace(pillars: Pillars): ConceptionPalaceInfo | null {
  const m = pillars.month;
  if (!m) return null;
  const si = STEMS_ALL.indexOf(m.stem);
  const bi = BRANCHES_ALL.indexOf(m.branch);
  if (si < 0 || bi < 0) return null;
  const stem = STEMS_ALL[(si + 1) % 10];      // 月干進一
  const branch = BRANCHES_ALL[(bi + 3) % 12]; // 月支進三
  const el = BRANCH_ELEMENT[branch] || "earth";
  return {
    stem,
    branch,
    pillar: `${stem}${branch}`,
    branch_th: BRANCH_TH_MAP[branch] || branch,
    element: el,
    element_th: ELEMENT_TH_MAP[el] || el,
    hidden: HIDDEN_STEMS[branch] || [],
    title_th: `เรือนปฏิสนธิ · ${stem}${branch} · ธาตุ${ELEMENT_TH_MAP[el] || el}`,
    title_en: `Conception Palace · ${stem}${branch} · ${el}`,
    title_zh: `胎元 · ${stem}${branch} · ${el}`,
  };
}

/* #23 · 宮位 Palace Reading · 4 pillar palaces */
const PALACE_TABLE: Array<{
  pillar: "year"|"month"|"day"|"hour";
  zh: string;
  age: string;
  title_th: string;
  title_en: string;
  title_zh: string;
  stem_th: string;
  branch_th: string;
}> = [
  { pillar:"year",  zh:"祖宮",     age:"0-16",  title_th:"เสาปี · บรรพบุรุษ / วัยเด็ก", title_en:"Year Palace · Ancestors / Childhood", title_zh:"年柱 · 祖宮", stem_th:"ผู้ใหญ่ฝ่ายชาย", branch_th:"ผู้ใหญ่ฝ่ายหญิง · ราก" },
  { pillar:"month", zh:"父母兄弟宮", age:"17-32", title_th:"เสาเดือน · พ่อแม่ / อาชีพ",     title_en:"Month Palace · Parents / Career",     title_zh:"月柱 · 父母兄弟宮", stem_th:"พ่อ / หัวหน้า", branch_th:"แม่ / รากอาชีพ" },
  { pillar:"day",   zh:"夫妻宮",   age:"33-48", title_th:"เสาวัน · ตนเอง / คู่ครอง",       title_en:"Day Palace · Self / Spouse",          title_zh:"日柱 · 夫妻宮",   stem_th:"ตนเอง (Day Master)", branch_th:"คู่ครอง" },
  { pillar:"hour",  zh:"子女宮",   age:"49+",   title_th:"เสาชั่วโมง · ลูก / บั้นปลาย",     title_en:"Hour Palace · Children / Late life",  title_zh:"時柱 · 子女宮",   stem_th:"ลูกชาย / ลูกน้อง", branch_th:"ลูกหญิง / บั้นปลาย" },
];

export type PalaceReadingCell = {
  pillar: "year"|"month"|"day"|"hour";
  zh: string;
  age: string;
  title_th: string;
  title_en: string;
  title_zh: string;
  /* 📜 64 卦 hex ของ pillar นั้น · Mei Hua Yi Shu · 15 พ.ค. 2026 */
  hex?: {
    num: number;
    zh: string; th: string; en: string;
    symbol: string;
    upper_zh: string; lower_zh: string;
    changing_line: number;
  } | null;
};

type _Pillars = { year: { stem: string; branch: string }; month: { stem: string; branch: string }; day: { stem: string; branch: string }; hour: { stem: string; branch: string } };

export function buildPalaceReadings(pillars?: _Pillars): Record<"year"|"month"|"day"|"hour", PalaceReadingCell> {
  const out = {} as Record<"year"|"month"|"day"|"hour", PalaceReadingCell>;
  let yearHex: any = null;
  if (pillars) {
    try { yearHex = require("./year-hexagram"); } catch (_) {}
  }
  for (const p of PALACE_TABLE) {
    const cell: PalaceReadingCell = { pillar:p.pillar, zh:p.zh, age:p.age, title_th:p.title_th, title_en:p.title_en, title_zh:p.title_zh };
    if (yearHex && pillars && pillars[p.pillar]) {
      try {
        const h = yearHex.hexagramForStemBranch(pillars[p.pillar].stem, pillars[p.pillar].branch);
        if (h?.hex) {
          cell.hex = {
            num: h.num,
            zh: h.hex.zh, th: h.hex.th, en: h.hex.en,
            symbol: h.hex.symbol,
            upper_zh: h.upper.zh, lower_zh: h.lower.zh,
            changing_line: h.changing_line,
          };
        }
      } catch (_) {}
    }
    out[p.pillar] = cell;
  }
  return out;
}

/* #28 · 五型格 5 Structure Types · derive from DM element */
const FIVE_STRUCTURE_TABLE: Record<string, { code: string; zh: string; title_en: string; title_th: string; title_zh: string }> = {
  wood:  { code:"wood",  zh:"曲直格", title_en:"The Visionary",  title_th:"นักวิสัยทัศน์ · เติบโตและคิดใหม่",   title_zh:"曲直格 · 木型" },
  fire:  { code:"fire",  zh:"炎上格", title_en:"The Spark",       title_th:"ผู้จุดประกาย · ขับเคลื่อนด้วยความหลงใหล", title_zh:"炎上格 · 火型" },
  earth: { code:"earth", zh:"稼穡格", title_en:"The Connector",   title_th:"นักเชื่อมต่อ · เสถียรและบ่มเพาะ",    title_zh:"稼穡格 · 土型" },
  metal: { code:"metal", zh:"從革格", title_en:"The Architect",   title_th:"สถาปนิก · ระเบียบและความแม่นยำ",    title_zh:"從革格 · 金型" },
  water: { code:"water", zh:"潤下格", title_en:"The Strategist",  title_th:"นักกลยุทธ์ · ลื่นไหลและลึกซึ้ง",     title_zh:"潤下格 · 水型" },
};

export type FiveStructureInfo = {
  code: string;
  zh: string;
  title_en: string;
  title_th: string;
  title_zh: string;
};

export function buildFiveStructure(pillars: Pillars): FiveStructureInfo {
  const dmEl = STEM_ELEMENT[pillars.day.stem] || "earth";
  return FIVE_STRUCTURE_TABLE[dmEl];
}
