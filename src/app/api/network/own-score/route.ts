/**
 * POST /api/network/own-score
 *
 * Backend source for People Grid "their own luck" cards.
 * Returns scores + actionable insight with explicit reasons from computed pillars,
 * not frontend text templates.
 */
import { NextResponse } from "next/server";
import { computeUserDayScore } from "@/lib/scoring/pair-base";

type Pillar = { stem: string; branch: string };
type PersonInput = {
  id?: string;
  name?: string;
  pillars?: { year?: Pillar; month?: Pillar; day?: Pillar; hour?: Pillar };
  yongshenTop3?: Array<{ element?: string; score?: number }>;
  birthDate?: string;
  birthTime?: string;
  longitude?: number;
  gender?: "M" | "F";
};
type YongshenV2Slim = {
  primary_yongshen: string[];
  xishen: string[];
  jishen: string[];
  diseases: string[];
  medicine: string[];
  structure_label?: string | null;
  engine_type?: string | null;
};

const STEM_EL: Record<string, string> = {
  甲:"wood", 乙:"wood", 丙:"fire", 丁:"fire", 戊:"earth", 己:"earth",
  庚:"metal", 辛:"metal", 壬:"water", 癸:"water",
};
const BR_EL: Record<string, string> = {
  子:"water", 丑:"earth", 寅:"wood", 卯:"wood", 辰:"earth", 巳:"fire",
  午:"fire", 未:"earth", 申:"metal", 酉:"metal", 戌:"earth", 亥:"water",
};
const EL_TH: Record<string, string> = { wood:"ไม้", fire:"ไฟ", earth:"ดิน", metal:"ทอง", water:"น้ำ" };
const EL_EN: Record<string, string> = { wood:"Wood", fire:"Fire", earth:"Earth", metal:"Metal", water:"Water" };
const REL_SCORE: Record<string, Record<string, number>> = {
  wood:  { wood:5, fire:-3, earth:5,  metal:-15, water:8 },
  fire:  { fire:5, earth:-3, metal:5, water:-15, wood:8 },
  earth: { earth:5, metal:-3, water:5, wood:-15, fire:8 },
  metal: { metal:5, water:-3, wood:5, fire:-15, earth:8 },
  water: { water:5, wood:-3, fire:5, earth:-15, metal:8 },
};
const CLASH: Record<string, string> = {
  子:"午", 午:"子", 丑:"未", 未:"丑", 寅:"申", 申:"寅",
  卯:"酉", 酉:"卯", 辰:"戌", 戌:"辰", 巳:"亥", 亥:"巳",
};
const LIU_HE: Record<string, string> = {
  子:"丑", 丑:"子", 寅:"亥", 亥:"寅", 卯:"戌", 戌:"卯",
  辰:"酉", 酉:"辰", 巳:"申", 申:"巳", 午:"未", 未:"午",
};
const SAN_HE_GROUPS = [
  ["申", "子", "辰"],
  ["寅", "午", "戌"],
  ["巳", "酉", "丑"],
  ["亥", "卯", "未"],
];

