/**
 * POST /api/today/directions
 *
 * รับ: { date: 'YYYY-MM-DD', userChart?: { day:{stem,branch}, ... }, yongshen?: 'wood'|'fire'|'earth'|'metal'|'water' }
 * คืน: { directions: [{direction, quality}] }
 *
 * 8 ทิศมงคล · ใช้ 用神 element ของ user เป็นทิศหลัก · day pillar เป็นทิศรอง
 */
import { NextResponse } from "next/server";

const STEM_ELEMENT: Record<string, "wood"|"fire"|"earth"|"metal"|"water"> = {
  甲:"wood",乙:"wood",丙:"fire",丁:"fire",戊:"earth",己:"earth",
  庚:"metal",辛:"metal",壬:"water",癸:"water",
};
const BRANCH_ELEMENT: Record<string, "wood"|"fire"|"earth"|"metal"|"water"> = {
  子:"water", 丑:"earth", 寅:"wood", 卯:"wood", 辰:"earth", 巳:"fire",
  午:"fire", 未:"earth", 申:"metal", 酉:"metal", 戌:"earth", 亥:"water",
};
const ELEMENT_CONTROLS: Record<string,string> = {wood:"earth",earth:"water",water:"fire",fire:"metal",metal:"wood"};
const ELEMENT_PRODUCES: Record<string,string> = {wood:"fire",fire:"earth",earth:"metal",metal:"water",water:"wood"};

/* 8 ทิศ × ธาตุประจำ (Later Heaven Ba Gua) */
const DIRECTION_ELEMENT: Record<string, "wood"|"fire"|"earth"|"metal"|"water"> = {
  N:"water",  /* 坎 北 */
  NE:"earth", /* 艮 東北 */
  E:"wood",   /* 震 東 */
  SE:"wood",  /* 巽 東南 */
  S:"fire",   /* 離 南 */
  SW:"earth", /* 坤 西南 */
  W:"metal",  /* 兌 西 */
  NW:"metal", /* 乾 西北 */
};

/* 17 พ.ค. · 5 神煞 ทิศ ตำราหวงลี่ 协纪辨方书 · ตาม day stem
 * 喜神 财神 福神 阳贵 阴贵 — ดาวมงคลประจำวัน · กำหนดทิศ */
const BRANCH_TO_DIR: Record<string, string> = {
  子:"N", 丑:"NE", 寅:"NE", 卯:"E", 辰:"SE", 巳:"SE",
  午:"S", 未:"SW", 申:"SW", 酉:"W", 戌:"NW", 亥:"NW",
};
const BAGUA_TO_DIR: Record<string, string> = {
  '艮':"NE", '震':"E", '巽':"SE", '離':"S", '离':"S",
  '坤':"SW", '兌':"W", '兑':"W", '乾':"NW", '坎':"N",
};
const XISHEN_BY_STEM: Record<string, string> = { 甲:"艮", 己:"艮", 乙:"乾", 庚:"乾", 丙:"坤", 辛:"坤", 丁:"離", 壬:"離", 戊:"巽", 癸:"巽" };
const CAISHEN_BY_STEM: Record<string, string> = { 甲:"艮", 乙:"艮", 丙:"巽", 丁:"巽", 戊:"離", 己:"離", 庚:"坤", 辛:"坤", 壬:"乾", 癸:"乾" };
const FUSHEN_BY_STEM: Record<string, string> = { 甲:"乾", 乙:"乾", 丙:"艮", 丁:"艮", 戊:"巽", 己:"巽", 庚:"離", 辛:"離", 壬:"坤", 癸:"坤" };
const YANGGUI_BY_STEM: Record<string, string> = { 甲:"未", 乙:"申", 丙:"酉", 丁:"亥", 戊:"丑", 己:"子", 庚:"丑", 辛:"寅", 壬:"卯", 癸:"巳" };
const YINGUI_BY_STEM:  Record<string, string> = { 甲:"丑", 乙:"子", 丙:"亥", 丁:"酉", 戊:"未", 己:"申", 庚:"未", 辛:"午", 壬:"巳", 癸:"卯" };
function dayStars(dayStem: string): Array<{dir: string; name: string; han: string; good: boolean}> {
  const stars: Array<{dir: string; name: string; han: string; good: boolean}> = [];
  const m: Array<[Record<string,string>, string, string]> = [
    [XISHEN_BY_STEM,  '喜神', 'happiness'],
    [CAISHEN_BY_STEM, '财神', 'wealth'],
    [FUSHEN_BY_STEM,  '福神', 'fortune'],
  ];
  m.forEach(([map, name, _key]) => {
    const bagua = map[dayStem];
    const dir = bagua ? BAGUA_TO_DIR[bagua] : null;
    if (dir) stars.push({ dir, name, han: name, good: true });
  });
  const yg = YANGGUI_BY_STEM[dayStem];
  if (yg) { const d = BRANCH_TO_DIR[yg]; if (d) stars.push({ dir: d, name: '阳贵', han: '阳贵', good: true }); }
  const ig = YINGUI_BY_STEM[dayStem];
  if (ig) { const d = BRANCH_TO_DIR[ig]; if (d) stars.push({ dir: d, name: '阴贵', han: '阴贵', good: true }); }
  return stars;
}

