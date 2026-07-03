/**
 * HUNT 2 · 調候 (窮通寶鑑 · 甲木 12 เดือน) vs ฟิสิกส์ดวงอาทิตย์ (declination + ชั่วโมงกลางวัน)
 * canon: data/library/sifu-extra/qtbj-tiaohou-clean.md (อ้างบรรทัดจริง · verbatim)
 * เดือนจีน = 節氣 month = ช่วง solar longitude 30° เริ่มที่ 315°(立春=寅)
 * run: npx tsx scripts/research/hunt2-tiaohou-solar.mjs
 */
import { eclipticLon, eclipticCoords, declinationFromEcliptic, norm360 } from "../../src/lib/astro-core/ephemeris.ts";
import { wrap180 } from "../../src/lib/astro-core/events.ts";

const DAY = 86400000;
const D2R = Math.PI / 180;

/* ===== ตาราง 調候 甲木 จาก 窮通寶鑑 (qtbj-tiaohou-clean.md · verbatim + เลขบรรทัด) ===== */
const CANON = [
  { m: "寅", zh: "正月", line: 35, quote: "初春尚有餘寒，得丙癸逢，富貴雙全", primary: "丙(ไฟ)", secondary: "癸(น้ำ)", need: "fire" },
  { m: "卯", zh: "二月", line: 41, quote: "二月甲木，庚金得所，名陽刃駕殺", primary: "庚(ทอง)", secondary: "-", need: "metal" },
  { m: "辰", zh: "三月", line: 42, quote: "三月甲木，木氣相竭。先取庚金，次用壬水", primary: "庚(ทอง)", secondary: "壬(น้ำ)", need: "metal" },
  { m: "巳", zh: "四月", line: 50, quote: "四月甲木退氣，丙火司權，先癸後丁", primary: "癸(น้ำ)", secondary: "丁(ไฟ)", need: "water" },
  { m: "午", zh: "五月", line: 54, quote: "五月先癸後丁庚金次之", primary: "癸(น้ำ)", secondary: "丁(ไฟ)", need: "water" },
  { m: "未", zh: "六月", line: 54, quote: "六月三伏生寒，丁火退氣。先丁後庚，無癸亦可", primary: "丁(ไฟ)", secondary: "庚(ทอง)", need: "fire" },
  { m: "申", zh: "七月", line: 72, quote: "七月甲木，丁火為尊，庚金次之", primary: "丁(ไฟ)", secondary: "庚(ทอง)", need: "fire" },
  { m: "酉", zh: "八月", line: 73, quote: "八月甲木，木囚金旺。丁火為先，次用丙火，庚金再次", primary: "丁(ไฟ)", secondary: "丙(ไฟ)", need: "fire" },
  { m: "戌", zh: "九月", line: 80, quote: "九月甲木，木星凋零，獨愛丁火，壬癸滋扶", primary: "丁(ไฟ)", secondary: "壬癸(น้ำ)", need: "fire" },
  { m: "亥", zh: "十月", line: 91, quote: "十月甲木，庚丁為要，丙火次之。忌壬水泛身", primary: "庚+丁(ไฟ)", secondary: "丙(ไฟ)", need: "fire" },
  { m: "子", zh: "十一月", line: 95, quote: "十一月甲木，木性生寒，丁先庚後，丙火佐之", primary: "丁(ไฟ)", secondary: "丙(ไฟ)", need: "fire" },
  { m: "丑", zh: "十二月", line: 99, quote: "十二月甲木，天寒氣凍，木性極寒…先用庚劈甲，方引丁火", primary: "庚→丁(ไฟ)", secondary: "丁(ไฟ)", need: "fire" },
];

/* ===== หา 節氣 boundaries ปี 2026 (solar lon = 315+30k) ด้วย engine จริง ===== */
function findSolarLonCross(targetLon, tGuess) {
  const f = (t) => wrap180(eclipticLon("Sun", new Date(t)) - targetLon);
  let a = tGuess - 20 * DAY, b = tGuess + 20 * DAY;
  // เลื่อนหา bracket
  while (f(a) > 0) a -= 5 * DAY;
  while (f(b) < 0) b += 5 * DAY;
  let fa = f(a);
  for (let i = 0; i < 60 && b - a > 1000; i++) {
    const m = (a + b) / 2, fm = f(m);
    if ((fa <= 0 && fm <= 0) || (fa > 0 && fm > 0)) { a = m; fa = fm; } else { b = m; }
  }
  return (a + b) / 2;
}

