/**
 * Module · ตาราพละ (Tārābala · ताराबल) — r374 phase-3 · opt-in · หมวด ③ เฉพาะดวงคุณ
 * =====================================================================
 * "กำลังดาวฤกษ์ส่วนตัว" ของมุหูรตะอินเดีย: เทียบนักษัตรกำเนิด (janma nakṣatra =
 * จันทร์ sidereal Lahiri ณ เวลาเกิด) กับนักษัตรของวัน (จันทร์ sidereal ณ กลาง slot)
 *
 * สูตรนับ (มาตรฐานเดียวกันทุกตำรา · Muhūrta Cintāmaṇi + ปฏิทินปัญจางคะอินเดียใต้
 * ที่ใช้แพร่หลาย เช่น Drik Panchang):
 *   count = ((dayNak − janmaNak + 27) mod 27) + 1   (นับรวมต้นทาง · janma เอง = 1)
 *   tārā  = ((count − 1) mod 9) + 1
 * ตาราง Tārā 9 ชั้น (ตารางมาตรฐาน):
 *   1 Janma ชนมะ         = กลาง · ตำราให้ระวังงานเสี่ยงต่อร่างกาย (เตือน · ไม่ตัด)
 *   2 Sampat สัมปัต       = ดี (ทรัพย์/ความสำเร็จ)         → +4
 *   3 Vipat วิปัต         = ร้าย (อันตราย/สูญเสีย)          → cap 50
 *   4 Kṣema เกษมะ        = ดี (สวัสดิภาพ)                  → +4
 *   5 Pratyak ปรัตยัก     = ร้าย (อุปสรรค/ขัดขวาง)          → cap 50
 *   6 Sādhana สาธนะ      = ดี (สำเร็จตามเป้า)              → +4
 *   7 Naidhana ไนธนะ     = ร้ายสุด (วธตารา)                → cap 50
 *   8 Mitra มิตระ         = ดี (มิตร)                       → +4
 *   9 Parama Maitra ปรมไมตระ = ดีสุด                       → +4
 *
 * ⚠️ opt-in เหมือน sky modules r372 · ต้องมีโปรไฟล์ (peopleIds → PersonProfile):
 *    ไม่มีโปรไฟล์ หรือ parse วันเกิดไม่ได้ → status "missing" (ข้ามเงียบ ๆ · zero-effect
 *    เพราะ combineScores ข้าม module ที่ missing)
 * ⚠️ tara_bala ไม่อยู่ใน UNIVERSAL_MODULES / DATEPICK_HARD_MODULES / PERSONAL_MODULES —
 *    aj_ephemeris_cache + aj_personal_cache ไม่มีคอลัมน์นี้ (ใส่ = SQL error → ฤกษ์หาย)
 *    ตัดฤกษ์ผ่าน caps (max 50) ใน combineScores + enforceSkyCaps เท่านั้น
 */
import type { ModuleResult, Reason, CapRule, CandidateSlot, ActivityType, PersonProfile } from "../types";
import { eclipticLon, norm360 } from "@/lib/astro-core/ephemeris";
import { lahiriAyanamsa } from "@/lib/astro-core/ayanamsa";
import { NAKSHATRA_SPAN, NAKSHATRAS } from "@/lib/astro/vedic/tables";
import { slotWindowUtc, evictFifo } from "./sky-shared";

/** ตาราง Tārā 9 ชั้น (ไทยทับศัพท์ + Latin + ดี/ร้าย) — ตารางมาตรฐาน Tarabala */
export const TARA_TABLE: { th: string; sa: string; kind: "good" | "bad" | "neutral" }[] = [
  { th: "ชนมะ", sa: "Janma", kind: "neutral" },        // 1
  { th: "สัมปัต", sa: "Sampat", kind: "good" },         // 2
  { th: "วิปัต", sa: "Vipat", kind: "bad" },            // 3
  { th: "เกษมะ", sa: "Kṣema", kind: "good" },           // 4
  { th: "ปรัตยัก", sa: "Pratyak", kind: "bad" },        // 5
  { th: "สาธนะ", sa: "Sādhana", kind: "good" },         // 6
  { th: "ไนธนะ", sa: "Naidhana", kind: "bad" },         // 7
  { th: "มิตระ", sa: "Mitra", kind: "good" },           // 8
  { th: "ปรมไมตระ", sa: "Parama Maitra", kind: "good" },// 9
];

