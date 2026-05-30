/**
 * bazi-boundary.ts · ตรวจ "เกิดวันคาบ節氣" (additive · ไม่แตะ Layer 0/1)
 *
 * ปัญหา: คน 3 เสา (ไม่รู้เวลา) ที่เกิดวัน節氣(節)เปลี่ยน → เสาเดือน(月柱) ก้ำกึ่ง
 *   เช่น na 5/5/1996 立夏 13:26 → ก่อน=壬辰 หลัง=癸巳 · engine ใช้เที่ยงปลอม ฟัน壬辰
 *   เดียวกันกับ 立春 → เสาปี(年柱) ก้ำกึ่ง
 *
 * helper นี้คำนวณจาก date อิสระ (ไม่พึ่ง calcBazi) → เสียบ route-level ใน 4 sifu reading paths
 *   (sifu/route เดี่ยว+intro · sifu/group · sifu/compare) · ไม่แตะ chart-packet (กันลามไป /chart)
 * อ่านก้านกิ่งจาก eightChar ของ tyme4ts (ไม่คำนวณก้านเอง · ตาม codex)
 *
 * timezone: tyme4ts 節氣 = BJT(UTC+8) · helper return เวลา BJT ตรงๆ + แปลง ICT(−1h) ให้ display
 */
import { SolarTime, SolarDay } from "tyme4ts";

export type PillarBoundary = {
  boundary: boolean;            // true = เสาเดือน/ปี ก้ำกึ่ง (節氣ตกในวันเกิด ทำให้ก้านกิ่งต่างต้นวัน/ปลายวัน)
  termName?: string;            // ชื่อ節氣 เช่น "立夏" / "立春"
  jieqiBjt?: string;            // เวลา節氣 (BJT) "YYYY-MM-DD HH:MM"
  jieqiIctApprox?: string;      // เวลาโดยประมาณเขตไทย ICT (BJT−1h)
  before?: string;             // ก้านกิ่งถ้าเกิดก่อน節氣 (壬辰)
  after?: string;              // ก้านกิ่งถ้าเกิดหลัง節氣 (癸巳)
};

