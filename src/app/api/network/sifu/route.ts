/**
 * POST /api/network/sifu — AI sifu สำหรับ pair / team analysis
 *
 * รับ:  { mode: 'pair'|'team', message, history, lang, payload }
 *   payload (pair): { self, other, scores, tags, yongshen_v2 }
 *   payload (team): { self, members[], yongshen_v2_map }
 *
 * Layer 3 · ใช้ sudo claude CLI · ไม่กระทบ /api/sifu (LOCKED)
 * อากง 15 พ.ค. 2026
 */
import { NextResponse } from "next/server";
import { spawn } from "child_process";

const CHILD_USER = "jarvis";
const TIMEOUT_MS = 60_000;

type Msg = { role: "user" | "assistant"; content: string };

const LANG_INSTR: Record<string, string> = {
  th: "ตอบเป็นภาษาไทย · กระชับ · markdown bold/list/emoji · ตำราคลาสสิก 子平真詮·淵海子平·三命通會",
  en: "Reply in English · concise · markdown bold/list/emoji · classical BaZi sources",
  zh: "用简体中文回答 · 简洁直接 · markdown · 子平真詮·淵海子平·三命通會",
};

const PAIR_FOCUS: Record<string, string> = {
  overview: "ภาพรวมความสัมพันธ์ · ดี · ระวัง · แนะนำ",
  work:     "ร่วมงาน · บทบาท · แบ่งหน้าที่ · ความเสี่ยง",
  love:     "ความรัก/คู่ครอง · ความเข้ากัน · จุดต้องเข้าใจ",
  friend:   "เพื่อน · ระยะห่าง · เวลาที่หนุนกัน",
  family:   "ครอบครัว · พ่อแม่ลูก · พี่น้อง · พลวัตใน家",
  business: "หุ้นส่วน · ธุรกิจ · ตัวเลข · เวลาทำงานร่วม",
};

const TEAM_FOCUS = "ภาพรวมทีม · จุดแข็ง · จุดอ่อน · ใครเสริมใคร · ใครต้องระวัง · ธาตุที่ขาด";

function fmtPersonCard(p: any, ys: any): string {
  if (!p) return "—";
  const pl = p.pillars || p;
  const pillarStr = pl?.day?.stem
    ? `${pl.year?.stem || ""}${pl.year?.branch || ""}·${pl.month?.stem || ""}${pl.month?.branch || ""}·${pl.day.stem}${pl.day.branch || ""}·${pl.hour?.stem || ""}${pl.hour?.branch || ""}`
    : "—";
  const ysLine = ys
    ? `${ys.structure_label || "?"} (${ys.engine_type || "?"}) · 用神=${(ys.primary_yongshen||[]).join("·")} · 喜=${(ys.xishen||[]).join("·")} · 忌=${(ys.jishen||[]).join("·")}${ys.diseases?.length ? " · 病:"+ys.diseases.join(",") : ""}${ys.medicine?.length ? " · 藥:"+ys.medicine.join(",") : ""}`
    : "(no v2)";
  return `${p.name || p.id || "—"} · ${pillarStr} · ${ysLine}`;
}

function buildPairPrompt(opts: {
  message: string; history: Msg[]; lang: string; topic?: string; payload: any;
}): string {
  const { payload, message, history, lang, topic } = opts;
  const self = payload?.self;
  const other = payload?.other;
  const selfYs = payload?.yongshen_v2?.self;
  const otherYs = payload?.yongshen_v2?.other;
  const scores = payload?.scores || {};
  const tags = payload?.tags || [];
  const focus = topic && PAIR_FOCUS[topic] ? `\nหัวข้อ: ${PAIR_FOCUS[topic]}` : "";

  const histText = history.length
    ? "\n\nประวัติคำถาม:\n" + history.map(h => `[${h.role}] ${h.content}`).join("\n")
    : "";

  return `คุณคือซินแสปาจื้อ · กำลังวิเคราะห์ความสัมพันธ์ระหว่าง 2 คน · ตำรา子平真詮·三命通會

${LANG_INSTR[lang] || LANG_INSTR.th}

ข้อมูลคู่นี้:
• A: ${fmtPersonCard(self, selfYs)}
• B: ${fmtPersonCard(other, otherYs)}

คะแนน (A→B): day=${scores.day ?? "?"} · week=${scores.week ?? "?"} · month=${scores.month ?? "?"} · year=${scores.year ?? "?"} · luck=${scores.luck ?? "?"} · overall=${scores.overall ?? "?"}
Tags: ${tags.join(", ") || "—"}${focus}${histText}

คำถาม: ${message}

ตอบสั้นกระชับ · เน้นหลักตำรา · อย่าโฆษณา · ตรงประเด็น:`;
}

