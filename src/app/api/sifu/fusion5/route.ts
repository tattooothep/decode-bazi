/**
 * /api/sifu/fusion5 · ดูดวง 5 ศาสตร์ · panel แยกศาสตร์ + judge หลอมรวม + ดูคู่/กลุ่ม 2-4 ดวง
 * ⚠️ bazi รองรับสูงสุด 2 ดวง (synastry เป็นแบบคู่) → กลุ่ม 3-4 ดวงตัด bazi ออกพร้อมเหตุผลใน skippedReasons (ไม่คิดยาม)
 * แต่ละ panel = 1 ศาสตร์ · engine คำนวณ→packet→คัมภีร์→AI (ตาม registry · กันมั่ว)
 * bazi → /api/sifu เดิม (profileId) · qizheng/western/vedic → externalPrompt (ผัง render มาแล้ว)
 * r381: "ดวงชั่วคราว" guestBirths[] — กรอกวันเกิดสด ผสม profileIds ได้ รวม ≤4 ดวง (ลำดับ: profiles ก่อน แล้ว guests)
 *       เสาคำนวณ calcBazi (Layer 1) ใน lib/fusion5/guest-birth · bazi panel ของ guest = externalPrompt (ไม่แตะ /api/sifu LOCKED)
 *       เก็บใน jobs.guest_births (jsonb additive) · ไม่เขียนตาราง profiles เด็ดขาด · yongshen=null → R5 ข้ามสุภาพ
 * ⚠️ ยังไม่แตะ /api/sifu/fusion เดิม (route แยก · /master-fusion ปัจจุบันไม่กระทบ)
 */
import { NextResponse } from "next/server";
import { getSession, readSessionVersion, signSession, type Session } from "@/lib/auth";
import { pool, q1, q } from "@/lib/db";
import { renderPalmBlock } from "@/lib/palm/prompt";
import {
  charsToHours,
  getHourBalanceForUser,
} from "@/lib/spend-hours";
import { createHash, randomUUID, timingSafeEqual } from "crypto";
import { enqueueFusionJob } from "@/lib/jobs/queue";
import { DISCIPLINES, JUDGE_MODEL, type ScienceId } from "@/lib/fusion5/disciplines";
import { buildSciencePrompt, buildJudgePrompt, resolveFusionTimingReference, type BirthData } from "@/lib/fusion5/build-prompt";
import { isSifuAnswerLang } from "@/lib/sifu-answer-lang"; // r414-i18n9: allowlist ภาษาคำตอบ 9 ภาษา
import { renderMultiYearBlock, resolveFusionYearRange, type FusionBirthLike } from "@/lib/fusion5/multi-year";
import { buildResonance, renderResonanceBlockTh, RESONANCE_SCIENCES, type FusionResonance } from "@/lib/fusion5/resonance";
import { buildDaySniper, renderDaySniperTh, resolveDaySniperRange } from "@/lib/fusion5/day-sniper";
import { buildSynastry, type PersonSyn } from "@/lib/bazi-synastry";
import { logResearchAiMessage } from "@/lib/research-log";
import { notifyFusionDone } from "@/lib/push-sender"; // r380: web push แจ้ง "คำพยากรณ์พร้อมแล้ว 🔮"
// r381: "ดวงชั่วคราว" (guest births) — กรอกวันเกิดสด ไม่บันทึกเป็นโปรไฟล์ · คำนวณด้วย calcBazi (Layer 1) ใน lib
// bazi panel ของ guest ไปทาง externalPrompt (fusion-internal) เพราะ /api/sifu POST ไม่รับ birth ตรง (LOCKED · ไม่แตะ)
import { parseGuestBirths, buildGuestFusionBirth, buildGuestBaziPanelPrompt, type GuestBirthStored, type GuestComputedBirth } from "@/lib/fusion5/guest-birth";
import { publicAiPayload } from "@/lib/public-ai-response";

export const runtime = "nodejs";
export const maxDuration = 800;

const INTERNAL_BASE = process.env.SIFU_INTERNAL_BASE_URL || "http://127.0.0.1:3349";
// panel ขนาน(parallel) + judge(sequential หลัง) ต้อง < maxDuration 800s → ตั้ง 360s ต่อ call (360+360=720<800)
const CHILD_TIMEOUT_MS = Number(process.env.SIFU_FUSION5_CHILD_TIMEOUT_MS || 360_000);
const FEATURE = "sifu_fusion5";
/**
 * กัน "ยามน้อยแต่ติ๊กหลายศาสตร์" — จองขั้นต่ำก่อนเรียก AI (escrow)
 * หักจริงท้ายงานตามตัวอักษร (≈30 ตัว/1 ยาม) · เกิน escrow ดูดเพิ่ม · เหลือน้อยกว่าคืน
 * ไม่ส่งยอดยามเข้า prompt AI (gate อยู่ฝั่ง server เท่านั้น)
 */
const ESCROW_YAM_PER_PANEL = Math.max(1, Math.floor(Number(process.env.FUSION_ESCROW_YAM_PER_SCI || 5)));
function fusionEscrowYam(scienceCount: number, chartCount: number): number {
  const nSci = Math.max(1, Math.floor(scienceCount) || 1);
  const nCharts = Math.max(1, Math.floor(chartCount) || 1);
  const panels = nSci * nCharts;
  const judge = nSci >= 2 ? ESCROW_YAM_PER_PANEL : 0;
  return panels * ESCROW_YAM_PER_PANEL + judge;
}
const BAZI_DECISIVE_READING_NOTE = [
  "นโยบายคำตอบ Fusion5:",
  "นี่คือโหมดอ่านดวง ไม่ใช่โหมด audit ระบบ: ห้ามทำ Gap Register, readiness %, production checklist, หรือสรุปว่าเว็บพร้อม/ไม่พร้อม เว้นแต่คำถามผู้ใช้ถามตรวจระบบโดยตรง",
  "ถ้าข้อมูลปาจื้อที่เกี่ยวกับคำถามมีครบ ให้ฟันธงตามดวงอย่างชัดเจน ไม่ตอบกั๊ก ไม่วนบอกว่าต้องมีศาสตร์อื่น และไม่ยกชั้นสูงที่ไม่เกี่ยวกับคำถามมาเป็นข้อขาด",
  "ถ้าข้อมูลสำคัญต่อคำถามขาดจริง ให้บอกเฉพาะจุดที่ขาดนั้น แล้วฟันธงเฉพาะขอบเขตที่มี ห้ามแต่งปฏิกิริยา/จังหวะ/ดวงคู่เอง",
  "เรื่องสุขภาพ การเงิน กฎหมาย แต่งงาน ผ่าตัด หรือลงทุน: ฟันธงเชิงโหราศาสตร์ได้ แต่เขียนเป็นสัญญาณ/ข้อควรระวัง ไม่ใช่คำสั่งแทนผู้เชี่ยวชาญชีวิตจริง",
  "คำตอบต้องเฉพาะเจาะจงกับดวงที่เลือก อ่านแล้วต้องรู้ว่าเป็นคนนี้เท่านั้น ไม่ใช่คำทำนายทั่วไปที่ใช้ได้กับหลายคน",
  "ต้องยกหลักฐานจากผังปาจื้อจริงอย่างน้อย 5 จุดในโหมดเดี่ยว หรือ 6 จุดในโหมดคู่ แล้วโยงกับผลชีวิต/คำถามโดยตรง",
  "วัยจร / ช่วงชีวิต (บังคับ): ใช้ตารางวัยจร 大運 ทั้งชีวิต + ปีครอบใน packet · ระบุช่วง active (อายุ+เสาวัยจร) · ไล่ อดีตใกล้·ปัจจุบัน·ถัดไป · อ่านปีไหนใช้วัยจรของปีนั้น ห้ามยกวัยจรปัจจุบันไปทุกปี · อย่างน้อย 1 หลักฐานต้องเป็นวัยจร/ปีจร · ต้องมีหัวข้อ ## วัยจร / ช่วงชีวิต",
  "ถ้าคำถามเป็นตัวอย่าง/demo/ว่าง ให้ตอบแบบโชว์ฝีมือ: ฟันธง 3 เรื่องที่เฉพาะที่สุดจากผังนี้ พร้อมหลักฐาน วัยจร และคำแนะนำที่ทำได้ทันที",
].join("\n");

