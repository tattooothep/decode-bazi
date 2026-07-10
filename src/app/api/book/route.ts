/**
 * /api/book · หนังสือดวงชะตา 6 ศาสตร์ (Natal Book · 命書) — เฟส 1
 * นั่งบน fusion5 pipeline: 6 panel (bookMode) ขนาน + judge-book หลอมรวม → เล่มเดียว (result jsonb)
 * ⚠️ 1 ดวงเท่านั้น (เล่มส่วนตัว) · reuse callSifu/loadBirth/computeYam pattern จาก fusion5 · ไม่แตะ /api/sifu (LOCKED)
 *  - bazi: ไปทาง /api/sifu (profileId · LOCKED pipeline คำนวณเสาเอง) · message = book directive
 *  - ziwei/qizheng/western/vedic/uranian: externalPrompt = buildSciencePrompt(..., {bookMode:true})
 *  - judge: buildJudgeBookPrompt(6 บท + resonance + daySniper + multiYear)
 * async job: POST → natal_books row (running) → คืน bookId → worker detached · GET poll · deliver-once (seen_at)
 * refund partial: บทพัง คืน yam ของบทนั้น (×1.5 rounded) · resume โหลด result = ฟรี
 */
import { NextResponse } from "next/server";
import { getSession, signSession, type Session } from "@/lib/auth";
import { q1, q } from "@/lib/db";
import { renderPalmBlock } from "@/lib/palm/prompt";
import { spendHoursForUser, refundHoursForUser } from "@/lib/spend-hours";
import { createHash } from "crypto";
import { DISCIPLINES, JUDGE_MODEL, type ScienceId } from "@/lib/fusion5/disciplines";
import { isSifuAnswerLang } from "@/lib/sifu-answer-lang"; // r414-i18n9
import {
  buildSciencePrompt, buildJudgeBookPrompt, loadBookDirective, resolveFusionTimingReference,
  BOOK_CHAPTER_ORDER, type BirthData,
} from "@/lib/fusion5/build-prompt";
import { renderMultiYearBlock, type FusionBirthLike } from "@/lib/fusion5/multi-year";
import { buildResonance, renderResonanceBlockTh, RESONANCE_SCIENCES, type FusionResonance } from "@/lib/fusion5/resonance";
import { buildDaySniper, renderDaySniperTh, resolveDaySniperRange } from "@/lib/fusion5/day-sniper";
import { notifyFusionDone } from "@/lib/push-sender";
import { buildScienceChartSvg } from "@/lib/book/chart-svg";
import {
  BOOK_SCIENCE_YAM as _BOOK_SCI,
  BOOK_SYNTHESIS_YAM as _BOOK_SYN,
} from "@/lib/product-entitlement";

export const runtime = "nodejs";
export const maxDuration = 800;

const INTERNAL_BASE = process.env.SIFU_INTERNAL_BASE_URL || "http://127.0.0.1:3349";
const CHILD_TIMEOUT_MS = Number(process.env.SIFU_BOOK_CHILD_TIMEOUT_MS || 360_000);
const FEATURE = "natal_book";
const SERVER_STARTED_AT = new Date();

// ยาม/เล่ม · SoT ร่วม product-entitlement (UI book.html ต้องตรง)
export const BOOK_SCIENCE_YAM = _BOOK_SCI;
export const BOOK_SYNTHESIS_YAM = _BOOK_SYN;
function bookPanelYam(_s: ScienceId): number { return BOOK_SCIENCE_YAM; }
export function computeBookYam(sciences: ScienceId[], includeSynthesis: boolean): number {
  const valid = sciences.filter((s) => DISCIPLINES[s]?.available);
  return valid.length * BOOK_SCIENCE_YAM + (includeSynthesis && valid.length >= 2 ? BOOK_SYNTHESIS_YAM : 0);
}

