/**
 * POST /api/sifu/compare · ซินแสอ่านดวงเปรียบเทียบ 2 คน
 *
 * รับ:
 *   { p1, p2, lang? }
 *
 * Mode A · default (JSON · backward compat):
 *   คืน { reply, lang, cached }
 *
 * Mode B · streaming (Phase 12):
 *   เปิดด้วย header `Accept: text/event-stream` หรือ query `?stream=1`
 *   คืน SSE stream: event meta → first → chunk → done | error
 *
 * 19 พ.ค. 2026 · Phase 11c (POST JSON) → Phase 12c (POST streaming · Codex approved)
 * - ใช้ claude-stream helper (ไม่แตะ /api/sifu LOCKED)
 * - Engine warmup deterministic ก่อน AI
 * - Provider: Claude CLI primary · OpenRouter fallback (before first chunk only)
 * - Cache: aj_sifu_cache · key version compare:v2-stream:
 * - Rate limit: นับเฉพาะ cache miss (cache hit ไม่นับ)
 */
import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import { q1, q } from "@/lib/db";
import { spawnClaudeStreaming, makeJsonlParser, streamOpenRouter } from "@/lib/claude-stream";

export const runtime = "nodejs";   /* Codex Phase 12 hard requirement · child_process spawn */

const TIMEOUT_MS = 180_000;
const FIRST_BYTE_TIMEOUT_MS = 20_000;   /* CLI silent > 20s → fallback OpenRouter */
const CACHE_TTL_HOURS = 24;
const MAX_BODY_SIZE = 64 * 1024;        /* 64KB · trim frontend ~3-5KB · margin */
const RATE_LIMIT_PER_HOUR = 5;          /* per IP · cache miss เท่านั้น */

/* 20 พ.ค. Phase 16a · Bazi Reading Protocol v3.1 · Codex รอบ 50 APPROVED
 * pattern เดียวกับ loadAjekRules ใน /api/sifu (LOCKED) · 60s cache · lazy load */
const PROTOCOL_PATH = join(process.cwd(), "data/sifu/bazi-reading-protocol.md");
let _protocolCache: { text: string; ts: number; version: string } | null = null;
function loadBaziProtocol(): { text: string; version: string } {
  const now = Date.now();
  if (_protocolCache && now - _protocolCache.ts < 60_000) {
    return { text: _protocolCache.text, version: _protocolCache.version };
  }
  try {
    const text = readFileSync(PROTOCOL_PATH, "utf8");
    const version = createHash("sha1").update(text).digest("hex").slice(0, 12);
    _protocolCache = { text, ts: now, version };
    return { text, version };
  } catch (e) {
    console.warn("[sifu/compare] protocol not found:", (e as Error).message);
    return { text: "", version: "none" };
  }
}

/* in-memory rate · per IP · sliding 1 hour */
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
  if (RATE_BUCKET.size > 500) {
    const old = [...RATE_BUCKET.entries()].filter(([, ts]) => ts.length === 0 || now - Math.max(...ts) > hour);
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
  analysis?: {
    ge_ju?: { structure?: string };
    tiao_hou?: { climate?: string };
    strength_yongshen?: { strength?: { level?: string; percent?: number } };
  };
  yongshen_v2?: {
    structure_label?: string;
    primary_yongshen?: Array<string | { element?: string }>;
    xishen?: Array<string | { element?: string }>;
    jishen?: Array<string | { element?: string }>;
  };
  uncertainty?: unknown;
}

const STEM_EL: Record<string, string> = {
  甲: "wood", 乙: "wood", 丙: "fire", 丁: "fire", 戊: "earth",
  己: "earth", 庚: "metal", 辛: "metal", 壬: "water", 癸: "water",
};
const EL_TH: Record<string, string> = { wood: "ไม้", fire: "ไฟ", earth: "ดิน", metal: "ทอง", water: "น้ำ" };
const EL_ZH: Record<string, string> = { wood: "木", fire: "火", earth: "土", metal: "金", water: "水" };
const EL_EN: Record<string, string> = { wood: "Wood", fire: "Fire", earth: "Earth", metal: "Metal", water: "Water" };
/* 五行生 · 木→火→土→金→水→木 */
const SHENG: Record<string, string> = { wood: "fire", fire: "earth", earth: "metal", metal: "water", water: "wood" };
/* 五行剋 · 木剋土 火剋金 土剋水 金剋木 水剋火 */
const KE: Record<string, string> = { wood: "earth", fire: "metal", earth: "water", metal: "wood", water: "fire" };

