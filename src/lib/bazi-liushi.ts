/* 流時 Deep Hour Analysis (流時 · รายชั่วยามเชิงลึก)
   อ้าง: 淵海子平·喜忌篇 + 三命通會·卷二 論支元 (合冲刑害破)
   ต่างจาก lucky-hour เดิม: เทียบยาม × ทุกเสาในดวงเกิด + chain 大運/流年/流月 + 神煞
   ไม่ใช่ engine ตัดสินดี-ร้ายเดี่ยว · ส่ง evidence ให้ AI/UI อ่านจังหวะยาม
*/

export type ElementEN = "wood" | "fire" | "earth" | "metal" | "water";
type PillarKey = "year" | "month" | "day" | "hour";

const BRANCH_ELEMENT: Record<string, ElementEN> = {
  子: "water", 丑: "earth", 寅: "wood", 卯: "wood", 辰: "earth", 巳: "fire",
  午: "fire", 未: "earth", 申: "metal", 酉: "metal", 戌: "earth", 亥: "water",
};
const STEM_ELEMENT: Record<string, ElementEN> = {
  甲: "wood", 乙: "wood", 丙: "fire", 丁: "fire", 戊: "earth", 己: "earth",
  庚: "metal", 辛: "metal", 壬: "water", 癸: "water",
};
const ELEMENT_CONTROLS: Record<ElementEN, ElementEN> = { wood: "earth", earth: "water", water: "fire", fire: "metal", metal: "wood" };
const ELEMENT_PRODUCES: Record<ElementEN, ElementEN> = { wood: "fire", fire: "earth", earth: "metal", metal: "water", water: "wood" };

const BRANCH_CLASH: Record<string, string> = {
  子: "午", 午: "子", 丑: "未", 未: "丑", 寅: "申", 申: "寅",
  卯: "酉", 酉: "卯", 辰: "戌", 戌: "辰", 巳: "亥", 亥: "巳",
};
const BRANCH_HE: Record<string, string> = {
  子: "丑", 丑: "子", 寅: "亥", 亥: "寅", 卯: "戌", 戌: "卯",
  辰: "酉", 酉: "辰", 巳: "申", 申: "巳", 午: "未", 未: "午",
};
const BRANCH_HARM: Record<string, string> = {
  子: "未", 未: "子", 丑: "午", 午: "丑", 寅: "巳", 巳: "寅",
  卯: "辰", 辰: "卯", 申: "亥", 亥: "申", 酉: "戌", 戌: "酉",
};
const SELF_PUNISH = new Set(["辰", "午", "酉", "亥"]);

const STEMS_ORDER = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
const BRANCHES_ORDER = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
const FIVE_TIGERS_START: Record<string, string> = {
  甲: "甲", 己: "甲", 乙: "丙", 庚: "丙", 丙: "戊", 辛: "戊", 丁: "庚", 壬: "庚", 戊: "壬", 癸: "壬",
};
function hourStemOf(dayStem: string, hourBranch: string): string {
  const start = FIVE_TIGERS_START[dayStem];
  if (!start) return "甲";
  const si = STEMS_ORDER.indexOf(start);
  const bi = BRANCHES_ORDER.indexOf(hourBranch);
  return STEMS_ORDER[(si + bi) % 10];
}

const HOUR_DEF: { branch: string; range: string; nameTh: string }[] = [
  { branch: "子", range: "23:00-01:00", nameTh: "ชวด · ดึก" },
  { branch: "丑", range: "01:00-03:00", nameTh: "ฉลู · ดึกมาก" },
  { branch: "寅", range: "03:00-05:00", nameTh: "ขาล · ก่อนรุ่ง" },
  { branch: "卯", range: "05:00-07:00", nameTh: "เถาะ · รุ่งเช้า" },
  { branch: "辰", range: "07:00-09:00", nameTh: "มะโรง · เช้า" },
  { branch: "巳", range: "09:00-11:00", nameTh: "มะเส็ง · สาย" },
  { branch: "午", range: "11:00-13:00", nameTh: "มะเมีย · เที่ยง" },
  { branch: "未", range: "13:00-15:00", nameTh: "มะแม · บ่าย" },
  { branch: "申", range: "15:00-17:00", nameTh: "วอก · บ่าย-เย็น" },
  { branch: "酉", range: "17:00-19:00", nameTh: "ระกา · เย็น" },
  { branch: "戌", range: "19:00-21:00", nameTh: "จอ · ค่ำ" },
  { branch: "亥", range: "21:00-23:00", nameTh: "กุน · ดึก-ต้น" },
];

