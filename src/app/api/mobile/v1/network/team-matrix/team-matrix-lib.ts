// helpers ล้วน (pure) ของเส้น "ตารางความสัมพันธ์ในทีม" — แยกไฟล์เพื่อเทสได้โดยไม่แตะ DB/HTTP
// ใช้โดย route.ts ข้างกัน + scripts/test-network-team-matrix.mts
// ⚠️ ห้าม import DB/next/fetch ในไฟล์นี้ — ต้อง pure เท่านั้น
//
// ── ที่มาของคะแนน (ห้ามเขียนสูตรใหม่ที่นี่) ─────────────────────────────────
// 1. คะแนนคู่ทุกตัวมาจาก computePairReactionV2 (src/lib/scoring/pair-reaction-v2.ts) ตัวเดียวกับ
//    ที่ /api/network/score + /api/mobile/v1/network ใช้อยู่ — ไฟล์นี้ไม่คิดคะแนนเองแม้แต่ค่าเดียว
//    engine ตัวนี้เป็นฟังก์ชันบริสุทธิ์ที่รับ "คนสองคนอะไรก็ได้" ไม่ผูกกับเจ้าของบัญชี
//    จึงใช้อ่านคู่ "เขากับเขา" ได้ตรง ๆ โดยไม่ต้องสลับ self แล้วยิงซ้ำ N รอบ
// 2. 用神/病/藥 ของแต่ละคนมาจาก wrapper-7 ผ่าน buildNetworkScorePayload (ทำที่ route ครั้งเดียวต่อคน)
//    ไฟล์นี้รับผลที่ synthesize เสร็จแล้วเข้ามา — ไม่เรียก wrapper เอง
// 3. เกณฑ์ "สองทิศไม่เท่ากัน" ใช้เลข 24 ตัวเดียวกับที่ engine ใช้เอง (pair-reaction-v2.ts buildContexts/cautions)
//    ไม่ได้ตั้งเกณฑ์ใหม่
//
// ⚠️ ความหมายของเส้นนี้ (ห้ามเขียนคำโฆษณาเกินจริง · ตรวจแล้วด้วยการยิงจริง):
//    computePairReactionV2 รับพารามิเตอร์ date แต่ "ไม่อ่านค่า date เลย" (pair-reaction-v2.ts:733)
//    ยิงคู่เดิม 5 วันต่างกันได้ JSON แฮชเดียวกันเป๊ะ (e9475786a8447dc0)
//    → ค่าที่ได้จากไฟล์นี้คือ "ปฏิกิริยาพื้นดวง" ที่คงที่ ไม่ใช่ค่าของวันนี้/วันไหน
//    ถ้าต้องการรายวันต้องไปทางเส้น /network/bestday (computeUserDayScore) เท่านั้น

import { computePairReactionV2, type PairReactionUseful } from "@/lib/scoring/pair-reaction-v2";
import type { Pillars } from "@/lib/scoring/pair-base";

/** เพดานแข็งของระบบ — เพดานจริงต่อผู้ใช้มาจากแพ็กเกจ (team_people · แพ็กสูงสุด 12 = 66 คู่) */
export const TEAM_MATRIX_MAX_PEOPLE = 12;
/** cache ต่อชุดสมาชิก 6 ชม. (เท่ากับ bestday) · ค่าไม่แปรตามวันอยู่แล้ว จึงไม่ผูก key กับวัน */
export const TEAM_MATRIX_TTL_MS = 6 * 60 * 60 * 1000;

/** เกณฑ์ของ engine เอง: ห่างกัน ≥24 = สองทิศไม่เท่ากันจริง (pair-reaction-v2 buildContexts) */
export const DIRECTION_GAP_NOTICE = 24;

/** ไม่รู้เวลาเกิด = ข้อมูลไม่ครบ ต้องลดความมั่นใจของ "คู่นั้น" (เท่ากับที่ engine หักตอน useful_missing) */
export const HOUR_UNKNOWN_CONFIDENCE_PENALTY = 0.08;
/** พื้นความมั่นใจของเส้นนี้ · ต่ำกว่าพื้นของ engine (0.55) ได้ เพราะข้อมูลดวงไม่ครบจริง */
export const CONFIDENCE_FLOOR = 0.4;
/** ธงเดียวกับที่ /api/network/sifu ใช้บอกซินแสว่าดวงนี้ไม่มีเสายาม */
export const HOUR_UNKNOWN_FLAG = "3P_NO_HOUR";

