/**
 * Module · 天星 (七政四餘 · ดาวจริง) — เฟส B · opt-in
 * =====================================================================
 * ห่อ tianxingReading() (engine A1-A5) → ModuleResult เพื่อเข้า combineScores
 * ⚠️ opt-in: route จะคำนวณ+แนบ "เฉพาะเมื่อ user ติ๊ก" (อยู่ใน activeModules) → ไม่ติ๊ก = ไม่รัน ไม่กระทบคะแนน
 * lat/lng: datepick fix Bangkok (13.75/100.5) · เวลา = กลาง時辰 (ascendant ระดับ時辰 · beta)
 */
import type { ModuleResult, Reason, CandidateSlot } from "../types";
import { tianxingReading } from "@/lib/tianxing";

const BKK_LAT = 13.75, BKK_LNG = 100.5;
const LEVEL_NORM: Record<string, number> = { top: 90, good: 72, neutral: 55, bad: 32 };

/** สร้าง UTC instant จาก candidate (date + 時辰) แบบ Bangkok → เลี่ยง tz landmine */
function candidateDtUTC(c: CandidateSlot): Date | null {
  const date = c.calendar?.gregorianDate;
  const sc = c.calendar?.shichen;
  if (!date || typeof sc !== "number") return null;
  const hh = String((sc * 2) % 24).padStart(2, "0"); // 子=00 丑=02 … 亥=22 (กลาง時辰)
  const d = new Date(`${date}T${hh}:00:00+07:00`);
  return isNaN(d.getTime()) ? null : d;
}

export function computeTianXing(c: CandidateSlot): ModuleResult {
  const dt = candidateDtUTC(c);
  if (!dt) {
    return {
      module: "tian_xing", status: "missing",
      score: { raw: 50, normalized: 50, weight: 1 }, pass: true, tags: [],
      reasons: { up: [], down: [], warning: [] }, confidence: 0, raw: {},
    };
  }
  const r = tianxingReading(dt, BKK_LAT, BKK_LNG);
  const normalized = LEVEL_NORM[r.level] ?? 55;

  const up: Reason[] = [], down: Reason[] = [];
  // 用神 (命主)
  if (r.yongshen?.status && ["廟", "旺", "升殿", "樂"].includes(r.yongshen.status))
    up.push({ code: "TX_YONG_STRONG", thai: `用神 ${r.yongshen.th} ได้กำลัง (${r.yongshen.status})`, zh: `用神${r.yongshen.zh}得力`, delta: 8, source: "tian_xing" });
  else if (r.yongshen?.status && ["落", "陷", "平"].includes(r.yongshen.status))
    down.push({ code: "TX_YONG_WEAK", thai: `用神 ${r.yongshen.th} อ่อนแรง (${r.yongshen.status})`, zh: `用神${r.yongshen.zh}${r.yongshen.status}`, delta: -6, source: "tian_xing" });
  // 格局
  for (const g of r.geju || []) {
    if (g.good) up.push({ code: "TX_GE_" + g.zh, thai: g.th, zh: g.zh, delta: 5, source: "tian_xing" });
    else down.push({ code: "TX_JI_" + g.zh, thai: g.th, zh: g.zh, delta: -5, source: "tian_xing" });
  }
  // 恩星
  if (r.en_stars?.length) up.push({ code: "TX_EN", thai: `ดาวหนุน用神 (恩星): ${r.en_stars.map(s => s.th).join("·")}`, zh: "恩星扶用", delta: 3, source: "tian_xing" });

  return {
    module: "tian_xing", status: "ready",
    score: { raw: normalized, normalized, weight: 1 },
    pass: r.level !== "bad", tags: [`tx_${r.level}`],
    reasons: { up: up.slice(0, 6), down: down.slice(0, 6), warning: [] },
    confidence: 0.6, // beta (ก่อนซินแสยืนยัน紫氣/ayanamsa)
    raw: { level: r.level, verdict: r.verdictTh?.th, ascendant: r.ascendant?.signTh, yongshen: r.yongshen, ziqi_beta: true },
  };
}