function pillarStr(p: Pillar): string {
  return p ? `${p.stem}${p.branch}` : "—";
}
function yongList(v: PersonCtx["yongshen_v2"], key: "primary_yongshen" | "jishen" | "xishen"): string {
  const arr = v?.[key] || [];
  return arr.map((y) => (typeof y === "string" ? y : y?.element)).filter((s): s is string => !!s).join("/") || "—";
}

function personSummary(p: PersonCtx, label: string, lang: "th" | "en" | "zh"): string {
  const mode = (p.mode === "3p" || !p.pillars.hour) ? "3p" : "4p";
  const dmStem = p.pillars.day?.stem || "?";
  const ge = p.analysis?.ge_ju?.structure || p.yongshen_v2?.structure_label || "—";
  const strength = p.analysis?.strength_yongshen?.strength?.level || "—";
  const climate = p.analysis?.tiao_hou?.climate || "—";
  const ys = yongList(p.yongshen_v2, "primary_yongshen");
  const js = yongList(p.yongshen_v2, "jishen");
  if (lang === "en") {
    return `${label} · ${p.name || label} (${p.gender || "?"}) · birth ${p.birthDate || "?"}${mode === "4p" ? " " + (p.birthTime || "?") : " (time unknown · 3-pillar)"}
- Pillars: Year ${pillarStr(p.pillars.year)} · Month ${pillarStr(p.pillars.month)} · Day ${pillarStr(p.pillars.day)} · Hour ${pillarStr(p.pillars.hour)}
- Day Master: ${dmStem} · Structure: ${ge} · Strength: ${strength} · Climate: ${climate}
- Yongshen: ${ys} · Jishen: ${js}${mode === "3p" ? "\n- NOTE: Hour Pillar unknown · spouse/career details limited" : ""}`;
  }
  if (lang === "zh") {
    return `${label} · ${p.name || label} (${p.gender || "?"}) · 生於 ${p.birthDate || "?"}${mode === "4p" ? " " + (p.birthTime || "?") : "(不知時辰 · 三柱)"}
- 四柱: 年 ${pillarStr(p.pillars.year)} · 月 ${pillarStr(p.pillars.month)} · 日 ${pillarStr(p.pillars.day)} · 時 ${pillarStr(p.pillars.hour)}
- 日主: ${dmStem} · 格局: ${ge} · 強弱: ${strength} · 氣候: ${climate}
- 用神: ${ys} · 忌神: ${js}${mode === "3p" ? "\n- 註: 時柱不明 · 婚姻/事業細節有限" : ""}`;
  }
  return `${label} · ${p.name || label} (${p.gender || "?"}) · เกิด ${p.birthDate || "?"}${mode === "4p" ? " " + (p.birthTime || "?") : " (ไม่ทราบเวลา · 3 เสา)"}
- เสา: ปี ${pillarStr(p.pillars.year)} · เดือน ${pillarStr(p.pillars.month)} · วัน ${pillarStr(p.pillars.day)} · ยาม ${pillarStr(p.pillars.hour)}
- ตัวตน (DM): ${dmStem} · 格局: ${ge} · ความแข็งแรง: ${strength} · ภูมิอากาศ: ${climate}
- 用神 (ธาตุที่ช่วย): ${ys} · 忌神 (ธาตุที่ขัด): ${js}${mode === "3p" ? "\n- หมายเหตุ: ไม่ทราบเสายาม · รายละเอียดคู่ครอง/อาชีพมีจำกัด" : ""}`;
}

/* Engine warmup · deterministic · ส่ง chunk ทันที ก่อน AI prose
 * วิเคราะห์: DM ↔ DM relation (生/剋/同) + 用神 overlap · ไม่เรียก API ภายนอก */