function fusion5FailureReply(lang: string): string {
  switch (lang) {
    case "en":
      return "Sorry, I cannot complete this Fusion reading right now. Please try again.";
    case "zh":
      return "抱歉，目前暫時無法完成這次合盤解讀，請稍後再試。";
    case "cn":
      return "抱歉，目前暂时无法完成这次合盘解读，请稍后再试。";
    case "vi":
      return "Xin lỗi, hiện chưa thể hoàn tất phần luận giải Fusion này. Vui lòng thử lại.";
    case "ja":
      return "申し訳ありません。現在このFusion鑑定を完了できません。もう一度お試しください。";
    case "ko":
      return "죄송합니다. 현재 이 Fusion 풀이를 완료할 수 없습니다. 다시 시도해 주세요.";
    case "ru":
      return "Извините, сейчас не удалось завершить этот Fusion-разбор. Попробуйте еще раз.";
    case "es":
      return "Lo siento, ahora no se puede completar esta lectura Fusion. Inténtalo de nuevo.";
    default:
      return "ขออภัย ยังไม่สามารถอ่านดวงได้ในขณะนี้ ลองใหม่อีกครั้ง";
  }
}

function internalToken(): string {
  const secret = process.env.SIFU_FUSION_INTERNAL_SECRET || process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) throw new Error("fusion_internal_secret_missing");
  return createHash("sha256").update(`hourkey:sifu-fusion:${secret}`).digest("hex");
}
async function authCookie(session: Session): Promise<string> {
  // r523 fix: ต้องใส่ sv (session_version) — ไม่ใส่ = sv 0 · user ที่เคยเปลี่ยนรหัส (sv>0)
  // จะโดน /api/sifu ปฏิเสธ "not logged in" ทั้งที่ login อยู่ (fusion/คัมภีร์เงียบทั้งเว็บ+แอพ)
  const sv = session.sv ?? (await readSessionVersion(session.userId));
  const token = await signSession({ userId: session.userId, email: session.email, orgId: session.orgId || null, sv });
  return `decode_auth=${encodeURIComponent(token)}`;
}

type PanelOut = { science: ScienceId; label: string; model: string; ok: boolean; reply?: string; error?: string };

/** เรียก /api/sifu (fusion-internal) ด้วย payload ที่กำหนด */
async function callSifu(cookie: string, payload: Record<string, unknown>, model: string, signal?: AbortSignal): Promise<{ ok: boolean; reply?: string; error?: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CHILD_TIMEOUT_MS);
  if (signal) signal.addEventListener("abort", () => ctrl.abort(), { once: true });
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
type Msg = { role: "user" | "assistant"; content: string };
type FusionBirthData = BirthData & {
  profileId: string | null;            // r381: null = ดวงชั่วคราว (guest · ไม่มี row ใน profiles)
  birthDate: string;
  birthTime: string;
  dayBoundary: string;
  relationshipType: string;
  isSelf: boolean;
  baziPillars: unknown;
  yongshen: unknown;
  isGuest?: boolean;                   // r381: true = guest (bazi panel ไปทาง externalPrompt)
  guestCalc?: GuestComputedBirth["guestCalc"]; // r381: ผล calcBazi in-memory (ห้าม serialize ลง job)
};

function renderFusionSpecificityNote(births: FusionBirthData[], focusIndex: number): string {
  const focus = births[focusIndex];
  const focusName = focus?.name || "เจ้าชะตา";
  if (births.length <= 1) {
    return [
      "=== SUBJECT_LOCK / ห้ามตอบกว้าง ===",
      `ดวงที่ต้องอ่านมีคนเดียว: "${focusName}". ต้องเอ่ยชื่อ "${focusName}" ในฟันธงประโยคแรก`,
      "ห้ามเขียนเหมือน horoscope ทั่วไป ห้ามไล่ครบทุกเรื่องชีวิตถ้าคำถามไม่ได้ถาม",
      "รูปแบบตอบบังคับ: ฟันธงเฉพาะชื่อ → หลักฐานจากผัง 5 จุด → คำตอบตรงคำถามแบบลงลึก → คำแนะนำปฏิบัติ 3 ข้อ",
    ].join("\n");
  }
  const names = births.map((b) => `"${b.name || "ดวง"}"`).join(" กับ ");
  return [
    "=== SUBJECT_LOCK / ห้ามตอบเกินคู่ที่เลือก ===",
    `ดูคู่เฉพาะ ${names}. ตอนนี้กำลังอ่านฝั่ง "${focusName}" และปฏิกิริยาของคู่นี้เท่านั้น`,
    "ทุกย่อหน้าต้องระบุว่าพูดถึงคนใด หรือพูดถึงปฏิกิริยาของทั้งคู่จาก PAIR_INTERACTION_PACKET bazi",
    "รูปแบบตอบบังคับ: ฟันธงเฉพาะคู่นี้ → หลักฐานจากผัง/ปฏิกิริยาข้ามดวง 6 จุด → แรงหนุน/แรงเสียดทาน → คำแนะนำปฏิบัติ 3 ข้อ",
  ].join("\n");
}

const STEM_EL: Record<string, string> = {
  甲: "wood", 乙: "wood", 丙: "fire", 丁: "fire", 戊: "earth",
  己: "earth", 庚: "metal", 辛: "metal", 壬: "water", 癸: "water",
};

/** โหลด profile (org-scoped · กันอ่านข้ามบัญชี) → BirthData */
async function loadBirth(profileId: string, orgId: string | null): Promise<FusionBirthData | null> {
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
  // Bangkok wall time → UTC instant (+07:00)
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
    relationshipType: row.is_self ? "ผู้ถาม/เจ้าของบัญชี" : String(row.relationship_type || "คนในเครือข่าย"),
    isSelf: !!row.is_self,
    baziPillars: row.bazi_pillars,
    yongshen: row.yongshen,
    isGuest: false,
  };
}

function normalizePillar(x: unknown): { stem: string; branch: string } | undefined {
  if (!x || typeof x !== "object") return undefined;
  const r = x as Record<string, unknown>;
  const stem = String(r.stem || "").trim();
  const branch = String(r.branch || "").trim();
  return stem && branch ? { stem, branch } : undefined;
}

function unwrapBaziPillars(raw: unknown): PersonSyn["pillars"] {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const p = (r.pillars && typeof r.pillars === "object" ? r.pillars : r) as Record<string, unknown>;
  const day = normalizePillar(p.day);
  const month = normalizePillar(p.month);
  const year = normalizePillar(p.year);
  if (!day || !month || !year) return null;
  return {
    year,
    month,
    day,
    hour: normalizePillar(p.hour),
  };
}

function normalizeYongEls(raw: unknown): string[] {
  const toElement = (x: unknown): string | null => {
    const s = String(typeof x === "object" && x ? (x as Record<string, unknown>).element || "" : x || "").trim().toLowerCase();
    const map: Record<string, string> = { 木: "wood", 火: "fire", 土: "earth", 金: "metal", 水: "water" };
    return ["wood", "fire", "earth", "metal", "water"].includes(s) ? s : map[s] || null;
  };
  if (Array.isArray(raw)) return raw.map(toElement).filter((x): x is string => !!x);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(toElement).filter((x): x is string => !!x);
    } catch { /* plain string fallback */ }
    return raw.split(/[,\s/·]+/).map(toElement).filter((x): x is string => !!x);
  }
  return [];
}

function toBaziPersonSyn(b: FusionBirthData, label: string): PersonSyn {
  const pillars = unwrapBaziPillars(b.baziPillars);
  const dayStem = pillars?.day?.stem || "";
  return {
    name: b.name || label,
    role: b.relationshipType || label,
    isSelf: b.isSelf,
    text: "",
    mode: !pillars ? "err" : pillars.hour ? "4p" : "3p",
    dmEl: STEM_EL[dayStem] || "unknown",
    yongEls: normalizeYongEls(b.yongshen),
    pillars,
  };
}

function renderBaziPairInteractionPacket(births: FusionBirthData[], lang: string): string {
  if (births.length !== 2) return "";
  const syn = buildSynastry([
    toBaziPersonSyn(births[0], "คนที่ 1"),
    toBaziPersonSyn(births[1], "คนที่ 2"),
  ], lang);
  return [
    "=== PAIR_INTERACTION_PACKET bazi · CLOSED_LIST ===",
    "ปฏิกิริยาข้ามดวงปาจื้อด้านล่างคำนวณจากระบบแล้วเท่านั้น · AI ห้ามสร้าง 合/冲/害/破/三合/三會/半合/天干五合 เพิ่มนอกลิสต์นี้",
    syn || "(ไม่สามารถสร้าง synastry ได้จาก bazi_pillars ของโปรไฟล์)",
    "=== END_PAIR_INTERACTION_PACKET ===",
  ].join("\n");
}

