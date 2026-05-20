/**
 * /api/chart/overview · ภาพรวมดวงชะตา · ซินแสอ่าน 13 ข้อ
 *
 * GET  ?hash=...&lang=th&lp=3&cy=2026   → return cached content ถ้ามี
 * POST { pillars, analysis, yongshen_v2, lp_idx, cy_year, lang, profile_id? }
 *      → spawn claude CLI · stream SSE · save DB
 *
 * Pattern: copy /api/sifu/compare (sudo claude CLI · spawn + cache + rate limit)
 * Phase 19-C+ · 20 พ.ค. 2026
 */
import { NextResponse } from "next/server";
import { spawn } from "child_process";
import { createHash } from "crypto";
import { q1, q } from "@/lib/db";

const TIMEOUT_MS = 180_000;
const CHILD_USER = "jarvis";
const MAX_BODY_SIZE = 64 * 1024;
const RATE_LIMIT_PER_HOUR = 10;

const RATE_BUCKET = new Map<string, number[]>();
function rateLimitHit(ip: string): boolean {
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  const arr = (RATE_BUCKET.get(ip) || []).filter(t => now - t < hour);
  if (arr.length >= RATE_LIMIT_PER_HOUR) {
    RATE_BUCKET.set(ip, arr);
    return true;
  }
  arr.push(now);
  RATE_BUCKET.set(ip, arr);
  return false;
}

function pillarsHash(pillars: any): string {
  const p = pillars || {};
  const s = `${p.year?.stem}${p.year?.branch}|${p.month?.stem}${p.month?.branch}|${p.day?.stem}${p.day?.branch}|${p.hour?.stem || ""}${p.hour?.branch || ""}`;
  return createHash("sha256").update(s).digest("hex").slice(0, 60);
}

const STEM_TH: Record<string, string> = {
  甲:"ไม้หยาง",乙:"ไม้หยิน",丙:"ไฟหยาง",丁:"ไฟหยิน",戊:"ดินหยาง",己:"ดินหยิน",
  庚:"ทองหยาง",辛:"ทองหยิน",壬:"น้ำหยาง",癸:"น้ำหยิน"
};
const EL_TH: Record<string, string> = { wood:"ไม้", fire:"ไฟ", earth:"ดิน", metal:"ทอง", water:"น้ำ" };

