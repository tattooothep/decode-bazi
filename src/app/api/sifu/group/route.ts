/**
 * POST /api/sifu/group · ซินแสอ่านดวงกลุ่ม (group mode · หลายคนพร้อมกัน)
 *
 * 🆕 Endpoint ใหม่ (26 พ.ค. 2026) · ไฟล์เดียว · ไม่แตะไฟล์ LOCKED ใดทั้งสิ้น
 *    - reuse engine read-only ผ่าน import เท่านั้น (calcBazi · buildChartExtensions ·
 *      buildStructuredChartPacket/renderChartPrompt/validateChartPacket · loadPromptMd/loadPromptKV ·
 *      getSession · q1/q)
 *    - buildBaziContext ใน /api/sifu/route.ts ไม่ได้ export → จึง replicate logic ต่อคน
 *      เป็น helper local (buildPersonContext) ให้เป๊ะกับต้นฉบับ (gender charAt(0)==="f" ·
 *      time.slice(0,5) · 3p mode · computeStartAge · packet · render)
 *
 * รับ body: { profileIds: string[], groupLabel?: string, message: string,
 *             history?: [{role,content}], lang?: 'th'|'en'|'zh', stream?: boolean }
 * คืน: SSE (event meta/first/chunk/done/error) เมื่อ Accept: text/event-stream หรือ stream===true
 *      มิฉะนั้น JSON { reply, model }
 *
 * 💰 POC group mode · ฟรีตามเจ้านายสั่ง 26 พ.ค. · cap 10 + org guard + login กัน abuse แทน cost
 *    (ไม่เรียก spendHours)
 *
 * 🌊 SSE pattern ยกจาก POST /api/sifu เป๊ะ · ห้ามใส่ AbortController / idle-timeout / reader.cancel
 *    (มีบทเรียนว่าทำ stream พัง)
 */
