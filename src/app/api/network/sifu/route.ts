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
import { loadPromptMd } from "@/lib/prompt-md";
import { getSession } from "@/lib/auth";
import { logResearchAiMessageSafe } from "@/lib/research-log";

/* 25 พ.ค. · persona ย้ายไป md (แก้ผ่าน /admin/sifu-prompts) · {{BODY}} = ส่วน dynamic · fallback กันพัง */
const PAIR_TPL_FALLBACK = `คุณคือซินแสปาจื้อ · กำลังวิเคราะห์ความสัมพันธ์ระหว่าง 2 คน · ตำรา子平真詮·三命通會\n{{BODY}}\nตอบสั้นกระชับ · เน้นหลักตำรา · อย่าโฆษณา · ตรงประเด็น:`;
const TEAM_TPL_FALLBACK = `คุณคือซินแสปาจื้อ · กำลังวิเคราะห์ภาพรวมทีม/ครอบครัว/เครือข่ายของลูกค้า\n{{BODY}}\nตอบโดยยึด "ทีมที่เลือก" และ "กิจกรรม" เป็นหลัก · ถ้าต้องเสนอคนเพิ่ม ค่อยดูจากสมาชิกทั้งหมด · ให้บอกบทบาท ใครตัดสินใจ ใครเป็น challenger ใครควรถือรายละเอียด และจุดที่ต้องคุม:`;

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

  const body = `\n${LANG_INSTR[lang] || LANG_INSTR.th}\n\nข้อมูลคู่นี้:\n• A: ${fmtPersonCard(self, selfYs)}\n• B: ${fmtPersonCard(other, otherYs)}\n\nคะแนน (A→B): day=${scores.day ?? "?"} · week=${scores.week ?? "?"} · month=${scores.month ?? "?"} · year=${scores.year ?? "?"} · luck=${scores.luck ?? "?"} · overall=${scores.overall ?? "?"}\nTags: ${tags.join(", ") || "—"}${focus}${histText}\n\nคำถาม: ${message}\n`;
  return loadPromptMd("prompts/network-sifu-pair.md", PAIR_TPL_FALLBACK).replace("{{BODY}}", body);
}

function buildTeamPrompt(opts: {
  message: string; history: Msg[]; lang: string; payload: any;
}): string {
  const { payload, message, history, lang } = opts;
  const self = payload?.self;
  const members = payload?.members || [];
  const selectedTeam = Array.isArray(payload?.selected_team) ? payload.selected_team : [];
  const activity = payload?.activity || null;
  const centerId = payload?.team_center || self?.id || "self";
  const ysMap = payload?.yongshen_v2_map || {};

  const selfLine = fmtPersonCard(self, ysMap[self?.id || "self"]);
  const memberLines = members.slice(0, 30).map((m: any) =>
    `• ${fmtPersonCard(m, ysMap[m.id])}`).join("\n");
  const selectedLines = selectedTeam.slice(0, 30).map((m: any) =>
    `• ${m.id === centerId ? "[CENTER] " : ""}${fmtPersonCard(m, ysMap[m.id])}${m.role ? ` · role=${m.role}` : ""}${m.elem ? ` · element=${m.elem}` : ""}${m.glyph ? ` · DM=${m.glyph}` : ""}`).join("\n");
  const activityLines = activity ? [
    `กิจกรรม: ${activity.label || activity.id || "—"} · priority=${activity.priority || "balanced"}`,
    activity.summary ? `ภาพรวมกิจกรรม: ${activity.summary}` : "",
    Array.isArray(activity.required) && activity.required.length
      ? `ธาตุหลักที่กิจกรรมต้องใช้: ${activity.required.map((x: any) => x.label || x.element).join(" · ")}`
      : "",
    Array.isArray(activity.support) && activity.support.length
      ? `ธาตุเสริม: ${activity.support.map((x: any) => x.label || x.element).join(" · ")}`
      : "",
    Array.isArray(activity.roles) && activity.roles.length
      ? "บทบาทตามกิจกรรม:\n" + activity.roles.map((r: any) => `• ${r.label || "role"} · ${(r.elements || []).join("/") || "—"} · ${r.text || ""}`).join("\n")
      : "",
    Array.isArray(activity.manual) && activity.manual.length
      ? "Operating manual:\n" + activity.manual.map((m: string) => `• ${m}`).join("\n")
      : "",
  ].filter(Boolean).join("\n") : "";

  const histText = history.length
    ? "\n\nประวัติคำถาม:\n" + history.map(h => `[${h.role}] ${h.content}`).join("\n")
    : "";

  const body = `\n${LANG_INSTR[lang] || LANG_INSTR.th}\n\nศูนย์กลาง (ลูกค้า):\n${selfLine}\n\nทีมที่เลือกใน Team Builder (${selectedTeam.length || 0} คน):\n${selectedLines || "—"}\n\n${activityLines ? activityLines + "\n" : ""}\n\nสมาชิก (${members.length} คน):\n${memberLines || "—"}\n\nหัวข้อ: ${TEAM_FOCUS}${histText}\n\nคำถาม: ${message}\n`;
  return loadPromptMd("prompts/network-sifu-team.md", TEAM_TPL_FALLBACK).replace("{{BODY}}", body);
}

