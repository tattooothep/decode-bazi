/**
 * POST /api/today/directions
 *
 * รับ: { date: 'YYYY-MM-DD', school?: 'chaibu'|'zhirun', userChart?: { day:{stem,branch}, ... } }
 * คืน: legacy directions + direction_energy (ฉีเหมิน + จื่อไป๋ ไม่รวมดวงคน)
 *
 * legacy directions ยังรองรับ 用神/DM เดิมเพื่อไม่ให้หน้าเก่าพัง
 */
import { NextResponse } from "next/server";
import { computeFlyingLayers } from "@/lib/fengshui-luxing";
import { entitlementDenied } from "@/lib/product-entitlement";
import { withinDayWindow } from "@/lib/product-date-gate";
import { currentRequestProductAccess, nextRequiredPlan } from "@/lib/product-request-access";

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
const QIMEN_BASE = process.env.QIMEN_API_URL || "http://localhost:4090";
const SCHOOL_TO_PROFILE: Record<string, number> = {
  chaibu: 1,  // 拆補 · ใช้ดูสถานการณ์เฉพาะหน้า
  zhirun: 4,  // 置閏 · ใช้ดูรอบ/เหตุการณ์ใหญ่
};
function resolveSchool(v: unknown): "chaibu"|"zhirun" {
  const s = String(v || "chaibu").toLowerCase();
  return s === "zhirun" ? "zhirun" : "chaibu";
}

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
const DIR_TH_LONG: Record<string,string> = {
  N:"ทิศเหนือ", NE:"ทิศตะวันออกเฉียงเหนือ", E:"ทิศตะวันออก", SE:"ทิศตะวันออกเฉียงใต้",
  S:"ทิศใต้", SW:"ทิศตะวันตกเฉียงใต้", W:"ทิศตะวันตก", NW:"ทิศตะวันตกเฉียงเหนือ",
};
const DIR_ZH: Record<string,string> = {
  N:"北", NE:"東北", E:"東", SE:"東南",
  S:"南", SW:"西南", W:"西", NW:"西北",
};
const DIR_TH_FULL: Record<string,string> = { ...DIR_TH, C:"กลาง" };
const DIR_ZH_FULL: Record<string,string> = { ...DIR_ZH, C:"中" };

const QIMEN_CACHE_TTL = 30 * 60 * 1000;
const qimenCache = new Map<string, { expires: number; data: any }>();

