/**
 * POST /api/network/ai-parse-bulk · 19 พ.ค. 2026
 *
 * รับ text list (1 คน 1 บรรทัด) → AI parse เป็น JSON array
 * พร้อมข้อมูล: name, birthDate, birthTime, gender, city, lng, lat
 *
 * ใช้ Claude CLI (เหมือน /api/network/sifu)
 * Layer 3 · MVP feature "เพิ่มหลายคน · AI"
 */
import { NextResponse } from "next/server";
import { spawn } from "child_process";
import { CLAUDE_TEXT_ONLY_ARGS } from "@/lib/ai-cli-security";
import { loadPromptMd } from "@/lib/prompt-md";
import { getSession } from "@/lib/auth";
import { getProductAccess, entitlementDenied } from "@/lib/product-entitlement";
import { publicAiPayload } from "@/lib/public-ai-response";

const CHILD_USER = "jarvis";
const TIMEOUT_MS = 60_000;

/* 25 พ.ค. · SYSTEM_PROMPT ย้ายไป prompts/ai-parse-bulk.md (แก้ผ่าน /admin/sifu-prompts) · const นี้ = fallback กันพัง */
const SYSTEM_PROMPT_FALLBACK = `You are a precise data parser. Parse the user's list of people into a JSON array.

Each person becomes ONE object with these fields:
- name: string (Thai or English)
- birthDate: string "YYYY-MM-DD"
- birthTime: string "HH:MM" (24h · if unknown use "12:00")
- gender: "M" or "F"
- city: string (city/province name in English)
- lng: number (longitude · default 100.5018 for Bangkok)
- lat: number (latitude · default 13.7563 for Bangkok)

Common Thai city mappings (use these defaults if unsure):
- กรุงเทพ/ก.ท./Bangkok → city:"Bangkok", lng:100.5018, lat:13.7563
- เชียงใหม่/ช.ม./Chiang Mai → city:"Chiang Mai", lng:98.9853, lat:18.7883
- ภูเก็ต/Phuket → city:"Phuket", lng:98.3923, lat:7.8804
- พัทยา/Pattaya → city:"Pattaya", lng:100.8825, lat:12.9236
- หาดใหญ่/ส.ข./Hat Yai → city:"Hat Yai", lng:100.4747, lat:7.0086
- ขอนแก่น/Khon Kaen → city:"Khon Kaen", lng:102.8359, lat:16.4419
- อุดร/Udon Thani → city:"Udon Thani", lng:102.7873, lat:17.4138
- โคราช/Korat → city:"Korat", lng:102.0978, lat:14.9799
- ปักกิ่ง/Beijing → lng:116.4074, lat:39.9042
- ฮ่องกง/Hong Kong → lng:114.1694, lat:22.3193
- โตเกียว/Tokyo → lng:139.6503, lat:35.6762
- สิงคโปร์/Singapore → lng:103.8198, lat:1.3521

Date formats to handle:
- "12 ส.ค. 1985", "12 สิงหาคม 2528", "12/8/85", "1985-08-12", "Aug 12 1985"
- Thai year (2528) → subtract 543 = Western year (1985)
- Buddhist Era → Christian Era

Time formats:
- "บ่ายโมง", "13:30", "1:30 PM", "13.30" → "13:30"
- "เช้า 9 โมง" → "09:00"
- "เที่ยง" → "12:00"
- "5 ทุ่ม" → "23:00"

If field is genuinely missing/unparseable, use sensible defaults
(time: "12:00", gender: "M", city: "Bangkok").

OUTPUT FORMAT (CRITICAL):
- Return ONLY valid JSON array
- No markdown code fences, no explanation, no extra text
- Example: [{"name":"พีท","birthDate":"1985-08-12","birthTime":"13:30","gender":"M","city":"Bangkok","lng":100.5018,"lat":13.7563}]

If the list is empty or unparseable, return: []`;

async function runClaudeCli(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const claudeArgs = [
      "-p",
      "--output-format", "text",
      ...CLAUDE_TEXT_ONLY_ARGS,
    ];
    const spawnArgs = ["-u", CHILD_USER, "-H", "claude", ...claudeArgs];
    const c = spawn("sudo", spawnArgs, { cwd: "/var/www/checklist-app", env: process.env });
    let out = "", err = "";
    const timer = setTimeout(() => {
      try { c.kill("SIGKILL"); } catch {}
      reject(new Error("timeout"));
    }, TIMEOUT_MS);
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

function extractJson(raw: string): any[] {
  let s = raw.trim();
  /* strip code fences */
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  /* find first '[' and last ']' */
  const lo = s.indexOf("[");
  const hi = s.lastIndexOf("]");
  if (lo === -1 || hi === -1 || hi <= lo) return [];
  s = s.slice(lo, hi + 1);
  try {
    const arr = JSON.parse(s);
    if (Array.isArray(arr)) return arr;
    return [];
  } catch {
    return [];
  }
}

export async function POST(req: Request) {
  let reserved = false;
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "not logged in" }, { status: 401 });
    const access = await getProductAccess(session.userId);
    if (!access?.pages.network.bulk_ai) {
      return NextResponse.json(entitlementDenied("network_bulk_ai_locked", { plan: access?.plan || "free" }), { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    const text: string = (body.text || "").trim();
    if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });
    if (text.length > 8000) return NextResponse.json({ error: "text too long (max 8000)" }, { status: 400 });

    /* เครดิต: เช็คยามก่อน · หักตามจำนวนตัวอักษรผลลัพธ์ AI (char-based ÷30) · 29 มิ.ย. */
    const { reserveHour, settleReservedHourByChars } = await import("@/lib/spend-hours");
    const rsv = await reserveHour("network_ai_parse_bulk");
    if (!rsv.ok) return NextResponse.json({ ok: false, error: "insufficient_hours" }, { status: 402 });
    reserved = true;

    const prompt = `${loadPromptMd("prompts/ai-parse-bulk.md", SYSTEM_PROMPT_FALLBACK)}

USER LIST (parse this to JSON array):
${text}`;

    const raw = await runClaudeCli(prompt);
    const parsed = extractJson(raw);
    /* หักยามตามจำนวนตัวอักษรผลลัพธ์ AI */
    const spend = await settleReservedHourByChars(raw.length, "network_ai_parse_bulk");
    reserved = false;
    const spent = spend.spent;
    const balanceAfter = spend.balance_after;

    /* validate + normalize */
    const valid = parsed.filter(p => p && p.name && p.birthDate).map(p => ({
      name: String(p.name || "").trim(),
      nickname: p.nickname || null,
      birthDate: String(p.birthDate || "").trim(),
      birthTime: String(p.birthTime || "12:00").trim(),
      gender: (p.gender === "F" || p.gender === "female") ? "F" : "M",
      city: String(p.city || "Bangkok").trim(),
      lng: typeof p.lng === "number" ? p.lng : 100.5018,
      lat: typeof p.lat === "number" ? p.lat : 13.7563,
    }));

    return NextResponse.json(publicAiPayload({
      ok: true,
      count: valid.length,
      people: valid,
      raw_count: parsed.length,
      model: "claude-max-cli",
      balance_after: balanceAfter,
      spent,
    }));
  } catch (e: any) {
    if (reserved) {
      const { refundReservedHour } = await import("@/lib/spend-hours");
      await refundReservedHour("network_ai_parse_bulk").catch(() => {});
    }
    console.error("[ai-parse-bulk]", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
