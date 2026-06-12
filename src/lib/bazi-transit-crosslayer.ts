/* ─── ปฏิกิริยาข้ามชั้น วัยจร×ปีจร×ดวงเกิด (HK_CROSSLAYER_V1 · 12 มิ.ย. 2026) ───
 * เหตุ (เคส Swit): packet เดิม precompute เฉพาะ ผังเกิด×ผังเกิด · วัยจร×ผังเกิด(รายคู่) · ปีจร×เสาวัน
 *   และกฎ 3.6 ห้าม AI จับ 三合/三刑 ข้ามชั้นเอง → 甲己合(จร)/丑戌未三刑/巳酉丑三合/四庫全 เป็นจุดบอดโดยดีไซน์
 * ขอบเขต: เลเยอร์ packet ล้วน — อ่านค่าที่ engine คำนวณแล้ว (เสาเกิด/วัยจร/ปีจร) · ไม่แตะ wrapper LOCKED · ไม่กระทบ /chart
 * หลักตำรา (conservative · ไม่ประกาศเกินหลักฐาน · สอดคล้อง bazi-hehua-resolver เดิม):
 *   - ก้านจรฮะ日干 = 本身之合 ไม่แปรธาตุ (化格 engine ประกาศแยกทาง special_chart/huaQi)
 *   - ก้านจรฮะก้านเกิดอื่น: default 合而不化 (合絆 ตรึงก้าน) · เดือนเกิดหนุนธาตุแปร → "真化候補" ให้ซินแสตรวจรากต่อ
 *   - หลายก้านเกิดแย่งฮะก้านจรตัวเดียว = 爭合 (แรงฮะรวน)
 *   - กิ่งจรเติมโครง 刑/三合/三會/四庫 ที่มีเค้าในผังเกิดจนครบชุด → ปล่อยเป็น type พร้อมระบุแหล่งกิ่ง
 *     (ทุก hit ต้องมีกิ่งจรร่วม ≥1 เสมอ — ชุดที่ครบในผังเกิดล้วน packet ส่วนเดิมครอบอยู่แล้ว)
 */

import { STEM_ELEMENT, type BaziElement } from "./bazi-stem-strength";

const ELEMENT_TH: Record<string, string> = {
  wood: "ไม้", fire: "ไฟ", earth: "ดิน", metal: "ทอง", water: "น้ำ",
};

/* ตาราง五合 — partner/ธาตุแปร/เดือนหนุน ชุดเดียวกับ STEM_COMBO ใน bazi-hehua-resolver (คงไว้ตรงกัน ห้ามแก้ฝั่งเดียว) */
const FIVE_COMBO: Record<string, { partner: string; pair: string; element: BaziElement; seasonBranches: string[] }> = {
  甲: { partner: "己", pair: "甲己", element: "earth", seasonBranches: ["辰", "戌", "丑", "未", "午"] },
  己: { partner: "甲", pair: "甲己", element: "earth", seasonBranches: ["辰", "戌", "丑", "未", "午"] },
  乙: { partner: "庚", pair: "乙庚", element: "metal", seasonBranches: ["巳", "酉", "丑", "申"] },
  庚: { partner: "乙", pair: "乙庚", element: "metal", seasonBranches: ["巳", "酉", "丑", "申"] },
  丙: { partner: "辛", pair: "丙辛", element: "water", seasonBranches: ["申", "子", "辰", "亥"] },
  辛: { partner: "丙", pair: "丙辛", element: "water", seasonBranches: ["申", "子", "辰", "亥"] },
  丁: { partner: "壬", pair: "丁壬", element: "wood", seasonBranches: ["亥", "卯", "未", "寅"] },
  壬: { partner: "丁", pair: "丁壬", element: "wood", seasonBranches: ["亥", "卯", "未", "寅"] },
  戊: { partner: "癸", pair: "戊癸", element: "fire", seasonBranches: ["寅", "午", "戌", "巳"] },
  癸: { partner: "戊", pair: "戊癸", element: "fire", seasonBranches: ["寅", "午", "戌", "巳"] },
};

export type TransitHehuaHit = {
  pair: string;                 // "甲己"
  transitLabel: string;         // "วัยจร甲辰" | "ปีจร2027(丁未)"
  transitStem: string;
  natalRefs: string[];          // ["เสายาม·己", "日干·壬"]
  involvesDayMaster: boolean;
  contested: boolean;           // ก้านเกิด >1 ตัวแย่งฮะก้านจรเดียว
  verdict: "本身之合" | "合而不化" | "真化候補";
  transformElement: BaziElement;
  boundStemElementTh: string;   // ธาตุของก้านเกิดที่ถูกตรึง (ให้ AI เทียบ用/喜/忌 เอง)
  noteTh: string;
};

