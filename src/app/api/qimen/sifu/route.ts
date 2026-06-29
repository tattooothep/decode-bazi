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
const QIMEN_TPL_FALLBACK = `คุณคือซินแสฉีเหมินตุ้นเจี่ย · ตำรา 煙波釣叟賦·奇門遁甲統宗\n{{BODY}}\nตอบสั้นกระชับ · อ่านจากผังจริงก่อน แล้วใช้ตำราแปลความหมาย · ใช้ดวงผู้ใช้/ผลค้นหาเป็นตัวประกอบ · เลี่ยงคำว่าโชค/ฟลุค:`;

/* 5 มิ.ย. · source-governed packet สำหรับ AI Sifu
 * ห้ามยัด RV1/ตำราทั้งเล่มเข้าพร้อมต์: route นี้คัดเฉพาะ snippet ที่มี line trace ตาม intent
 * และให้ผังจากระบบคำนวณเป็นหลักก่อนตำราเสมอ */
const QMDJ_DIR = process.env.QIMEN_DOCS_DIR || "/var/www/hourkey/docs/Qimendunjia คัมภีร์";
/* 7 มิ.ย. · ไฟล์ความรู้ไทยนำ (สรุปจากคัมภีร์ + 原文 อ้างอิง) อยู่ใน repo เพื่อ version control
 * ตามกฎ git discipline · spec ที่ repo:true อ่านจากโฟลเดอร์นี้แทน QMDJ_DIR */
const QMDJ_REPO_DIR = join(process.cwd(), "data/library/qmdj");
/* 8 มิ.ย. · ขยายจาก 12k → 26k ให้แกนคัมภีร์ไทยนำ (auth-th 6 ไฟล์/7 แกน) เข้า prompt ครบ
 * (เดิม snippet เก่าเติมจนเต็ม 12k แล้วแกนใหม่ที่ต่อท้าย array โดน drop หมด · ดู priority sort ใน loadQimenKnowledge)
 * 26k เผื่อ worst-case ถามครบทุกแกนพร้อมกัน (core+6แกน~23k+caveats) ไม่ให้ guardrail/แกนตัวท้ายโดน drop */
const MAX_SOURCE_PACKET_CHARS = 26_000;

type QimenSnippetSpec = {
  id: string;
  title: string;
  file: string;
  start: number;
  end: number;
  maxChars: number;
  tags: string[];
  /* true = อ่านจาก QMDJ_REPO_DIR (repo) แทน QMDJ_DIR (/var/www) */
  repo?: boolean;
};
const snippetDir = (spec: QimenSnippetSpec): string => (spec.repo ? QMDJ_REPO_DIR : QMDJ_DIR);
type QimenSnippet = QimenSnippetSpec & { text: string };
type QimenSourceTraceItem = {
  id: string;
  title_th: string;
  source_label_th: string;
  file: string;
  line_range: string;
  reason_th: string;
  tags: string[];
};
type QimenSourcePacket = { text: string; version: string; trace: string[]; traceItems: QimenSourceTraceItem[] };

const QMDJ_SNIPPETS: QimenSnippetSpec[] = [
  {
    id: "core-method",
    title: "ภาพรวมการตั้งผัง拆補และชั้นอ่านผัง",
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
    title: "เลือกตัวอ่านหลัก用神ตามประเภทคำถาม",
    file: "Qi Men Dun Jia (奇門遁甲) Interpretation Reference.md",
    start: 445,
    end: 475,
    maxChars: 2600,
    tags: ["core", "direction", "intent", "trading", "question"],
  },
  {
    id: "formations-good",
    title: "รูปแบบดีสำคัญ 吉格",
    file: "Qi Men Dun Jia (奇門遁甲) Interpretation Reference.md",
    start: 520,
    end: 545,
    maxChars: 2200,
    tags: ["formation", "action", "timing"],
  },
  {
    id: "formations-risk",
    title: "ข้อหักคะแนนสำคัญ 凶格",
    file: "Qi Men Dun Jia (奇門遁甲) Interpretation Reference.md",
    start: 546,
    end: 575,
    maxChars: 2600,
    tags: ["formation", "risk", "score", "caveat"],
  },
  {
    id: "four-harms",
    title: "สัญญาณว่าง ม้า เข้าคลัง ตี刑 空亡/驛馬/入墓/擊刑/旺衰",
    file: "Qi Men Dun Jia (奇門遁甲) Interpretation Reference.md",
    start: 578,
    end: 655,
    maxChars: 3200,
    tags: ["risk", "direction", "timing", "score"],
  },
  {
    id: "workflow-scoring",
    title: "ลำดับอ่านผังและการให้คะแนนเบื้องต้น",
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
    title: "คำแนะนำการแสดงผลและข้อควรระวังคะแนนกิจกรรม",
    file: "คู่มืออ้างอิง — ฤกษ์ยามในวิชา Qi Men Dun Jia (奇門遁甲) ตามประเภทกิจกรรม สำหรับ datepick .md",
    start: 428,
    end: 458,
    maxChars: 2400,
    tags: ["activity", "caveat", "score"],
  },
  {
    id: "ymd-method",
    title: "ฉีเหมินปี/เดือน/วัน: สายคำนวณตั้งต้น",
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
    title: "กฎอ่านจากตำรา統宗: อ่านตามสถานการณ์ ไม่ใช่กฎตายตัว",
    file: "奇門遁甲統宗 (ฉีเหมินตุนเจี่ย ถ่งจง)RV1.txt",
    start: 207,
    end: 248,
    maxChars: 2000,
    tags: ["classic", "core", "caveat"],
  },
  {
    id: "rv1-context-rules",
    title: "ตำรา統宗: ต้องดู旺衰 งานที่ถาม และสำนักประกอบ",
    file: "奇門遁甲統宗 (ฉีเหมินตุนเจี่ย ถ่งจง)RV1.txt",
    start: 252,
    end: 317,
    maxChars: 2400,
    tags: ["classic", "caveat", "formation"],
  },
  {
    id: "bazi-overlay-guard",
    title: "ดวงบุคคล八字ต้องแยกจากคำตัดสินฉีเหมิน",
    file: "ResolutionMasterกฎการแก้ขัดรวมตัวของพลังในผัง.md",
    start: 3,
    end: 6,
    maxChars: 800,
    tags: ["bazi", "personal"],
  },
  {
    id: "host-guest-shengke",
    title: "主客法 เจ้าบ้าน–แขก + 門宮·星宮生剋 ควรรุกหรือรับ",
    file: "auth-th/zhuke-shengke-th.md",
    start: 1,
    end: 200,
    maxChars: 3200,
    tags: ["host-guest", "shengke", "direction", "action", "decision"],
    repo: true,
  },
  {
    id: "star-vigor",
    title: "旺相休囚死 กำลังของดาว/ประตูตามฤดู (九星旺衰)",
    file: "auth-th/wangxiang-vigor-th.md",
    start: 1,
    end: 200,
    maxChars: 3000,
    tags: ["vigor", "star", "direction", "formation", "score"],
    repo: true,
  },
  {
    id: "zhifu-guardian",
    title: "守護·值符 ดาวผู้นำ/องค์อารักษ์ประจำผัง (天乙之神)",
    file: "auth-th/zhifu-guardian-th.md",
    start: 1,
    end: 200,
    maxChars: 3000,
    tags: ["guardian", "zhifu", "spirit", "direction"],
    repo: true,
  },
  {
    id: "yingqi-timing",
    title: "應期法 จับเวลาว่าเรื่องจะเกิด/ออกผลเมื่อไร",
    file: "auth-th/yingqi-timing-th.md",
    start: 1,
    end: 200,
    maxChars: 3000,
    tags: ["yingqi", "timing", "when", "action"],
    repo: true,
  },
  {
    id: "geju-formations",
    title: "格局 吉格/凶格 รูปแบบดี/ร้ายในผัง (龍返首·鳥跌穴·伏吟·六儀擊刑…)",
    file: "auth-th/geju-formations-th.md",
    start: 1,
    end: 200,
    maxChars: 3800,
    tags: ["formation", "geju", "action", "risk"],
    repo: true,
  },
  {
    id: "liushisi-gua",
    title: "六十四卦·奇門演卦法 แปลงผังเป็นกว้า แล้วอ่าน 384 เหยา",
    file: "auth-th/liushisi-gua-th.md",
    start: 1,
    end: 200,
    maxChars: 3600,
    tags: ["gua", "yijing", "yingqi", "intent"],
    repo: true,
  },
];

let _qimenIndex: { snippets: QimenSnippet[]; sig: string; version: string } | null = null;

function qmdjSignature(): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const s of QMDJ_SNIPPETS) {
    const key = `${s.repo ? "repo" : "docs"}/${s.file}`;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      const st = statSync(join(/* turbopackIgnore: true */ snippetDir(s), s.file));
      parts.push(`${key}:${Math.round(st.mtimeMs)}:${st.size}`);
    } catch {
      parts.push(`${key}:missing`);
    }
  }
  return parts.join("|");
}

