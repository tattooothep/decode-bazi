/**
 * anchors.ts · หมุดจริง 6 ศาสตร์สำหรับหน้า /ask (preview ขายสมาชิก)
 *
 * หลักการ (เจ้านายเคาะ 7 ก.ค. 2569): "คำนวณจริงทั้งหมด แล้วกั๊กที่ชั้นนำเสนอ"
 *  - ดึงผังจริงจากเครื่อง fusion5 (renderChartForScience) — ไม่มีศาสตร์ไหนให้ AI แต่งจากอากาศ
 *  - กลั่นเป็น "หมุด" (anchor) ไม่กี่ตัวต่อศาสตร์ พร้อม id คงที่ → ใช้เป็นคลังหลักฐาน
 *  - ทุกประโยคที่ AI เขียนต้องอ้าง id หมุดจริง (ด่านตรวจอยู่ที่ route)
 *  - ศาสตร์ไหนสร้างหมุดไม่ได้ = บอกตรง ๆ ใน warnings → AI ต้องเขียน "รอฉบับเต็ม" ห้ามแต่ง
 *
 * เขียนโดยจาวิสทั้งไฟล์ (คำสั่งเด็ดขาด: ห้าม Sonnet เขียน) · ไม่แตะ logic ใน src/lib/** — import อย่างเดียว
 */

import type { ScienceId } from "@/lib/fusion5/disciplines";
import { computeQiyunLock } from "@/lib/bazi-qiyun";
import type { BaziAnalysis } from "@/lib/bazi-calc";
/* เรียกตัวสร้าง packet ตรง (ได้ object แบบ typed) — ทางเดียวกับที่ renderChartForScience ใช้ภายใน
 * เหตุผล: STRUCTURED_CHART_PACKET ที่ render ออกมาเป็น JSON บีบตำแหน่ง (array ไร้ชื่อ field) กลั่นไม่ได้ */
import { buildQizhengPacket } from "@/lib/astro/qizheng/packet";
import { buildZiweiPacket } from "@/lib/astro/ziwei/packet";
import { westernChart } from "@/lib/astro/western/engine";
import { buildWesternPacket } from "@/lib/astro/western/packet";
import { buildWesternTimeline } from "@/lib/astro/western/timeline";
import { vedicChart } from "@/lib/astro/vedic/engine";
import { buildVedicPacket } from "@/lib/astro/vedic/packet";
import { buildVedicTimeline } from "@/lib/astro/vedic/timeline";
import { uranianChart } from "@/lib/astro/uranian/engine";
import { buildUranianPacket } from "@/lib/astro/uranian/packet";

export type AskAnchor = {
  id: string;        // เช่น "bazi.yongshen" — คงที่ ใช้เป็น evidence key
  science: ScienceId;
  label: string;     // ป้ายสั้นบอกว่าหมุดนี้คืออะไร (ภาษาไทย/ศัพท์วิชา — เป็น input ให้ AI แปลตามภาษาผู้ใช้)
  value: string;     // ค่าจริงจากเครื่องคำนวณ
  when?: string;     // ช่วงเวลา (ถ้ามี) เช่น "2026-03..2026-05" หรือ "อายุ 33-42"
};

export type AskAnchorInput = {
  birthDate: string;          // YYYY-MM-DD
  birthTime: string;          // HH:MM (ใช้เมื่อ birthTimeKnown)
  birthTimeKnown: boolean;
  gender: "M" | "F";
  lat: number;
  lng: number;
  gmtOffsetHours: number;     // จากเมืองเกิด (default +7)
  displayName: string;
  intent: string;             // finance|career|love|timing|home|health|general
  targetYear: number;
};

/* ข้อมูลวาดผังจริงฝั่งหน้า (พิสูจน์ว่าคำนวณจริง ไม่มั่ว) — ตัวเลข/ตำแหน่งจากเครื่องล้วน */
export type AskVisuals = {
  pillars: { label: string; stem: string; branch: string; stemEl: string; branchEl: string; isDM: boolean }[];
  elements: { el: string; pct: number }[];
  western: { asc: number | null; planets: { g: string; name: string; lon: number; retro: boolean }[] } | null;
  vedic: { lagna: number | null; grahas: { a: string; rashi: number }[] } | null;
};

