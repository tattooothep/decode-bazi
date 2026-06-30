/**
 * 天星擇日 (七政四餘) · engine ประกอบผล — V1 baseline
 * ชั้น A (ดาราศาสตร์ astronomy-engine) = แม่นยำ verify ได้
 * ชั้น B (廟旺/恩用仇難/格局/verdict) = baseline จากตารางคลาสสิก · label "เบต้า · ซินแสกำลังเสริม果老ละเอียด"
 * ✅ display-only · ไม่แตะ datepick/auspicious · ตำแหน่งดาว=ของจริง ไม่ใช่ตารางโบราณ
 */
import { computeAstro } from "./ephemeris";
import { SIGNS, STARS, miaoWang, miaoWangDeg, fourRelations, GEJU_RULES, JI_STARS, XIONG_STARS, ayanamsa, Lang3 } from "./tables";
import { shuAt } from "./xiu28";

export type TXStar = {
  key: string; th: string; zh: string;
  lonTrop: number; lonSid: number; sign: number; signTh: string; signZh: string;
  deg: number; retro: boolean; status: string; statusTh: string; statusRank: number;
  shu: string; shuDeg: number;  // 宿 + 度ใน宿 (距星 system · A2)
  kind: string;
};
export type TXResult = {
  dtUTC: string; lat: number; lng: number; ayanamsa: number;
  ascendant: { lonSid: number; sign: number; signTh: string; signZh: string; rulerKey: string; rulerTh: string; rulerZh: string };
  stars: TXStar[];
  yongshen: { key: string; th: string; zh: string; status: string; statusTh: string };
  en_stars: { key: string; th: string; zh: string }[];   // 恩星 (生用神·หนุน)
  yong_stars: { key: string; th: string; zh: string }[]; // 用星 (用神生·ระบาย·剋難จึงดี)
  chou_stars: { key: string; th: string; zh: string }[]; // 仇星 (用神剋·剋恩จึงร้าย)
  nan_stars: { key: string; th: string; zh: string }[];   // 難星 (剋用神·ร้ายสุด)
  geju: { th: string; zh: string; good: boolean }[];      // 合格/忌格 ที่เข้า
  level: "top" | "good" | "neutral" | "bad";
  verdictTh: Lang3;
  reasons: Lang3[];
  beta: true;
};

const ELEMENT_OF = (k: string) => STARS[k]?.element || "";