function readDocLines(spec: QimenSnippetSpec): string {
  const raw = readFileSync(join(/* turbopackIgnore: true */ snippetDir(spec), spec.file), "utf8");
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

const QIMEN_SYSTEM_LABELS: Record<string, { label: string; scope: string; caveat: string }> = {
  hour: {
    label: "ผังยาม 時家",
    scope: "ดูชั่วโมง/ชั่วยามและจังหวะลงมือเฉพาะหน้า",
    caveat: "ใช้กับคำถามช่วงเวลานี้และการเลือกยาม ไม่ใช่ภาพรวมทั้งวัน/เดือน/ปี",
  },
  day: {
    label: "ผังวัน 日家",
    scope: "ดูภาพรวมของวันและทิศที่เด่นในวันนั้น",
    caveat: "ไม่ใช่ผังยามเฉพาะชั่วโมง ถ้าจะลงมือจริงยังควรดูผังยาม 時家 ประกอบ",
  },
  month: {
    label: "ผังเดือน 月家",
    scope: "ดูแนวโน้มระดับเดือน/ช่วงงานใหญ่",
    caveat: "ใช้เป็นภาพรวมรายเดือน ไม่ควรฟันธงจังหวะลงมือรายชั่วโมงจากผังนี้อย่างเดียว",
  },
  year: {
    label: "ผังปี 年家",
    scope: "ดูแนวโน้มระดับปี/ทิศทางใหญ่",
    caveat: "ใช้เป็นภาพรวมรายปี ไม่ใช่คำตัดสินยามลงมือเฉพาะหน้า",
  },
};

function normalizeQimenSystemType(value: any): string {
  const raw = String(value || "").toLowerCase();
  return raw === "day" || raw === "month" || raw === "year" ? raw : "hour";
}

function unwrapQimenPayload(value: any): any {
  if (!value || typeof value !== "object") return value;
  if (value.data && typeof value.data === "object" && (value.data.chart || value.data.palaces)) return value.data;
  return value;
}

function qimenPayloadFromRequestPayload(payload: any): any {
  if (payload?.qimen) return unwrapQimenPayload(payload.qimen);
  return unwrapQimenPayload(payload);
}

function qimenSystemTypeFromPayload(payload: any): string {
  const qimen = qimenPayloadFromRequestPayload(payload);
  const chart = qimen?.chart || payload?.chart || {};
  return normalizeQimenSystemType(
    chart.system_type || chart.chart_type || qimen?.system_type || qimen?.chart_type || payload?.system_type || payload?.chart_type,
  );
}

function selectQimenSourceIds(opts: { message: string; topic?: string; payload: any }): Set<string> {
  const text = `${opts.message || ""} ${opts.topic || ""} ${opts.payload?.activity || ""}`.toLowerCase();
  const ids = new Set<string>(["core-method", "workflow-scoring", "source-caveats", "rv1-living-rules"]);
  const systemType = qimenSystemTypeFromPayload(opts.payload);

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
  if (opts.payload?.qimen || wantAny(text, ["รุก", "รับ", "ลงมือก่อน", "รอ", "ฝ่ายไหน", "ได้เปรียบ", "主客", "เจ้าบ้าน", "แขก", "เริ่มก่อน", "บุก", "ตั้งรับ", "เจรจา", "แข่ง", "คดี", "ดีล", "ตัดสินใจ"])) {
    ids.add("host-guest-shengke");
  }
  if (opts.payload?.qimen || wantAny(text, ["旺", "相", "休", "囚", "廢", "แรง", "อ่อน", "กำลัง", "ฤดู", "vigor", "ดาวแรง", "ดาวอ่อน", "旺相"])) {
    ids.add("star-vigor");
  }
  if (opts.payload?.qimen || wantAny(text, ["值符", "直符", "天乙", "ผู้นำ", "ผู้ใหญ่", "นาย", "เจ้านาย", "ที่พึ่ง", "คุ้มกัน", "อารักษ์", "บารมี", "วังหลัก", "guardian"])) {
    ids.add("zhifu-guardian");
  }
  if (wantAny(text, ["應期", "应期", "เมื่อไร", "เมื่อไหร่", "กี่วัน", "กี่เดือน", "นานไหม", "ช้าเร็ว", "เร็ว", "ช้า", "จับเวลา", "timing", "when", "驛馬", "驿马", "马星", "ได้เมื่อ", "สำเร็จเมื่อ", "จังหวะ"])) {
    ids.add("yingqi-timing");
  }
  if (wantAny(text, ["格", "formation", "รูปแบบ", "青龍", "飛鳥", "五不遇", "空亡", "驛馬", "入墓", "擊刑", "門迫", "ช่องว่าง", "ม้า", "ปะทะ", "สุสาน"])) {
    ids.add("formations-good");
    ids.add("formations-risk");
    ids.add("four-harms");
    ids.add("rv1-context-rules");
  }
  if (opts.payload?.qimen || wantAny(text, ["格", "formation", "รูปแบบ", "返首", "跌穴", "伏吟", "反吟", "三奇", "三遁", "ดี", "ร้าย", "มงคล", "ลายเซ็น"])) {
    ids.add("geju-formations");
  }
  if (wantAny(text, ["卦", "六十四卦", "64卦", "演卦", "อี้จิง", "เอ๋อจิง", "เหยา", "爻", "周易", "察来意", "เจตนา", "ของหาย", "คนหนี", "คนเดินทาง", "yijing", "hexagram"])) {
    ids.add("liushisi-gua");
  }
  if (systemType !== "hour" || wantAny(text, ["ปี", "เดือน", "วัน", "日家", "月家", "年家", "year", "month", "day"])) {
    ids.add("ymd-method");
    ids.add("ymd-caveats");
  }
  if (wantAny(text, ["คะแนน", "score", "scoring", "เท่าไร", "ดีไหม", "ลงทุน", "trading", "หุ้น", "forex"])) {
    ids.add("activity-ui-caveat");
    ids.add("formations-risk");
  }
  return ids;
}

function qimenSourceReasonTh(s: QimenSnippetSpec, opts: { message: string; topic?: string; payload: any }, systemType: string): string {
  const systemInfo = QIMEN_SYSTEM_LABELS[systemType] || QIMEN_SYSTEM_LABELS.hour;
  if (s.tags.includes("yearmonthday")) {
    return `เลือกเพราะคำถามอยู่ในโหมด ${systemInfo.label} ต้องอธิบายขอบเขต 年/月/日/時 ให้ไม่ปนกัน`;
  }
  if (s.tags.includes("activity")) {
    return "เลือกเพราะคำถามเกี่ยวกับกิจกรรม/ฤกษ์/การลงมือ ต้องใช้กฎกิจกรรม ไม่ใช้คะแนนฉีเหมินกลาง";
  }
  if (s.tags.includes("formation")) {
    return "เลือกเพราะคำถามต้องอ่านรูปแบบพิเศษ 格局 หรือสัญญาณดีร้ายจากตำรา";
  }
  if (s.tags.includes("risk")) {
    return "เลือกเพราะต้องตรวจสัญญาณระวังจากผังจริง เช่น 空亡, 驛馬, 入墓, 擊刑, 門迫";
  }
  if (s.tags.includes("host-guest")) {
    return "เลือกเพราะต้องบอกว่าควรเป็นฝ่ายลงมือก่อน(รุก)หรือฝ่ายรอ(รับ) ตามหลัก 主客法 และธาตุ生剋 ของวัง/ดาว/ประตู";
  }
  if (s.tags.includes("vigor")) {
    return "เลือกเพราะต้องชั่งกำลังดาว/ประตูตามฤดู 旺相休囚死 ปรับน้ำหนักว่าดาวนั้นแรงหรืออ่อน ไม่ใช่คำตัดสินดีร้ายเดี่ยว";
  }
  if (s.tags.includes("guardian")) {
    return "เลือกเพราะต้องหาวังหลัก/ที่พึ่ง/ผู้คุ้มกันของเรื่อง ตามตำแหน่งดาวผู้นำ 值符 และเตือนถ้า值符ตกช่องว่าง 空亡";
  }
  if (s.tags.includes("gua") || s.tags.includes("yijing")) {
    return "เลือกเพราะต้องอ่านเสริมแบบอี้จิง: แปลงผังเป็นกว้า 64 (奇門演卦) แล้วดูคำเหยา 384 爻 ประกอบผังจริง";
  }
  if (s.tags.includes("yingqi") || s.tags.includes("timing")) {
    return "เลือกเพราะคำถามต้องประเมินช่วงเวลาเรื่องเกิด/ออกผล 應期 จาก空亡冲填·馬星·冲墓·旺相·กิ่งวัง ไม่ใช่ฟันธงวันเป๊ะ";
  }
  if (s.tags.includes("intent") || s.tags.includes("direction")) {
    return "เลือกเพราะต้องผูกคำถามเข้ากับ 用神/ทิศ/วังที่ควรอ่านก่อน";
  }
  if (s.tags.includes("bazi")) {
    return "เลือกเพราะมีข้อมูลดวงผู้ใช้ ใช้เป็นตัวกรองส่วนบุคคลเท่านั้น ไม่แทนคำตัดสินฉีเหมิน";
  }
  if (s.tags.includes("classic")) {
    return "เลือกเป็นหลักคลาสสิกช่วยกำกับการอ่าน แต่คำตัดสินต้องยึดผังจริงจากระบบคำนวณ";
  }
  return "เลือกเป็นฐานอ่านผังฉีเหมินและข้อควรระวังเรื่องคะแนนกับแหล่งอ้างอิง";
}

function qimenSourceTitleTh(s: QimenSnippetSpec): string {
  const title = String(s.title || "").trim();
  if (!title) return "แหล่งอ้างอิงฉีเหมิน";
  if (/^[A-Za-z]/.test(title)) return `หัวข้อฉีเหมิน: ${title}`;
  if (/^[一-龥]/.test(title)) return `หัวข้อตำราฉีเหมิน ${title}`;
  return title;
}

function qimenSourceTraceItem(s: QimenSnippetSpec, opts: { message: string; topic?: string; payload: any }, systemType: string): QimenSourceTraceItem {
  const titleTh = qimenSourceTitleTh(s);
  return {
    id: s.id,
    title_th: titleTh,
    source_label_th: "ชุดความรู้ฉีเหมินสำหรับผู้ช่วยซินแส",
    file: s.file,
    line_range: `${s.start}-${s.end}`,
    reason_th: qimenSourceReasonTh(s, opts, systemType),
    tags: s.tags.slice(),
  };
}

function loadQimenKnowledge(opts: { message: string; topic?: string; payload: any }): QimenSourcePacket {
  const idx = loadQimenSourceIndex();
  const ids = selectQimenSourceIds(opts);
  const systemType = qimenSystemTypeFromPayload(opts.payload);
  /* 8 มิ.ย. · จัดลำดับความสำคัญก่อนเติม packet (กัน auth-th 7 แกนโดน drop เพราะ cap)
   * 0=core-method (กรอบอ่านผัง) · 1=auth-th 7 แกนคัมภีร์ไทยนำ (repo) · 2=source-caveats (กันโอเวอร์เคลม)
   * 3=ที่เหลือ · sort เสถียร คงลำดับเดิมภายในชั้นเดียวกัน */
  const snippetPriority = (s: QimenSnippet): number => {
    if (s.id === "core-method") return 0;
    if (s.repo) return 1;
    if (s.id === "source-caveats") return 2;
    return 3;
  };
  const selected = idx.snippets
    .filter(s => ids.has(s.id))
    .map((s, i) => ({ s, i }))
    .sort((a, b) => snippetPriority(a.s) - snippetPriority(b.s) || a.i - b.i)
    .map(x => x.s);
  const parts: string[] = [];
  const trace: string[] = [];
  const traceItems: QimenSourceTraceItem[] = [];
  let used = 0;

  for (const s of selected) {
    const traceItem = qimenSourceTraceItem(s, opts, systemType);
    const part = `### [${s.id}] ${traceItem.title_th}\nแหล่งอ้างอิง: ${s.file}:${s.start}-${s.end}\nเหตุผลเลือกแหล่งอ้างอิง: ${traceItem.reason_th}\n${s.text}`;
    if (used && used + part.length > MAX_SOURCE_PACKET_CHARS) continue;
    parts.push(part);
    trace.push(`${s.id}=${s.file}:${s.start}-${s.end}`);
    traceItems.push(traceItem);
    used += part.length;
  }

  return {
    text: parts.join("\n\n"),
    version: idx.version,
    trace,
    traceItems,
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
type BuiltPrompt = { prompt: string; knowledgeVersion: string; sourceTrace: string[]; sourceTraceItems: QimenSourceTraceItem[] };

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
  ZHI_FU: "เทพจื๋อฝู", TAI_YIN: "เทพไท่อิน", LIU_HE: "เทพลิ่วเหอ", JIU_TIAN: "เทพจิ่วเทียน", JIU_DI: "เทพจิ่วตี้",
  TENG_SHE: "เทพเถิงเสอ", XUAN_WU: "เทพเสวียนอู่", BAI_HU: "เทพไป๋หู่", GOU_CHEN: "เทพโกวเฉิน", ZHU_QUE: "เทพจูเชวี่ย",
  "值符": "เทพจื๋อฝู", "\u76f4符": "เทพจื๋อฝู", "太陰": "เทพไท่อิน", "六合": "เทพลิ่วเหอ", "九天": "เทพจิ่วเทียน", "九地": "เทพจิ่วตี้",
  "螣蛇": "เทพเถิงเสอ", "玄武": "เทพเสวียนอู่", "白虎": "เทพไป๋หู่", "勾陳": "เทพโกวเฉิน", "朱雀": "เทพจูเชวี่ย",
};
const BRANCH_TH_ZH: Record<string, string> = {
  "子": "หนู 子", "丑": "วัว 丑", "寅": "เสือ 寅", "卯": "กระต่าย 卯",
  "辰": "มังกร 辰", "巳": "งู 巳", "午": "ม้า 午", "未": "แพะ 未",
  "申": "ลิง 申", "酉": "ไก่ 酉", "戌": "สุนัข 戌", "亥": "หมู 亥",
};
const BRANCH_CODE_ZH: Record<string, string> = {
  ZI: "子", CHOU: "丑", CHEN: "辰", SI: "巳", WU: "午", WEI: "未",
  SHEN: "申", YOU: "酉", XU: "戌", HAI: "亥", YIN: "寅", MAO: "卯",
};
const STEM_TH_ZH: Record<string, string> = {
  "甲": "ไม้หยาง 甲", "乙": "ไม้หยิน 乙", "丙": "ไฟหยาง 丙", "丁": "ไฟหยิน 丁",
  "戊": "ดินหยาง 戊", "己": "ดินหยิน 己", "庚": "ทองหยาง 庚", "辛": "ทองหยิน 辛",
  "壬": "น้ำหยาง 壬", "癸": "น้ำหยิน 癸",
};
const XIU_TH_ZH: Record<string, string> = {
  "角": "ดาวเขา 角宿", "亢": "ดาวคอ 亢宿", "氐": "ดาวฐาน 氐宿", "房": "ดาวห้อง 房宿",
  "心": "ดาวหัวใจ 心宿", "尾": "ดาวหาง 尾宿", "箕": "ดาวกระด้ง 箕宿", "斗": "ดาวกระบวย 斗宿",
  "牛": "ดาววัว 牛宿", "女": "ดาวหญิง 女宿", "虛": "ดาวว่าง 虛宿", "虚": "ดาวว่าง 虛宿",
  "危": "ดาวเสี่ยง 危宿", "室": "ดาวห้องใหญ่ 室宿", "壁": "ดาวกำแพง 壁宿", "奎": "ดาวขา 奎宿",
  "婁": "ดาวมัด 婁宿", "胃": "ดาวกระเพาะ 胃宿", "昴": "ดาวกลุ่มไก่ 昴宿", "畢": "ดาวตาข่าย 畢宿",
  "觜": "ดาวปาก 觜宿", "參": "ดาวสาม 參宿", "参": "ดาวสาม 參宿", "井": "ดาวบ่อน้ำ 井宿",
  "鬼": "ดาวผี 鬼宿", "柳": "ดาวหลิว 柳宿", "星": "ดาวดารา 星宿", "張": "ดาวขยาย 張宿",
  "张": "ดาวขยาย 張宿", "翼": "ดาวปีก 翼宿", "軫": "ดาวรถ 軫宿", "轸": "ดาวรถ 軫宿",
};
const XIU_GROUP_TH_ZH: Record<string, string> = {
  "東方青龍": "กลุ่มมังกรเขียวตะวันออก 東方青龍",
  "东方青龙": "กลุ่มมังกรเขียวตะวันออก 東方青龍",
  "北方玄武": "กลุ่มเต่าดำเหนือ 北方玄武",
  "西方白虎": "กลุ่มเสือขาวตะวันตก 西方白虎",
  "南方朱雀": "กลุ่มหงส์แดงใต้ 南方朱雀",
};
const ZH_DIR_TH_ZH: Record<string, string> = {
  "北": "ทิศเหนือ 北", "東北": "ทิศตะวันออกเฉียงเหนือ 東北", "东北": "ทิศตะวันออกเฉียงเหนือ 東北",
  "東": "ทิศตะวันออก 東", "东": "ทิศตะวันออก 東",
  "東南": "ทิศตะวันออกเฉียงใต้ 東南", "东南": "ทิศตะวันออกเฉียงใต้ 東南",
  "南": "ทิศใต้ 南", "西南": "ทิศตะวันตกเฉียงใต้ 西南",
  "西": "ทิศตะวันตก 西", "西北": "ทิศตะวันตกเฉียงเหนือ 西北", "中": "กลาง 中",
};

function labelThZh(th: unknown, zh: unknown, code: unknown, dict: Record<string, string>): string {
  const codeText = String(code || "");
  const zhText = String(zh || codeText || "—");
  const thText = String(th || dict[codeText] || dict[zhText] || "");
  return thText ? `${thText} ${zhText}` : zhText;
}

function normalizeQimenDeityZh(value: unknown): string {
  const text = String(value || "").trim();
  return text === "\u76f4符" ? "值符" : text;
}

function normalizeQimenDeityTh(value: unknown): string {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.includes("จื้อฝู") || text.includes("จื๋อฟู")) return text.includes("หัวหน้า") ? "เทพจื๋อฝู (เทพหัวหน้า)" : "เทพจื๋อฝู";
  return text;
}

function directionLabel(p: any): string {
  if (p.direction_th && p.direction_zh) return `${p.direction_th} ${p.direction_zh}`;
  const code = String(p.direction || "").toUpperCase();
  return DIR_LABEL_TH_ZH[code] || String(p.direction || p.trigram_zh || "ไม่ระบุทิศ");
}

function asPacketArray(value: any): any[] {
  if (value == null || value === false) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return [];
    if (text.startsWith("[") || text.startsWith("{")) {
      try {
        const parsed = JSON.parse(text);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        return [text];
      }
    }
    return [text];
  }
  return [value];
}

