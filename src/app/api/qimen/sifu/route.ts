/**
 * POST /api/qimen/sifu — AI sifu สำหรับฉีเหมิน · ใช้ผัง 9 วัง + ดวงผู้ใช้
 *
 * รับ: { message, history, lang, topic, payload: { qimen, user_yongshen_v2 } }
 * 15 พ.ค. 2026 · standalone จาก /api/sifu (LOCKED)
 */
import { NextResponse } from "next/server";
import { spawn } from "child_process";
import { readFileSync, statSync } from "fs";
import { join } from "path";
import { loadPromptMd } from "@/lib/prompt-md";
import { getSession } from "@/lib/auth";
import { logResearchAiMessageSafe } from "@/lib/research-log";

/* 25 พ.ค. · persona ย้ายไป prompts/qimen-sifu.md (แก้ผ่าน /admin/sifu-prompts) · {{BODY}}=dynamic · fallback กันพัง */
const QIMEN_TPL_FALLBACK = `คุณคือซินแสฉีเหมินตุ้นเจี่ย · ตำรา 煙波釣叟賦·奇門遁甲統宗\n{{BODY}}\nตอบสั้นกระชับ · เน้นตำรา · ใช้ผังจริง + ดวงผู้ใช้ + ผลค้นหาผสมกัน · เลี่ยงคำว่าโชค/ฟลุค:`;

/* 5 มิ.ย. · source-governed packet สำหรับ AI Sifu
 * ห้ามยัด RV1/ตำราทั้งเล่มเข้าพร้อมต์: route นี้คัดเฉพาะ snippet ที่มี line trace ตาม intent
 * และให้ผัง engine/payload เป็น source of truth ก่อนตำราเสมอ */
const QMDJ_DIR = process.env.QIMEN_DOCS_DIR || "/var/www/hourkey/docs/Qimendunjia คัมภีร์";
const MAX_SOURCE_PACKET_CHARS = 12_000;

type QimenSnippetSpec = {
  id: string;
  title: string;
  file: string;
  start: number;
  end: number;
  maxChars: number;
  tags: string[];
};
type QimenSnippet = QimenSnippetSpec & { text: string };
type QimenSourcePacket = { text: string; version: string; trace: string[] };