// มาตรฐานทุก user (format contract): บทต้องมีหัวข้อ "## 1." … "## 10." ครบ+เรียงลำดับ
const BOOK_FORMAT_RETRY_NOTE = "\n\n⚠️ สำคัญมาก (รอบแก้รูปแบบ): รอบก่อนหน้าเขียนหัวข้อไม่ครบ 10 มิติ · รอบนี้ต้องเขียนให้ครบทั้ง 10 หัวข้อ ขึ้นต้นแต่ละหัวข้อด้วย \"## 1.\" \"## 2.\" … \"## 10.\" เรียงตามลำดับ ห้ามข้าม ห้ามสลับ ห้ามยุบรวมเป็นย่อหน้าเดียว";
/** true = มีหัวข้อ ## 1..## 10 ครบและเรียงตามลำดับในบท (format contract เดียวกันทุก user) */
function validateChapterFormat(md: string): boolean {
  const text = String(md || "");
  let pos = -1;
  for (let n = 1; n <= 10; n++) {
    const m = text.slice(pos + 1).search(new RegExp(`#{2,4}\\s*${n}[.)]`));
    if (m < 0) return false;
    pos = pos + 1 + m;
  }
  return true;
}

const STEM_EL: Record<string, string> = {
  甲: "wood", 乙: "wood", 丙: "fire", 丁: "fire", 戊: "earth",
  己: "earth", 庚: "metal", 辛: "metal", 壬: "water", 癸: "water",
};
const EL_TH: Record<string, string> = { wood: "ไม้", fire: "ไฟ", earth: "ดิน", metal: "ทอง", water: "น้ำ" };

function internalToken(): string {
  const secret = process.env.SIFU_FUSION_INTERNAL_SECRET || process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) throw new Error("fusion_internal_secret_missing");
  return createHash("sha256").update(`hourkey:sifu-fusion:${secret}`).digest("hex");
}
async function authCookie(session: Session): Promise<string> {
  const token = await signSession({ userId: session.userId, email: session.email, orgId: session.orgId || null });
  return `decode_auth=${encodeURIComponent(token)}`;
}

