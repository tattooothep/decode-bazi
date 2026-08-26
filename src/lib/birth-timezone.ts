/**
 * เขตเวลาของ "เวลาเกิด" — ชั้นกลางที่ทุกเส้นศาสตร์ต้องใช้ร่วมกัน (23 ก.ค. 2569)
 *
 * ที่มาของปัญหา: ตาราง profiles ไม่มีคอลัมน์เขตเวลาเกิด — เวลาเกิดถูกบันทึกและอ่านกลับ
 * เป็น "เวลากำแพงกรุงเทพ" เสมอ ดวงที่เกิดต่างประเทศจึงได้เวลาสากลผิดตั้งแต่ต้นทาง
 * (ไต้หวันคลาด 1 ชม. · ลอนดอนคลาด 7 ชม.) ซึ่งพอถึงชั้นวิชาจะกลายเป็น 時辰 ผิด → ทั้งผังผิด
 *
 * ทางแก้เต็มคือเพิ่มคอลัมน์เขตเวลาเกิดใน DB (รอเจ้านายเคาะ) ระหว่างนี้ทุกเส้นต้อง:
 *   1) รับ ?tz= จากแอพได้ (โซน IANA หรือออฟเซ็ต)
 *   2) ถ้าไม่ได้รับ → ใช้ +07:00 เหมือนเดิม แต่ **ติดธงบอกตรงๆ** ว่าเป็นค่าตั้งต้น ไม่ใช่เขตเวลาเกิดจริง
 * ห้ามเงียบ — คัมภีร์และกติกาแอพห้ามเสิร์ฟผลที่รู้อยู่ว่าอาจคลาดโดยไม่บอกผู้ใช้
 *
 * ย้ายมาจาก /api/mobile/v1/tianxing/route.ts (เส้นแรกที่ทำเรื่องนี้) เพื่อให้จื่อเวยและเส้นอื่น
 * ใช้ตรรกะเดียวกันเป๊ะ ไม่ใช่ก๊อปโค้ดไปคนละชุดแล้วเพี้ยนกันทีหลัง
 */

export const DEFAULT_BIRTH_TZ = "Asia/Bangkok";
export const DEFAULT_BIRTH_TZ_OFFSET_MIN = 7 * 60;

export type TzSpec = { label: string; kind: "zone" | "offset"; offsetMin?: number };

export type BirthTimezoneMeta = {
  used: string;
  source: "profile" | "query" | "default_bangkok";
  isDefault: boolean;
  note: { th: string; en: string; zh: string };
};

/** ออฟเซ็ต (นาที) ของโซน IANA ณ ช่วงเวลา utcMs — ผ่าน Intl (รองรับ DST/เวลาในอดีต) */
export function zoneOffsetMinutes(utcMs: number, zone: string): number | null {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: zone, hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    const p: Record<string, number> = {};
    for (const part of dtf.formatToParts(new Date(utcMs))) {
      if (part.type !== "literal") p[part.type] = Number(part.value);
    }
    if (!p.year || !p.month || !p.day) return null;
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour === 24 ? 0 : p.hour, p.minute, p.second);
    return Math.round((asUtc - utcMs) / 60000);
  } catch { return null; }
}