const QMDJ_SNIPPETS: QimenSnippetSpec[] = [
  {
    id: "core-method",
    title: "ภาพรวม ChaiBu/ชั้นอ่านผัง",
    file: "Qi Men Dun Jia (奇門遁甲) Interpretation Reference.md",
    start: 5,
    end: 19,
    maxChars: 2400,
    tags: ["core", "casting", "score", "caveat"],
  },
  {
    id: "casting-chaibu",
    title: "กฎตั้งผัง拆補",
    file: "Qi Men Dun Jia (奇門遁甲) Interpretation Reference.md",
    start: 50,
    end: 70,
    maxChars: 1600,
    tags: ["core", "casting"],
  },
  {
    id: "useful-god-router",
    title: "เลือก用神ตามประเภทคำถาม",
    file: "Qi Men Dun Jia (奇門遁甲) Interpretation Reference.md",
    start: 445,
    end: 475,
    maxChars: 2600,
    tags: ["core", "direction", "intent", "trading", "question"],
  },
  {
    id: "formations-good",
    title: "吉格/รูปแบบดีสำคัญ",
    file: "Qi Men Dun Jia (奇門遁甲) Interpretation Reference.md",
    start: 520,
    end: 545,
    maxChars: 2200,
    tags: ["formation", "action", "timing"],
  },
  {
    id: "formations-risk",
    title: "凶格/ข้อหักคะแนนสำคัญ",
    file: "Qi Men Dun Jia (奇門遁甲) Interpretation Reference.md",
    start: 546,
    end: 575,
    maxChars: 2600,
    tags: ["formation", "risk", "score", "caveat"],
  },
  {
    id: "four-harms",
    title: "空亡/驛馬/入墓/擊刑/旺衰",
    file: "Qi Men Dun Jia (奇門遁甲) Interpretation Reference.md",
    start: 578,
    end: 655,
    maxChars: 3200,
    tags: ["risk", "direction", "timing", "score"],
  },
  {
    id: "workflow-scoring",
    title: "ลำดับอ่านผังและ heuristic scoring",
    file: "Qi Men Dun Jia (奇門遁甲) Interpretation Reference.md",
    start: 659,
    end: 713,
    maxChars: 2600,
    tags: ["core", "score", "direction", "action", "timing"],
  },
  {
    id: "source-caveats",
    title: "ข้อควรระวังเรื่องต่างสำนัก/คะแนน",
    file: "Qi Men Dun Jia (奇門遁甲) Interpretation Reference.md",
    start: 800,
    end: 812,
    maxChars: 1800,
    tags: ["caveat", "score", "trading"],
  },
  {
    id: "activity-principles",
    title: "หลักกิจกรรมและมาตราส่วนคะแนน",
    file: "คู่มืออ้างอิง — ฤกษ์ยามในวิชา Qi Men Dun Jia (奇門遁甲) ตามประเภทกิจกรรม สำหรับ datepick .md",
    start: 23,
    end: 46,
    maxChars: 1800,
    tags: ["activity", "action", "timing", "score", "caveat"],
  },
  {
    id: "activity-matrix",
    title: "ตารางกิจกรรม 8 ประเภท",
    file: "คู่มืออ้างอิง — ฤกษ์ยามในวิชา Qi Men Dun Jia (奇門遁甲) ตามประเภทกิจกรรม สำหรับ datepick .md",
    start: 116,
    end: 198,
    maxChars: 3600,
    tags: ["activity", "action", "timing", "search_advice"],
  },
  {
    id: "activity-ui-caveat",
    title: "คำแนะนำ UX และ caveat คะแนนกิจกรรม",
    file: "คู่มืออ้างอิง — ฤกษ์ยามในวิชา Qi Men Dun Jia (奇門遁甲) ตามประเภทกิจกรรม สำหรับ datepick .md",
    start: 428,
    end: 458,
    maxChars: 2400,
    tags: ["activity", "caveat", "score"],
  },
  {
    id: "ymd-method",
    title: "ฉีเหมินปี/เดือน/วัน: default lineage",
    file: "ฉีเหมินนที่ขอ 6ข้อ.md",
    start: 3,
    end: 7,
    maxChars: 1200,
    tags: ["yearmonthday", "date", "day", "month", "year"],
  },
  {
    id: "ymd-caveats",
    title: "ข้อขัดแย้งปี/เดือน/วัน",
    file: "ฉีเหมินนที่ขอ 6ข้อ.md",
    start: 222,
    end: 230,
    maxChars: 1700,
    tags: ["yearmonthday", "date", "day", "month", "year", "caveat"],
  },
  {
    id: "rv1-living-rules",
    title: "統宗凡例: อ่านตามสถานการณ์ ไม่ใช่กฎตายตัว",
    file: "奇門遁甲統宗 (ฉีเหมินตุนเจี่ย ถ่งจง)RV1.txt",
    start: 207,
    end: 248,
    maxChars: 2000,
    tags: ["classic", "core", "caveat"],
  },
  {
    id: "rv1-context-rules",
    title: "統宗: ต้องดู旺衰/งานที่ถาม/สำนักประกอบ",
    file: "奇門遁甲統宗 (ฉีเหมินตุนเจี่ย ถ่งจง)RV1.txt",
    start: 252,
    end: 317,
    maxChars: 2400,
    tags: ["classic", "caveat", "formation"],
  },
  {
    id: "bazi-overlay-guard",
    title: "BaZi overlay ต้องแยกจากคำตัดสินฉีเหมิน",
    file: "ResolutionMasterกฎการแก้ขัดรวมตัวของพลังในผัง.md",
    start: 3,
    end: 6,
    maxChars: 800,
    tags: ["bazi", "personal"],
  },
];