function buildEngineWarmup(p1: PersonCtx, p2: PersonCtx, lang: "th" | "en" | "zh"): string {
  const dm1 = p1.pillars.day?.stem || "?";
  const dm2 = p2.pillars.day?.stem || "?";
  const el1 = STEM_EL[dm1] || "?";
  const el2 = STEM_EL[dm2] || "?";
  /* Codex รอบ 32 fix · ใช้ enum direction กัน `includes('p1')` match ทั้ง 2 ทิศ */
  let relation: "parallel" | "p1_sheng_p2" | "p2_sheng_p1" | "p1_ke_p2" | "p2_ke_p1" | "neutral" = "neutral";
  if (el1 === el2) { relation = "parallel"; }
  else if (SHENG[el1] === el2) { relation = "p1_sheng_p2"; }
  else if (SHENG[el2] === el1) { relation = "p2_sheng_p1"; }
  else if (KE[el1] === el2) { relation = "p1_ke_p2"; }
  else if (KE[el2] === el1) { relation = "p2_ke_p1"; }
  const ys1 = (p1.yongshen_v2?.primary_yongshen || []).map((y) => (typeof y === "string" ? y : y?.element)).filter(Boolean) as string[];
  const ys2 = (p2.yongshen_v2?.primary_yongshen || []).map((y) => (typeof y === "string" ? y : y?.element)).filter(Boolean) as string[];
  const js1 = (p1.yongshen_v2?.jishen || []).map((y) => (typeof y === "string" ? y : y?.element)).filter(Boolean) as string[];
  const js2 = (p2.yongshen_v2?.jishen || []).map((y) => (typeof y === "string" ? y : y?.element)).filter(Boolean) as string[];
  /* คนที่ 2 ให้ใช้ธาตุที่คนที่ 1 ต้องการมั้ย */
  const p2_helps_p1 = ys1.includes(el2);
  const p1_helps_p2 = ys2.includes(el1);
  const p2_hurts_p1 = js1.includes(el2);
  const p1_hurts_p2 = js2.includes(el1);

  const relText = (en1: string, en2: string, zh1: string, zh2: string, th1: string, th2: string) => ({
    th: relation === "parallel" ? "ธาตุเดียวกัน · เพื่อนคู่"
        : relation === "p1_sheng_p2" ? th1
        : relation === "p2_sheng_p1" ? th2
        : relation === "p1_ke_p2" ? "คนที่ 1 ครอบคนที่ 2 (剋)"
        : relation === "p2_ke_p1" ? "คนที่ 2 ครอบคนที่ 1 (剋)"
        : "ไม่ตรง",
    en: relation === "parallel" ? "same element · peer"
        : relation === "p1_sheng_p2" ? en1
        : relation === "p2_sheng_p1" ? en2
        : relation === "p1_ke_p2" ? "P1 controls P2"
        : relation === "p2_ke_p1" ? "P2 controls P1"
        : "indirect",
    zh: relation === "parallel" ? "同類 · 比肩"
        : relation === "p1_sheng_p2" ? zh1
        : relation === "p2_sheng_p1" ? zh2
        : relation === "p1_ke_p2" ? "甲剋乙"
        : relation === "p2_ke_p1" ? "乙剋甲"
        : "間接",
  });
  const RT = relText("P1 supports P2", "P2 supports P1", "甲生乙", "乙生甲",
                      "คนที่ 1 ส่งเสริมคนที่ 2 (生)", "คนที่ 2 ส่งเสริมคนที่ 1 (生)");

  if (lang === "en") {
    const EL = EL_EN;
    return [
      `**Engine snapshot** (deterministic · before AI):`,
      `- P1 (${p1.name || "A"}) DM ${dm1} · ${EL[el1] || el1}  |  P2 (${p2.name || "B"}) DM ${dm2} · ${EL[el2] || el2}`,
      `- 5-element relation: ${RT.en}`,
      `- Mutual support: ${p2_helps_p1 ? `P2's ${EL[el2]} helps P1's Yongshen ✓` : ""} ${p1_helps_p2 ? `· P1's ${EL[el1]} helps P2's Yongshen ✓` : ""} ${!p2_helps_p1 && !p1_helps_p2 ? "no direct Yongshen match" : ""}`,
      `- Conflict: ${p2_hurts_p1 ? `P2's ${EL[el2]} is P1's Jishen ✗` : ""} ${p1_hurts_p2 ? `· P1's ${EL[el1]} is P2's Jishen ✗` : ""} ${!p2_hurts_p1 && !p1_hurts_p2 ? "no Jishen clash" : ""}`,
      ``,
    ].join("\n");
  }
  if (lang === "zh") {
    const EL = EL_ZH;
    return [
      `**引擎速覽** (確定性分析 · AI 之前):`,
      `- 甲方 (${p1.name || "A"}) 日主 ${dm1} · ${EL[el1] || el1}  |  乙方 (${p2.name || "B"}) 日主 ${dm2} · ${EL[el2] || el2}`,
      `- 五行關係: ${RT.zh}`,
      `- 用神對接: ${p2_helps_p1 ? `乙方${EL[el2]}=甲方用神 ✓` : ""} ${p1_helps_p2 ? `· 甲方${EL[el1]}=乙方用神 ✓` : ""} ${!p2_helps_p1 && !p1_helps_p2 ? "無直接對接" : ""}`,
      `- 忌神衝突: ${p2_hurts_p1 ? `乙方${EL[el2]}=甲方忌神 ✗` : ""} ${p1_hurts_p2 ? `· 甲方${EL[el1]}=乙方忌神 ✗` : ""} ${!p2_hurts_p1 && !p1_hurts_p2 ? "無忌神衝突" : ""}`,
      ``,
    ].join("\n");
  }
  const EL = EL_TH;
  return [
    `**สรุปจากเอนจิน** (วิเคราะห์ deterministic · ก่อน AI ลงรายละเอียด):`,
    `- คนที่ 1 (${p1.name || "A"}) ตัวตน ${dm1} · ${EL[el1] || el1}  |  คนที่ 2 (${p2.name || "B"}) ตัวตน ${dm2} · ${EL[el2] || el2}`,
    `- ความสัมพันธ์ 5 ธาตุ: ${RT.th}`,
    `- 用神ตรงกัน: ${p2_helps_p1 ? `ธาตุ${EL[el2]}ของคนที่ 2 = 用神 คนที่ 1 ✓` : ""} ${p1_helps_p2 ? `· ธาตุ${EL[el1]}ของคนที่ 1 = 用神 คนที่ 2 ✓` : ""} ${!p2_helps_p1 && !p1_helps_p2 ? "ไม่มี 用神 ตรงตัว" : ""}`,
    `- 忌神ปะทะ: ${p2_hurts_p1 ? `ธาตุ${EL[el2]}ของคนที่ 2 = 忌神 คนที่ 1 ✗` : ""} ${p1_hurts_p2 ? `· ธาตุ${EL[el1]}ของคนที่ 1 = 忌神 คนที่ 2 ✗` : ""} ${!p2_hurts_p1 && !p1_hurts_p2 ? "ไม่มี 忌神 ปะทะ" : ""}`,
    ``,
  ].join("\n");
}