/* ── คำกำกับที่มาของคะแนน (แอพเอาไปแสดงตรง ๆ · ห้ามแต่งให้เกินจริง) ── */
export const TEAM_MATRIX_BASIS = {
  engine: "computePairReactionV2 (pair-reaction-v2)",
  /** ⚠️ ข้อนี้คือหัวใจ: ค่าไม่เปลี่ยนตามวัน ห้ามพาดหัวว่า "ของวันนี้" */
  time_scope: "static",
  measures: {
    th: "ปฏิกิริยาพื้นดวงระหว่างสมาชิกสองคน (ชั้นความสัมพันธ์ที่คงที่)",
    en: "The standing chart-to-chart reaction between two members",
    zh: "兩位成員命局之間的基礎反應（固定不隨日變）",
  },
  not_measures: {
    th: "ไม่ใช่คะแนนของวันใดวันหนึ่ง — ค่านี้ไม่เปลี่ยนตามวัน ถ้าต้องการรายวันให้ใช้เส้นหาวันนัด",
    en: "Not a per-day score — this layer never changes by date; use the best-day endpoint for daily",
    zh: "非某一日之分數——此層每日固定；需逐日請改用擇日介面",
  },
  method: {
    th: "อ่านทีละคู่ด้วย engine ปฏิกิริยาคู่ตัวเดียวกับหน้าเครือข่าย แล้วเก็บทั้งสองทิศแยกกัน",
    en: "Each pair is read by the same pair-reaction engine as the network page, keeping both directions",
    zh: "以與關係網相同之雙人反應引擎逐對計算，並分別保留兩個方向",
  },
  usage_limits: {
    th: "ใช้เพื่อวางจังหวะการทำงานร่วมกันเท่านั้น ไม่ใช่การจัดอันดับคน และห้ามใช้ตัดสินการจ้าง เลิกจ้าง เลื่อนขั้น หรือประเมินผลงาน",
    en: "For coordination only — not a ranking of people, and not for hiring, firing, promotion, or performance decisions",
    zh: "僅供協作安排參考——非人員排名，不得用於聘用、解僱、升遷或考核決定",
  },
} as const;

/**
 * คำถามที่เส้นนี้ตอบได้ — เจ้านายเคาะถ้อยคำ 24 ก.ค. 2569
 *
 * เดิมโจทย์ตั้งไว้ว่า "ใครควรเป็นหัวหน้า / ใครไม่ควรอยู่ห้องเดียวกัน / คนนี้ลาออกทีมพังตรงไหน"
 * สามข้อนั้นพูดถึง **ตัวบุคคล** ซึ่งชนกฎกันคดีของเราเอง (ห้ามจัดอันดับคน ห้ามแตะการจ้างงาน)
 * จึงเปลี่ยนมุมให้พูดถึง **คู่และวิธีทำงานร่วมกัน** แทน — ได้ประโยชน์เท่าเดิม แต่ไม่ตัดสินตัวคน
 *
 * แอพต้องใช้ถ้อยคำจากที่นี่เท่านั้น ห้ามแต่งหัวข้อเอง (เพี้ยนกลับไปโทนประเมินคนเมื่อไรคือความเสี่ยง)
 */
export const TEAM_MATRIX_QUESTIONS = [
  {
    key: "pair_up",
    /** จับคู่ทำงาน — พูดถึงคู่ตรงๆ ปลอดภัยอยู่แล้ว */
    th: "คู่ไหนจับทำงานด้วยกันแล้วไปได้ลื่น",
    en: "Which pairs work smoothly together",
    zh: "哪些搭配協作最順",
  },
  {
    key: "who_leads_the_talk",
    /** แทน "ใครควรเป็นหัวหน้า" — ถามว่าในคู่นี้ควรให้ใครนำการคุย ไม่ใช่ใครเหนือกว่าใคร */
    th: "คู่นี้ควรให้ใครนำการคุย",
    en: "In this pair, who should lead the conversation",
    zh: "這一對由誰主導溝通較合適",
  },
  {
    key: "needs_a_third",
    /** แทน "ใครไม่ควรอยู่ห้องเดียวกัน" — ตรงกับหลัก 通關 ในตำรา (หาตัวกลางมาเชื่อม ไม่ใช่ตัดคนทิ้ง) */
    th: "คู่นี้ควรมีคนที่สามช่วยกลาง",
    en: "This pair works better with a third person bridging",
    zh: "這一對宜有第三人居中通關",
  },
  {
    key: "load_shifts",
    /** แทน "คนนี้ลาออกทีมพังตรงไหน" — พูดถึงงานที่ต้องหาคนรับช่วง ไม่ใช่ความสำคัญของตัวคน */
    th: "ถ้าคนหนึ่งไม่อยู่ ต้องหาคนรับช่วงตรงไหน",
    en: "If one member is away, which links need covering",
    zh: "若有人不在，哪些銜接需要接手",
  },
] as const;