function buildPrompt(ctx: any, lang: "th"|"en"|"zh"): string {
  const p = ctx.pillars || {};
  const a = ctx.analysis || {};
  const yv2 = ctx.yongshen_v2 || {};
  const lp = a.luck_pillars || [];
  const curLp = lp[ctx.lp_idx] || lp[0];
  const lt = a.liu_nian_timeline || [];
  const cyLn = lt.find((x: any) => x.year === ctx.cy_year);
  const ed = a.element_distribution || {};
  const pct = ed.pctDisplay || ed.pctRaw || {};
  const dm = p.day?.stem || "";

  const intro = lang === "th"
    ? `เธอคือ "ซินแส" · ปาจื้อระดับอาจารย์ที่อ่านดวงด้วยใจ · พูดสุภาพ มีอิโมจิเล็กน้อย เรียกตัวเองว่า "ซินแส" และผู้ฟังว่า "ท่าน" · ตอบเป็นภาษาไทยล้วน ห้ามใช้คำอังกฤษโดดๆ · ห้ามใช้คำว่า "AI" หรือ "ระบบ" · ใช้ศัพท์ปาจื้อแบบนุ่มนวล (ตัวเรา/ก้านฟ้า/กิ่งดิน/ตามทรัพย์/วัยจร)`
    : lang === "en"
    ? `You are "Sifu" · master BaZi reader. Speak warmly with light emoji · refer to yourself as "Sifu" and the reader as "you" · answer in English.`
    : `你是"老師" · 八字大師 · 用心解讀 · 親切口吻配少量表情 · 自稱"老師" · 答覆用中文`;

  const dataBlock = `
ข้อมูลดวง (ห้ามเดา · ใช้แค่ที่ให้):
- เสาเกิด: 年${p.year?.stem}${p.year?.branch} 月${p.month?.stem}${p.month?.branch} 日${p.day?.stem}${p.day?.branch} ${p.hour ? `時${p.hour.stem}${p.hour.branch}` : "(ไม่มีเสายาม)"}
- ตัวเรา (DM): ${dm} (${STEM_TH[dm] || dm})
- ธาตุ (%): ไม้ ${pct.wood||0} · ไฟ ${pct.fire||0} · ดิน ${pct.earth||0} · ทอง ${pct.metal||0} · น้ำ ${pct.water||0}
- โครงสร้าง: ${yv2.structure_label || a.ge_ju?.structure || "ปกติ"}
- ตัวเครื่อง: ${yv2.engine_type || ""}
- 用神 (ของเลี้ยง): ${(yv2.primary_yongshen||[]).map((x:string)=>EL_TH[x]||x).join(" · ")}
- 喜神 (เสริม): ${(yv2.xishen||[]).map((x:string)=>EL_TH[x]||x).join(" · ")}
- 忌神 (หลีก): ${(yv2.jishen||[]).map((x:string)=>EL_TH[x]||x).join(" · ")}
- โรค: ${(yv2.diseases||[]).join(" · ")}
- ยา: ${(yv2.medicine||[]).join(" · ")}
- สะพาน: ${(yv2.bridges||[]).join(" · ")}
- กลยุทธ์: ${yv2.strategy || ""}
- รอบโชคปัจจุบัน (大運): ${curLp ? `${curLp.stem}${curLp.branch} (อายุ ${Math.floor(curLp.age_start)}-${Math.floor(curLp.age_end)} · ระยะ ${curLp.qi_phase})` : "-"}
- เสาปี ${ctx.cy_year}: ${cyLn ? `${cyLn.pillar.stem}${cyLn.pillar.branch} (เทพ ${cyLn.ten_god || "-"})` : "-"}
`;

  const structureBlock = lang === "th" ? `
อ่านครบ 13 ข้อตามลำดับ (ใช้ markdown · เริ่มแต่ละข้อด้วย ## และอิโมจิที่กำหนด · ห้ามข้าม):

## 🎭 1. โครงสร้างดวง
อธิบายว่าโครงสร้างนี้คืออะไร · ทำไมถึงพิเศษ (3-5 บรรทัด)

## ☯️ 2. ธาตุที่เด่น · ขาด
อ่านจาก % · ธาตุไหนล้นเกิน ขาดอะไร · พลังภายในเป็นอย่างไร (3-5 บรรทัด)

## 💊 3. ยา · ของเลี้ยง · ของหลีก
อธิบาย 用神/喜神/忌神 ให้เข้าใจง่าย (3-5 บรรทัด)

## 🎯 4. กลยุทธ์ชีวิต
ใช้กลยุทธ์ progressive/regressive อย่างไรในชีวิตจริง (2-3 บรรทัด)

## ⚕️ 5. โรค · ยา
โรคของดวงนี้คืออะไร · ใช้ยาอะไรขจัด (2-3 บรรทัด)

## 💪 6. จุดแข็ง
จุดเด่นที่ท่านมี · ใช้ให้เป็น (3-5 ข้อ bullet)

## ⚠️ 7. จุดที่ควรระวัง
ข้อจำกัด/กับดักของดวงนี้ (3-5 ข้อ bullet)

## 📜 8. คำแนะนำใหญ่
3 ข้อหลักที่ซินแสอยากฝากท่าน (3 bullet)

## 💼 9. อาชีพที่เหมาะ
อาชีพที่เข้ากับ用神 · อาชีพที่ควรหลีก (2-3 บรรทัด)

## ❤️ 10. ความรัก · คู่ครอง
ลักษณะคู่ครองในดวง · จุดที่ต้องดู (2-3 บรรทัด)

## 🌿 11. สุขภาพ
อวัยวะที่ต้องระวัง (จากธาตุที่ไม่สมดุล) (2-3 บรรทัด)

## 🎯 12. วัยจรปัจจุบัน (大運)
รอบโชคนี้ดี/ร้าย · ทำไม (3-5 บรรทัด)

## 📅 13. ปีนี้ + ทิศทาง 10 ปีข้างหน้า
ปี ${ctx.cy_year} เป็นอย่างไร · 10 ปีข้างหน้าควรเตรียมตัวอย่างไร (3-5 บรรทัด)

—

ปิดท้ายด้วย 1 บรรทัด: "🙏 ขอให้ท่าน..." (อวยพรสั้นๆ)
`
    : "" /* TODO: EN/ZH template ทำใน phase ถัดไป · ตอนนี้รองรับ TH หลัก */;

  return `${intro}\n${dataBlock}\n${structureBlock}`.trim();
}