/** เรียก /api/sifu (fusion-internal) */
async function callSifu(cookie: string, payload: Record<string, unknown>, model: string): Promise<{ ok: boolean; reply?: string; error?: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CHILD_TIMEOUT_MS);
  try {
    const r = await fetch(new URL("/api/sifu", INTERNAL_BASE), {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cookie": cookie, "X-Sifu-Fusion": "1", "X-Sifu-Fusion-Token": internalToken() },
      body: JSON.stringify({ ...payload, model, noCache: true }),
      signal: ctrl.signal,
    });
    const j = await r.json().catch(() => ({} as Record<string, unknown>));
    if (!r.ok || (j as Record<string, unknown>).error) return { ok: false, error: String((j as Record<string, unknown>).error || `http_${r.status}`) };
    const reply = String((j as Record<string, unknown>).reply || "").trim();
    return reply ? { ok: true, reply } : { ok: false, error: "empty_reply" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

type ProfileRow = {
  id: string;
  name: string | null;
  nickname: string | null;
  relationship_type: string | null;
  is_self: boolean;
  birth_datetime: string;
  birth_lat: number | null;
  birth_lng: number | null;
  gender: string | null;
  birth_time_known: boolean | null;
  day_boundary: string | null;
  bazi_pillars: unknown;
  yongshen: unknown;
};
type BookBirth = BirthData & {
  profileId: string;
  birthDate: string;
  birthTime: string;
  dayBoundary: string;
  isSelf: boolean;
  baziPillars: unknown;
  yongshen: unknown;
};

/** โหลด profile (org-scoped · กันอ่านข้ามบัญชี) → BookBirth */
async function loadBirth(profileId: string, orgId: string | null): Promise<BookBirth | null> {
  const row = await q1<ProfileRow>(
    `SELECT id, name, nickname,
            relationship_type,
            (relationship_type IS NULL OR btrim(relationship_type) = '') AS is_self,
            to_char(birth_datetime AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD"T"HH24:MI:SS') AS birth_datetime,
            birth_lat, birth_lng, gender, birth_time_known, day_boundary, bazi_pillars, yongshen
     FROM profiles WHERE id=$1 AND org_id=$2 AND is_archived=false`,
    [profileId, orgId]
  );
  if (!row || !row.birth_datetime) return null;
  const dtUTC = new Date(`${row.birth_datetime}+07:00`);
  if (isNaN(dtUTC.getTime())) return null;
  const [birthDate, birthTimeRaw] = row.birth_datetime.split("T");
  return {
    profileId: row.id,
    name: (row.nickname || row.name || "ดวง").slice(0, 40),
    dtUTC,
    lat: Number(row.birth_lat || 13.7563),
    lng: Number(row.birth_lng || 100.5018),
    hasTime: row.birth_time_known !== false,
    gender: (String(row.gender || "").trim().toLowerCase().charAt(0) === "f" ? "F" : "M"),
    timezone: "Asia/Bangkok",
    birthDate,
    birthTime: (birthTimeRaw || "12:00").slice(0, 5),
    dayBoundary: row.day_boundary === "00:00" ? "00:00" : "23:00",
    isSelf: !!row.is_self,
    baziPillars: row.bazi_pillars,
    yongshen: row.yongshen,
  };
}

function normPillar(x: unknown): { stem: string; branch: string } | null {
  if (!x || typeof x !== "object") return null;
  const r = x as Record<string, unknown>;
  const stem = String(r.stem || "").trim();
  const branch = String(r.branch || "").trim();
  return stem && branch ? { stem, branch } : null;
}
function coverPillars(raw: unknown): { year: unknown; month: unknown; day: unknown; hour: unknown } | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const p = (r.pillars && typeof r.pillars === "object" ? r.pillars : r) as Record<string, unknown>;
  const year = normPillar(p.year), month = normPillar(p.month), day = normPillar(p.day), hour = normPillar(p.hour);
  if (!year || !month || !day) return null;
  return { year, month, day, hour };
}
function buildCover(b: BookBirth): Record<string, unknown> {
  const pillars = coverPillars(b.baziPillars);
  const dayStem = (pillars?.day as { stem?: string } | null)?.stem || "";
  const domEl = STEM_EL[dayStem] || "";
  return {
    name: b.name,
    birthSolar: `${b.birthDate}${b.hasTime ? ` ${b.birthTime}` : " (ไม่ทราบเวลา)"}`,
    place: `${b.lat.toFixed(4)}, ${b.lng.toFixed(4)}`,
    pillars,
    dominantEl: domEl,
    dominantElTh: EL_TH[domEl] || "",
    hasTime: b.hasTime,
    gender: b.gender,
  };
}

function cleanId(x: unknown): string | null {
  const s = String(x || "").trim();
  return /^[0-9a-f-]{8,40}$/i.test(s) ? s : null;
}

type WorkerParams = {
  userId: string;
  orgId: string | null;
  cookie: string;
  runSciences: ScienceId[];
  includeSynthesis: boolean;
  includePalm: boolean;                // ศาสตร์ที่ 7: ลายมือ (toggle · ดึงที่บันทึก)
  birth: BookBirth;
  lang: string;
  yam: number;
  skipped: ScienceId[];
  skippedReasons: Partial<Record<ScienceId, string>>;
  resonance: FusionResonance | null;
  started: number;
};

type NatalBookRow = {
  id: string;
  status: string;
  result: unknown;
  error: string | null;
  lang: string | null;
  sciences: string[] | null;
  profile_id: string | null;
  created_at: string;
  seen_at?: string | null;
};

function bookJson(row: NatalBookRow) {
  return {
    bookId: row.id,
    status: row.status,
    result: row.result || null,
    error: row.error || null,
    lang: row.lang || "th",
    sciences: row.sciences || [],
    profileId: row.profile_id || null,
    createdAt: row.created_at,
  };
}

/** timeline หลายปี (deterministic) ป้อนบทจังหวะเวลาให้ judge · cap กันบวม prompt */
function buildBookMultiYear(sciences: ScienceId[], b: BookBirth): string {
  const nowY = new Date(Date.now() + 7 * 3600_000).getUTCFullYear();
  const start = nowY, end = nowY + 9;
  const parts: string[] = [];
  const like: FusionBirthLike = { name: b.name, dtUTC: b.dtUTC, lat: b.lat, lng: b.lng, hasTime: b.hasTime, gender: b.gender };
  for (const s of sciences) {
    try {
      const blk = renderMultiYearBlock(s, like, start, end);
      if (blk && blk.trim()) parts.push(blk.trim());
    } catch { /* science ไม่มี multi-year = ข้าม */ }
    if (parts.join("\n").length > 5_000) break;
  }
  return parts.join("\n\n").slice(0, 6_000);
}

/** 🔄 worker เบื้องหลัง · detached (ไม่ await) · ต้องไม่ throw ออกนอก · อัปเดต row เสมอ */
async function processBook(bookId: string, p: WorkerParams): Promise<void> {
  try {
    const { cookie, runSciences, birth, lang, yam, skipped, userId } = p;
    const timingRef = resolveFusionTimingReference("", new Date());
    const name = birth.name;

    // 6 บทขนาน (Promise.all) · ทุก path คืน ok:false ไม่ throw
    // มาตรฐานทุก user: แต่ละบท retry (bazi 3 / อื่น 2) จนกว่า format ครบ 10 มิติ หรือหมดรอบ (กันบทพัง+บทขาดหัวข้อ)
    type ChapterOut = { science: ScienceId; label: string; model: string; ok: boolean; markdown?: string; error?: string; formatWarning?: boolean };
    const timingNote = `\n\n(จังหวะเวลาอ้างอิงจร: ${timingRef.label} · ปีเป้าหมาย ${timingRef.targetYear})`;
    const genChapter = async (science: ScienceId): Promise<ChapterOut> => {
      const bind = DISCIPLINES[science];
      const label = bind.labelTh;
      const maxAttempts = science === "bazi" ? 3 : 2; // bazi = engine หลัก retry 2 ครั้ง (Task 5) · อื่น retry 1 ครั้ง
      let best: ChapterOut | null = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const emphasize = attempt > 1; // รอบ retry → กำชับ format 10 มิติ
        let res: Awaited<ReturnType<typeof callSifu>> | null = null;
        let usedModel = bind.defaultModel;
        try {
          if (science === "bazi") {
            // bazi ผ่าน /api/sifu (LOCKED pipeline · profileId) · message = book directive อ่านเต็มดวง
            const directive = loadBookDirective("bazi", name) + timingNote + (emphasize ? BOOK_FORMAT_RETRY_NOTE : "");
            const payload = { profileId: birth.profileId, message: directive, lang, threadProfileId: birth.profileId, historyProfileIds: [birth.profileId], fusionRunId: bookId };
            for (const model of [bind.defaultModel, ...bind.fallbackModels]) {
              res = await callSifu(cookie, payload, model);
              if (res.ok && res.reply) { usedModel = model; break; }
            }
          } else {
            // ศาสตร์อื่น: externalPrompt (bookMode → directive อ่านเต็มดวงถูกฉีดใน buildSciencePrompt)
            let prompt = buildSciencePrompt(science, [birth], "", lang, timingRef.refDate, timingRef, { bookMode: true });
            if (emphasize) prompt += BOOK_FORMAT_RETRY_NOTE;
            const payload = { message: name, externalPrompt: prompt, lang, profileId: birth.profileId, threadProfileId: birth.profileId, historyProfileIds: [birth.profileId], fusionRunId: bookId };
            // วนทุกโมเดล (default → ทุก fallback) จนกว่าจะได้ · กัน 1 โมเดล abort/timeout/auth แล้วบททิ้งทั้งที่ยังมีตัวสำรอง
            for (const model of [bind.defaultModel, ...bind.fallbackModels]) {
              res = await callSifu(cookie, payload, model);
              if (res.ok && res.reply) { usedModel = model; break; }
            }
          }
        } catch (e) {
          res = { ok: false, error: e instanceof Error ? e.message.slice(0, 120) : "engine_error" };
        }
        if (res?.ok && res.reply) {
          const fmtOk = validateChapterFormat(res.reply);
          const cand: ChapterOut = { science, label, model: usedModel, ok: true, markdown: res.reply, formatWarning: !fmtOk };
          if (fmtOk) return cand;   // ครบ 10 มิติ + เรียงลำดับ → จบทันที
          best = cand;              // format ไม่ครบ → เก็บฉบับนี้ (ยัง render ได้) เผื่อ retry ไม่ดีขึ้น
        } else if (!best) {
          best = { science, label, model: usedModel, ok: false, error: (res?.error || "empty").slice(0, 120) };
        }
      }
      if (best && best.ok && best.formatWarning) console.warn(`[book] chapter ${science} format_warning (ขาด/สลับหัวข้อ 10 มิติ) book=${bookId}`);
      return best!;
    };
    const chapters: ChapterOut[] = await Promise.all(runSciences.map((s) => genChapter(s)));

    const okChapters = chapters.filter((c) => c.ok && c.markdown);

    // บทหลอมรวม + จังหวะเวลา (judge-book) · ต้องมี ≥2 บทถึงหลอมรวม
    let synthesisMd = "";
    let judgeOk = false;
    const resBlock = p.resonance && (p.resonance.perPerson.length > 0 || (p.resonance.r4Pairs || []).length > 0)
      ? renderResonanceBlockTh(p.resonance) : undefined;
    const dsBlock = p.resonance?.daySniper ? renderDaySniperTh(p.resonance.daySniper) : undefined;
    const multiYearBlock = buildBookMultiYear(runSciences, birth);
    // ศาสตร์ที่ 7: ถ้าเลือกลายมือ → ดึงที่บันทึก → เข้าบทหลอมรวม
    let palmBlock: string | undefined;
    if (p.includePalm) {
      try {
        const pr = await q1<{ reading: Record<string, unknown>; clarity: number | null }>(
          `SELECT reading, clarity FROM palm_readings WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1`, [p.userId]);
        if (pr?.reading) palmBlock = renderPalmBlock(pr.reading, pr.clarity);
      } catch { /* ไม่มีลายมือ = ข้าม */ }
    }
    if (p.includeSynthesis && okChapters.length >= 2) {
      try {
        const jp = buildJudgeBookPrompt(
          okChapters.map((c) => ({ science: c.science, reply: c.markdown! })),
          [birth], lang, resBlock, dsBlock, multiYearBlock || undefined, palmBlock,
        );
        const jr = await callSifu(cookie, { message: name, externalPrompt: jp, lang }, JUDGE_MODEL);
        if (jr.ok && jr.reply) { synthesisMd = jr.reply; judgeOk = true; }
      } catch { judgeOk = false; }
    }

    // refund partial: บทพัง (50/บท) + บทหลอมรวมพัง (50 · เก็บค่าเมื่อติ๊กหลอมรวม+เลือก ≥2 ศาสตร์)
    const panelRefund = chapters.filter((c) => !c.ok).reduce((s, c) => s + bookPanelYam(c.science), 0);
    const judgeCharged = p.includeSynthesis && runSciences.length >= 2 ? BOOK_SYNTHESIS_YAM : 0;
    const judgeRefund = judgeCharged > 0 && !judgeOk ? BOOK_SYNTHESIS_YAM : 0;
    const totalRefund = panelRefund + judgeRefund;

    // สังเคราะห์ผลเป็นโครงเล่ม (result jsonb · design §2.5)
    const degraded = chapters.filter((c) => !c.ok).map((c) => c.science);
    const status: "done" | "degraded" | "error" = okChapters.length === 0
      ? "error"
      : (okChapters.length < runSciences.length || !judgeOk) ? "degraded" : "done";
    // ภาพพื้นดวงต่อบท (r401) · deterministic · พัง= "" (บทยังออกได้)
    const svgBirth = { dtUTC: birth.dtUTC, lat: birth.lat, lng: birth.lng, hasTime: birth.hasTime, gender: birth.gender };
    const synthesisRequested = p.includeSynthesis && runSciences.length >= 2;
    const result = {
      version: "natal_book_v1",
      cover: buildCover(birth),
      chapters: BOOK_CHAPTER_ORDER.filter((s) => runSciences.includes(s)).map((s) => {
        const c = chapters.find((x) => x.science === s)!;
        return { science: s, label: c.label, ok: c.ok, model: c.model, markdown: c.markdown || null, error: c.error || null, formatWarning: !!c.formatWarning, chartSvg: buildScienceChartSvg(s, svgBirth) || null };
      }),
      synthesis: { ok: judgeOk, requested: synthesisRequested, model: JUDGE_MODEL, markdown: synthesisMd || null, resonanceUsed: !!resBlock },
      timing: { hasDaySniper: !!dsBlock, hasMultiYear: !!multiYearBlock },
      appendix: {
        sciences: runSciences,
        skipped,
        skippedReasons: p.skippedReasons,
        disclaimer: "หนังสือนี้เป็นเข็มทิศเชิงโหราศาสตร์จากผังจริง ไม่ใช่คำสั่งแทนการตัดสินใจของเจ้าตัวหรือผู้เชี่ยวชาญชีวิตจริง",
        method: "TST/真太陽時 · 節氣 · sidereal (Vedic) · Halbsumme (Uranian)",
      },
      meta: {
        yam: { charged: yam, refunded: totalRefund, net: Math.max(0, yam - totalRefund) },
        ms: Date.now() - p.started,
        degradedChapters: degraded,
        formatWarnings: chapters.filter((c) => c.ok && c.formatWarning).map((c) => c.science),
        profileNames: [name],
      },
    };

    // UPDATE ก่อน → refund partial (ถ้า UPDATE throw → outer catch คืนเต็ม)
    await q(
      `UPDATE natal_books SET status=$2, result=$3, yam_refunded=$4, updated_at=now() WHERE id=$1`,
      [bookId, status, JSON.stringify(result), totalRefund]
    );
    notifyFusionDone(userId); // fire-and-forget · เคารพ prefs/quiet hours + ไม่ throw
    if (totalRefund > 0) await refundHoursForUser(userId, totalRefund, FEATURE).catch(() => {});
  } catch (e) {
    // throw ก่อน UPDATE สำเร็จ → คืนยามเต็ม + mark error
    await refundHoursForUser(p.userId, p.yam, FEATURE).catch(() => {});
    await q(`UPDATE natal_books SET status='error', error=$2, yam_refunded=$3, updated_at=now() WHERE id=$1`,
      [bookId, (e instanceof Error ? e.message : String(e)).slice(0, 200), p.yam]).catch(() => {});
  }
}