let _qimenIndex: { snippets: QimenSnippet[]; sig: string; version: string } | null = null;

function qmdjSignature(): string {
  const files = Array.from(new Set(QMDJ_SNIPPETS.map(s => s.file)));
  const parts = files.map(f => {
    try {
      const st = statSync(join(/* turbopackIgnore: true */ QMDJ_DIR, f));
      return `${f}:${Math.round(st.mtimeMs)}:${st.size}`;
    } catch {
      return `${f}:missing`;
    }
  });
  return parts.join("|");
}

function readDocLines(spec: QimenSnippetSpec): string {
  const raw = readFileSync(join(/* turbopackIgnore: true */ QMDJ_DIR, spec.file), "utf8");
  return raw.split(/\r?\n/).slice(spec.start - 1, spec.end).join("\n").trim();
}

function loadQimenSourceIndex(): { snippets: QimenSnippet[]; version: string } {
  const sig = qmdjSignature();
  if (_qimenIndex && _qimenIndex.sig === sig) return _qimenIndex;

  const snippets: QimenSnippet[] = [];
  for (const spec of QMDJ_SNIPPETS) {
    try {
      snippets.push({ ...spec, text: clip(readDocLines(spec), spec.maxChars) });
    } catch {
      /* source บางไฟล์หาย/อ่านไม่ได้ = ข้าม snippet นั้น แต่ไม่ล้ม request */
    }
  }
  _qimenIndex = { snippets, sig, version: `qmdj-source-packet-${snippets.length}` };
  return _qimenIndex;
}

function wantAny(text: string, words: string[]): boolean {
  return words.some(w => text.includes(w));
}

function selectQimenSourceIds(opts: { message: string; topic?: string; payload: any }): Set<string> {
  const text = `${opts.message || ""} ${opts.topic || ""} ${opts.payload?.activity || ""}`.toLowerCase();
  const ids = new Set<string>(["core-method", "workflow-scoring", "source-caveats", "rv1-living-rules"]);

  if (opts.payload?.qimen) ids.add("casting-chaibu");
  if (opts.payload?.user_yongshen_v2) ids.add("bazi-overlay-guard");
  if (opts.payload?.search_results?.length || wantAny(text, ["ฤกษ์", "เวลา", "timing", "action", "search_advice", "ทำอะไร", "เริ่ม", "เซ็น", "เดินทาง", "ลงทุน", "สุขภาพ", "ความรัก", "งาน"])) {
    ids.add("activity-principles");
    ids.add("activity-matrix");
    ids.add("activity-ui-caveat");
  }
  if (wantAny(text, ["ทิศ", "direction", "palace", "宮", "用神", "หาเงิน", "งาน", "คู่", "เดินทาง", "สุขภาพ", "คดี", "ของหาย"])) {
    ids.add("useful-god-router");
    ids.add("four-harms");
  }
  if (wantAny(text, ["格", "formation", "รูปแบบ", "青龍", "飛鳥", "五不遇", "空亡", "驛馬", "入墓", "擊刑", "門迫", "ช่องว่าง", "ม้า", "ปะทะ", "สุสาน"])) {
    ids.add("formations-good");
    ids.add("formations-risk");
    ids.add("four-harms");
    ids.add("rv1-context-rules");
  }
  if (wantAny(text, ["ปี", "เดือน", "วัน", "日家", "月家", "年家", "year", "month", "day"])) {
    ids.add("ymd-method");
    ids.add("ymd-caveats");
  }
  if (wantAny(text, ["คะแนน", "score", "scoring", "เท่าไร", "ดีไหม", "ลงทุน", "trading", "หุ้น", "forex"])) {
    ids.add("activity-ui-caveat");
    ids.add("formations-risk");
  }
  return ids;
}

