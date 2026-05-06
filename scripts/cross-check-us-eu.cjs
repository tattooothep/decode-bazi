/**
 * Cross-check 20 ดวง · US + EU
 * longitude ตะวันตก (negative) · GMT ลบ/บวก
 *
 * Note: ใช้ standard GMT (ไม่ปรับ DST) · ทั้ง Voytek + Decode
 *       user-input "wall clock" อาจตรง local DST เวลานั้น · แต่ฝั่งทดสอบใช้ GMT คงที่
 */

const tyme = require('tyme4ts');
const https = require('https');

const CASES = [
  // ─── US (10) ───
  { name: 'NYC_01',     y: 1990, mo:  6, d: 15, h: 14, mn:  0, g: 0, city: 'NewYork',     lng:  -74.0060, gmt: -5 },
  { name: 'LA_01',      y: 1985, mo: 12, d: 25, h:  9, mn: 30, g: 1, city: 'LosAngeles',  lng: -118.2437, gmt: -8 },
  { name: 'Chicago_1',  y: 2000, mo:  3, d: 20, h: 18, mn: 45, g: 0, city: 'Chicago',     lng:  -87.6298, gmt: -6 },
  { name: 'Houston_1',  y: 1975, mo:  7, d:  4, h: 10, mn: 10, g: 1, city: 'Houston',     lng:  -95.3698, gmt: -6 },
  { name: 'Seattle_1',  y: 1995, mo: 10, d: 31, h: 21, mn:  0, g: 0, city: 'Seattle',     lng: -122.3321, gmt: -8 },
  { name: 'Denver_1',   y: 1980, mo:  1, d: 15, h:  6, mn: 30, g: 1, city: 'Denver',      lng: -104.9903, gmt: -7 },
  { name: 'Miami_1',    y: 2010, mo:  8, d: 30, h: 14, mn: 14, g: 0, city: 'Miami',       lng:  -80.1918, gmt: -5 },
  { name: 'Boston_1',   y: 1965, mo:  4, d: 19, h: 11, mn: 11, g: 1, city: 'Boston',      lng:  -71.0589, gmt: -5 },
  { name: 'SF_01',      y: 2005, mo:  9, d:  9, h: 18, mn: 18, g: 0, city: 'SanFrancisco',lng: -122.4194, gmt: -8 },
  { name: 'Atlanta_1',  y: 1988, mo: 11, d:  8, h:  7, mn: 30, g: 1, city: 'Atlanta',     lng:  -84.3880, gmt: -5 },
  // ─── EU (10) ───
  { name: 'London_1',   y: 1990, mo:  7, d:  4, h: 12, mn:  0, g: 0, city: 'London',      lng:   -0.1276, gmt:  0 },
  { name: 'Paris_1',    y: 1972, mo:  2, d: 14, h:  9, mn:  0, g: 1, city: 'Paris',       lng:    2.3522, gmt:  1 },
  { name: 'Berlin_1',   y: 1985, mo:  5, d:  8, h: 19, mn: 30, g: 0, city: 'Berlin',      lng:   13.4050, gmt:  1 },
  { name: 'Rome_1',     y: 2000, mo: 12, d: 31, h: 22, mn:  0, g: 1, city: 'Rome',        lng:   12.4964, gmt:  1 },
  { name: 'Madrid_1',   y: 1995, mo:  3, d: 15, h: 13, mn: 13, g: 0, city: 'Madrid',      lng:   -3.7038, gmt:  1 },
  { name: 'Amsterdam_1',y: 1980, mo:  8, d: 15, h: 16, mn:  0, g: 1, city: 'Amsterdam',   lng:    4.8952, gmt:  1 },
  { name: 'Moscow_1',   y: 1968, mo: 11, d:  7, h: 11, mn:  0, g: 0, city: 'Moscow',      lng:   37.6173, gmt:  3 },
  { name: 'Stockholm_1',y: 2018, mo:  6, d: 21, h:  6, mn:  0, g: 1, city: 'Stockholm',   lng:   18.0686, gmt:  1 },
  { name: 'Vienna_1',   y: 1955, mo:  9, d:  1, h: 14, mn: 30, g: 0, city: 'Vienna',      lng:   16.3738, gmt:  1 },
  { name: 'Athens_1',   y: 2008, mo:  4, d: 13, h: 17, mn: 17, g: 1, city: 'Athens',      lng:   23.7275, gmt:  2 },
];

function applyTST({ year, month, day, hour, minute, longitude, gmtOffsetHours }) {
  const standardMeridian = gmtOffsetHours * 15;
  const dt = new Date(Date.UTC(year, month - 1, day, hour - gmtOffsetHours, minute, 0));
  const dayOfYear = Math.floor((dt.getTime() - Date.UTC(dt.getUTCFullYear(), 0, 0)) / 86400000);
  const gamma = (2 * Math.PI / 365) * (dayOfYear - 1 + (hour - 12) / 24);
  const eotMin = 229.18 * (
    0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma)
    - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma)
  );
  const longitudeShiftMin = (longitude - standardMeridian) * 4;
  const totalShiftMin = longitudeShiftMin + eotMin;
  const totalMin = hour * 60 + minute + totalShiftMin;
  let appliedHour = Math.floor(totalMin / 60);
  let appliedMinute = Math.floor(totalMin - appliedHour * 60);
  let dayShift = 0;
  if (appliedHour < 0) { appliedHour += 24; dayShift = -1; }
  if (appliedHour >= 24) { appliedHour -= 24; dayShift = 1; }
  if (appliedMinute < 0) appliedMinute += 60;
  return { appliedHour, appliedMinute, dayShift, shift: Math.round(totalShiftMin * 10) / 10 };
}