export async function POST(req: Request) {
  let chargedYam = 0, userId = "";
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "not_logged_in" }, { status: 401 });
    const orgId = session.orgId ?? null;
    userId = session.userId;

    const profileId = cleanId(body.profileId || body.profile_id);
    if (!profileId) return NextResponse.json({ error: "profile_required" }, { status: 400 });
    const lang = isSifuAnswerLang(body.lang) ? String(body.lang) : "th"; // r414-i18n9: 9 ภาษา (เดิม th/en/zh)

    const birth = await loadBirth(profileId, orgId);
    if (!birth) return NextResponse.json({ error: "profile_not_found" }, { status: 404 });

    // 🛡 กันสร้างซ้ำ (สำคัญสุด): 1 (user,profile,lang) = 1 เล่ม · default ห้ามซ้ำ · ?force=1 = regenerate
    const force = body.force === 1 || body.force === "1" || body.force === true;
    if (!force) {
      // มีเล่มเสร็จแล้ว (done/degraded) → คืนเล่มเดิม ไม่หักยาม ไม่สร้างใหม่
      const existingDone = await q1<{ id: string; status: string }>(
        `SELECT id, status FROM natal_books WHERE user_id=$1 AND profile_id=$2 AND lang=$3 AND status IN ('done','degraded') ORDER BY created_at DESC LIMIT 1`,
        [userId, profileId, lang]);
      if (existingDone) return NextResponse.json({ bookId: existingDone.id, status: existingDone.status, reused: true, profileName: birth.name });
      // มีเล่มกำลังเขียน → คืน bookId เดิม ไม่สร้างซ้อน (กันกดปุ่มรัว/พับจอเปิดใหม่)
      const existingRunning = await q1<{ id: string }>(
        `SELECT id FROM natal_books WHERE user_id=$1 AND profile_id=$2 AND lang=$3 AND status='running' AND created_at > now() - interval '30 min' ORDER BY created_at DESC LIMIT 1`,
        [userId, profileId, lang]);
      if (existingRunning) return NextResponse.json({ bookId: existingRunning.id, status: "running", reused: true, profileName: birth.name });
    }

    // บทหลอมรวม: ติ๊กได้ (r401) · default true (เมื่อไม่ส่ง = พฤติกรรมเดิม) · ต้อง ≥2 ศาสตร์ถึงมีผล
    let includeSynthesis = body.includeSynthesis === undefined
      ? true
      : (body.includeSynthesis === true || body.includeSynthesis === 1 || body.includeSynthesis === "1");
    const includePalm = body.includePalm === true; // ศาสตร์ที่ 7: ลายมือ

    // ศาสตร์ที่รัน (r401 · ติ๊กเลือกได้): ส่ง sciences[] มา = validate ⊆ 6 available (ว่าง/ไม่ถูก = error)
    //   ไม่ส่ง sciences เลย = default ทุกศาสตร์ available (backward compat)
    let requested: ScienceId[] | null = null;
    if (Array.isArray(body.sciences)) {
      requested = body.sciences.map((s) => String(s) as ScienceId).filter((s) => DISCIPLINES[s]?.available);
      if (!requested.length) return NextResponse.json({ error: "no_science_selected" }, { status: 400 });
    }
    const baseSciences = (requested && requested.length ? requested : (Object.keys(DISCIPLINES) as ScienceId[]).filter((s) => DISCIPLINES[s].available));
    const runSciences = baseSciences.filter((s) => !DISCIPLINES[s].needsBirthTime || birth.hasTime);
    const skipped = baseSciences.filter((s) => DISCIPLINES[s].needsBirthTime && !birth.hasTime);
    const skippedReasons: Partial<Record<ScienceId, string>> = {};
    for (const s of skipped) skippedReasons[s] = "no_birth_time";
    if (!runSciences.length) return NextResponse.json({ error: "all_sciences_need_birthtime", skipped, skippedReasons }, { status: 400 });

    // สิทธิ์แพ็กเกจ: free หลัง trial ปิด book · trial/premium จำกัดจำนวนศาสตร์
    const { getProductAccess, entitlementDenied } = await import("@/lib/product-entitlement");
    const access = await getProductAccess(userId);
    if (!access || access.book_max_sciences <= 0) {
      return NextResponse.json(entitlementDenied("book_requires_plan", { plan: access?.plan || "free" }), { status: 403 });
    }
    if (runSciences.length > access.book_max_sciences) {
      return NextResponse.json(
        entitlementDenied("book_science_limit", {
          max: access.book_max_sciences,
          requested: runSciences.length,
          plan: access.plan,
        }),
        { status: 403 }
      );
    }
    // บังคับ synthesis ตามแพ็ก (premium/trial ปิด)
    includeSynthesis = !!(includeSynthesis && access.book_synthesis);

    // rate limit: เล่มกำลังทำอยู่ (running) ≥ 2 = ปฏิเสธ (งานหนัก 7 AI call/เล่ม)
    const runningCnt = await q1<{ n: string }>(
      `SELECT count(*)::text AS n FROM natal_books WHERE user_id=$1 AND status='running' AND created_at > now() - interval '30 min'`, [userId]);
    if (runningCnt && Number(runningCnt.n) >= 2) return NextResponse.json({ error: "too_many_running" }, { status: 429 });

    const yam = computeBookYam(runSciences, includeSynthesis);
    const spend = await spendHoursForUser(userId, yam, FEATURE);
    if (!spend.ok) return NextResponse.json({ error: "insufficient_hours", needed: yam }, { status: 402 });
    chargedYam = yam;

    // resonance + day sniper (deterministic · คำนวณตอน POST · พัง = null ไม่ล้ม)
    let resonance: FusionResonance | null = null;
    const timingRefPost = resolveFusionTimingReference("", new Date());
    const resSciences = runSciences.filter((s) => (RESONANCE_SCIENCES as ScienceId[]).includes(s));
    if (resSciences.length >= 2) {
      try { resonance = buildResonance([birth], resSciences, timingRefPost.targetYear, timingRefPost.refDate); }
      catch (e) { console.warn("[book] resonance failed:", e instanceof Error ? e.message : e); resonance = null; }
    }
    try {
      const range = resolveDaySniperRange("", timingRefPost);
      const daySniper = buildDaySniper([birth], "", range.fromISO, range.toISO);
      if (resonance) resonance.daySniper = daySniper;
      else resonance = { version: "resonance_v1", targetYear: timingRefPost.targetYear, sciences: [], perPerson: [], r4Pairs: [], daySniper, summaryTh: "", notes: ["book shell: daySniper only"], computeMs: 0 };
    } catch (e) { console.warn("[book] day sniper failed:", e instanceof Error ? e.message : e); }

    const profileSnapshot = {
      id: birth.profileId, name: birth.name, birthDate: birth.birthDate, birthTime: birth.birthTime,
      timezone: "Asia/Bangkok", dayBoundary: birth.dayBoundary, hasTime: birth.hasTime, gender: birth.gender,
      baziPillars: birth.baziPillars,
    };
    const cookie = await authCookie(session);
    const row = await q1<{ id: string }>(
      `INSERT INTO natal_books(user_id, org_id, profile_id, status, lang, sciences, yam_charged, profile_snapshot)
       VALUES ($1,$2,$3,'running',$4,$5,$6,$7) RETURNING id`,
      [userId, orgId, profileId, lang, runSciences, yam, JSON.stringify(profileSnapshot)]
    );
    if (!row) { await refundHoursForUser(userId, yam, FEATURE).catch(() => {}); return NextResponse.json({ error: "book_create_failed" }, { status: 500 }); }
    chargedYam = 0; // worker รับช่วง refund แล้ว

    void processBook(row.id, { userId, orgId, cookie, runSciences, includeSynthesis, includePalm, birth, lang, yam, skipped, skippedReasons, resonance, started: Date.now() });

    return NextResponse.json({ bookId: row.id, status: "running", yam: { charged: yam }, sciences: runSciences, includeSynthesis, skipped, skippedReasons, profileName: birth.name });
  } catch {
    if (chargedYam > 0 && userId) await refundHoursForUser(userId, chargedYam, FEATURE).catch(() => {});
    return NextResponse.json({ error: "book_error" }, { status: 500 });
  }
}