export type AskAnchorBundle = {
  anchors: AskAnchor[];
  byScience: Partial<Record<ScienceId, AskAnchor[]>>;
  missingSciences: ScienceId[]; // ศาสตร์ที่สร้างหมุดจริงไม่ได้ในรอบนี้ (ห้าม AI แต่งแทน)
  warnings: string[];
  pastCheckAnchor: AskAnchor | null; // หมุด "ทายอดีต" (จุดเปลี่ยน 大運 ล่าสุดที่ผ่านมาแล้ว)
  visuals: AskVisuals;
};

/* ── util ── */

function offsetString(h: number): string {
  const sign = h < 0 ? "-" : "+";
  const abs = Math.abs(h);
  const hh = String(Math.trunc(abs)).padStart(2, "0");
  const mm = String(Math.round((abs - Math.trunc(abs)) * 60)).padStart(2, "0");
  return `${sign}${hh}:${mm}`;
}

/** หา value ของ key ที่ระบุ ทุกตำแหน่งใน object (กันโครง packet ขยับระหว่างเวอร์ชัน) */
function findAllByKey(node: unknown, key: string, out: unknown[] = [], depth = 0): unknown[] {
  if (depth > 8 || node === null || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const item of node) findAllByKey(item, key, out, depth + 1);
    return out;
  }
  const rec = node as Record<string, unknown>;
  for (const k of Object.keys(rec)) {
    if (k === key) out.push(rec[k]);
    findAllByKey(rec[k], key, out, depth + 1);
  }
  return out;
}

function s(v: unknown, max = 120): string {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
}

/* ── ปาจื้อ: จาก calcBazi (มีอยู่แล้วใน route) + 大運 จริงจาก computeQiyunLock ── */

const STEM_ELEMENT_TH: Record<string, string> = {
  "甲": "ไม้หยาง", "乙": "ไม้หยิน", "丙": "ไฟหยาง", "丁": "ไฟหยิน", "戊": "ดินหยาง",
  "己": "ดินหยิน", "庚": "ทองหยาง", "辛": "ทองหยิน", "壬": "น้ำหยาง", "癸": "น้ำหยิน",
};

