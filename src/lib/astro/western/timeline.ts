/**
 * Western TIMING_TIMELINE · ชั้นจังหวะเวลาปีเป้าหมาย (เฟส 1 ของ timeline engine)
 * เติมชั้นที่เคยประกาศ not_in_packet: exact transit windows / solar return / profection / progressions / eclipses / stations
 * deterministic ทั้งหมด (scan+bisection บน astro-core/events) — AI แค่ตีความ ห้ามเดาวัน (กฎข้อ 9)
 * วันที่ทุกจุดรายงานเป็นเวลาไทย (Asia/Bangkok)
 */
import {
  findAspectHits, findIngresses, findStations, findReturnInstant, findEclipses,
  wrap180, type EventBodyKey,
} from "../../astro-core/events";
import { ascendant, computeBodies, eclipticLon, midheaven, norm360, type BodyKey } from "../../astro-core/ephemeris";
import { SIGN_TH, SIGN_RULER, type WesternChart } from "./engine";

const DAY_MS = 86400000;
const BKK_MS = 7 * 3600 * 1000;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** วันที่แบบเวลาไทย YYYY-MM-DD */
function bkkDateISO(d: Date): string {
  return new Date(d.getTime() + BKK_MS).toISOString().slice(0, 10);
}
function bkkMonth(d: Date): number {
  return new Date(d.getTime() + BKK_MS).getUTCMonth() + 1;
}

const NAME_TH_TL: Record<string, string> = {
  Sun: "อาทิตย์", Moon: "จันทร์", Mercury: "พุธ", Venus: "ศุกร์", Mars: "อังคาร",
  Jupiter: "พฤหัส", Saturn: "เสาร์", Uranus: "ยูเรนัส", Neptune: "เนปจูน", Pluto: "พลูโต",
  Rahu: "ราหู", Ketu: "เกตุ", Ascendant: "ลัคนา", MC: "กลางฟ้า", "Part of Fortune": "จุดโชค",
};
const ASPECT_TH: Record<number, { type: string; th: string }> = {
  0: { type: "conjunction", th: "ทับ (0°)" },
  90: { type: "square", th: "ฉาก (90°)" },
  120: { type: "trine", th: "ตรีโกณ (120°)" },
  180: { type: "opposition", th: "เล็ง (180°)" },
};

export type WesternTimelineHit = {
  dateISO: string;            // เวลาไทย
  month: number;              // 1-12 ของปีเป้าหมาย (เวลาไทย)
  transit: string;
  transitTh: string;
  natal: string;
  natalTh: string;
  natalKind: "planet" | "angle" | "point";
  aspect: string;
  aspectTh: string;
  retro: boolean;
  pass: number;               // ครั้งที่ (เดินหน้า-ถอย-เดินหน้า = 1..3)
  passesTotal: number;
};

export type WesternTimeline = {
  targetYear: number;
  timezone: "Asia/Bangkok";
  method: "deterministic_scan_bisection_astronomy_engine";
  transitHits: WesternTimelineHit[];
  transitHitsDropped: number;  // ถูกคัดออกเพราะเกินงบ (no silent caps)
  ingresses: { dateISO: string; month: number; body: string; bodyTh: string; toSign: number; toSignTh: string; retro: boolean }[];
  stations: { dateISO: string; month: number; body: string; bodyTh: string; type: "station_retrograde" | "station_direct"; sign: number; signTh: string }[];
  eclipses: { dateISO: string; month: number; kind: "solar" | "lunar"; subtype: string; sign: number; signTh: string; signDeg: number; hitNatal: { name: string; nameTh: string; aspect: string; orb: number } | null }[];
  solarReturn: {
    instantISO: string;        // UTC instant
    dateISO: string;           // เวลาไทย
    uncertainNoBirthTime: boolean;
    ascendant: { sign: number; signTh: string; signDeg: number } | null;
    mc: { sign: number; signTh: string; signDeg: number } | null;
    planets: { name: string; nameTh: string; sign: number; signTh: string; signDeg: number; retro: boolean; natalHouse: number | null }[];
  } | null;
  profection: {
    segments: { fromISO: string; toISO: string; age: number; profectedHouse: number; profectedSign: number; profectedSignTh: string; lordOfYear: string; lordOfYearTh: string; lordNatalSign: number; lordNatalSignTh: string; lordNatalHouse: number | null }[];
  } | null;
  progressed: {
    basisDateISO: string;      // วันที่ progressed (birth + อายุปีเป็นวัน) กลางปีเป้าหมาย
    planets: { name: string; nameTh: string; sign: number; signTh: string; signDeg: number }[];
    aspectsToNatal: { progressed: string; natal: string; aspect: string; aspectTh: string; orb: number }[];
    moonNote: string;
  } | null;
  coverageNote: string;
};