function buildPrompt(p1: PersonCtx, p2: PersonCtx, lang: "th" | "en" | "zh", hasWarmup: boolean, protocolText: string = ""): string {
  /* Phase 16b · prepend protocol ก่อน existing prompt (Codex รอบ 51 approved) */
  const protocolBlock = protocolText
    ? `[BAZI READING PROTOCOL · Zi Ping primary · mandatory methodology]\n${protocolText}\n\n[ROUTE TASK INSTRUCTION]\n`
    : "";
  const both3p = p1.pillars.hour == null && p2.pillars.hour == null;
  const any3p = p1.pillars.hour == null || p2.pillars.hour == null;

  const header = lang === "en"
    ? `You are a master BaZi (Chinese astrology) compatibility reader. Analyze the relationship dynamics between two charts honestly and concretely.`
    : lang === "zh"
      ? `你是八字配對命理大師。請依下方雙命盤分析兩人的關係動態 · 誠實、具體、有實用建議。`
      : `คุณคือซินแสปาจื้อระดับอาจารย์ · วิเคราะห์ความสัมพันธ์ระหว่างดวง 2 คน อย่างซื่อตรง เป็นรูปธรรม และมีคำแนะนำใช้ได้จริง`;

  const guard = any3p
    ? (lang === "en"
        ? `\nIMPORTANT: At least one chart has no Hour Pillar (birth time unknown). Skip readings that depend on Hour (spouse house · 命宮 · 拱·夾).`
        : lang === "zh"
          ? `\n重要: 至少一人不知時辰 (無時柱). 涉及時柱的判讀必須略過.`
          : `\nสำคัญ: อย่างน้อยฝั่งหนึ่งไม่ทราบเวลาเกิด · ห้ามอ่านส่วนที่ต้องใช้เสายาม`)
    : "";

  const warmupNote = hasWarmup
    ? (lang === "en"
      ? `\n\nNOTE: User already sees a deterministic engine summary (DM relation · Yongshen overlap · Jishen). Do NOT repeat that. Build deeper prose on top.`
      : lang === "zh"
        ? `\n\n註: 使用者已看到引擎速覽 (日主關係 · 用神對接 · 忌神). 請勿重複, 直接進入深度解讀.`
        : `\n\nหมายเหตุ: ผู้ใช้เห็นสรุปเอนจินแล้ว (DM relation · 用神 · 忌神) · ห้ามเริ่มซ้ำ ให้ต่อเป็น prose เชิงลึก`)
    : "";

  const structure = lang === "en"
    ? `\n\nReturn 5 markdown sections:\n1. Day Master interaction (DM ↔ DM · 5-element cycle)\n2. Yongshen / Jishen overlap (deeper context)\n3. Stem & Branch interactions (天合/地合/沖/害/三合 · only existing pairs)\n4. Practical compatibility (love · work · friendship · score 0-10 with rationale)\n5. Practical advice (3 actions per person)`
    : lang === "zh"
      ? `\n\n以 markdown 回傳 5 段:\n1. 日主互動 (深度)\n2. 用神/忌神對接 (深度)\n3. 天干地支互動 (僅實際組合)\n4. 實用配對 (愛情·工作·友情 · 0-10)\n5. 實用建議 (各人 3 個)`
      : `\n\nตอบเป็น markdown 5 ส่วน:\n1. ปฏิกิริยา DM (เชิงลึก · เกินกว่าวงรอบ 5 ธาตุ)\n2. การประกบ 用神/忌神 (เชิงลึก)\n3. ปฏิกิริยา stem + branch (เอ่ยเฉพาะที่มีจริง)\n4. ความเข้ากัน (รัก · งาน · เพื่อน · 0-10 พร้อมเหตุผล)\n5. คำแนะนำใช้ได้จริง (แต่ละคน 3 ข้อ)`;

  /* Codex รอบ 52 fix · ต้องใส่ protocolBlock จริง (bug · สร้างแล้วไม่ได้ใช้) */
  return `${protocolBlock}${header}${guard}${warmupNote}\n\n${personSummary(p1, lang === "en" ? "Person A" : lang === "zh" ? "甲方" : "คนที่ 1", lang)}\n\n${personSummary(p2, lang === "en" ? "Person B" : lang === "zh" ? "乙方" : "คนที่ 2", lang)}${structure}\n\n${both3p ? (lang === "th" ? "หมายเหตุ: ทั้งคู่ไม่ทราบเวลาเกิด" : lang === "en" ? "Note: both charts lack Hour Pillar." : "註: 雙方皆不知時辰") : ""}`.trim();
}