/* ── ชนิดข้อมูล ── */

export type TeamMatrixPerson = {
  id: string;
  pillars: Pillars;
  /** false = ไม่รู้เวลาเกิด (ดวง 3 เสา) → คู่ที่มีคนนี้ต้องถูกลดความมั่นใจ + ติดธง */
  hourKnown: boolean;
  /** 用神/病/藥 ที่ synthesize มาแล้วครั้งเดียวต่อคน (null = ไม่มี → engine จะติด flag useful_missing เอง) */
  useful: PairReactionUseful | null;
};

export type TeamMatrixReason = {
  kind: string;
  tag: string;
  reason: string;
  axis: string;
  score: number;
};

export type TeamMatrixPair = {
  /** id ทั้งสองฝั่ง (a = คนที่มาก่อนในรายชื่อที่ส่งมา · ไม่ได้แปลว่าใครสำคัญกว่า) */
  a: string;
  b: string;
  /** คะแนนรวมสองทิศตาม convention ของ engine เอง (directional.mutual) */
  score: number;
  /** ชุดคะแนนตามกรอบเวลาของ engine (day/week/month/year/luck/overall) — คิดจากทิศ a→b */
  scores: Record<"day" | "week" | "month" | "year" | "luck" | "overall", number>;
  label: { th: string; en: string; zh: string };
  /** ทิศทางไม่สมมาตร: a รู้สึกกับ b ไม่เท่ากับ b รู้สึกกับ a */
  direction: {
    a_to_b: number;
    b_to_a: number;
    gap: number;
    asymmetric: boolean;
    /** ฝั่งที่ได้รับแรงหนุนมากกว่า (ค่าของ engine ล้วน) */
    stronger: "a_to_b" | "b_to_a" | "even";
  };
  tags: string[];
  flags: string[];
  contexts: { work: number; love: number; family: number; team: number };
  /** เหตุผลย่อ — ข้อความจาก engine ล้วน ไม่มีคำวินิจฉัยที่เขียนขึ้นเอง */
  summary: {
    primary: string;
    primary_i18n?: { th: string; en: string; zh: string };
    context: string[];
    cautions: string[];
    disclaimer: string;
  };
  reasons: { a_to_b: TeamMatrixReason[]; b_to_a: TeamMatrixReason[] };
  confidence: {
    value: number;
    engine: number;
    penalty: number;
    notes: string[];
  };
  /** ธงคุณภาพข้อมูลของ "เรา" (แยกจาก flags ของ engine เสมอ ห้ามปน) */
  data_flags: string[];
  /** id ของคนในคู่นี้ที่ไม่รู้เวลาเกิด */
  hour_unknown: string[];
};

export type TeamMatrixResult = {
  pairs: TeamMatrixPair[];
  coverage: {
    requested: number;
    scored_people: number;
    pairs: number;
    expected_pairs: number;
    complete: boolean;
    pairs_with_missing_hour: number;
  };
};

/** จำนวนคู่ที่ควรได้จากคน n คน = n(n−1)/2 */
export function expectedPairCount(n: number): number {
  return n < 2 ? 0 : (n * (n - 1)) / 2;
}

function topReasons(events: unknown, max = 3): TeamMatrixReason[] {
  if (!Array.isArray(events)) return [];
  return [...events]
    .filter((e) => e && typeof e === "object")
    .sort((x, y) => Math.abs(Number((y as { score?: number }).score) || 0) - Math.abs(Number((x as { score?: number }).score) || 0))
    .slice(0, max)
    .map((e) => {
      const row = e as { kind?: unknown; tag?: unknown; reason?: unknown; axis?: unknown; score?: unknown };
      return {
        kind: String(row.kind || ""),
        tag: String(row.tag || ""),
        reason: String(row.reason || ""),
        axis: String(row.axis || ""),
        score: Number(row.score) || 0,
      };
    });
}

/**
 * ความมั่นใจของคู่: เริ่มจากค่าของ engine แล้วหักตามจำนวนคนที่ "ไม่รู้เวลาเกิด" ในคู่นั้น
 * (เจ้านายสั่ง 24 ก.ค.: ห้ามเสิร์ฟคู่ที่ข้อมูลไม่ครบเหมือนคู่ที่ครบ)
 * ชั้นนี้เป็นชั้นคุณภาพข้อมูลของเรา ไม่ใช่สูตรของ engine — จึงรายงาน engine/penalty แยกให้เห็น
 */
