/* src/lib/mingtu/story-planner.ts · 命圖 Cinematic Life Report — content planner + scene prompt builder
 * deterministic ล้วน — ไม่เรียก AI · ไม่แตะ DB · ประกอบ sections จาก field จริงของ /api/chart payload เท่านั้น
 * กฎเหล็ก: มีเท่าไหนใช้เท่านั้น · field ขาด = null (ห้ามปั้น) · ภาษาไหนขาด fallback → th
 * closed-list ตำราที่ฝังในไฟล์นี้: ธาตุก้าน/กิ่ง · 六合/六沖 · สี/ทิศ/เลข/วัสดุ 5 ธาตุ · ความหมายสิบเทพ (canonical dict)
 */

/* ── i18n helpers ── */
export type L3 = { th: string; en: string; zh: string };
/** ขาดภาษาไหน fallback → th (ห้ามปั้น) */
export function tr(th: string, en?: string | null, zh?: string | null): L3 {
  return { th, en: en && en.trim() ? en : th, zh: zh && zh.trim() ? zh : th };
}
function joinL3(parts: L3[], sep: { th: string; en: string; zh: string }): L3 {
  return {
    th: parts.map((p) => p.th).filter(Boolean).join(sep.th),
    en: parts.map((p) => p.en).filter(Boolean).join(sep.en),
    zh: parts.map((p) => p.zh).filter(Boolean).join(sep.zh),
  };
}

/* ── closed-list canon (ตารางตำราคงที่ · ไม่ใช่การคำนวณเสาใหม่) ── */
export type ElName = "wood" | "fire" | "earth" | "metal" | "water";
const ELS: ElName[] = ["wood", "fire", "earth", "metal", "water"];
const STEM_ELEMENT: Record<string, ElName> = {
  甲: "wood", 乙: "wood", 丙: "fire", 丁: "fire", 戊: "earth",
  己: "earth", 庚: "metal", 辛: "metal", 壬: "water", 癸: "water",
};
const EL_I18N: Record<ElName, L3> = {
  wood: { th: "ไม้", en: "Wood", zh: "木" },
  fire: { th: "ไฟ", en: "Fire", zh: "火" },
  earth: { th: "ดิน", en: "Earth", zh: "土" },
  metal: { th: "ทอง", en: "Metal", zh: "金" },
  water: { th: "น้ำ", en: "Water", zh: "水" },
};
/* 六合 · 六沖 — ตารางปิดจากตำรา (สมมาตรสองทิศ) */
const SIX_HE: Record<string, string> = { 子: "丑", 丑: "子", 寅: "亥", 亥: "寅", 卯: "戌", 戌: "卯", 辰: "酉", 酉: "辰", 巳: "申", 申: "巳", 午: "未", 未: "午" };
const SIX_CLASH: Record<string, string> = { 子: "午", 午: "子", 丑: "未", 未: "丑", 寅: "申", 申: "寅", 卯: "酉", 酉: "卯", 辰: "戌", 戌: "辰", 巳: "亥", 亥: "巳" };

const PILLAR_I18N: Record<string, L3> = {
  year: { th: "เสาปีเกิด", en: "year pillar", zh: "年柱" },
  month: { th: "เสาเดือนเกิด", en: "month pillar", zh: "月柱" },
  day: { th: "เสาวันเกิด", en: "day pillar", zh: "日柱" },
  hour: { th: "เสายามเกิด", en: "hour pillar", zh: "時柱" },
};

/* สี/ทิศ/เลข/วัสดุ 5 ธาตุ — canonical wuxing correspondences (ตารางปิด) */
const EL_LUCKY: Record<ElName, { colors: L3; direction: L3; numbers: number[]; materials: L3 }> = {
  wood: {
    colors: { th: "เขียว · เขียวอมฟ้า", en: "green · teal", zh: "綠·青" },
    direction: { th: "ทิศตะวันออก", en: "East", zh: "東方" },
    numbers: [3, 8],
    materials: { th: "ไม้ · ต้นไม้ · หวาย · ผ้าฝ้าย", en: "wood · plants · rattan · cotton", zh: "木製品·植物·藤·棉" },
  },
  fire: {
    colors: { th: "แดง · ส้ม · ม่วง", en: "red · orange · purple", zh: "紅·橙·紫" },
    direction: { th: "ทิศใต้", en: "South", zh: "南方" },
    numbers: [2, 7],
    materials: { th: "ผ้าไหม · โคมไฟ · เทียน · ของที่ให้แสง", en: "silk · lamps · candles · light sources", zh: "絲綢·燈飾·蠟燭" },
  },
  earth: {
    colors: { th: "เหลือง · น้ำตาล · เบจ", en: "yellow · brown · beige", zh: "黃·棕·米" },
    direction: { th: "ตรงกลาง · ตะวันออกเฉียงเหนือ · ตะวันตกเฉียงใต้", en: "Center · Northeast · Southwest", zh: "中央·東北·西南" },
    numbers: [5, 10],
    materials: { th: "เซรามิก · หิน · คริสตัล · ดินเผา", en: "ceramic · stone · crystal · terracotta", zh: "陶瓷·石·水晶·陶土" },
  },
  metal: {
    colors: { th: "ขาว · ทอง · เงิน", en: "white · gold · silver", zh: "白·金·銀" },
    direction: { th: "ทิศตะวันตก · ตะวันตกเฉียงเหนือ", en: "West · Northwest", zh: "西方·西北" },
    numbers: [4, 9],
    materials: { th: "โลหะ · ทองคำ · เครื่องประดับเงิน", en: "metal · gold · silver jewelry", zh: "金屬·黃金·銀飾" },
  },
  water: {
    colors: { th: "ดำ · น้ำเงินเข้ม", en: "black · navy blue", zh: "黑·深藍" },
    direction: { th: "ทิศเหนือ", en: "North", zh: "北方" },
    numbers: [1, 6],
    materials: { th: "แก้ว · กระจก · น้ำพุ · สิ่งที่เกี่ยวกับน้ำ", en: "glass · mirrors · water features", zh: "玻璃·鏡·流水擺設" },
  },
};

