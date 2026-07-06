/**
 * Module · 星逆行 ดาวถอย (Retrograde Window) — r372 · opt-in
 * =====================================================================
 * ใช้ findStations (astro-core/events · deterministic) หา "วันดาวหยุดนิ่ง"
 * station retrograde (R) → station direct (D) แล้วจับคู่เป็นช่วงถอยจริงของปี
 *
 * ⚠️ opt-in เหมือน dong_gong/tian_xing (r367): route แนบเฉพาะเมื่อ user ติ๊ก
 *    (retro_window ∈ activeModules) · ไม่ติ๊ก = ไม่แนบ = zero-effect
 * ⚠️ retro_window ไม่อยู่ใน UNIVERSAL_MODULES / DATEPICK_HARD_MODULES —
 *    aj_ephemeris_cache ไม่มีคอลัมน์ retro_window (ใส่ UNIVERSAL → SQL error → ฤกษ์หายทั้งหน้า)
 *    ตัดฤกษ์ผ่าน caps (max 40-50) ใน combineScores เท่านั้น
 *
 * กติกา (ตาม spec เจ้านาย r372):
 *   พุธถอย   + 立約/開市/出行 → cap 45 (RETRO_MERCURY_CAP) · สัญญา/สื่อสาร/เดินทางเสี่ยงพลิก
 *   ศุกร์ถอย + 婚姻           → cap 40 (RETRO_VENUS_CAP)   · งานมงคลคู่ครองช่วงศุกร์ถอย
 *   อังคารถอย + 動土          → cap 50 (RETRO_MARS_CAP)    · งานลงมือ/ก่อสร้าง
 *     (ตำราจัด 安床 อยู่กลุ่มเดียวกัน แต่ ActivityType 8 ตัวไม่มี 安床 → ใช้ 動土 อย่างเดียว)
 *   ดาวอื่นถอย (พฤหัส/เสาร์ หรือดาวเร็วถอยแต่กิจกรรมไม่เข้าข่าย) → info เฉย ๆ (reasons.neutral + raw)
 *   reason บอกช่วงถอยจริง (วัน station R → D · เวลาไทย)
 * perf: cache ช่วงถอยรายปี (module-level Map)
 */
import type { ModuleResult, Reason, CapRule, CandidateSlot, ActivityType } from "../types";
import type { BodyKey } from "@/lib/astro-core/ephemeris";
import { findStations } from "@/lib/astro-core/events";
import { DAY_MS, slotWindowUtc, fmtThaiDate, fmtEnDate, fmtZhDate, evictFifo } from "./sky-shared";

const RETRO_BODIES: BodyKey[] = ["Mercury", "Venus", "Mars", "Jupiter", "Saturn"];
const BODY_TH: Record<string, string> = {
  Mercury: "ดาวพุธ", Venus: "ดาวศุกร์", Mars: "ดาวอังคาร", Jupiter: "ดาวพฤหัส", Saturn: "ดาวเสาร์",
};
/* r418 · i18n เฟส 1 (additive · ใช้ประกอบข้อความ en/zh เท่านั้น) */
const BODY_ZH: Record<string, string> = {
  Mercury: "水星", Venus: "金星", Mars: "火星", Jupiter: "木星", Saturn: "土星",
};

type RetroRule = { body: BodyKey; activities: Set<ActivityType>; cap: number; code: string; noteTh: string; noteEn: string; noteZh: string };
const RETRO_RULES: RetroRule[] = [
  {
    body: "Mercury", activities: new Set<ActivityType>(["立約", "開市", "出行"]),
    cap: 45, code: "RETRO_MERCURY_CAP",
    noteTh: "สัญญา/การสื่อสาร/การเดินทางช่วงพุธถอยเสี่ยงพลิก-ล่าช้า-แก้เอกสาร",
    noteEn: "contracts, communication and travel during Mercury retrograde are prone to reversals, delays and paperwork revisions",
    noteZh: "水星逆行期間簽約、溝通、出行易生反覆延誤、文書改動",
  },
  {
    body: "Venus", activities: new Set<ActivityType>(["婚姻"]),
    cap: 40, code: "RETRO_VENUS_CAP",
    noteTh: "งานมงคลคู่ครองช่วงศุกร์ถอย ตำราให้เลี่ยง (เรื่องใจ-พันธะทบทวนใหม่)",
    noteEn: "the texts advise against marriage celebrations during Venus retrograde (matters of the heart and vows come up for review)",
    noteZh: "金星逆行不宜嫁娶 · 情感盟約易生反覆",
  },
  {
    body: "Mars", activities: new Set<ActivityType>(["動土"]),
    cap: 50, code: "RETRO_MARS_CAP",
    noteTh: "งานลงมือ/ก่อสร้าง/เปิดหน้าดินช่วงอังคารถอย แรงขับสะดุด-งานซ้ำ",
    noteEn: "hands-on work, construction and ground-breaking during Mars retrograde tend to stall and need redoing",
    noteZh: "火星逆行動土施工易停滯返工",
  },
];

export type RetroInterval = {
  body: BodyKey;
  startMs: number;   // station retrograde
  endMs: number;     // station direct
  openStart: boolean; // R station อยู่นอกช่วง scan (ขอบ · ไม่ควรเกิดกับ pad 220 วัน)
  openEnd: boolean;
};

const _yearCache = new Map<number, RetroInterval[]>();

