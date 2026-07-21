/**
 * 姓名學 engine (五格剖象法) — 21 ก.ค. 2569 (เจ้านายเคาะใช้แหล่งรองระหว่างรอต้นตำรับ)
 * สูตรยกตรงจากแหล่งใน canon-inbox/xingming/08 (bename BSD) — ห้ามแต่งสูตรเพิ่ม:
 *   - 五格 4 กรณี (単姓単名/単姓双名/複姓単名/複姓双名) + กรณีทั่วไปตามไฟล์แหล่ง
 *   - ธาตุของเลข: หลักหน่วย [水木木火火土土金金水]
 *   - 總格 > 81 → ลบ 81 (回卷)
 *   - 三才: lookup ตาราง 125 ชุด (data/sancai.json) · คะแนน 50+ฐานตามตาราง 大吉10/吉7/半吉4/凶0 + 三才 大吉+10/吉+5 เพดาน 100
 * ชั้น 用神 (ของเราเอง เพิ่มเติม): เทียบธาตุ人格/總格 กับ用神ของดวง ด้วยกฎ 相生 เดิมในระบบ — ไม่ใช่ส่วนของตำรา 五格
 */
import strokesRaw from "./data/strokes.json";
import numbers81Raw from "./data/numbers81.json";
import sancaiRaw from "./data/sancai.json";

const STROKES = strokesRaw as Record<string, number>;

type Number81 = {
  number: number;
  wuxing: string;
  luck: string;
  comment_zh: string;
  th: string;
  en: string;
};
const NUMBERS81 = new Map<number, Number81>((numbers81Raw as Number81[]).map((n) => [n.number, n]));

type Sancai = { combo: string; luck: string; note_zh?: string; th?: string; en?: string };
const SANCAI = new Map<string, Sancai>((sancaiRaw as Sancai[]).map((s) => [s.combo, s]));

const ELEMENT_BY_DIGIT = ["水", "木", "木", "火", "火", "土", "土", "金", "金", "水"] as const;
const SHENG: Record<string, string> = { 木: "火", 火: "土", 土: "金", 金: "水", 水: "木" };
const KE: Record<string, string> = { 木: "土", 土: "水", 水: "火", 火: "金", 金: "木" };

export type GeView = {
  key: "tiange" | "renge" | "dige" | "waige" | "zongge";
  num: number;
  element: string;
  luck: string | null;
  comment_zh: string | null;
  th: string | null;
  en: string | null;
};

export type NamingResult = {
  ok: true;
  surname: string;
  given: string;
  strokes: { char: string; strokes: number }[];
  ge: GeView[];
  sancai: { combo: string; luck: string | null; th: string | null; en: string | null };
  score: number;
  yongshen: null | {
    element: string;
    renge: "match" | "support" | "controlled" | "clash" | "neutral";
    zongge: "match" | "support" | "controlled" | "clash" | "neutral";
  };
};

export type NamingError = { ok: false; error: "missing_chars"; chars: string[] } | { ok: false; error: "bad_input" };

function lookupStrokes(chars: string[]): { missing: string[]; strokes: number[] } {
  const missing: string[] = [];
  const strokes: number[] = [];
  for (const ch of chars) {
    const n = STROKES[ch];
    if (typeof n === "number" && n > 0) strokes.push(n);
    else missing.push(ch);
  }
  return { missing, strokes };
}