/* ความหมายสิบเทพ (十神) — canonical dict ปิด 10 ตัว (ระดับพจนานุกรม ไม่ใช่คำทำนาย) */
type TenGodGroup = "wealth" | "power" | "wisdom" | "art" | "peer";
const TEN_GOD_DICT: Record<string, { group: TenGodGroup; name: L3; meaning: L3 }> = {
  正財: {
    group: "wealth",
    name: { th: "ทรัพย์ตรง (正財)", en: "Direct Wealth (正財)", zh: "正財" },
    meaning: {
      th: "ทรัพย์ที่มั่นคงจากงานประจำและความขยัน สะสมทีละขั้นอย่างมีวินัย",
      en: "steady earned wealth built through diligence and consistent work",
      zh: "正祿之財，勤儉積累，步步為營",
    },
  },
  偏財: {
    group: "wealth",
    name: { th: "ทรัพย์ลอย (偏財)", en: "Indirect Wealth (偏財)", zh: "偏財" },
    meaning: {
      th: "โอกาสเงินก้อนและรายได้หลายทาง คล่องเรื่องจับจังหวะโอกาส",
      en: "opportunistic wealth from multiple streams and well-timed ventures",
      zh: "眾人之財，機遇多門，善捕時機",
    },
  },
  正官: {
    group: "power",
    name: { th: "ขุนนางตรง (正官)", en: "Direct Officer (正官)", zh: "正官" },
    meaning: {
      th: "ตำแหน่ง วินัย ความน่าเชื่อถือ เหมาะกับเส้นทางราชการ/องค์กรใหญ่",
      en: "status, discipline and credibility — suited to formal careers and institutions",
      zh: "官貴之星，主名位與紀律，宜正途晉身",
    },
  },
  七殺: {
    group: "power",
    name: { th: "ขุนพล (七殺)", en: "Seven Killings (七殺)", zh: "七殺" },
    meaning: {
      th: "อำนาจและความกล้าตัดสินใจ ยิ่งเจอแรงกดดันยิ่งแกร่ง เหมาะงานบุกเบิก/แข่งขันสูง",
      en: "authority and decisive courage that grows under pressure — suited to pioneering, competitive fields",
      zh: "將星之氣，臨壓愈勇，宜開創競爭之業",
    },
  },
  食神: {
    group: "art",
    name: { th: "ดาวโภชนา (食神)", en: "Eating God (食神)", zh: "食神" },
    meaning: {
      th: "ผลงานสร้างสรรค์ที่เลี้ยงชีพได้ยั่งยืน มีรสนิยมและความประณีต",
      en: "sustainable creative output with taste and refinement",
      zh: "福祿之星，才藝養身，細水長流",
    },
  },
  傷官: {
    group: "art",
    name: { th: "ดาวฝีมือ (傷官)", en: "Hurting Officer (傷官)", zh: "傷官" },
    meaning: {
      th: "ฝีมือโดดเด่น กล้าแหกกรอบ เฉียบคมทางความคิดและการแสดงออก",
      en: "standout talent and unconventional brilliance in thought and expression",
      zh: "才華外露，敢破常規，聰穎鋒芒",
    },
  },
  正印: {
    group: "wisdom",
    name: { th: "ตราประทับตรง (正印)", en: "Direct Resource (正印)", zh: "正印" },
    meaning: {
      th: "ความรู้ การศึกษา และผู้ใหญ่สนับสนุน เป็นเกราะคุ้มดวง",
      en: "learning, study and supportive mentors that shield the chart",
      zh: "印綬護身，主學識與貴人提攜",
    },
  },
  偏印: {
    group: "wisdom",
    name: { th: "ตราประทับเฉียง (偏印)", en: "Indirect Resource (偏印)", zh: "偏印" },
    meaning: {
      th: "ปัญญาเชิงลึกสายเฉพาะทาง มุมมองไม่เหมือนใคร",
      en: "specialized deep insight and an uncommon perspective",
      zh: "梟印之智，專精一藝，見解獨到",
    },
  },
  比肩: {
    group: "peer",
    name: { th: "ดาวมิตร (比肩)", en: "Friend (比肩)", zh: "比肩" },
    meaning: {
      th: "ความเป็นตัวของตัวเองและเพื่อนร่วมทาง ยืนได้ด้วยลำแข้ง",
      en: "self-reliance and peers walking the same road",
      zh: "自立之星，朋輩同行",
    },
  },
  劫財: {
    group: "peer",
    name: { th: "ดาวแย่งทรัพย์ (劫財)", en: "Rob Wealth (劫財)", zh: "劫財" },
    meaning: {
      th: "พลังแข่งขันสูง แต่ต้องระวังการแบ่งทรัพย์/หุ้นส่วนที่ไม่รัดกุม",
      en: "strong competitive drive — watch loose partnerships and shared money",
      zh: "爭競之氣，慎防財帛分奪",
    },
  },
};
const CAREER_GOD_PRIORITY = ["正財", "偏財", "正官", "七殺", "食神", "傷官", "正印", "偏印", "比肩", "劫財"];

/* ── payload subset types (โครงจาก /api/chart จริง · ทุก field optional เพราะ plan-shape อาจตัด) ── */
type PillarLike = { stem?: string; branch?: string } | null | undefined;
type NayinPillarLike = { zh?: string; en?: string; th?: string; element?: string; symbol?: string } | null;
type StarHitLike = { code?: string; zh?: string; th?: string; polarity?: "good" | "bad" | "neutral"; pillars?: string[] };
type DaymasterProfileLike = {
  label_th?: string; element?: string; polarity?: string; strength?: string;
  core?: string; real_life?: string; shadow?: string; needs?: string;
  i18n?: { en?: { label?: string; core?: string; real_life?: string; shadow?: string; needs?: string }; zh?: { label?: string; core?: string; real_life?: string; shadow?: string; needs?: string } };
} | null;
type Yv2Like = {
  structure_label?: string | null;
  primary_yongshen?: unknown[];
  xishen?: unknown[];
  jishen?: unknown[];
  element_roles?: { key?: string; elements?: string[]; label?: L3; status?: string; verdict?: Partial<L3> }[];
} | null;
type LuckPillarLike = { age_start?: number; age_end?: number; stem?: string; branch?: string; element?: string; qi_phase?: string | null };
type SpousePalaceLike = {
  day_branch?: string; day_branch_th?: string; day_branch_en?: string; day_branch_element?: string;
  partner_element_th?: string; partner_element_en?: string; partner_element_zh?: string;
  partner_traits_th?: string; partner_traits_en?: string; partner_traits_zh?: string;
  relationship_flags?: string[];
} | null;
type CareerIndustryLike = {
  yongshen_element?: string;
  industries_th?: string[]; industries_en?: string[]; industries_zh?: string[];
  advice_th?: string; advice_en?: string; advice_zh?: string;
} | null;
type HealthMappingLike = {
  dm_element?: string; dm_organs_th?: string; dm_organs_zh?: string; dm_organs_en?: string;
  weak_organs?: { element?: string; organs_th?: string; organs_zh?: string; organs_en?: string; reason_th?: string; reason_en?: string; reason_zh?: string }[];
  caution_organs?: { element?: string; organs_th?: string; organs_zh?: string; organs_en?: string; reason_th?: string; reason_en?: string; reason_zh?: string }[];
  summary_th?: string; summary_en?: string; summary_zh?: string;
} | null;
type FunctionalStrengthLike = { level?: string; level_th?: string; level_en?: string; level_zh?: string; supporting_pct?: number } | null;