const PILLAR_TH: Record<PillarKey, string> = { year: "เสาปี", month: "เสาเดือน", day: "เสาวัน", hour: "เสายาม" };

/* 桃花/驛馬/羊刃 lookup (ย่อจาก bazi-shensha-transit) */
function shaForHour(yearBranch: string, dayStem: string, hourBranch: string): string[] {
  const out: string[] = [];
  const g3: Record<string, { tao: string; yi: string }> = {};
  const set = (arr: string[], tao: string, yi: string) => arr.forEach((b) => (g3[b] = { tao, yi }));
  set(["申", "子", "辰"], "酉", "寅"); set(["巳", "酉", "丑"], "午", "亥");
  set(["寅", "午", "戌"], "卯", "申"); set(["亥", "卯", "未"], "子", "巳");
  const g = g3[yearBranch];
  if (g && hourBranch === g.tao) out.push("桃花(เสน่ห์)");
  if (g && hourBranch === g.yi) out.push("驛馬(เดินทาง)");
  const YR: Record<string, string> = { 甲: "卯", 丙: "午", 戊: "午", 庚: "酉", 壬: "子" };
  if (YR[dayStem] === hourBranch) out.push("羊刃(พลังเข้ม)");
  return out;
}

export type LiuShiContext = {
  natalPillars: Record<PillarKey, { stem: string; branch: string } | null>;
  dmStem: string;
  todayDayStem: string;      // ก้านวันนี้ (五虎遁 ของยาม)
  todayDayBranch: string;    // กิ่งวันนี้
  luckBranch?: string | null;   // 大運 ปัจจุบัน
  yearBranch?: string | null;   // 流年 ปัจจุบัน
  monthBranch?: string | null;  // 流月 ปัจจุบัน
  yongshen?: ElementEN[];
  jishen?: ElementEN[];
  nowBranch?: string | null;    // ยามปัจจุบัน (TST)
};

export type LiuShiHour = {
  branch: string;
  stem: string;
  range: string;
  nameTh: string;
  element: ElementEN;
  quality: "best" | "good" | "ok" | "bad";
  reactions: string[];      // ปฏิกิริยา × natal/transit
  shensha: string[];
  reasonTh: string;
  isNow: boolean;
  sourceRuleIds: string[];
};

const EL_TH: Record<ElementEN, string> = { wood: "ไม้", fire: "ไฟ", earth: "ดิน", metal: "ทอง", water: "น้ำ" };

function baseQuality(dmEl: ElementEN | "", hourEl: ElementEN, yongshen: ElementEN[], jishen: ElementEN[]): LiuShiHour["quality"] {
  if (!dmEl) return "ok";
  if (yongshen.includes(hourEl)) return ELEMENT_PRODUCES[hourEl] === dmEl ? "best" : "good";
  if (jishen.includes(hourEl)) return ELEMENT_CONTROLS[hourEl] === dmEl ? "bad" : "ok";
  if (hourEl === dmEl) return "good";
  if (ELEMENT_PRODUCES[hourEl] === dmEl) return "best";
  if (ELEMENT_CONTROLS[hourEl] === dmEl) return "bad";
  return "ok";
}

function downgrade(q: LiuShiHour["quality"]): LiuShiHour["quality"] {
  return q === "best" ? "good" : q === "good" ? "ok" : q === "ok" ? "bad" : "bad";
}
function upgrade(q: LiuShiHour["quality"]): LiuShiHour["quality"] {
  return q === "bad" ? "ok" : q === "ok" ? "good" : "best";
}