function decodePillars(c) {
  const tst = applyTST({ year: c.y, month: c.mo, day: c.d, hour: c.h, minute: c.mn, longitude: c.lng, gmtOffsetHours: c.gmt });
  // Apply day shift if TST crossed midnight
  let yy = c.y, mm = c.mo, dd = c.d;
  if (tst.dayShift !== 0) {
    const t = new Date(Date.UTC(yy, mm - 1, dd + tst.dayShift));
    yy = t.getUTCFullYear(); mm = t.getUTCMonth() + 1; dd = t.getUTCDate();
  }
  const ec = tyme.SolarTime.fromYmdHms(yy, mm, dd, tst.appliedHour, tst.appliedMinute, 0).getLunarHour().getEightChar();
  return {
    hour:  ec.getHour().getName(),
    day:   ec.getDay().getName(),
    month: ec.getMonth().getName(),
    year:  ec.getYear().getName(),
    tst: tst.shift,
  };
}

function voytekFetch(c) {
  return new Promise((resolve, reject) => {
    const url = `https://bazi-calculator.com/?v=ff&licz=1&n=${c.name}&y=${c.y}&m=${c.mo}&d=${c.d}&h=${String(c.h).padStart(2,'0')}:${String(c.mn).padStart(2,'0')}&g=${c.gmt}&l=${c.lng}&miasto1=${c.city}&s=${c.g}`;
    https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux) AppleWebKit/537.36' },
      timeout: 15000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const matches = [...data.matchAll(/<span class="f1\d">(\w+)<\/span><br \/>\s*<span class="cn">\s*([甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥])/g)];
        const tokens = matches.map(m => m[2]);
        if (tokens.length < 8) return resolve({ error: `only ${tokens.length} tokens` });
        resolve({
          hour:  tokens[0] + tokens[4],
          day:   tokens[1] + tokens[5],
          month: tokens[2] + tokens[6],
          year:  tokens[3] + tokens[7],
        });
      });
    }).on('error', reject);
  });
}

async function main() {
  console.log(`\n${'═'.repeat(110)}`);
  console.log(`  CROSS-CHECK · 20 cases · US (10) + EU (10) · longitude ตะวันตก/+ลบ`);
  console.log(`${'═'.repeat(110)}\n`);
  console.log(`  ${'#'.padEnd(3)} ${'City'.padEnd(13)} ${'Birth'.padEnd(20)} ${'Voytek (H D M Y)'.padEnd(28)} ${'Decode'.padEnd(28)} TST   Match`);
  console.log(`  ${'─'.repeat(110)}`);

  let pass = 0, fail = 0, error = 0;
  const results = [];

  for (let i = 0; i < CASES.length; i++) {
    const c = CASES[i];
    const decode = decodePillars(c);
    let voytek;
    try { voytek = await voytekFetch(c); }
    catch (e) { voytek = { error: e.message }; }
    if (voytek.error) {
      console.log(`  ${String(i+1).padEnd(3)} ${c.city.padEnd(13)} ${c.y}-${String(c.mo).padStart(2,'0')}-${String(c.d).padStart(2,'0')} ${String(c.h).padStart(2,'0')}:${String(c.mn).padStart(2,'0')}   ⚠ ${voytek.error}`);
      error++;
      continue;
    }
    const match = decode.hour === voytek.hour && decode.day === voytek.day && decode.month === voytek.month && decode.year === voytek.year;
    const dStr = `${decode.hour} ${decode.day} ${decode.month} ${decode.year}`;
    const vStr = `${voytek.hour} ${voytek.day} ${voytek.month} ${voytek.year}`;
    const birth = `${c.y}-${String(c.mo).padStart(2,'0')}-${String(c.d).padStart(2,'0')} ${String(c.h).padStart(2,'0')}:${String(c.mn).padStart(2,'0')}`;
    console.log(`  ${String(i+1).padEnd(3)} ${c.city.padEnd(13)} ${birth.padEnd(20)} ${vStr.padEnd(28)} ${dStr.padEnd(28)} ${String(decode.tst).padStart(6)} ${match ? '✅' : '❌'}`);
    results.push({ ...c, voytek: vStr, decode: dStr, match, tstShift: decode.tst });
    if (match) pass++; else fail++;

    await new Promise(r => setTimeout(r, 250));
  }

  console.log(`\n  ${'─'.repeat(110)}`);
  console.log(`  RESULT: ${pass}/${CASES.length} match · ${fail} mismatch · ${error} fetch-error`);
  console.log(`  Accuracy: ${Math.round((pass / Math.max(1, pass + fail)) * 100)}%`);
  console.log(`${'═'.repeat(110)}\n`);

  require('fs').writeFileSync(
    '/root/decode-app/scripts/test-results/cross-check-us-eu-' + Date.now() + '.json',
    JSON.stringify({ summary: { pass, fail, error, total: CASES.length }, results }, null, 2)
  );

  const misses = results.filter(r => !r.match);
  if (misses.length) {
    console.log(`  MISMATCH (${misses.length}):`);
    for (const m of misses) {
      console.log(`    ${m.city.padEnd(13)} ${m.y}-${m.mo}-${m.d} ${m.h}:${m.mn} (TST ${m.tstShift}min)`);
      console.log(`      Voytek: ${m.voytek}`);
      console.log(`      Decode: ${m.decode}`);
    }
  }

  process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error('FATAL', e); process.exit(2); });