function fmt(st: SolarTime): string {
  // tyme4ts toString = "1996年5月5日 13:26:02"
  const m = st.toString().match(/(\d+)年(\d+)月(\d+)日\s+(\d+):(\d+)/);
  if (!m) return st.toString();
  const [, y, mo, d, h, mi] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")} ${h.padStart(2, "0")}:${mi.padStart(2, "0")}`;
}
function minus1h(bjt?: string): string | undefined {
  if (!bjt) return undefined;
  const m = bjt.match(/(\d+)-(\d+)-(\d+) (\d+):(\d+)/);
  if (!m) return bjt;
  const [, y, mo, d, h, mi] = m.map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d, h - 1, mi, 0)); // ลบ 1 ชม.ผ่าน Date → rollover ข้ามวัน/เดือน/ปีถูกต้อง
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())} ${p(dt.getUTCHours())}:${p(dt.getUTCMinutes())}`;
}

/**
 * window ในพิกัด BJT ของ "วันเกิดปฏิทินไทย D ที่ไม่รู้เวลา"
 * ผู้ใช้ไทยรู้แค่วัน D (ICT) · เวลาจริงอยู่ที่ไหนก็ได้ใน 24 ชม. → ICT [D 00:00, D 23:59]
 * tyme4ts ทำงานพิกัด BJT (UTC+8) · ไทย ICT(UTC+7) → BJT = +1 ชม.
 *   ⇒ BJT window = [D 01:00 , D+1 00:59]
 * (Codex รอบ 52: ถ้า bracket วัน BJT เดียวกัน จะพลาด節氣ที่ตกหลังเที่ยงคืน BJT แต่ยังเป็นวันไทย D)
 */
function bjtWindow(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const d0 = SolarDay.fromYmd(y, m, d);
  const d1 = d0.next(1);
  const start = SolarTime.fromYmdHms(y, m, d, 1, 0, 0); // วันไทย D 00:00 ICT
  const end = SolarTime.fromYmdHms(d1.getYear(), d1.getMonth(), d1.getDay(), 0, 59, 0); // วันไทย D 23:59 ICT
  return { d0, d1, start, end };
}

/** หา節氣 (節 สำหรับเดือน · 立春 สำหรับปี) ที่ตกในช่วง [start, end] ของ window */
function pickTerm(days: SolarDay[], start: SolarTime, end: SolarTime, monthMode: boolean) {
  const jdS = start.getJulianDay().getDay();
  const jdE = end.getJulianDay().getDay();
  for (const day of days) {
    const t = day.getTerm();
    if (!t) continue;
    const ok = monthMode ? t.isJie() : t.getName() === "立春";
    if (!ok) continue;
    const jd = t.getJulianDay().getDay();
    if (jd >= jdS && jd <= jdE) return t;
  }
  return null;
}

/** เสาเดือนก้ำกึ่ง: 節(Jie)ตกในช่วงวันเกิดปฏิทินไทย → ก้านกิ่งเดือนต่างต้นวัน/ปลายวัน */
export function monthPillarBoundary(date: string): PillarBoundary {
  try {
    const { d0, d1, start, end } = bjtWindow(date);
    const before = start.getLunarHour().getEightChar().getMonth().getName();
    const after = end.getLunarHour().getEightChar().getMonth().getName();
    if (before === after) return { boundary: false };
    const term = pickTerm([d0, d1], start, end, true);
    const bjt = term ? fmt(term.getJulianDay().getSolarTime()) : undefined;
    return { boundary: true, termName: term?.getName() || "節氣", jieqiBjt: bjt, jieqiIctApprox: minus1h(bjt), before, after };
  } catch {
    return { boundary: false };
  }
}

/**
 * ข้อความเตือนพร้อมใส่ packet/context ซินแส (ไทย) — คืน "" ถ้าไม่ก้ำกึ่ง
 * ใช้เฉพาะ 3 เสา (ไม่รู้เวลา) เท่านั้น · 4 เสา (รู้เวลา) ไม่ต้องเตือน (เสาตายตัวด้วยเวลาจริง)
 */
export function boundaryWarning3p(date: string): string {
  const mb = monthPillarBoundary(date);
  const yb = yearPillarBoundary(date);
  if (!mb.boundary && !yb.boundary) return "";
  const parts: string[] = [];
  if (mb.boundary) {
    parts.push(
      `⚠️ เกิดวันคาบ節氣 (${mb.termName} ~${mb.jieqiIctApprox} เวลาไทยโดยประมาณ) + ไม่ทราบเวลาเกิด → เสาเดือน(月柱)ก้ำกึ่งระหว่าง "${mb.before}" (ถ้าเกิดก่อน節氣) หรือ "${mb.after}" (ถ้าเกิดหลัง節氣) ขึ้นกับเวลาเกิดจริง`
    );
  }
  if (yb.boundary) {
    parts.push(
      `⚠️ เกิดวันคาบ立春 + ไม่ทราบเวลาเกิด → เสาปี(年柱)ก้ำกึ่งระหว่าง "${yb.before}" หรือ "${yb.after}" (ปีนักษัตร/干支ปีอาจเปลี่ยน) ขึ้นกับเวลาเกิดจริง`
    );
  }
  parts.push(
    `กฎอ่านดวงเคสนี้: เรื่องที่พึ่ง月令/月支/年柱 (用神·格局·月令旺衰·月支/年支冲合刑害·命宮/身宮/司令/小運) ให้อ่าน 2 ทางหรือระบุว่า "ขึ้นกับเวลาเกิด" ห้ามฟันธงข้างเดียว · เรื่องที่พึ่ง 日干/日支/十神/大運(ลำดับ) ฟันธงต่อได้ตามน้ำหนักดวง · แนะนำให้ผู้ใช้กรอกเวลาเกิดจริงเพื่อล็อกเสา`
  );
  return parts.join("\n");
}

/** เสาปีก้ำกึ่ง: 立春ตกในช่วงวันเกิดปฏิทินไทย → ก้านกิ่งปีต่างต้นวัน/ปลายวัน */
export function yearPillarBoundary(date: string): PillarBoundary {
  try {
    const { d0, d1, start, end } = bjtWindow(date);
    const before = start.getLunarHour().getEightChar().getYear().getName();
    const after = end.getLunarHour().getEightChar().getYear().getName();
    if (before === after) return { boundary: false };
    const term = pickTerm([d0, d1], start, end, false);
    const bjt = term ? fmt(term.getJulianDay().getSolarTime()) : undefined;
    return { boundary: true, termName: term?.getName() || "立春", jieqiBjt: bjt, jieqiIctApprox: minus1h(bjt), before, after };
  } catch {
    return { boundary: false };
  }
}
