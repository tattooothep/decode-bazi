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

/* 25 พ.ค. · persona ย้ายไป prompts/qimen-sifu.md (แก้ผ่าน /admin/sifu-prompts) · {{BODY}}=dynamic · fallback กันพัง */
const QIMEN_TPL_FALLBACK = `คุณคือซินแสฉีเหมินตุ้นเจี่ย · ตำรา 煙波釣叟賦·奇門遁甲統宗\n{{BODY}}\nตอบสั้นกระชับ · เน้นตำรา · ใช้ผังจริง + ดวงผู้ใช้ + ผลค้นหาผสมกัน · เลี่ยงคำว่าโชค/ฟลุค:`;

/* 1 มิ.ย. · เสียบคัมภีร์ฉีเหมินต้นฉบับเข้า prompt (เหมือน loadEngineKnowledge ของปาจื้อ)
 * เดิม AI เห็นแค่ "ชื่อ"ตำรา 2 บรรทัด · ตอนนี้ป้อนเนื้อจีน verbatim 3 เล่ม → ตีความอิงตำราจริง
 * cache ตาม mtime · ไฟล์หาย = ข้ามเล่มนั้น (กันพัง) · ห้ามลด/เจือจาง (กฎ ai_quality) */
const QMDJ_DIR = join(process.cwd(), "data/library/qmdj");
const QMDJ_FILES = [
  "yanbo-diaosou-ge.md",     // 煙波釣叟歌 · กลอนแม่บท (สำคัญสุด)
  "qimen-tongzong-clean.md", // 奇門遁甲統宗 · แก่นเต็ม
  "dunjia-yanyi-juan2.md",   // 遁甲演義 卷2
];
let _qimenKnow: { text: string; version: string } | null = null;
let _qimenSig = "";
function loadQimenKnowledge(): { text: string; version: string } {
  /* signature ครบทุกไฟล์ (name:mtime:size) → จับเพิ่ม/ลบ/แก้ทุกเล่ม ไม่ใช่แค่ mtime สูงสุด (พ่อ flag #1)
   * statSync เบา → ถ้า signature เดิม คืน cache ไม่อ่านเนื้อ 62KB ซ้ำ (scale 5000 user) */
  const present: string[] = [];
  const sigParts: string[] = [];
  for (const f of QMDJ_FILES) {
    try {
      const st = statSync(join(QMDJ_DIR, f));
      present.push(f);
      sigParts.push(`${f}:${Math.round(st.mtimeMs)}:${st.size}`);
    } catch {
      /* ไฟล์หาย = ข้ามเล่มนั้น · ไม่ทำ request ล้ม */
    }
  }
  if (!present.length) return { text: "", version: "none" };
  const sig = sigParts.join("|");
  if (_qimenKnow && sig === _qimenSig) return _qimenKnow;
  /* cache miss (ครั้งแรก/ไฟล์เปลี่ยน) เท่านั้น ถึงอ่านเนื้อจริง */
  const parts: string[] = [];
  for (const f of present) {
    try {
      parts.push(`\n===== คัมภีร์ต้นฉบับ: ${f} =====\n${readFileSync(join(QMDJ_DIR, f), "utf8")}`);
    } catch {
      /* แข่งกับการลบไฟล์ระหว่าง stat→read · ข้ามเล่ม */
    }
  }
  if (!parts.length) return { text: "", version: "none" };
  _qimenSig = sig;
  _qimenKnow = { text: parts.join("\n"), version: `qmdj-${parts.length}` };
  return _qimenKnow;
}

const CHILD_USER = "jarvis";
/* 1 มิ.ย. · 60→180 วิ · prompt โตขึ้น +คัมภีร์ ~50K token · qimen เรียกแบบ blocking (รอครบก้อน) กันชน timeout */
const TIMEOUT_MS = 180_000;