function clamp(n: number, lo = 25, hi = 95) {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function tenGod(dmEl: string, otherEl: string) {
  if (!dmEl || !otherEl) return "unknown";
  if (otherEl === dmEl) return "bijie";
  const map: Record<string, Record<string, string>> = {
    wood:  { fire:"shishang", earth:"cai",     metal:"guansha", water:"yin" },
    fire:  { earth:"shishang", metal:"cai",    water:"guansha", wood:"yin" },
    earth: { metal:"shishang", water:"cai",    wood:"guansha",  fire:"yin" },
    metal: { water:"shishang", wood:"cai",     fire:"guansha",  earth:"yin" },
    water: { wood:"shishang",  fire:"cai",     earth:"guansha", metal:"yin" },
  };
  return map[dmEl]?.[otherEl] || "unknown";
}

function activityFor(god: string) {
  const table: Record<string, { suitable: string; avoid: string }> = {
    shishang: { suitable:"สร้างสรรค์ · พรีเซนต์ · ออกสื่อ", avoid:"พูดตรงเกิน · เถียงผู้ใหญ่" },
    cai:      { suitable:"คุยงาน · ปิดดีล · เก็บเงิน", avoid:"หุนหันลงทุนมาก" },
    guansha:  { suitable:"งาน routine · ฟังผู้ใหญ่ · วินัย", avoid:"งานเร่ง · ขัดผู้ใหญ่" },
    yin:      { suitable:"เรียน · เซ็นเอกสาร · หาความรู้", avoid:"ตัดสินใจหนัก" },
    bijie:    { suitable:"ทีมเวิร์ค · ออมพลัง · เพื่อน", avoid:"แข่งเพื่อน · ค้าขายเดี่ยว" },
  };
  return table[god] || { suitable:"งานทั่วไป · จัดระบบ", avoid:"ตัดสินใจหนัก" };
}

function pillarName(p?: Pillar | string | null) {
  if (!p) return "";
  if (typeof p === "string") return p;
  return `${p.stem || ""}${p.branch || ""}`;
}

function normalizeNatal(pillars: PersonInput["pillars"]) {
  if (!pillars?.year || !pillars?.month || !pillars?.day) return null;
  return {
    year: pillars.year,
    month: pillars.month,
    day: pillars.day,
    hour: pillars.hour || null,
  };
}

async function synthesizeWrapper7(pillars: PersonInput["pillars"]): Promise<YongshenV2Slim | null> {
  const natal = normalizeNatal(pillars);
  if (!natal) return null;
  try {
    // @ts-ignore - runtime CJS wrapper
    const w7 = await import("../../../../../data/library/wrappers/7-yongshen-v2.js");
    const synth = (w7 as any).synthesizeYongshen || ((w7 as any).default && (w7 as any).default.synthesizeYongshen);
    if (!synth) return null;
    const s = synth(natal);
    return {
      primary_yongshen: Array.isArray(s.primary_yongshen) ? s.primary_yongshen : [],
      xishen: Array.isArray(s.xishen) ? s.xishen : [],
      jishen: Array.isArray(s.jishen) ? s.jishen : [],
      diseases: Array.isArray(s.diseases) ? s.diseases : [],
      medicine: Array.isArray(s.medicine) ? s.medicine : [],
      structure_label: s.structure_label || null,
      engine_type: s.engine_type || null,
    };
  } catch {
    return null;
  }
}

/* 18 พ.ค. unified · score มาจาก computeUserDayScore (Single Source of Truth)
 * reasons มาจาก in-house logic เดิมเพื่อ insight (ไม่กระทบ score)
 * userPillars ใช้ pair-base.ts → /today + /calendar + /network ตรงกัน */
function scorePillar(opts: {
  label: string;
  dm: string;
  natalBranch?: string;
  pillar: Pillar;
  yongshenTop3: string[];
  jishen?: string[];
  userPillars: { year?: Pillar; month?: Pillar; day: Pillar; hour?: Pillar };
}) {
  const { label, dm, natalBranch, pillar, yongshenTop3, userPillars } = opts;
  const dmEl = STEM_EL[dm];
  const stemEl = STEM_EL[pillar.stem];
  const branchEl = BR_EL[pillar.branch];
  const reasons: string[] = [];
  /* === score · unified จาก pair-base.ts === */
  const allEls = ['wood','fire','earth','metal','water'];
  const jishen = opts.jishen || allEls.filter(e => !yongshenTop3.includes(e));
  const pillarStr = pillar.stem + pillar.branch;
  const unified = computeUserDayScore(userPillars, pillarStr, yongshenTop3, jishen);
  const score = unified.score;

  /* === reasons · in-house insight (display only · ไม่กระทบ score) === */
  function addReasonsForElement(elem: string | undefined, where: string) {
    if (!elem || !dmEl) return;
    const idx = yongshenTop3.indexOf(elem);
    if (idx >= 0) {
      reasons.push(`${where}เป็นธาตุ${EL_TH[elem] || elem} ตรงธาตุช่วยหลักอันดับ ${idx + 1}`);
      return;
    }
    const b = REL_SCORE[dmEl]?.[elem] || 0;
    if (b > 0) reasons.push(`${where}ธาตุ${EL_TH[elem] || elem}เกื้อกับตัวธาตุ ${dm}${EL_TH[dmEl] || dmEl}`);
    else if (b < 0) reasons.push(`${where}ธาตุ${EL_TH[elem] || elem}กด/ระบายตัวธาตุ ${dm}${EL_TH[dmEl] || dmEl}`);
  }
  addReasonsForElement(stemEl, `${label}ก้าน ${pillar.stem} `);
  addReasonsForElement(branchEl, `${label}กิ่ง ${pillar.branch} `);
  if (natalBranch && CLASH[natalBranch] === pillar.branch) reasons.push(`กิ่งวันเกิด ${natalBranch} ชงกับ${label}${pillar.branch}`);
  else if (natalBranch && LIU_HE[natalBranch] === pillar.branch) reasons.push(`กิ่งวันเกิด ${natalBranch} จับคู่กลมกลืนกับ${label}${pillar.branch}`);
  else if (natalBranch && SAN_HE_GROUPS.some(g => g.includes(natalBranch) && g.includes(pillar.branch))) reasons.push(`กิ่งวันเกิด ${natalBranch} อยู่กลุ่มสามประสานกับ${label}${pillar.branch}`);

  /* 18 พ.ค. · ใส่ tags จาก unified ลงท้าย reasons เป็น signature */
  if (unified.tags?.length) reasons.push(`unified: ${unified.tags.slice(0,4).join('·')}`);

  return { score, reasons };
}

async function getPillarsForDate(date: string) {
  const [yy, mm, dd] = date.split("-").map(Number);
  const tyme = await import("tyme4ts");
  const ec = tyme.SolarTime.fromYmdHms(yy, mm, dd, 12, 0, 0).getLunarHour().getEightChar();
  const day = ec.getDay().getName();
  const month = ec.getMonth().getName();
  const year = ec.getYear().getName();
  return {
    day: { stem: day[0], branch: day[1] },
    month: { stem: month[0], branch: month[1] },
    year: { stem: year[0], branch: year[1] },
  };
}

async function currentLuckPillar(person: PersonInput, yongshenTop3: string[]) {
  if (!person.birthDate) return null;
  try {
    const { calcBazi } = await import("@/lib/bazi-calc");
    const { buildChartExtensions } = await import("@/lib/chart-extensions");
    const time = person.birthTime || "12:00";
    const longitude = Number(person.longitude || 100.5018);
    const gender = person.gender || "M";
    const calc = await calcBazi({
      date: person.birthDate,
      time,
      longitude,
      gmtOffsetHours: 7,
      gender,
    });
    let startAge = 10;
    try {
      const tyme = await import("tyme4ts");
      const { getSolarTimeAtTST } = await import("@/lib/bazi-calc");
      const { st } = await getSolarTimeAtTST({
        date: person.birthDate,
        time,
        longitude,
        gmtOffsetHours: 7,
      });
      const g = gender === "F" ? tyme.Gender.WOMAN : tyme.Gender.MAN;
      const cl = tyme.ChildLimit.fromSolarTime(st, g);
      startAge = Math.round((cl.getYearCount() + cl.getMonthCount() / 12 + cl.getDayCount() / 365.25) * 100) / 100;
    } catch (e) {
      console.error("network own-score ChildLimit failed, falling back to default 10:", e);
    }
    const birthDate = new Date(`${person.birthDate}T${time}:00`);
    const ext = buildChartExtensions(
      calc.pillars,
      new Date(),
      gender,
      birthDate,
      startAge,
      calc.geJu.structure || null,
      calc.strength.percent,
      calc.yongshen[0]?.element || null,
      yongshenTop3.length ? yongshenTop3 : calc.yongshen.map(y => y.element).filter(Boolean)
    );
    const idx = ext.current_luck_idx ?? 0;
    const lp = ext.luck_pillars?.[idx];
    if (!lp) return null;
    return { stem: lp.stem, branch: lp.branch, element: lp.element };
  } catch {
    return null;
  }
}

function luckText(lp: any, dm: string, yongshenPrimary: string[], xishen: string[] = [], diseases: string[] = []) {
  if (!lp) return null;
  const dmEl = STEM_EL[dm];
  const lpEl = lp.element || STEM_EL[lp.stem] || BR_EL[lp.branch];
  const th = EL_TH[lpEl] || lpEl || "";
  const dryHeat = diseases.includes("dry_resource_burned") || diseases.includes("hot_drought_no_water");
  if (yongshenPrimary.includes(lpEl)) return `${lp.stem}${lp.branch} · ดี (用神หลัก ${th})`;
  if (xishen.includes(lpEl)) {
    if (lpEl === "fire" && dryHeat) return `${lp.stem}${lp.branch} · โอกาสแต่ไฟแรง (${th})`;
    return `${lp.stem}${lp.branch} · ใช้ได้แบบมีเงื่อนไข (${th})`;
  }
  if (lpEl === dmEl) return `${lp.stem}${lp.branch} · กลาง (พลังเดียวกัน ${th})`;
  if ((REL_SCORE[dmEl]?.[lpEl] || 0) < 0) return `${lp.stem}${lp.branch} · กดดัน (${th})`;
  return `${lp.stem}${lp.branch} · เฉย (${th})`;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const date = String(body.date || new Date().toISOString().slice(0, 10));
  const person: PersonInput = body.person || {};
  const dm = person.pillars?.day?.stem || "";
  const natalBranch = person.pillars?.day?.branch || "";
  if (!dm || !person.pillars?.day) {
    return NextResponse.json({ error: "person.pillars.day required" }, { status: 400 });
  }

  const transit = await getPillarsForDate(date);
  const yongshenFromProfile = (person.yongshenTop3 || [])
    .map(x => x?.element)
    .filter((x): x is string => !!x)
    .slice(0, 3);
  const yv2 = await synthesizeWrapper7(person.pillars);
  const yongshenPrimary = yv2?.primary_yongshen?.length ? yv2.primary_yongshen : yongshenFromProfile;
  const xishen = yv2?.xishen || [];
  const jishen = yv2?.jishen || [];
  const diseases = yv2?.diseases || [];

  const userP = person.pillars as any;
  const day = scorePillar({ label:"วัน", dm, natalBranch, pillar: transit.day, yongshenTop3: yongshenPrimary, jishen, userPillars: userP });
  const month = scorePillar({ label:"เดือน", dm, natalBranch, pillar: transit.month, yongshenTop3: yongshenPrimary, jishen, userPillars: userP });
  const year = scorePillar({ label:"ปี", dm, natalBranch, pillar: transit.year, yongshenTop3: yongshenPrimary, jishen, userPillars: userP });

  const week = clamp(Math.round(day.score * 0.55 + month.score * 0.20 + 50 * 0.25));
  const lp = await currentLuckPillar(person, yongshenPrimary);
  let monthScore = month.score;
  let yearScore = year.score;
  const lpReasons: string[] = [];
  if (lp?.element) {
    const lpEl = lp.element;
    if (yongshenPrimary.includes(lpEl)) {
      monthScore = clamp(monthScore + 6);
      yearScore = clamp(yearScore + 10);
      lpReasons.push(`รอบดวงใหญ่ ${lp.stem}${lp.branch} เป็นธาตุ${EL_TH[lpEl] || lpEl}ที่ช่วยดวง จึงหนุนเดือน/ปี`);
    } else if (xishen.includes(lpEl)) {
      lpReasons.push(`รอบดวงใหญ่ ${lp.stem}${lp.branch} เป็น喜神รอง ต้องใช้ตามเงื่อนไข ไม่ใช่用神หลัก`);
    } else if ((REL_SCORE[STEM_EL[dm]]?.[lpEl] || 0) < 0) {
      monthScore = clamp(monthScore - 4);
      yearScore = clamp(yearScore - 8);
      lpReasons.push(`รอบดวงใหญ่ ${lp.stem}${lp.branch} ธาตุ${EL_TH[lpEl] || lpEl}กดตัวธาตุ จึงลดคะแนนพื้นหลัง`);
    } else {
      lpReasons.push(`รอบดวงใหญ่ ${lp.stem}${lp.branch} ธาตุ${EL_TH[lpEl] || lpEl} เป็นพื้นหลังกลาง`);
    }
  }

  const dmEl = STEM_EL[dm];
  const dayStemEl = STEM_EL[transit.day.stem];
  const dayBranchEl = BR_EL[transit.day.branch];
  const god = tenGod(dmEl, dayStemEl);
  const activity = activityFor(god);
  const yongHit = yongshenPrimary.find(e => e === dayStemEl || e === dayBranchEl);
  const xishenHit = xishen.find(e => e === dayStemEl || e === dayBranchEl);
  const dryHeat = diseases.includes("dry_resource_burned") || diseases.includes("hot_drought_no_water");
  const element = yongHit
    ? `ได้${EL_TH[yongHit] || yongHit}ช่วยจริง`
    : xishenHit && xishenHit === "fire" && dryHeat
      ? `ไฟมีโอกาสแต่แรง ต้องคุม`
    : xishenHit
      ? `${EL_TH[xishenHit] || xishenHit}ใช้ได้แบบมีเงื่อนไข`
    : god === "guansha" ? `${EL_TH[dayStemEl]}กดดัน`
    : god === "cai" ? `${EL_TH[dayStemEl]}เปิดเรื่องเงิน`
    : god === "shishang" ? `${EL_TH[dayStemEl]}ระบายผลงาน`
    : god === "yin" ? `${EL_TH[dayStemEl]}เสริมพลัง`
    : god === "bijie" ? `${EL_TH[dayStemEl]}ทีม·พลังเดิม`
    : "กลาง";

  const avoid = day.score < 45
    ? "เจรจาใหญ่ · เซ็นสัญญา"
    : day.score < 55
      ? "เริ่มเรื่องเสี่ยง"
      : activity.avoid;

  const reasons = [
    `ตัวธาตุ ${dm}${EL_TH[dmEl] || dmEl} เทียบเสาวัน ${pillarName(transit.day)}`,
    ...day.reasons,
    ...lpReasons,
  ].slice(0, 5);

  return NextResponse.json({
    date,
    person_id: person.id || null,
    pillars: {
      day: pillarName(transit.day),
      month: pillarName(transit.month),
      year: pillarName(transit.year),
    },
    scores: { day: day.score, week, month: monthScore, year: yearScore },
    insight: {
      element,
      suitable: activity.suitable,
      avoid,
      lp: luckText(lp, dm, yongshenPrimary, xishen, diseases),
      reason: reasons,
      evidence: {
        dm,
        dm_element: dmEl,
        day_pillar: pillarName(transit.day),
        day_stem_element: dayStemEl,
        day_branch_element: dayBranchEl,
        ten_god: god,
        yongshen_from_profile: yongshenFromProfile,
        yongshen_primary: yongshenPrimary,
        xishen,
        jishen,
        diseases,
        luck_pillar: lp ? pillarName(lp) : null,
      },
    },
  });
}