function packetText(value: unknown, fallback = ""): string {
  return clip(String(value ?? fallback ?? "").replace(/\s+/g, " ").trim(), 180);
}

function shortThZh(th: unknown, zh: unknown, fallback = "ไม่ระบุ"): string {
  const thText = packetText(th);
  const zhText = packetText(zh);
  if (thText && zhText && thText !== zhText) return `${thText} ${zhText}`;
  return thText || zhText || fallback;
}

function sourceRefText(value: any, max = 2): string {
  const refs = asPacketArray(value)
    .map((raw: any) => {
      if (!raw) return "";
      if (typeof raw === "object") {
        const th = raw.source_label_th || raw.source_title_th || raw.title_th || raw.name_th || raw.label_th;
        const zh = raw.source_label_zh || raw.source_title_zh || raw.title_zh || raw.name_zh || raw.label_zh;
        const id = raw.source_id || raw.id || raw.source || raw.file_id || raw.title;
        const label = shortThZh(th, zh, packetText(id, "แหล่งอ้างอิง"));
        const line = raw.line_range || raw.lines || raw.range;
        return [label, line].filter(Boolean).join(":");
      }
      return String(raw);
    })
    .filter(Boolean)
    .map((s: string) => {
      const compact = packetText(s, "").replace(/\\/g, "/");
      return compact.includes("/") ? compact.split("/").pop() || compact : compact;
    });
  return refs.slice(0, max).join(", ");
}

function hasThaiOrChinese(value: unknown): boolean {
  return /[ก-๙一-龥]/.test(String(value || ""));
}

function thaiSafeText(value: unknown, fallback: string): string {
  const text = packetText(value);
  return text && hasThaiOrChinese(text) ? text : fallback;
}

function qimenToneThai(value: unknown): string {
  const s = String(value || "").toLowerCase();
  if (s.includes("bad") || s.includes("inauspicious") || s.includes("avoid") || s.includes("danger") || s.includes("risk") || s.includes("warning") || s.includes("凶")) return "ระวัง";
  if (s.includes("great") || s.includes("excellent") || s.includes("best") || s.includes("大吉")) return "ดีมาก";
  if (s.includes("good") || s.includes("auspicious") || s.includes("benefit") || s.includes("吉")) return "ดี";
  if (s.includes("neutral") || s.includes("middle") || s.includes("mid") || s.includes("info")) return "กลาง";
  return "กลาง";
}

function qimenConfidenceThai(value: unknown): string {
  const s = String(value || "").toLowerCase();
  if (s === "high" || s.includes("สูง")) return "สูง";
  if (s === "medium" || s === "mid" || s.includes("กลาง")) return "กลาง";
  if (s === "low" || s.includes("ต่ำ")) return "ต่ำ";
  return "ไม่ระบุ";
}

function formatBeginnerReasons(reading: any, max = 3): string {
  const rows = asPacketArray(reading?.reasons).slice(0, max).map((r: any) => {
    if (typeof r !== "object") return packetText(r);
    const label = shortThZh(r.label_th || r.name_th || r.note_th, r.label_zh || r.name_zh || r.code, "เหตุผล");
    const toneRaw = r.tone || r.kind;
    const tone = toneRaw ? ` · ระดับ: ${qimenToneThai(toneRaw)}` : "";
    return `${label}${tone}`;
  }).filter(Boolean);
  return rows.length ? rows.join(" | ") : "ไม่มีเหตุผลย่อยจากระบบ";
}

function formatCheckNext(reading: any, max = 2): string {
  const rows = asPacketArray(reading?.check_next).slice(0, max).map((r: any) => packetText(r)).filter(Boolean);
  return rows.length ? rows.join(" | ") : "ไม่มีรายการเช็กต่อจากระบบ";
}

function qimenSifuChartContextGuard(chart: any, systemTypeHint?: string): boolean {
  const systemType = normalizeQimenSystemType(systemTypeHint || chart?.system_type || chart?.chart_type);
  if (!["day", "month", "year"].includes(systemType)) return false;
  const readiness = chart?.engine_readiness || {};
  const temporal = chart?.temporal_context_policy || {};
  const dmy = chart?.dmy_fushi_context || {};
  const apiPolicy = chart?.api_capabilities?.qimen_context_flags || chart?.qimen_context_flags || {};
  const verdictAllowed = chart?.verdict_allowed === true
    || readiness.verdict_allowed === true
    || temporal.verdict_allowed === true
    || dmy.verdict_allowed === true
    || apiPolicy.verdict_allowed === true;
  return !verdictAllowed;
}

function qimenSifuApplyChartContextGuard(p: any, chart: any, systemTypeHint?: string): any {
  const reading = p?.beginner_reading;
  if (!qimenSifuChartContextGuard(chart, systemTypeHint)) return reading;
  const caveat = packetText(
    chart?.engine_readiness?.caveat_th
      || chart?.temporal_context_policy?.caveat_th
      || chart?.dmy_fushi_context?.caveat_th
      || "ผังวัน/เดือน/ปีอ่านประกอบเท่านั้น ต้องตรวจผังยาม 時家 ก่อนใช้เป็นฤกษ์เฉพาะชั่วโมง"
  );
  const original = reading && typeof reading === "object" ? reading : {};
  const checkNext = asPacketArray(original.check_next).map((x: any) => packetText(x)).filter(Boolean);
  const hourCheck = "ถ้าจะลงมือจริงให้ตรวจผังยาม 時家 และเงื่อนไขกิจกรรมอีกครั้ง";
  if (!checkNext.includes(hourCheck)) checkNext.push(hourCheck);
  return {
    ...original,
    code: "context_only",
    tone: "context",
    label_th: "อ่านประกอบเท่านั้น",
    label_zh: "待校",
    summary_th: caveat,
    reasons: asPacketArray(original.reasons),
    check_next: checkNext.slice(0, 4),
    caveat_th: caveat,
    score_policy_th: "คะแนนของผังวัน/เดือน/ปีใช้ช่วยจัดลำดับเพื่ออ่านประกอบเท่านั้น ไม่ใช่คำตัดสินฤกษ์ยาม",
    is_actionable: false,
    verdict_allowed: false,
    no_score_mutation: true,
    has_engine_score: false,
  };
}

function qimenSifuScoreLine(p: any, reading: any): string {
  if (reading?.verdict_allowed === false || reading?.is_actionable === false || reading?.has_engine_score === false) {
    const raw = p?.display_score ?? p?.score;
    const value = raw == null ? "ไม่มีคะแนนที่ใช้ฟันธง" : `ค่า ${packetText(raw)}`;
    return `คะแนนช่วยจัดลำดับ ${value} · อ่านประกอบเท่านั้น ไม่ใช่คำตัดสินฤกษ์`;
  }
  return `คะแนนระบบ ${p?.display_score ?? p?.score ?? "ไม่ระบุ"}`;
}