function loadQimenKnowledge(opts: { message: string; topic?: string; payload: any }): QimenSourcePacket {
  const idx = loadQimenSourceIndex();
  const ids = selectQimenSourceIds(opts);
  const selected = idx.snippets.filter(s => ids.has(s.id));
  const parts: string[] = [];
  const trace: string[] = [];
  let used = 0;

  for (const s of selected) {
    const part = `### [${s.id}] ${s.title}\nSource: ${s.file}:${s.start}-${s.end}\n${s.text}`;
    if (used && used + part.length > MAX_SOURCE_PACKET_CHARS) continue;
    parts.push(part);
    trace.push(`${s.id}=${s.file}:${s.start}-${s.end}`);
    used += part.length;
  }

  return {
    text: parts.join("\n\n"),
    version: idx.version,
    trace,
  };
}

const CHILD_USER = "jarvis";
/* 1 มิ.ย. · 60→180 วิ · qimen เรียก Claude แบบ blocking กันชน timeout */
const TIMEOUT_MS = 180_000;

/* cap input ผู้ใช้และ search results · ส่วนตำราใช้ source packet สั้นด้านบน */
const MAX_MSG_CHARS = 2_000;
const MAX_HIST_ITEM_CHARS = 1_000;
const MAX_SEARCH_CHARS = 4_000;
const clip = (s: string, n: number): string => (s.length > n ? s.slice(0, n) + "…" : s);

/* 1 มิ.ย. · พ่อ flag #3 · in-flight limiter รอบ runClaudeCli (route นี้ spawn subprocess Claude หนัก)
 * spendHours=เศรษฐกิจ ไม่ใช่ขอบ execution · กัน funded user fan-out หลาย process พร้อมกัน (กฎ scale 5000 user)
 * cap ระดับ process (Next.js node เดียว) · เต็ม → 429 ให้ client ลองใหม่ */
const MAX_INFLIGHT = Number(process.env.QIMEN_SIFU_MAX_INFLIGHT || 6);
let _inflight = 0;

type Msg = { role: "user" | "assistant"; content: string };
type BuiltPrompt = { prompt: string; knowledgeVersion: string; sourceTrace: string[] };

const DIR_LABEL_TH_ZH: Record<string, string> = {
  N: "ทิศเหนือ 北",
  NE: "ทิศตะวันออกเฉียงเหนือ 東北",
  E: "ทิศตะวันออก 東",
  SE: "ทิศตะวันออกเฉียงใต้ 東南",
  S: "ทิศใต้ 南",
  SW: "ทิศตะวันตกเฉียงใต้ 西南",
  W: "ทิศตะวันตก 西",
  NW: "ทิศตะวันตกเฉียงเหนือ 西北",
  C: "กลาง 中",
};
const DOOR_TH: Record<string, string> = {
  XIU_MEN: "ประตูพัก", SHENG_MEN: "ประตูเกิด", KAI_MEN: "ประตูเปิด",
  JING_VIEW_MEN: "ประตูภาพลักษณ์", DU_MEN: "ประตูปิด",
  SHANG_MEN: "ประตูบาดเจ็บ", JING_FEAR_MEN: "ประตูตื่นตกใจ", SI_MEN: "ประตูตาย",
  "休門": "ประตูพัก", "生門": "ประตูเกิด", "開門": "ประตูเปิด", "景門": "ประตูภาพลักษณ์",
  "杜門": "ประตูปิด", "傷門": "ประตูบาดเจ็บ", "驚門": "ประตูตื่นตกใจ", "死門": "ประตูตาย",
};
const STAR_TH: Record<string, string> = {
  TIAN_XIN: "ดาวเทียนซิน", TIAN_FU: "ดาวเทียนฝู่", TIAN_REN: "ดาวเทียนเหริน", TIAN_QIN: "ดาวเทียนฉิน",
  TIAN_CHONG: "ดาวเทียนชง", TIAN_YING: "ดาวเทียนอิง", TIAN_ZHU: "ดาวเทียนจู้",
  TIAN_PENG: "ดาวเทียนเผิง", TIAN_RUI: "ดาวเทียนรุ่ย",
  "天心": "ดาวเทียนซิน", "天輔": "ดาวเทียนฝู่", "天任": "ดาวเทียนเหริน", "天禽": "ดาวเทียนฉิน",
  "天沖": "ดาวเทียนชง", "天英": "ดาวเทียนอิง", "天柱": "ดาวเทียนจู้",
  "天蓬": "ดาวเทียนเผิง", "天芮": "ดาวเทียนรุ่ย",
};
const DEITY_TH: Record<string, string> = {
  ZHI_FU: "เทพจื๋อฟู", TAI_YIN: "เทพไท่อิน", LIU_HE: "เทพลิ่วเหอ", JIU_TIAN: "เทพจิ่วเทียน", JIU_DI: "เทพจิ่วตี้",
  TENG_SHE: "เทพเถิงเสอ", XUAN_WU: "เทพเสวียนอู่", BAI_HU: "เทพไป๋หู่",
  "值符": "เทพจื๋อฟู", "太陰": "เทพไท่อิน", "六合": "เทพลิ่วเหอ", "九天": "เทพจิ่วเทียน", "九地": "เทพจิ่วตี้",
  "螣蛇": "เทพเถิงเสอ", "玄武": "เทพเสวียนอู่", "白虎": "เทพไป๋หู่",
};