const QIMEN_DOOR_SCORE: Record<string, number> = {
  XIU_MEN: 9, SHENG_MEN: 10, KAI_MEN: 10,
  JING_VIEW_MEN: 4, DU_MEN: -1,
  SHANG_MEN: -7, JING_FEAR_MEN: -7, SI_MEN: -10,
};
const QIMEN_STAR_SCORE: Record<string, number> = {
  TIAN_XIN: 8, TIAN_FU: 7, TIAN_REN: 5, TIAN_QIN: 4,
  TIAN_CHONG: 1, TIAN_YING: -3, TIAN_ZHU: -4,
  TIAN_PENG: -7, TIAN_RUI: -8,
};
const QIMEN_DEITY_SCORE: Record<string, number> = {
  ZHI_FU: 8, TAI_YIN: 7, LIU_HE: 7, JIU_TIAN: 5, JIU_DI: 4,
  TENG_SHE: -5, XUAN_WU: -6, BAI_HU: -8,
};
const QIMEN_DOOR_TH: Record<string, string> = {
  XIU_MEN: "ประตูพัก", SHENG_MEN: "ประตูเกิด", KAI_MEN: "ประตูเปิด",
  JING_VIEW_MEN: "ประตูภาพลักษณ์", DU_MEN: "ประตูปิด",
  SHANG_MEN: "ประตูบาดเจ็บ", JING_FEAR_MEN: "ประตูตื่นตกใจ", SI_MEN: "ประตูตาย",
};
const QIMEN_STAR_TH: Record<string, string> = {
  TIAN_XIN: "ดาวเทียนซิน", TIAN_FU: "ดาวเทียนฝู่", TIAN_REN: "ดาวเทียนเหริน", TIAN_QIN: "ดาวเทียนฉิน",
  TIAN_CHONG: "ดาวเทียนชง", TIAN_YING: "ดาวเทียนอิง", TIAN_ZHU: "ดาวเทียนจู้",
  TIAN_PENG: "ดาวเทียนเผิง", TIAN_RUI: "ดาวเทียนรุ่ย",
};
const QIMEN_DEITY_TH: Record<string, string> = {
  ZHI_FU: "เทพจื๋อฟู", TAI_YIN: "เทพไท่อิน", LIU_HE: "เทพลิ่วเหอ", JIU_TIAN: "เทพจิ่วเทียน", JIU_DI: "เทพจิ่วตี้",
  TENG_SHE: "เทพเถิงเสอ", XUAN_WU: "เทพเสวียนอู่", BAI_HU: "เทพไป๋หู่",
};
/* r420 · i18n additive · EN terms — ชุดเดียวกับ QIMEN_TERM_EN ใน /api/auspicious (ศัพท์ Qi Men วงการจริง) · ไม่แตะ logic */
const QIMEN_DOOR_EN: Record<string, string> = {
  XIU_MEN: "Rest Gate", SHENG_MEN: "Life Gate", KAI_MEN: "Open Gate",
  JING_VIEW_MEN: "Scenery Gate", DU_MEN: "Closed Gate",
  SHANG_MEN: "Injury Gate", JING_FEAR_MEN: "Fear Gate", SI_MEN: "Death Gate",
};
const QIMEN_STAR_EN: Record<string, string> = {
  TIAN_XIN: "Tian Xin star", TIAN_FU: "Tian Fu star", TIAN_REN: "Tian Ren star", TIAN_QIN: "Tian Qin star",
  TIAN_CHONG: "Tian Chong star", TIAN_YING: "Tian Ying star", TIAN_ZHU: "Tian Zhu star",
  TIAN_PENG: "Tian Peng star", TIAN_RUI: "Tian Rui star",
};
const QIMEN_DEITY_EN: Record<string, string> = {
  ZHI_FU: "Chief (Zhi Fu)", TAI_YIN: "Great Yin", LIU_HE: "Six Harmony", JIU_TIAN: "Nine Heavens", JIU_DI: "Nine Earth",
  TENG_SHE: "Coiling Snake", XUAN_WU: "Black Tortoise", BAI_HU: "White Tiger",
};
const QIMEN_QUALITY_LABEL: Record<string, string> = {
  best: "ดีมาก", good: "ดี", ok: "กลาง", avoid: "เลี่ยง",
};
const QIMEN_QUALITY_LABEL_EN: Record<string, string> = {
  best: "Excellent", good: "Good", ok: "Neutral", avoid: "Avoid",
};
const QIMEN_QUALITY_LABEL_ZH: Record<string, string> = {
  best: "極佳", good: "吉", ok: "平", avoid: "忌",
};
const DIR_EN: Record<string,string> = {
  N:"North", NE:"Northeast", E:"East", SE:"Southeast",
  S:"South", SW:"Southwest", W:"West", NW:"Northwest",
};
const DIR_EN_FULL: Record<string,string> = { ...DIR_EN, C:"Center" };