export function tianxingReading(dtUTC: Date, lat: number, lng: number): TXResult {
  const astro = computeAstro(dtUTC, lat, lng);
  const ayan = ayanamsa(dtUTC);
  const sidOf = (lon: number) => ((lon - ayan) % 360 + 360) % 360;

  const stars: TXStar[] = astro.stars.map((s) => {
    const lonSid = sidOf(s.lonTrop);
    const sign = Math.floor(lonSid / 30);
    // A2 · 宿+度 (距星 ecliptic-of-date) → refine 廟旺ด้วย度數; ไม่เข้า band → fallback ราศี
    const sh = shuAt(s.lonTrop, dtUTC);
    const mw = miaoWangDeg(s.key, sh.zh, sh.deg) || miaoWang(s.key, sign);
    const meta = STARS[s.key];
    return {
      key: s.key, th: meta?.th || s.key, zh: meta?.zh || s.key,
      lonTrop: +s.lonTrop.toFixed(2), lonSid: +lonSid.toFixed(2),
      sign, signTh: SIGNS[sign].th, signZh: SIGNS[sign].zh, deg: +(lonSid % 30).toFixed(1),
      retro: s.retro, status: mw.code, statusTh: mw.th, statusRank: mw.rank,
      shu: sh.zh, shuDeg: sh.deg,
      kind: meta?.kind || "yu",
    };
  });

  // 命宮 + 命主(用神)
  const ascSid = sidOf(astro.ascendant);
  const ascSign = Math.floor(ascSid / 30);
  const rulerKey = SIGNS[ascSign].ruler;
  const ruler = STARS[rulerKey];
  const yongStar = stars.find((s) => s.key === rulerKey);

  // A3 · 恩用仇難 4 ขา รอบ用神 (ตาม element · 日月พิเศษ) — extract_enyong_natal
  const rel = fourRelations(rulerKey);
  const enStars: TXStar[] = [], yongStars: TXStar[] = [], chouStars: TXStar[] = [], nanStars: TXStar[] = [];
  for (const s of stars) {
    if (s.key === rulerKey) continue;
    const el = ELEMENT_OF(s.key);
    if (rel.en.includes(el)) enStars.push(s);
    if (rel.yong.includes(el)) yongStars.push(s);
    if (rel.chou.includes(el)) chouStars.push(s);
    if (rel.nan.includes(el)) nanStars.push(s);
  }

  // A4 · 格局 — baseline (吉星/凶星守命 · 日月夾命) + sign-level合格/忌格 (張果星宗五)
  const geju: { th: string; zh: string; good: boolean }[] = [];
  const inAsc = stars.filter((s) => s.sign === ascSign);
  for (const s of inAsc) {
    if (JI_STARS.includes(s.key)) geju.push({ th: `ดาวมงคล${s.th}เข้า命宮`, zh: `${s.zh}守命`, good: true });
    if (XIONG_STARS.includes(s.key)) geju.push({ th: `ดาวร้าย${s.th}เข้า命宮`, zh: `${s.zh}守命`, good: false });
  }
  const sun = stars.find((s) => s.key === "Sun"), moon = stars.find((s) => s.key === "Moon");
  if (sun && moon && (Math.abs(sun.sign - ascSign) === 1 || Math.abs(sun.sign - ascSign) === 11) &&
      (Math.abs(moon.sign - ascSign) === 1 || Math.abs(moon.sign - ascSign) === 11) && sun.sign !== moon.sign) {
    geju.push({ th: "อาทิตย์-จันทร์ขนาบประคอง命宮 (มงคลคลาสสิก)", zh: "日月夾命", good: true });
  }
  // sign-level 格局 (ไม่ต้องใช้宿/距度) — นับแยกเพื่อ score (ไม่ซ้ำ baseline吉凶守命)
  const signOf = (key: string): number | null => stars.find((s) => s.key === key)?.sign ?? null;
  const gctx = { signOf, ascSign };
  let signGejuGood = 0, signGejuBad = 0;
  for (const r of GEJU_RULES) {
    try { if (r.test(gctx)) { geju.push({ th: r.th, zh: r.zh, good: r.good }); r.good ? signGejuGood++ : signGejuBad++; } } catch { /* skip */ }
  }

  // verdict (ถ่วงน้ำหนัก) + reasons
  let score = 0; const reasons: Lang3[] = [];
  if (yongStar) {
    if (yongStar.statusRank >= 4) { score += 2; reasons.push({ th: `用神 (${ruler.th}) ได้กำลัง ${yongStar.status}`, en: `Chart ruler ${ruler.en} is strong (${yongStar.status})`, zh: `用神${ruler.zh}得${yongStar.status}` }); }
    else if (yongStar.statusRank <= 2) { score -= 2; reasons.push({ th: `用神 (${ruler.th}) อ่อนแรง ${yongStar.status}`, en: `Chart ruler ${ruler.en} weak (${yongStar.status})`, zh: `用神${ruler.zh}${yongStar.status}` }); }
  }
  const jiInAsc = inAsc.filter((s) => JI_STARS.includes(s.key));
  const xiongInAsc = inAsc.filter((s) => XIONG_STARS.includes(s.key));
  if (jiInAsc.length) { score += 2; reasons.push({ th: `ดาวมงคล ${jiInAsc.map((s) => s.th).join("·")} เข้า命宮`, en: `Benefic in ascendant`, zh: `吉星守命` }); }
  if (xiongInAsc.length) { score -= 2; reasons.push({ th: `ดาวร้าย ${xiongInAsc.map((s) => s.th).join("·")} เข้า命宮`, en: `Malefic in ascendant`, zh: `凶星守命` }); }
  if (enStars.length) { score += 1; reasons.push({ th: `มีดาวหนุน用神 (恩星): ${enStars.map((s) => s.th).join("·")}`, en: `Benefactor stars present`, zh: `恩星扶用` }); }
  if (nanStars.some((s) => s.sign === ascSign)) { score -= 1; reasons.push({ th: `ดาวขัด用神 (難星) ปะทะ命宮`, en: `Affliction star hits ascendant`, zh: `難星犯命` }); }
  // A3 · 用/仇 (4-leg) ที่ปะทะ命宮
  if (yongStars.some((s) => s.sign === ascSign)) { score += 1; reasons.push({ th: `用星 (${yongStars.filter((s) => s.sign === ascSign).map((s) => s.th).join("·")}) ระบายช่วย用神 (剋難)`, en: `Output star aids ruler`, zh: `用星助用` }); }
  if (chouStars.some((s) => s.sign === ascSign)) { score -= 1; reasons.push({ th: `仇星 ปะทะ命宮 (剋恩 ทำลายตัวหนุน)`, en: `Rival star hits ascendant`, zh: `仇星犯命` }); }
  // A4 · 格局 sign-level สุทธิ (cap ±2 · ไม่ซ้ำ baseline)
  const gNet = Math.max(-2, Math.min(2, signGejuGood - signGejuBad));
  if (gNet > 0) { score += gNet; reasons.push({ th: `เข้า合格 (格局ดี) ${signGejuGood} อย่าง`, en: `${signGejuGood} favorable patterns`, zh: `合格${signGejuGood}` }); }
  else if (gNet < 0) { score += gNet; reasons.push({ th: `ติด忌格 (格局เสีย) ${signGejuBad} อย่าง`, en: `${signGejuBad} adverse patterns`, zh: `忌格${signGejuBad}` }); }

  const level: TXResult["level"] = score >= 3 ? "top" : score >= 1 ? "good" : score <= -2 ? "bad" : "neutral";
  const VT: Record<typeof level, Lang3> = {
    top: { th: "ดาวจริงหนุนเต็ม", en: "Stars strongly support", zh: "天星大助" },
    good: { th: "ดาวจริงหนุน", en: "Stars support", zh: "天星助" },
    neutral: { th: "ดาวจริงกลางๆ / ผสม", en: "Mixed", zh: "天星平" },
    bad: { th: "ดาวจริงขัด", en: "Stars conflict", zh: "天星不助" },
  } as any;
  if (!reasons.length) reasons.push({ th: "ดาวอยู่ตำแหน่งกลางๆ ไม่เด่นทั้งดีและร้าย", en: "Neutral placement", zh: "星位平和" });

  return {
    dtUTC: astro.dtUTC, lat, lng, ayanamsa: +ayan.toFixed(3),
    ascendant: { lonSid: +ascSid.toFixed(2), sign: ascSign, signTh: SIGNS[ascSign].th, signZh: SIGNS[ascSign].zh, rulerKey, rulerTh: ruler.th, rulerZh: ruler.zh },
    stars,
    yongshen: { key: rulerKey, th: ruler.th, zh: ruler.zh, status: yongStar?.status || "—", statusTh: yongStar?.statusTh || "—" },
    en_stars: enStars.map((s) => ({ key: s.key, th: s.th, zh: s.zh })),
    yong_stars: yongStars.map((s) => ({ key: s.key, th: s.th, zh: s.zh })),
    chou_stars: chouStars.map((s) => ({ key: s.key, th: s.th, zh: s.zh })),
    nan_stars: nanStars.map((s) => ({ key: s.key, th: s.th, zh: s.zh })),
    geju, level, verdictTh: VT[level], reasons, beta: true,
  };
}
