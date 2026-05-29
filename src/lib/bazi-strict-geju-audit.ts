/* BaZi strict audit helpers (ctext-first) — ไม่แทน engine หลัก
   เป้าหมาย: ตรวจ 2 จุดที่ซินแสข้างนอกทัก โดยยึดตัวบท:
   - 十二長生: 陰長生 เป็น明根/รากอ่อน ไม่ใช่長生แรงเต็ม
   - 格局: ตั้งจาก月令ก่อน แล้วดู透干/會支; 雜氣ไม่透ไม่會ให้กลับไป土

   Source anchors:
   - ZPZQ-QP-001: 「陰長生不作此論...然亦為明根，可比得一餘氣」
   - ZPZQ-GE-001: 「八字用神，專求月令」
   - ZPZQ-GE-002: 「透干會支，取其清者用之」
   - ZPZQ-GE-003: 「不透不會，則僅以土論」 */

export type PillarKey = "year" | "month" | "day" | "hour";
export type Pillar = { stem: string; branch: string };
export type Pillars = Record<PillarKey, Pillar | null>;

const STEMS = ["甲","乙","丙","丁","戊","己","庚","辛","壬","癸"];
const BRANCHES = ["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"];

const STEM_ELEMENT: Record<string, "wood"|"fire"|"earth"|"metal"|"water"> = {
  甲:"wood", 乙:"wood", 丙:"fire", 丁:"fire", 戊:"earth", 己:"earth", 庚:"metal", 辛:"metal", 壬:"water", 癸:"water",
};
const STEM_POLARITY: Record<string, "yang"|"yin"> = {
  甲:"yang", 乙:"yin", 丙:"yang", 丁:"yin", 戊:"yang", 己:"yin", 庚:"yang", 辛:"yin", 壬:"yang", 癸:"yin",
};
const ELEMENT_PRODUCES: Record<string, string> = { wood:"fire", fire:"earth", earth:"metal", metal:"water", water:"wood" };
const ELEMENT_CONTROLS: Record<string, string> = { wood:"earth", earth:"water", water:"fire", fire:"metal", metal:"wood" };

const STEM_ANCHOR: Record<string, { start: string; dir: 1 | -1 }> = {
  甲:{ start:"亥", dir:1 }, 丙:{ start:"寅", dir:1 }, 戊:{ start:"寅", dir:1 },
  庚:{ start:"巳", dir:1 }, 壬:{ start:"申", dir:1 },
  乙:{ start:"午", dir:-1 }, 丁:{ start:"酉", dir:-1 }, 己:{ start:"酉", dir:-1 },
  辛:{ start:"子", dir:-1 }, 癸:{ start:"卯", dir:-1 },
};
const PHASE_ORDER = ["長生","沐浴","冠帶","臨官","帝旺","衰","病","死","墓","絕","胎","養"];

const HIDDEN_STEMS: Record<string, { main: string; middle?: string | null; residual?: string | null }> = {
  子:{ main:"癸" },
  丑:{ main:"己", middle:"癸", residual:"辛" },
  寅:{ main:"甲", middle:"丙", residual:"戊" },
  卯:{ main:"乙" },
  辰:{ main:"戊", middle:"乙", residual:"癸" },
  巳:{ main:"丙", middle:"戊", residual:"庚" },
  午:{ main:"丁", middle:"己" },
  未:{ main:"己", middle:"丁", residual:"乙" },
  申:{ main:"庚", middle:"壬", residual:"戊" },
  酉:{ main:"辛" },
  戌:{ main:"戊", middle:"辛", residual:"丁" },
  亥:{ main:"壬", middle:"甲" },
};

const PURE_BRANCHES = new Set(["子","午","卯","酉"]);
const LONG_LIFE_BRANCHES = new Set(["寅","申","巳","亥"]);
const STORAGE_BRANCHES = new Set(["辰","戌","丑","未"]);

const TEN_GOD_TO_STRUCTURE: Record<string, string> = {
  正印:"正印格", 偏印:"偏印格", 正官:"正官格", 七殺:"七殺格",
  正財:"正財格", 偏財:"偏財格", 食神:"食神格", 傷官:"傷官格",
  比肩:"比肩格", 劫財:"劫財格",
};

export function tenGodStrict(dayMaster: string, targetStem: string): string | null {
  const dmEl = STEM_ELEMENT[dayMaster];
  const tEl = STEM_ELEMENT[targetStem];
  const dmPol = STEM_POLARITY[dayMaster];
  const tPol = STEM_POLARITY[targetStem];
  if (!dmEl || !tEl || !dmPol || !tPol) return null;
  const samePol = dmPol === tPol;
  if (dmEl === tEl) return samePol ? "比肩" : "劫財";
  if (ELEMENT_PRODUCES[dmEl] === tEl) return samePol ? "食神" : "傷官";
  if (ELEMENT_CONTROLS[dmEl] === tEl) return samePol ? "偏財" : "正財";
  if (ELEMENT_CONTROLS[tEl] === dmEl) return samePol ? "七殺" : "正官";
  if (ELEMENT_PRODUCES[tEl] === dmEl) return samePol ? "偏印" : "正印";
  return null;
}