function isValidPerson(p: unknown): p is PersonCtx {
  const x = p as PersonCtx;
  return !!x && !!x.pillars && !!x.pillars.day && !!x.pillars.day.stem && !!x.pillars.day.branch
    && !!x.pillars.year && !!x.pillars.year.stem && !!x.pillars.year.branch
    && !!x.pillars.month && !!x.pillars.month.stem && !!x.pillars.month.branch;
}

function sanitizeName(n?: string): string {
  return String(n || "").trim().slice(0, 32).toLowerCase();
}
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
function cacheKeyFor(p1: PersonCtx, p2: PersonCtx, lang: string, protocolVersion: string = "none"): string {
  /* v3-protocol · bump version · รวม protocol version เข้า key (Codex รอบ 51) · กัน cache เก่า v2 */
  const a = JSON.stringify(normalizePerson(p1));
  const b = JSON.stringify(normalizePerson(p2));
  return createHash("sha256").update(`compare:v3-protocol:${protocolVersion}:${a}:${b}:${lang}`).digest("hex").slice(0, 60);
}

async function getCachedReply(key: string): Promise<{ reply: string; warmup?: string } | null> {
  try {
    const r = await q1<{ payload: { reply: string; warmup?: string } }>(
      `SELECT payload FROM aj_sifu_cache WHERE cache_key=$1 AND expires_at>NOW()`,
      [key]
    );
    if (r?.payload?.reply) {
      q(`UPDATE aj_sifu_cache SET hits=hits+1 WHERE cache_key=$1`, [key]).catch(() => {});
      return r.payload;
    }
  } catch {}
  return null;
}