async function reconcileStale(row: NatalBookRow, userId: string): Promise<NatalBookRow> {
  const createdMs = new Date(row.created_at).getTime();
  const stale = row.status === "running" && Date.now() - createdMs > 30 * 60_000;
  const orphaned = row.status === "running" && Number.isFinite(createdMs) && createdMs < SERVER_STARTED_AT.getTime() - 1_000;
  if (!stale && !orphaned) return row;
  const reason = orphaned ? "server_restart_orphan" : "timeout";
  const upd = await q1<{ sciences: string[] | null; yam_charged: number; yam_refunded: number }>(
    `UPDATE natal_books SET status='error', error=$3, updated_at=now()
      WHERE id=$1 AND user_id=$2 AND status='running'
      RETURNING sciences, yam_charged, yam_refunded`,
    [row.id, userId, reason]
  );
  if (upd) {
    const remaining = Math.max(0, (upd.yam_charged || 0) - (upd.yam_refunded || 0));
    if (remaining > 0) {
      await refundHoursForUser(userId, remaining, FEATURE).catch(() => {});
      await q(`UPDATE natal_books SET yam_refunded=yam_charged WHERE id=$1`, [row.id]).catch(() => {});
    }
  }
  return { ...row, status: "error", result: null, error: reason };
}

async function markSeen(row: NatalBookRow, userId: string): Promise<void> {
  if (row.status !== "done" && row.status !== "degraded") return;
  await q(`UPDATE natal_books SET seen_at=now() WHERE id=$1 AND user_id=$2 AND seen_at IS NULL`, [row.id, userId]).catch(() => {});
}