export const TARA_GOOD_DELTA = 4;
export const TARA_BAD_CAP = 50;

/** นับจากนักษัตรกำเนิดถึงนักษัตรวัน (นับรวมต้นทาง) → count 1-27 · tārā 1-9 */
export function taraOf(janmaNak: number, dayNak: number): { count: number; tara: number } {
  const j = ((janmaNak % 27) + 27) % 27;
  const d = ((dayNak % 27) + 27) % 27;
  const count = ((d - j + 27) % 27) + 1;
  return { count, tara: ((count - 1) % 9) + 1 };
}

/** จันทร์ sidereal (Lahiri) → index นักษัตร 0-26 */
export function nakshatraIndexAt(date: Date): number {
  const moonSid = norm360(eclipticLon("Moon", date) - lahiriAyanamsa(date));
  return Math.floor(moonSid / NAKSHATRA_SPAN) % 27;
}

/** parse birth_datetime จาก aj_user_profiles (::text · "YYYY-MM-DD HH:MM:SS" เวลาไทย ไม่มี tz)
 *  ถ้า string มี timezone อยู่แล้ว (Z/+hh:mm) ใช้ตามนั้น · parse ไม่ได้ → null (module ข้าม) */
export function parseBirthDatetime(s: string | null | undefined): Date | null {
  if (!s || typeof s !== "string") return null;
  let t = s.trim().replace(" ", "T");
  if (!/(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(t)) t += "+07:00"; // DB เก็บเวลาท้องถิ่นไทย
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d;
}

const _janmaCache = new Map<string, number | null>();
const JANMA_CACHE_MAX = 2000;

/** นักษัตรกำเนิดจาก birthDatetime string (cache ราย string · null = parse ไม่ได้) */
export function janmaNakshatraOf(birthDatetime: string | null | undefined): number | null {
  const key = String(birthDatetime || "");
  if (!key) return null;
  if (_janmaCache.has(key)) return _janmaCache.get(key) ?? null;
  const d = parseBirthDatetime(key);
  const nak = d ? nakshatraIndexAt(d) : null;
  _janmaCache.set(key, nak);
  evictFifo(_janmaCache, JANMA_CACHE_MAX);
  return nak;
}

function baseResult(status: "missing" | "ready", normalized: number, confidence: number): ModuleResult {
  return {
    module: "tara_bala",
    status,
    score: { raw: normalized, normalized, weight: 1 },
    pass: normalized >= 40,
    tags: [],
    reasons: { up: [], down: [], warning: [] },
    confidence,
    raw: {},
  };
}

export function computeTaraBala(c: CandidateSlot, activity: ActivityType, person?: PersonProfile | null): ModuleResult {
  void activity; // Tarabala ตัดสินจากนักษัตรล้วน (ตารางมาตรฐานไม่แยกกิจกรรม)
  const slot = slotWindowUtc(c);
  const janma = person ? janmaNakshatraOf(person.birthDatetime) : null;
  if (!slot || janma == null) {
    // ไม่มีโปรไฟล์ / วันเกิด parse ไม่ได้ → ไม่ตัดสิน (combineScores ข้าม missing = zero-effect)
    return baseResult("missing", 50, 0);
  }

  const dayNak = nakshatraIndexAt(new Date(slot.midMs));
  const { count, tara } = taraOf(janma, dayNak);
  const meta = TARA_TABLE[tara - 1];
  const janmaMeta = NAKSHATRAS[janma];
  const dayMeta = NAKSHATRAS[dayNak];
  const ctx = `นักษัตรเกิด${janmaMeta.nameTh} (${janmaMeta.name}) → นักษัตรวัน${dayMeta.nameTh} (${dayMeta.name}) · นับได้ ${count} = ตารา ${tara} ${meta.th} (${meta.sa})`;
  /* r418 · i18n เฟส 1: บริบทเดียวกันฉบับอังกฤษ (ชื่อนักษัตรใช้ Latin ตามตำรา) */
  const ctxEn = `birth nakshatra ${janmaMeta.name} → day nakshatra ${dayMeta.name} · count ${count} = tara ${tara} ${meta.sa}`;

  const up: Reason[] = [];
  const down: Reason[] = [];
  const warning: Reason[] = [];
  let normalized = 50;
  let caps: (CapRule & { code: string })[] | undefined;

  if (meta.kind === "bad") {
    normalized = 40;
    caps = [{
      type: "max", value: TARA_BAD_CAP,
      reason: `ตาราพละชั้นร้าย · ${meta.th} (${meta.sa}) · เพดานคะแนน ${TARA_BAD_CAP}`,
      en: `Malefic Tarabala tier · ${meta.sa} · score capped at ${TARA_BAD_CAP}`,
      zh: `宿曜屬凶 · ${meta.sa} · 分數上限${TARA_BAD_CAP}`,
      source: "tara_bala", code: "TARA_BALA_CAP",
    }];
    down.push({
      code: "TARA_BALA_BAD",
      thai: `ตาราพละไม่หนุนดวงคุณ · ${ctx} · ตำราจัดเป็นชั้นร้าย เลี่ยงเริ่มงานสำคัญ · เพดานคะแนน ${TARA_BAD_CAP}`,
      en: `Tarabala does not support your chart · ${ctxEn} · the texts class this tier as malefic; avoid starting important work · score capped at ${TARA_BAD_CAP}`,
      zh: "宿曜凶", delta: 0, severity: "warning", source: "tara_bala",
    });
  } else if (meta.kind === "good") {
    normalized = 50 + TARA_GOOD_DELTA;
    up.push({
      code: "TARA_BALA_GOOD",
      thai: `ตาราพละหนุนดวงคุณ · ${ctx} · ชั้นดีตามตาราง Tārābala +${TARA_GOOD_DELTA}`,
      en: `Tarabala supports your chart · ${ctxEn} · a benefic tier in the standard Tarabala table +${TARA_GOOD_DELTA}`,
      zh: "宿曜吉", delta: TARA_GOOD_DELTA, severity: "info", source: "tara_bala",
    });
  } else {
    // 1 Janma ชนมะ · กลาง — ตำราให้ระวังเฉพาะงานเสี่ยงต่อร่างกาย → เตือนอย่างเดียว ไม่ตัด
    warning.push({
      code: "TARA_BALA_JANMA",
      thai: `วันนี้นักษัตรวันตรงกับนักษัตรเกิดของคุณ (ตาราชนมะ · Janma Tārā) · ${ctx} · ตำราให้ระวังงานเสี่ยงต่อร่างกาย ไม่ตัดคะแนน`,
      en: `Today's nakshatra matches your birth nakshatra (Janma Tara) · ${ctxEn} · the texts urge care with physically risky work; no score cut`,
      zh: "本命宿", delta: 0, severity: "warning", source: "tara_bala",
    });
  }

  const result = baseResult("ready", normalized, 0.85);
  result.pass = meta.kind !== "bad";
  result.tags = [`tara_${tara}`, `tara_${meta.kind}`, `janma_nak_${janma}`, `day_nak_${dayNak}`];
  result.reasons = { up, down, warning };
  if (caps) result.caps = caps;
  result.raw = {
    janma_nakshatra: janma, janma_nakshatra_th: janmaMeta.nameTh, janma_nakshatra_sa: janmaMeta.name,
    day_nakshatra: dayNak, day_nakshatra_th: dayMeta.nameTh, day_nakshatra_sa: dayMeta.name,
    count, tara, tara_th: meta.th, tara_sa: meta.sa, tara_kind: meta.kind,
    person_id: person?.personId || null, system: "indian_tarabala",
  };
  return result;
}