const FLYING_FOCUS_STARS = [5, 2, 9, 1];
const FLYING_STAR_META: Record<number, { zh: string; th: string; en: string; quality: "good"|"bad" }> = {
  5: { zh: "五黃", th: "ห้าเหลือง", en: "Five Yellow", quality: "bad" },
  2: { zh: "二黑", th: "สองดำ", en: "Two Black", quality: "bad" },
  9: { zh: "九紫", th: "เก้าม่วง", en: "Nine Purple", quality: "good" },
  1: { zh: "一白", th: "หนึ่งขาว", en: "One White", quality: "good" },
};
const ZIBAI_DELTA: Record<number, number> = { 5: -30, 2: -24, 9: 22, 1: 16 };

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function layerSignal(delta: number): string {
  if (delta >= 25) return "+++++";
  if (delta >= 18) return "++++";
  if (delta >= 10) return "+++";
  if (delta >= 4) return "++";
  if (delta <= -25) return "-----";
  if (delta <= -18) return "----";
  if (delta <= -10) return "---";
  if (delta <= -4) return "--";
  return "0";
}

function energyLabel(score: number): "best"|"good"|"ok"|"caution"|"avoid" {
  if (score >= 85) return "best";
  if (score >= 70) return "good";
  if (score >= 55) return "ok";
  if (score >= 40) return "caution";
  return "avoid";
}

function bangkokNowParts() {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date()).filter(p => p.type !== "literal").map(p => [p.type, p.value])
  );
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${hour}:${parts.minute}` };
}

function parseClock(time: unknown): { h: number; m: number } {
  const txt = typeof time === "string" && /^\d{2}:\d{2}$/.test(time) ? time : "12:00";
  const [h, m] = txt.split(":").map(Number);
  return { h: Number.isFinite(h) ? h : 12, m: Number.isFinite(m) ? m : 0 };
}

async function callQimen(date: string, time: string, lng: number, lat: number, school: "chaibu"|"zhirun"): Promise<any | null> {
  const datetime = `${date}T${time}:00`;
  const profileId = SCHOOL_TO_PROFILE[school];
  const key = `${datetime}|${lng.toFixed(4)}|${lat.toFixed(4)}|${profileId}`;
  const cached = qimenCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.data;
  try {
    const r = await fetch(`${QIMEN_BASE}/api/qimen/calculate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "decode-app/1.0" },
      body: JSON.stringify({ datetime, longitude: lng, latitude: lat, profile_id: profileId }),
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return null;
    const j = await r.json().catch(() => null);
    const data = j?.data || j;
    if (!data?.palaces) return null;
    qimenCache.set(key, { expires: Date.now() + QIMEN_CACHE_TTL, data });
    if (qimenCache.size > 500) {
      const oldest = Array.from(qimenCache.entries()).sort((a, b) => a[1].expires - b[1].expires).slice(0, 50);
      oldest.forEach(([k]) => qimenCache.delete(k));
    }
    return data;
  } catch {
    return null;
  }
}

function qimenQuality(score: number): "best"|"good"|"ok"|"avoid" {
  if (score >= 16) return "best";
  if (score >= 7) return "good";
  if (score >= 0) return "ok";
  return "avoid";
}

