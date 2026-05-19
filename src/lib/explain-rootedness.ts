/**
 * explain-rootedness.ts · 19 พ.ค. 2026
 *
 * แปลง rootedness จาก wrapper-7 → ภาษาซินแส 3 ภาษา (TH/EN/ZH)
 * อธิบาย "ทำไม % ธาตุได้เท่านี้" ในการ์ด DM Strength
 */

const STEM_ELEMENT: Record<string, string> = {
  甲:"wood", 乙:"wood", 丙:"fire", 丁:"fire", 戊:"earth",
  己:"earth", 庚:"metal", 辛:"metal", 壬:"water", 癸:"water",
};

const EL_TH: Record<string, string> = {
  wood:'ไม้', fire:'ไฟ', earth:'ดิน', metal:'ทอง', water:'น้ำ',
};
const EL_EN: Record<string, string> = {
  wood:'Wood', fire:'Fire', earth:'Earth', metal:'Metal', water:'Water',
};
const EL_ZH: Record<string, string> = {
  wood:'木', fire:'火', earth:'土', metal:'金', water:'水',
};

const POS_TH: Record<string, string> = {
  year:'เสาปี', month:'เสาเดือน', day:'เสาวัน', hour:'เสาชั่วยาม',
};
const POS_EN: Record<string, string> = {
  year:'Year', month:'Month', day:'Day', hour:'Hour',
};
const POS_ZH: Record<string, string> = {
  year:'年柱', month:'月柱', day:'日柱', hour:'時柱',
};

const QI_TH: Record<string, string> = {
  main:'แก่นหลัก', middle:'แก่นกลาง', residual:'แก่นปลาย',
};
const QI_EN: Record<string, string> = {
  main:'main qi', middle:'middle qi', residual:'residual qi',
};
const QI_ZH: Record<string, string> = {
  main:'主氣', middle:'中氣', residual:'餘氣',
};

const CONTEST_TH: Record<string, string> = {
  clash:'ถูกชน (沖)',
  punish:'ถูกโทษ (刑)',
  harm:'ถูกเบียด (害)',
  destroy:'ถูกแตก (破)',
};
const CONTEST_EN: Record<string, string> = {
  clash:'clashed (沖)', punish:'punished (刑)',
  harm:'harmed (害)', destroy:'destroyed (破)',
};
const CONTEST_ZH: Record<string, string> = {
  clash:'被沖', punish:'被刑', harm:'被害', destroy:'被破',
};

const LABEL_TH: Record<string, string> = {
  no_root:'ไม่มีราก',
  token_root:'รากบางจริง',
  partial_root:'รากบางส่วน',
  rooted:'มีราก',
  strong_root:'รากแกร่ง',
};
const LABEL_EN: Record<string, string> = {
  no_root:'No root', token_root:'Token root', partial_root:'Partial root',
  rooted:'Rooted', strong_root:'Strong root',
};
const LABEL_ZH: Record<string, string> = {
  no_root:'無根', token_root:'微根', partial_root:'半根',
  rooted:'有根', strong_root:'強根',
};

interface RootSource {
  pos: string;
  branch: string;
  qi_type: string;
  hidden_stem: string;
  weight: number;
  contest_penalty?: number;
  contested_by?: string;
}

interface RootednessOne {
  total_score: number;
  rootedness_label: string;
  sources?: RootSource[];
  has_root?: boolean;
}

interface RootednessMap {
  [el: string]: RootednessOne;
}

export interface ElementExplain {
  element: string;
  element_th: string;
  element_en: string;
  element_zh: string;
  pct: number;
  label: string;             /* rootedness_label */
  label_th: string;
  label_en: string;
  label_zh: string;
  is_dm: boolean;
  summary_th: string;        /* บทสรุป 1 ประโยค */
  summary_en: string;
  summary_zh: string;
  sources_th: string[];      /* รายการ bullet · ที่อยู่ + สถานะ */
  sources_en: string[];
  sources_zh: string[];
}

