/**
 * POST /api/sifu/compare · ซินแสอ่านดวงเปรียบเทียบ 2 คน
 *
 * รับ:
 *   {
 *     p1: { name, gender, birthDate, birthTime?, birthTimeKnown, pillars, mode, analysis?, yongshen_v2? },
 *     p2: { ... },
 *     lang?: 'th'|'en'|'zh'
 *   }
 * คืน: { reply: string }
 *
 * 19 พ.ค. 2026 · Phase 11c · ใหม่ทั้งไฟล์ · ไม่แตะ /api/sifu (LOCKED)
 * ใช้ pattern เดียวกัน: sudo claude CLI · timeout 180s · fail-open
 * รองรับ 4p×4p · 4p×3p · 3p×3p (Option α)
 */
import { NextResponse } from "next/server";
import { spawn } from "child_process";
import { createHash } from "crypto";
import { q1, q } from "@/lib/db";

const TIMEOUT_MS = 180_000;
const CHILD_USER = "jarvis";
const CACHE_TTL_HOURS = 24;
const MAX_BODY_SIZE = 32 * 1024;        /* 32KB cap · prevent abuse */
const RATE_LIMIT_PER_HOUR = 5;          /* per IP · 5 calls/hour */

/* in-memory rate limit · per IP · sliding window 1 hour */
const RATE_BUCKET = new Map<string, number[]>();
function rateLimitHit(ip: string): boolean {
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  const arr = (RATE_BUCKET.get(ip) || []).filter(t => now - t < hour);
  if (arr.length >= RATE_LIMIT_PER_HOUR) {
    RATE_BUCKET.set(ip, arr);
    return true;     /* over limit */
  }
  arr.push(now);
  RATE_BUCKET.set(ip, arr);
  /* prune large bucket */
  if (RATE_BUCKET.size > 500) {
    const old = [...RATE_BUCKET.entries()].filter(([_, ts]) => ts.length === 0 || now - Math.max(...ts) > hour);
    for (const [k] of old) RATE_BUCKET.delete(k);
  }
  return false;
}

type Pillar = { stem: string; branch: string } | null;
type Pillars = { year: Pillar; month: Pillar; day: Pillar; hour: Pillar };

interface PersonCtx {
  name?: string;
  gender?: "M" | "F";
  birthDate?: string;
  birthTime?: string;
  birthTimeKnown?: boolean;
  pillars: Pillars;
  mode?: "4p" | "3p";
  analysis?: any;
  yongshen_v2?: any;
}

function pillarStr(p: Pillar): string {
  return p ? `${p.stem}${p.branch}` : "—";
}

function personSummary(p: PersonCtx, label: string, lang: "th" | "en" | "zh"): string {
  const mode = (p.mode === "3p" || !p.pillars.hour) ? "3p" : "4p";
  const dmStem = p.pillars.day?.stem || "?";
  const ge = p.analysis?.ge_ju?.structure || p.yongshen_v2?.structure_label || "—";
  const strength = p.analysis?.strength_yongshen?.strength?.level || "—";
  const climate = p.analysis?.tiao_hou?.climate || "—";
  const yongshenList = (p.yongshen_v2?.primary_yongshen || []).map((y: any) => typeof y === "string" ? y : y?.element).filter(Boolean).join("/") || "—";
  const jishenList = (p.yongshen_v2?.jishen || []).map((y: any) => typeof y === "string" ? y : y?.element).filter(Boolean).join("/") || "—";

  if (lang === "en") {
    return `${label} · ${p.name || label} (${p.gender || "?"}) · birth ${p.birthDate || "?"}${mode === "4p" ? " " + (p.birthTime || "?") : " (time unknown · 3-pillar)"}
- Pillars: Year ${pillarStr(p.pillars.year)} · Month ${pillarStr(p.pillars.month)} · Day ${pillarStr(p.pillars.day)} · Hour ${pillarStr(p.pillars.hour)}
- Day Master: ${dmStem} · Structure: ${ge} · Strength: ${strength} · Climate: ${climate}
- Yongshen (helpful): ${yongshenList} · Jishen (avoid): ${jishenList}${mode === "3p" ? "\n- NOTE: Hour Pillar unknown · spouse/career details limited" : ""}`;
  }
  if (lang === "zh") {
    return `${label} · ${p.name || label} (${p.gender || "?"}) · 生於 ${p.birthDate || "?"}${mode === "4p" ? " " + (p.birthTime || "?") : "(不知時辰 · 三柱)"}
- 四柱: 年 ${pillarStr(p.pillars.year)} · 月 ${pillarStr(p.pillars.month)} · 日 ${pillarStr(p.pillars.day)} · 時 ${pillarStr(p.pillars.hour)}
- 日主: ${dmStem} · 格局: ${ge} · 強弱: ${strength} · 氣候: ${climate}
- 用神: ${yongshenList} · 忌神: ${jishenList}${mode === "3p" ? "\n- 註: 時柱不明 · 婚姻/事業細節有限" : ""}`;
  }
  return `${label} · ${p.name || label} (${p.gender || "?"}) · เกิด ${p.birthDate || "?"}${mode === "4p" ? " " + (p.birthTime || "?") : " (ไม่ทราบเวลา · 3 เสา)"}
- เสา: ปี ${pillarStr(p.pillars.year)} · เดือน ${pillarStr(p.pillars.month)} · วัน ${pillarStr(p.pillars.day)} · ยาม ${pillarStr(p.pillars.hour)}
- ตัวตน (DM): ${dmStem} · 格局: ${ge} · ความแข็งแรง: ${strength} · ภูมิอากาศ: ${climate}
- 用神 (ธาตุที่ช่วย): ${yongshenList} · 忌神 (ธาตุที่ขัด): ${jishenList}${mode === "3p" ? "\n- หมายเหตุ: ไม่ทราบเสายาม · รายละเอียดคู่ครอง/อาชีพมีจำกัด" : ""}`;
}