async function saveCache(key: string, reply: string, warmup: string, lang: string, elapsedMs: number, model: string, protocolVersion: string = "none") {
  try {
    await q(
      `INSERT INTO aj_sifu_cache (cache_key, payload, model, ms, rule_version, expires_at)
       VALUES ($1, $2, $3, $4, $6, NOW() + ($5 || ' hours')::interval)
       ON CONFLICT (cache_key) DO UPDATE SET
         payload = EXCLUDED.payload,
         ms = EXCLUDED.ms,
         expires_at = EXCLUDED.expires_at`,
      [key, JSON.stringify({ reply, warmup, lang }), model, elapsedMs, String(CACHE_TTL_HOURS), `sifu-compare-v3-protocol:${protocolVersion}`]
    );
  } catch {}
}

export async function POST(req: Request) {
  /* preflight common · ใช้ทั้ง JSON และ stream mode */
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim()
    || req.headers.get("x-real-ip") || "unknown";

  /* size cap */
  const cl = req.headers.get("content-length");
  if (cl && Number(cl) > MAX_BODY_SIZE) {
    return NextResponse.json({ error: "body too large" }, { status: 413 });
  }

  let body: { p1?: unknown; p2?: unknown; lang?: string } = {};
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_SIZE) {
      return NextResponse.json({ error: "body too large" }, { status: 413 });
    }
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const { p1, p2, lang } = body;
  if (!isValidPerson(p1) || !isValidPerson(p2)) {
    return NextResponse.json({ error: "p1 + p2 ต้องมี pillars (year/month/day) · hour อาจ null สำหรับ 3p" }, { status: 400 });
  }
  const L: "th" | "en" | "zh" = (lang === "en" || lang === "zh") ? lang : "th";

  /* Phase 16c · Codex รอบ 51 · load protocol · cache key รวม version */
  const protocol = loadBaziProtocol();
  const key = cacheKeyFor(p1, p2, L, protocol.version);

  /* mode detection · SSE หรือ JSON */
  const acceptSse = (req.headers.get("accept") || "").includes("text/event-stream");
  const url = new URL(req.url);
  const queryStream = url.searchParams.get("stream") === "1";
  const wantStream = acceptSse || queryStream;

  /* JSON mode · backward compat (ของเดิม Phase 11c) */
  if (!wantStream) {
    const cached = await getCachedReply(key);
    if (cached) {
      return NextResponse.json({ reply: cached.reply, lang: L, cached: true });
    }
    if (rateLimitHit(ip)) {
      return NextResponse.json({ error: "rate limit · ลองอีกใน 1 ชม." }, { status: 429 });
    }
    const warmupText = buildEngineWarmup(p1, p2, L);
    const prompt = buildPrompt(p1, p2, L, true, protocol.text);
    const startMs = Date.now();
    try {
      /* JSON mode ใช้ Claude CLI synchronous (เดิม) · ไม่ stream */
      const reply = await runClaudeCliSync(prompt);
      const elapsedMs = Date.now() - startMs;
      const full = warmupText + "\n" + reply;
      saveCache(key, full, warmupText, L, elapsedMs, "claude-cli", protocol.version);
      return NextResponse.json({ reply: full, lang: L, cached: false });
    } catch (e) {
      const msg = (e as Error)?.message || "claude failed";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  /* Streaming mode · SSE response */
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
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

      /* Client abort handler */
      const onAbort = () => safeClose();
      req.signal.addEventListener("abort", onAbort, { once: true });

      /* 1. Cache hit → ส่งทั้งก้อนทันที · ไม่นับ rate limit */
      const cached = await getCachedReply(key);
      if (cached) {
        send("meta", { cached: true, lang: L, key: key.slice(0, 8) });
        send("chunk", { text: cached.reply });
        send("done", { ms: 0, cached: true, provider: "cache" });
        safeClose();
        return;
      }

      /* 2. Cache miss → rate limit check */
      if (rateLimitHit(ip)) {
        send("error", { error: "rate limit · ลองอีกใน 1 ชม.", status: 429 });
        safeClose();
        return;
      }

      send("meta", { cached: false, lang: L, key: key.slice(0, 8), startedAt: Date.now() });

      /* 3. Engine warmup · deterministic · ส่งทันที */
      const warmup = buildEngineWarmup(p1, p2, L);
      send("first", { ms: 0, synthetic: true, provider: "engine" });
      send("chunk", { text: warmup });

      /* 4. AI prose · Claude CLI primary · OpenRouter fallback (Phase 16b · protocol injected) */
      const prompt = buildPrompt(p1, p2, L, true, protocol.text);
      const t0 = Date.now();
      let aiText = "";
      let firstAiChunkSent = false;
      let providerUsed = "claude-cli";

      const child = spawnClaudeStreaming(prompt);

      /* Codex รอบ 32 fix · fallback state guard
       * fallbackActive=true → child.close ห้ามส่ง error ทับ fallback stream
       * fallbackAbort = AbortController สำหรับ kill OpenRouter ถ้า hard timeout */
      let fallbackActive = false;
      const fallbackAbort = new AbortController();

      /* First-byte timeout · ถ้า CLI silent > 20s → kill + fallback OpenRouter */
      const firstByteTimer = setTimeout(async () => {
        if (firstAiChunkSent || fallbackActive) return;
        fallbackActive = true;
        providerUsed = "openrouter-fallback";
        try { child.kill("SIGKILL"); } catch {}
        try {
          /* รวม signal · client abort หรือ hard timeout */
          const combinedAc = new AbortController();
          req.signal.addEventListener("abort", () => combinedAc.abort(), { once: true });
          fallbackAbort.signal.addEventListener("abort", () => combinedAc.abort(), { once: true });
          await streamOpenRouter(prompt, (text) => {
            if (!firstAiChunkSent) {
              send("first", { ms: Date.now() - t0, provider: "openrouter" });
              firstAiChunkSent = true;
            }
            send("chunk", { text });
            aiText += text;
          }, { signal: combinedAc.signal });
          if (!closed && aiText) {
            const elapsedMs = Date.now() - t0;
            saveCache(key, warmup + "\n" + aiText, warmup, L, elapsedMs, providerUsed, protocol.version);
            send("done", { ms: elapsedMs, provider: providerUsed, cached: false, chars: aiText.length });
          }
        } catch (e) {
          if (!closed) send("error", { error: "fallback failed: " + ((e as Error)?.message || "unknown") });
        } finally {
          clearTimeout(hardTimer);
          safeClose();
        }
      }, FIRST_BYTE_TIMEOUT_MS);

      /* Hard timeout · 180s · kill ทุก provider (CLI + fallback) */
      const hardTimer = setTimeout(() => {
        try { child.kill("SIGKILL"); } catch {}
        fallbackAbort.abort();
        if (!closed) send("error", { error: "timeout" });
        safeClose();
      }, TIMEOUT_MS);

      const parser = makeJsonlParser((text: string) => {
        if (fallbackActive) return;       /* fallback ทำงานแล้ว · ignore stale CLI output */
        if (!firstAiChunkSent) {
          clearTimeout(firstByteTimer);
          send("first", { ms: Date.now() - t0, provider: "claude-cli" });
          firstAiChunkSent = true;
        }
        send("chunk", { text });
        aiText += text;
      });
      child.stdout?.on("data", parser);
      child.stderr?.on("data", (chunk: Buffer) => {
        console.warn("[sifu/compare stderr]", chunk.toString().slice(0, 200));
      });
      child.on("close", (code) => {
        /* fallback กำลังหรือทำสำเร็จไปแล้ว · CLI close ห้ามทับ stream */
        if (fallbackActive) return;
        clearTimeout(firstByteTimer);
        clearTimeout(hardTimer);
        if (closed) return;
        if (code === 0 && aiText) {
          const elapsedMs = Date.now() - t0;
          /* Codex รอบ 52 fix · CLI success path ส่ง protocol.version ด้วย */
          saveCache(key, warmup + "\n" + aiText, warmup, L, elapsedMs, providerUsed, protocol.version);
          send("done", { ms: elapsedMs, provider: providerUsed, cached: false, chars: aiText.length });
        } else {
          send("error", { error: `claude exit ${code}` });
        }
        safeClose();
      });

      /* Client closed mid-stream · kill ทั้ง CLI + fallback */
      req.signal.addEventListener("abort", () => {
        clearTimeout(firstByteTimer);
        clearTimeout(hardTimer);
        try { child.kill("SIGKILL"); } catch {}
        fallbackAbort.abort();
        safeClose();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",       /* nginx · disable buffering */
      Connection: "keep-alive",
    },
  });
}

/* JSON mode (backward compat) · Claude CLI synchronous · ไม่ stream */
async function runClaudeCliSync(prompt: string): Promise<string> {
  const { spawn } = await import("child_process");
  return new Promise((resolve, reject) => {
    const claudeArgs = [
      "-p",
      "--output-format", "text",
      "--dangerously-skip-permissions",
      "--setting-sources", "user",
    ];
    const spawnArgs = ["-u", "jarvis", "-H", "claude", ...claudeArgs];
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
