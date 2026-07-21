/**
 * 六爻納甲 engine (裝卦 deterministic) — 21 ก.ค. 2569
 * ตำรา = คัมภีร์แท้ใน canon-inbox/liuyao: 增刪卜易 (ตาราง八卦各宮全圖 → data/najia64.json · กฎ → data/rules.json)
 * หลักการ (กฎ #9): engine คำนวณ structured ทั้งหมด · ไม่แต่งความหมายเอง — ทุก verdict ผูก quote คัมภีร์ใน rules.json
 * เวลา: ใช้วันไทย tz+7 → กานจือวัน/เดือนผ่าน tyme4ts (pattern เดียวกับ fengshui-luxing — ไม่แตะไฟล์ LOCKED)
 */
import { SolarTime, type SixtyCycle } from "tyme4ts";
import najiaRaw from "./data/najia64.json";
import rulesRaw from "./data/rules.json";

export type NajiaLine = {
  stemBranch: string;
  branch: string;
  element: string;
  liuqin: string;
  shi: boolean;
  ying: boolean;
};
export type NajiaHex = {
  binary: string;
  name_zh: string;
  palace: string;
  palaceElement: string;
  position: number;
  lines: NajiaLine[];
};
type Rules = {
  yongshenByTopic: Array<{ topic_key: string; liuqin: string; quote: string; source?: string }>;
  liushou: { order: string[]; startByDayStem: Record<string, string>; quote?: string };
  wangshuai: Record<string, unknown>;
  xunkong: Record<string, unknown>;
  judgment: Array<{ rule_key: string; effect: string; quote: string }>;
  yingqi: Array<{ rule_key: string; quote: string }>;
};

const NAJIA = new Map<string, NajiaHex>((najiaRaw as NajiaHex[]).map((h) => [h.binary, h]));
const RULES = rulesRaw as Rules;

const STEMS = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"] as const;
const BRANCHES = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"] as const;
const BRANCH_ELEMENT: Record<string, string> = {
  子: "水", 丑: "土", 寅: "木", 卯: "木", 辰: "土", 巳: "火",
  午: "火", 未: "土", 申: "金", 酉: "金", 戌: "土", 亥: "水",
};
/** 六沖 คู่ชน (ห่าง 6) */
function clashes(a: string, b: string): boolean {
  return (BRANCHES.indexOf(a as (typeof BRANCHES)[number]) + 6) % 12 === BRANCHES.indexOf(b as (typeof BRANCHES)[number]);
}
const SHENG: Record<string, string> = { 木: "火", 火: "土", 土: "金", 金: "水", 水: "木" };
const KE: Record<string, string> = { 木: "土", 土: "水", 水: "火", 火: "金", 金: "木" };

/** 旺相休囚死 ของธาตุเส้น เทียบธาตุประจำเดือน (月令) ตามหลัก 同我旺 我生相... ที่คัมภีร์ใช้ */
export function seasonState(lineElement: string, monthElement: string): "旺" | "相" | "休" | "囚" | "死" {
  if (lineElement === monthElement) return "旺";
  if (SHENG[monthElement] === lineElement) return "相"; // 月令生เส้น
  if (SHENG[lineElement] === monthElement) return "休"; // เส้น生月令
  if (KE[lineElement] === monthElement) return "囚"; // เส้น剋月令
  return "死"; // 月令剋เส้น
}

/** 旬空 2 กิ่งของ旬ที่วันอยู่ (จาก甲子=index0: กิ่งที่ขาด = ท้าย旬) */
export function xunKong(daySc: SixtyCycle): [string, string] {
  const idx = daySc.getIndex(); // 0-59
  const xunStart = idx - (idx % 10); // 旬頭
  // กิ่งของลำดับ 58,59 ภายใน旬นี้ (ตำแหน่ง 10,11 นับจาก旬頭)
  const b1 = BRANCHES[(xunStart + 10) % 12];
  const b2 = BRANCHES[(xunStart + 11) % 12];
  return [b1, b2];
}