// 寅月 เริ่ม立春 (315°) ~4 ก.พ. 2026 · เดือน k: lon = 315+30k
const bounds = [];
let guess = Date.UTC(2026, 1, 4);
for (let k = 0; k <= 12; k++) {
  const lon = norm360(315 + 30 * k);
  const t = findSolarLonCross(lon, guess);
  bounds.push(t);
  guess = t + 30.4 * DAY;
}

/* ===== daylight hours: cos H0 = -tanφ·tanδ ===== */
function daylightHours(latDeg, decDeg) {
  const x = -Math.tan(latDeg * D2R) * Math.tan(decDeg * D2R);
  if (x <= -1) return 24; if (x >= 1) return 0;
  return (2 * Math.acos(x) / D2R) / 15;
}

const BKK = 13.7563, XIAN = 34.3;
const rows = [];
for (let k = 0; k < 12; k++) {
  const t0 = bounds[k], t1 = bounds[k + 1];
  let sumDec = 0, sumBkk = 0, sumXian = 0, n = 0;
  for (let t = t0; t < t1; t += DAY) {
    const c = eclipticCoords("Sun", new Date(t));
    const dec = declinationFromEcliptic(c.lon, c.lat, new Date(t));
    sumDec += dec; sumBkk += daylightHours(BKK, dec); sumXian += daylightHours(XIAN, dec);
    n++;
  }
  rows.push({
    ...CANON[k],
    start: new Date(t0).toISOString().slice(0, 10),
    dec: sumDec / n, dayBkk: sumBkk / n, dayXian: sumXian / n,
  });
}

console.log("=== เดือน節氣 2026 × canon 調候 (甲木) × ฟิสิกส์ ===");
console.log("เดือน  เริ่ม(UTC)   meanDec°   daylight-BKK  daylight-Xi'an  canonต้องการ(primary)  ประเภท");
for (const r of rows) {
  console.log(`${r.m}${r.zh.padEnd(4)} ${r.start}  ${r.dec.toFixed(2).padStart(7)}   ${r.dayBkk.toFixed(2).padStart(7)}h     ${r.dayXian.toFixed(2).padStart(7)}h      ${r.primary.padEnd(12)} ${r.need}`);
}

/* ===== correlation: fire-need code (+1 fire primary / -1 water primary / 0 metal) vs -declination ===== */
const code = { fire: 1, water: -1, metal: 0 };
const xs = rows.map(r => code[r.need]);
const decs = rows.map(r => r.dec);
const dayx = rows.map(r => r.dayXian);
function pearson(a, b) {
  const n = a.length, ma = a.reduce((x, y) => x + y) / n, mb = b.reduce((x, y) => x + y) / n;
  let sab = 0, sa = 0, sb = 0;
  for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; }
  return sab / Math.sqrt(sa * sb);
}
console.log(`\nPearson r (fire-need code vs mean declination) = ${pearson(xs, decs).toFixed(3)}  (คาดหวังลบ: ยิ่งหนาว dec ต่ำ ยิ่งต้องไฟ)`);
console.log(`Pearson r (fire-need code vs daylight Xi'an)  = ${pearson(xs, dayx).toFixed(3)}`);
console.log(`Pearson r (fire-need code vs daylight BKK)    = ${pearson(xs, rows.map(r => r.dayBkk)).toFixed(3)}`);

// จุดตัด: เดือนไหน canon กับฟิสิกส์ "สวนทาง"
console.log("\n=== เดือนที่ canon สวนทางฟิสิกส์ (fire ทั้งที่ dec สูง / water ทั้งที่ dec ต่ำ) ===");
for (const r of rows) {
  if (r.need === "fire" && r.dec > 10) console.log(`${r.m}${r.zh}: ต้องไฟ แต่ meanDec=+${r.dec.toFixed(1)}° (ร้อน) — ${r.quote}`);
  if (r.need === "water" && r.dec < 0) console.log(`${r.m}${r.zh}: ต้องน้ำ แต่ meanDec=${r.dec.toFixed(1)}° (หนาว)`);
}
console.log("\nหมายเหตุ: 卯/辰 primary=庚(ทอง)=โครงสร้าง ไม่ใช่ 調候อุณหภูมิ · 未 canon เองบอก 三伏生寒 丁火退氣 (จุดพลิก)");
console.log("Xi'an amplitude daylight = " + (Math.max(...dayx) - Math.min(...dayx)).toFixed(2) + "h vs BKK = " + (Math.max(...rows.map(r => r.dayBkk)) - Math.min(...rows.map(r => r.dayBkk))).toFixed(2) + "h");