function formatBeginnerReading(p: any, guardedReading?: any): string {
  const reading = guardedReading !== undefined ? guardedReading : p?.beginner_reading;
  if (!reading || typeof reading !== "object") {
    return " · สถานะอ่านเร็ว 入門: ต้องดูบริบท 需看局 · เพราะอะไร: ระบบยังไม่มีข้อมูลอ่านเร็วที่เชื่อถือได้ · ต้องเช็กต่อ: รอข้อมูลระบบก่อนใช้เป็นคำแนะนำ · หมายเหตุ: ใช้เป็นตัวหลักไม่ได้; ไม่มีคะแนนรวมจากระบบ; ไม่แก้คะแนนจริง";
  }
  const label = shortThZh(reading.label_th, reading.label_zh, "ต้องดูบริบท 需看局");
  const summary = packetText(reading.summary_th || reading.summary || "อ่านเป็นบริบท");
  const actionPolicy = reading.is_actionable ? "ใช้เป็นตัวหลักได้ถ้าตรงคำถาม" : "ใช้เป็นตัวหลักไม่ได้";
  const scoreState = reading.has_engine_score ? `คะแนนระบบ: ${reading.engine_score ?? p.display_score ?? p.score ?? "มี"}` : "ไม่มีคะแนนรวมจากระบบ";
  const mutationState = reading.no_score_mutation === true ? "ไม่แก้คะแนนจริง" : reading.no_score_mutation === false ? "ไม่ยืนยันนโยบายคะแนน" : "นโยบายคะแนนไม่ชัด";
  const targetState = reading.is_yongshen_target ? "ตรง用神" : "ไม่ใช่用神หลัก";
  const caveat = packetText(reading.caveat_th || reading.score_policy_th || "ป้ายนี้ไม่ใช่ฤกษ์สุดท้าย");
  const evidenceCounts = [
    reading.support_count != null ? `หนุน: ${packetText(reading.support_count)}` : "",
    reading.caution_count != null ? `ระวัง: ${packetText(reading.caution_count)}` : "",
    reading.hard_count != null ? `ตัดหนัก: ${packetText(reading.hard_count)}` : "",
  ].filter(Boolean).join("; ");
  return [
    ` · สถานะอ่านเร็ว 入門: ${label}`,
    ` · เพราะอะไร: ${formatBeginnerReasons(reading)}`,
    ` · ต้องเช็กต่อ: ${formatCheckNext(reading)}`,
    evidenceCounts ? ` · หลักฐานอ่านเร็ว: ${evidenceCounts}` : "",
    ` · หมายเหตุ: ${[summary, caveat, actionPolicy, scoreState, mutationState, targetState].filter(Boolean).join("; ")}`,
  ].join("");
}

function selectorTargetForPalace(selector: any, palace: any): any {
  const palaceId = Number(palace?.palace_id);
  return asPacketArray(selector?.target_palaces).find((p: any) => Number(p?.palace_id) === palaceId) || null;
}

function formatYongshenPalace(selector: any, p: any): string {
  const target = selectorTargetForPalace(selector, p);
  if (!target && !p?.is_yongshen_target) return "";
  const status = packetText(target?.status_th || p?.yongshen_status_th || "วังเป้าหมายของเรื่องที่ถาม");
  const warnings = asPacketArray(target?.warning_flags || p?.yongshen_warning_flags).slice(0, 2).map((w: any) => thaiSafeText(w, "มีสัญญาณเตือนจากระบบ")).filter(Boolean).join(" | ");
  const source = sourceRefText(target?.source_refs || target?.source_trace || target?.source_id, 1);
  return ` · ตัวเลือกธาตุที่ต้องใช้ 用神 selector: ${status}${warnings ? ` · เตือน: ${warnings}` : ""}${source ? ` · แหล่งอ้างอิง: ${source}` : ""}`;
}

function formatTraceItem(item: any): string {
  if (!item) return "";
  if (typeof item !== "object") return packetText(item);
  const label = shortThZh(item.name_th || item.label_th || item.note_th || item.title_th, item.name_zh || item.label_zh || item.formation_code || item.code, "สัญญาณ");
  const sev = item.severity || item.tone || item.quality || item.base_quality;
  const summary = thaiSafeText(
    item.summary_th || item.detail_th || item.note_th || item.reason_th || item.reason || item.source_summary_th || item.source_detail_th,
    "",
  );
  const negated = asPacketArray(item.negated_by).slice(0, 3).map((x: any) => {
    if (!x) return "";
    if (typeof x === "object") return packetText(x.code || x.label_th || x.label_zh || x.name_th || x.name_zh);
    return packetText(x);
  }).filter(Boolean).join(",");
  const refs = sourceRefText(item.source_refs || item.source_trace || item.refs, 1);
  return `${label}${sev ? ` · ระดับ: ${qimenToneThai(sev)}` : ""}${summary ? ` · เหตุผล: ${packetText(summary).slice(0, 120)}` : ""}${negated ? ` · ถูกหักแรงโดย: ${negated}` : ""}${refs ? ` · แหล่งอ้างอิง: ${refs}` : ""}`;
}

function formatSourceFormation(f: any): string {
  if (!f) return "";
  if (typeof f !== "object") return `  - ${packetText(f)}`;
  const label = shortThZh(
    f.name_th || f.label_th || f.title_th,
    f.name_zh || f.label_zh || f.formation_code || f.code,
    "รูปแบบจากแหล่งอ้างอิง",
  );
  const quality = qimenToneThai(f.quality || f.effective_quality || f.base_quality);
  const confidence = qimenConfidenceThai(f.confidence);
  const scope = f.scope ? `(${packetText(f.scope)}${f.scope_ref ? ` ${packetText(f.scope_ref)}` : ""})` : "";
  const summary = thaiSafeText(f.summary_th || f.note_th || f.detail_th || f.reason || f.note, "อ่านเป็นสัญญาณประกอบจากตำรา");
  const refs = sourceRefText(f.source_refs || f.source_trace || f.refs || f.source, 1);
  const negated = asPacketArray(f.negated_by).slice(0, 3).map((x: any) => {
    if (!x) return "";
    if (typeof x === "object") return packetText(x.code || x.label_th || x.label_zh || x.name_th || x.name_zh);
    return packetText(x);
  }).filter(Boolean).join(",");
  return `  - ${label}${scope ? ` ${scope}` : ""}: ${summary} · น้ำหนักหลักฐาน: ${quality} · ความมั่นใจ: ${confidence}${negated ? ` · ถูกหักแรงโดย: ${negated}` : ""}${refs ? ` · แหล่งอ้างอิง: ${refs}` : ""}`;
}

