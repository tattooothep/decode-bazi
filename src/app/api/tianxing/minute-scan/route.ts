/**
 * POST /api/tianxing/minute-scan · 天星擇日 · สแกนหา "นาทีมงคล" ในหนึ่งวัน (七政四餘)
 * in : { date:"YYYY-MM-DD" (เวลาไทย ICT), lat, lng, step?(นาที · default 15), activity? }
 * out: { ok, date, lat, lng, step, scanned, top:[{rank,time,dtUTC,level,ascSign,ascDeg,ascSignTh,ascSignZh,
 *        yongKey,yongStatus,yongStatusTh,atBorder}], updatedAt }
 *
 * ⚠️ reuse เท่านั้น — เรียก qizhengNatal() (src/lib/astro/qizheng/engine.ts) · ไม่แตะ engine ใด ๆ
 * deterministic (ดาราศาสตร์จริง) · pure compute · ไม่มี external call ในตัว scan → เร็ว ไม่ block
 * cache ต่อ (date|lat|lng|step) กัน scan ซ้ำ · ผัง 8 ทิศ (奇門) ฝั่ง client เรียก /api/qimen เอง
 */
import { NextRequest, NextResponse } from "next/server";
import { qizhengNatal } from "@/lib/astro/qizheng/engine";

export const runtime = "nodejs";

const LEVEL_BASE: Record<string, number> = { top: 3, good: 2, neutral: 0, bad: -2 };

type MinuteHit = {
  min: number;               // นาทีจากเที่ยงคืนไทย (0..1439)
  score: number;
  level: string;
  ascSign: number;
  ascDeg: number;
  ascSignTh: string;
  ascSignZh: string;
  yongKey: string;
  yongTh: string;
  yongZh: string;
  yongStatus: string;
  yongStatusTh: string;
  atBorder: boolean;
};

/** ให้คะแนนนาทีจากผลผัง七政 (deterministic · label เป็นคำ ไม่ใช่ %) */
function scoreReading(reading: ReturnType<typeof qizhengNatal>["reading"]): { score: number; atBorder: boolean } {
  const base = LEVEL_BASE[reading.level] ?? 0;
  const yong = reading.stars.find((s) => s.key === reading.yongshen.key);
  const yrank = yong?.statusRank ?? 3;
  const yongAdj = yrank >= 5 ? 1.8 : yrank >= 4 ? 1.1 : yrank <= 1 ? -1.6 : yrank <= 2 ? -1.0 : 0;
  const deg = reading.ascendant.deg;
  // เลี่ยงลัคนาคาบขอบราศี (0°/29°) — ปะทะ節氣/ผิดราศีง่าย
  const atBorder = deg < 1.5 || deg > 28.5;
  const borderPenalty = atBorder ? -2.2 : deg < 3 || deg > 27 ? -0.6 : deg >= 10 && deg <= 20 ? 0.4 : 0;
  return { score: Math.round((base + yongAdj + borderPenalty) * 100) / 100, atBorder };
}

// ── cache (deterministic ต่อ วัน+พิกัด+step) ──
type CacheVal = { at: number; payload: Record<string, unknown> };
const CACHE = new Map<string, CacheVal>();
const CACHE_TTL = 5 * 60 * 1000;
const CACHE_MAX = 200;
function cacheGet(k: string): Record<string, unknown> | null {
  const v = CACHE.get(k);
  if (!v) return null;
  if (Date.now() - v.at > CACHE_TTL) { CACHE.delete(k); return null; }
  return v.payload;
}
function cacheSet(k: string, payload: Record<string, unknown>) {
  if (CACHE.size >= CACHE_MAX) { const first = CACHE.keys().next().value; if (first) CACHE.delete(first); }
  CACHE.set(k, { at: Date.now(), payload });
}

const pad2 = (n: number) => (n < 10 ? "0" : "") + n;