/* คุณภาพทิศ · เทียบกับ yongshen หรือ DM */
function qualityFor(yongshen: string | null, dmEl: string, dirEl: string): "best"|"good"|"ok"|"avoid" {
  /* yongshen เป็นแกนหลัก */
  if (yongshen && dirEl === yongshen) return "best";
  if (yongshen && ELEMENT_PRODUCES[dirEl] === yongshen) return "good";
  /* DM-based fallback */
  if (dmEl && dirEl === dmEl) return "good";
  if (dmEl && ELEMENT_PRODUCES[dirEl] === dmEl) return "good"; /* resource */
  if (dmEl && ELEMENT_CONTROLS[dirEl] === dmEl) return "avoid"; /* power · attacks DM */
  return "ok";
}

const DIR_TH: Record<string,string> = {
  N:"เหนือ", NE:"ตอ.เฉียงเหนือ", E:"ตะวันออก", SE:"ตอ.เฉียงใต้",
  S:"ใต้",   SW:"ตต.เฉียงใต้",   W:"ตะวันตก", NW:"ตต.เฉียงเหนือ",
};
const DIR_ZH: Record<string,string> = {
  N:"北", NE:"東北", E:"東", SE:"東南",
  S:"南", SW:"西南", W:"西", NW:"西北",
};

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const date: string = body.date || new Date().toISOString().slice(0, 10);
  const userChart = body.userChart;
  const dmStem: string | undefined = userChart?.day?.stem;
  const dmEl = dmStem ? STEM_ELEMENT[dmStem] : "";
  const yongshen: string | null = body.yongshen || null;

  const [yy, mm, dd] = date.split("-").map(Number);
  if (!yy || !mm || !dd) return NextResponse.json({ error: "invalid date" }, { status: 400 });

  /* day pillar เพื่อปรับ direction tilt (วันนี้ธาตุไหนเด่น) */
  const tyme = await import("tyme4ts");
  const st = tyme.SolarTime.fromYmdHms(yy, mm, dd, 12, 0, 0);
  const dayPillar = st.getLunarHour().getEightChar().getDay().getName();
  const dayBranch = dayPillar[1];
  const dayBranchEl = BRANCH_ELEMENT[dayBranch];

  /* 17 พ.ค. · day-stem-based 5 神煞 ทิศ (喜神/财神/福神/阳贵/阴贵) */
  const dayStem = dayPillar[0];
  const stars = dayStars(dayStem);
  const starsByDir: Record<string, Array<{name:string;han:string;good:boolean}>> = {};
  stars.forEach(s => { (starsByDir[s.dir] = starsByDir[s.dir] || []).push({name:s.name,han:s.han,good:s.good}); });

  const DIRS: Array<keyof typeof DIRECTION_ELEMENT> = ["N","NE","E","SE","S","SW","W","NW"];
  const directions = DIRS.map(d => {
    const el = DIRECTION_ELEMENT[d];
    let q = qualityFor(yongshen, dmEl, el);
    /* boost ทิศที่ตรงกับธาตุกิ่งวันนี้ (day branch element) */
    if (el === dayBranchEl && q === "ok") q = "good";
    /* 17 พ.ค. · ดาวมงคล day-based override (ตำราอากง) */
    const dStars = starsByDir[d] || [];
    if (dStars.length >= 2) q = "best";       /* 2+ ดาวมงคล = ดีเลิศ */
    else if (dStars.length === 1) {
      if (q === "avoid") q = "ok";            /* ดาวเดี่ยวลบ avoid → ok */
      else if (q === "ok") q = "good";
      else if (q === "good") q = "best";
    }
    return {
      direction: d,
      direction_th: DIR_TH[d],
      direction_zh: DIR_ZH[d],
      element: el,
      quality: q,
      stars: dStars,
    };
  });

  const summary = {
    good: directions
      .filter(d => d.quality === "best" || d.quality === "good")
      .map(d => d.direction),
    avoid: directions
      .filter(d => d.quality === "avoid")
      .map(d => d.direction),
  };

  return NextResponse.json({ date, dayBranch, dayBranchEl, yongshen, directions, summary });
}