/** สูตร 五格 ตามไฟล์แหล่ง 08 — คืน [天,人,地,外,總] */
export function computeWuge(s: number[], g: number[]): [number, number, number, number, number] {
  let tiange: number;
  let renge: number;
  let dige: number;
  let waige: number;
  if (s.length === 1 && g.length === 1) {
    tiange = s[0] + 1;
    renge = s[0] + g[0];
    dige = g[0] + 1;
    waige = 2;
  } else if (s.length === 1 && g.length === 2) {
    tiange = s[0] + 1;
    renge = s[0] + g[0];
    dige = g[0] + g[1];
    waige = g[1] + 1;
  } else if (s.length === 2 && g.length === 1) {
    tiange = s[0] + s[1];
    renge = s[1] + g[0];
    dige = g[0] + 1;
    waige = s[0] + 1;
  } else if (s.length === 2 && g.length === 2) {
    tiange = s[0] + s[1];
    renge = s[1] + g[0];
    dige = g[0] + g[1];
    waige = s[0] + g[1];
  } else {
    // กรณีทั่วไปตาม _calc_multiple_surname_multiple_given ของแหล่ง
    tiange = s.length >= 2 ? s[0] + s[1] : s[0] + 1;
    renge = s[s.length - 1] + g[0];
    dige = g.length === 1 ? g[0] + 1 : g.reduce((a, b) => a + b, 0);
    if (s.length <= 1 && g.length === 1) waige = 2;
    else if (s.length > 1 && g.length > 1) waige = s[0] + g[g.length - 1];
    else if (s.length > 1) waige = s[0] + 1;
    else waige = g[g.length - 1] + 1;
  }
  let zongge = s.reduce((a, b) => a + b, 0) + g.reduce((a, b) => a + b, 0);
  if (zongge > 81) zongge = zongge - 81; // 回卷 ตามแหล่ง
  return [tiange, renge, dige, waige, zongge];
}

export function elementOf(num: number): string {
  return ELEMENT_BY_DIGIT[num % 10];
}

/** ความสัมพันธ์ธาตุของเลขหลัก กับ 用神 ของดวง (ชั้นเสริมของระบบเรา) */
function yongshenRelation(geElement: string, yong: string): "match" | "support" | "controlled" | "clash" | "neutral" {
  if (geElement === yong) return "match";
  if (SHENG[geElement] === yong) return "support"; // ธาตุชื่อ ให้กำเนิด 用神
  if (KE[geElement] === yong) return "clash"; // ธาตุชื่อ พิฆาต 用神
  if (KE[yong] === geElement) return "controlled";
  return "neutral";
}

export function analyzeName(surname: string, given: string, yongshenElement?: string | null): NamingResult | NamingError {
  const sChars = Array.from(surname.trim());
  const gChars = Array.from(given.trim());
  if (!sChars.length || !gChars.length || sChars.length > 3 || gChars.length > 3) return { ok: false, error: "bad_input" };
  const sLook = lookupStrokes(sChars);
  const gLook = lookupStrokes(gChars);
  const missing = [...sLook.missing, ...gLook.missing];
  if (missing.length) return { ok: false, error: "missing_chars", chars: missing };

  const [tiange, renge, dige, waige, zongge] = computeWuge(sLook.strokes, gLook.strokes);
  const keys = ["tiange", "renge", "dige", "waige", "zongge"] as const;
  const nums = [tiange, renge, dige, waige, zongge];
  const ge: GeView[] = keys.map((key, i) => {
    const meta = NUMBERS81.get(nums[i]) || null;
    return {
      key,
      num: nums[i],
      element: elementOf(nums[i]),
      luck: meta?.luck ?? null,
      comment_zh: meta?.comment_zh ?? null,
      th: meta?.th ?? null,
      en: meta?.en ?? null,
    };
  });

  const combo = `${ge[0].element}${ge[1].element}${ge[2].element}`;
  const sancaiMeta = SANCAI.get(combo) || null;

  // คะแนนตามแหล่ง: 50 + ต่อ格 (大吉10/吉7/半吉4/凶0) + 三才 (大吉+10/吉+5) เพดาน 100
  const lms: Record<string, number> = { great_luck: 10, luck: 7, half: 4, bad: 0, great_bad: 0 };
  let score = 50;
  for (const g2 of ge) score += lms[g2.luck || ""] ?? 0;
  if (sancaiMeta?.luck === "great_luck") score += 10;
  else if (sancaiMeta?.luck === "luck") score += 5;
  score = Math.min(100, score);

  return {
    ok: true,
    surname,
    given,
    strokes: [...sChars, ...gChars].map((char, i) => ({ char, strokes: [...sLook.strokes, ...gLook.strokes][i] })),
    ge,
    sancai: { combo, luck: sancaiMeta?.luck ?? null, th: sancaiMeta?.th ?? null, en: sancaiMeta?.en ?? null },
    score,
    yongshen: yongshenElement
      ? {
          element: yongshenElement,
          renge: yongshenRelation(ge[1].element, yongshenElement),
          zongge: yongshenRelation(ge[4].element, yongshenElement),
        }
      : null,
  };
}