export function twelvePhaseStrict(stem: string, branch: string): string | null {
  const a = STEM_ANCHOR[stem];
  if (!a) return null;
  const startIdx = BRANCHES.indexOf(a.start);
  const branchIdx = BRANCHES.indexOf(branch);
  if (startIdx < 0 || branchIdx < 0) return null;
  let offset = (branchIdx - startIdx) * a.dir;
  offset = ((offset % 12) + 12) % 12;
  return PHASE_ORDER[offset] || null;
}

export type StrictRootClass = "heavy_root" | "medium_root" | "light_root" | "no_root" | "unknown";

export type StrictPhaseAudit = {
  stem: string;
  branch: string;
  phase: string | null;
  rootClass: StrictRootClass;
  reasonCodes: string[];
  sourceRuleIds: string[];
  thaiSummary: string;
  canonicalChinese: string;
};

export function auditTwelvePhaseRoot(stem: string, branch: string): StrictPhaseAudit {
  const phase = twelvePhaseStrict(stem, branch);
  if (!phase || !STEM_POLARITY[stem]) {
    return {
      stem, branch, phase, rootClass: "unknown",
      reasonCodes: ["unknown_stem_or_branch"],
      sourceRuleIds: ["ZPZQ-QP-001"],
      canonicalChinese: "陰長生不作此論",
      thaiSummary: "ไม่รู้จักก้าน/กิ่ง จึงไม่ให้คะแนนราก",
    };
  }
  const pol = STEM_POLARITY[stem];
  if (phase === "長生" && pol === "yin") {
    return {
      stem, branch, phase, rootClass: "light_root",
      reasonCodes: ["yin_changsheng_counts_as_ming_root_not_heavy"],
      sourceRuleIds: ["ZPZQ-QP-001"],
      canonicalChinese: "陰長生不作此論，然亦為明根",
      thaiSummary: `${stem}${branch} ได้十二長生=${phase} แต่เป็น陰干長生 จึงนับเป็นรากอ่อน/明根 ไม่ใช่รากหนัก`,
    };
  }
  if (["長生", "臨官", "帝旺"].includes(phase)) {
    return {
      stem, branch, phase, rootClass: "heavy_root",
      reasonCodes: ["changsheng_lu_wang_heavy_root"],
      sourceRuleIds: ["ZPZQ-QP-001"],
      canonicalChinese: "長生祿旺，根之重者也",
      thaiSummary: `${stem}${branch} ได้${phase} จัดเป็นรากหนักตาม長生祿旺`,
    };
  }
  if (phase === "冠帶") {
    return {
      stem, branch, phase, rootClass: "medium_root",
      reasonCodes: ["phase_medium_root"],
      sourceRuleIds: ["ZPZQ-QP-001"],
      canonicalChinese: "長生祿旺，根之重者也",
      thaiSummary: `${stem}${branch} ได้冠帶 เป็นแรงกำลังขึ้น ยังไม่เท่า長生/祿/旺`,
    };
  }
  if (phase === "墓") {
    return {
      stem, branch, phase, rootClass: pol === "yang" ? "light_root" : "no_root",
      reasonCodes: [pol === "yang" ? "yang_storage_is_root" : "yin_storage_not_counted_as_root"],
      sourceRuleIds: ["ZPZQ-QP-001"],
      canonicalChinese: "若是逢庫，則陽為有根，而陰為無用",
      thaiSummary: pol === "yang"
        ? `${stem}${branch} อยู่墓庫 นับเป็นรากอ่อน`
        : `${stem}${branch} อยู่墓庫ของ陰干 ตามสาย strict ไม่ใช้เป็นรากหลัก`,
    };
  }
  return {
    stem, branch, phase, rootClass: "no_root",
    reasonCodes: ["phase_not_root"],
    sourceRuleIds: ["ZPZQ-QP-001"],
    canonicalChinese: "長生祿旺，根之重者也；墓庫餘氣，根之輕者也",
    thaiSummary: `${stem}${branch} ได้${phase} ไม่ใช่จุดรากหลัก`,
  };
}

export type StrictGeJuAudit = {
  selectedStem: string | null;
  selectedSource: "pure_main" | "long_life_main_visible" | "long_life_middle_visible" | "long_life_main_fallback" | "storage_visible" | "storage_earth_fallback" | "unknown";
  tenGod: string | null;
  structure: string | null;
  confidence: "high" | "medium" | "review";
  reasonCodes: string[];
  sourceRuleIds: string[];
  thaiSummary: string;
  canonicalChinese: string;
};