function cleanId(x: unknown): string | null {
  const s = String(x || "").trim();
  return /^[0-9a-f-]{8,40}$/i.test(s) ? s : null;
}

function cleanThreadId(x: unknown): string | null {
  const s = String(x || "").trim().replace(/[^\w:.-]+/g, "_").slice(0, 100);
  return s || null;
}

function cleanHistory(x: unknown): Msg[] {
  if (!Array.isArray(x)) return [];
  return x.slice(-12).map((m): Msg | null => {
    if (!m || typeof m !== "object") return null;
    const r = m as Record<string, unknown>;
    const roleRaw = String(r.role || "").trim();
    const role: Msg["role"] | null = roleRaw === "user" ? "user" : (roleRaw === "assistant" || roleRaw === "sifu") ? "assistant" : null;
    const content = String(r.content || "").trim().slice(0, 4_000);
    return role && content ? { role, content } : null;
  }).filter((m): m is Msg => !!m);
}

function renderHistoryContext(history: Msg[]): string {
  if (!history.length) return "";
  const rows: string[] = [];
  let used = 0;
  for (const m of history.slice(-6)) {
    const line = `${m.role === "user" ? "USER" : "ASSISTANT"}: ${m.content.replace(/\s+/g, " ").slice(0, 360)}`;
    if (used + line.length > 1_600) break;
    rows.push(line);
    used += line.length;
  }
  if (!rows.length) return "";
  return [
    "=== PRIOR_FUSION_THREAD_CONTEXT ===",
    "ใช้บริบทถามต่อด้านล่างเพื่อเข้าใจคำสรรพนาม/คำถามต่อเนื่องเท่านั้น ห้ามคัดลอกคำตอบเก่ามาซ้ำถ้าผู้ใช้ไม่ได้ขอ",
    ...rows,
    "=== END_PRIOR_FUSION_THREAD_CONTEXT ===",
    "",
  ].join("\n");
}

function withHistoryPrompt(prompt: string, history: Msg[]): string {
  const ctx = renderHistoryContext(history);
  return ctx ? `${ctx}${prompt}` : prompt;
}

type WorkerParams = {
  session: Session;
  userId: string;
  cookie: string;
  runSciences: ScienceId[];
  births: FusionBirthData[];
  profileIds: string[];
  guestBirths: GuestBirthStored[];     // r381: guest ที่ sanitize แล้ว (เก็บ jobs.guest_births + history)
  question: string;
  lang: string;
  /** ยามจองตอน POST (1 ยาม · แบบ sifu) · หักจริงตามตัวอักษรหลังได้คำตอบ */
  reservedYam: number;
  skipped: ScienceId[];
  skippedReasons: Partial<Record<ScienceId, string>>;
  history: Msg[];
  threadId: string | null;
  threadProfileId: string | null;
  started: number;
  resonance: FusionResonance | null;   // r369: RESONANCE_PACKET (deterministic · คำนวณตอน POST)
  includePalm: boolean;                // ศาสตร์ที่ 7: ลายมือ (toggle · ดึง palm_readings ที่บันทึก · ไม่ birth-based)
};

type StoredWorkerParams = Omit<WorkerParams, "cookie">;

/** JSONB round-trip ทำลาย Date → revive ก่อน worker ใช้ engine (dtUTC ต้องเป็น Date) */
function asWorkerDate(v: unknown): Date {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date(NaN);
}

/**
 * r513 fix: payload เก็บใน fusion5_jobs.payload (jsonb) → Date กลายเป็น ISO string
 * และ guestCalc (BaziAnalysis + Date ภายใน) ห้ามพึ่ง JSON round-trip
 * · profile: revive dtUTC
 * · guest: rebuild จาก guestBirths ผ่าน buildGuestFusionBirth (Layer 1 ใหม่ทุกครั้ง)
 */
async function hydrateWorkerBirths(
  births: FusionBirthData[] | undefined,
  guestBirths: GuestBirthStored[] | undefined,
): Promise<FusionBirthData[]> {
  const list = Array.isArray(births) ? births : [];
  const guests = Array.isArray(guestBirths) ? guestBirths : [];
  let guestIdx = 0;
  const out: FusionBirthData[] = [];
  for (const raw of list) {
    if (raw?.isGuest) {
      const gs: GuestBirthStored = guests[guestIdx] || {
        name: String(raw.name || "ดวงชั่วคราว").slice(0, 40),
        birthDate: String(raw.birthDate || "").slice(0, 10),
        birthTime: raw.hasTime ? String(raw.birthTime || "").slice(0, 5) : null,
        gender: raw.gender === "F" ? "F" : "M",
        lat: Number.isFinite(Number(raw.lat)) ? Number(raw.lat) : 13.7563,
        lng: Number.isFinite(Number(raw.lng)) ? Number(raw.lng) : 100.5018,
        place: null,
      };
      guestIdx += 1;
      try {
        const rebuilt = await buildGuestFusionBirth(gs);
        out.push({ ...rebuilt });
        continue;
      } catch (e) {
        console.warn("[fusion5] guest rebuild failed:", e instanceof Error ? e.message : e);
      }
    }
    out.push({
      ...raw,
      dtUTC: asWorkerDate(raw?.dtUTC),
      // guestCalc หลัง JSON ไม่ใช้ได้ · ตัดทิ้ง (guest path ด้านบน rebuild แล้ว)
      guestCalc: raw?.isGuest ? undefined : raw?.guestCalc,
    });
  }
  return out;
}

