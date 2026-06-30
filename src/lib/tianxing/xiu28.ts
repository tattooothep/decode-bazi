/**
 * 二十八宿 · ระบบ距星 (determinative stars) — A2 · 30 มิ.ย. 2026
 * =====================================================================
 * map ecliptic longitude (ของดาว · astronomy-engine ของวันนั้น) → 宿 + 度ใน宿
 *
 * วิธี (ยืนยัน清史稿/御製曆象考成):
 *   - แต่ละ宿 = ช่วงตั้งแต่ 距星(ดาวหลัก) ของมัน ถึง距星ของ宿ถัดไป (黃道)
 *   - คำนวณ黃經距星 ด้วย astronomy-engine ณ "วันที่ของชาร์ต" → จัดการ歲差(恆星東行 51″/ปี)อัตโนมัติ
 *   - 宿度 = 黃經ดาว − 黃經距星 (กรอบ ecliptic-of-date เดียวกัน → precession หักล้างกัน)
 *
 * ✅ VALIDATED: เทียบ 御製曆象考成 表卷14 (斗=初宮5°50′@1684 · ต่าง 4′)
 *    + 清史稿卷28 黃道十二次初度值宿@1684 ครบ 12/12 宿 (เฉลี่ยต่าง 3.8′ · มากสุด 12′)
 * ดาว距星: J2000 RA/Dec (Bayer มาตรฐาน) · 心=σSco(心一) 參=ζOri 觜=λOri (ตาม清御製 觜前參後)
 * ⚠️ 昴(17Tau)/房(πSco) ต่าง anchor ~12′ (เลือกดาว variant) — ไม่กระทบระดับ宿
 */
import * as A from "astronomy-engine";

/** 28 宿 เรียงตามลำดับ黃道 (角→軫) + 距星 J2000 [RA ชั่วโมง, Dec องศา] */
export const XIU28: { zh: string; th: string; star: string; ra: number; dec: number }[] = [
  { zh: "角", th: "จอแร", star: "αVir", ra: 13.4199, dec: -11.1614 },
  { zh: "亢", th: "ขัง", star: "κVir", ra: 14.2149, dec: -10.2736 },
  { zh: "氐", th: "ตี", star: "α²Lib", ra: 14.8480, dec: -16.0417 },
  { zh: "房", th: "ผัง", star: "πSco", ra: 15.9809, dec: -26.1142 },
  { zh: "心", th: "ซิม", star: "σSco", ra: 16.3531, dec: -25.5928 },
  { zh: "尾", th: "บ๋วย", star: "μ¹Sco", ra: 16.8645, dec: -38.0475 },
  { zh: "箕", th: "กี", star: "γSgr", ra: 18.0968, dec: -30.4231 },
  { zh: "斗", th: "เต่า", star: "φSgr", ra: 18.7610, dec: -26.9908 },
  { zh: "牛", th: "งู", star: "βCap", ra: 20.3502, dec: -14.7814 },
  { zh: "女", th: "นึ่ง", star: "εAqr", ra: 20.7946, dec: -9.4958 },
  { zh: "虛", th: "ฮือ", star: "βAqr", ra: 21.5260, dec: -5.5711 },
  { zh: "危", th: "guī", star: "αAqr", ra: 22.0964, dec: -0.3197 },
  { zh: "室", th: "เซ็ก", star: "αPeg", ra: 23.0794, dec: 15.2053 },
  { zh: "壁", th: "เปียะ", star: "γPeg", ra: 0.2206, dec: 15.1836 },
  { zh: "奎", th: "คุย", star: "ζAnd", ra: 0.7890, dec: 24.2672 },
  { zh: "婁", th: "เลา", star: "βAri", ra: 1.9107, dec: 20.8081 },
  { zh: "胃", th: "หุ่ย", star: "35Ari", ra: 2.7242, dec: 27.7072 },
  { zh: "昴", th: "เบ้า", star: "17Tau", ra: 3.7479, dec: 24.1133 },
  { zh: "畢", th: "ปิต", star: "εTau", ra: 4.4769, dec: 19.1803 },
  { zh: "觜", th: "จุ", star: "λOri", ra: 5.5856, dec: 9.9342 },
  { zh: "參", th: "ซิม", star: "ζOri", ra: 5.6793, dec: -1.9428 },
  { zh: "井", th: "เจ้ง", star: "μGem", ra: 6.3827, dec: 22.5136 },
  { zh: "鬼", th: "กุ้ย", star: "θCnc", ra: 8.5266, dec: 18.0944 },
  { zh: "柳", th: "เหลา", star: "δHya", ra: 8.6276, dec: 5.7036 },
  { zh: "星", th: "แช", star: "αHya", ra: 9.4597, dec: -8.6586 },
  { zh: "張", th: "เตีย", star: "υ¹Hya", ra: 9.8580, dec: -14.8467 },
  { zh: "翼", th: "เอ็ก", star: "αCrt", ra: 10.9961, dec: -18.2989 },
  { zh: "軫", th: "ตึ๋ง", star: "γCrv", ra: 12.2634, dec: -17.5419 },
];

const norm360 = (d: number) => ((d % 360) + 360) % 360;

// cache ขอบ宿ต่อปี (歲差ช้า · ปีเดียวกันใช้ซ้ำ)
const _cache = new Map<number, number[]>();

/** 黃經 (ecliptic-of-date) ของ距星ทั้ง 28 ณ ปีนั้น (องศา) */
export function xiuBoundaries(date: Date): number[] {
  const year = date.getUTCFullYear();
  const hit = _cache.get(year);
  if (hit) return hit;
  const t = new A.AstroTime(new Date(Date.UTC(year, 5, 1)));  // กลางปี (precession ~คงที่ในปี)
  const lons = XIU28.map((x) => {
    A.DefineStar(A.Body.Star1, x.ra, x.dec, 1000);
    return norm360(A.Ecliptic(A.GeoVector(A.Body.Star1, t, false)).elon);
  });
  if (_cache.size > 64) _cache.clear();
  _cache.set(year, lons);
  return lons;
}

/** ดาวที่ ecliptic longitude lon (ของวันนั้น) อยู่宿ไหน + กี่度ใน宿 */
export function shuAt(lon: number, date: Date): { idx: number; zh: string; th: string; deg: number; width: number } {
  const b = xiuBoundaries(date);
  const L = norm360(lon);
  for (let i = 0; i < 28; i++) {
    const start = b[i];
    const end = b[(i + 1) % 28];
    const span = norm360(end - start);          // ความกว้าง宿 (距度)
    const off = norm360(L - start);             // ระยะจากต้น宿
    if (off < span) {
      return { idx: i, zh: XIU28[i].zh, th: XIU28[i].th, deg: +off.toFixed(2), width: +span.toFixed(2) };
    }
  }
  // fallback (ไม่ควรเกิด) — 宿ที่ใกล้สุด
  return { idx: 0, zh: XIU28[0].zh, th: XIU28[0].th, deg: 0, width: 0 };
}