export type ChartStoryPayload = {
  pillars?: { year?: PillarLike; month?: PillarLike; day?: PillarLike; hour?: PillarLike } | null;
  ge_ju?: { structure?: string | null } | null;
  yongshen_v2?: Yv2Like;
  analysis?: {
    daymaster_profile?: DaymasterProfileLike;
    ten_gods_map?: { year?: { stem?: string; ten_god?: string | null } | null; month?: { stem?: string; ten_god?: string | null } | null; hour?: { stem?: string; ten_god?: string | null } | null } | null;
    nayin?: { year?: NayinPillarLike; month?: NayinPillarLike; day?: NayinPillarLike; hour?: NayinPillarLike } | null;
    special_stars?: Record<string, StarHitLike[]> | null;
    element_counts?: Partial<Record<ElName, number>> | null;
    luck_pillars?: LuckPillarLike[] | null;
    current_luck_idx?: number | null;
    current_year_pillar?: { stem?: string; branch?: string } | null;
    spouse_palace?: SpousePalaceLike;
    career_industry?: CareerIndustryLike;
    health_mapping?: HealthMappingLike;
    functional_strength?: FunctionalStrengthLike;
  } | null;
};

/* ── small utils ── */
function elOf(raw: unknown): ElName | null {
  const s = typeof raw === "string" ? raw : raw && typeof raw === "object" ? String((raw as { element?: unknown }).element || "") : "";
  const low = s.toLowerCase() as ElName;
  return (ELS as string[]).includes(low) ? low : null;
}
function elList(raw: unknown[] | undefined | null): ElName[] {
  return Array.from(new Set((raw || []).map(elOf).filter((e): e is ElName => e !== null)));
}
function nayinL3(n: NayinPillarLike): L3 | null {
  if (!n || !n.th) return null;
  return tr(n.th, n.en, n.zh);
}
/** ดึงฉายาในเครื่องหมายคำพูดจาก core (เช่น "ต้นไม้ใหญ่ ต้นสน ต้นโอ๊ก") — regex บนข้อความจริง ไม่ปั้น */
function quotedArchetype(text: string | undefined): string {
  const m = /[“"]([^”"]{2,60})[”"]/.exec(text || "");
  return m ? m[1] : "";
}

/* ══ sections ══ */
export type StorySections = {
  hero: {
    name: string;
    oneLiner: L3;
    pillars: Record<"year" | "month" | "day" | "hour", { stem: string; branch: string; nayin: L3 | null } | null>;
  };
  persona: { bullets: L3[] } | null;
  careerMoney: {
    text: L3;
    highlight: L3 | null;
    caution: L3 | null;
    tenGods: { god: string; pillar: string; name: L3; meaning: L3 }[];
  } | null;
  love: { text: L3; flags: string[] } | null;
  lifePath: {
    periods: { age_start: number; age_end: number; stem: string; branch: string; element: L3 | null; qi_phase: string | null; isCurrent: boolean }[];
    text: L3;
  } | null;
  elements5: { counts: Record<ElName, number>; percent: Record<ElName, number> } | null;
  health: { text: L3 } | null;
  thisYear: {
    pillar: { stem: string; branch: string };
    interactions: { pillar: string; type: "六合" | "六沖" }[];
    text: L3;
  } | null;
  luckyDetail: {
    boost: { element: L3; colors: L3; direction: L3; numbers: number[]; materials: L3 }[];
    avoid: { element: L3; colors: L3 }[];
    text: L3;
  } | null;
  specialStars: { code: string; zh: string; th: string; polarity: string; pillars: string[]; text: L3 }[] | null;
  strengths: L3[];
  cautions: L3[];
  advice: L3 | null;
};