/** ช่วงถอยของดาว 5 ดวงที่คาบเกี่ยวปีนั้น (cache รายปี · pad 220 วันครอบช่วงถอยยาวสุดของเสาร์ ~140 วัน) */
export function getRetroIntervals(year: number): RetroInterval[] {
  const hit = _yearCache.get(year);
  if (hit) return hit;
  const PAD = 220 * DAY_MS;
  const yStart = Date.UTC(year, 0, 1);
  const yEnd = Date.UTC(year + 1, 0, 1);
  const from = new Date(yStart - PAD);
  const to = new Date(yEnd + PAD);
  const out: RetroInterval[] = [];
  for (const body of RETRO_BODIES) {
    const st = findStations(body, from, to); // เรียงเวลาแล้ว
    let openR: number | null = null;
    let sawAny = false;
    for (const s of st) {
      sawAny = true;
      if (s.type === "station_retrograde") {
        openR = s.date.getTime();
      } else if (s.type === "station_direct") {
        out.push({
          body,
          startMs: openR ?? from.getTime(),
          endMs: s.date.getTime(),
          openStart: openR == null,
          openEnd: false,
        });
        openR = null;
      }
    }
    if (openR != null) {
      out.push({ body, startMs: openR, endMs: to.getTime(), openStart: false, openEnd: true });
    }
    void sawAny;
  }
  const filtered = out.filter((iv) => iv.endMs > yStart - DAY_MS && iv.startMs < yEnd + DAY_MS);
  filtered.sort((a, b) => a.startMs - b.startMs);
  _yearCache.set(year, filtered);
  evictFifo(_yearCache, 24);
  return filtered;
}

function baseResult(status: "missing" | "ready", normalized: number, confidence: number): ModuleResult {
  return {
    module: "retro_window",
    status,
    score: { raw: normalized, normalized, weight: 1 },
    pass: normalized >= 40,
    tags: [],
    reasons: { up: [], down: [], warning: [], neutral: [] },
    confidence,
    raw: {},
  };
}

export function computeRetroWindow(c: CandidateSlot, activity: ActivityType): ModuleResult {
  const slot = slotWindowUtc(c);
  if (!slot) return baseResult("missing", 50, 0);

  const year = Number(c.calendar.gregorianDate.slice(0, 4));
  const intervals = getRetroIntervals(year).filter((iv) => slot.midMs >= iv.startMs && slot.midMs <= iv.endMs);

  if (!intervals.length) {
    const r = baseResult("ready", 60, 0.9);
    r.tags = ["retro_clear"];
    r.raw = { active_retro: [] };
    return r;
  }

  const r = baseResult("ready", 60, 0.9);
  const capRules: (CapRule & { code: string })[] = [];
  const infoRetro: { body: string; range_th: string }[] = [];

  for (const iv of intervals) {
    const rangeTh = `${fmtThaiDate(iv.startMs)}–${fmtThaiDate(iv.endMs)} ${new Date(iv.endMs).getUTCFullYear()}`;
    const rangeEn = `${fmtEnDate(iv.startMs)}–${fmtEnDate(iv.endMs)} ${new Date(iv.endMs).getUTCFullYear()}`;
    const rangeZh = `${fmtZhDate(iv.startMs)}–${fmtZhDate(iv.endMs)} ${new Date(iv.endMs).getUTCFullYear()}`;
    const rule = RETRO_RULES.find((x) => x.body === iv.body && x.activities.has(activity));
    r.tags.push(`retro_${iv.body.toLowerCase()}`);
    if (rule) {
      capRules.push({
        type: "max", value: rule.cap,
        reason: `${BODY_TH[iv.body]}ถอย ${rangeTh} · ${rule.noteTh} · เพดานคะแนน ${rule.cap}`,
        en: `${iv.body} retrograde ${rangeEn} · ${rule.noteEn} · score capped at ${rule.cap}`,
        zh: `${BODY_ZH[iv.body]}逆行 ${rangeZh} · ${rule.noteZh} · 分數上限${rule.cap}`,
        source: "retro_window",
        code: rule.code,
      } as CapRule & { code: string });
      r.reasons.down.push({
        code: rule.code.replace("_CAP", ""),
        thai: `${BODY_TH[iv.body]}ถอย ${rangeTh} (station R→D จริง) · ${rule.noteTh} · เพดานคะแนน ${rule.cap}`,
        en: `${iv.body} retrograde ${rangeEn} (true station R→D window) · ${rule.noteEn} · score capped at ${rule.cap}`,
        zh: "行星逆行",
        delta: 0,
        severity: "warning",
        source: "retro_window",
      } as Reason);
    } else {
      // ดาวอื่นถอย / กิจกรรมไม่เข้าข่าย → info เฉย ๆ (ไม่เข้าคะแนน · combineScores ไม่เก็บ neutral)
      infoRetro.push({ body: iv.body, range_th: rangeTh });
      r.reasons.neutral?.push({
        code: `RETRO_INFO_${iv.body.toUpperCase()}`,
        thai: `${BODY_TH[iv.body]}ถอย ${rangeTh} · ไม่กระทบกิจกรรมนี้โดยตรง (ข้อมูลประกอบ)`,
        en: `${iv.body} retrograde ${rangeEn} · no direct bearing on this activity (context only)`,
        zh: `${BODY_ZH[iv.body]}逆行 ${rangeZh} · 與本活動無直接關聯（僅供參考）`,
        delta: 0,
        severity: "info",
        source: "retro_window",
      } as Reason);
    }
  }

  if (capRules.length) {
    const minCap = Math.min(...capRules.map((x) => x.value));
    r.score.raw = r.score.normalized = Math.max(20, minCap - 10);
    r.pass = false;
    r.caps = capRules;
  }
  r.raw = {
    active_retro: intervals.map((iv) => ({
      body: iv.body,
      start_th: fmtThaiDate(iv.startMs),
      end_th: fmtThaiDate(iv.endMs),
      start_ms: iv.startMs,
      end_ms: iv.endMs,
    })),
    info_only: infoRetro,
  };
  return r;
}