function labelThZh(th: unknown, zh: unknown, code: unknown, dict: Record<string, string>): string {
  const codeText = String(code || "");
  const zhText = String(zh || codeText || "—");
  const thText = String(th || dict[codeText] || dict[zhText] || "");
  return thText ? `${thText} ${zhText}` : zhText;
}

function directionLabel(p: any): string {
  if (p.direction_th && p.direction_zh) return `${p.direction_th} ${p.direction_zh}`;
  const code = String(p.direction || "").toUpperCase();
  return DIR_LABEL_TH_ZH[code] || String(p.direction || p.trigram_zh || "ไม่ระบุทิศ");
}

const LANG_INSTR: Record<string, string> = {
  th: "ตอบเป็นภาษาไทยสำหรับคนทั่วไป · ไทยนำจีนรอง · กระชับ · อธิบายศัพท์จีนทุกคำที่ใช้",
  en: "Reply in English · concise · markdown · classical QiMen sources",
  zh: "用简体中文回答 · 简洁 · markdown · 煙波釣叟賦·奇門遁甲統宗",
};

const TOPIC_FOCUS: Record<string, string> = {
  overview:  "ภาพรวมผัง · 局/ดวง/三奇/八門เด่น · 格局สำคัญ",
  direction: "ทิศไหนเหมาะกับ用神ของผู้ใช้ · เพราะอะไร · ทิศที่เลี่ยง",
  action:    "ชั่วยามนี้เหมาะทำอะไร · เริ่ม/รอ/ปิดดีล",
  timing:    "เวลานี้ดี/รอ · ถ้ารอ ควรรอถึงเวลาไหน",
  formation: "格局 (formations) ในผัง · ดี/ระวัง · กระทบยังไง",
  search_advice: "วิเคราะห์ผลค้นหา · แนะนำ top 3 ที่ดีสุดสำหรับผู้ใช้คนนี้ · เหตุผลตำรา · เลี่ยงอันไหน",
};