export function buildStorySections(name: string, payload: ChartStoryPayload): StorySections {
  const an = payload.analysis || {};
  const dm = an?.daymaster_profile || null;
  const yv2 = payload.yongshen_v2 || null;
  const pillars = payload.pillars || {};
  const dmStem = String(pillars?.day?.stem || "");
  const dmEl = STEM_ELEMENT[dmStem] || null;
  const fs = an?.functional_strength || null;
  const en = dm?.i18n?.en;
  const zh = dm?.i18n?.zh;

  /* ── hero ── */
  const structureLabel = String(yv2?.structure_label || payload.ge_ju?.structure || "").trim();
  const arch = quotedArchetype(dm?.core);
  const archEn = quotedArchetype(en?.core) || arch;
  const archZh = quotedArchetype(zh?.core) || arch;
  const heroParts: L3[] = [];
  if (structureLabel) heroParts.push(tr(`โครงดวง ${structureLabel}`, `${structureLabel} structure`, `${structureLabel}`));
  if (dm?.label_th) heroParts.push(tr(dm.label_th, en?.label, zh?.label));
  if (arch) heroParts.push({ th: `"${arch}"`, en: `"${archEn}"`, zh: `"${archZh}"` });
  if (fs?.level_th) heroParts.push(tr(`พลังวันเกิด${fs.level_th}`, fs.level_en ? `day master ${fs.level_en}` : undefined, fs.level_zh ? `日主${fs.level_zh}` : undefined));
  const oneLiner: L3 = heroParts.length
    ? joinL3(heroParts, { th: " · ", en: " · ", zh: "·" })
    : tr(name);
  const nayin = an?.nayin || {};
  const heroPillar = (key: "year" | "month" | "day" | "hour") => {
    const p = pillars?.[key];
    if (!p || !p.stem || !p.branch) return null;
    return { stem: p.stem, branch: p.branch, nayin: nayinL3(nayin?.[key] ?? null) };
  };

  /* ── persona: ดึง daymaster_profile เต็ม 4 ก้อน ── */
  const personaBullets: L3[] = [];
  if (dm?.core) personaBullets.push(tr(dm.core, en?.core, zh?.core));
  if (dm?.real_life) personaBullets.push(tr(dm.real_life, en?.real_life, zh?.real_life));
  if (dm?.shadow) personaBullets.push(tr(dm.shadow, en?.shadow, zh?.shadow));
  if (dm?.needs) personaBullets.push(tr(dm.needs, en?.needs, zh?.needs));
  const persona = personaBullets.length ? { bullets: personaBullets } : null;

  /* ── careerMoney: สิบเทพที่มีจริงในดวง + career_industry ── */
  const tg = an?.ten_gods_map || null;
  const godsInChart: { god: string; pillar: string }[] = [];
  for (const key of ["year", "month", "hour"] as const) {
    const god = tg?.[key]?.ten_god;
    if (god && TEN_GOD_DICT[god]) godsInChart.push({ god, pillar: key });
  }
  const ci = an?.career_industry || null;
  let careerMoney: StorySections["careerMoney"] = null;
  if (godsInChart.length || ci) {
    const lines: L3[] = [];
    if (ci?.advice_th) lines.push(tr(ci.advice_th, ci.advice_en, ci.advice_zh));
    if (ci?.industries_th?.length) {
      lines.push(tr(
        `สายงานที่หนุนดวง: ${ci.industries_th.join(" · ")}`,
        ci.industries_en?.length ? `Industries aligned with this chart: ${ci.industries_en.join(" · ")}` : undefined,
        ci.industries_zh?.length ? `相合行業：${ci.industries_zh.join("·")}` : undefined
      ));
    }
    for (const g of godsInChart) {
      const d = TEN_GOD_DICT[g.god];
      const pn = PILLAR_I18N[g.pillar];
      lines.push({
        th: `${d.name.th} ที่${pn.th}: ${d.meaning.th}`,
        en: `${d.name.en} in the ${pn.en}: ${d.meaning.en}`,
        zh: `${pn.zh}${d.name.zh}：${d.meaning.zh}`,
      });
    }
    const topGod = CAREER_GOD_PRIORITY.map((code) => godsInChart.find((g) => g.god === code)).find(Boolean) || null;
    const highlight = topGod
      ? {
          th: `จุดแข็งการงาน-การเงินเด่นสุด: ${TEN_GOD_DICT[topGod.god].name.th} — ${TEN_GOD_DICT[topGod.god].meaning.th}`,
          en: `Strongest career-money signal: ${TEN_GOD_DICT[topGod.god].name.en} — ${TEN_GOD_DICT[topGod.god].meaning.en}`,
          zh: `事業財帛之要：${TEN_GOD_DICT[topGod.god].name.zh}——${TEN_GOD_DICT[topGod.god].meaning.zh}`,
        }
      : null;
    /* caution จาก element_roles status=caution (field จริงมี verdict 3 ภาษา) → fallback jishen */
    const cautionRole = (yv2?.element_roles || []).find((r) => r?.status === "caution" && r?.verdict?.th);
    const jishenEls = elList(yv2?.jishen);
    const caution = cautionRole
      ? tr(cautionRole.verdict!.th!, cautionRole.verdict!.en, cautionRole.verdict!.zh)
      : jishenEls.length
        ? {
            th: `ธาตุที่ควรระวังในการงาน-การเงิน: ${jishenEls.map((e) => EL_I18N[e].th).join(" · ")}`,
            en: `Elements to handle with care in career and money: ${jishenEls.map((e) => EL_I18N[e].en).join(" · ")}`,
            zh: `事業財帛須慎五行：${jishenEls.map((e) => EL_I18N[e].zh).join("·")}`,
          }
        : null;
    careerMoney = lines.length
      ? {
          text: joinL3(lines, { th: "\n", en: "\n", zh: "\n" }),
          highlight,
          caution,
          tenGods: godsInChart.map((g) => ({ god: g.god, pillar: g.pillar, name: TEN_GOD_DICT[g.god].name, meaning: TEN_GOD_DICT[g.god].meaning })),
        }
      : null;
  }

  /* ── love: spouse_palace มีเท่าไหนใช้เท่านั้น · ไม่มี = null ── */
  const sp = an?.spouse_palace || null;
  let love: StorySections["love"] = null;
  if (sp && sp.day_branch && sp.partner_traits_th) {
    const flags = Array.isArray(sp.relationship_flags) ? sp.relationship_flags : [];
    const lines: L3[] = [
      {
        th: `วังคู่ครอง (กิ่งวันเกิด) คือ ${sp.day_branch}${sp.day_branch_th ? ` ปี${sp.day_branch_th}` : ""} ธาตุ${sp.partner_element_th || sp.day_branch_element || ""}`,
        en: `The spouse palace (day branch) is ${sp.day_branch}${sp.day_branch_en ? ` (${sp.day_branch_en})` : ""}, ${sp.partner_element_en || sp.day_branch_element || ""} element`,
        zh: `夫妻宮（日支）為${sp.day_branch}，${sp.partner_element_zh || sp.day_branch_element || ""}`,
      },
      {
        th: `ภาพคู่ครองตามตำรา: ${sp.partner_traits_th}`,
        en: sp.partner_traits_en ? `Partner traits by canon: ${sp.partner_traits_en}` : `ภาพคู่ครองตามตำรา: ${sp.partner_traits_th}`,
        zh: sp.partner_traits_zh ? `配偶特質：${sp.partner_traits_zh}` : `ภาพคู่ครองตามตำรา: ${sp.partner_traits_th}`,
      },
    ];
    for (const f of flags) {
      if (f.startsWith("六合")) {
        const pk = f.split("·")[1] || "";
        const pn = PILLAR_I18N[pk] || { th: pk, en: pk, zh: pk };
        lines.push({ th: `มีฮะ (六合) ระหว่างวังคู่ครองกับ${pn.th} — แรงดึงดูดกลมเกลียวในดวง`, en: `A harmony combination (六合) links the spouse palace with the ${pn.en} — natural closeness in the chart`, zh: `夫妻宮與${pn.zh}六合——命中親和之力` });
      } else if (f.startsWith("六沖")) {
        const pk = f.split("·")[1] || "";
        const pn = PILLAR_I18N[pk] || { th: pk, en: pk, zh: pk };
        lines.push({ th: `มีชน (六沖) ระหว่างวังคู่ครองกับ${pn.th} — ความสัมพันธ์มีจังหวะกระทบ ต้องอาศัยการปรับตัว`, en: `A clash (六沖) hits the spouse palace from the ${pn.en} — the relationship needs conscious adjustment`, zh: `夫妻宮受${pn.zh}六沖——感情需磨合經營` });
      } else if (f.startsWith("六害")) {
        const pk = f.split("·")[1] || "";
        const pn = PILLAR_I18N[pk] || { th: pk, en: pk, zh: pk };
        lines.push({ th: `มีเบียด (六害) จาก${pn.th} — ระวังเรื่องเข้าใจผิดเล็กๆ สะสม`, en: `A harm (六害) from the ${pn.en} — watch small accumulating misunderstandings`, zh: `${pn.zh}六害——慎防小嫌隙積累` });
      }
    }
    love = { text: joinL3(lines, { th: "\n", en: "\n", zh: "\n" }), flags };
  }

  /* ── lifePath: วัยจรปัจจุบัน + ถัดไป 2 ช่วง จาก luck_pillars จริง ── */
  const luck = Array.isArray(an?.luck_pillars) ? an!.luck_pillars! : [];
  let lifePath: StorySections["lifePath"] = null;
  if (luck.length) {
    const idxRaw = Number(an?.current_luck_idx);
    const idx = Number.isFinite(idxRaw) && idxRaw >= 0 ? Math.min(idxRaw, luck.length - 1) : 0;
    const picked = luck.slice(idx, idx + 3);
    const periods = picked
      .filter((p) => p && p.stem && p.branch)
      .map((p, i) => ({
        age_start: Number(p.age_start ?? 0),
        age_end: Number(p.age_end ?? 0),
        stem: String(p.stem),
        branch: String(p.branch),
        element: elOf(p.element) ? EL_I18N[elOf(p.element)!] : null,
        qi_phase: p.qi_phase ?? null,
        isCurrent: i === 0,
      }));
    if (periods.length) {
      const lines = periods.map((p) => ({
        th: `${p.isCurrent ? "ช่วงนี้ " : ""}อายุ ${Math.floor(p.age_start)}–${Math.floor(p.age_end)}: เสาวัยจร ${p.stem}${p.branch}${p.element ? ` ธาตุ${p.element.th}` : ""}${p.qi_phase ? ` · จังหวะชีวิต ${p.qi_phase}` : ""}`,
        en: `${p.isCurrent ? "Now — " : ""}age ${Math.floor(p.age_start)}–${Math.floor(p.age_end)}: luck pillar ${p.stem}${p.branch}${p.element ? ` (${p.element.en})` : ""}${p.qi_phase ? ` · phase ${p.qi_phase}` : ""}`,
        zh: `${p.isCurrent ? "現行 " : ""}${Math.floor(p.age_start)}–${Math.floor(p.age_end)}歲：大運${p.stem}${p.branch}${p.element ? `（${p.element.zh}）` : ""}${p.qi_phase ? `·${p.qi_phase}` : ""}`,
      }));
      lifePath = { periods, text: joinL3(lines, { th: "\n", en: "\n", zh: "\n" }) };
    }
  }

  /* ── elements5: นับจริงจาก element_counts (เสา+ก้านซ่อน คิดแล้วโดย engine) + เปอร์เซ็นต์รวม 100 ── */
  const ec = an?.element_counts || null;
  let elements5: StorySections["elements5"] = null;
  if (ec && ELS.some((e) => typeof ec[e] === "number")) {
    const counts = Object.fromEntries(ELS.map((e) => [e, Number(ec[e] ?? 0)])) as Record<ElName, number>;
    const total = ELS.reduce((s, e) => s + counts[e], 0);
    let percent = Object.fromEntries(ELS.map((e) => [e, 0])) as Record<ElName, number>;
    if (total > 0) {
      percent = Object.fromEntries(ELS.map((e) => [e, Math.round((counts[e] / total) * 100)])) as Record<ElName, number>;
      const drift = 100 - ELS.reduce((s, e) => s + percent[e], 0);
      if (drift !== 0) {
        const biggest = [...ELS].sort((a, b) => counts[b] - counts[a])[0];
        percent[biggest] += drift;
      }
    }
    elements5 = { counts, percent };
  }

  /* ── health: health_mapping จริง + functional_strength ── */
  const hm = an?.health_mapping || null;
  let health: StorySections["health"] = null;
  if (hm && (hm.summary_th || hm.weak_organs?.length)) {
    const lines: L3[] = [];
    if (hm.summary_th) lines.push(tr(hm.summary_th, hm.summary_en, hm.summary_zh));
    if (hm.dm_organs_th && dmEl) {
      lines.push({
        th: `ธาตุประจำตัว (${EL_I18N[dmEl].th}) ดูแลระบบ: ${hm.dm_organs_th}`,
        en: hm.dm_organs_en ? `Your day-master element (${EL_I18N[dmEl].en}) governs: ${hm.dm_organs_en}` : `ธาตุประจำตัว (${EL_I18N[dmEl].th}) ดูแลระบบ: ${hm.dm_organs_th}`,
        zh: hm.dm_organs_zh ? `日主之${EL_I18N[dmEl].zh}主：${hm.dm_organs_zh}` : `ธาตุประจำตัว (${EL_I18N[dmEl].th}) ดูแลระบบ: ${hm.dm_organs_th}`,
      });
    }
    for (const w of (hm.weak_organs || []).slice(0, 3)) {
      if (!w?.organs_th) continue;
      const wEl = elOf(w.element);
      lines.push({
        th: `จุดที่ธาตุอ่อนในดวง${wEl ? ` (${EL_I18N[wEl].th})` : ""}: ${w.organs_th}${w.reason_th ? ` — ${w.reason_th}` : ""}`,
        en: w.organs_en ? `Weaker element zone${wEl ? ` (${EL_I18N[wEl].en})` : ""}: ${w.organs_en}${w.reason_en ? ` — ${w.reason_en}` : ""}` : `จุดที่ธาตุอ่อนในดวง: ${w.organs_th}`,
        zh: w.organs_zh ? `較弱之${wEl ? EL_I18N[wEl].zh : "行"}：${w.organs_zh}${w.reason_zh ? `——${w.reason_zh}` : ""}` : `จุดที่ธาตุอ่อนในดวง: ${w.organs_th}`,
      });
    }
    for (const c of (hm.caution_organs || []).slice(0, 2)) {
      if (!c?.organs_th) continue;
      lines.push({
        th: `ควรหมั่นดูแล: ${c.organs_th}${c.reason_th ? ` — ${c.reason_th}` : ""}`,
        en: c.organs_en ? `Keep an eye on: ${c.organs_en}${c.reason_en ? ` — ${c.reason_en}` : ""}` : `ควรหมั่นดูแล: ${c.organs_th}`,
        zh: c.organs_zh ? `宜多保養：${c.organs_zh}${c.reason_zh ? `——${c.reason_zh}` : ""}` : `ควรหมั่นดูแล: ${c.organs_th}`,
      });
    }
    if (fs?.level_th) {
      lines.push({
        th: `พลังพื้นฐานของวันเกิดอยู่ระดับ${fs.level_th} — จัดจังหวะพักผ่อนให้สอดคล้อง`,
        en: fs.level_en ? `Overall day-master strength is ${fs.level_en} — pace your rest accordingly` : `พลังพื้นฐานของวันเกิดอยู่ระดับ${fs.level_th}`,
        zh: fs.level_zh ? `日主之力屬${fs.level_zh}——作息宜順其勢` : `พลังพื้นฐานของวันเกิดอยู่ระดับ${fs.level_th}`,
      });
    }
    if (lines.length) health = { text: joinL3(lines, { th: "\n", en: "\n", zh: "\n" }) };
  }

  /* ── thisYear: ปีจรจาก current_year_pillar จริง + 六合/六沖 closed-list กับเสาจริง ── */
  const cyp = an?.current_year_pillar || null;
  let thisYear: StorySections["thisYear"] = null;
  if (cyp?.stem && cyp?.branch) {
    const yEl = STEM_ELEMENT[cyp.stem] || null;
    const interactions: { pillar: string; type: "六合" | "六沖" }[] = [];
    for (const key of ["year", "month", "day", "hour"] as const) {
      const b = pillars?.[key]?.branch;
      if (!b) continue;
      if (SIX_HE[cyp.branch] === b) interactions.push({ pillar: key, type: "六合" });
      if (SIX_CLASH[cyp.branch] === b) interactions.push({ pillar: key, type: "六沖" });
    }
    const lines: L3[] = [
      {
        th: `ปีจรปัจจุบันคือ ${cyp.stem}${cyp.branch}${yEl ? ` ธาตุ${EL_I18N[yEl].th}` : ""}`,
        en: `The current annual pillar is ${cyp.stem}${cyp.branch}${yEl ? ` (${EL_I18N[yEl].en})` : ""}`,
        zh: `流年${cyp.stem}${cyp.branch}${yEl ? `，${EL_I18N[yEl].zh}氣當令` : ""}`,
      },
    ];
    for (const it of interactions) {
      const pn = PILLAR_I18N[it.pillar];
      if (it.type === "六合") {
        lines.push({ th: `กิ่งปีจรฮะ (六合) กับ${pn.th} — เรื่องของเสานี้มีแรงหนุนเข้าหากันตลอดปี`, en: `The annual branch combines (六合) with your ${pn.en} — matters of this pillar draw support all year`, zh: `流年支與${pn.zh}六合——該柱之事全年得聚合之力` });
      } else {
        lines.push({ th: `กิ่งปีจรชน (六沖) กับ${pn.th} — เรื่องของเสานี้มีความเคลื่อนไหว/เปลี่ยนแปลง ควรวางแผนเผื่อ`, en: `The annual branch clashes (六沖) with your ${pn.en} — expect movement or change in this pillar's domain`, zh: `流年支沖${pn.zh}——該柱領域多動盪變化，宜預作安排` });
      }
    }
    if (!interactions.length) {
      lines.push({ th: `กิ่งปีจรไม่ชน/ไม่ฮะตรงกับเสาไหนในดวง — ปีที่เคลื่อนตามจังหวะปกติ`, en: `The annual branch neither clashes nor combines directly with your natal pillars — a year that moves at its normal rhythm`, zh: `流年支與命局無正沖正合——歲運平順而行` });
    }
    const yongEls = elList(yv2?.primary_yongshen);
    const jiEls = elList(yv2?.jishen);
    if (yEl && yongEls.includes(yEl)) {
      lines.push({ th: `ธาตุของปีจร (${EL_I18N[yEl].th}) ตรงกับธาตุที่หนุนดวง — ปีที่กระแสเข้าข้าง`, en: `The year's element (${EL_I18N[yEl].en}) matches your favorable element — the current runs with you`, zh: `流年之${EL_I18N[yEl].zh}正是喜用——歲氣順勢` });
    } else if (yEl && jiEls.includes(yEl)) {
      lines.push({ th: `ธาตุของปีจร (${EL_I18N[yEl].th}) เป็นธาตุที่ดวงต้องระวัง — ปีนี้เดินเกมรอบคอบ`, en: `The year's element (${EL_I18N[yEl].en}) is one your chart must handle carefully — play a measured game this year`, zh: `流年之${EL_I18N[yEl].zh}屬忌——今年宜穩紮穩打` });
    }
    thisYear = { pillar: { stem: cyp.stem, branch: cyp.branch }, interactions, text: joinL3(lines, { th: "\n", en: "\n", zh: "\n" }) };
  }

  /* ── luckyDetail: สี/ทิศ/เลข/วัสดุ จาก yongshen จริง ── */
  const yongEls = elList(yv2?.primary_yongshen);
  const xiEls = elList(yv2?.xishen).filter((e) => !yongEls.includes(e));
  const jiEls = elList(yv2?.jishen);
  let luckyDetail: StorySections["luckyDetail"] = null;
  if (yongEls.length || xiEls.length) {
    const boost = [...yongEls, ...xiEls].map((e) => ({
      element: EL_I18N[e],
      colors: EL_LUCKY[e].colors,
      direction: EL_LUCKY[e].direction,
      numbers: EL_LUCKY[e].numbers,
      materials: EL_LUCKY[e].materials,
    }));
    const avoid = jiEls.map((e) => ({ element: EL_I18N[e], colors: EL_LUCKY[e].colors }));
    const lines: L3[] = [...yongEls, ...xiEls].map((e) => ({
      th: `ธาตุ${EL_I18N[e].th}${yongEls.includes(e) ? " (ธาตุหนุนหลัก)" : " (ธาตุเสริม)"}: สี${EL_LUCKY[e].colors.th} · ${EL_LUCKY[e].direction.th} · เลข ${EL_LUCKY[e].numbers.join(", ")} · วัสดุ ${EL_LUCKY[e].materials.th}`,
      en: `${EL_I18N[e].en}${yongEls.includes(e) ? " (primary support)" : " (secondary support)"}: colors ${EL_LUCKY[e].colors.en} · ${EL_LUCKY[e].direction.en} · numbers ${EL_LUCKY[e].numbers.join(", ")} · materials ${EL_LUCKY[e].materials.en}`,
      zh: `${EL_I18N[e].zh}${yongEls.includes(e) ? "（主用）" : "（輔喜）"}：色${EL_LUCKY[e].colors.zh}·${EL_LUCKY[e].direction.zh}·數${EL_LUCKY[e].numbers.join("、")}·${EL_LUCKY[e].materials.zh}`,
    }));
    if (jiEls.length) {
      lines.push({
        th: `เลี่ยงใช้เป็นสีหลัก: ${jiEls.map((e) => EL_LUCKY[e].colors.th).join(" / ")} (ธาตุ${jiEls.map((e) => EL_I18N[e].th).join("·")}ที่ดวงต้องระวัง)`,
        en: `Avoid as dominant colors: ${jiEls.map((e) => EL_LUCKY[e].colors.en).join(" / ")} (${jiEls.map((e) => EL_I18N[e].en).join(", ")} — elements this chart must watch)`,
        zh: `不宜作主色：${jiEls.map((e) => EL_LUCKY[e].colors.zh).join("／")}（忌${jiEls.map((e) => EL_I18N[e].zh).join("·")}）`,
      });
    }
    luckyDetail = { boost, avoid, text: joinL3(lines, { th: "\n", en: "\n", zh: "\n" }) };
  }

  /* ── specialStars: ดาวเด่น 2-3 ดวงจาก payload (dedupe ตาม code) ── */
  const starMap = an?.special_stars || null;
  let specialStars: StorySections["specialStars"] = null;
  if (starMap) {
    const seen = new Map<string, StarHitLike>();
    for (const key of Object.keys(starMap)) {
      for (const hit of starMap[key] || []) {
        if (hit?.code && !seen.has(hit.code)) seen.set(hit.code, hit);
      }
    }
    const rank = (h: StarHitLike) => (h.polarity === "good" ? 2 : h.polarity === "bad" ? 1 : 0) * 10 + (h.pillars?.length || 0);
    const top = [...seen.values()].sort((a, b) => rank(b) - rank(a)).slice(0, 3);
    if (top.length) {
      specialStars = top.map((h) => {
        const pillarsL3 = (h.pillars || []).map((p) => PILLAR_I18N[p] || { th: p, en: p, zh: p });
        const where = joinL3(pillarsL3, { th: " และ ", en: " and ", zh: "與" });
        const pol: L3 = h.polarity === "good"
          ? { th: "ดาวฝ่ายดี เสริมพลังด้านนี้ให้ดวง", en: "an auspicious star that strengthens this area", zh: "吉星，助旺此宮" }
          : h.polarity === "bad"
            ? { th: "ดาวที่ต้องระวัง — รู้ทันไว้เพื่อวางแผนรับ", en: "a star to watch — knowing it lets you plan around it", zh: "須留意之星——知之可預為之計" }
            : { th: "ดาวกลาง ให้ผลตามบริบทของดวง", en: "a neutral star whose effect follows the chart's context", zh: "中性之星，隨局而化" };
        return {
          code: String(h.code || ""),
          zh: String(h.zh || ""),
          th: String(h.th || ""),
          polarity: String(h.polarity || "neutral"),
          pillars: h.pillars || [],
          text: {
            th: `${h.th || h.zh} (${h.zh}) สถิตที่${where.th || "ดวง"} — ${pol.th}`,
            en: `${h.zh} (${h.th}) sits in your ${where.en || "chart"} — ${pol.en}`,
            zh: `${h.zh}坐${where.zh || "命"}——${pol.zh}`,
          },
        };
      });
    }
  }

  /* ── strengths / cautions: core/shadow เต็ม + ดาว polarity (≤4 ข้อ) ── */
  const strengths: L3[] = [];
  const cautions: L3[] = [];
  if (dm?.core) strengths.push(tr(dm.core, en?.core, zh?.core));
  if (dm?.real_life) strengths.push(tr(dm.real_life, en?.real_life, zh?.real_life));
  for (const s of specialStars || []) {
    if (s.polarity === "good" && strengths.length < 4) strengths.push(s.text);
  }
  if (dm?.shadow) cautions.push(tr(dm.shadow, en?.shadow, zh?.shadow));
  for (const s of specialStars || []) {
    if (s.polarity === "bad" && cautions.length < 4) cautions.push(s.text);
  }
  const cautionRoles = (yv2?.element_roles || []).filter((r) => r?.status === "caution" && r?.verdict?.th);
  for (const r of cautionRoles) {
    if (cautions.length < 4) cautions.push(tr(r.verdict!.th!, r.verdict!.en, r.verdict!.zh));
  }

  /* ── advice: needs จริง + สรุป yongshen สี/ทิศ ── */
  let advice: L3 | null = null;
  if (dm?.needs || yongEls.length) {
    const parts: L3[] = [];
    if (dm?.needs) parts.push(tr(dm.needs, en?.needs, zh?.needs));
    if (yongEls.length) {
      parts.push({
        th: `เสริมดวงประจำวัน: ธาตุ${yongEls.map((e) => EL_I18N[e].th).join(" · ")} · สี${yongEls.map((e) => EL_LUCKY[e].colors.th).join(" / ")} · ${yongEls.map((e) => EL_LUCKY[e].direction.th).join(" / ")}`,
        en: `Daily boosters: ${yongEls.map((e) => EL_I18N[e].en).join(" · ")} element${yongEls.length > 1 ? "s" : ""} · colors ${yongEls.map((e) => EL_LUCKY[e].colors.en).join(" / ")} · ${yongEls.map((e) => EL_LUCKY[e].direction.en).join(" / ")}`,
        zh: `日常補運：${yongEls.map((e) => EL_I18N[e].zh).join("·")}行·色${yongEls.map((e) => EL_LUCKY[e].colors.zh).join("／")}·${yongEls.map((e) => EL_LUCKY[e].direction.zh).join("／")}`,
      });
    }
    advice = joinL3(parts, { th: "\n\n", en: "\n\n", zh: "\n\n" });
  }

  return {
    hero: {
      name,
      oneLiner,
      pillars: { year: heroPillar("year"), month: heroPillar("month"), day: heroPillar("day"), hour: heroPillar("hour") },
    },
    persona,
    careerMoney,
    love,
    lifePath,
    elements5,
    health,
    thisYear,
    luckyDetail,
    specialStars,
    strengths,
    cautions,
    advice,
  };
}