export type LiuyaoInput = {
  tosses: number[]; // 6 ค่า ล่าง→บน · 6=老陰(動) 7=少陽 8=少陰 9=老陽(動)
  topicKey: string; // เรื่องที่ถาม → 用神 ตาม rules.yongshenByTopic
  dateIso?: string; // YYYY-MM-DD (default วันไทยวันนี้)
};

export type LiuyaoLineView = NajiaLine & {
  index: number; // 1-6 ล่าง→บน
  yang: boolean;
  moving: boolean;
  liushou: string;
  kong: boolean;
  yuePo: boolean;
  seasonState: string;
};

export type LiuyaoResult = {
  ok: true;
  day: { stem: string; branch: string; ganzhi: string };
  month: { branch: string; element: string; ganzhi: string };
  ben: { name_zh: string; palace: string; palaceElement: string; binary: string; lines: LiuyaoLineView[] };
  bian: null | { name_zh: string; palace: string; binary: string; lines: NajiaLine[] };
  movingIndexes: number[];
  yongshen: {
    liuqin: string;
    topicKey: string;
    quote: string;
    lines: number[]; // ตำแหน่งเส้น用神ใน本卦 (ว่าง = 用神ไม่ปรากฏ/伏藏)
    present: boolean;
    state: string | null; // 旺相休囚死 ของเส้น用神หลัก
    kong: boolean;
    yuePo: boolean;
  };
  factors: Array<{ key: string; text_zh: string; quote: string }>; // ปัจจัยที่ engine ตรวจพบ ผูกกฎคัมภีร์
};

export type LiuyaoError = { ok: false; error: "bad_tosses" | "bad_topic" | "hex_not_found" };

function thaiNow(): Date {
  return new Date(Date.now() + 7 * 3600_000);
}