function summarizeQimenPalace(p: any) {
  const doorScore = QIMEN_DOOR_SCORE[p.door_code] ?? 0;
  const starScore = QIMEN_STAR_SCORE[p.star_code] ?? 0;
  const deityScore = QIMEN_DEITY_SCORE[p.deity_code] ?? 0;
  let score = doorScore + starScore + deityScore;
  const reasons: string[] = [];
  /* r420 · reasons_en คู่ขนาน (additive) · reasons เดิมเป็น 中文 ใช้กับ zh ได้อยู่แล้ว */
  const reasonsEn: string[] = [];
  if (doorScore) { reasons.push(`${p.door_zh || p.door_code} ${doorScore > 0 ? "+" : ""}${doorScore}`); reasonsEn.push(`${QIMEN_DOOR_EN[p.door_code] || p.door_zh || p.door_code} ${doorScore > 0 ? "+" : ""}${doorScore}`); }
  if (starScore) { reasons.push(`${p.star_zh || p.star_code} ${starScore > 0 ? "+" : ""}${starScore}`); reasonsEn.push(`${QIMEN_STAR_EN[p.star_code] || p.star_zh || p.star_code} ${starScore > 0 ? "+" : ""}${starScore}`); }
  if (deityScore) { reasons.push(`${p.deity_zh || p.deity_code} ${deityScore > 0 ? "+" : ""}${deityScore}`); reasonsEn.push(`${QIMEN_DEITY_EN[p.deity_code] || p.deity_zh || p.deity_code} ${deityScore > 0 ? "+" : ""}${deityScore}`); }
  if (p.heaven_is_three_qi) { score += 3; reasons.push(`天三奇${p.heaven_stem_zh || ""} +3`); reasonsEn.push(`Heaven Three Nobles ${p.heaven_stem_zh || ""} +3`); }
  if (p.earth_is_three_qi) { score += 2; reasons.push(`地三奇${p.earth_stem_zh || ""} +2`); reasonsEn.push(`Earth Three Nobles ${p.earth_stem_zh || ""} +2`); }
  if (p.is_traveling_horse) { score += 2; reasons.push("驛馬 +2"); reasonsEn.push("Post Horse 驛馬 +2"); }
  if (p.is_void_any) { score -= 5; reasons.push("空亡 -5"); reasonsEn.push("Void (Kong Wang) 空亡 -5"); }
  if (p.stem_combo_quality === "severe") { score -= 4; reasons.push(`${p.stem_combo_name_zh || "凶格"} -4`); reasonsEn.push(`${p.stem_combo_name_zh || "凶格"} (inauspicious combo) -4`); }
  const quality = qimenQuality(score);
  return {
    direction: p.direction,
    direction_th: DIR_TH_FULL[p.direction] || p.direction,
    direction_th_long: DIR_TH_LONG[p.direction] || DIR_TH_FULL[p.direction] || p.direction,
    direction_zh: DIR_ZH_FULL[p.direction] || p.direction,
    direction_en: DIR_EN_FULL[p.direction] || p.direction,
    quality,
    label: QIMEN_QUALITY_LABEL[quality],
    label_en: QIMEN_QUALITY_LABEL_EN[quality],
    label_zh: QIMEN_QUALITY_LABEL_ZH[quality],
    score,
    palace_id: p.palace_id,
    door_score: doorScore,
    door: p.door_zh || p.door_code,
    door_th: QIMEN_DOOR_TH[p.door_code] || p.door_zh || p.door_code,
    door_en: QIMEN_DOOR_EN[p.door_code] || p.door_zh || p.door_code,
    star_score: starScore,
    star: p.star_zh || p.star_code,
    star_th: QIMEN_STAR_TH[p.star_code] || p.star_zh || p.star_code,
    star_en: QIMEN_STAR_EN[p.star_code] || p.star_zh || p.star_code,
    deity_score: deityScore,
    deity: p.deity_zh || p.deity_code,
    deity_th: QIMEN_DEITY_TH[p.deity_code] || p.deity_zh || p.deity_code,
    deity_en: QIMEN_DEITY_EN[p.deity_code] || p.deity_zh || p.deity_code,
    heaven_stem: p.heaven_stem_zh || null,
    earth_stem: p.earth_stem_zh || null,
    reasons,
    reasons_en: reasonsEn,
  };
}

async function buildQimenLayer(date: string, time: string, lng: number, lat: number, school: "chaibu"|"zhirun") {
  const data = await callQimen(date, time, lng, lat, school);
  if (!data?.palaces) return null;
  const directions = data.palaces
    .filter((p: any) => p.direction && p.direction !== "C")
    .map(summarizeQimenPalace)
    .sort((a: any, b: any) => b.score - a.score);
  return {
    time,
    chart: {
      pillar: data.chart?.pillar_zh || data.calculation?.pillars?.hourPillarZh || null,
      dun_type: data.chart?.dun_type || null,
      ju_number: data.chart?.ju_number || null,
    },
    directions,
    good: directions.filter((d: any) => d.quality === "best" || d.quality === "good").slice(0, 4),
    avoid: directions.filter((d: any) => d.quality === "avoid").slice(-4).reverse(),
  };
}