/* ══ scene prompt builder — อังกฤษล้วน · องค์ประกอบแปรตามดวงจริง ══ */
const SCENE_BY_ELEMENT: Record<ElName, string> = {
  wood: "an ancient emerald forest at golden sunrise, tall trees reaching toward the sky",
  fire: "a radiant golden sun rising over a majestic mountain range",
  earth: "a vast golden plain with a monumental stone fortress on the horizon",
  metal: "moonlit silver peaks under a crystalline night sky",
  water: "a luminous winding river flowing under a full moon",
};
const ACCENT_BY_ELEMENT: Record<ElName, string> = {
  wood: "framed by fresh green branches and drifting leaves",
  fire: "bathed in warm amber and crimson light",
  earth: "grounded by golden earthen terraces and standing stones",
  metal: "accented by silver mist and metallic starlight",
  water: "with a calm reflective water surface catching the light",
};
const MOTIF_BY_GROUP: Record<TenGodGroup, string> = {
  wealth: "a river of golden coins flowing through the landscape",
  power: "a grand imperial gate standing tall at the horizon",
  wisdom: "ancient glowing scrolls floating gently in the air",
  art: "ink blossoms blooming into flowers of light",
  peer: "twin standing stones side by side catching the same light",
};
export const SCENE_PROMPT_MANDATORY_TAIL =
  "absolutely no text, no letters, no numbers, no charts, no diagrams anywhere in the image; leave the lower third calm and dark for overlay panels; leave a clear central zone in upper third for a portrait";