function fmtQimenCard(q: any): string {
  if (!q) return "(ไม่มีผัง)";
  const chart = q.chart || {};
  const palaces = q.palaces || [];
  const stored = q.stored_formations || [];
  const compound = q.compound_formations || [];
  const fushi = chart.ctext_fushi || null;

  const poleRaw = String(chart.dun_type || chart.ju_pole || "").toLowerCase();
  const pole = poleRaw === "yin" ? "陰" : "陽";
  const ju = chart.ju_number || "?";
  const fushiLine = fushi
    ? `ค่าหัวผังตาม CText: 值符星=${fushi.value_star_zh || chart.chief_star_code}@宮${fushi.value_star_palace_id || chart.zhi_fu_palace_id} · 值使門=${fushi.value_door_zh || chart.zhi_shi_door_code}@宮${fushi.value_door_palace_id || chart.zhi_shi_palace_id} · 旬首=${fushi.xun_leader_zh || chart.xun_hour_zh} · source=${fushi.source || "ctext"}`
    : `ค่าหัวผัง: 值符=${chart.chief_star_code || "-"}@宮${chart.zhi_fu_palace_id || "?"} · 值使=${chart.zhi_shi_door_code || "-"}@宮${chart.zhi_shi_palace_id || "?"}`;

  const palaceLines = palaces.map((p: any) => {
    const door = labelThZh(p.door_name_th, p.door_zh, p.door_code, DOOR_TH);
    const star = labelThZh(p.star_name_th, p.star_zh, p.star_code, STAR_TH);
    const deity = labelThZh(p.deity_name_th, p.deity_zh, p.deity_code, DEITY_TH);
    const flags = [
      p.is_void_any || p.is_void ? "ช่องว่าง 空亡" : "",
      p.is_traveling_horse ? "ม้าเดินทาง 驛馬" : "",
      p.is_ru_mu || p.is_tomb ? "เข้าคลัง/สุสาน 入墓" : "",
      p.is_ji_xing || p.is_punishment ? "ถูกลงโทษ 擊刑" : "",
      p.is_men_po || p.is_door_oppressed ? "ประตูบีบวัง 門迫" : "",
    ].filter(Boolean).join(" · ");
    return `• วัง ${p.palace_id} · ${directionLabel(p)} · ${p.trigram_zh || p.trigram_code || "-"} (${p.element_code || "?"}): ฟ้า ${p.heaven_stem_zh || p.heaven_stem_code || "·"} / ดิน ${p.earth_stem_zh || p.earth_stem_code || "·"} · ${door} · ${star} · ${deity} · คะแนน engine=${p.display_score ?? p.score ?? "ไม่ระบุ"} ${p.display_level || ""}${flags ? ` · flags: ${flags}` : ""}`;
  }).join("\n");

  const stLines = stored.map((f: any) =>
    `  - ${f.name_zh || f.formation_code} (${f.scope}${f.scope_ref ? " " + f.scope_ref : ""}): ${f.note || ""}`
  ).join("\n");
  const cpLines = compound.map((f: any) =>
    `  - ${f.name_zh || f.formation_code} [${f.quality || "?"}] (${f.scope}${f.scope_ref ? " " + f.scope_ref : ""}): ${f.note || ""}`
  ).join("\n");

  return `Engine packet คือ source of truth ถ้า field ขาดให้ตอบว่า "ข้อมูลไม่พอ" ห้ามสร้างค่าเอง
Yuan-Ju: ${pole}${ju}局
時柱: ${chart.pillar_zh || "-"} · 旬首: ${chart.xun_hour_zh || fushi?.xun_leader_zh || "-"} · 遁干: ${chart.dun_gan_zh || "-"} · 八神派別: ${chart.deity_variant || "-"} · chart_source=${chart.source || chart.engine_source || "payload.qimen"}
${fushiLine}
9 Palaces:
${palaceLines}
Stored Formations:
${stLines || "  (none)"}
Compound Formations:
${cpLines || "  (none)"}`;
}

function fmtUserYs(ys: any): string {
  if (!ys) return "(ไม่มีดวงผู้ใช้)";
  return `โครงสร้าง: ${ys.structure_label || "-"} (${ys.engine_type || "-"})
用神: ${(ys.primary_yongshen || []).join("·")} · 喜: ${(ys.xishen || []).join("·")} · 忌: ${(ys.jishen || []).join("·")}
TiaoHou: ${ys.tiaohou_required || "-"} · 病: ${(ys.diseases || []).join(",") || "-"} · 藥: ${(ys.medicine || []).join(",") || "-"}`;
}