export function castLiuyao(input: LiuyaoInput): LiuyaoResult | LiuyaoError {
  const t = input.tosses;
  if (!Array.isArray(t) || t.length !== 6 || t.some((v) => ![6, 7, 8, 9].includes(v))) {
    return { ok: false, error: "bad_tosses" };
  }
  const topic = RULES.yongshenByTopic.find((y) => y.topic_key === input.topicKey);
  if (!topic) return { ok: false, error: "bad_topic" };

  const binary = t.map((v) => (v === 7 || v === 9 ? "1" : "0")).join("");
  const ben = NAJIA.get(binary);
  if (!ben) return { ok: false, error: "hex_not_found" };
  const movingIndexes = t.map((v, i) => (v === 6 || v === 9 ? i + 1 : 0)).filter(Boolean);

  let bian: NajiaHex | null = null;
  if (movingIndexes.length) {
    const flipped = binary
      .split("")
      .map((c, i) => (movingIndexes.includes(i + 1) ? (c === "1" ? "0" : "1") : c))
      .join("");
    bian = NAJIA.get(flipped) || null;
  }

  // กานจือวัน/เดือน (เที่ยงวันของวันที่ระบุ วันไทย — เลี่ยงรอยต่อ 子時)
  const d = input.dateIso ? new Date(`${input.dateIso}T12:00:00+07:00`) : thaiNow();
  const st = SolarTime.fromYmdHms(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), 12, 0, 0);
  const daySc = st.getSixtyCycleHour().getSixtyCycleDay().getSixtyCycle();
  const monthSc = st.getLunarHour().getEightChar().getMonth();
  const dayStem = daySc.getHeavenStem().getName();
  const dayBranch = daySc.getEarthBranch().getName();
  const monthBranch = monthSc.getEarthBranch().getName();
  const monthElement = BRANCH_ELEMENT[monthBranch];

  // 六獸: เริ่มตามก้านวัน ไล่ขึ้นจากเส้น 1
  const startShou = RULES.liushou.startByDayStem[dayStem];
  const order = RULES.liushou.order;
  const startIdx = Math.max(0, order.indexOf(startShou));
  const [kong1, kong2] = xunKong(daySc);

  const lines: LiuyaoLineView[] = ben.lines.map((ln, i) => ({
    ...ln,
    index: i + 1,
    yang: binary[i] === "1",
    moving: movingIndexes.includes(i + 1),
    liushou: order[(startIdx + i) % 6],
    kong: ln.branch === kong1 || ln.branch === kong2,
    yuePo: clashes(ln.branch, monthBranch),
    seasonState: seasonState(ln.element, monthElement),
  }));

  const yongLines = lines.filter((ln) => ln.liuqin === topic.liuqin);
  // เส้น用神หลัก: ถ้ามีหลายเส้น เอาเส้นที่動ก่อน ไม่งั้นเส้นแรก (ตามธรรมเนียม 用神多現 เลือกเส้นที่มีเหตุ — เฟสนี้ใช้กติกาคงที่ ระบุใน factors)
  const mainYong = yongLines.find((l) => l.moving) || yongLines[0] || null;

  const factors: LiuyaoResult["factors"] = [];
  const q = (rule_key: string): string => RULES.judgment.find((j) => j.rule_key === rule_key)?.quote || "";
  const xk = RULES.xunkong as unknown as { definition_quote?: string };
  const ws = RULES.wangshuai as unknown as { principle_quote?: string };
  if (!mainYong) factors.push({ key: "yongshen_absent", text_zh: "用神不上卦", quote: q("yongshen_absent_use_riyue") });
  if (mainYong?.kong) factors.push({ key: "yongshen_kong", text_zh: "用神旬空", quote: xk.definition_quote || "" });
  if (mainYong?.yuePo) factors.push({ key: "yongshen_yuepo", text_zh: "用神月破", quote: ws.principle_quote || "" });
  for (const mv of lines.filter((l) => l.moving)) {
    if (!mainYong || mv.index === mainYong.index) continue;
    if (SHENG[mv.element] === mainYong.element) {
      factors.push({ key: `moving_sheng_${mv.index}`, text_zh: `動爻${mv.stemBranch}生用神`, quote: q("wuxing_xiangsheng") });
    } else if (KE[mv.element] === mainYong.element) {
      factors.push({ key: `moving_ke_${mv.index}`, text_zh: `動爻${mv.stemBranch}剋用神`, quote: q("wuxing_xiangke") });
    }
  }
  if (mainYong) {
    if (SHENG[BRANCH_ELEMENT[dayBranch]] === mainYong.element) {
      factors.push({ key: "day_sheng_yong", text_zh: "日辰生用神", quote: q("richen_master") });
    } else if (KE[BRANCH_ELEMENT[dayBranch]] === mainYong.element) {
      factors.push({ key: "day_ke_yong", text_zh: "日辰剋用神", quote: q("richen_master") });
    }
    if (yongLines.length > 1) {
      factors.push({ key: "yongshen_duoxian", text_zh: "用神多現", quote: "" });
    }
  }

  return {
    ok: true,
    day: { stem: dayStem, branch: dayBranch, ganzhi: daySc.getName() },
    month: { branch: monthBranch, element: monthElement, ganzhi: monthSc.getName() },
    ben: { name_zh: ben.name_zh, palace: ben.palace, palaceElement: ben.palaceElement, binary, lines },
    bian: bian ? { name_zh: bian.name_zh, palace: bian.palace, binary: bian.binary, lines: bian.lines } : null,
    movingIndexes,
    yongshen: {
      liuqin: topic.liuqin,
      topicKey: topic.topic_key,
      quote: topic.quote,
      lines: yongLines.map((l) => l.index),
      present: !!mainYong,
      state: mainYong?.seasonState ?? null,
      kong: !!mainYong?.kong,
      yuePo: !!mainYong?.yuePo,
    },
    factors,
  };
}