export async function buildBaziAnchors(
  input: AskAnchorInput,
  calc: BaziAnalysis
): Promise<{ anchors: AskAnchor[]; pastCheckAnchor: AskAnchor | null; warnings: string[] }> {
  const anchors: AskAnchor[] = [];
  const warnings: string[] = [];
  const birthYear = Number(input.birthDate.slice(0, 4));

  anchors.push({
    id: "bazi.day_master",
    science: "bazi",
    label: "วันเกิด (日主)",
    value: `${calc.dayMaster} ${STEM_ELEMENT_TH[calc.dayMaster] || ""} · กำลัง ${calc.strength.level} ${calc.strength.percent}%`,
  });
  if (calc.geJu?.structure) {
    anchors.push({ id: "bazi.structure", science: "bazi", label: "โครงดวง (格局)", value: s(calc.geJu.structure, 60) });
  }
  /* 用神: ยึดคำตัดสิน wrapper-7 (สูตรสูงสุด — ตัวเดียวกับซินแสหลัก/YONG_LOCK) ไม่ใช้ลิสต์ดิบ wrapper-6
   * เหตุ: ดวงโครงพิเศษ (從/假從) wrapper-6 เสนอธาตุกลับด้านได้ (เคสจริง 7 ก.ค.: 假從財格 ได้ไฟทั้งที่ไฟคือตัวห้าม) */
  const EL_TH: Record<string, string> = { wood: "ไม้", fire: "ไฟ", earth: "ดิน", metal: "ทอง", water: "น้ำ" };
  let w7ok = false;
  try {
    const w7 = (await import("../../../../../data/library/wrappers/7-yongshen-v2.js")) as unknown as {
      synthesizeYongshen: (n: unknown) => {
        structure_label?: string; primary_yongshen?: string[]; xishen?: string[]; jishen?: string[]; tiaohou_required?: string | null;
      };
    };
    const v = w7.synthesizeYongshen(calc.pillars);
    const els = (a?: string[]) => (a || []).map((e) => EL_TH[e] || e).join(" ");
    if (v && (v.primary_yongshen?.length || v.jishen?.length)) {
      anchors.push({
        id: "bazi.yongshen",
        science: "bazi",
        label: "ธาตุที่ดวงต้องการ (用神 · คำตัดสินเครื่องสูงสุด)",
        value: s(
          `หลัก: ${els(v.primary_yongshen)}${v.xishen?.length ? ` · เสริมได้: ${els(v.xishen)}` : ""}${v.jishen?.length ? ` · ห้ามเสริม: ${els(v.jishen)}` : ""}${v.tiaohou_required ? ` · ปรับอากาศ: ${EL_TH[v.tiaohou_required] || v.tiaohou_required} (เล็กน้อย ไม่ใช่สายหลัก)` : ""}`,
          220
        ),
      });
      w7ok = true;
    }
  } catch (e) {
    warnings.push(`bazi.yongshen w7: ${s(e instanceof Error ? e.message : e, 80)}`);
  }
  if (!w7ok) {
    const ys = calc.yongshen?.[0];
    if (ys) {
      anchors.push({ id: "bazi.yongshen", science: "bazi", label: "ธาตุที่ดวงต้องการ (用神)", value: `${ys.stem} (${ys.element})` });
    }
  }
  if (calc.climate) {
    anchors.push({ id: "bazi.climate", science: "bazi", label: "ภูมิอากาศดวง (調候)", value: s(calc.climate, 80) });
  }

  let pastCheckAnchor: AskAnchor | null = null;
  try {
    const qiyun = await computeQiyunLock({
      date: input.birthDate,
      time: input.birthTimeKnown ? input.birthTime : undefined,
      gender: input.gender,
      lng: input.lng,
      birthTimeKnown: input.birthTimeKnown,
      dayBoundary: "23:00",
      targetYear: input.targetYear,
    });
    const scenario = qiyun.scenarios?.[0];
    if (scenario?.luckSequence?.length) {
      const ageNow = input.targetYear - birthYear;
      const cur = scenario.luckSequence.find(
        (step) => ageNow >= step.ageStartRange.min && ageNow <= step.ageEndRange.max
      );
      if (cur) {
        const startY = Math.round(birthYear + cur.ageStartRange.min);
        const ageA = Math.floor(cur.ageStartRange.min);
        const ageB = Math.ceil(cur.ageEndRange.max);
        anchors.push({
          id: "bazi.dayun_now",
          science: "bazi",
          label: "วัยจรปัจจุบัน (大運)",
          value: `${cur.stem}${cur.branch}`,
          when: `อายุ ${ageA}-${ageB} (~ปี ${startY}-${Math.round(birthYear + cur.ageEndRange.max)})`,
        });
        /* ทายอดีต: ปีที่เข้า大運 ปัจจุบัน = จุดเปลี่ยนบรรยากาศชีวิตครั้งล่าสุดที่ผ่านมาแล้วจริง */
        if (startY < input.targetYear) {
          const prev = scenario.luckSequence[Math.max(0, (cur.index ?? 1) - 1)];
          pastCheckAnchor = {
            id: "bazi.dayun_shift_past",
            science: "bazi",
            label: "จุดเปลี่ยนวัยจรครั้งล่าสุด (เกิดขึ้นแล้ว)",
            value: `เปลี่ยนจาก ${prev && prev !== cur ? `${prev.stem}${prev.branch}` : "ช่วงก่อนหน้า"} → ${cur.stem}${cur.branch}`,
            when: `ราวปี ${startY - 1} ถึง ${startY + 1}`,
          };
          anchors.push(pastCheckAnchor);
        }
      }
    }
    if (!scenario?.luckSequence?.length) warnings.push("bazi: computeQiyunLock ไม่มี luckSequence");
  } catch (e) {
    warnings.push(`bazi.dayun: ${s(e instanceof Error ? e.message : e, 80)}`);
  }
  return { anchors, pastCheckAnchor, warnings };
}

/* ── 5 ศาสตร์ astro: renderChartForScience → กลั่นหมุด ── */

const INTENT_ZIWEI_PALACE: Record<string, string> = {
  finance: "財帛", career: "官祿", love: "夫妻", home: "田宅", health: "疾厄",
  timing: "命宮", general: "命宮",
};

/* ดาวช้า = เหตุการณ์ระดับปี (ทรานซิตดาวเร็วเป็นสัญญาณรายวัน ไม่ใช้เป็นหมุด preview) */
const SLOW_BODIES = /jupiter|saturn|uranus|neptune|pluto|node/i;

