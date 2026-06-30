#!/usr/bin/env node
// verify_ziqi.mjs — ตรวจสูตร 步紫氣: 紫氣_lon(t) = epoch_lon + speed*days
// สถานะ: TEMPLATE — ยังเติม datapoint จริงไม่ได้ (度อ่านจาก萬年書 500dpi ไม่ชัด, ห้ามเดา)
// วิธีใช้เมื่อได้ datapoint: เติม DATAPOINTS (วันที่ Gregorian + 紫氣 longitude เป็น°) แล้ว `node verify_ziqi.mjs`

// --- พารามิเตอร์สูตร (speed มีที่มาตำรา; epoch ยังไม่รู้ — ห้ามเดา) ---
const SPEED_DEG_PER_DAY = 2/60 + 6/3600;   // 每日行 2分6秒 = 0.0352°/วัน (รอบ ~28 ปี)
let   EPOCH_LON = null;                      // ❓ ต้อง solve จาก datapoint แรก (อย่า hardcode เดา)
let   EPOCH_DATE = null;                     // ❓ วันที่อ้างอิงของ EPOCH_LON

// --- datapoint: เติมเมื่ออ่าน度จากตำราได้ (เว้นว่าง = ยังอ่านไม่ออก) ---
// รูปแบบ: { date: 'YYYY-MM-DD', lon: <องศา sidereal 宿度>, src: 'page/วันที่จีน' }
const DATAPOINTS = [
  // { date: '1752-02-xx', lon: ???, src: 'p52 乾隆17壬申 正月初一 尾?度?分' },  // 度อ่านไม่ออก
];

const dayBetween = (a, b) => (new Date(b) - new Date(a)) / 86400000;

function solveEpoch(dps) {
  if (dps.length < 1) return null;
  // ใช้จุดแรกเป็น epoch
  return { lon: dps[0].lon, date: dps[0].date };
}

function fitSpeed(dps) {
  if (dps.length < 2) return null;
  const d = dayBetween(dps[0].date, dps[dps.length - 1].date);
  let dlon = dps[dps.length - 1].lon - dps[0].lon;
  while (dlon < 0) dlon += 360;               // 紫氣 順 เสมอ
  return dlon / d;                            // °/วัน
}

function predict(dateStr) {
  if (EPOCH_LON == null || EPOCH_DATE == null) return null;
  return (EPOCH_LON + SPEED_DEG_PER_DAY * dayBetween(EPOCH_DATE, dateStr)) % 360;
}

// --- main ---
if (DATAPOINTS.length === 0) {
  console.log('⚠️  ยังไม่มี datapoint — 度จาก萬年書 (500dpi) อ่านไม่ชัด, ไม่เดาตาม constraint');
  console.log(`   ความเร็วตำรา = ${SPEED_DEG_PER_DAY.toFixed(5)}°/วัน (每日行2分6秒) → รอบ ${ (360/(SPEED_DEG_PER_DAY*365.25)).toFixed(1) } ปี`);
  console.log('   ต้อง: อ่าน 尾X度Y分 ในวัน Gregorian ที่แปลงได้ ≥2 จุด → fitSpeed + solveEpoch');
  process.exit(0);
}

const ep = solveEpoch(DATAPOINTS); EPOCH_LON = ep.lon; EPOCH_DATE = ep.date;
const fitted = fitSpeed(DATAPOINTS);
console.log('epoch     :', EPOCH_LON, '°  @', EPOCH_DATE);
console.log('speed ตำรา:', SPEED_DEG_PER_DAY.toFixed(5), '°/วัน');
if (fitted != null) console.log('speed fit :', fitted.toFixed(5), '°/วัน  (Δ', (fitted-SPEED_DEG_PER_DAY).toFixed(5), ')');
console.log('--- เทียบรายจุด ---');
for (const d of DATAPOINTS) {
  const p = predict(d.date);
  console.log(d.date, 'อ่าน', d.lon, 'ทำนาย', p?.toFixed(3), 'Δ', p!=null?(d.lon-p).toFixed(3):'-', '|', d.src||'');
}