export function pairConfidence(engineConfidence: number, hourUnknownCount: number) {
  const engine = Number.isFinite(engineConfidence) ? engineConfidence : 0;
  const penalty = Math.max(0, hourUnknownCount) * HOUR_UNKNOWN_CONFIDENCE_PENALTY;
  const value = Math.max(CONFIDENCE_FLOOR, Math.round((engine - penalty) * 100) / 100);
  const notes: string[] = [];
  if (hourUnknownCount === 1) notes.push("มีคนหนึ่งในคู่นี้ไม่รู้เวลาเกิด (ดวง 3 เสา) — อ่านได้ตื้นกว่าคู่ที่ข้อมูลครบ");
  if (hourUnknownCount >= 2) notes.push("ทั้งสองคนไม่รู้เวลาเกิด (ดวง 3 เสา) — อ่านได้ตื้นกว่าคู่ที่ข้อมูลครบ");
  return { value, engine: Math.round(engine * 100) / 100, penalty: Math.round(penalty * 100) / 100, notes };
}

/** คู่หนึ่งคู่ — เรียก engine ตรง ๆ ครั้งเดียว แล้วห่อผลให้แอพอ่านง่าย */
export function buildTeamPair(a: TeamMatrixPerson, b: TeamMatrixPerson, engineDate?: string): TeamMatrixPair {
  const v2 = computePairReactionV2({
    a: { id: a.id, ...a.pillars, useful: a.useful },
    b: { id: b.id, ...b.pillars, useful: b.useful },
    // ⚠️ engine ไม่อ่านค่านี้ (ตรวจแล้ว) — ส่งได้แต่ห้ามคาดหวังว่าผลจะเปลี่ยนตามวัน
    date: engineDate,
  });

  const atob = v2.directional.atob.score;
  const btoa = v2.directional.btoa.score;
  const gap = Math.abs(atob - btoa);
  const hourUnknown = [a.hourKnown ? null : a.id, b.hourKnown ? null : b.id].filter(Boolean) as string[];

  return {
    a: a.id,
    b: b.id,
    score: v2.directional.mutual,
    scores: v2.scores,
    label: v2.label,
    direction: {
      a_to_b: atob,
      b_to_a: btoa,
      gap,
      asymmetric: gap >= DIRECTION_GAP_NOTICE,
      stronger: atob === btoa ? "even" : atob > btoa ? "a_to_b" : "b_to_a",
    },
    tags: v2.tags,
    flags: v2.flags,
    contexts: v2.contexts,
    summary: {
      primary: v2.guidance.primary,
      primary_i18n: v2.guidance.primary_i18n,
      context: v2.guidance.context,
      cautions: v2.guidance.cautions,
      disclaimer: v2.guidance.disclaimer,
    },
    reasons: {
      a_to_b: topReasons(v2.directional.atob.breakdown.events),
      b_to_a: topReasons(v2.directional.btoa.breakdown.events),
    },
    confidence: pairConfidence(v2.guidance.confidence, hourUnknown.length),
    data_flags: hourUnknown.length ? [HOUR_UNKNOWN_FLAG] : [],
    hour_unknown: hourUnknown,
  };
}

/**
 * ตารางทั้งทีม: วนคู่ N(N−1)/2 ตามลำดับที่ส่งมา
 * ⚠️ ห้ามเรียงคู่ตามคะแนน — เรียงเมื่อไหร่ = กลายเป็นการจัดอันดับคน (กฎกันคดี เจ้านายย้ำ)
 * @param engineDate มีไว้ให้เทสพิสูจน์ว่า "ไม่มีผล" เท่านั้น · route จริงไม่ส่งค่านี้
 */
export function buildTeamMatrix(people: TeamMatrixPerson[], engineDate?: string): TeamMatrixResult {
  const pairs: TeamMatrixPair[] = [];
  for (let i = 0; i < people.length; i += 1) {
    for (let j = i + 1; j < people.length; j += 1) {
      pairs.push(buildTeamPair(people[i], people[j], engineDate));
    }
  }
  const expected = expectedPairCount(people.length);
  return {
    pairs,
    coverage: {
      requested: people.length,
      scored_people: people.length,
      pairs: pairs.length,
      expected_pairs: expected,
      complete: pairs.length === expected,
      pairs_with_missing_hour: pairs.filter((p) => p.hour_unknown.length > 0).length,
    },
  };
}

/** key cache ต่อ "ชุดสมาชิก" · ผูกกับเวลาที่ดวงถูกแก้ล่าสุด เพื่อให้แก้ดวงแล้วค่าเปลี่ยนตาม
 *  ไม่ผูกกับวัน เพราะค่าของ engine ไม่แปรตามวันอยู่แล้ว (ผูกวัน = หลอกตัวเองว่ามีของใหม่ทุกวัน) */
export function teamMatrixCacheKey(profileIds: string[], profilesStamp: string): string {
  return `${[...profileIds].sort().join(",")}|${profilesStamp}`;
}