import { NextResponse } from "next/server";
import { spawn } from "child_process";
import { readFileSync, statSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import { q } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { calcBazi } from "@/lib/bazi-calc";
import { buildChartExtensions } from "@/lib/chart-extensions";
import { loadPromptMd, loadPromptSections, loadPromptKV } from "@/lib/prompt-md";
import { buildStructuredChartPacket, renderChartPrompt, validateChartPacket } from "@/lib/chart-packet";

export const runtime = "nodejs"; // child_process spawn (เหมือน /api/sifu)

type Msg = { role: "user" | "assistant"; content: string };

const TIMEOUT_MS = 600_000; // เท่ากับ /api/sifu · ตำราคลาสสิก + หลายคน = prompt ยาว
const CHILD_USER = "jarvis";
const MAX_GROUP = 10; // cap กัน abuse/token

/* ── maps · copy จาก /api/sifu/route.ts (read-only constant) ── */
const STEM_ELEMENT_MAP: Record<string, string> = {
  甲: "wood", 乙: "wood", 丙: "fire", 丁: "fire", 戊: "earth", 己: "earth",
  庚: "metal", 辛: "metal", 壬: "water", 癸: "water",
};
const STEM_POLARITY_MAP: Record<string, "yang" | "yin"> = {
  甲: "yang", 乙: "yin", 丙: "yang", 丁: "yin", 戊: "yang", 己: "yin",
  庚: "yang", 辛: "yin", 壬: "yang", 癸: "yin",
};
const DM_LABEL_TH: Record<string, string> = {
  wood: "ไม้", fire: "ไฟ", earth: "ดิน", metal: "ทอง", water: "น้ำ",
};
const DM_POLARITY_TH: Record<string, string> = { yang: "หยาง", yin: "หยิน" };
const STEM_TH: Record<string, string> = {
  甲: "ไม้หยาง", 乙: "ไม้หยิน", 丙: "ไฟหยาง", 丁: "ไฟหยิน", 戊: "ดินหยาง", 己: "ดินหยิน",
  庚: "ทองหยาง", 辛: "ทองหยิน", 壬: "น้ำหยาง", 癸: "น้ำหยิน",
};

/* startAge (起運) · copy จาก /api/sifu route.ts ~37 */
async function computeStartAge(date: string, time: string, gender: "M" | "F", lng: number): Promise<number> {
  try {
    const tyme = await import("tyme4ts");
    const { getSolarTimeAtTST } = await import("@/lib/bazi-calc");
    const { st } = await getSolarTimeAtTST({ date, time, longitude: lng, gmtOffsetHours: 7, birthTimeKnown: true });
    const g = gender === "F" ? tyme.Gender.WOMAN : tyme.Gender.MAN;
    const cl = tyme.ChildLimit.fromSolarTime(st, g);
    return Math.round((cl.getYearCount() + cl.getMonthCount() / 12 + cl.getDayCount() / 365.25) * 100) / 100;
  } catch (e) {
    console.error("[sifu/group] ChildLimit failed, default 10:", (e as Error).message);
    return 10;
  }
}

function knownBirthTime(raw: unknown): boolean {
  if (raw === false || raw === 0) return false;
  if (String(raw).toLowerCase() === "false" || String(raw) === "0") return false;
  return true;
}

/* ── ตำราเสริม · loaders copy pattern จาก /api/sifu (read-only · cache 60s) ── */
const AJEK_RULES_PATH = join(process.cwd(), "data/library/ajek-bazi-rules.md");
let _ajekCache: { text: string; ts: number; version: string } | null = null;
function loadAjekRules(): { text: string; version: string } {
  const now = Date.now();
  if (_ajekCache && now - _ajekCache.ts < 60_000) return _ajekCache;
  try {
    const text = readFileSync(AJEK_RULES_PATH, "utf8");
    statSync(AJEK_RULES_PATH);
    const version = createHash("sha1").update(text).digest("hex").slice(0, 12);
    _ajekCache = { text, ts: now, version };
    return _ajekCache;
  } catch (e) {
    console.warn("[sifu/group] ajek rules not found:", (e as Error).message);
    return { text: "", version: "none" };
  }
}

const INTERACTION_MASTER_PATH = join(process.cwd(), "data/library/bazi-interaction-master.md");
let _interactionCache: { text: string; ts: number; version: string } | null = null;
function loadInteractionMaster(): { text: string; version: string } {
  const now = Date.now();
  if (_interactionCache && now - _interactionCache.ts < 60_000) return _interactionCache;
  try {
    const text = readFileSync(INTERACTION_MASTER_PATH, "utf8");
    const version = createHash("sha1").update(text).digest("hex").slice(0, 12);
    _interactionCache = { text, ts: now, version };
    return _interactionCache;
  } catch (e) {
    console.warn("[sifu/group] interaction master not found:", (e as Error).message);
    return { text: "", version: "none" };
  }
}

const ENGINE_KNOWLEDGE_DIR = join(process.cwd(), "data/library/สำหรับทำ engine");
const ENGINE_KNOWLEDGE_FILES: { file: string; label: string }[] = [
  { file: "คู่มืออ้างอิงสำหรับ Yong Shen (用神) Selection Engine ของระบบ BaZi (八字) — hourkey Platform.md", label: "調候用神 · การเลือกธาตุที่ใช้" },
  { file: "Classical Zi Ping (子平) BaZi Rules for Event Timing — A Codifiable Reference for the hourkey Engine.md", label: "應期 · จังหวะเวลาเกิดเหตุ" },
  { file: "Classical BaZi Technical Rules for Hourkey.io Scoring Engine — 5 Life Domains (Health, Career, Spouse, Wealth, Study).md", label: "5 ด้านชีวิต · สุขภาพ/อาชีพ/คู่/ทรัพย์/เรียน" },
  { file: "Pillar Interactions.md", label: "ปฏิกิริยาระหว่างเสาเชิงลึก (รายคู่)" },
];
let _engineKnowledgeCache: { text: string; ts: number; version: string } | null = null;
function loadEngineKnowledge(): { text: string; version: string } {
  const now = Date.now();
  if (_engineKnowledgeCache && now - _engineKnowledgeCache.ts < 60_000) return _engineKnowledgeCache;
  const parts: string[] = [];
  const hash = createHash("sha1");
  for (const { file, label } of ENGINE_KNOWLEDGE_FILES) {
    try {
      const text = readFileSync(join(ENGINE_KNOWLEDGE_DIR, file), "utf8");
      hash.update(file).update(text);
      parts.push(`\n──────── ตำราเสริม: ${label} ────────\n${text}`);
    } catch (e) {
      console.warn("[sifu/group] engine knowledge missing:", file, (e as Error).message);
    }
  }
  const text = parts.join("\n");
  const version = text ? hash.digest("hex").slice(0, 12) : "none";
  _engineKnowledgeCache = { text, ts: now, version };
  return _engineKnowledgeCache;
}

type ProfileRow = {
  id: string;
  name?: string;
  birth_datetime: string;
  birth_lng: number | null;
  gender: string | null;
  birth_time_known: boolean | null;
};

/**
 * ประกอบ context ต่อคน · replicate buildBaziContext ใน /api/sifu/route.ts เป๊ะ
 * (รับ row ที่ผ่าน org guard มาแล้ว เพื่อไม่ query ซ้ำ)
 */
async function buildPersonContext(row: ProfileRow): Promise<string> {
  try {
    const dt = row.birth_datetime;
    const [date, timeRaw] = dt.split("T");
    const time = (timeRaw || "12:00").slice(0, 5); // ตัดวินาที · ห้ามถอด (ถ้าถอด อายุ/วัยจร = NaN)
    const lng = Number(row.birth_lng || 100.5018);
    const gender = (String(row.gender || "").trim().toLowerCase().charAt(0) === "f" ? "F" : "M") as "M" | "F"; // DB เก็บ "F"/"M" · charAt(0)==="f"
    const birthTimeKnown = knownBirthTime(row.birth_time_known);

    const calc = birthTimeKnown
      ? await calcBazi({ date, time, longitude: lng, gmtOffsetHours: 7, gender, birthTimeKnown: true })
      : await calcBazi({ date, longitude: lng, gmtOffsetHours: 7, gender, birthTimeKnown: false });
    const g = loadPromptKV("prompts/sifu-ctx-guards.md");
    if (calc.mode === "3p") {
      return [
        `ชื่อ: ${row.name || "—"} · เพศ ${gender}`,
        `เกิด: ${date} · ไม่ทราบเวลาเกิด · ลองจิจูด ${lng}`,
        `โหมดคำนวณ: 3 เสา (年/月/日) · ${g.NO_HOUR_PILLAR}`,
        `3 เสา: 年${calc.pillarsZh.year} · 月${calc.pillarsZh.month} · 日${calc.pillarsZh.day} · 時(ไม่คำนวณ)`,
        `FACT LOCK: Day Master = ${calc.dayMaster} · element = ${STEM_ELEMENT_MAP[calc.dayMaster] || "unknown"} · ${g.DM_FACT_LOCK}`,
        `วันเจ้า: ${calc.dayMaster} · แรง ${calc.strength.percent}% · ${calc.strength.level}`,
        `用神: ${calc.yongshen.slice(0, 3).map(y => `${y.stem}(${y.element})`).join(" · ")}`,
        `格局: ${calc.geJu.structure || "ปกติ"}`,
        g.LIMIT_3P_QA,
      ].join("\n");
    }
    const startAge = await computeStartAge(date, time, gender, lng);
    const ext = buildChartExtensions(
      calc.pillars,
      new Date(),
      gender,
      new Date(`${date}T${time}:00+07:00`),
      startAge,
      calc.geJu.structure || null,
      calc.strength.percent,
      calc.yongshen[0]?.element || null
    );
    const dm = calc.dayMaster;
    const ageNow = Math.max(0, new Date().getUTCFullYear() - new Date(`${date}T${time}:00+07:00`).getUTCFullYear());
    const dmElement = STEM_ELEMENT_MAP[dm] || "unknown";
    const dmPolarity = STEM_POLARITY_MAP[dm] || "yang";
    const dmElementTh = DM_LABEL_TH[dmElement] || dmElement;
    const dmPolarityTh = DM_POLARITY_TH[dmPolarity] || dmPolarity;
    const ny = ext.nayin;

    const lines = [
      `ชื่อ: ${row.name || "—"} · เพศ ${gender} · อายุปัจจุบันประมาณ ${ageNow}`,
      `เกิด: ${date} ${time} · ลองจิจูด ${lng}`,
      `4 เสา: 年${calc.pillarsZh.year} · 月${calc.pillarsZh.month} · 日${calc.pillarsZh.day} · 時${calc.pillarsZh.hour}`,
      `FACT LOCK: Day Master = ${dm} · polarity = ${dmPolarity} · element = ${dmElement} · ${g.DM_FACT_LOCK}`,
      g.DM_THAI_LOCK.replace("{{DM_ELEMENT}}", () => dmElementTh).replace("{{DM_POLARITY}}", () => dmPolarityTh),
      `วันเจ้า: ${STEM_TH[dm] || dm} · ธาตุ${dmElementTh}แบบ${dmPolarityTh} · แรง ${calc.strength.percent}% · ${calc.strength.level}`,
      `用神: ${calc.yongshen.slice(0, 3).map(y => `${y.stem}(${y.element})`).join(" · ")}`,
      `格局: ${calc.geJu.structure || "ปกติ"}`,
      `納音: 年${ny.year?.zh || "-"} · 月${ny.month?.zh || "-"} · 日${ny.day?.zh || "-"} · 時${ny.hour?.zh || "-"}`,
    ];
    const packet = buildStructuredChartPacket(calc, ext, dm, ageNow, g);
    validateChartPacket(packet);
    lines.push(renderChartPrompt(packet));
    if (ext.special_chart.applicable) {
      lines.push(`ดวงพิเศษ: ${ext.special_chart.type_zh} · friendly=${ext.special_chart.friendly_elements.join("·")}`);
    }
    return lines.join("\n");
  } catch (e) {
    console.error("[sifu/group] buildPersonContext failed:", e);
    return "(ไม่สามารถคำนวณดวงได้)";
  }
}

/* คำสั่งวิเคราะห์กลุ่ม · inline 3 ภาษา · ต่อท้าย group context */
const GROUP_INSTRUCTION: Record<string, string> = {
  th: "ด้านบนคือดวงของหลายคนในกลุ่มเดียวกัน · ช่วยวิเคราะห์ภาพรวมกลุ่ม ความเข้ากัน จุดเสริม-จุดชน บทบาทแต่ละคน โดยใช้กฎการอ่านเดียวกับการอ่านดวงเดี่ยว (เจาะ 3-5 จุด ระบุชื่อ+เสาที่เกี่ยวข้อง)",
  en: "Above are the charts of several people in the same group. Analyze the overall group dynamics, compatibility, mutual support and clashes, and each person's role — using the same reading rules as a single-chart reading (pick 3-5 concrete points, naming the person and the pillars involved).",
  zh: "以上是同一群組中多人的命盤。請分析群組整體互動、配對、相生相剋與各人角色，並沿用單一命盤的判讀規則（挑 3-5 個具體論點，標明所涉及的人與柱）。",
};

/* ประกอบ prompt · reuse sifu-qa.md เป็นฐาน เหมือน buildPrompt branch Q&A ใน /api/sifu */
function buildGroupPrompt(opts: { ctx: string; message: string; history: Msg[]; lang: string }): string {
  const langKey = (opts.lang || "th").toUpperCase();
  const histText = opts.history.length
    ? "\n\nประวัติคำถาม:\n" + opts.history.map(h => `[${h.role}] ${h.content}`).join("\n")
    : "";
  const ajek = loadAjekRules();
  const rulesBlock = ajek.text
    ? "\n\n" + loadPromptMd("prompts/sifu-rules-header.md").trim().replace("{{RULES}}", () => ajek.text) + "\n"
    : "";
  const interaction = loadInteractionMaster();
  const interactionBlock = interaction.text
    ? "\n\n" + loadPromptMd("prompts/sifu-interaction-header.md").trim().replace("{{INTERACTION}}", () => interaction.text) + "\n"
    : "";
  const engineKnow = loadEngineKnowledge();
  const engineBlock = engineKnow.text
    ? "\n\n" + loadPromptMd("prompts/sifu-engine-header.md").trim().replace("{{ENGINE}}", () => engineKnow.text) + "\n"
    : "";
  const qaLang = loadPromptSections("prompts/sifu-lang.md");
  const groupInstruction = "\n\n" + (GROUP_INSTRUCTION[opts.lang] || GROUP_INSTRUCTION.th);
  return loadPromptMd("prompts/sifu-qa.md")
    .replace("{{LANG}}", () => qaLang[langKey] || qaLang.TH || "")
    .replace("{{RULES}}", () => rulesBlock)
    .replace("{{INTERACTION}}", () => interactionBlock + engineBlock)
    .replace("{{CTX}}", () => opts.ctx + groupInstruction)
    .replace("{{FOCUS_HIST}}", () => histText)
    .replace("{{MESSAGE}}", () => opts.message);
}

/* ── Claude CLI · copy จาก /api/sifu (spawn sudo -u jarvis -H claude · cwd checklist-app) ── */
async function runClaudeCli(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const claudeArgs = ["-p", "--output-format", "text", "--dangerously-skip-permissions", "--setting-sources", "user"];
    const c = spawn("sudo", ["-u", CHILD_USER, "-H", "claude", ...claudeArgs], {
      cwd: "/var/www/checklist-app",
      env: process.env,
    });
    let out = "";
    let err = "";
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
    "-p", "--output-format", "stream-json", "--include-partial-messages", "--verbose",
    "--dangerously-skip-permissions", "--setting-sources", "user",
  ];
  const c = spawn("sudo", ["-u", CHILD_USER, "-H", "claude", ...claudeArgs], {
    cwd: "/var/www/checklist-app",
    env: process.env,
  });
  c.stdin.write(prompt);
  c.stdin.end();
  return c;
}