function buildPrompt(p1: PersonCtx, p2: PersonCtx, lang: "th" | "en" | "zh"): string {
  const both3p = p1.pillars.hour == null && p2.pillars.hour == null;
  const any3p = p1.pillars.hour == null || p2.pillars.hour == null;

  const header = lang === "en"
    ? `You are a master BaZi (Chinese astrology) compatibility reader. Analyze the relationship dynamics between two charts honestly and concretely.`
    : lang === "zh"
      ? `你是八字配對命理大師。請依下方雙命盤分析兩人的關係動態 · 誠實、具體、有實用建議。`
      : `คุณคือซินแสปาจื้อระดับอาจารย์ · วิเคราะห์ความสัมพันธ์ระหว่างดวง 2 คน อย่างซื่อตรง เป็นรูปธรรม และมีคำแนะนำใช้ได้จริง`;

  const guard = any3p
    ? (lang === "en"
        ? `\nIMPORTANT: At least one chart has no Hour Pillar (birth time unknown). Skip any reading that depends on the Hour (spouse house · career hour · 命宮 · 拱·夾). State this limitation clearly at the start.`
        : lang === "zh"
          ? `\n重要: 至少一人不知時辰 (無時柱). 涉及時柱的判讀 (配偶宮 · 事業時柱 · 命宮 · 拱·夾) 必須略過 · 並在開頭聲明此限制.`
          : `\nสำคัญ: อย่างน้อยฝั่งหนึ่งไม่ทราบเวลาเกิด (ไม่มีเสายาม) · ห้ามอ่านส่วนที่ต้องใช้เสายาม (เรือนคู่ครอง · ยามอาชีพ · 命宮 · 拱·夾) · ต้องเปิดด้วยการแจ้งข้อจำกัดให้ชัด`)
    : "";

  const structure = lang === "en"
    ? `\n\nReturn exactly these 5 sections in markdown:\n1. Day Master interaction (DM ↔ DM · element cycle · sheng/ke)\n2. Yongshen / Jishen overlap (does one supply what the other needs?)\n3. Stem & Branch interactions (天合/地合/沖/害/三合/半合 · only mention pairs that actually exist)\n4. Practical compatibility (love · work · friendship · scoring 0-10 with rationale)\n5. Practical advice (3 concrete actions for each person)`
    : lang === "zh"
      ? `\n\n以 markdown 回傳 · 恰好 5 個段落:\n1. 日主互動 (日主 ↔ 日主 · 五行生剋)\n2. 用神/忌神對接 (一方是否提供另一方所需?)\n3. 天干地支互動 (天合/地合/沖/害/三合/半合 · 僅提及實際存在的組合)\n4. 實用配對 (愛情 · 工作 · 友情 · 0-10 分附理由)\n5. 實用建議 (各人 3 個具體行動)`
      : `\n\nตอบเป็น markdown · 5 ส่วนเป๊ะตามลำดับ:\n1. ปฏิกิริยาตัวตน (DM ↔ DM · วงรอบ 5 ธาตุ · 生/剋)\n2. การประกบ 用神/忌神 (ฝ่ายหนึ่งให้สิ่งที่อีกฝ่ายต้องการมั้ย?)\n3. ปฏิกิริยา stem + branch (天合/地合/沖/害/三合/半合 · เอ่ยเฉพาะคู่ที่มีจริง)\n4. ความเข้ากัน (รัก · งาน · เพื่อน · ให้คะแนน 0-10 พร้อมเหตุผล)\n5. คำแนะนำใช้ได้จริง (แต่ละคน 3 ข้อ เป็นรูปธรรม)`;

  return `${header}${guard}\n\n${personSummary(p1, lang === "en" ? "Person A" : lang === "zh" ? "甲方" : "คนที่ 1", lang)}\n\n${personSummary(p2, lang === "en" ? "Person B" : lang === "zh" ? "乙方" : "คนที่ 2", lang)}${structure}\n\n${both3p ? (lang === "th" ? "หมายเหตุ: ทั้งคู่ไม่ทราบเวลาเกิด · ตอบให้อยู่ในขอบเขตของข้อมูลที่มี" : both3p && lang === "en" ? "Note: both charts lack Hour Pillar. Stay within available data." : "註: 雙方皆不知時辰 · 答覆需在可用資料內") : ""}`.trim();
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
    const c = spawn("sudo", spawnArgs, {
      cwd: "/var/www/checklist-app",
      env: process.env,
    });
    let out = "";
    let err = "";
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

function isValidPerson(p: any): p is PersonCtx {
  return p && p.pillars && p.pillars.day && p.pillars.day.stem && p.pillars.day.branch
    && p.pillars.year && p.pillars.year.stem && p.pillars.year.branch
    && p.pillars.month && p.pillars.month.stem && p.pillars.month.branch;
}

/* sanitize name สำหรับ cache key · trim + lowercase + max 32 chars · กัน probe via name */
function sanitizeName(n?: string): string {
  return String(n || "").trim().slice(0, 32).toLowerCase();
}

/* normalize pillars สำหรับ cache key · รวม name (sanitized) เพราะ reply อ้างชื่อ/Person A/B */
function normalizePerson(p: PersonCtx) {
  return {
    year:  p.pillars.year  ? { stem: p.pillars.year.stem,  branch: p.pillars.year.branch }  : null,
    month: p.pillars.month ? { stem: p.pillars.month.stem, branch: p.pillars.month.branch } : null,
    day:   p.pillars.day   ? { stem: p.pillars.day.stem,   branch: p.pillars.day.branch }   : null,
    hour:  p.pillars.hour  ? { stem: p.pillars.hour.stem,  branch: p.pillars.hour.branch }  : null,
    gender: p.gender || null,
    name: sanitizeName(p.name),
  };
}
function cacheKeyFor(p1: PersonCtx, p2: PersonCtx, lang: string): string {
  /* Codex รอบ 18 fix · ห้าม canonical swap · เพราะ prompt/reply เป็น directional
   * (ชื่อ Person A/B · advice รายคน · sanitized name อยู่ใน key) · A=สมชาย vs A=สมหญิง = cache คนละตัว */
  const a = JSON.stringify(normalizePerson(p1));
  const b = JSON.stringify(normalizePerson(p2));
  return createHash("sha256").update(`compare:${a}:${b}:${lang}`).digest("hex").slice(0, 60);
}

export async function POST(req: Request) {
  /* rate limit · per IP */
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim()
    || req.headers.get("x-real-ip")
    || "unknown";
  if (rateLimitHit(ip)) {
    return NextResponse.json({ error: "rate limit · ลองอีกใน 1 ชม." }, { status: 429 });
  }

  /* size cap */
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
  const { p1, p2, lang } = body || {};
  if (!isValidPerson(p1) || !isValidPerson(p2)) {
    return NextResponse.json({ error: "p1 + p2 ต้องมี pillars (year/month/day) · hour อาจ null สำหรับ 3p" }, { status: 400 });
  }
  const L: "th" | "en" | "zh" = (lang === "en" || lang === "zh") ? lang : "th";

  /* cache lookup · 24h TTL · key = sha256(normalize(p1) + normalize(p2) + lang) · directional · ลำดับ p1→p2 สำคัญ */
  const key = cacheKeyFor(p1 as PersonCtx, p2 as PersonCtx, L);
  try {
    const cached = await q1<{ payload: { reply: string } }>(
      `SELECT payload FROM aj_sifu_cache WHERE cache_key=$1 AND expires_at>NOW()`,
      [key]
    );
    if (cached?.payload?.reply) {
      q(`UPDATE aj_sifu_cache SET hits=hits+1 WHERE cache_key=$1`, [key]).catch(() => {});
      return NextResponse.json({ reply: cached.payload.reply, lang: L, cached: true });
    }
  } catch (_) { /* cache miss · proceed */ }

  const prompt = buildPrompt(p1 as PersonCtx, p2 as PersonCtx, L);
  const startMs = Date.now();

  try {
    const reply = await runClaudeCli(prompt);
    const elapsedMs = Date.now() - startMs;
    /* save cache · TTL 24h · fail-open */
    q(
      `INSERT INTO aj_sifu_cache (cache_key, payload, model, ms, rule_version, expires_at)
       VALUES ($1, $2, 'claude-cli', $3, 'sifu-compare-v1', NOW() + ($4 || ' hours')::interval)
       ON CONFLICT (cache_key) DO UPDATE SET
         payload = EXCLUDED.payload,
         ms = EXCLUDED.ms,
         expires_at = EXCLUDED.expires_at`,
      [key, JSON.stringify({ reply, lang: L }), elapsedMs, String(CACHE_TTL_HOURS)]
    ).catch(() => {});
    return NextResponse.json({ reply, lang: L, cached: false });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "claude failed" }, { status: 500 });
  }
}