type Distiller = (packet: unknown, input: AskAnchorInput) => AskAnchor[];

const DISTILLERS: Record<string, Distiller> = {
  qizheng(packet, input) {
    const out: AskAnchor[] = [];
    const ming = findAllByKey(packet, "mingDegree")[0] as Record<string, unknown> | undefined;
    if (ming && (ming.lordTh || ming.lordZh)) {
      out.push({
        id: "qizheng.ming_lord",
        science: "qizheng",
        label: "เจ้าเรือนชะตา (命度主)",
        value: s(`${ming.lordTh || ""} ${ming.lordZh || ""} · สถานะ ${ming.lordStatus || "-"} · ${ming.relationToMing || ""}`, 140),
      });
    }
    const stars = (findAllByKey(packet, "stars")[0] as Record<string, unknown>[] | undefined) || [];
    const strong = stars.filter((st) => /廟|旺|得|喜/.test(String(st?.status || ""))).slice(0, 2);
    const pick = strong.length ? strong : stars.slice(0, 2);
    pick.forEach((st, i) => {
      out.push({
        id: `qizheng.star_${i + 1}`,
        science: "qizheng",
        label: "ดาวจริงเด่นในผัง",
        value: s(`${st.th || ""} ${st.zh || ""} ใน ${st.signTh || ""} · ${st.status || ""}${st.retro ? " (พักร์)" : ""}`, 120),
      });
    });
    const transits = (findAllByKey(packet, "transit")[0] as Record<string, unknown>[] | undefined) || [];
    const t = transits.find((x) => Number(x?.year) === input.targetYear) || transits[0];
    if (t) {
      out.push({
        id: "qizheng.transit",
        science: "qizheng",
        label: `ดาวจรปี ${t.year}`,
        value: s(`木星เรือน ${t.jupiterHouseZh || "-"} · 土星เรือน ${t.saturnHouseZh || "-"} ${t.note ? `· ${t.note}` : ""}`, 140),
        when: String(t.year || input.targetYear),
      });
    }
    return out;
  },

  ziwei(packet, input) {
    const out: AskAnchor[] = [];
    const palaces = (findAllByKey(packet, "palaces")[0] as Record<string, unknown>[] | undefined) || [];
    const byName = (name: string) => palaces.find((p) => String(p?.name || "").includes(name));
    const ming = byName("命宮") || byName("命");
    const starsOf = (p: Record<string, unknown> | undefined) =>
      (((p?.majorStars as Record<string, unknown>[] | undefined) || [])
        .map((m) => `${m.name}${m.brightness ? `(${m.brightness})` : ""}`)
        .join(" "));
    if (ming) {
      out.push({
        id: "ziwei.ming_stars",
        science: "ziwei",
        label: "ดาวเรือนชะตา (命宮)",
        value: s(`${starsOf(ming) || "ไม่มีดาวหลัก (借對宮)"} · ${ming.ganzhi || ""}`, 130),
      });
    }
    const topicName = INTENT_ZIWEI_PALACE[input.intent] || "命宮";
    const topic = byName(topicName);
    if (topic && topic !== ming) {
      const dx = topic.daXian as { ageStart?: number; ageEnd?: number } | undefined;
      out.push({
        id: "ziwei.topic_palace",
        science: "ziwei",
        label: `เรือนที่ตรงคำถาม (${topicName})`,
        value: s(`${starsOf(topic) || "ไม่มีดาวหลัก (借對宮)"} · ${topic.ganzhi || ""}`, 130),
        when: dx && Number.isFinite(dx.ageStart) ? `大限 อายุ ${dx.ageStart}-${dx.ageEnd}` : undefined,
      });
    }
    const siHua = (findAllByKey(packet, "siHua")[0] as Record<string, unknown>[] | undefined) || [];
    const hua = siHua.filter((h) => h && h.star && h.type).slice(0, 2);
    if (hua.length) {
      out.push({
        id: "ziwei.sihua",
        science: "ziwei",
        label: "การแปรดาวปีเกิด (四化)",
        value: s(hua.map((h) => `${h.star}化${h.type}${h.palaceName ? `@${h.palaceName}` : ""}`).join(" · "), 120),
      });
    }
    return out;
  },

  western(packet, input) {
    const out: AskAnchor[] = [];
    const hits = (findAllByKey(packet, "transitHits")[0] as Record<string, unknown>[] | undefined) || [];
    const slow = hits.filter((h) => SLOW_BODIES.test(String(h?.transit || "")));
    const pick = (slow.length ? slow : hits).slice(0, 3);
    pick.forEach((h, i) => {
      out.push({
        id: `western.transit_${i + 1}`,
        science: "western",
        label: "ทรานซิตแรงของปีเป้าหมาย",
        value: s(`${h.transitTh || h.transit} ${h.aspectTh || h.aspect} ${h.natalTh || h.natal}${h.retro ? " (พักร์)" : ""} รอบ ${h.pass}/${h.passesTotal}`, 130),
        when: s(String(h.dateISO || "").slice(0, 10) || `${input.targetYear}`, 20),
      });
    });
    if (!pick.length) {
      const sr = findAllByKey(packet, "solarReturn")[0] as Record<string, unknown> | undefined;
      if (sr?.dateISO) {
        out.push({
          id: "western.solar_return",
          science: "western",
          label: "Solar Return ปีเป้าหมาย",
          value: s(`ลัคนา SR ${(sr.ascendant as Record<string, unknown>)?.signTh || "-"}`, 100),
          when: s(String(sr.dateISO).slice(0, 10), 20),
        });
      }
    }
    return out;
  },

  vedic(packet, input) {
    const out: AskAnchor[] = [];
    const maha = (findAllByKey(packet, "mahadasha")[0] as Record<string, unknown>[] | undefined) || [];
    const nowY = input.targetYear + 0.5;
    const cur = maha.find((d) => Number(d?.startYear) <= nowY && nowY < Number(d?.endYear));
    if (cur) {
      out.push({
        id: "vedic.dasha",
        science: "vedic",
        label: "มหาทศาปัจจุบัน (Vimshottari)",
        value: s(`${cur.lord}`, 40),
        when: `ปี ${Math.floor(Number(cur.startYear))}-${Math.floor(Number(cur.endYear))} (อายุ ${Math.floor(Number(cur.ageStart))}-${Math.floor(Number(cur.ageEnd))})`,
      });
    }
    const antar = (findAllByKey(packet, "antardasha")[0] as Record<string, unknown>[] | undefined) || [];
    const curA = antar.find((d) => Number(d?.startYear) <= nowY && nowY < Number(d?.endYear));
    if (curA) {
      out.push({
        id: "vedic.antardasha",
        science: "vedic",
        label: "อันตรทศาปัจจุบัน",
        value: s(`${curA.lord}`, 40),
        when: `~ปี ${Math.floor(Number(curA.startYear))}-${Math.floor(Number(curA.endYear))}`,
      });
    }
    /* moonNakshatra: เอาเฉพาะ object ที่มีชื่อจริง (เลี่ยง timingConfidence.moonNakshatra = "firm"/"uncertain") */
    const nakCands = findAllByKey(packet, "moonNakshatra").filter(
      (n) => n && typeof n === "object" && ((n as Record<string, unknown>).name || (n as Record<string, unknown>).th)
    ) as Record<string, unknown>[];
    if (nakCands[0]) {
      out.push({
        id: "vedic.nakshatra",
        science: "vedic",
        label: "นักษัตรจันทร์เกิด",
        value: s(`${nakCands[0].name || nakCands[0].th}${nakCands[0].pada ? ` บาท ${nakCands[0].pada}` : ""}`, 80),
      });
    }
    return out;
  },

  uranian(packet) {
    const out: AskAnchor[] = [];
    const pics = (findAllByKey(packet, "planetaryPictures")[0] as Record<string, unknown>[] | undefined) || [];
    const hard = pics
      .filter((p) => String(p?.tier || "hard") === "hard")
      .sort((a, b) => Number(a?.orbDeg ?? 99) - Number(b?.orbDeg ?? 99));
    const top = hard[0] || pics[0];
    if (top) {
      out.push({
        id: "uranian.picture",
        science: "uranian",
        label: "ภาพดาวคมสุด (Planetenbild dial 90°)",
        value: s(`${top.formula || `${top.pair} = ${top.occupant}`} · orb ${(() => { const o = Number(top.orbDeg ?? 0); return o >= 0.01 ? o.toFixed(2) : o.toFixed(3); })()}°`, 120),
      });
    }
    return out;
  },
};