function summarizeFlyingLayer(layer: any) {
  if (!layer?.palaces) return null;
  const entries = Object.entries(layer.palaces) as Array<[string, number]>;
  const stars = FLYING_FOCUS_STARS.map(star => {
    const dirs = entries
      .filter(([, n]) => Number(n) === star)
      .map(([dir]) => ({
        direction: dir,
        direction_th: DIR_TH_FULL[dir] || dir,
        direction_th_long: DIR_TH_LONG[dir] || DIR_TH_FULL[dir] || dir,
        direction_zh: DIR_ZH_FULL[dir] || dir,
        direction_en: DIR_EN_FULL[dir] || dir,
      }));
    const meta = FLYING_STAR_META[star];
    return {
      star,
      zh: meta.zh,
      th: meta.th,
      en: meta.en,
      quality: meta.quality,
      direction: dirs[0]?.direction || null,
      direction_th: dirs[0]?.direction_th || null,
      direction_th_long: dirs[0]?.direction_th_long || null,
      direction_zh: dirs[0]?.direction_zh || null,
      direction_en: dirs[0]?.direction_en || null,
    };
  });
  return {
    center: layer.center,
    direction: layer.direction,
    dun: layer.dun || null,
    day_pillar: layer.day_pillar || null,
    hour_branch: layer.hour_branch || null,
    stars,
    good: stars.filter(s => s.quality === "good"),
    avoid: stars.filter(s => s.quality === "bad"),
  };
}

function buildFlyingFocus(date: string, hourTime: string) {
  const [yy, mm, dd] = date.split("-").map(Number);
  const hourClock = parseClock(hourTime);
  const dayLayers = computeFlyingLayers(yy, mm, dd, 12, 0, 0, "zaoming");
  const hourLayers = computeFlyingLayers(yy, mm, dd, hourClock.h, hourClock.m, 0, "zaoming");
  return {
    day: summarizeFlyingLayer(dayLayers.day_stars),
    hour: summarizeFlyingLayer(hourLayers.hour_stars),
    note: hourLayers.luxing_note,
  };
}

function qimenScore100(p: any | null | undefined): number {
  if (!p) return 50;
  return clamp(50 + 1.2 * Number(p.score || 0), 0, 100);
}

function zibaiScore100(star: number | null | undefined): number {
  if (!star) return 50;
  return clamp(50 + (ZIBAI_DELTA[Number(star)] || 0), 0, 100);
}

function findQimen(layer: any, dir: string) {
  return layer?.directions?.find((x: any) => x.direction === dir) || null;
}

function findZibai(layer: any, dir: string) {
  return layer?.stars?.find((x: any) => x.direction === dir) || null;
}