function buildTeamPrompt(opts: {
  message: string; history: Msg[]; lang: string; payload: any;
}): string {
  const { payload, message, history, lang } = opts;
  const self = payload?.self;
  const members = payload?.members || [];
  const ysMap = payload?.yongshen_v2_map || {};

  const selfLine = fmtPersonCard(self, ysMap[self?.id || "self"]);
  const memberLines = members.slice(0, 30).map((m: any) =>
    `• ${fmtPersonCard(m, ysMap[m.id])}`).join("\n");

  const histText = history.length
    ? "\n\nประวัติคำถาม:\n" + history.map(h => `[${h.role}] ${h.content}`).join("\n")
    : "";

  return `คุณคือซินแสปาจื้อ · กำลังวิเคราะห์ภาพรวมทีม/ครอบครัว/เครือข่ายของลูกค้า

${LANG_INSTR[lang] || LANG_INSTR.th}

ศูนย์กลาง (ลูกค้า):
${selfLine}

สมาชิก (${members.length} คน):
${memberLines || "—"}

หัวข้อ: ${TEAM_FOCUS}${histText}

คำถาม: ${message}

ตอบ:`;
}

async function runClaudeCli(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const claudeArgs = [
      "-p",
      "--output-format", "text",
      "--dangerously-skip-permissions",
      "--setting-sources", "project",
    ];
    const spawnArgs = ["-u", CHILD_USER, "-H", "claude", ...claudeArgs];
    const c = spawn("sudo", spawnArgs, { cwd: "/var/www/checklist-app", env: process.env });
    let out = "", err = "";
    const timer = setTimeout(() => { try { c.kill("SIGKILL"); } catch {} reject(new Error("timeout")); }, TIMEOUT_MS);
    c.stdout.on("data", chunk => { out += chunk.toString(); });
    c.stderr.on("data", chunk => { err += chunk.toString(); });
    c.on("close", code => {
      clearTimeout(timer);
      if (code === 0) resolve(out.trim());
      else reject(new Error(`claude exit ${code} · ${err.slice(0, 300)}`));
    });
    c.stdin.write(prompt);
    c.stdin.end();
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const mode = (body.mode === "team" ? "team" : "pair") as "pair" | "team";
    const message: string = (body.message || "").trim();
    const history: Msg[] = Array.isArray(body.history) ? body.history.slice(-6) : [];
    const lang: string = ["th", "en", "zh"].includes(body.lang) ? body.lang : "th";
    const topic: string | undefined = body.topic;
    const payload = body.payload || {};

    if (!message) return NextResponse.json({ error: "message required" }, { status: 400 });

    /* 📜 spend 5 時 (pair) / 15 時 (team) · 15 พ.ค. */
    const { spendHours } = await import("@/lib/spend-hours");
    const cost = mode === "team" ? 15 : 5;
    const spend = await spendHours(cost, `sifu_network_${mode}`);
    if (!spend.ok) return NextResponse.json(spend, { status: spend.status });

    const prompt = mode === "team"
      ? buildTeamPrompt({ message, history, lang, payload })
      : buildPairPrompt({ message, history, lang, topic, payload });

    const reply = await runClaudeCli(prompt);
    return NextResponse.json({ reply, mode, model: "claude-max-cli", balance_after: spend.balance_after, spent: spend.spent });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