export function buildLiuShi(ctx: LiuShiContext): {
  hours: LiuShiHour[];
  goldenWindow: { start: string; end: string } | null;
  avoidWindow: { start: string; end: string } | null;
} {
  const dmEl = STEM_ELEMENT[ctx.dmStem] || "";
  const yong = ctx.yongshen || [];
  const ji = ctx.jishen || [];

  /* รายการกิ่งที่ต้องเทียบปฏิกิริยา: ทุกเสาในดวง + chain transit */
  const natalBranches: { key: string; branch: string }[] = [];
  (["year", "month", "day", "hour"] as PillarKey[]).forEach((k) => {
    const b = ctx.natalPillars[k]?.branch;
    if (b) natalBranches.push({ key: PILLAR_TH[k], branch: b });
  });
  const transitBranches: { key: string; branch: string }[] = [];
  if (ctx.luckBranch) transitBranches.push({ key: "วัยจร", branch: ctx.luckBranch });
  if (ctx.yearBranch) transitBranches.push({ key: "ปีจร", branch: ctx.yearBranch });
  if (ctx.monthBranch) transitBranches.push({ key: "เดือนจร", branch: ctx.monthBranch });
  if (ctx.todayDayBranch) transitBranches.push({ key: "วันนี้", branch: ctx.todayDayBranch });

  const hours: LiuShiHour[] = HOUR_DEF.map((h) => {
    const hourEl = BRANCH_ELEMENT[h.branch];
    const stem = hourStemOf(ctx.todayDayStem || ctx.dmStem, h.branch);
    let quality = baseQuality(dmEl, hourEl, yong, ji);
    const reactions: string[] = [];

    const all = [...natalBranches, ...transitBranches];
    for (const t of all) {
      if (BRANCH_CLASH[t.branch] === h.branch) {
        reactions.push(`沖${t.key}(${t.branch}) ปะทะ`);
        quality = "bad";
      } else if (BRANCH_HE[t.branch] === h.branch) {
        reactions.push(`合${t.key}(${t.branch}) ผสาน`);
        if (!ji.includes(hourEl)) quality = upgrade(quality);
      } else if (BRANCH_HARM[t.branch] === h.branch) {
        reactions.push(`害${t.key}(${t.branch}) เบียด`);
        if (quality !== "bad") quality = downgrade(quality);
      } else if (SELF_PUNISH.has(t.branch) && t.branch === h.branch) {
        reactions.push(`${t.branch}自刑 ซ้ำตัวเอง`);
        if (quality !== "bad") quality = downgrade(quality);
      }
    }

    const shensha = ctx.natalPillars.year?.branch
      ? shaForHour(ctx.natalPillars.year.branch, ctx.todayDayStem || ctx.dmStem, h.branch)
      : [];

    /* reason ภาษาคน */
    const elTh = EL_TH[hourEl];
    let reasonTh = "";
    if (yong.includes(hourEl)) reasonTh = `${elTh}เป็นของช่วยของคุณ`;
    else if (ji.includes(hourEl)) reasonTh = `${elTh}เป็นของแสลง ระวัง`;
    else if (hourEl === dmEl) reasonTh = `${elTh}เป็นเพื่อนเสริมพลัง`;
    else if (ELEMENT_PRODUCES[hourEl] === dmEl) reasonTh = `${elTh}สร้างพลังให้คุณ`;
    else if (ELEMENT_CONTROLS[dmEl] === hourEl) reasonTh = `${elTh}คือทรัพย์ ทำได้แต่อย่าหนัก`;
    else if (ELEMENT_CONTROLS[hourEl] === dmEl) reasonTh = `${elTh}กดตัวคุณ ระวัง`;
    else reasonTh = `${elTh}ทั่วไป ใช้ได้`;
    /* reasonTh = เหตุผลธาตุล้วน · reactions/shensha แยก field ให้ UI ต่อเอง (กันซ้ำ) */

    return {
      branch: h.branch, stem, range: h.range, nameTh: h.nameTh,
      element: hourEl, quality, reactions, shensha, reasonTh,
      isNow: h.branch === (ctx.nowBranch || ""),
      sourceRuleIds: ["YHZP-XJP", "SMTG-Vol2", "HK-LIUSHI-001"],
    };
  });

  /* golden/avoid window */
  const rngStart = (r: string) => parseInt(r.split("-")[0].split(":")[0], 10);
  const rngEnd = (r: string) => parseInt(r.split("-")[1].split(":")[0], 10);
  function longestRun(pred: (q: string) => boolean): { start: string; end: string } | null {
    let best: { from: number; to: number; len: number } | null = null;
    let cur: { from: number; to: number; len: number } | null = null;
    for (const h of hours) {
      if (pred(h.quality)) {
        const s = rngStart(h.range), e = rngEnd(h.range);
        if (!cur) cur = { from: s, to: e, len: 1 };
        else { cur.to = e; cur.len++; }
      } else {
        if (cur && (!best || cur.len > best.len)) best = cur;
        cur = null;
      }
    }
    if (cur && (!best || cur.len > best.len)) best = cur;
    if (!best) return null;
    return { start: String(best.from).padStart(2, "0") + ":00", end: String(best.to).padStart(2, "0") + ":00" };
  }

  return {
    hours,
    goldenWindow: longestRun((q) => q === "best" || q === "good"),
    avoidWindow: longestRun((q) => q === "bad"),
  };
}