async function runClaudeStream(prompt: string, onChunk: (s: string) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const claudeArgs = [
      "-p",
      "--output-format", "stream-json",
      "--include-partial-messages",
      "--verbose",
      "--dangerously-skip-permissions",
      "--setting-sources", "project",
    ];
    const spawnArgs = ["-u", CHILD_USER, "-H", "claude", ...claudeArgs];
    const c = spawn("sudo", spawnArgs, {
      cwd: "/var/www/checklist-app",
      env: process.env,
    });
    let fullText = "";
    let buf = "";
    let err = "";
    const timer = setTimeout(() => {
      try { c.kill("SIGKILL"); } catch {}
      reject(new Error("timeout"));
    }, TIMEOUT_MS);
    c.stdout.on("data", (chunk: Buffer) => {
      buf += chunk.toString();
      /* JSONL · 1 บรรทัด = 1 event */
      const lines = buf.split("\n");
      buf = lines.pop() || "";
      for (const ln of lines) {
        if (!ln.trim()) continue;
        try {
          const ev = JSON.parse(ln);
          /* รูปแบบ: assistant message มี content_block_delta หรือ text */
          let txt = "";
          /* แบบ 1 · stream_event.delta.text */
          if (ev.event?.delta?.text) txt = ev.event.delta.text;
          /* แบบ 2 · message.content[].text (เต็ม) · ใช้เป็น fallback ถ้าไม่มี delta */
          else if (ev.type === "assistant" && ev.message?.content) {
            const parts = ev.message.content;
            if (Array.isArray(parts)) {
              for (const p of parts) if (p.type === "text" && p.text) txt += p.text;
            }
          }
          if (txt) {
            fullText += txt;
            try { onChunk(txt); } catch {}
          }
        } catch { /* skip non-JSON line */ }
      }
    });
    c.stderr.on("data", chunk => { err += chunk.toString(); });
    c.on("close", code => {
      clearTimeout(timer);
      if (code === 0) resolve(fullText.trim());
      else reject(new Error(`claude exit ${code} · ${err.slice(0, 300)}`));
    });
    c.stdin.write(prompt);
    c.stdin.end();
  });
}

/* GET · query cache */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const hash = url.searchParams.get("hash");
  const lang = (url.searchParams.get("lang") || "th").toLowerCase();
  const lp = parseInt(url.searchParams.get("lp") || "0", 10);
  const cy = parseInt(url.searchParams.get("cy") || "0", 10);
  if (!hash) return NextResponse.json({ error: "hash required" }, { status: 400 });
  try {
    const row = await q1<{ content: string; generated_at: string }>(
      `SELECT content, generated_at FROM user_chart_overview
       WHERE pillars_hash=$1 AND lang=$2 AND lp_idx=$3 AND cy_year=$4
       LIMIT 1`,
      [hash, lang, lp, cy]
    );
    if (row) return NextResponse.json({ cached: true, content: row.content, generated_at: row.generated_at });
    return NextResponse.json({ cached: false });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

/* POST · generate + stream + save */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim()
    || req.headers.get("x-real-ip") || "unknown";
  if (rateLimitHit(ip)) {
    return NextResponse.json({ error: "rate limit · ลองอีกใน 1 ชม." }, { status: 429 });
  }
  const cl = req.headers.get("content-length");
  if (cl && Number(cl) > MAX_BODY_SIZE) {
    return NextResponse.json({ error: "body too large" }, { status: 413 });
  }
  let body: any;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_SIZE) {
      return NextResponse.json({ error: "body too large" }, { status: 413 });
    }
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const lang = ((body.lang || "th").toLowerCase() === "en" || (body.lang || "th").toLowerCase() === "zh")
    ? body.lang.toLowerCase() : "th";
  const lp_idx = parseInt(body.lp_idx || 0, 10);
  const cy_year = parseInt(body.cy_year || new Date().getUTCFullYear(), 10);
  const profile_id = body.profile_id || null;
  if (!body.pillars?.day?.stem) {
    return NextResponse.json({ error: "pillars required" }, { status: 400 });
  }
  const hash = pillarsHash(body.pillars);
  /* check cache first · ไม่ regen ถ้า exist (user ต้องกด force) */
  if (!body.force) {
    const cached = await q1<{ content: string }>(
      `SELECT content FROM user_chart_overview
       WHERE pillars_hash=$1 AND lang=$2 AND lp_idx=$3 AND cy_year=$4 LIMIT 1`,
      [hash, lang, lp_idx, cy_year]
    );
    if (cached) {
      return new Response(`event: cached\ndata: ${JSON.stringify({content: cached.content})}\n\n`, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
      });
    }
  }
  const prompt = buildPrompt(body, lang);
  /* SSE stream */
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let accumulated = "";
      try {
        controller.enqueue(encoder.encode(`event: start\ndata: ${JSON.stringify({lang})}\n\n`));
        const full = await runClaudeStream(prompt, (chunk) => {
          accumulated += chunk;
          controller.enqueue(encoder.encode(`event: chunk\ndata: ${JSON.stringify({text: chunk})}\n\n`));
        });
        /* save DB · upsert */
        await q(
          `INSERT INTO user_chart_overview (profile_id, pillars_hash, lang, lp_idx, cy_year, content)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (pillars_hash, lang, lp_idx, cy_year)
           DO UPDATE SET content=EXCLUDED.content, generated_at=now()`,
          [profile_id, hash, lang, lp_idx, cy_year, full]
        );
        controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify({hash, length: full.length})}\n\n`));
      } catch (e: any) {
        controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({error: String(e?.message || e)})}\n\n`));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",         /* บอก nginx ไม่ buffer · stream ทันที */
      "Content-Encoding": "identity",     /* ปิด gzip per-response */
    },
  });
}