function activeStemEntries(pillars: Pillars): Array<{ pillar: PillarKey; stem: string }> {
  const out: Array<{ pillar: PillarKey; stem: string }> = [];
  for (const pillar of ["year","month","hour"] as PillarKey[]) {
    const p = pillars[pillar];
    if (p?.stem) out.push({ pillar, stem: p.stem });
  }
  return out;
}

function hiddenList(branch: string): string[] {
  const h = HIDDEN_STEMS[branch];
  return h ? [h.main, h.middle, h.residual].filter(Boolean) as string[] : [];
}

export function auditStrictGeJuFromMonth(pillars: Pillars): StrictGeJuAudit {
  const dm = pillars.day?.stem;
  const monthBranch = pillars.month?.branch;
  if (!dm || !monthBranch || !HIDDEN_STEMS[monthBranch]) {
    return {
      selectedStem: null, selectedSource: "unknown", tenGod: null, structure: null, confidence: "review",
      reasonCodes: ["missing_day_or_month"],
      sourceRuleIds: ["ZPZQ-GE-001"],
      canonicalChinese: "八字用神，專求月令",
      thaiSummary: "ข้อมูลวันหรือเดือนไม่ครบ จึงตั้ง格แบบ strict ไม่ได้",
    };
  }

  const h = HIDDEN_STEMS[monthBranch];
  const visible = activeStemEntries(pillars);
  const visibleSet = new Set(visible.map((x) => x.stem));
  let selectedStem: string | null = null;
  let selectedSource: StrictGeJuAudit["selectedSource"] = "unknown";
  const reasonCodes: string[] = [];
  const sourceRuleIds = ["ZPZQ-GE-001"];
  let canonicalChinese = "八字用神，專求月令";

  if (PURE_BRANCHES.has(monthBranch)) {
    selectedStem = h.main;
    selectedSource = "pure_main";
    reasonCodes.push("pure_month_takes_main_qi");
    canonicalChinese = "八字用神，專求月令";
  } else if (LONG_LIFE_BRANCHES.has(monthBranch)) {
    if (visibleSet.has(h.main)) {
      selectedStem = h.main;
      selectedSource = "long_life_main_visible";
      reasonCodes.push("main_qi_visible");
      sourceRuleIds.push("ZPZQ-GE-004");
      canonicalChinese = "本氣透使用本氣";
    } else if (h.middle && visibleSet.has(h.middle)) {
      selectedStem = h.middle;
      selectedSource = "long_life_middle_visible";
      reasonCodes.push("middle_qi_visible_without_main_qi");
      sourceRuleIds.push("ZPZQ-GE-004");
      canonicalChinese = "不透甲而透丙，則同知得以作主";
    } else {
      selectedStem = h.main;
      selectedSource = "long_life_main_fallback";
      reasonCodes.push("no_month_hidden_visible_take_main_qi_for_review");
      canonicalChinese = "八字用神，專求月令";
    }
  } else if (STORAGE_BRANCHES.has(monthBranch)) {
    const candidates = hiddenList(monthBranch);
    const visibleHidden = candidates.find((stem) => visibleSet.has(stem));
    if (visibleHidden) {
      selectedStem = visibleHidden;
      selectedSource = "storage_visible";
      reasonCodes.push("storage_hidden_stem_visible");
      sourceRuleIds.push("ZPZQ-GE-002");
      canonicalChinese = "透干會支，取其清者用之";
    } else {
      selectedStem = h.main;
      selectedSource = "storage_earth_fallback";
      reasonCodes.push("storage_no_visible_no_hui_fallback_to_earth");
      sourceRuleIds.push("ZPZQ-GE-003");
      canonicalChinese = "不透不會，則僅以土論";
    }
  }

  const tenGod = selectedStem ? tenGodStrict(dm, selectedStem) : null;
  const structure = tenGod ? TEN_GOD_TO_STRUCTURE[tenGod] || null : null;
  const confidence: StrictGeJuAudit["confidence"] =
    selectedSource === "long_life_main_fallback" ? "medium" :
    selectedSource === "unknown" ? "review" : "high";
  return {
    selectedStem,
    selectedSource,
    tenGod,
    structure,
    confidence,
    reasonCodes,
    sourceRuleIds,
    canonicalChinese,
    thaiSummary: selectedStem && structure
      ? `strict格局: เดือน${monthBranch} เลือก${selectedStem}/${tenGod} → ${structure} (${canonicalChinese})`
      : `strict格局: เดือน${monthBranch} ยังสรุปไม่ได้`,
  };
}