export function buildRootednessExplain(dmStem: string, rootedness: RootednessMap): ElementExplain[] {
  const dmEl = STEM_ELEMENT[dmStem] || 'earth';
  const ELS = ['wood','fire','earth','metal','water'] as const;

  /* คำนวณ pct */
  let total = 0;
  const scores: Record<string, number> = {};
  for (const el of ELS) {
    scores[el] = Math.max(0, rootedness?.[el]?.total_score ?? 0);
    total += scores[el];
  }
  if (total === 0) total = 1;

  return ELS.map(el => {
    const r = rootedness?.[el] || { total_score: 0, rootedness_label: 'no_root', sources: [] };
    const pct = Math.round((scores[el] / total) * 100);
    const label = r.rootedness_label || 'no_root';
    const isDm = el === dmEl;
    const sources = (r.sources || []).filter(s => s);

    /* รายการ source · ภาษาซินแส */
    const sources_th: string[] = [];
    const sources_en: string[] = [];
    const sources_zh: string[] = [];

    if (sources.length === 0) {
      sources_th.push('ไม่มีรากในผัง · ไม่เจอที่อยู่ของธาตุนี้');
      sources_en.push('No root in chart · element not found');
      sources_zh.push('盤無根·此五行未現');
    } else {
      sources.forEach(s => {
        const posTh = POS_TH[s.pos] || s.pos;
        const posEn = POS_EN[s.pos] || s.pos;
        const posZh = POS_ZH[s.pos] || s.pos;
        const qiTh = QI_TH[s.qi_type] || s.qi_type;
        const qiEn = QI_EN[s.qi_type] || s.qi_type;
        const qiZh = QI_ZH[s.qi_type] || s.qi_type;
        const w = s.weight || 0;
        const cp = s.contest_penalty || 0;
        const final = Math.max(0, w - cp);

        let baseTh = `${posTh} (${s.branch}) ซ่อน ${s.hidden_stem} เป็น${qiTh} น้ำหนัก ${w.toFixed(2)}`;
        let baseEn = `${posEn} (${s.branch}) hides ${s.hidden_stem} as ${qiEn}, weight ${w.toFixed(2)}`;
        let baseZh = `${posZh}${s.branch}藏${s.hidden_stem}·${qiZh}·重 ${w.toFixed(2)}`;

        if (s.contested_by && cp > 0) {
          const cTh = CONTEST_TH[s.contested_by] || s.contested_by;
          const cEn = CONTEST_EN[s.contested_by] || s.contested_by;
          const cZh = CONTEST_ZH[s.contested_by] || s.contested_by;
          baseTh += ` · ${cTh} · เสียพลัง ${cp.toFixed(2)} → เหลือ ${final.toFixed(2)}`;
          baseEn += ` · ${cEn} · loses ${cp.toFixed(2)} → final ${final.toFixed(2)}`;
          baseZh += ` · ${cZh}·折 ${cp.toFixed(2)}→存 ${final.toFixed(2)}`;
        }

        sources_th.push(baseTh);
        sources_en.push(baseEn);
        sources_zh.push(baseZh);
      });
    }

    /* บทสรุป */
    const elTh = EL_TH[el], elEn = EL_EN[el], elZh = EL_ZH[el];
    let summaryTh: string, summaryEn: string, summaryZh: string;

    if (label === 'no_root' || sources.length === 0) {
      summaryTh = `${elTh} ไม่มีราก · ไม่อยู่ในผัง หรือถูกล้างหมด`;
      summaryEn = `${elEn} has no root · absent or fully nullified`;
      summaryZh = `${elZh}無根·缺位或被剋盡`;
    } else if (label === 'token_root') {
      summaryTh = `${elTh} มีดอก · ไม่มีรากจริง · ใช้พลังไม่ได้`;
      summaryEn = `${elEn} appears but rootless · flower without root`;
      summaryZh = `${elZh}見而無根·虛浮無用`;
    } else if (label === 'partial_root') {
      const contested = sources.filter(s => s.contested_by && (s.contest_penalty || 0) > 0).length;
      if (contested > 0) {
        summaryTh = `${elTh} มีราก · แต่ถูกชน/โทษ · พลังลดครึ่ง`;
        summaryEn = `${elEn} rooted but contested · half power`;
        summaryZh = `${elZh}有根但被剋·力減半`;
      } else {
        summaryTh = `${elTh} มีรากบางส่วน · พอใช้ได้ระดับกลาง`;
        summaryEn = `${elEn} partially rooted · medium strength`;
        summaryZh = `${elZh}半根·力中`;
      }
    } else if (label === 'rooted') {
      summaryTh = `${elTh} มีรากแน่น · ใช้พลังได้เต็มที่`;
      summaryEn = `${elEn} firmly rooted · full power`;
      summaryZh = `${elZh}有根·力全`;
    } else {
      summaryTh = `${elTh} รากแกร่งหลายชั้น · ครองดวง`;
      summaryEn = `${elEn} multi-layered strong root · dominates`;
      summaryZh = `${elZh}多層強根·主局`;
    }

    if (isDm) {
      summaryTh = `(ตัวเรา) ${summaryTh}`;
      summaryEn = `(Self) ${summaryEn}`;
      summaryZh = `(本身) ${summaryZh}`;
    }

    return {
      element: el,
      element_th: elTh,
      element_en: elEn,
      element_zh: elZh,
      pct,
      label,
      label_th: LABEL_TH[label] || label,
      label_en: LABEL_EN[label] || label,
      label_zh: LABEL_ZH[label] || label,
      is_dm: isDm,
      summary_th: summaryTh,
      summary_en: summaryEn,
      summary_zh: summaryZh,
      sources_th, sources_en, sources_zh,
    };
  });
}