/** น้ำหนักคัดเลือกเมื่อ hit เกินงบ — จุดสำคัญก่อน */
const TARGET_WEIGHT: Record<string, number> = { Moon: 10, Sun: 9, Ascendant: 9, MC: 8, "Part of Fortune": 6, Venus: 5, Mercury: 5, Mars: 5 };
const ASPECT_WEIGHT: Record<number, number> = { 0: 10, 180: 9, 90: 8, 120: 5 };
const BODY_WEIGHT: Record<string, number> = { Saturn: 10, Pluto: 9, Uranus: 9, Neptune: 8, Jupiter: 8, Rahu: 7, Mars: 6 };
const MAX_TRANSIT_HITS = 60;

/** สร้าง TIMING_TIMELINE ปีเป้าหมาย (ปี ค.ศ. ตามเวลาไทย) */
export function buildWesternTimeline(
  chart: WesternChart,
  birth: { dtUTC: Date; lat: number; lng: number },
  targetYear: number,
): WesternTimeline {
  // ขอบปีเป้าหมายตามเวลาไทย
  const from = new Date(Date.UTC(targetYear, 0, 1) - BKK_MS);
  const to = new Date(Date.UTC(targetYear + 1, 0, 1) - BKK_MS - 1000);

  const natalByName = new Map(chart.planets.map((p) => [p.name, p]));

  // ---- 1) exact transit hits: ดาวช้า/แรง → จุด natal สำคัญ ----
  const transitBodies: EventBodyKey[] = ["Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto", "Rahu"];
  const targets: { name: string; lon: number; kind: "planet" | "angle" | "point" }[] = [];
  for (const n of ["Sun", "Moon", "Mercury", "Venus", "Mars"]) {
    const p = natalByName.get(n);
    if (p) targets.push({ name: n, lon: p.lon, kind: "planet" });
  }
  if (chart.ascendant !== null) targets.push({ name: "Ascendant", lon: chart.ascendant, kind: "angle" });
  if (chart.mc !== null) targets.push({ name: "MC", lon: chart.mc, kind: "angle" });
  if (chart.partOfFortune) targets.push({ name: "Part of Fortune", lon: chart.partOfFortune.lon, kind: "point" });

  const rawHits: (WesternTimelineHit & { weight: number })[] = [];
  for (const body of transitBodies) {
    for (const tgt of targets) {
      for (const angle of [0, 90, 120, 180]) {
        const hits = findAspectHits(body, tgt.name, tgt.lon, angle, from, to);
        for (const h of hits) {
          rawHits.push({
            dateISO: bkkDateISO(h.date),
            month: bkkMonth(h.date),
            transit: body,
            transitTh: NAME_TH_TL[body] || body,
            natal: tgt.name,
            natalTh: NAME_TH_TL[tgt.name] || tgt.name,
            natalKind: tgt.kind,
            aspect: ASPECT_TH[angle].type,
            aspectTh: ASPECT_TH[angle].th,
            retro: h.retro,
            pass: h.pass,
            passesTotal: hits.length,
            weight: (BODY_WEIGHT[body] || 5) + (TARGET_WEIGHT[tgt.name] || 4) + (ASPECT_WEIGHT[angle] || 4),
          });
        }
      }
    }
  }
  rawHits.sort((a, b) => b.weight - a.weight);
  const kept = rawHits.slice(0, MAX_TRANSIT_HITS);
  const dropped = rawHits.length - kept.length;
  const transitHits = kept
    .map(({ weight: _w, ...h }) => h)
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO));

  // ---- 2) ingress ราศีของดาวช้า (บริบทฉากหลังรายปี) ----
  const ingresses = (["Jupiter", "Saturn", "Uranus", "Neptune", "Pluto", "Rahu"] as EventBodyKey[])
    .flatMap((b) => findIngresses(b, from, to, 0))
    .map((e) => ({
      dateISO: bkkDateISO(e.date), month: bkkMonth(e.date),
      body: e.body, bodyTh: NAME_TH_TL[e.body] || e.body,
      toSign: e.toSign, toSignTh: SIGN_TH[e.toSign], retro: e.retro,
    }))
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO));

  // ---- 3) stations (พุธ/ศุกร์/อังคาร→พลูโต) ----
  const stations = (["Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"] as BodyKey[])
    .flatMap((b) => findStations(b, from, to))
    .map((s) => {
      const sign = Math.floor(norm360(s.lon) / 30);
      return {
        dateISO: bkkDateISO(s.date), month: bkkMonth(s.date),
        body: s.body, bodyTh: NAME_TH_TL[s.body] || s.body,
        type: s.type, sign, signTh: SIGN_TH[sign],
      };
    })
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO));

  // ---- 4) eclipses + จุด natal ที่โดน (ทับ/เล็ง orb ≤ 3°) ----
  const eclipseTargets = [
    ...chart.planets.map((p) => ({ name: p.name, lon: p.lon })),
    ...(chart.ascendant !== null ? [{ name: "Ascendant", lon: chart.ascendant }] : []),
    ...(chart.mc !== null ? [{ name: "MC", lon: chart.mc }] : []),
  ];
  const eclipses = findEclipses(from, to).map((e) => {
    const sign = Math.floor(e.eclipseLon / 30);
    let hitNatal: { name: string; nameTh: string; aspect: string; orb: number } | null = null;
    for (const t of eclipseTargets) {
      const sep = Math.abs(wrap180(e.eclipseLon - t.lon));
      const conj = sep, opp = Math.abs(sep - 180);
      const best = Math.min(conj, opp);
      if (best <= 3 && (!hitNatal || best < hitNatal.orb)) {
        hitNatal = { name: t.name, nameTh: NAME_TH_TL[t.name] || t.name, aspect: conj <= opp ? "conjunction" : "opposition", orb: r2(best) };
      }
    }
    return {
      dateISO: bkkDateISO(e.date), month: bkkMonth(e.date),
      kind: e.kind, subtype: e.subtype,
      sign, signTh: SIGN_TH[sign], signDeg: r2(e.eclipseLon - sign * 30),
      hitNatal,
    };
  });

  // ---- 5) solar return ปีเป้าหมาย ----
  const natalSun = natalByName.get("Sun");
  let solarReturn: WesternTimeline["solarReturn"] = null;
  if (natalSun) {
    const birthBkk = new Date(birth.dtUTC.getTime() + BKK_MS);
    const approx = new Date(Date.UTC(targetYear, birthBkk.getUTCMonth(), Math.min(birthBkk.getUTCDate(), 28), birthBkk.getUTCHours()) - BKK_MS);
    const instant = findReturnInstant("Sun", natalSun.lon, approx, 6);
    if (instant) {
      const srBodies = computeBodies(instant, { modern: true, node: false });
      const srAsc = chart.hasBirthTime ? ascendant(instant, birth.lat, birth.lng) : null;
      const srMc = chart.hasBirthTime ? midheaven(instant, birth.lng) : null;
      const mk = (lon: number | null) => {
        if (lon === null) return null;
        const s = Math.floor(norm360(lon) / 30);
        return { sign: s, signTh: SIGN_TH[s], signDeg: r2(norm360(lon) - s * 30) };
      };
      solarReturn = {
        instantISO: instant.toISOString(),
        dateISO: bkkDateISO(instant),
        uncertainNoBirthTime: !chart.hasBirthTime,
        ascendant: mk(srAsc),
        mc: mk(srMc),
        planets: srBodies.map((b) => {
          const s = Math.floor(b.lon / 30);
          return {
            name: b.key as string, nameTh: NAME_TH_TL[b.key as string] || String(b.key),
            sign: s, signTh: SIGN_TH[s], signDeg: r2(b.lon - s * 30), retro: b.retro,
            // เรือน (whole-sign) ที่ดาว SR ตกในผังกำเนิด — ต้องมีลัคนากำเนิด
            natalHouse: chart.ascendant !== null ? ((s - Math.floor(chart.ascendant / 30) + 12) % 12) + 1 : null,
          };
        }),
      };
    }
  }

  // ---- 6) annual profection (ต้องมีลัคนา) ----
  let profection: WesternTimeline["profection"] = null;
  if (chart.hasBirthTime && chart.ascendant !== null) {
    const ascSign = Math.floor(chart.ascendant / 30);
    const birthBkk = new Date(birth.dtUTC.getTime() + BKK_MS);
    const bMonth = birthBkk.getUTCMonth(), bDay = birthBkk.getUTCDate();
    const birthdayThisYear = new Date(Date.UTC(targetYear, bMonth, bDay) - BKK_MS);
    const ageOnBirthday = targetYear - birthBkk.getUTCFullYear();
    const seg = (age: number, fromD: Date, toD: Date) => {
      const house = ((age % 12) + 12) % 12 + 1;
      const sign = (ascSign + house - 1) % 12;
      const lord = SIGN_RULER[sign];
      const lordNatal = natalByName.get(lord);
      return {
        fromISO: bkkDateISO(fromD), toISO: bkkDateISO(toD),
        age, profectedHouse: house, profectedSign: sign, profectedSignTh: SIGN_TH[sign],
        lordOfYear: lord, lordOfYearTh: NAME_TH_TL[lord] || lord,
        lordNatalSign: lordNatal ? lordNatal.sign : -1,
        lordNatalSignTh: lordNatal ? SIGN_TH[lordNatal.sign] : "",
        lordNatalHouse: lordNatal ? lordNatal.house : null,
      };
    };
    profection = {
      segments: [
        seg(ageOnBirthday - 1, from, new Date(birthdayThisYear.getTime() - DAY_MS)),
        seg(ageOnBirthday, birthdayThisYear, to),
      ],
    };
  }

  // ---- 7) secondary progressions (1 วัน = 1 ปี) ณ กลางปีเป้าหมาย ----
  const midYear = new Date(Date.UTC(targetYear, 6, 1) - BKK_MS);
  const ageYears = (midYear.getTime() - birth.dtUTC.getTime()) / DAY_MS / 365.2425;
  let progressed: WesternTimeline["progressed"] = null;
  if (ageYears > 0) {
    const progDate = new Date(birth.dtUTC.getTime() + ageYears * DAY_MS);
    const progBodies = computeBodies(progDate, { modern: false, node: false });
    const progAspects: { progressed: string; natal: string; aspect: string; aspectTh: string; orb: number }[] = [];
    for (const pb of progBodies) {
      for (const np of chart.planets) {
        for (const angle of [0, 90, 120, 180]) {
          const orb = Math.abs(Math.abs(wrap180(pb.lon - np.lon)) - angle);
          if (orb <= 1) progAspects.push({ progressed: String(pb.key), natal: np.name, aspect: ASPECT_TH[angle].type, aspectTh: ASPECT_TH[angle].th, orb: r2(orb) });
        }
      }
    }
    const progMoon = progBodies.find((b) => b.key === "Moon");
    progressed = {
      basisDateISO: bkkDateISO(midYear),
      planets: progBodies.map((b) => {
        const s = Math.floor(b.lon / 30);
        return { name: String(b.key), nameTh: NAME_TH_TL[String(b.key)] || String(b.key), sign: s, signTh: SIGN_TH[s], signDeg: r2(b.lon - s * 30) };
      }),
      aspectsToNatal: progAspects.sort((a, b) => a.orb - b.orb).slice(0, 12),
      moonNote: progMoon
        ? `จันทร์ progressed อยู่ราศี${SIGN_TH[Math.floor(progMoon.lon / 30)]} (เคลื่อน ~1°/เดือน)${chart.hasBirthTime ? "" : " · ไม่ทราบเวลาเกิด ตำแหน่งจันทร์ progressed คลาดได้ ±6°"}`
        : "",
    };
  }

  return {
    targetYear,
    timezone: "Asia/Bangkok",
    method: "deterministic_scan_bisection_astronomy_engine",
    transitHits,
    transitHitsDropped: dropped,
    ingresses,
    stations,
    eclipses,
    solarReturn,
    profection,
    progressed,
    coverageNote: `ชั้นเวลาปี ${targetYear} คำนวณจริงทั้งปี (ไม่ใช่ snapshot วันเดียว): exact transit ${transitHits.length} จุด${dropped > 0 ? ` (คัดออก ${dropped} จุดน้ำหนักต่ำ)` : ""} · ingress ${ingresses.length} · station ${stations.length} · คราส ${eclipses.length} · solar return ${solarReturn ? "มี" : "ไม่มี"} · profection ${profection ? "มี" : "ปิด (ไม่มีเวลาเกิด)"} · progressed ${progressed ? "มี" : "ไม่มี"}`,
  };
}