function authorizedWorker(req: Request): boolean {
  const expected = process.env.HOURKEY_INTERNAL_JOB_TOKEN || "";
  const supplied = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function processQueuedFusion5(req: Request, body: Record<string, unknown>) {
  if (!authorizedWorker(req)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const jobId = cleanId(body.jobId);
  if (!jobId) return NextResponse.json({ error: "bad_job_id" }, { status: 400 });
  const client = await pool.connect();
  let locked = false;
  try {
    const lock = await client.query<{ locked: boolean }>(
      `SELECT pg_try_advisory_lock(hashtext($1)) AS locked`,
      [`fusion5-worker:${jobId}`]
    );
    locked = Boolean(lock.rows[0]?.locked);
    if (!locked) return NextResponse.json({ error: "already_running" }, { status: 409 });
    const found = await client.query<{ status: string; payload: StoredWorkerParams | null }>(
      `SELECT status,payload FROM fusion5_jobs WHERE id=$1`,
      [jobId]
    );
    const row = found.rows[0];
    if (!row) return NextResponse.json({ error: "job_not_found" }, { status: 404 });
    if (row.status === "done" || row.status === "error") {
      await client.query(
        `UPDATE hourkey_jobs
            SET status=$2,finished_at=COALESCE(finished_at,now()),updated_at=now()
          WHERE id=$1 AND status IN ('waiting','running')`,
        [jobId, row.status === "done" ? "succeeded" : "failed"]
      );
      return NextResponse.json({ ok: true, terminal: true, status: row.status });
    }
    if (!row.payload?.session) return NextResponse.json({ error: "payload_missing" }, { status: 422 });
    await client.query(
      `UPDATE fusion5_jobs SET status='running',attempt_count=attempt_count+1,heartbeat_at=now(),updated_at=now() WHERE id=$1`,
      [jobId]
    );
    await client.query(
      `UPDATE hourkey_jobs SET status='running',attempts=attempts+1,started_at=COALESCE(started_at,now()),heartbeat_at=now(),updated_at=now() WHERE id=$1`,
      [jobId]
    );
    const births = await hydrateWorkerBirths(row.payload.births, row.payload.guestBirths);
    const params: WorkerParams = {
      ...row.payload,
      births,
      cookie: await authCookie(row.payload.session),
      started: Date.now(),
    };
    await processFusion5(jobId, params);
    const final = await client.query<{ status: string }>(`SELECT status FROM fusion5_jobs WHERE id=$1`, [jobId]);
    return NextResponse.json({ ok: true, status: final.rows[0]?.status || "unknown" });
  } finally {
    if (locked) await client.query(`SELECT pg_advisory_unlock(hashtext($1))`, [`fusion5-worker:${jobId}`]).catch(() => {});
    client.release();
  }
}

type Fusion5JobRow = {
  id: string;
  status: string;
  result: unknown;
  error: string | null;
  created_at: string;
  question: string | null;
  sciences: string[] | null;
  profile_ids: string[] | null;
  pair_mode: boolean | null;
  resonance?: unknown;                 // r369: jsonb (additive · null ได้)
  guest_births?: unknown;              // r381: jsonb (additive · null ได้) — ดวงชั่วคราว [{name,birthDate,birthTime,gender,lat,lng,place}]
};

function cleanQuestion(x: unknown): string | null {
  const s = String(x || "").trim().slice(0, 2_000);
  return s || null;
}

function cleanScienceList(x: unknown): ScienceId[] {
  const raw = Array.isArray(x)
    ? x
    : String(x || "").split(",");
  return raw.map((s) => String(s).trim() as ScienceId).filter((s) => !!DISCIPLINES[s]?.available).slice(0, 6);
}

function cleanIdListFromSearch(url: URL): string[] {
  const raw = url.searchParams.getAll("profileIds").concat(url.searchParams.getAll("profile_ids"));
  const csv = raw.length ? raw.join(",") : String(url.searchParams.get("profileId") || url.searchParams.get("profile_id") || "");
  return csv.split(",").map(cleanId).filter((x): x is string => !!x).slice(0, 4);
}

async function reconcileStaleJob(row: Fusion5JobRow, userId: string): Promise<Fusion5JobRow> {
  const createdMs = new Date(row.created_at).getTime();
  const stale = row.status === "running" && Date.now() - createdMs > 25 * 60_000;
  if (!stale) return row;
  const reason = "timeout";
  const upd = await q1<{ id: string }>(
    `UPDATE fusion5_jobs
        SET status='error', error=$3, updated_at=now()
      WHERE id=$1 AND user_id=$2 AND status='running'
      RETURNING id`,
    [row.id, userId, reason]
  );
  if (upd) await settleFusion5Billing(row.id, userId, 0).catch(() => {});
  return { ...row, status: "error", result: null, error: reason };
}

/** deliver-once: งาน done ที่ถูกส่งให้ client แล้ว mark seen · กันคำตอบเก่าเด้งซ้ำทุกครั้งที่เปิดหน้า */
async function markJobSeen(row: Fusion5JobRow, userId: string): Promise<void> {
  if (row.status !== "done") return;
  await q(`UPDATE fusion5_jobs SET seen_at=now() WHERE id=$1 AND user_id=$2 AND seen_at IS NULL`, [row.id, userId]).catch(() => {});
}

function jobJson(row: Fusion5JobRow) {
  return publicAiPayload({
    jobId: row.id,
    status: row.status,
    result: row.result || null,
    error: row.error || null,
    question: row.question || "",
    sciences: row.sciences || [],
    profileIds: row.profile_ids || [],
    pairMode: row.pair_mode === true,
    resonance: row.resonance || null,
    guestBirths: Array.isArray(row.guest_births) ? row.guest_births : [], // r381: UI วาดชื่อ/resume ดวงชั่วคราวได้
    createdAt: row.created_at,
  });
}

async function logFusion5History(
  jobId: string,
  result: Record<string, unknown>,
  p: WorkerParams,
  status: "done" | "degraded" | "fail",
  spent: number,
  refunded: number
): Promise<string | null> {
  try {
    const fusion5 = (result.fusion5 && typeof result.fusion5 === "object" ? result.fusion5 as Record<string, unknown> : {});
    const panels = Array.isArray(fusion5.panels) ? fusion5.panels as Array<Record<string, unknown>> : [];
    const okPanels = panels.filter((x) => x.ok === true);
    const failed = panels.filter((x) => x.ok !== true).map((x) => String(x.science || x.model || "panel"));
    const judge = fusion5.judge && typeof fusion5.judge === "object" ? fusion5.judge as Record<string, unknown> : {};
    const answers = [
      ...(typeof result.reply === "string" && result.reply.trim()
        ? [{ role: "judge", model: JUDGE_MODEL, ok: judge.ok === true, reply: result.reply, science: "fusion5" }]
        : []),
      ...panels.filter((x) => x.reply).map((x) => ({
        role: "panel",
        model: x.model || x.science,
        ok: x.ok === true,
        reply: x.reply,
        science: x.science,
      })),
    ];
    const net = Math.max(0, spent - refunded);
    const responseMeta = {
      fusion_history_version: "sifu_fusion5_history_v1",
      fusion_status: status,
      fusion5,
      panel: panels.map((x) => ({
        model: x.model || x.science,
        science: x.science,
        ok: x.ok === true,
        reply: x.reply || null,
        error: x.error || null,
      })),
      answers,
      judge: { ok: judge.ok === true, model: judge.model || JUDGE_MODEL },
      judge_model: judge.model || JUDGE_MODEL,
      used_panel_fallback: judge.ok !== true && okPanels.length > 0,
      ai_answered_count: okPanels.length,
      ai_requested_count: panels.length,
      ai_failed_models: failed,
      spent,
      refunded,
      net_spent: net,
      billing: "chars", // ตรง sifu · ≈30 ตัวอักษร/1 ยาม
      ms: Date.now() - p.started,
      reason: "fusion5",
      run_id: jobId,
      thread_id: p.threadId,
      thread_profile_id: p.threadProfileId || p.profileIds[0],
      profileNames: p.births.map((b) => b.name),
      profileIds: p.profileIds,
      guest_births: p.guestBirths.length ? p.guestBirths : null, // r381: history เห็นดวงชั่วคราว (ชื่อ+วันเวลา+พิกัด · ไม่มี PII เกิน)
      sciences: p.runSciences,
      skipped: p.skipped,
      skipped_reasons: p.skippedReasons,
      resonance: p.resonance || null,   // r369: เก็บลง history ให้หน้า history เรียกดูได้
      user_state: { favorite: false, pinned: false, note: "", updated_at: null },
    };
    return await logResearchAiMessage({
      session: p.session,
      feature: "sifu_fusion",
      mode: "fusion5",
      topic: "fusion5",
      lang: p.lang,
      profileId: p.profileIds[0],
      question: p.question,
      answer: typeof result.reply === "string" ? result.reply : "",
      history: p.history,
      requestPayload: {
        mode: "fusion5",
        profileIds: p.profileIds,
        guestBirths: p.guestBirths.length ? p.guestBirths : undefined, // r381
        sciences: p.runSciences,
        thread_id: p.threadId,
        thread_profile_id: p.threadProfileId || p.profileIds[0],
        job_id: jobId,
      },
      responseMeta,
      model: "fusion5",
      status: status === "fail" ? "error" : "ok",
      error: status === "fail" ? "all_panels_failed" : null,
      spent: net,
      durationMs: Date.now() - p.started,
      cached: false,
      profileSnapshot: p.births.map((b, i) => ({
        id: b.profileId || `guest:${i + 1}`, // r381: guest ไม่มี profileId (ไม่เขียนตาราง profiles เด็ดขาด)
        name: b.name,
        birthDate: b.birthDate,
        birthTime: b.birthTime,
        timezone: "Asia/Bangkok",
        dayBoundary: b.dayBoundary,
        hasTime: b.hasTime,
        gender: b.gender,
        relationshipType: b.relationshipType,
        isGuest: b.isGuest === true,
      })),
      pillarsSnapshot: p.births.map((b, i) => ({ id: b.profileId || `guest:${i + 1}`, baziPillars: b.baziPillars })),
      threadId: p.threadId || jobId,
      threadProfileId: p.threadProfileId || p.profileIds[0],
      historyProfileIds: p.profileIds,
      predictionPhase: p.history.length ? "clarification" : "general",
      historyDroppedCount: 0,
      profileBindingStatus: "fusion5_profile_bound",
      auditQuality: "fusion5_packet_evidence",
    });
  } catch (e) {
    console.warn("[fusion5] history log failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

type FusionBillingResult = { charged: number; refunded: number; extra: number };

async function settleFusion5Billing(jobId: string, userId: string, targetCharge: number): Promise<FusionBillingResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query<{
      billing_status: string;
      yam_reserved: number;
      yam_charged: number;
      yam_refunded: number;
      yam_extra: number;
    }>(
      `SELECT billing_status,yam_reserved,yam_charged,yam_refunded,yam_extra
         FROM fusion5_jobs WHERE id=$1 AND user_id=$2 FOR UPDATE`,
      [jobId, userId]
    );
    const job = found.rows[0];
    if (!job) throw new Error("fusion_billing_job_missing");
    if (job.billing_status !== "reserved") {
      await client.query("COMMIT");
      return {
        charged: Number(job.yam_charged) || 0,
        refunded: Number(job.yam_refunded) || 0,
        extra: Number(job.yam_extra) || 0,
      };
    }

    const reserved = Math.max(0, Number(job.yam_reserved) || 0);
    const wanted = Math.max(0, Math.floor(targetCharge));
    let refunded = 0;
    let extra = 0;
    if (wanted < reserved) {
      refunded = reserved - wanted;
      const user = await client.query<{ hour_balance: number }>(
        `UPDATE users SET hour_balance=hour_balance+$2 WHERE id=$1 RETURNING hour_balance`,
        [userId, refunded]
      );
      if (!user.rows[0]) throw new Error("fusion_billing_user_missing");
      await client.query(
        `INSERT INTO hour_transactions
         (user_id,delta,reason,balance_after,ref_feature,ref_payment_id)
         VALUES ($1,$2,'refund_sifu_fusion5',$3,$4,$5)`,
        [userId, refunded, user.rows[0].hour_balance, FEATURE, `fusion5_job:${jobId}:refund`]
      );
    } else if (wanted > reserved) {
      const user = await client.query<{ old_balance: number; hour_balance: number }>(
        `WITH current AS (SELECT hour_balance AS old_balance FROM users WHERE id=$1 FOR UPDATE)
         UPDATE users SET hour_balance=GREATEST(0,hour_balance-$2)
         FROM current WHERE users.id=$1
         RETURNING current.old_balance,users.hour_balance`,
        [userId, wanted - reserved]
      );
      if (!user.rows[0]) throw new Error("fusion_billing_user_missing");
      extra = Math.max(0, Number(user.rows[0].old_balance) - Number(user.rows[0].hour_balance));
      if (extra > 0) {
        await client.query(
          `INSERT INTO hour_transactions
           (user_id,delta,reason,balance_after,ref_feature,ref_payment_id)
           VALUES ($1,$2,'spend_sifu_fusion5',$3,$4,$5)`,
          [userId, -extra, user.rows[0].hour_balance, FEATURE, `fusion5_job:${jobId}:extra`]
        );
      }
    }
    const charged = Math.max(0, reserved - refunded + extra);
    await client.query(
      `UPDATE fusion5_jobs
          SET billing_status=$2,yam_charged=$3,yam_refunded=$4,yam_extra=$5,billed_at=now(),updated_at=now()
        WHERE id=$1`,
      [jobId, charged > 0 ? "settled" : "refunded", charged, refunded, extra]
    );
    await client.query("COMMIT");
    return { charged, refunded, extra };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** 🔄 worker เบื้องหลัง · ไม่ผูก req.signal → user ปิดจอ/พับมือถือได้ งานวิ่งต่อบน server → เก็บผลลง DB
 *  เรียกแบบ detached (ไม่ await) · ต้องไม่ throw ออกนอก (อัปเดต job เสมอ ทั้งสำเร็จ/พลาด) */
async function processFusion5(jobId: string, p: WorkerParams): Promise<void> {
  // billing: escrow จองตอน POST · นับยามจริงจากความยาวคำตอบ · settle ท้ายงาน (คืนส่วนเกิน / ดูดเพิ่ม)
  // ห้ามส่ง hour_balance เข้า AI prompt — gate อยู่ที่ server เท่านั้น
  let actualYam = 0; // Σ charsToHours ต่อคำตอบ (แต่ละ panel/judge ขั้นต่ำ 1 ถ้ามีข้อความ)
  let settled = false;
  try {
    const { cookie, runSciences, births, profileIds, question, lang, reservedYam, skipped, userId } = p;
    const timingRef = resolveFusionTimingReference(question, new Date());

    function tallyReply(text: string | undefined | null): void {
      const s = String(text || "").trim();
      if (!s) return;
      actualYam += charsToHours(s.length);
    }

    // panel แยกศาสตร์ (ขนาน) · ทุก path คืน {ok:false} ไม่ throw · ⚠️ ไม่ส่ง signal (งานต้องวิ่งจบแม้ client หลุด)
    const panels: PanelOut[] = await Promise.all(runSciences.map(async (science): Promise<PanelOut> => {
      const bind = DISCIPLINES[science];
      const label = bind.labelTh;
      try {
        if (science === "bazi") {
          // r381: วนตาม births (คน) ไม่ใช่ profileIds — รองรับดวงชั่วคราวปนโปรไฟล์ · โหมดเดี่ยว = คนแรกคนเดียว (เดิม)
          const targetBirths = births.length > 1 ? births : [births[0]];
          const parts: string[] = [];
          const pairPacket = births.length > 1 ? renderBaziPairInteractionPacket(births, lang) : "";
          const timingNote = `\n\nจังหวะเวลาที่ผู้ใช้ถาม: ${timingRef.label} · วันอ้างอิงจร ${timingRef.refDate.toISOString().slice(0, 10)} · ปีเป้าหมาย ${timingRef.targetYear} (ถ้าคำถามถามปี/วันที่นี้ ให้ใช้เป็นแกนปีจร ไม่ใช่ปีปัจจุบัน)\nวัยจรทั้งชีวิต: ดูตาราง 大運 + ปีครอบใน packet · ระบุช่วง active · ไล่ อดีตใกล้/ปัจจุบัน/ถัดไป · ห้ามอ่านแค่พื้นดวงโดยไม่แตะวัยจร`;
          let okCount = 0;
          let lastError = "bazi_failed";
          const usedModels = new Set<string>();
          for (let i = 0; i < targetBirths.length; i++) {
            const person = targetBirths[i];
            const note = births.length > 1
              ? `\n\n${BAZI_DECISIVE_READING_NOTE}\n\n${renderFusionSpecificityNote(births, i)}\n\n${pairPacket}\n\n(ดูคู่ระหว่าง ${births.map((b) => b.name).join(" และ ")} — วิเคราะห์ ${births[i].name}; ใช้เฉพาะ PAIR_INTERACTION_PACKET bazi เป็นรายการปฏิกิริยาข้ามคน ห้ามสร้างคู่เพิ่มเอง · แยกแรงหนุนกับแรงเสียดทานให้ชัด อย่าให้จุดดีจุดเดียวกลบข้อเสียใหญ่ หรือข้อเสียจุดเดียวกลบแรงหนุนหลัก)`
              : `\n\n${BAZI_DECISIVE_READING_NOTE}\n\n${renderFusionSpecificityNote(births, i)}\n\n(โหมดเดี่ยว: มีผังเดียวโดยเจตนา · อย่านับ "ไม่มีดวงคู่/ไม่มีปฏิกิริยาข้ามสองผัง" เป็นข้อมูลขาดของการดูดวงเดี่ยว เว้นแต่คำถามผู้ใช้ถามเรื่องดูคู่/สมพงษ์โดยตรง)`;
            let r: Awaited<ReturnType<typeof callSifu>> | null = null;
            // r513: วนโมเดล + rebuild guest externalPrompt ตาม cap โมเดลนั้น (claude 2M / grok 500K / codex 280K)
            for (const model of [bind.defaultModel, ...bind.fallbackModels]) {
              let payload: Record<string, unknown>;
              if (person.isGuest && person.guestCalc) {
                // r381 guest: /api/sifu POST ไม่รับ birth ตรง (LOCKED · ไม่แตะ) → ส่ง externalPrompt เหมือน 4 ศาสตร์
                // packet สร้างเองผ่าน calcBazi (Layer 1 · คำนวณแล้วตอน POST) + buildStructuredChartPacket + renderChartPrompt
                const guestPrompt = await buildGuestBaziPanelPrompt({
                  focus: person as GuestComputedBirth,
                  allNames: births.map((b) => b.name || "ดวง"),
                  question,
                  lang,
                  timingLine: timingNote.trim(),
                  notes: [BAZI_DECISIVE_READING_NOTE, renderFusionSpecificityNote(births, i)],
                  pairPacket: births.length > 1 ? pairPacket : undefined,
                  model,
                });
                payload = {
                  message: question,
                  externalPrompt: withHistoryPrompt(guestPrompt, p.history),
                  lang,
                  threadId: p.threadId,
                  historyProfileIds: profileIds,
                  fusionRunId: jobId,
                };
              } else {
                // profile bazi ไป /api/sifu ปกติ (knowledge tier แยกตาม model ฝั่ง route อยู่แล้ว)
                payload = {
                  profileId: person.profileId,
                  message: question + timingNote + note,
                  lang,
                  history: p.history,
                  threadId: p.threadId,
                  threadProfileId: person.profileId,
                  historyProfileIds: profileIds,
                  fusionRunId: jobId,
                };
              }
              r = await callSifu(cookie, payload, model);
              if (r.ok && r.reply) {
                usedModels.add(model);
                break;
              }
              lastError = r.error || lastError;
            }
            if (r?.ok && r.reply) { okCount++; parts.push(births.length > 1 ? `【${targetBirths[i].name}】\n${r.reply}` : r.reply); }
          }
          // ไม่ refund แบบ flat costYam · หักตามตัวอักษรเฉพาะคำตอบที่สำเร็จ
          const modelLabel = usedModels.size ? Array.from(usedModels).join("+") : bind.defaultModel;
          if (okCount > 0) {
            const joined = parts.join("\n\n");
            tallyReply(joined);
            return { science, label, model: modelLabel, ok: true, reply: joined };
          }
          return { science, label, model: bind.defaultModel, ok: false, error: `bazi_failed:${lastError}`.slice(0, 120) };
        }
        // r513 model-aware: สร้าง prompt ใหม่ทุกโมเดล (cap ตาม knowledgeCapChars)
        // ห้าม reuse externalPrompt ของ Claude 2M ตอน fallback Codex/Grok
        let lastRes: Awaited<ReturnType<typeof callSifu>> = { ok: false, error: "no_model_tried" };
        let usedModel = bind.defaultModel;
        for (const model of [bind.defaultModel, ...bind.fallbackModels]) {
          const prompt = withHistoryPrompt(
            buildSciencePrompt(science, births, question, lang, timingRef.refDate, timingRef, { model }),
            p.history,
          );
          const panelPayload = {
            message: question,
            externalPrompt: prompt,
            lang,
            profileId: profileIds[0],
            threadId: p.threadId,
            threadProfileId: p.threadProfileId || profileIds[0],
            historyProfileIds: profileIds,
            fusionRunId: jobId,
          };
          lastRes = await callSifu(cookie, panelPayload, model);
          if (lastRes.ok && lastRes.reply) {
            usedModel = model;
            break;
          }
        }
        if (lastRes.ok && lastRes.reply) tallyReply(lastRes.reply);
        return { science, label, model: usedModel, ...lastRes };
      } catch (e) {
        return { science, label, model: bind.defaultModel, ok: false, error: e instanceof Error ? e.message.slice(0, 120) : "engine_error" };
      }
    }));

    const okPanels = panels.filter((x) => x.ok && x.reply);

    let judge: { ok: boolean; reply?: string; error?: string; model: string } = { ok: false, model: JUDGE_MODEL };
    const wantedJudge = runSciences.length >= 2;
    if (okPanels.length >= 2) {
      try {
        // r373: resonance block ส่งเฉพาะเมื่อมีเนื้อจริง (shell ที่ถือ daySniper อย่างเดียว = ไม่ส่ง RESONANCE_PACKET เปล่า)
        const resBlock = p.resonance && (p.resonance.perPerson.length > 0 || (p.resonance.r4Pairs || []).length > 0)
          ? renderResonanceBlockTh(p.resonance) : undefined;
        const dsBlock = p.resonance?.daySniper ? renderDaySniperTh(p.resonance.daySniper) : undefined;
        // r399 · Q&A judge multi-year (audit r2L-9 ข้อ1): คำถามครอบช่วงปี → ป้อนไทม์ไลน์หลายปี deterministic ให้ judge เหมือน book
        //   คำนวณจาก renderMultiYearBlock ต่อดวง×ศาสตร์ที่อ่านสำเร็จ (คุมงบ ~6K · shrink ท้ายสุดใน buildJudgePrompt)
        //   หมายเหตุ: bazi ไม่มี branch ใน renderMultiYearBlock (大運/流年 อยู่ใน chart-extensions LOCKED · ข้ามตามกฎ) → คืนหัวเปล่า ไม่ push
        let myBlock: string | undefined;
        const yearRange = resolveFusionYearRange(question, timingRef.refDate);
        if (yearRange) {
          const parts: string[] = [];
          const mySciences = okPanels.map((x) => x.science).filter((s) => s !== "bazi");
          outer: for (const b of births) {
            const like: FusionBirthLike = { name: b.name, dtUTC: b.dtUTC, lat: b.lat, lng: b.lng, hasTime: b.hasTime, gender: b.gender };
            for (const s of mySciences) {
              try { const blk = renderMultiYearBlock(s, like, yearRange.startYear, yearRange.endYear); if (blk && blk.trim()) parts.push(blk.trim()); } catch { /* ศาสตร์ไม่มี multi-year = ข้าม */ }
              if (parts.join("\n").length > 5_500) break outer;
            }
          }
          myBlock = parts.length ? parts.join("\n\n").slice(0, 6_000) : undefined;
        }
        // ศาสตร์ที่ 7: ถ้า user ติ๊กเลือกลายมือ (includePalm) → ดึงลายมือที่บันทึก → ต่อเข้า judge เป็นบทที่ 7
        let palmBlock: string | undefined;
        if (p.includePalm) {
          try {
            const pr = await q1<{ reading: Record<string, unknown>; clarity: number | null }>(
              `SELECT reading, clarity FROM palm_readings WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1`, [userId]);
            if (pr?.reading) palmBlock = renderPalmBlock(pr.reading, pr.clarity);
          } catch { /* ไม่มีตาราง/ลายมือ = ข้าม */ }
        }
        const jp = buildJudgePrompt(okPanels.map((x) => ({ science: x.science, reply: x.reply! })), births, question, lang, resBlock, dsBlock, myBlock, palmBlock);
        const jr = await callSifu(cookie, { message: question, externalPrompt: jp, lang }, JUDGE_MODEL);
        judge = { ...jr, model: JUDGE_MODEL };
        if (judge.ok && judge.reply) tallyReply(judge.reply);
      } catch (e) { judge = { ok: false, error: e instanceof Error ? e.message.slice(0, 120) : "judge_error", model: JUDGE_MODEL }; }
    }

    // One transaction owns settlement for this job. A stalled BullMQ retry can
    // re-enter safely without charging or refunding the account twice.
    if (okPanels.length === 0) actualYam = 0;
    const billing = await settleFusion5Billing(jobId, userId, okPanels.length ? actualYam : 0);
    const refunded = billing.refunded;
    const extraSpent = billing.extra;
    settled = true;

    const netSpent = billing.charged;
    const reply = judge.ok && judge.reply ? judge.reply
      : okPanels.length === 1 ? okPanels[0].reply!
      : okPanels.length ? okPanels.map((x) => `【${x.label}】\n${x.reply}`).join("\n\n")
      : fusion5FailureReply(p.lang);

    const result = {
      reply, model: "fusion5",
      fusion5: {
        profileNames: births.map((b) => b.name),
        pairMode: births.length > 1,
        panels: panels.map((x) => ({ science: x.science, label: x.label, model: x.model, ok: x.ok, reply: x.reply || null, error: x.error || null })),
        judge: { ok: judge.ok, model: judge.model },
        skipped,
        skippedReasons: p.skippedReasons,
        yam: {
          billing: "chars+escrow",
          escrow: reservedYam,
          actual_chars_yam: actualYam,
          extra: extraSpent,
          charged: netSpent,
          refunded,
          chars_per_yam: Math.max(1, Number(process.env.CREDIT_CHARS_PER_YAM || 30)),
        },
      },
    };
    const fusionStatus: "done" | "degraded" | "fail" = okPanels.length === 0
      ? "fail"
      : (okPanels.length < panels.length || (wantedJudge && !judge.ok)) ? "degraded" : "done";
    const historyId = await logFusion5History(jobId, result, p, fusionStatus, reservedYam + extraSpent, refunded);
    if (historyId) (result.fusion5 as Record<string, unknown>).historyId = historyId;
    await q(`UPDATE fusion5_jobs SET status='done', result=$2, updated_at=now() WHERE id=$1`, [jobId, JSON.stringify(result)]);
    await q(`UPDATE hourkey_jobs SET status='succeeded',finished_at=now(),heartbeat_at=now(),updated_at=now() WHERE id=$1`, [jobId]).catch(() => {});
    notifyFusionDone(p.userId); // r380: fire-and-forget · push-sender เคารพ prefs/quiet hours + ไม่ throw
  } catch (e) {
    // error กลางทาง · ยังไม่ settle = คืน escrow ทั้งก้อน (AI อาจวิ่งไปแล้วบางส่วน · ยอม trade-off นี้)
    if (!settled && p.reservedYam > 0) await settleFusion5Billing(jobId, p.userId, 0).catch(() => {});
    await q(`UPDATE fusion5_jobs SET status='error', error=$2, updated_at=now() WHERE id=$1`, [jobId, (e instanceof Error ? e.message : String(e)).slice(0, 200)]).catch(() => {});
    await q(`UPDATE hourkey_jobs SET status='failed',error_code='fusion_failed',finished_at=now(),heartbeat_at=now(),updated_at=now() WHERE id=$1`, [jobId]).catch(() => {});
  }
}

export async function POST(req: Request) {
  let userId = "";
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (body.__worker === true) return processQueuedFusion5(req, body);
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "not_logged_in" }, { status: 401 });
    const orgId = session.orgId ?? null;
    userId = session.userId;

    const profileIds = (Array.isArray(body.profileIds) ? body.profileIds : [body.profileId])
      .map(cleanId).filter((x): x is string => !!x).slice(0, 4);
    const sciences = (Array.isArray(body.sciences) ? body.sciences : [])
      .map((s) => String(s) as ScienceId)
      .filter((s) => DISCIPLINES[s]?.available);
    const includePalm = body.includePalm === true; // ศาสตร์ที่ 7: ลายมือ (toggle · ดึงที่บันทึกไว้)
    const question = String(body.question || body.message || "").trim().slice(0, 2000);
    const lang = isSifuAnswerLang(body.lang) ? String(body.lang) : "th"; // r414-i18n9: 9 ภาษา (เดิม th/en/zh)
    const history = cleanHistory(body.history);
    const threadId = cleanThreadId(body.threadId || body.thread_id);
    const threadProfileId = cleanId(body.threadProfileId || body.historyProfileId) || profileIds[0] || null;

    // r381: "ดวงชั่วคราว" (guest births · additive) — validate ก่อนหักยาม/สร้างงาน
    // ลำดับดวงในงาน (document ให้ UI): profileIds ตามลำดับที่ส่งก่อน แล้วต่อด้วย guestBirths ตามลำดับที่ส่ง
    const guestParsed = parseGuestBirths(body.guestBirths);
    if (!guestParsed.ok) {
      return NextResponse.json({ error: guestParsed.error, guestIndex: guestParsed.index }, { status: 400 });
    }
    const guestInputs = guestParsed.list;
    if (profileIds.length + guestInputs.length > 4) {
      return NextResponse.json({ error: "too_many_births", max: 4 }, { status: 400 });
    }

    if (!profileIds.length && !guestInputs.length) return NextResponse.json({ error: "profile_required" }, { status: 400 });
    if (!sciences.length) return NextResponse.json({ error: "no_science_selected" }, { status: 400 });
    if (!question) return NextResponse.json({ error: "no_question" }, { status: 400 });

    const births: FusionBirthData[] = [];
    for (const pid of profileIds) {
      const b = await loadBirth(pid, orgId);
      if (!b) return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
      births.push(b);
    }
    // r381: guest ต่อท้าย profiles · เสาคำนวณด้วย calcBazi (Layer 1) · ไม่เขียนตาราง profiles เด็ดขาด
    for (let gi = 0; gi < guestInputs.length; gi++) {
      try {
        births.push(await buildGuestFusionBirth(guestInputs[gi]));
      } catch (e) {
        console.warn("[fusion5] guest birth calc failed:", e instanceof Error ? e.message : e);
        return NextResponse.json({ error: "invalid_guest_birth", guestIndex: gi }, { status: 400 });
      }
    }

    const allHaveTime = births.every((b) => b.hasTime);
    let runSciences = sciences.filter((s) => !DISCIPLINES[s].needsBirthTime || allHaveTime);
    const skipped = sciences.filter((s) => DISCIPLINES[s].needsBirthTime && !allHaveTime);
    const skippedReasons: Partial<Record<ScienceId, string>> = {};
    for (const s of skipped) skippedReasons[s] = "no_birth_time";
    // bazi group: PAIR_INTERACTION_PACKET bazi (buildSynastry) รองรับ 2 ดวงเท่านั้น · กลุ่ม 3-4 ดวง
    // → ตัด bazi ออกตรงๆ (ไม่คิดยาม · additive · ไม่ hack /api/sifu ที่ LOCKED) แจ้งเหตุผลชัดใน skippedReasons
    if (births.length > 2 && runSciences.includes("bazi")) {
      runSciences = runSciences.filter((s) => s !== "bazi");
      skipped.push("bazi");
      skippedReasons.bazi = "bazi_group_not_supported";
    }
    if (!runSciences.length) {
      const onlyGroupSkip = skipped.length > 0 && skipped.every((s) => skippedReasons[s] === "bazi_group_not_supported");
      return NextResponse.json({ error: onlyGroupSkip ? "bazi_group_not_supported" : "all_sciences_need_birthtime", skipped, skippedReasons }, { status: 400 });
    }

    const suppliedIdempotency = String(req.headers.get("idempotency-key") || "")
      .replace(/[^a-zA-Z0-9_.:-]/g, "")
      .slice(0, 80);
    const idempotencyKey = suppliedIdempotency || createHash("sha256")
      .update(JSON.stringify({ userId, profileIds, guestInputs, runSciences, includePalm, question, bucket: Math.floor(Date.now() / 600_000) }))
      .digest("hex");
    const duplicate = await q1<{ id: string; status: string }>(
      `SELECT id,status FROM fusion5_jobs WHERE user_id=$1 AND idempotency_key=$2 LIMIT 1`,
      [userId, idempotencyKey]
    );
    if (duplicate) {
      return NextResponse.json({ jobId: duplicate.id, status: duplicate.status, deduplicated: true, threadId: threadId || duplicate.id });
    }

    const runningCnt = await q1<{ n: string }>(`SELECT count(*)::text AS n FROM fusion5_jobs WHERE user_id=$1 AND status IN ('queued','running') AND created_at > now() - interval '25 min'`, [userId]);
    if (runningCnt && Number(runningCnt.n) >= 2) return NextResponse.json({ error: "too_many_running" }, { status: 429 });

    // สิทธิ์: จำกัดจำนวนศาสตร์/ดวงตาม trial|free|premium|master
    const { getProductAccess, entitlementDenied } = await import("@/lib/product-entitlement");
    const access = await getProductAccess(userId);
    if (!access) return NextResponse.json(entitlementDenied("not_entitled"), { status: 403 });
    if (!access.fusion_suite) {
      return NextResponse.json(
        entitlementDenied("fusion_suite_locked", {
          message: "Fusion เปิดตั้งแต่ช่วงทดลองขึ้นไป · อัปเกรดที่ /pricing",
          plan: access.plan,
        }),
        { status: 403 }
      );
    }
    if (runSciences.length > access.fusion_max_sciences) {
      return NextResponse.json(
        entitlementDenied("fusion_science_limit", {
          max: access.fusion_max_sciences,
          requested: runSciences.length,
          plan: access.plan,
        }),
        { status: 403 }
      );
    }
    if (births.length > access.fusion_max_profiles) {
      return NextResponse.json(
        entitlementDenied("fusion_profile_limit", {
          max: access.fusion_max_profiles,
          requested: births.length,
          plan: access.plan,
        }),
        { status: 403 }
      );
    }

    // ยาม: จองขั้นต่ำตามจำนวนศาสตร์×ดวง (กันยามน้อยติ๊กหลายศาสตร์) · settle ตามตัวอักษรท้ายงาน
    // ไม่ส่งยอดยามเข้า AI — gate อยู่ server เท่านั้น
    const escrow = fusionEscrowYam(runSciences.length, births.length);
    const balNow = await getHourBalanceForUser(userId);
    if (balNow < escrow) {
      return NextResponse.json(
        {
          error: "insufficient_hours",
          needed: escrow,
          balance: balNow,
          billing: "chars+escrow",
          escrow_per_panel: ESCROW_YAM_PER_PANEL,
          message:
            balNow <= 0
              ? "ยามหมด · เติมที่ /pricing หรือ /account"
              : `ยามไม่พอสำหรับ ${runSciences.length} ศาสตร์ × ${births.length} ดวง (ต้องมีอย่างน้อย ${escrow} ยาม) · ลดจำนวนศาสตร์หรือเติมยาม`,
        },
        { status: 402 }
      );
    }
    // r369: Cross-Science Resonance — engine deterministic หา "จุดหลายศาสตร์ตรงกัน" ก่อน AI (additive)
    // คำนวณ sync ตอน POST (มีงบเวลาใน buildResonance: คนแรกเสมอ · คนถัดไปข้ามถ้าเกิน 8s) · พังทั้งก้อน = null (ไม่ล้ม job)
    let resonance: FusionResonance | null = null;
    const timingRefPost = resolveFusionTimingReference(question, new Date());
    const resonanceSciences = runSciences.filter((s) => (RESONANCE_SCIENCES as ScienceId[]).includes(s));
    if (resonanceSciences.length >= 2) {
      try {
        resonance = buildResonance(births, resonanceSciences, timingRefPost.targetYear, timingRefPost.refDate);
      } catch (e) {
        console.warn("[fusion5] resonance failed:", e instanceof Error ? e.message : e);
        resonance = null;
      }
    }

    // r373: Day Sniper — engine deterministic ชี้ "วันลั่นไก" ระดับวัน (เข็มอิสระ A/B/C) · additive
    // คำนวณ sync ตอน POST (งบเวลาใน buildDaySniper: focus เสมอ · คนที่ 2 ข้ามถ้าเกิน 5s) · พัง = ไม่ล้ม job
    try {
      const range = resolveDaySniperRange(question, timingRefPost);
      // r384: วันลั่นไกยึดดวงเจ้าของบัญชี (is_self) เท่านั้น — ถามคู่/กลุ่มแล้ววันของทุกดวงเทกองรวมจนอ่านไม่ออก · ไม่มี self ในคำถาม (ดูให้คนอื่น/guest ล้วน) → ใช้ดวงแรกของคำถาม
      const sniperBirths = births.filter((b) => b.isSelf).slice(0, 1);
      const daySniper = buildDaySniper(sniperBirths.length ? sniperBirths : births.slice(0, 1), question, range.fromISO, range.toISO);
      if (resonance) {
        resonance.daySniper = daySniper;
      } else {
        // ไม่มี resonance (ศาสตร์ในชั้น <2) → เก็บ daySniper บน shell jsonb เดิม (additive · consumer เดิมเห็น perPerson ว่าง = ไม่ render resonance)
        resonance = {
          version: "resonance_v1", targetYear: timingRefPost.targetYear, sciences: [], perPerson: [], r4Pairs: [],
          daySniper, summaryTh: "", notes: ["shell r373: เก็บ daySniper อย่างเดียว (resonance ไม่เข้าเงื่อนไขคำนวณ)"], computeMs: 0,
        };
      }
    } catch (e) {
      console.warn("[fusion5] day sniper failed:", e instanceof Error ? e.message : e);
    }

    const jobId = randomUUID();
    const storedPayload: StoredWorkerParams = {
      session, userId, runSciences, births, profileIds, guestBirths: guestInputs,
      question, lang, reservedYam: escrow, skipped, skippedReasons, history,
      threadId: threadId || jobId, threadProfileId, started: Date.now(), resonance, includePalm,
    };
    const client = await pool.connect();
    let reservationFailed = false;
    try {
      await client.query("BEGIN");
      const held = await client.query<{ hour_balance: number }>(
        `UPDATE users SET hour_balance=hour_balance-$2
          WHERE id=$1 AND hour_balance >= $2
          RETURNING hour_balance`,
        [userId, escrow]
      );
      if (!held.rows[0]) {
        reservationFailed = true;
        await client.query("ROLLBACK");
      } else {
        await client.query(
          `INSERT INTO hour_transactions
           (user_id,delta,reason,balance_after,ref_feature,ref_payment_id)
           VALUES ($1,$2,'spend_sifu_fusion5_pre',$3,$4,$5)`,
          [userId, -escrow, held.rows[0].hour_balance, FEATURE, `fusion5_job:${jobId}:reserve`]
        );
        await client.query(
          `INSERT INTO fusion5_jobs
           (id,user_id,org_id,status,question,sciences,profile_ids,pair_mode,resonance,guest_births,idempotency_key,payload,billing_status,yam_reserved)
           VALUES ($1,$2,$3,'queued',$4,$5,$6,$7,$8,$9,$10,$11,'reserved',$12)`,
          [jobId, userId, orgId, question, runSciences, profileIds, births.length > 1,
           resonance ? JSON.stringify(resonance) : null,
           guestInputs.length ? JSON.stringify(guestInputs) : null,
           idempotencyKey, JSON.stringify(storedPayload), escrow]
        );
        await client.query(
          `INSERT INTO hourkey_jobs
           (id,user_id,org_id,feature,queue_name,status,priority,idempotency_key,request_hash,max_attempts)
           VALUES ($1,$2,$3,'fusion5','hourkey-ai-fusion','waiting',40,$4,$4,3)`,
          [jobId, userId, orgId, idempotencyKey]
        );
        await client.query("COMMIT");
      }
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    if (reservationFailed) {
      return NextResponse.json({ error: "insufficient_hours", needed: escrow, balance: await getHourBalanceForUser(userId), billing: "chars+escrow" }, { status: 402 });
    }

    try {
      await enqueueFusionJob(jobId);
    } catch (error) {
      await settleFusion5Billing(jobId, userId, 0).catch(() => {});
      await q(`UPDATE fusion5_jobs SET status='error',error='queue_unavailable',updated_at=now() WHERE id=$1`, [jobId]).catch(() => {});
      await q(`UPDATE hourkey_jobs SET status='failed',error_code='queue_unavailable',finished_at=now(),updated_at=now() WHERE id=$1`, [jobId]).catch(() => {});
      console.error("[fusion5/queue]", error instanceof Error ? error.message : error);
      return NextResponse.json({ error: "queue_unavailable" }, { status: 503 });
    }

    return NextResponse.json({
      jobId,
      status: "queued",
      threadId: threadId || jobId,
      yam: {
        billing: "chars+escrow",
        escrow,
        escrow_per_panel: ESCROW_YAM_PER_PANEL,
        note: "escrow_then_settle_by_reply_length",
      },
      skipped,
      skippedReasons,
      profileNames: births.map((b) => b.name),
      pairMode: births.length > 1,
      guestBirths: guestInputs,
      resonance,
    });
  } catch {
    return NextResponse.json({ error: "fusion5_error" }, { status: 500 });
  }
}

/** poll ผลงาน (user-scoped) · UI เรียกซ้ำจน status!=running */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "not_logged_in" }, { status: 401 });
  const url = new URL(req.url);
  const latest = url.searchParams.get("latest") === "1" || url.searchParams.get("resume") === "1";
  const jobId = cleanId(url.searchParams.get("jobId"));

  if (latest && !jobId) {
    const profileIds = cleanIdListFromSearch(url);
    const question = cleanQuestion(url.searchParams.get("question"));
    const sciences = cleanScienceList(url.searchParams.get("sciences"));
    const where = [
      "user_id=$1",
      "created_at > now() - interval '30 min'",
    ];
    const params: unknown[] = [session.userId];
    const push = (v: unknown) => {
      params.push(v);
      return `$${params.length}`;
    };

    if (profileIds.length >= 2) {
      where.push(`profile_ids=${push(profileIds)}::text[]`);
    } else if (profileIds.length === 1) {
      where.push(`profile_ids @> ${push(profileIds)}::text[]`);
    }
    if (question) where.push(`question=${push(question)}`);
    if (sciences.length) where.push(`sciences && ${push(sciences)}::text[]`);
    // ไม่มีคำถามจาก pending client = กู้งานที่ยัง running + งาน done ที่ยังไม่เคยแสดงผล (deliver-once ผ่าน seen_at)
    // → มือถือพับจอจนงานเสร็จ + localStorage หาย ก็ยังได้คำตอบกลับ · แสดงแล้ว mark seen ไม่เด้งซ้ำ
    if (!question) where.push(`(status IN ('queued','running') OR (status='done' AND seen_at IS NULL))`);

    const row = await q1<Fusion5JobRow>(
      `SELECT id, status, result, error, created_at::text AS created_at,
              question, sciences, profile_ids, pair_mode, resonance, guest_births
         FROM fusion5_jobs
        WHERE ${where.join(" AND ")}
        ORDER BY created_at DESC
        LIMIT 1`,
      params
    );
    if (!row) return NextResponse.json({ error: "job_not_found" }, { status: 404 });
    const safeRow = await reconcileStaleJob(row, session.userId);
    await markJobSeen(safeRow, session.userId);
    return NextResponse.json(jobJson(safeRow), { headers: { "Cache-Control": "no-store, max-age=0" } });
  }

  if (!jobId) return NextResponse.json({ error: "bad_jobId" }, { status: 400 });
  const row = await q1<Fusion5JobRow>(
    `SELECT id, status, result, error, created_at::text AS created_at,
            question, sciences, profile_ids, pair_mode, resonance, guest_births
       FROM fusion5_jobs WHERE id=$1 AND user_id=$2`,
    [jobId, session.userId]
  );
  if (!row) return NextResponse.json({ error: "job_not_found" }, { status: 404 });
  const safeRow = await reconcileStaleJob(row, session.userId);
  await markJobSeen(safeRow, session.userId);
  return NextResponse.json(jobJson(safeRow), { headers: { "Cache-Control": "no-store, max-age=0" } });
}