/* ── ตัวประกอบหลัก ── */

export async function buildAskAnchors(
  input: AskAnchorInput,
  calc: BaziAnalysis,
  refDate: Date
): Promise<AskAnchorBundle> {
  const byScience: Partial<Record<ScienceId, AskAnchor[]>> = {};
  const warnings: string[] = [];
  const missingSciences: ScienceId[] = [];

  const bazi = await buildBaziAnchors(input, calc);
  byScience.bazi = bazi.anchors;
  warnings.push(...bazi.warnings);

  const time = input.birthTimeKnown ? input.birthTime : "12:00";
  const dtUTC = new Date(`${input.birthDate}T${time}:00${offsetString(input.gmtOffsetHours)}`);
  const hasTime = input.birthTimeKnown;
  const { lat, lng, gender, targetYear } = input;

  /* สร้าง packet ตรงต่อศาสตร์ — ท่าเดียวกับ renderChartForScience (timeline ล้ม = degrade ไม่ล้มทั้งศาสตร์) */
  const packetBuilders: Record<string, () => unknown> = {
    qizheng: () => buildQizhengPacket(dtUTC, lat, lng, hasTime, [targetYear, targetYear + 1], refDate),
    ziwei: () => buildZiweiPacket(dtUTC, lat, lng, gender, hasTime, { refDate }),
    western: () => {
      const chart = westernChart(dtUTC, lat, lng, hasTime, gender, refDate);
      let timeline = null;
      try {
        timeline = buildWesternTimeline(chart, { dtUTC, lat, lng }, targetYear);
      } catch { timeline = null; }
      return buildWesternPacket(chart, timeline);
    },
    vedic: () => {
      const chart = vedicChart(dtUTC, lat, lng, hasTime, refDate);
      let timeline = null;
      try {
        timeline = buildVedicTimeline(chart, targetYear);
      } catch { timeline = null; }
      return buildVedicPacket(chart, timeline);
    },
    uranian: () => buildUranianPacket(uranianChart(dtUTC, lat, lng, hasTime, gender), null),
  };

  const packets: Partial<Record<string, unknown>> = {};
  const astroSciences: ScienceId[] = ["qizheng", "ziwei", "western", "vedic", "uranian"];
  for (const science of astroSciences) {
    try {
      const packet = packetBuilders[science]();
      packets[science] = packet;
      if (!packet) {
        missingSciences.push(science);
        warnings.push(`${science}: packet builder คืนค่าว่าง`);
        continue;
      }
      /* กันหมุดค่าว่าง/ไร้สาระหลุดไปเป็นหลักฐาน */
      const anchors = (DISTILLERS[science]?.(packet, input) || []).filter(
        (a) => a.value && a.value.replace(/[·\s()\-–—]/g, "").length >= 2
      );
      if (!anchors.length) {
        missingSciences.push(science);
        warnings.push(`${science}: packet มาแต่กลั่นหมุดไม่ได้ (โครงอาจเปลี่ยน)`);
        continue;
      }
      byScience[science] = anchors;
    } catch (e) {
      missingSciences.push(science);
      warnings.push(`${science}: ${s(e instanceof Error ? e.message : e, 100)}`);
    }
  }

  const anchors = Object.values(byScience).flat().filter(Boolean) as AskAnchor[];
  const visuals = await buildVisuals(calc, packets, warnings);
  return { anchors, byScience, missingSciences, warnings, pastCheckAnchor: bazi.pastCheckAnchor, visuals };
}