function formatPalaceSourceFlags(p: any): string {
  const flags = [
    ...qimenMergedUiContextFlags(p).filter((flag: any) => qimenContextFlagIsActive(flag)),
    ...asPacketArray(p?.qimen_trace),
    ...asPacketArray(p?.classical_flags),
    ...asPacketArray(p?.p0_badges),
    ...asPacketArray(p?.source_trace),
  ];
  const seen = new Set<string>();
  const rows = flags.map(formatTraceItem).filter(Boolean).filter((line: string) => {
    const key = line.split(" แหล่งอ้างอิง:")[0];
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 3);
  return rows.length ? ` · สัญญาณแหล่งอ้างอิง: ${rows.join(" | ")}` : "";
}

function qimenStemResponseIsContextOnly(stemResponse: any): boolean {
  const quality = String(stemResponse?.quality || stemResponse?.effective_quality || "").toLowerCase();
  return stemResponse?.verdict_allowed === false
    || quality === "context_only"
    || quality === "context"
    || stemResponse?.engine_readiness?.stem_response_policy === "context_only";
}

function formatEngineReadiness(readiness: any): string {
  if (!readiness || typeof readiness !== "object") return "";
  const stemPolicy = packetText(readiness.stem_response_policy);
  const stemPolicyThai = stemPolicy === "context_only" ? "อ่านประกอบเท่านั้น" : stemPolicy;
  return [
    readiness.level ? `สถานะข้อมูล: ${packetText(readiness.level)}` : "",
    readiness.formula_confidence ? `สูตร: ${packetText(readiness.formula_confidence)}` : "",
    readiness.stem_layer ? `ชั้นก้าน: ${packetText(readiness.stem_layer)}` : "",
    readiness.stem_response_policy ? `นโยบายก้าน: ${stemPolicyThai}` : "",
    readiness.verdict_allowed === false ? "ยังไม่อนุญาตให้ฟันธงจากก้าน" : "",
    readiness.caveat_th ? `ข้อควรระวัง: ${packetText(readiness.caveat_th)}` : "",
  ].filter(Boolean).join(" · ");
}

function formatStemResponse(stemResponse: any): string {
  if (!stemResponse) return "";
  if (qimenStemResponseIsContextOnly(stemResponse)) {
    const title = shortThZh(
      stemResponse.title_th || stemResponse.status_th || "ก้านฟ้าอ่านประกอบ",
      stemResponse.title_zh || stemResponse.notation_zh,
      "ก้านฟ้าอ่านประกอบ 十干克應",
    );
    const beginner = packetText(stemResponse.beginner_th || stemResponse.status_th || "อ่านประกอบเท่านั้น");
    const caveat = packetText(stemResponse.caveat_th || "อ่านประกอบเท่านั้น ไม่ใช่คำตัดสินดีร้ายจากตำรา");
    const readiness = formatEngineReadiness(stemResponse.engine_readiness);
    return ` · 干應 ${title} (${beginner} · ${caveat} · สถานะหลักฐาน: อ่านประกอบ · ยังไม่อนุญาตให้ฟันธงจากก้าน${readiness ? ` · ${readiness}` : ""})`;
  }
  if (stemResponse.is_source_governed) {
    const title = shortThZh(stemResponse.title_th || "ปฏิกิริยาก้าน", stemResponse.title_zh || stemResponse.notation_zh, "ปฏิกิริยาก้าน 十干克應");
    const beginner = packetText(stemResponse.beginner_th || stemResponse.caveat_th || "อ่านประกอบ");
    const refs = sourceRefText(stemResponse.source_trace || stemResponse.source_refs, 2);
    return ` · 干應 ${title} (${beginner}${refs ? ` · แหล่งอ้างอิง: ${refs}` : ""})`;
  }
  return stemResponse.status_th
    ? ` · 干應 ${packetText(stemResponse.status_th)} · ยังไม่ตัดสินจากตำราในระบบ`
    : " · 干應 ยังไม่มีข้อมูลก้านที่ยืนยันได้";
}

const LANG_INSTR: Record<string, string> = {
  th: "ตอบเป็นภาษาไทยสำหรับคนทั่วไป · ไทยนำจีนรอง · กระชับ · อธิบายศัพท์จีนทุกคำที่ใช้",
  en: "ตอบเป็นภาษาไทยสำหรับคนทั่วไป · ไทยนำจีนรองเสมอ แม้ผู้ใช้เปิดโหมดอังกฤษ · ถ้าจำเป็นใส่อังกฤษเป็นคำช่วยท้ายประโยคเท่านั้น",
  zh: "ตอบเป็นภาษาไทยสำหรับคนทั่วไป · ไทยนำจีนรองเสมอ แม้ผู้ใช้เปิดโหมดจีน · คำจีนใช้เป็นคำรองหลังคำไทย",
};

const TOPIC_FOCUS: Record<string, string> = {
  overview:  "ภาพรวมผัง · 局/ดวง/三奇/八門เด่น · 格局สำคัญ",
  direction: "ทิศไหนเหมาะกับ用神ของผู้ใช้ · เพราะอะไร · ทิศที่เลี่ยง",
  action:    "ชั่วยามนี้เหมาะทำอะไร · เริ่ม/รอ/ปิดดีล",
  timing:    "เวลานี้ดี/รอ · ถ้ารอ ควรรอถึงเวลาไหน",
  formation: "รูปแบบพิเศษ 格局 (formations) ในผัง · ดี/ระวัง · กระทบยังไง",
  search_advice: "วิเคราะห์ผลค้นหา · แนะนำ top 3 ที่ดีสุดสำหรับผู้ใช้คนนี้ · เหตุผลตำรา · เลี่ยงอันไหน",
};

function pillarValue(pillar: any, fallback: any): string {
  if (pillar && typeof pillar === "object") {
    const zh = pillar.gan_zhi || pillar.zh || pillar.pillar_zh || `${pillar.stem_zh || pillar.stem || ""}${pillar.branch_zh || pillar.branch || ""}`;
    const th = pillar.label_th || pillar.name_th || pillar.th || qimenPillarThaiFirst(zh, "");
    return packetText(`${th || zh || fallback || "-"}${zh && th && !String(th).includes(String(zh)) ? ` (${zh})` : ""}`);
  }
  return qimenPillarThaiFirst(pillar || fallback, "-");
}

function formatQimenPillars(chart: any): string {
  const pillars = chart?.pillars || {};
  const year = pillarValue(pillars.year, chart.year_pillar_zh || chart.yearPillarZh);
  const month = pillarValue(pillars.month, chart.month_pillar_zh || chart.monthPillarZh);
  const day = pillarValue(pillars.day, chart.day_pillar_zh || chart.dayPillarZh);
  const hour = pillarValue(pillars.hour, chart.hour_pillar_zh || chart.hourPillarZh || chart.pillar_zh);
  return `ปี 年=${year} · เดือน 月=${month} · วัน 日=${day} · ยาม 時=${hour}`;
}

function qimenBranchTokens(value: any): string[] {
  const found = new Set<string>();
  const visit = (raw: any) => {
    if (raw == null || raw === false) return;
    if (Array.isArray(raw)) {
      raw.forEach(visit);
      return;
    }
    if (typeof raw === "object") {
      visit(raw.branch_zh ?? raw.branch);
      visit(raw.branches_zh ?? raw.branches ?? raw.branch_codes ?? raw.void_zh);
      return;
    }
    const text = packetText(raw);
    const upper = text.toUpperCase();
    if (BRANCH_CODE_ZH[upper]) found.add(BRANCH_CODE_ZH[upper]);
    for (const ch of text.match(/[子丑寅卯辰巳午未申酉戌亥]/g) || []) found.add(ch);
  };
  visit(value);
  return Array.from(found);
}

function qimenBranchList(value: any, fallback = "ข้อมูลไม่พอ"): string {
  const branches = qimenBranchTokens(value);
  if (!branches.length) return fallback;
  return branches.map((b) => BRANCH_TH_ZH[b] || b).join(" · ");
}

function qimenStemLabel(value: any, fallback = ""): string {
  const text = packetText(value);
  const stem = text.match(/[甲乙丙丁戊己庚辛壬癸]/)?.[0] || "";
  return stem ? STEM_TH_ZH[stem] || stem : fallback;
}

function qimenPillarThaiFirst(value: any, fallback = "ข้อมูลไม่พอ"): string {
  const text = packetText(value);
  const stem = qimenStemLabel(text);
  const branches = qimenBranchTokens(text).slice(0, 1);
  const branch = branches[0] ? BRANCH_TH_ZH[branches[0]] || branches[0] : "";
  const base = [stem, branch].filter(Boolean).join(" + ");
  if (!base) return packetText(text || fallback);
  return text ? `${base} (${text})` : base;
}

function qimenTimeBranch(value: any, fallback: any = null): string {
  const direct = qimenBranchList(value, "");
  return direct || qimenBranchList(fallback, "ข้อมูลไม่พอ");
}

function qimenXiuLabel(chart: any): string {
  const xiu = chart?.twenty_eight || chart?.twentyEight || {};
  if (!xiu || typeof xiu !== "object") return "ข้อมูลไม่พอ";
  const rawZh = packetText(xiu.zh || xiu.name_zh || xiu.xiu_zh || "");
  const key = rawZh.replace(/宿/g, "");
  const name = key ? (XIU_TH_ZH[key] || `ดาวฤกษ์ ${key}${key.endsWith("宿") ? "" : "宿"}`) : "ข้อมูลไม่พอ";
  const number = xiu.number || xiu.no || xiu.index ? `ลำดับ ${packetText(xiu.number || xiu.no || xiu.index)}` : "";
  const groupRaw = packetText(xiu.group_zh || xiu.group || "");
  const group = groupRaw ? (XIU_GROUP_TH_ZH[groupRaw] || groupRaw) : "";
  const palaceRaw = packetText(xiu.palace_zh || xiu.direction_zh || xiu.direction || "");
  const palace = palaceRaw ? (ZH_DIR_TH_ZH[palaceRaw] || palaceRaw) : "";
  return [number, name, group, palace].filter(Boolean).join(" · ") || "ข้อมูลไม่พอ";
}

function formatQimenTimeContext(chart: any): string {
  const voids = chart?.voids || {};
  const skyHorse = chart?.sky_horse || chart?.skyHorse || {};
  const nobleman = chart?.nobleman || {};
  const clash = chart?.clash || {};
  const dayVoid = qimenTimeBranch(voids.day, chart?.void_day_zh || chart?.voidDayZh);
  const hourVoid = qimenTimeBranch(voids.hour, chart?.void_hour_zh || chart?.voidHourZh);
  const dayHorse = qimenTimeBranch(skyHorse.day?.branch ?? skyHorse.day, chart?.traveling_horse_day_zh || chart?.traveling_horse_zh);
  const hourHorse = qimenTimeBranch(skyHorse.hour?.branch ?? skyHorse.hour, chart?.traveling_horse_hour_zh);
  const dayNoble = qimenTimeBranch(nobleman.day?.branches ?? nobleman.day, chart?.nobleman_day_zh);
  const hourNoble = qimenTimeBranch(nobleman.hour?.branches ?? nobleman.hour, chart?.nobleman_hour_zh);
  const dayClash = qimenTimeBranch(clash.day?.branch ?? clash.day, chart?.day_clash_zh);
  const hourClash = qimenTimeBranch(clash.hour?.branch ?? clash.hour, chart?.hour_clash_zh);
  return [
    `ช่องว่าง 空亡: วัน=${dayVoid} / ยาม=${hourVoid}`,
    `ม้าเดินทาง 驛馬: วัน=${dayHorse} / ยาม=${hourHorse}`,
    `คนช่วย 貴人: วัน=${dayNoble} / ยาม=${hourNoble}`,
    `วัน/ยามปะทะ 日時沖: วัน=${dayClash} / ยาม=${hourClash}`,
    `28 ดาวฤกษ์ 二十八宿: ${qimenXiuLabel(chart)}`,
    "หมายเหตุ: ใช้เป็นบริบทเวลาจากข้อมูลผังจริงเท่านั้น ไม่ใช่คะแนนดีร้ายเดี่ยว",
  ].join(" · ");
}

function qimenContextFlagIsActive(flag: any): boolean {
  return flag?.active === true || flag?.enabled === true || flag?.value === true || flag?.present === true;
}

function qimenFlagLabel(flag: any): string {
  return shortThZh(flag?.label_th, flag?.label_zh || flag?.short_zh || flag?.code, packetText(flag?.code, "ป้าย"));
}

function qimenBranchEvidenceLayerLabel(layer: unknown, flagCode: unknown): string {
  const key = packetText(layer).toLowerCase();
  const base = key === "year" ? "ปี"
    : key === "month" ? "เดือน"
      : key === "day" ? "วัน"
        : key === "hour" ? "ยาม"
          : packetText(layer, "ชั้นเวลา");
  const code = packetText(flagCode).toUpperCase();
  if (code === "YI_MA") return base === "วัน" ? "ม้าวัน" : base === "ยาม" ? "ม้ายาม" : `ม้า${base}`;
  if (code === "GUI_REN") return base === "วัน" ? "คนช่วยวัน" : base === "ยาม" ? "คนช่วยยาม" : `คนช่วย${base}`;
  if (code === "KONG_WANG") return base === "วัน" ? "ว่างวัน" : base === "ยาม" ? "ว่างยาม" : `ว่าง${base}`;
  if (code === "RI_SHI_CHONG") return base === "วัน" ? "ปะทะวัน" : base === "ยาม" ? "ปะทะยาม" : `ปะทะ${base}`;
  return base;
}

function formatQimenFlagBranchEvidence(flag: any): string {
  const rows = asPacketArray(flag?.branch_evidence)
    .map((item: any) => {
      if (!item || typeof item !== "object") return "";
      const branch = qimenBranchList([
        item.matched_branch_zh,
        item.matched_branches_zh,
        item.branch_zh,
        item.branches_zh,
        item.branch,
        item.branches,
      ], "");
      if (!branch) return "";
      const layer = qimenBranchEvidenceLayerLabel(item.layer || item.layer_th, flag?.code);
      return `${layer} ${branch}`;
    })
    .filter(Boolean);
  const seen = new Set<string>();
  const unique = rows.filter((row: string) => {
    if (seen.has(row)) return false;
    seen.add(row);
    return true;
  }).slice(0, 4);
  return unique.length ? `หลักฐานกิ่ง: ${unique.join(" / ")}` : "";
}

function qimenMergedUiContextFlags(p: any): any[] {
  const seen = new Set<string>();
  return [
    ...asPacketArray(p?.ui_flags),
    ...asPacketArray(p?.context_flags),
  ].filter((flag: any) => flag && typeof flag === "object").filter((flag: any) => {
    const key = packetText(flag.code || flag.label_th || flag.label_zh || flag.short_zh || "");
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatQimenUiFlags(p: any): string {
  const flags = qimenMergedUiContextFlags(p)
    .filter((flag: any) => flag && typeof flag === "object" && qimenContextFlagIsActive(flag))
    .slice(0, 8)
    .map((flag: any) => {
      const label = qimenFlagLabel(flag);
      const caveat = flag.context_only === true || flag.verdict_allowed === false ? "อ่านประกอบ" : "ตรวจเพิ่ม";
      const branchEvidence = formatQimenFlagBranchEvidence(flag);
      return `${label} (${caveat}${branchEvidence ? ` · ${branchEvidence}` : ""})`;
    })
    .filter(Boolean);
  if (!flags.length) return "";
  return `ป้ายช่วยอ่านจากระบบ: ${flags.join(" · ")} · ไม่มีผลกับคะแนน · อ่านประกอบเท่านั้น · ถ้าป้ายใดไม่มีหลักฐานกิ่ง ห้ามอธิบายว่าติดเพราะกิ่งใด`;
}

function formatPalaceBranchEvidenceSummary(p: any): string {
  const rows = qimenMergedUiContextFlags(p)
    .filter((flag: any) => flag && typeof flag === "object" && qimenContextFlagIsActive(flag))
    .map((flag: any) => {
      const evidence = formatQimenFlagBranchEvidence(flag);
      return evidence ? `${qimenFlagLabel(flag)} · ${evidence}` : "";
    })
    .filter(Boolean)
    .slice(0, 6);
  return rows.length
    ? rows.join(" · ")
    : "ยังไม่มีหลักฐานกิ่งรายวังจากระบบ; ห้ามบอกว่าป้ายนี้ติดเพราะกิ่งใด";
}

function formatPalaceLegacyFlags(p: any): string {
  return [
    p?.is_void_any || p?.is_void ? "ช่องว่าง 空亡" : "",
    p?.is_traveling_horse ? "ม้าเดินทาง 驛馬" : "",
    p?.is_ru_mu || p?.is_tomb ? "เข้าคลัง/สุสาน 入墓" : "",
    p?.is_ji_xing || p?.is_punishment ? "ถูกลงโทษ 擊刑" : "",
    p?.is_men_po || p?.is_door_oppressed ? "ประตูบีบวัง 門迫" : "",
  ].filter(Boolean).join(" · ");
}

function trimEvidencePrefix(value: string): string {
  return packetText(value).replace(/^·\s*/, "").trim();
}

function formatPalaceSignalEvidence(p: any): string {
  const uiFlags = formatQimenUiFlags(p);
  const legacyFlags = formatPalaceLegacyFlags(p);
  const sourceFlags = trimEvidencePrefix(formatPalaceSourceFlags(p));
  return [
    uiFlags,
    legacyFlags ? `สัญญาณคลาสสิกในวัง: ${legacyFlags}` : "",
    sourceFlags,
  ].filter(Boolean).join(" · ") || "ไม่มีป้ายสัญญาณจากระบบในวังนี้";
}

function formatAdvancedLayerLabel(layer: any): string {
  return shortThZh(
    layer?.label_th || layer?.name_th || layer?.title_th,
    layer?.label_zh || layer?.name_zh || layer?.title_zh || layer?.code,
    "ชั้นสูตรลึก",
  );
}

function formatAdvancedFormationItem(item: any): string {
  if (!item || typeof item !== "object") return packetText(item);
  const label = shortThZh(item.label_th || item.name_th || item.title_th, item.label_zh || item.name_zh || item.code, "สูตรรายวัง");
  const note = thaiSafeText(item.note_th || item.summary_th || item.detail_th, "");
  return `${label}${note ? `: ${note}` : ""}`;
}

function formatAdvancedQimenLayers(p: any): string {
  const rows = asPacketArray(p?.advanced_qimen_layers)
    .filter((layer: any) => layer && typeof layer === "object" && (layer.active === true || layer.enabled === true || layer.present === true || layer.value === true))
    .slice(0, 6)
    .map((layer: any) => {
      const label = formatAdvancedLayerLabel(layer);
      const status = thaiSafeText(layer.status_th || layer.source_summary_th, "พบชั้นนี้ในวังนี้");
      const formations = asPacketArray(layer.formation_items).slice(0, 3).map(formatAdvancedFormationItem).filter(Boolean).join(" | ");
      const caveat = thaiSafeText(layer.caveat_th, "อ่านประกอบ ไม่ใช่คะแนนเดี่ยว");
      return `${label}: ${status}${formations ? ` · รายการ: ${formations}` : ""} · ${caveat}`;
    })
    .filter(Boolean);
  if (!rows.length) return "";
  return ` · ชั้นสูตรลึกที่เกิดในวังนี้ 深層標記: ${rows.join(" || ")} · ไม่มีผลกับคะแนน`;
}

function formatQimenCapabilities(chart: any): string {
  const caps = chart?.api_capabilities?.qimen_context_flags || chart?.api_capabilities?.ui_flags || null;
  const policy = chart?.temporal_context_policy || {};
  if (!caps && !policy?.policy_name) {
    return "ความพร้อมของข้อมูลผัง: รุ่นนี้ยังไม่มีป้ายช่วยอ่านจากระบบ; ใช้ข้อมูลเดิมเฉพาะแสดงผล ห้ามคำนวณเพิ่ม";
  }
  return `ความพร้อมของข้อมูลผัง: มีป้ายช่วยอ่านจากระบบ · รุ่น: ${packetText(caps?.version || "ไม่ระบุ")} · ไม่มีผลกับคะแนน · ใช้อ่านประกอบ: ${policy.context_only === false ? "ไม่ยืนยัน" : "ใช่"} · ห้ามฟันธงเดี่ยว: ${caps?.verdict_allowed === true || policy.verdict_allowed === true ? "ไม่ยืนยัน" : "ใช่"}`;
}

function formatQimenClassicalCoverage(chart: any): string {
  const coverage = chart?.classical_p0?.coverage || chart?.classicalP0?.coverage || chart?.formation_detector_coverage || null;
  if (!coverage || typeof coverage !== "object") {
    return "ความพร้อมตัวตรวจสูตรลึก 格局/四害: ยังไม่มีรายการจากระบบคำนวณ ห้ามอ้างว่าระบบตรวจครบ";
  }
  const detectors = asPacketArray(coverage.detectors).filter((item: any) => item && typeof item === "object");
  const labelFor = (item: any) => shortThZh(item.label_th || item.note_th, item.label_zh || item.code, "สูตรตรวจ");
  const guard = detectors
    .filter((item: any) => item.category === "guard_flag")
    .slice(0, 6)
    .map(labelFor)
    .filter(Boolean)
    .join(" · ");
  const advanced = detectors
    .filter((item: any) => item.category === "advanced_formation")
    .slice(0, 8)
    .map(labelFor)
    .filter(Boolean)
    .join(" · ");
  const families = coverage.families || {};
  const total = families.total ?? detectors.length;
  const caveat = packetText(coverage.caveat_th || "รายการนี้บอกว่าระบบตรวจได้ ไม่ได้แปลว่าผังเวลานี้เกิดทุกสูตร ต้องดูผลที่ติดจริงในแต่ละวัง");
  return [
    `ความพร้อมตัวตรวจสูตรลึก 格局/四害: ${packetText(coverage.status_th || "ระบบส่งรายการตัวตรวจมาแล้ว")} · รุ่น ${packetText(coverage.version || "ไม่ระบุ")} · ทั้งหมด ${packetText(total)} รายการ`,
    guard ? `สูตรเตือนที่ระบบตรวจได้: ${guard}` : "",
    advanced ? `รูปแบบขั้นสูงที่ระบบตรวจได้: ${advanced}` : "",
    `${caveat} · ไม่มีผลกับคะแนน · ห้ามฟันธงจากรายการนี้เดี่ยว ๆ`,
  ].filter(Boolean).join("\n");
}

function formatAdvancedQimenReadiness(chart: any, q?: any): string {
  const rows = asPacketArray(chart?.advanced_qimen_layer_readiness || q?.advanced_qimen_layer_readiness)
    .filter((item: any) => item && typeof item === "object")
    .slice(0, 10)
    .map((item: any) => {
      const label = formatAdvancedLayerLabel(item);
      const state = item.active_detector === true || item.active === true ? "เปิดตรวจแล้ว" : "ยังไม่เปิดตรวจ";
      const status = thaiSafeText(item.status_th || item.source_summary_th, "ยังไม่ระบุสถานะ");
      const caveat = thaiSafeText(item.caveat_th, "");
      return `${label}: ${state} · ${status}${caveat ? ` · ${caveat}` : ""}`;
    })
    .filter(Boolean);
  if (!rows.length) {
    return "สถานะชั้นสูตรใหม่ 深層公式狀態: ไม่มี readiness packet จาก engine ห้ามอ้างว่าตรวจครบ";
  }
  return `สถานะชั้นสูตรใหม่ 深層公式狀態:\n${rows.map((x: string) => `  - ${x}`).join("\n")}\nหมายเหตุ: readiness คือสถานะว่าสูตรพร้อมหรือยัง ไม่ได้แปลว่าสูตรนั้นเกิดจริงในวัง`;
}

function selectedPalaceIdFromPayload(payload: any): number | null {
  const raw = payload?.selected_palace_id ?? payload?.selectedPalaceId ?? payload?.current_palace_id ?? payload?.currentPalaceId
    ?? payload?.qimen?.selected_palace_id ?? payload?.qimen?.current_palace_id;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 && n <= 9 ? n : null;
}

function formatPalaceLine(p: any, selector: any, prefix = "•", chart?: any, systemTypeHint?: string): string {
  const reading = qimenSifuApplyChartContextGuard(p, chart, systemTypeHint);
  const door = labelThZh(p.door_name_th, p.door_zh, p.door_code, DOOR_TH);
  const star = labelThZh(p.star_name_th, p.star_zh, p.star_code, STAR_TH);
  const deity = labelThZh(normalizeQimenDeityTh(p.deity_name_th), normalizeQimenDeityZh(p.deity_zh), p.deity_code, DEITY_TH);
  const uiFlags = formatQimenUiFlags(p);
  const legacyFlags = formatPalaceLegacyFlags(p);
  const flags = uiFlags || legacyFlags;
  const levelRaw = p.display_level;
  const level = levelRaw ? qimenToneThai(levelRaw) : "ไม่ระบุ";
  return `${prefix} วัง ${p.palace_id} · ${directionLabel(p)} · ${p.trigram_zh || p.trigram_code || "-"} (${p.element_code || "?"}): ก้านฟ้า ${p.heaven_stem_zh || p.heaven_stem_code || "·"} / ก้านดิน ${p.earth_stem_zh || p.earth_stem_code || "·"} · ${door} · ${star} · ${deity}${formatStemResponse(p.stem_response)} · ${qimenSifuScoreLine(p, reading)} · ระดับระบบ ${level}${flags ? ` · สัญญาณวัง: ${flags}` : ""}${formatBeginnerReading(p, reading)}${formatYongshenPalace(selector, p)}${formatPalaceSourceFlags(p)}${formatAdvancedQimenLayers(p)}`;
}

function formatSelectedPalaceDecisionCue(p: any, selector: any, chart?: any, systemTypeHint?: string): string {
  const reading = qimenSifuApplyChartContextGuard(p, chart, systemTypeHint);
  const door = labelThZh(p?.door_name_th, p?.door_zh, p?.door_code, DOOR_TH);
  const star = labelThZh(p?.star_name_th, p?.star_zh, p?.star_code, STAR_TH);
  const deity = labelThZh(normalizeQimenDeityTh(p?.deity_name_th), normalizeQimenDeityZh(p?.deity_zh), p?.deity_code, DEITY_TH);
  const stems = `ก้านฟ้า ${p?.heaven_stem_zh || p?.heaven_stem_code || "·"} / ก้านดิน ${p?.earth_stem_zh || p?.earth_stem_code || "·"}`;
  const label = reading && typeof reading === "object"
    ? shortThZh(reading.label_th, reading.label_zh, "ต้องดูบริบท 需看局")
    : "ต้องดูบริบท 需看局";
  const reasons = reading && typeof reading === "object"
    ? formatBeginnerReasons(reading, 4)
    : "ไม่มีเหตุผลอ่านเร็วจากระบบ";
  const checkNext = reading && typeof reading === "object"
    ? formatCheckNext(reading, 3)
    : "ต้องรอข้อมูลอ่านเร็วจากระบบก่อนใช้เป็นคำแนะนำ";
  const target = selectorTargetForPalace(selector, p);
  const targetLine = target || p?.is_yongshen_target
    ? `- ธาตุที่ต้องใช้ 用神 ของคำถาม: ${packetText(target?.status_th || p?.yongshen_status_th || "วังนี้เกี่ยวกับเรื่องที่ถาม")}`
    : "";
  const stemLine = trimEvidencePrefix(formatStemResponse(p?.stem_response));
  return [
    "แนวตอบวังที่เลือก 選宮讀法:",
    `- เริ่มที่ทิศ: ${directionLabel(p)} · วัง ${p?.palace_id || "?"} · ${p?.trigram_zh || p?.trigram_code || "-"}`,
    `- สถานะวังนี้: ${label}${reading?.verdict_allowed === false || reading?.is_actionable === false ? " · อ่านประกอบเท่านั้น ไม่ใช้ฟันธง" : ""}`,
    `- หลักฐานหลัก: ${door} · ${star} · ${deity} · ${stems}`,
    `- เหตุผลระบบ: ${reasons}`,
    `- ป้ายสัญญาณ: ${formatPalaceSignalEvidence(p)}`,
    `- หลักฐานกิ่งของป้าย: ${formatPalaceBranchEvidenceSummary(p)}`,
    stemLine ? `- ก้านตอบสนอง 十干克應: ${stemLine}` : "",
    targetLine,
    `- ต้องเช็กต่อ: ${checkNext}`,
    "- กฎคำตอบ: ห้ามตอบจากคะแนนอย่างเดียว; ถ้าขาดประตู/ดาว/เทพ/ก้าน/เหตุผล ให้บอกว่าข้อมูลไม่พอจะตัดสิน",
  ].filter(Boolean).join("\n");
}

function qimenPalaceRef(value: unknown): string {
  const text = packetText(value);
  return text ? `วัง ${text}` : "วังไม่ระบุ";
}

function qimenFushiLine(chart: any, fushi: any): string {
  if (fushi) {
    return `ค่าหัวผังตาม CText: ดาวนำ 值符 ${packetText(fushi.value_star_zh || chart.chief_star_code || "-")} อยู่${qimenPalaceRef(fushi.value_star_palace_id || chart.zhi_fu_palace_id)} · ประตูนำ 值使 ${packetText(fushi.value_door_zh || chart.zhi_shi_door_code || "-")} อยู่${qimenPalaceRef(fushi.value_door_palace_id || chart.zhi_shi_palace_id)} · หัวก้าน 旬首 ${packetText(fushi.xun_leader_zh || chart.xun_hour_zh || "-")} · ใช้สูตร 值符隨干 / 值使隨支 จากข้อมูลผังจริง · แหล่งอ้างอิง ${packetText(fushi.source || "ctext")}`;
  }
  return `ค่าหัวผัง: ดาวนำ 值符 ${packetText(chart.chief_star_code || "-")} อยู่${qimenPalaceRef(chart.zhi_fu_palace_id || "?")} · ประตูนำ 值使 ${packetText(chart.zhi_shi_door_code || "-")} อยู่${qimenPalaceRef(chart.zhi_shi_palace_id || "?")}`;
}

function qimenChartAxisLine(chart: any, fushi: any): string {
  const leadStem = chart.xun_hour_zh || fushi?.xun_leader_zh || "-";
  const dunStem = chart.dun_gan_zh || fushi?.xun_yi_zh || "-";
  return `แกนผังจากระบบคำนวณ: เสายาม ${packetText(chart.pillar_zh || "-")} · หัวก้าน 旬首 ${packetText(leadStem)} · ก้านหลบ 遁干 ${packetText(dunStem)} · สายเทพ 八神 ${packetText(chart.deity_variant || "-")} · แหล่งผัง ${packetText(chart.source || chart.engine_source || "ระบบคำนวณ")}`;
}

function fmtQimenCard(q: any, selectedPalaceId?: number | null): string {
  if (!q) return "(ไม่มีผัง)";
  const chart = q.chart || {};
  const palaces = q.palaces || [];
  const stored = q.stored_formations || [];
  const compound = q.compound_formations || [];
  const sourceFormations = asPacketArray(q.source_formations);
  const selector = q.yongshen_selector || chart.yongshen_selector || null;
  const stemCoverage = q.stem_response_coverage || chart.stem_response_coverage || null;
  const beginnerCoverage = q.beginner_reading_coverage || chart.beginner_reading_coverage || null;
  const fushi = chart.ctext_fushi || null;
  const systemType = normalizeQimenSystemType(chart.system_type || chart.chart_type || q.system_type || q.chart_type);
  const systemInfo = QIMEN_SYSTEM_LABELS[systemType] || QIMEN_SYSTEM_LABELS.hour;
  const systemScope = packetText(chart.calculation_scope_th || systemInfo.scope);
  const systemCaveat = packetText(chart.source_note_th || systemInfo.caveat);
  const dmyLine = systemType === "hour"
    ? `ขอบเขตผัง: ${systemScope}`
    : `ขอบเขตผัง: ${systemScope} · ข้อควรระวัง: ${systemCaveat}${chart.dmy_engine_version ? ` · รุ่นผังใหญ่: ${packetText(chart.dmy_engine_version)}` : ""}`;

  const poleRaw = String(chart.dun_type || chart.ju_pole || "").toLowerCase();
  const pole = poleRaw === "yin" ? "陰" : "陽";
  const ju = chart.ju_number || "?";
  const fushiLine = qimenFushiLine(chart, fushi);

  const palaceLines = palaces.map((p: any) => formatPalaceLine(p, selector, "•", chart, systemType)).join("\n");
  const selectedPalace = selectedPalaceId ? palaces.find((p: any) => Number(p?.palace_id) === selectedPalaceId) : null;
  const selectedBlock = selectedPalace
    ? `วังที่ผู้ใช้เลือก 選宮:\n${formatPalaceLine(selectedPalace, selector, "→", chart, systemType)}\n${formatSelectedPalaceDecisionCue(selectedPalace, selector, chart, systemType)}\nกฎตอบเมื่อผู้ใช้ถามว่า \"วังนี้/ทิศนี้ดีไหม\": ให้เริ่มจากวังที่ผู้ใช้เลือกนี้ก่อน แล้วค่อยเทียบวังอื่นถ้าจำเป็น`
    : selectedPalaceId
      ? `วังที่ผู้ใช้เลือก 選宮: ระบบหาวังหมายเลข ${selectedPalaceId} ไม่เจอในผังนี้ ห้ามเดาแทน`
      : "วังที่ผู้ใช้เลือก 選宮: ผู้ใช้ยังไม่ได้ส่งวังที่เลือก ถ้าถามว่า “วังนี้” ให้ขอให้เลือกวังก่อน";

  const stLines = stored.map((f: any) =>
    `  - ${shortThZh(f.name_th, f.name_zh || f.formation_code, "รูปแบบพิเศษ")} (${f.scope}${f.scope_ref ? " " + f.scope_ref : ""}): ${thaiSafeText(f.note_th || f.note, "อ่านเป็นสัญญาณประกอบ")}`
  ).join("\n");
  const cpLines = compound.map((f: any) =>
    `  - ${shortThZh(f.name_th, f.name_zh || f.formation_code, "รูปแบบผสม")} · ระดับ: ${qimenToneThai(f.quality)} (${f.scope}${f.scope_ref ? " " + f.scope_ref : ""}): ${thaiSafeText(f.note_th || f.note, "อ่านเป็นสัญญาณประกอบ")}`
  ).join("\n");
  const sourceLines = sourceFormations.slice(0, 6).map(formatSourceFormation).filter(Boolean).join("\n");
  const sourceMore = sourceFormations.length > 6
    ? `\n  - … ยังมีรูปแบบจากแหล่งอ้างอิงอีก ${sourceFormations.length - 6} รายการที่ไม่ใส่ในพร้อมต์`
    : "";
  const selectorLines = selector ? [
    `ตัวเลือกธาตุที่ต้องใช้ 用神 selector: ${selector.intent?.label_th || "ไม่ระบุ"} ${selector.intent?.label_zh || ""} · ประเภทคำถาม ${selector.intent?.code || "unknown"} · ความมั่นใจ ${qimenConfidenceThai(selector.intent?.confidence)}`,
    `หลักอ่าน: ${(selector.primary_symbols || []).slice(0, 6).map((s: any) => `${s.label_th || "ตัวแทนเรื่อง"} ${s.label_zh || s.code || ""}`).join(" · ") || "ไม่ระบุ"}`,
    `วังเป้าหมาย: ${(selector.target_palaces || []).slice(0, 4).map((p: any) => `${p.direction_label_th || p.direction || "ทิศ?"} ${p.direction_label_zh || ""} วัง${p.palace_id} (${p.status_th || "อ่านประกอบ"})`).join(" · ") || "ไม่พบในผังนี้"}`,
    `ข้อจำกัด: ${selector.caveat_th || "selector ใช้เลือกวังอ่าน ไม่ใช่คะแนนฤกษ์สุดท้าย"}`,
  ].join("\n") : "ตัวเลือกธาตุที่ต้องใช้ 用神 selector: ไม่ได้ส่งมากับข้อมูลผังจากระบบ";

  return `ข้อมูลผังจากระบบคำนวณคือหลักตัดสิน ถ้าข้อมูลขาดให้ตอบว่า "ข้อมูลไม่พอ" ห้ามสร้างค่าเอง
${formatQimenCapabilities(chart)}
${formatQimenClassicalCoverage(chart)}
${formatAdvancedQimenReadiness(chart, q)}
ระบบผัง: ${systemInfo.label} · รหัสระบบ ${systemType}
${dmyLine}
สี่เสาเวลา 四柱: ${formatQimenPillars(chart)}
บริบทเวลา 時間標記: ${formatQimenTimeContext(chart)}
ผังตั้งต้น 元局: ${pole}${ju}局
${qimenChartAxisLine(chart, fushi)}
${fushiLine}
coverage คู่ก้านสิบก้านตอบสนอง 十干克應: ${stemCoverage ? `${stemCoverage.status_th || "เปิดเฉพาะรายการที่มีแหล่งอ้างอิงกำกับ"} · ครบ 81 คู่หลัก: ${stemCoverage.full_81_complete ? "ใช่" : "ไม่ใช่/ไม่ยืนยัน"}` : "ไม่มีในข้อมูลผัง"}
นโยบายอ่านเร็ว 入門: ${beginnerCoverage ? `${beginnerCoverage.version || "unknown"} · ไม่แก้คะแนนจริง: ${beginnerCoverage.no_score_mutation === true ? "ใช่" : "ไม่ยืนยัน"} · จำนวนป้าย ${JSON.stringify(beginnerCoverage.counts || {})}` : "ไม่มีในข้อมูลผัง"}
${selectedBlock}
9 วัง 九宮:
${palaceLines}
รูปแบบที่บันทึกไว้ Stored Formations:
${stLines || "  (none)"}
รูปแบบผสม Compound Formations:
${cpLines || "  (none)"}
รูปแบบจากแหล่งอ้างอิง Source Formations:
${sourceLines || "  (none)"}${sourceMore}
${selectorLines}`;
}

function fmtUserYs(ys: any): string {
  if (!ys) return "(ไม่มีดวงผู้ใช้)";
  return `โครงสร้าง: ${ys.structure_label || "-"} (${ys.engine_type || "-"})
用神: ${(ys.primary_yongshen || []).join("·")} · 喜: ${(ys.xishen || []).join("·")} · 忌: ${(ys.jishen || []).join("·")}
TiaoHou: ${ys.tiaohou_required || "-"} · 病: ${(ys.diseases || []).join(",") || "-"} · 藥: ${(ys.medicine || []).join(",") || "-"}`;
}

function fmtUserElementDistribution(ed: any): string {
  if (!ed || ed.engine_version !== "system-b-v1") {
    return "\nธาตุรวมการ์ด 06: SystemB unavailable · ห้ามใช้ legacy/voytek/element_counts ตอบเรื่องน้ำหนักธาตุ";
  }
  const pct = ed.pctDisplay || {};
  const n = (key: string) => typeof pct[key] === "number" ? Math.round(pct[key]) : null;
  const rows = [
    ["ไม้", "wood"],
    ["ไฟ", "fire"],
    ["ดิน", "earth"],
    ["ทอง", "metal"],
    ["น้ำ", "water"],
  ].map(([th, key]) => {
    const v = n(key);
    return `${th}=${v == null ? "—" : `${v}%`}`;
  }).join(" · ");
  return `\nธาตุรวมการ์ด 06 (canonical SystemB system-b-v1 · ใช้เฉพาะน้ำหนักธาตุ/กำลังตัวตน ห้ามแทน用神/喜忌): ${rows} · confidence=${ed.confidence || "-"}${Array.isArray(ed.missing_positions) && ed.missing_positions.length ? ` · ขาดเสา=${ed.missing_positions.join("/")}` : ""}`;
}

function fmtSearchResults(searchResults: any[], activity?: string): string {
  if (!searchResults || !searchResults.length) return "";
  const lines = searchResults.slice(0, 8).map((t: any, i: number) =>
    `${i+1}. ${t.datetime || `${t.date} ${t.time}`} · 宮${t.palace_id}${t.direction} · ${t.door}+${t.star}+${t.deity} · ${t.heaven_stem}/${t.earth_stem} · ${t.ju_pole==='yin'?'陰':'陽'}${t.ju_number}局 · score ${t.score}${t.matches?.length ? ` [${t.matches.slice(0,3).join(', ')}]` : ''}${t.yongshen_intent ? ` · 用神=${t.yongshen_intent}` : ''}`
  ).join("\n");
  return `\n\nผลค้นหาผัง (top ${searchResults.length}${activity ? ` · กิจกรรม=${activity}` : ''}):\n${lines}`;
}

function buildPrompt(opts: { message: string; history: Msg[]; lang: string; topic?: string; payload: any }): BuiltPrompt {
  const { payload, message, history, lang, topic } = opts;
  const qimen = qimenPayloadFromRequestPayload(payload);
  const ys = payload?.user_yongshen_v2;
  const userElementDistribution = payload?.user_element_distribution;
  const searchResults = payload?.search_results;
  const activity = payload?.activity;
  const systemType = qimenSystemTypeFromPayload(payload);
  const systemInfo = QIMEN_SYSTEM_LABELS[systemType] || QIMEN_SYSTEM_LABELS.hour;
  const systemFocus = qimen
    ? `\nระบบผังที่ผู้ใช้เลือก: ${systemInfo.label} · ${systemInfo.scope}${systemType !== "hour" ? ` · ${systemInfo.caveat}` : ""}`
    : "";
  const topicFocusText = topic && TOPIC_FOCUS[topic]
    ? (systemType !== "hour" && topic === "action"
      ? TOPIC_FOCUS[topic].replace("ชั่วยามนี้", "ช่วงนี้ตามระบบผังที่เลือก")
      : TOPIC_FOCUS[topic])
    : "";
  const topicFocus = topicFocusText ? `\nหัวข้อ: ${topicFocusText}` : "";
  const focus = `${systemFocus}${topicFocus}`;
  const histText = history.length
    ? "\n\nประวัติคำถาม:\n" + history.map(h => `[${h.role}] ${clip(String(h.content || ""), MAX_HIST_ITEM_CHARS)}`).join("\n")
    : "";
  const searchText = clip(fmtSearchResults(searchResults, activity), MAX_SEARCH_CHARS);
  const msgClipped = clip(message, MAX_MSG_CHARS);
  const know = loadQimenKnowledge({ message, topic, payload });
  const qimenText = fmtQimenCard(qimen, selectedPalaceIdFromPayload(payload));
  const sourceTraceText = know.traceItems.length
    ? know.traceItems.map(s => `- ${s.id} · ${s.reason_th} · ${s.file}:${s.line_range}`).join("\n")
    : "- none";
  const canonBlock = know.text
    ? `\nแหล่งความรู้ฉีเหมินที่อนุญาตให้ใช้ในคำตอบ (ตัดเฉพาะช่วงที่อ้างอิงได้):\n${know.text}\n\nรายการแหล่งอ้างอิงที่ใช้ได้:\n${sourceTraceText}\n— จบชุดแหล่งอ้างอิง —\n`
    : "";
  const answerGuard = `กฎบังคับคำตอบ:
1. อ่านจาก "ผังเวลา (QiMen Chart)" ก่อนเสมอ; ชุดแหล่งอ้างอิงมีไว้แปลความหมาย ไม่ใช่สร้างค่าผังใหม่
2. ถ้าข้อมูลของผังไม่มี/ไม่พอ ให้บอกว่า "ข้อมูลไม่พอจะตัดสิน" ห้ามแต่งประตู ดาว เทพ ทิศ หรือรูปแบบพิเศษ 格局 เอง
3. ตอบไทยนำจีนรอง เช่น ประตูเปิด 開門, ดาวเทียนฝู่ 天輔, เทพลิ่วเหอ 六合, ทิศตะวันออกเฉียงเหนือ 東北
4. คะแนน/ระดับเป็นน้ำหนักระบบของ Hourkey ให้พูดว่า "คะแนนระบบ" หรือ "น้ำหนักระบบ" ไม่ใช่เลขจากตำราโบราณ
5. ถ้าพูดเรื่องต่างสำนัก เช่น ผังปี/เดือน/วัน 年/月/日家, แปดเทพ 八神, การฝากวัง 寄宮, ยามห้าไม่พบ 五不遇時 ให้ใส่ข้อควรระวังว่าสายตำราอาจต่างกัน
6. ถ้าข้อมูลที่ส่งมาเป็นผังวัน 日家 / ผังเดือน 月家 / ผังปี 年家 ต้องบอกว่าเป็นภาพรวมระดับวัน/เดือน/ปี ไม่ใช่ผังยาม 時家 เฉพาะชั่วโมง และห้ามใช้คำว่า "ชั่วยามนี้" กับผังเหล่านี้
7. ถ้าใช้ BaZi ให้แยกเป็น "ตัวกรองส่วนบุคคล" ไม่ปนเป็นคำตัดสินฉีเหมินหลัก
8. สถานะอ่านเร็ว 入門 เป็นป้ายช่วยอ่านจากระบบ ไม่ใช่คะแนนฤกษ์และห้ามแก้คะแนน
9. ถ้าสถานะอ่านเร็วบอกว่าใช้เป็นตัวหลักไม่ได้ หรือไม่มีคะแนนรวมจากระบบ ห้ามแนะนำให้ใช้ทิศนั้นเป็นตัวหลัก ให้พูดว่า "อ่านเป็นบริบท/ต้องเช็กต่อ"
10. ถ้าระบบไม่ยืนยันว่าสัญญาณนั้นไม่แก้คะแนน ให้เตือนว่านโยบายคะแนนไม่ชัด ห้ามฟันธง
11. เมื่อตอบว่าทิศไหนดี/เสีย ต้องอ้างวังจริง: ทิศ + ประตู + ดาว + เทพ + ก้าน + ป้ายสัญญาณจากระบบ + เหตุผลจากระบบ และห้ามตอบจากคะแนนอย่างเดียว
12. ถ้าปฏิกิริยาก้านบอกว่ายังไม่อนุญาตให้ฟันธง หรือเป็นข้อมูลอ่านประกอบ ให้บอกว่าอ่านประกอบเท่านั้น และห้ามใช้คู่ก้านสิบก้านตอบสนอง 十干克應 เป็นคำตัดสินดีร้ายหรือบอกว่าไม่มีข้อมูล
13. ถ้าข้อมูลที่ส่งมามี "วังที่ผู้ใช้เลือก" และผู้ใช้ถามว่า "วังนี้/ทิศนี้" ให้ตอบจากวังที่ผู้ใช้เลือกก่อน ห้ามสลับไปวังอื่นโดยไม่บอกเหตุผล
14. วังดาวนำ 值符 / วังประตูนำ 值使 คือวังสำคัญที่ต้องอ่าน ไม่ใช่วังดีอัตโนมัติ; ถ้าคะแนนหรือป้ายสัญญาณขึ้นระวัง ให้ตอบตามข้อมูลผังจริง
15. ถ้าพูดถึง ช่องว่าง 空亡, ม้าเดินทาง 驛馬, คนช่วย 貴人, วัน/ยามปะทะ 日時沖, 28 ดาวฤกษ์ 二十八宿 ให้ใช้เฉพาะบรรทัด "บริบทเวลา 時間標記" จากข้อมูลผังจริง ห้ามคำนวณเพิ่มเอง
16. ป้ายช่วยอ่านจากระบบเป็นข้อมูลประกอบเท่านั้น ห้ามแปลงเป็นคะแนน ห้ามคำนวณเพิ่ม ถ้าข้อมูลส่วนนี้ไม่มีให้ตอบว่าข้อมูลไม่พอ
17. "ความพร้อมตัวตรวจสูตรลึก 格局/四害" คือรายการที่ระบบตรวจเป็น ไม่ใช่ผลที่เกิดจริงในผังนั้น ถ้าจะกล่าวว่าสูตรใดเกิด ต้องเห็นสูตรนั้นในป้ายสัญญาณ/รูปแบบที่ติดจริงในวัง
18. ห้ามใช้คำฟันธงเกินข้อมูล เช่น ดีแน่นอน, ชนะ, ใช้แล้วสำเร็จ, ไม่มีปัญหา
19. ถ้าผังวัน/เดือน/ปีถูกส่งมาแบบอ่านประกอบเท่านั้น ให้ตอบว่าเป็นภาพรวม/บริบท ต้องเช็กผังยาม 時家 ก่อนลงมือ ห้ามสรุปว่าเหมาะหรือใช้ได้จากคะแนนช่วยจัดลำดับ
20. ท้ายคำตอบสั้นๆ ใส่ "อ้างอิง:" แล้วระบุรหัสแหล่งอ้างอิงที่ใช้ 1-3 ตัวจากรายการแหล่งอ้างอิง`;
  const body = `\n${LANG_INSTR[lang] || LANG_INSTR.th}\n${answerGuard}\nผังเวลา (QiMen Chart):\n${qimenText}\n${canonBlock}\nดวงเกิดผู้ใช้ (BaZi v2):\n${fmtUserYs(ys)}${fmtUserElementDistribution(userElementDistribution)}${searchText}${focus}${histText}\n\nคำถาม: ${msgClipped}\n`;
  return {
    prompt: loadPromptMd("prompts/qimen-sifu.md", QIMEN_TPL_FALLBACK).replace("{{BODY}}", body),
    knowledgeVersion: know.version,
    sourceTrace: know.trace,
    sourceTraceItems: know.traceItems,
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

    /* 📜 เครดิต: เช็คยามก่อนเรียก Claude · หักตามจำนวนตัวอักษรคำตอบหลังได้คำตอบ (char-based ÷30) · 29 มิ.ย. */
    const { getHourBalance, spendHoursByChars } = await import("@/lib/spend-hours");
    if ((await getHourBalance()) <= 0) {
      return NextResponse.json({ ok: false, error: "insufficient_hours" }, { status: 402 });
    }

    const built = buildPrompt({ message, history, lang, topic, payload });
    _inflight++;
    let reply: string;
    try {
      reply = await runClaudeCli(built.prompt);
    } finally {
      _inflight--;
    }
    /* หักยามตามจำนวนตัวอักษรคำตอบ */
    const spend = await spendHoursByChars(reply.length, "sifu_qimen");
    const spent = spend.ok ? spend.spent : 0;
    const balanceAfter = spend.ok ? spend.balance_after : 0;
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
          system_type: payload.qimen.chart.system_type || payload.qimen.chart.chart_type || null,
          calculation_scope_th: payload.qimen.chart.calculation_scope_th || null,
          dmy_engine_version: payload.qimen.chart.dmy_engine_version || null,
          pillar_zh: payload.qimen.chart.pillar_zh,
          ju_pole: payload.qimen.chart.ju_pole,
          dun_type: payload.qimen.chart.dun_type,
          ju_number: payload.qimen.chart.ju_number,
        } : null,
        search_count: Array.isArray(payload?.search_results) ? payload.search_results.length : 0,
      },
      responseMeta: {
        chars: reply.length,
        qimen_source_version: built.knowledgeVersion,
        qimen_source_trace: built.sourceTrace,
        qimen_source_trace_items: built.sourceTraceItems,
      },
      model: "claude-max-cli",
      spent,
      balanceAfter,
      durationMs: Date.now() - reqT0,
    });
    return NextResponse.json({
      reply,
      model: "claude-max-cli",
      balance_after: balanceAfter,
      spent,
      qimen_source_version: built.knowledgeVersion,
      qimen_source_trace: built.sourceTrace,
      qimen_source_trace_items: built.sourceTraceItems,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