/** อ่าน ?tz= — รับชื่อโซน IANA หรือออฟเซ็ต +HH:MM / -H / ตัวเลขชั่วโมง · ไม่ถูกต้อง = null */
export function parseTz(raw: string | null): TzSpec | null {
  const text = String(raw || "").trim();
  if (!text) return null;
  const m = /^([+-])?(\d{1,2})(?::?(\d{2}))?$/.exec(text);
  if (m) {
    const sign = m[1] === "-" ? -1 : 1;
    const hh = Number(m[2]), mm = Number(m[3] || 0);
    if (hh > 14 || mm > 59 || (hh === 14 && mm !== 0)) return null;
    const offsetMin = sign * (hh * 60 + mm);
    const abs = Math.abs(offsetMin);
    const label = `${offsetMin < 0 ? "-" : "+"}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
    return { label, kind: "offset", offsetMin };
  }
  try {
    const label = new Intl.DateTimeFormat("en-US", { timeZone: text }).resolvedOptions().timeZone;
    if (!label || label.length > 64 || zoneOffsetMinutes(Date.now(), label) === null) return null;
    return { label, kind: "zone" };
  } catch { return null; }
}

/** เวลานาฬิกา "YYYY-MM-DDTHH:MM:SS" + เขตเวลา → เวลาสากลจริง (สองรอบ กันช่วง DST เปลี่ยน) */
export function wallClockToUtc(wall: string, tz: TzSpec): Date | null {
  const naive = Date.parse(`${wall}Z`);
  if (!Number.isFinite(naive)) return null;
  if (tz.kind === "offset") return new Date(naive - (tz.offsetMin || 0) * 60000);
  const off1 = zoneOffsetMinutes(naive, tz.label);
  if (off1 === null) return null;
  let ms = naive - off1 * 60000;
  const off2 = zoneOffsetMinutes(ms, tz.label);
  if (off2 !== null && off2 !== off1) ms = naive - off2 * 60000;
  return new Date(ms);
}

/**
 * คำอธิบาย 3 ภาษาของเขตเวลาที่ใช้จริง (zh ห้ามมีอักษรไทยปน)
 * ลำดับความน่าเชื่อถือ: เขตเวลาที่บันทึกไว้ในโปรไฟล์ > ที่แอพส่งมาครั้งนี้ > ค่าตั้งต้นกรุงเทพ
 */
export function birthTimezoneMeta(tzParam: TzSpec | null, fromProfile = false): BirthTimezoneMeta {
  if (tzParam) {
    return {
      used: tzParam.label,
      source: fromProfile ? "profile" : "query",
      isDefault: false,
      note: fromProfile
        ? {
          th: "ใช้เขตเวลาเกิดที่บันทึกไว้ในโปรไฟล์",
          en: "Used the birth timezone saved on this profile.",
          zh: "採用檔案中已存的出生時區。",
        }
        : {
          th: "ใช้เขตเวลาที่แอพส่งมาเป็นเขตเวลาของสถานที่เกิด",
          en: "Birth timezone supplied by the app was used.",
          zh: "採用應用傳入的出生地時區。",
        },
    };
  }
  return {
    used: `${DEFAULT_BIRTH_TZ} (+07:00)`,
    source: "default_bangkok",
    isDefault: true,
    note: {
      th: "โปรไฟล์ไม่ได้เก็บเขตเวลาเกิด จึงใช้เวลาไทย +07:00 เป็นค่าตั้งต้น ถ้าเกิดต่างประเทศให้ส่ง tz มาด้วย มิฉะนั้นยามเกิดและตำแหน่งดาวจะคลาด",
      en: "Profile stores no birth timezone; Thailand +07:00 was assumed. Pass tz for births abroad, otherwise the birth hour and star positions will be off.",
      zh: "檔案未存出生時區，暫以泰國 +07:00 為預設。海外出生請傳入 tz，否則時辰與星位會偏差。",
    },
  };
}

/** เขตเวลาที่จะใช้จริง (พารามิเตอร์ที่ส่งมา หรือค่าตั้งต้นกรุงเทพ) */
export function resolveBirthTz(tzParam: TzSpec | null): TzSpec {
  return tzParam || { label: DEFAULT_BIRTH_TZ, kind: "offset", offsetMin: DEFAULT_BIRTH_TZ_OFFSET_MIN };
}

/** ออฟเซ็ตเป็นชั่วโมง ณ เวลานั้นจริง — ส่งต่อให้ engine ที่รับ gmtOffsetHours (จื่อเวย) */
export function tzOffsetHoursAt(tz: TzSpec, atUtc: Date): number {
  if (tz.kind === "offset") return (tz.offsetMin || 0) / 60;
  const off = zoneOffsetMinutes(atUtc.getTime(), tz.label);
  return off === null ? DEFAULT_BIRTH_TZ_OFFSET_MIN / 60 : off / 60;
}