export function buildTransitHehua(opts: {
  natalStems: Array<{ ref: string; stem: string; isDayMaster: boolean }>;
  monthBranch: string | null;
  transits: Array<{ label: string; stem: string }>;
}): TransitHehuaHit[] {
  const hits: TransitHehuaHit[] = [];
  const seen = new Set<string>();
  for (const t of opts.transits) {
    const combo = FIVE_COMBO[t.stem];
    if (!combo) continue;
    const matched = opts.natalStems.filter((n) => n.stem === combo.partner);
    if (!matched.length) continue;
    /* dedupe: ก้านจรซ้ำ (เช่น ปีจรหลายปีก้านเดียวกัน) รายงานครั้งเดียวต่อ label ต่างกัน — กันซ้ำเฉพาะ label+pair */
    const key = `${t.label}|${combo.pair}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const involvesDayMaster = matched.some((m) => m.isDayMaster);
    const contested = matched.length > 1;
    const seasonSupported = !!opts.monthBranch && combo.seasonBranches.includes(opts.monthBranch);
    const verdict: TransitHehuaHit["verdict"] = involvesDayMaster
      ? "本身之合"
      : seasonSupported ? "真化候補" : "合而不化";
    const elTh = ELEMENT_TH[combo.element] || combo.element;
    const boundEl = STEM_ELEMENT[combo.partner];
    const boundElTh = ELEMENT_TH[boundEl] || String(boundEl || "-");
    let noteTh: string;
    if (involvesDayMaster) {
      noteTh = `ก้านจร${t.stem}ฮะ日干 = 本身之合 ไม่แปรธาตุ — ตัวเราดึงดาวของก้าน${t.stem}เข้าตัว/ถูกผูกพันกับมันโดยตรง (ดวง化格 engine ประกาศแยกแล้ว ห้ามอนุมาน化จากคู่นี้)`;
    } else if (verdict === "真化候補") {
      noteTh = `ก้านจร${t.stem}ฮะก้านเกิด${combo.partner} เดือนเกิดหนุนธาตุ${elTh} = 真化候補 (ยังไม่ฟันธง化 — ซินแสตรวจราก/ตัวแย่งก่อน) · ระหว่างนั้นก้าน${combo.partner}(${boundElTh})ทำงานไม่เต็ม`;
    } else {
      noteTh = `ก้านจร${t.stem}ฮะก้านเกิด${combo.partner} เดือนเกิดไม่หนุนธาตุ${elTh} = 合絆/合而不化 ก้านถูกตรึง ไม่ได้ธาตุใหม่ — ก้าน${combo.partner}(${boundElTh})ถูกผูกกับก้านจร ทำงานไม่เต็มช่วงนั้น`;
    }
    if (contested) noteTh += ` · ⚠️爭合: ก้านเกิด${combo.partner}มี${matched.length}ตัวแย่งฮะ — แรงฮะรวน ผลถูกเฉลี่ย/ไม่เด็ดขาด`;
    hits.push({
      pair: combo.pair,
      transitLabel: t.label,
      transitStem: t.stem,
      natalRefs: matched.map((m) => `${m.ref}·${m.stem}`),
      involvesDayMaster,
      contested,
      verdict,
      transformElement: combo.element,
      boundStemElementTh: boundElTh,
      noteTh,
    });
  }
  return hits;
}

/* ─── กิ่งจรเติมโครงข้ามชั้น ─── */

const SAN_XING_SETS: string[][] = [["丑", "戌", "未"], ["寅", "巳", "申"]];
const ZI_MAO: [string, string] = ["子", "卯"];
const SAN_HE_SETS: Array<{ set: string[]; element: BaziElement }> = [
  { set: ["申", "子", "辰"], element: "water" },
  { set: ["巳", "酉", "丑"], element: "metal" },
  { set: ["寅", "午", "戌"], element: "fire" },
  { set: ["亥", "卯", "未"], element: "wood" },
];
const SAN_HUI_SETS: Array<{ set: string[]; element: BaziElement }> = [
  { set: ["寅", "卯", "辰"], element: "wood" },
  { set: ["巳", "午", "未"], element: "fire" },
  { set: ["申", "酉", "戌"], element: "metal" },
  { set: ["亥", "子", "丑"], element: "water" },
];
const FOUR_STORE = ["辰", "戌", "丑", "未"];

export type CrossLayerComboHit = {
  kind: "三刑" | "子卯刑" | "三合" | "三會" | "四庫全";
  set: string;                                       // "丑戌未"
  element?: BaziElement;                             // เฉพาะ 三合/三會
  members: Array<{ branch: string; source: string }>;
  years: number[];                                   // ปีจรที่ทำให้ครบ · [] = ครบด้วยวัยจรล้วน (ตลอดช่วงวัยจรนี้)
  noteTh: string;
};

type BranchPool = Array<{ branch: string; source: string; layer: "natal" | "luck" | "annual" }>;

function completeSet(
  pool: BranchPool,
  set: string[],
): { members: CrossLayerComboHit["members"]; usesTransit: boolean } | null {
  const members: CrossLayerComboHit["members"] = [];
  let usesTransit = false;
  for (const b of set) {
    /* เลือกแหล่งตามลำดับ natal → luck → annual (ให้เครดิตผังเกิดก่อน · กิ่งจรคือ "ตัวเติม") */
    const found =
      pool.find((p) => p.branch === b && p.layer === "natal") ||
      pool.find((p) => p.branch === b && p.layer === "luck") ||
      pool.find((p) => p.branch === b && p.layer === "annual");
    if (!found) return null;
    if (found.layer !== "natal") usesTransit = true;
    members.push({ branch: b, source: found.source });
  }
  return usesTransit ? { members, usesTransit } : null; /* ครบในผังเกิดล้วน = ของเดิมครอบแล้ว ไม่รายงานซ้ำ */
}

export function buildCrossLayerCombos(opts: {
  natalBranches: Array<{ ref: string; branch: string }>;
  luck: { label: string; branch: string } | null;
  years: Array<{ year: number; branch: string }>;
}): CrossLayerComboHit[] {
  const natalPool: BranchPool = opts.natalBranches.map((n) => ({ branch: n.branch, source: `${n.ref}(เกิด)`, layer: "natal" }));
  const luckPool: BranchPool = opts.luck ? [{ branch: opts.luck.branch, source: opts.luck.label, layer: "luck" }] : [];

  type Candidate = { kind: CrossLayerComboHit["kind"]; set: string[]; element?: BaziElement };
  const candidates: Candidate[] = [
    ...SAN_XING_SETS.map((s): Candidate => ({ kind: "三刑", set: s })),
    { kind: "子卯刑", set: [...ZI_MAO] },
    ...SAN_HE_SETS.map((s): Candidate => ({ kind: "三合", set: s.set, element: s.element })),
    ...SAN_HUI_SETS.map((s): Candidate => ({ kind: "三會", set: s.set, element: s.element })),
    { kind: "四庫全", set: [...FOUR_STORE] },
  ];

  const KIND_TH: Record<CrossLayerComboHit["kind"], string> = {
    三刑: "ลงโทษสามกิ่งครบชุด",
    子卯刑: "ลงโทษไร้มารยาท",
    三合: "รวมหมู่สามกิ่งครบชุด",
    三會: "รวมทิศสามกิ่งครบชุด",
    四庫全: "สี่คลังประชุมครบ (辰戌丑未)",
  };

  const hits: CrossLayerComboHit[] = [];
  for (const c of candidates) {
    /* รอบ 1: ครบด้วย ผังเกิด+วัยจร (ไม่พึ่งปีจร) → มีผลตลอดช่วงวัยจรนี้ */
    const luckOnly = completeSet([...natalPool, ...luckPool], c.set);
    if (luckOnly) {
      const elTxt = c.element ? `→ธาตุ${ELEMENT_TH[c.element]}` : "";
      hits.push({
        kind: c.kind, set: c.set.join(""), element: c.element, members: luckOnly.members, years: [],
        noteTh: `${c.set.join("")}${c.kind}${elTxt} (${KIND_TH[c.kind]}) ครบด้วยวัยจรปัจจุบัน — มีผลตลอดช่วงวัยจรนี้ · แหล่งกิ่ง: ${luckOnly.members.map((m) => `${m.branch}=${m.source}`).join(" · ")}`,
      });
      continue; /* ครบทั้งวัยจรแล้ว ไม่ต้องไล่รายปีซ้ำ */
    }
    /* รอบ 2: ครบเมื่อปีจรปีไหนมาเติม */
    const yearHits: { year: number; members: CrossLayerComboHit["members"] }[] = [];
    for (const y of opts.years) {
      const pool: BranchPool = [...natalPool, ...luckPool, { branch: y.branch, source: `ปีจร${y.year}`, layer: "annual" }];
      const done = completeSet(pool, c.set);
      /* ต้องใช้กิ่งปีจรจริง (ไม่ใช่ครบจาก natal+luck — เคสนั้นจับไปแล้วรอบ 1) */
      if (done && done.members.some((m) => m.source === `ปีจร${y.year}`)) yearHits.push({ year: y.year, members: done.members });
    }
    if (yearHits.length) {
      const elTxt = c.element ? `→ธาตุ${ELEMENT_TH[c.element]}` : "";
      const first = yearHits[0];
      hits.push({
        kind: c.kind, set: c.set.join(""), element: c.element, members: first.members,
        years: yearHits.map((y) => y.year),
        noteTh: `${c.set.join("")}${c.kind}${elTxt} (${KIND_TH[c.kind]}) ครบเมื่อปีจร ${yearHits.map((y) => y.year).join("/")} มาเติม · แหล่งกิ่ง(ตัวอย่างปีแรก): ${first.members.map((m) => `${m.branch}=${m.source}`).join(" · ")}`,
      });
    }
  }
  return hits;
}
