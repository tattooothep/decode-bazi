/**
 * POST /api/qimen/sifu — AI sifu สำหรับฉีเหมิน · ใช้ผัง 9 วัง + ดวงผู้ใช้
 *
 * รับ: { message, history, lang, topic, payload: { qimen, user_yongshen_v2 } }
 * 15 พ.ค. 2026 · standalone จาก /api/sifu (LOCKED)
 */
import { NextResponse } from "next/server";
import { spawn } from "child_process";
import { loadPromptMd } from "@/lib/prompt-md";

/* 25 พ.ค. · persona ย้ายไป prompts/qimen-sifu.md (แก้ผ่าน /admin/sifu-prompts) · {{BODY}}=dynamic · fallback กันพัง */
const QIMEN_TPL_FALLBACK = `คุณคือซินแสฉีเหมินตุ้นเจี่ย · ตำรา 煙波釣叟賦·奇門遁甲統宗\n{{BODY}}\nตอบสั้นกระชับ · เน้นตำรา · ใช้ผังจริง + ดวงผู้ใช้ + ผลค้นหาผสมกัน · เลี่ยงคำว่าโชค/ฟลุค:`;

const CHILD_USER = "jarvis";
const TIMEOUT_MS = 60_000;

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

  const pole = chart.ju_pole === "YIN" ? "陰" : "陽";
  const ju = chart.ju_number || "?";

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
    ? "\n\nประวัติคำถาม:\n" + history.map(h => `[${h.role}] ${h.content}`).join("\n")
    : "";
  const searchText = fmtSearchResults(searchResults, activity);
  const body = `\n${LANG_INSTR[lang] || LANG_INSTR.th}\n\nผังเวลา (QiMen Chart):\n${fmtQimenCard(qimen)}\n\nดวงเกิดผู้ใช้ (BaZi v2):\n${fmtUserYs(ys)}${searchText}${focus}${histText}\n\nคำถาม: ${message}\n`;
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

    /* 📜 spend 8 時 ก่อนเรียก Claude · 15 พ.ค. */
    const { spendHours } = await import("@/lib/spend-hours");
    const spend = await spendHours(8, "sifu_qimen");
    if (!spend.ok) return NextResponse.json(spend, { status: spend.status });

    const prompt = buildPrompt({ message, history, lang, topic, payload });
    const reply = await runClaudeCli(prompt);
    return NextResponse.json({ reply, model: "claude-max-cli", balance_after: spend.balance_after, spent: spend.spent });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