function buildDirectionEnergy(opts: {
  school: "chaibu"|"zhirun";
  date: string;
  hourTime: string;
  qimenDay: any;
  qimenHour: any;
  flyingFocus: any;
  hasUserChart: boolean;
}) {
  const qimenSource = opts.qimenDay && opts.qimenHour
    ? "qimen-api"
    : (opts.qimenDay || opts.qimenHour) ? "qimen-api-partial" : "unavailable";
  const scores = (Object.keys(DIRECTION_ELEMENT) as Array<keyof typeof DIRECTION_ELEMENT>).map(dir => {
    const qd = findQimen(opts.qimenDay, dir);
    const qh = findQimen(opts.qimenHour, dir);
    const qDayScore = qimenScore100(qd);
    const qHourScore = qimenScore100(qh);
    const qimenScore = Math.round(0.4 * qDayScore + 0.6 * qHourScore);
    const qimenDelta = qimenScore - 50;

    const zd = findZibai(opts.flyingFocus?.day, dir);
    const zh = findZibai(opts.flyingFocus?.hour, dir);
    const zDayScore = zibaiScore100(zd?.star);
    const zHourScore = zibaiScore100(zh?.star);
    let zibaiScore = Math.round(0.45 * zDayScore + 0.55 * zHourScore);
    let raw = Math.round(0.7 * qimenScore + 0.3 * zibaiScore);

    const starNums = [zd?.star, zh?.star].filter((n): n is number => Number.isFinite(Number(n))).map(Number);
    const hasFive = starNums.includes(5);
    const hasTwo = starNums.includes(2);
    const hasNineOrOne = starNums.some(n => n === 9 || n === 1);
    const caps: string[] = [];
    /* r420 · caps_en/caps_zh คู่ขนาน (additive) — push พร้อมกันทุกจุด · ไม่แตะเงื่อนไข/ตัวเลข */
    const capsEn: string[] = [];
    const capsZh: string[] = [];
    if (hasFive && hasTwo) { raw = Math.min(raw, 60); caps.push("มีทั้ง 五黃 5 และ 二黑 2"); capsEn.push("Both Five Yellow 5 and Two Black 2 present"); capsZh.push("五黃5與二黑2並臨"); }
    else if (hasFive) { raw = Math.min(raw, 72); caps.push("มี 五黃 5"); capsEn.push("Five Yellow 5 present"); capsZh.push("五黃5臨方"); }
    else if (hasTwo) { raw = Math.min(raw, 78); caps.push("มี 二黑 2"); capsEn.push("Two Black 2 present"); capsZh.push("二黑2臨方"); }
    if ((qh?.quality === "avoid" || qd?.quality === "avoid") && (hasFive || hasTwo)) {
      raw = Math.min(raw, 55);
      caps.push("ฉีเหมินติดเลี่ยงและมีดาวจรกด");
      capsEn.push("Qi Men marks avoid and an afflicted flying star adds pressure");
      capsZh.push("奇門顯忌且凶飛星加壓");
    }
    if ((qh?.quality === "best" || qd?.quality === "best") && hasNineOrOne && !hasFive && !hasTwo) {
      raw = Math.min(100, raw + 3);
    }
    const score = clamp(raw, 0, 100);
    const label = energyLabel(score);
    return {
      direction: dir,
      direction_th: DIR_TH[dir],
      direction_th_long: DIR_TH_LONG[dir],
      direction_zh: DIR_ZH[dir],
      direction_en: DIR_EN[dir],
      score,
      label,
      label_th: { best: "ดีมาก", good: "ดี", ok: "กลางบวก", caution: "ระวัง", avoid: "เลี่ยง" }[label],
      label_en: { best: "Excellent", good: "Good", ok: "Mild positive", caution: "Caution", avoid: "Avoid" }[label],
      label_zh: { best: "極佳", good: "吉", ok: "平吉", caution: "謹慎", avoid: "忌" }[label],
      qimen: {
        score: qimenScore,
        signal: layerSignal(qimenDelta),
        day: qd,
        hour: qh,
      },
      zibai: {
        score: zibaiScore,
        signal: layerSignal(zibaiScore - 50),
        day: zd || null,
        hour: zh || null,
      },
      caps,
      caps_en: capsEn,
      caps_zh: capsZh,
      reasons: [
        qh ? `${qh.door_th} ${qh.door}` : null,
        zh ? `${zh.star} ${zh.th}` : null,
        caps[0] ? `จำกัดคะแนน: ${caps.join(" · ")}` : null,
      ].filter(Boolean),
      reasons_en: [
        qh ? `${qh.door_en || qh.door_th} ${qh.door}` : null,
        zh ? `${zh.star} ${zh.en || zh.th}` : null,
        capsEn[0] ? `Score capped: ${capsEn.join(" · ")}` : null,
      ].filter(Boolean),
      reasons_zh: [
        qh ? `${qh.door}` : null,
        zh ? `${zh.star} ${zh.zh || ""}`.trim() : null,
        capsZh[0] ? `封頂：${capsZh.join(" · ")}` : null,
      ].filter(Boolean),
    };
  }).sort((a, b) => b.score - a.score);
  return {
    school: opts.school,
    school_label: opts.school === "zhirun" ? "置閏 Zhirun" : "拆補 Chaibu",
    school_use_th: opts.school === "zhirun" ? "ดูเหตุการณ์ใหญ่ / รอบใหญ่" : "ดูสถานการณ์เฉพาะหน้า",
    school_use_en: opts.school === "zhirun" ? "For major events / long cycles" : "For immediate situations",
    school_use_zh: opts.school === "zhirun" ? "看大事／大週期" : "看眼前情況",
    updated_time: opts.hourTime,
    date: opts.date,
    scoring_note: "พลังทิศ = ฉีเหมิน 70% + ดาวจรจื่อไป๋ 30% · ไม่รวมดวงคน",
    scoring_note_en: "Direction power = Qi Men 70% + Zi Bai flying stars 30% · personal chart not included",
    scoring_note_zh: "方位能量 = 奇門70% + 紫白飛星30% · 不含個人命盤",
    source: {
      qimen: qimenSource,
      zibai: opts.flyingFocus?.hour || opts.flyingFocus?.day ? "local-luxing" : "unavailable",
      degraded: qimenSource !== "qimen-api",
      note_th: qimenSource === "qimen-api"
        ? "ใช้ฉีเหมินจริงครบทั้งรายวันและรายยาม"
        : qimenSource === "qimen-api-partial"
          ? "ฉีเหมินมาไม่ครบ จึงถ่วงคะแนนจากข้อมูลที่มี"
          : "ฉีเหมินไม่พร้อม คะแนนจึงอิงจื่อไป๋ร่วมกับค่ากลาง",
      note_en: qimenSource === "qimen-api"
        ? "Full Qi Men data used for both day and hour charts"
        : qimenSource === "qimen-api-partial"
          ? "Qi Men data was incomplete; scores are weighted from what is available"
          : "Qi Men unavailable; scores rely on Zi Bai plus neutral baseline",
      note_zh: qimenSource === "qimen-api"
        ? "日盤與時盤均採用完整奇門資料"
        : qimenSource === "qimen-api-partial"
          ? "奇門資料不全，以現有資料加權計分"
          : "奇門未就緒，計分以紫白與中性基準為主",
    },
    personal_overlay: {
      included_in_energy_score: false,
      available: opts.hasUserChart,
      note_th: opts.hasUserChart
        ? "มีดวงส่วนตัวแล้ว แต่แยกจากคะแนนพลังทิศ"
        : "ยังไม่มีดวงส่วนตัวใน request จึงแสดงเฉพาะพลังทิศกลาง",
      note_en: opts.hasUserChart
        ? "Personal chart provided, but kept separate from the direction score"
        : "No personal chart in this request, so only the neutral direction power is shown",
      note_zh: opts.hasUserChart
        ? "已有個人命盤，但與方位能量分數分開計算"
        : "本次請求無個人命盤，僅顯示中性方位能量",
    },
    best: scores.slice(0, 3),
    avoid: scores.filter(s => s.label === "avoid" || s.label === "caution").slice(-4).reverse(),
    scores,
  };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const date: string = body.date || new Date().toISOString().slice(0, 10);
  const userChart = body.userChart;
  const dmStem: string | undefined = userChart?.day?.stem;
  const dmEl = dmStem ? STEM_ELEMENT[dmStem] : "";
  const yongshen: string | null = body.yongshen || null;
  const lng = Number(body.lng ?? body.longitude ?? 100.5018);
  const lat = Number(body.lat ?? body.latitude ?? 13.7563);
  const school = resolveSchool(body.school);
  const bkk = bangkokNowParts();
  const hourTime = typeof body.time === "string" && /^\d{2}:\d{2}$/.test(body.time) ? body.time : bkk.time;

  const [yy, mm, dd] = date.split("-").map(Number);
  if (!yy || !mm || !dd) return NextResponse.json({ error: "invalid date" }, { status: 400 });
  const product = await currentRequestProductAccess(req);
  const todayCaps = product.pages.today;
  if (!withinDayWindow(date, todayCaps.day_window)) {
    return NextResponse.json(
      entitlementDenied("today_date_window", { plan: product.plan, max_days: todayCaps.day_window }),
      { status: 403 }
    );
  }

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
      direction_th_long: DIR_TH_LONG[d],
      direction_zh: DIR_ZH[d],
      direction_en: DIR_EN[d],
      element: el,
      quality: q,
      stars: dStars,
    };
  });

  const [qimenDay, qimenHour] = await Promise.all([
    buildQimenLayer(date, "12:00", lng, lat, school),
    buildQimenLayer(date, hourTime, lng, lat, school),
  ]);
  const flyingFocus = buildFlyingFocus(date, hourTime);
  const directionEnergy = buildDirectionEnergy({
    school,
    date,
    hourTime,
    qimenDay,
    qimenHour,
    flyingFocus,
    hasUserChart: !!userChart,
  });

  const directionLimit = Math.max(0, Math.min(8, todayCaps.directions));
  const allowedDirections = new Set(
    directionEnergy.scores.slice(0, directionLimit).map((entry: any) => entry.direction)
  );
  const requiredPlan = nextRequiredPlan(product.plan);
  const publicDirection = (entry: any) => {
    if (allowedDirections.has(entry.direction)) return { ...entry, locked: false };
    return {
      direction: entry.direction,
      direction_th: entry.direction_th,
      direction_th_long: entry.direction_th_long,
      direction_zh: entry.direction_zh,
      direction_en: entry.direction_en,
      locked: true,
      required_plan: requiredPlan,
    };
  };
  const publicQimenLayer = (layer: any) => {
    if (!layer) return null;
    const layerDirections = (layer.directions || []).map(publicDirection);
    return {
      ...layer,
      directions: layerDirections,
      good: layerDirections.filter((entry: any) => !entry.locked && (entry.quality === "best" || entry.quality === "good")).slice(0, 4),
      avoid: layerDirections.filter((entry: any) => !entry.locked && entry.quality === "avoid").slice(-4).reverse(),
    };
  };
  const publicDirections = directions.map(publicDirection);
  const publicEnergyScores = directionEnergy.scores.map(publicDirection);
  const publicDirectionEnergy = {
    ...directionEnergy,
    scores: publicEnergyScores,
    best: publicEnergyScores.filter((entry: any) => !entry.locked).slice(0, 3),
    avoid: publicEnergyScores
      .filter((entry: any) => !entry.locked && (entry.label === "avoid" || entry.label === "caution"))
      .slice(-4)
      .reverse(),
  };

  return NextResponse.json({
    date,
    dayBranch,
    dayBranchEl,
    yongshen,
    directions: publicDirections,
    summary: {
      good: publicDirections.filter((entry: any) => !entry.locked && (entry.quality === "best" || entry.quality === "good")).map((entry: any) => entry.direction),
      avoid: publicDirections.filter((entry: any) => !entry.locked && entry.quality === "avoid").map((entry: any) => entry.direction),
    },
    qimen: {
      source: qimenDay || qimenHour ? "qimen-api" : "unavailable",
      school,
      day: publicQimenLayer(qimenDay),
      hour: publicQimenLayer(qimenHour),
    },
    flying_focus: directionLimit >= 8 ? flyingFocus : null,
    direction_energy: publicDirectionEnergy,
    entitlement: {
      plan: product.plan,
      detailed_directions: directionLimit,
      total_directions: 8,
    },
  });
}