/* ── ข้อมูลวาดผังฝั่งหน้า — ดึงจาก calc + packet จริงเท่านั้น ── */

const STEM_EL: Record<string, string> = { "甲": "wood", "乙": "wood", "丙": "fire", "丁": "fire", "戊": "earth", "己": "earth", "庚": "metal", "辛": "metal", "壬": "water", "癸": "water" };
const BRANCH_EL: Record<string, string> = { "寅": "wood", "卯": "wood", "巳": "fire", "午": "fire", "辰": "earth", "戌": "earth", "丑": "earth", "未": "earth", "申": "metal", "酉": "metal", "亥": "water", "子": "water" };
const PLANET_GLYPH: Record<string, string> = { Sun: "☉", Moon: "☽", Mercury: "☿", Venus: "♀", Mars: "♂", Jupiter: "♃", Saturn: "♄", Uranus: "♅", Neptune: "♆", Pluto: "♇" };
const GRAHA_ABBR: Record<string, string> = { Sun: "Su", Moon: "Mo", Mars: "Ma", Mercury: "Me", Jupiter: "Ju", Venus: "Ve", Saturn: "Sa", Rahu: "Ra", Ketu: "Ke" };

async function buildVisuals(
  calc: BaziAnalysis,
  packets: Partial<Record<string, unknown>>,
  warnings: string[]
): Promise<AskVisuals> {
  /* ปาจื้อ 4 เสา */
  const P = calc.pillars as Record<string, { stem: string; branch: string } | null>;
  const labels: [string, string][] = [["year", "ปี"], ["month", "เดือน"], ["day", "วัน"], ["hour", "ยาม"]];
  const pillars = labels
    .filter(([k]) => P[k])
    .map(([k, label]) => ({
      label,
      stem: P[k]!.stem,
      branch: P[k]!.branch,
      stemEl: STEM_EL[P[k]!.stem] || "earth",
      branchEl: BRANCH_EL[P[k]!.branch] || "earth",
      isDM: k === "day",
    }));

  /* สัดส่วนธาตุ (ก้อนดิบ wrapper-6 — ชุดเดียวกับที่ใช้ตัดสินกำลัง) */
  let elements: { el: string; pct: number }[] = [];
  try {
    const w6 = (await import("../../../../../data/library/wrappers/6-strength-yongshen.js")) as unknown as {
      computeStrength: (n: unknown) => { detail?: { counts?: Record<string, number> } };
    };
    const counts = w6.computeStrength(calc.pillars)?.detail?.counts || {};
    const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
    elements = ["wood", "fire", "earth", "metal", "water"].map((el) => ({ el, pct: Math.round(((counts[el] || 0) / total) * 100) }));
  } catch (e) {
    warnings.push(`visuals.elements: ${s(e instanceof Error ? e.message : e, 60)}`);
  }

  /* วงล้อตะวันตก: ดาวจริง + ลัคนา (องศา ecliptic จริง) */
  let western: AskVisuals["western"] = null;
  try {
    const wp = packets.western as Record<string, unknown> | undefined;
    const planets = ((findAllByKey(wp, "planets")[0] as Record<string, unknown>[] | undefined) || [])
      .filter((p) => PLANET_GLYPH[String(p?.name)])
      .map((p) => ({
        g: PLANET_GLYPH[String(p.name)],
        name: String(p.name),
        lon: (Number(p.sign) || 0) * 30 + (Number(p.signDeg) || 0),
        retro: !!p.retro,
      }));
    const asc = findAllByKey(wp, "ascendant")[0] as Record<string, unknown> | undefined;
    if (planets.length) {
      western = { asc: asc && Number.isFinite(Number(asc.sign)) ? (Number(asc.sign) || 0) * 30 + (Number(asc.signDeg) || 0) : null, planets };
    }
  } catch (e) {
    warnings.push(`visuals.western: ${s(e instanceof Error ? e.message : e, 60)}`);
  }

  /* ผังพระเวท: ราศีต่อดาว (sidereal) */
  let vedic: AskVisuals["vedic"] = null;
  try {
    const vp = packets.vedic as Record<string, unknown> | undefined;
    const grahas = ((findAllByKey(vp, "grahas")[0] as Record<string, unknown>[] | undefined) || [])
      .filter((g) => GRAHA_ABBR[String(g?.name)] && Number.isFinite(Number(g?.rashi)))
      .map((g) => ({ a: GRAHA_ABBR[String(g.name)], rashi: Number(g.rashi) }));
    const lagna = findAllByKey(vp, "lagna")[0] as Record<string, unknown> | undefined;
    if (grahas.length) {
      vedic = { lagna: lagna && Number.isFinite(Number(lagna.rashi)) ? Number(lagna.rashi) : null, grahas };
    }
  } catch (e) {
    warnings.push(`visuals.vedic: ${s(e instanceof Error ? e.message : e, 60)}`);
  }

  return { pillars, elements, western, vedic };
}

/** id หมุดทั้งหมด (คลังหลักฐานที่อนุญาต) */
export function anchorIds(bundle: AskAnchorBundle): Set<string> {
  return new Set(bundle.anchors.map((a) => a.id));
}