/* 1 มิ.ย. · พ่อ flag #2 · cap เฉพาะ "ส่วนผันแปร" (input ผู้ใช้) กัน prompt บวมเกินคาด · คัมภีร์คงเต็ม (กฎ ai_quality) */
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

const LANG_INSTR: Record<string, string> = {
  th: "ตอบเป็นภาษาไทย · กระชับ · markdown bold/list/emoji · ตำราคลาสสิก 煙波釣叟賦·奇門遁甲統宗",
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

  const pole = chart.ju_pole === "YIN" ? "陰" : "陽";
  const ju = chart.ju_number || "?";
  const fushiLine = fushi
    ? `ค่าหัวผังตาม CText: 值符星=${fushi.value_star_zh || chart.chief_star_code}@宮${fushi.value_star_palace_id || chart.zhi_fu_palace_id} · 值使門=${fushi.value_door_zh || chart.zhi_shi_door_code}@宮${fushi.value_door_palace_id || chart.zhi_shi_palace_id} · 旬首=${fushi.xun_leader_zh || chart.xun_hour_zh} · source=${fushi.source || "ctext"}`
    : `ค่าหัวผัง: 值符=${chart.chief_star_code || "-"}@宮${chart.zhi_fu_palace_id || "?"} · 值使=${chart.zhi_shi_door_code || "-"}@宮${chart.zhi_shi_palace_id || "?"}`;

  const palaceLines = palaces.map((p: any) =>
    `• 宮${p.palace_id} ${p.direction}/${p.trigram_code} (${p.element_code}): 天${p.heaven_stem_code || "·"}/地${p.earth_stem_code || "·"} · 星${p.star_code} · 門${p.door_code} · 神${p.deity_code || "·"}`
  ).join("\n");

  const stLines = stored.map((f: any) =>
    `  - ${f.name_zh || f.formation_code} (${f.scope}${f.scope_ref ? " " + f.scope_ref : ""}): ${f.note || ""}`
  ).join("\n");
  const cpLines = compound.map((f: any) =>
    `  - ${f.name_zh || f.formation_code} [${f.quality || "?"}] (${f.scope}${f.scope_ref ? " " + f.scope_ref : ""}): ${f.note || ""}`
  ).join("\n");

  return `Yuan-Ju: ${pole}${ju}局
時柱: ${chart.pillar_zh || "-"} · 旬首: ${chart.xun_hour_zh || fushi?.xun_leader_zh || "-"} · 遁干: ${chart.dun_gan_zh || "-"} · 八神派別: ${chart.deity_variant || "-"}
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

function buildPrompt(opts: { message: string; history: Msg[]; lang: string; topic?: string; payload: any }): string {
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
  const know = loadQimenKnowledge();
  const canonBlock = know.text
    ? `\n📜 คัมภีร์ต้นฉบับฉีเหมิน (ใช้เป็นฐานการตีความ · อ้างวรรค/หลักจากตำราจริง · ห้ามมั่วนอกตำรา):\n${know.text}\n\n— จบคัมภีร์ —\n`
    : "";
  const body = `\n${LANG_INSTR[lang] || LANG_INSTR.th}\n${canonBlock}\nผังเวลา (QiMen Chart):\n${fmtQimenCard(qimen)}\n\nดวงเกิดผู้ใช้ (BaZi v2):\n${fmtUserYs(ys)}${searchText}${focus}${histText}\n\nคำถาม: ${msgClipped}\n`;
  return loadPromptMd("prompts/qimen-sifu.md", QIMEN_TPL_FALLBACK).replace("{{BODY}}", body);
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
  try {
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

    const prompt = buildPrompt({ message, history, lang, topic, payload });
    _inflight++;
    let reply: string;
    try {
      reply = await runClaudeCli(prompt);
    } finally {
      _inflight--;
    }
    return NextResponse.json({ reply, model: "claude-max-cli", balance_after: spend.balance_after, spent: spend.spent });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