function fmtSearchResults(searchResults: any[], activity?: string): string {
  if (!searchResults || !searchResults.length) return "";
  const lines = searchResults.slice(0, 8).map((t: any, i: number) =>
    `${i+1}. ${t.datetime || `${t.date} ${t.time}`} · 宮${t.palace_id}${t.direction} · ${t.door}+${t.star}+${t.deity} · ${t.heaven_stem}/${t.earth_stem} · ${t.ju_pole==='yin'?'陰':'陽'}${t.ju_number}局 · score ${t.score}${t.matches?.length ? ` [${t.matches.slice(0,3).join(', ')}]` : ''}`
  ).join("\n");
  return `\n\nผลค้นหาผัง (top ${searchResults.length}${activity ? ` · กิจกรรม=${activity}` : ''}):\n${lines}`;
}

function buildPrompt(opts: { message: string; history: Msg[]; lang: string; topic?: string; payload: any }): BuiltPrompt {
  const { payload, message, history, lang, topic } = opts;
  const qimen = payload?.qimen;
  const ys = payload?.user_yongshen_v2;
  const searchResults = payload?.search_results;
  const activity = payload?.activity;
  const focus = topic && TOPIC_FOCUS[topic] ? `\nหัวข้อ: ${TOPIC_FOCUS[topic]}` : "";
  const histText = history.length
    ? "\n\nประวัติคำถาม:\n" + history.map(h => `[${h.role}] ${clip(String(h.content || ""), MAX_HIST_ITEM_CHARS)}`).join("\n")
    : "";
  const searchText = clip(fmtSearchResults(searchResults, activity), MAX_SEARCH_CHARS);
  const msgClipped = clip(message, MAX_MSG_CHARS);
  const know = loadQimenKnowledge({ message, topic, payload });
  const sourceTraceText = know.trace.length ? know.trace.map(s => `- ${s}`).join("\n") : "- none";
  const canonBlock = know.text
    ? `\nแหล่งความรู้ฉีเหมินที่อนุญาตให้ใช้ในคำตอบ (excerpt only · source-governed):\n${know.text}\n\nSource trace ที่ใช้ได้:\n${sourceTraceText}\n— จบ source packet —\n`
    : "";
  const answerGuard = `กฎบังคับคำตอบ:
1. อ่านจาก "ผังเวลา (QiMen Chart)" ก่อนเสมอ; source packet มีไว้แปลความหมาย ไม่ใช่สร้างค่าผังใหม่
2. ถ้า field ของผังไม่มี/ไม่พอ ให้บอกว่า "ข้อมูลไม่พอจะตัดสิน" ห้ามแต่งประตู ดาว เทพ ทิศ หรือ格局เอง
3. ตอบไทยนำจีนรอง เช่น ประตูเปิด 開門, ดาวเทียนฝู่ 天輔, เทพลิ่วเหอ 六合, ทิศตะวันออกเฉียงเหนือ 東北
4. คะแนน/ระดับเป็น heuristic ของ Hourkey ให้พูดว่า "คะแนนระบบ" หรือ "น้ำหนักระบบ" ไม่ใช่เลขจากตำราโบราณ
5. ถ้าพูดเรื่องต่างสำนัก เช่น 年/月/日家, 八神, 寄宮, 五不遇時 ให้ใส่ caveat ว่าสายตำราอาจต่างกัน
6. ถ้าใช้ BaZi ให้แยกเป็น "ตัวกรองส่วนบุคคล" ไม่ปนเป็นคำตัดสินฉีเหมินหลัก
7. ท้ายคำตอบสั้นๆ ใส่ "อ้างอิง:" แล้วระบุ source id ที่ใช้ 1-3 ตัวจาก Source trace`;
  const body = `\n${LANG_INSTR[lang] || LANG_INSTR.th}\n${answerGuard}\n${canonBlock}\nผังเวลา (QiMen Chart):\n${fmtQimenCard(qimen)}\n\nดวงเกิดผู้ใช้ (BaZi v2):\n${fmtUserYs(ys)}${searchText}${focus}${histText}\n\nคำถาม: ${msgClipped}\n`;
  return {
    prompt: loadPromptMd("prompts/qimen-sifu.md", QIMEN_TPL_FALLBACK).replace("{{BODY}}", body),
    knowledgeVersion: know.version,
    sourceTrace: know.trace,
  };
}