async function runClaudeCli(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const claudeArgs = [
      "-p",
      "--output-format", "text",
      "--dangerously-skip-permissions",
      "--setting-sources", "user",
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

function spawnClaudeStreaming(prompt: string) {
  const claudeArgs = [
    "-p",
    "--output-format", "stream-json",
    "--include-partial-messages",
    "--verbose",
    "--dangerously-skip-permissions",
    "--setting-sources", "user",
  ];
  const spawnArgs = ["-u", CHILD_USER, "-H", "claude", ...claudeArgs];
  const c = spawn("sudo", spawnArgs, { cwd: "/var/www/checklist-app", env: process.env });
  c.stdin.write(prompt);
  c.stdin.end();
  return c;
}

function makeJsonlParser(onText: (text: string) => void) {
  let buf = "";
  return (chunk: Buffer) => {
    buf += chunk.toString();
    let nl;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        const obj = JSON.parse(line);
        if (obj.type === "stream_event" && obj.event?.type === "content_block_delta" && obj.event.delta?.type === "text_delta") {
          onText(obj.event.delta.text);
        }
      } catch {
        /* Claude stream-json may include non-json diagnostics; ignore. */
      }
    }
  };
}

export async function POST(req: Request) {
  /* 1 มิ.ย. · AI เครือข่ายต้องสมัคร/login ก่อน (เจ้านายสั่ง · defense-in-depth เสริม spendHours) */
  const session = await getSession();
  if (!session) return new Response(JSON.stringify({ error: "not logged in" }), { status: 401, headers: { "Content-Type": "application/json" } });
  try {
    const reqT0 = Date.now();
    const body = await req.json().catch(() => ({}));
    const mode = (body.mode === "team" ? "team" : "pair") as "pair" | "team";
    const message: string = (body.message || "").trim();
    const history: Msg[] = Array.isArray(body.history) ? body.history.slice(-6) : [];
    const lang: string = ["th", "en", "zh"].includes(body.lang) ? body.lang : "th";
    const topic: string | undefined = body.topic;
    const payload = body.payload || {};

    if (!message) return NextResponse.json({ error: "message required" }, { status: 400 });

    /* 📜 เครดิต: เช็คยามก่อน · หักตามจำนวนตัวอักษรคำตอบหลังได้คำตอบ (char-based ÷30) · 29 มิ.ย. */
    const { reserveHourForUser, drainHoursByCharsForUser } = await import("@/lib/spend-hours");
    if (session?.userId) {
      const rsv = await reserveHourForUser(session.userId, `sifu_network_${mode}`);
      if (!rsv.ok) return NextResponse.json({ error: "insufficient_hours" }, { status: 402 });
    }

    const prompt = mode === "team"
      ? buildTeamPrompt({ message, history, lang, payload })
      : buildPairPrompt({ message, history, lang, topic, payload });
    const profileId = mode === "team"
      ? (payload?.team_center || payload?.self?.id || null)
      : (payload?.self?.id || null);

    const wantsStream = (req.headers.get("accept") || "").includes("text/event-stream") || body.stream === true;
    if (wantsStream) {
      const encoder = new TextEncoder();
      let activeChild: ReturnType<typeof spawnClaudeStreaming> | null = null;
      const stream = new ReadableStream({
        start(controller) {
          let closed = false;
          let full = "";
          let firstChunkSent = false;
          const t0 = Date.now();
          const safeClose = () => {
            if (closed) return;
            closed = true;
            try { controller.close(); } catch {}
          };
          const send = (event: string, data: unknown) => {
            if (closed) return;
            try {
              controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
            } catch {
              closed = true;
            }
          };

          send("meta", { mode, lang, startedAt: t0 });
          const child = spawnClaudeStreaming(prompt);
          activeChild = child;
          const timer = setTimeout(() => {
            try { child.kill("SIGKILL"); } catch {}
            send("error", { error: "timeout" });
            safeClose();
          }, TIMEOUT_MS);

          const parser = makeJsonlParser((text) => {
            full += text;
            if (!firstChunkSent) {
              firstChunkSent = true;
              send("first", { ms: Date.now() - t0, model: "claude-max-cli" });
            }
            send("chunk", { text });
          });
          child.stdout.on("data", parser);
          child.stderr.on("data", (chunk: Buffer) => {
            console.warn("[network/sifu stream stderr]", chunk.toString().slice(0, 200));
          });
          child.on("close", (code) => {
            activeChild = null;
            clearTimeout(timer);
            const ms = Date.now() - t0;
            if (code === 0 && full.trim()) {
              if (session?.userId) drainHoursByCharsForUser(session.userId, full.length, `sifu_network_${mode}`).catch(() => {}); // หักยามตามตัวอักษร (stream · drain)
              logResearchAiMessageSafe({
                session,
                req,
                feature: "network_sifu",
                mode,
                topic,
                lang,
                profileId,
                question: message,
                answer: full.trim(),
                history,
                requestPayload: { mode, topic, payload },
                responseMeta: { stream: true, chars: full.length },
                model: "claude-max-cli",
                durationMs: Date.now() - reqT0,
              });
              send("done", { ms, mode, model: "claude-max-cli", chars: full.length, cached: false });
            } else {
              send("error", { error: `claude exit ${code}`, ms });
            }
            safeClose();
          });
        },
        cancel() {
          try { activeChild?.kill("SIGKILL"); } catch {}
          activeChild = null;
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
        },
      });
    }

    const reply = await runClaudeCli(prompt);
    const sp = await drainHoursByCharsForUser(session?.userId || "", reply.length, `sifu_network_${mode}`);
    const spent = sp.spent;
    const balanceAfter = sp.balance_after;
    logResearchAiMessageSafe({
      session,
      req,
      feature: "network_sifu",
      mode,
      topic,
      lang,
      profileId,
      question: message,
      answer: reply,
      history,
      requestPayload: { mode, topic, payload },
      responseMeta: { stream: false, chars: reply.length },
      model: "claude-max-cli",
      spent,
      balanceAfter,
      durationMs: Date.now() - reqT0,
    });
    return NextResponse.json({ reply, mode, model: "claude-max-cli", balance_after: balanceAfter, spent });
  } catch (e: any) {
    console.error("[network/sifu]", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