/** poll เล่ม (user-scoped) · resume โหลด result เดิม (ไม่เจนใหม่/ไม่หักยาม) */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "not_logged_in" }, { status: 401 });
  const url = new URL(req.url);
  const bookId = cleanId(url.searchParams.get("id") || url.searchParams.get("bookId"));

  if (url.searchParams.get("list") === "1") {
    const rows = await q<NatalBookRow>(
      `SELECT id, status, null::jsonb AS result, error, lang, sciences, profile_id, created_at::text AS created_at
         FROM natal_books WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30`, [session.userId]);
    return NextResponse.json({ books: rows.map(bookJson) }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  }

  // ?profileId=&lang= → คืน bookId ล่าสุดของ profile นั้น (frontend เช็คว่ามีเล่มแล้วหรือยัง · ไม่หักยาม)
  const qProfileId = cleanId(url.searchParams.get("profileId") || url.searchParams.get("profile_id"));
  if (qProfileId) {
    const qpLang = isSifuAnswerLang(url.searchParams.get("lang")) ? String(url.searchParams.get("lang")) : null; // r414-i18n9
    const latest = await q1<{ id: string; status: string }>(
      `SELECT id, status FROM natal_books WHERE user_id=$1 AND profile_id=$2 ${qpLang ? "AND lang=$3" : ""} ORDER BY created_at DESC LIMIT 1`,
      qpLang ? [session.userId, qProfileId, qpLang] : [session.userId, qProfileId]);
    return NextResponse.json({ bookId: latest?.id || null, status: latest?.status || null }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  }

  if (!bookId) return NextResponse.json({ error: "bad_id" }, { status: 400 });
  const row = await q1<NatalBookRow>(
    `SELECT id, status, result, error, lang, sciences, profile_id, created_at::text AS created_at
       FROM natal_books WHERE id=$1 AND user_id=$2`,
    [bookId, session.userId]
  );
  if (!row) return NextResponse.json({ error: "book_not_found" }, { status: 404 });
  const safe = await reconcileStale(row, session.userId);
  await markSeen(safe, session.userId);
  return NextResponse.json(bookJson(safe), { headers: { "Cache-Control": "no-store, max-age=0" } });
}