/* Parser · stream-json line-by-line · copy จาก /api/sifu makeJsonlParser */
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
        // not JSON · skip
      }
    }
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const message: string = (body.message || "").trim();
    const history: Msg[] = Array.isArray(body.history) ? body.history.slice(-6) : [];
    const groupLabel: string = (body.groupLabel || "กลุ่ม").toString().trim().slice(0, 60) || "กลุ่ม";
    const lang: string = ["th", "en", "zh"].includes(body.lang) ? body.lang : "th";

    if (!message) return NextResponse.json({ error: "no message" }, { status: 400 });
    if (message.length > 2000) return NextResponse.json({ error: "message too long" }, { status: 400 });

    /* 🔐 session → org · ห้ามอ่านดวงข้ามบัญชี */
    const session = await getSession();
    const orgId = session?.orgId ?? null;
    if (!session || !orgId) {
      return NextResponse.json({ error: "not logged in" }, { status: 401 });
    }

    /* validate profileIds · array · 1-10 · unique · เกิน 10 ตัดเหลือ 10 ตัวแรก */
    let profileIds: string[] = Array.isArray(body.profileIds)
      ? body.profileIds.filter((x: unknown) => typeof x === "string" && x.trim().length > 0)
      : [];
    profileIds = [...new Set(profileIds)]; // unique
    if (profileIds.length === 0) return NextResponse.json({ error: "profileIds ว่าง" }, { status: 400 });
    if (profileIds.length > MAX_GROUP) profileIds = profileIds.slice(0, MAX_GROUP); // cap 10

    /* 🔐 org guard · ดึงทุก profile ใน org เดียวกันเท่านั้น (กัน IDOR · สำคัญสุด) */
    const rows = await q<ProfileRow>(
      `SELECT id, name,
              to_char(birth_datetime AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD"T"HH24:MI:SS') AS birth_datetime,
              birth_lng, gender, birth_time_known
       FROM profiles
       WHERE id = ANY($1) AND org_id=$2 AND is_archived=false`,
      [profileIds, orgId]
    );
    if (rows.length === 0) return NextResponse.json({ error: "ไม่พบ profile ในบัญชีนี้" }, { status: 404 });

    /* เรียงตามลำดับ profileIds ที่ส่งมา (DB ANY ไม่การันตี order) */
    const byId = new Map(rows.map(r => [r.id, r]));
    const ordered = profileIds.map(id => byId.get(id)).filter((r): r is ProfileRow => !!r);

    /* ประกอบ context ต่อคน (replicate buildBaziContext) */
    const sections: string[] = [];
    for (let i = 0; i < ordered.length; i++) {
      const r = ordered[i];
      const ctx = await buildPersonContext(r);
      sections.push(`━━━ คนที่ ${i + 1} · ${r.name || "—"} ━━━\n${ctx}`);
    }
    const groupCtx = `[กลุ่ม: ${groupLabel} · มี ${ordered.length} คน]\n\n` + sections.join("\n\n");

    const prompt = buildGroupPrompt({ ctx: groupCtx, message, history, lang });

    /* 🌊 SSE เมื่อ Accept: text/event-stream หรือ stream===true · ยก pattern จาก POST /api/sifu เป๊ะ
     * ห้ามใส่ AbortController / idle-timeout / reader.cancel (บทเรียน stream พัง) */
    const wantsStream =
      (req.headers.get("accept") || "").includes("text/event-stream") || body.stream === true;
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

          send("meta", { cached: false, count: ordered.length, startedAt: t0 });
          const child = spawnClaudeStreaming(prompt);
          activeChild = child;
          const killTimer = setTimeout(() => {
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
            console.warn("[sifu/group sse stderr]", chunk.toString().slice(0, 200));
          });
          child.on("close", (code) => {
            activeChild = null;
            clearTimeout(killTimer);
            const ms = Date.now() - t0;
            if (code === 0 && full.trim()) {
              send("done", { ms, model: "claude-max-cli", cached: false, chars: full.length });
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
          "Connection": "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }

    /* JSON mode */
    const reply = await runClaudeCli(prompt);
    return NextResponse.json({ reply, model: "claude-max-cli" });
  } catch (e: unknown) {
    const err = e as Error;
    console.error("[sifu/group] error:", err);
    return NextResponse.json({ error: err.message || "internal" }, { status: 500 });
  }
}