export async function POST(req: NextRequest) {
  try {
    const b = await req.json().catch(() => ({} as Record<string, unknown>));
    const date = String(b.date || "");
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!m) return NextResponse.json({ ok: false, error: "bad_date" }, { status: 400 });
    const y = +m[1], mo = +m[2], d = +m[3];
    const lat = Number(b.lat), lng = Number(b.lng);
    if (!Number.isFinite(lat) || lat < -89 || lat > 89) return NextResponse.json({ ok: false, error: "bad_lat" }, { status: 400 });
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) return NextResponse.json({ ok: false, error: "bad_lng" }, { status: 400 });
    let step = Number(b.step) || 15;
    if (!Number.isFinite(step) || step < 5) step = 15;
    if (step > 60) step = 60;
    step = Math.round(step);

    const key = `${date}|${lat.toFixed(4)}|${lng.toFixed(4)}|${step}`;
    const cached = cacheGet(key);
    if (cached) return NextResponse.json({ ...cached, cached: true });

    // ── สแกนทั้งวัน (เวลาไทย ICT = UTC+7) ──
    const hits: MinuteHit[] = [];
    let scanned = 0;
    for (let min = 0; min < 1440; min += step) {
      const hh = Math.floor(min / 60), mm = min % 60;
      const dt = new Date(Date.UTC(y, mo - 1, d, hh - 7, mm, 0)); // ICT → UTC
      if (isNaN(dt.getTime())) continue;
      const { reading } = qizhengNatal(dt, lat, lng, false); // ไม่ต้อง 12 เรือน → เร็ว
      const { score, atBorder } = scoreReading(reading);
      const yong = reading.stars.find((s) => s.key === reading.yongshen.key);
      hits.push({
        min, score, level: reading.level,
        ascSign: reading.ascendant.sign, ascDeg: Math.round(reading.ascendant.deg * 10) / 10,
        ascSignTh: reading.ascendant.signTh, ascSignZh: reading.ascendant.signZh,
        yongKey: reading.yongshen.key, yongTh: reading.yongshen.th, yongZh: reading.yongshen.zh,
        yongStatus: reading.yongshen.status,
        yongStatusTh: yong?.statusTh || reading.yongshen.statusTh || "",
        atBorder,
      });
      scanned++;
    }

    // ── เลือก top 3 · greedy + เว้นห่างอย่างน้อย 45 นาที (กระจายทั้งวัน ไม่กระจุก) ──
    const ranked = [...hits].sort((a, b2) => b2.score - a.score || a.min - b2.min);
    const chosen: Array<MinuteHit & { rank: number }> = [];
    for (const h of ranked) {
      if (chosen.length >= 3) break;
      if (chosen.some((c) => Math.abs(c.min - h.min) < 120)) continue; // เว้น ~1 ชั่วยาม → 3 ช่วงต่างกัน
      chosen.push({ ...h, rank: chosen.length + 1 }); // rank ตามคะแนน (🥇=แรงสุด)
    }
    chosen.sort((a, b2) => a.min - b2.min); // แสดงเรียงตามเวลาในวัน · medal ยึด rank

    const top = chosen.map((h) => {
      const hh = Math.floor(h.min / 60), mm = h.min % 60;
      const dtUTC = new Date(Date.UTC(y, mo - 1, d, hh - 7, mm, 0)).toISOString();
      return {
        rank: h.rank, time: `${pad2(hh)}:${pad2(mm)}`, dtUTC,
        level: h.level, score: h.score,
        ascSign: h.ascSign, ascDeg: h.ascDeg, ascSignTh: h.ascSignTh, ascSignZh: h.ascSignZh,
        yongKey: h.yongKey, yongTh: h.yongTh, yongZh: h.yongZh,
        yongStatus: h.yongStatus, yongStatusTh: h.yongStatusTh, atBorder: h.atBorder,
      };
    });

    const payload = {
      ok: true, date, lat, lng, step, scanned,
      activity: typeof b.activity === "string" ? b.activity.slice(0, 80) : "",
      top, updatedAt: new Date().toISOString(),
    };
    cacheSet(key, payload);
    return NextResponse.json(payload);
  } catch (e) {
    console.error("[tianxing/minute-scan]", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ ok: false, error: "scan_failed" }, { status: 500 });
  }
}