async function runClaudeCli(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = ["-p", "--output-format", "text", "--dangerously-skip-permissions", "--setting-sources", "user"];
    const c = spawn("sudo", ["-u", CHILD_USER, "-H", "claude", ...args], { cwd: "/var/www/checklist-app", env: process.env });
    let out = "", err = "";
    const timer = setTimeout(() => { try { c.kill("SIGKILL"); } catch {} reject(new Error("timeout")); }, TIMEOUT_MS);
    c.stdout.on("data", (d: Buffer) => out += d.toString());
    c.stderr.on("data", (d: Buffer) => err += d.toString());
    c.on("close", (code: number) => {
      clearTimeout(timer);
      if (code === 0) resolve(out.trim());
      else reject(new Error(`claude exit ${code}: ${err.slice(0, 300)}`));
    });
    c.stdin.write(prompt);
    c.stdin.end();
  });
}

export async function POST(req: Request) {
  /* 1 มิ.ย. · AI ฉีเหมินต้องสมัคร/login ก่อน (เจ้านายสั่ง · defense-in-depth เสริม spendHours) */
  const session = await getSession();
  if (!session) return new Response(JSON.stringify({ error: "not logged in" }), { status: 401, headers: { "Content-Type": "application/json" } });
  try {
    const reqT0 = Date.now();
    const body = await req.json().catch(() => ({}));
    const message: string = (body.message || "").trim();
    const history: Msg[] = Array.isArray(body.history) ? body.history.slice(-6) : [];
    const lang: string = ["th", "en", "zh"].includes(body.lang) ? body.lang : "th";
    const topic: string | undefined = body.topic;
    const payload = body.payload || {};

    if (!message) return NextResponse.json({ error: "message required" }, { status: 400 });

    /* in-flight limiter · กันยิง subprocess Claude พร้อมกันเกิน (เช็คก่อนหัก 時 · เต็ม=429 ไม่หักเครดิต) */
    if (_inflight >= MAX_INFLIGHT) {
      return NextResponse.json({ error: "ระบบกำลังประมวลผลคำถามอื่นอยู่ · กรุณาลองใหม่อีกครั้งใน 1-2 นาที" }, { status: 429 });
    }

    /* 📜 spend 8 時 ก่อนเรียก Claude · 15 พ.ค. */
    const { spendHours } = await import("@/lib/spend-hours");
    const spend = await spendHours(8, "sifu_qimen");
    if (!spend.ok) return NextResponse.json(spend, { status: spend.status });

    const built = buildPrompt({ message, history, lang, topic, payload });
    _inflight++;
    let reply: string;
    try {
      reply = await runClaudeCli(built.prompt);
    } finally {
      _inflight--;
    }
    logResearchAiMessageSafe({
      session,
      req,
      feature: "qimen_sifu",
      mode: "qimen",
      topic,
      lang,
      profileId: payload?.profile_id || payload?.profileId || null,
      question: message,
      answer: reply,
      history,
      requestPayload: {
        topic,
        activity: payload?.activity || null,
        qimen_summary: payload?.qimen?.chart ? {
          pillar_zh: payload.qimen.chart.pillar_zh,
          ju_pole: payload.qimen.chart.ju_pole,
          ju_number: payload.qimen.chart.ju_number,
        } : null,
        search_count: Array.isArray(payload?.search_results) ? payload.search_results.length : 0,
      },
      responseMeta: {
        chars: reply.length,
        qimen_source_version: built.knowledgeVersion,
        qimen_source_trace: built.sourceTrace,
      },
      model: "claude-max-cli",
      spent: spend.spent,
      balanceAfter: spend.balance_after,
      durationMs: Date.now() - reqT0,
    });
    return NextResponse.json({
      reply,
      model: "claude-max-cli",
      balance_after: spend.balance_after,
      spent: spend.spent,
      qimen_source_version: built.knowledgeVersion,
      qimen_source_trace: built.sourceTrace,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