/** เลือก motif group จากดวงจริง: ตัวอักษรในชื่อโครงดวงก่อน → สิบเทพที่โผล่ในเสา */
function dominantGroup(payload: ChartStoryPayload): TenGodGroup | null {
  const label = String(payload.yongshen_v2?.structure_label || payload.ge_ju?.structure || "");
  if (/財/.test(label)) return "wealth";
  if (/官|殺/.test(label)) return "power";
  if (/印/.test(label)) return "wisdom";
  if (/食|傷/.test(label)) return "art";
  const tg = payload.analysis?.ten_gods_map;
  const gods = (["year", "month", "hour"] as const)
    .map((k) => tg?.[k]?.ten_god)
    .filter((g): g is string => !!g && !!TEN_GOD_DICT[g]);
  for (const code of CAREER_GOD_PRIORITY) {
    if (gods.includes(code)) return TEN_GOD_DICT[code].group;
  }
  return null;
}

export function buildScenePrompt(payload: ChartStoryPayload): string {
  const dmEl = STEM_ELEMENT[String(payload.pillars?.day?.stem || "")] || null;
  const yongEls = elList(payload.yongshen_v2?.primary_yongshen);
  const xiEls = elList(payload.yongshen_v2?.xishen);
  const sceneEl: ElName = dmEl || yongEls[0] || "earth";
  const accentEl = yongEls.find((e) => e !== sceneEl) || xiEls.find((e) => e !== sceneEl) || null;

  const parts: string[] = [
    "Vertical cinematic destiny poster, 9:16 aspect ratio.",
    "Obsidian navy and champagne gold palette, cosmic light and fine golden star dust.",
    `Main scene: ${SCENE_BY_ELEMENT[sceneEl]}${accentEl ? `, ${ACCENT_BY_ELEMENT[accentEl]}` : ""}.`,
  ];
  const group = dominantGroup(payload);
  if (group) parts.push(`Symbolic motif: ${MOTIF_BY_GROUP[group]}.`);

  /* วัยจรขาขึ้น = ธาตุวัยจรปัจจุบันตรงกับ 用神/喜神 → ถนนขึ้นยอดเขาเรืองแสง */
  const luck = payload.analysis?.luck_pillars || [];
  const idxRaw = Number(payload.analysis?.current_luck_idx);
  const idx = Number.isFinite(idxRaw) && idxRaw >= 0 ? Math.min(idxRaw, Math.max(0, luck.length - 1)) : 0;
  const curLuckEl = luck.length ? elOf(luck[idx]?.element) : null;
  if (curLuckEl && (yongEls.includes(curLuckEl) || xiEls.includes(curLuckEl))) {
    parts.push("An ascending road leading up to a glowing summit.");
  }

  parts.push("Ethereal, majestic, ultra-detailed digital painting, volumetric light, no people in frame.");
  parts.push(SCENE_PROMPT_MANDATORY_TAIL);
  return parts.join(" ");
}
