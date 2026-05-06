/**
 * Cross-check 20 ดวง · เมืองในเอเชีย · เน้น HK/Macau/จีน
 * แต่ละเมืองมี longitude + GMT ของตัวเอง
 */

const tyme = require('tyme4ts');
const https = require('https');

const CASES = [
  // Hong Kong (lng 114.1095 GMT+8)
  { name: 'HK_01',     y: 1980, mo:  3, d: 15, h:  9, mn: 30, g: 0, city: 'HongKong',     lng: 114.1095, gmt: 8 },
  { name: 'HK_02',     y: 1992, mo:  7, d: 22, h: 14, mn: 45, g: 1, city: 'HongKong',     lng: 114.1095, gmt: 8 },
  { name: 'HK_03',     y: 2005, mo: 11, d:  8, h: 21, mn: 15, g: 0, city: 'HongKong',     lng: 114.1095, gmt: 8 },
  // Macau (lng 113.5439 GMT+8)
  { name: 'Macau_01',  y: 1975, mo:  8, d: 10, h: 11, mn: 11, g: 0, city: 'Macau',        lng: 113.5439, gmt: 8 },
  { name: 'Macau_02',  y: 1988, mo:  4, d:  4, h:  4, mn:  4, g: 1, city: 'Macau',        lng: 113.5439, gmt: 8 },
  { name: 'Macau_03',  y: 2010, mo: 12, d: 31, h: 18, mn: 30, g: 0, city: 'Macau',        lng: 113.5439, gmt: 8 },
  // Beijing (lng 116.4074 GMT+8)
  { name: 'Beijing_01',y: 1965, mo:  6, d: 18, h: 12, mn:  0, g: 0, city: 'Beijing',      lng: 116.4074, gmt: 8 },
  { name: 'Beijing_02',y: 1995, mo:  1, d: 25, h:  8, mn: 30, g: 1, city: 'Beijing',      lng: 116.4074, gmt: 8 },
  // Shanghai (lng 121.4737 GMT+8)
  { name: 'Shanghai_1',y: 1970, mo: 10, d:  1, h: 16, mn: 20, g: 0, city: 'Shanghai',     lng: 121.4737, gmt: 8 },
  { name: 'Shanghai_2',y: 2000, mo:  5, d:  5, h: 10, mn: 10, g: 1, city: 'Shanghai',     lng: 121.4737, gmt: 8 },
  // Guangzhou (lng 113.2644 GMT+8)
  { name: 'GZ_01',     y: 1983, mo:  9, d: 12, h: 19, mn: 45, g: 0, city: 'Guangzhou',    lng: 113.2644, gmt: 8 },
  // Shenzhen (lng 114.0579 GMT+8)
  { name: 'SZ_01',     y: 2018, mo:  7, d: 28, h: 13, mn:  5, g: 1, city: 'Shenzhen',     lng: 114.0579, gmt: 8 },
  // Chengdu (lng 104.0668 GMT+8 · western China · big lng diff from std meridian)
  { name: 'Chengdu_1', y: 1991, mo:  3, d: 21, h:  7, mn:  0, g: 0, city: 'Chengdu',      lng: 104.0668, gmt: 8 },
  // Chongqing (lng 106.5516 GMT+8)
  { name: 'CQ_01',     y: 2008, mo:  8, d:  8, h: 20, mn:  8, g: 1, city: 'Chongqing',    lng: 106.5516, gmt: 8 },
  // Taipei (lng 121.5654 GMT+8)
  { name: 'Taipei_1',  y: 1972, mo:  2, d: 14, h: 23, mn: 30, g: 0, city: 'Taipei',       lng: 121.5654, gmt: 8 },
  { name: 'Taipei_2',  y: 2015, mo: 10, d: 10, h: 15, mn: 50, g: 1, city: 'Taipei',       lng: 121.5654, gmt: 8 },
  // Tokyo (lng 139.6917 GMT+9)
  { name: 'Tokyo_01',  y: 1985, mo: 11, d: 23, h:  6, mn: 30, g: 0, city: 'Tokyo',        lng: 139.6917, gmt: 9 },
  // Seoul (lng 126.9780 GMT+9)
  { name: 'Seoul_01',  y: 1996, mo:  4, d: 30, h: 17, mn: 25, g: 1, city: 'Seoul',        lng: 126.9780, gmt: 9 },
  // Singapore (lng 103.8198 GMT+8)
  { name: 'Singapore', y: 1978, mo:  6, d:  9, h:  9, mn:  9, g: 0, city: 'Singapore',    lng: 103.8198, gmt: 8 },
  // Manila (lng 120.9842 GMT+8)
  { name: 'Manila_1',  y: 2002, mo: 12, d:  7, h: 14, mn: 14, g: 1, city: 'Manila',       lng: 120.9842, gmt: 8 },
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
  if (appliedHour < 0) appliedHour += 24;
  if (appliedHour >= 24) appliedHour -= 24;
  if (appliedMinute < 0) appliedMinute += 60;
  return { appliedHour, appliedMinute, shift: Math.round(totalShiftMin * 10) / 10 };
}

function decodePillars(c) {
  const tst = applyTST({ year: c.y, month: c.mo, day: c.d, hour: c.h, minute: c.mn, longitude: c.lng, gmtOffsetHours: c.gmt });
  const ec = tyme.SolarTime.fromYmdHms(c.y, c.mo, c.d, tst.appliedHour, tst.appliedMinute, 0).getLunarHour().getEightChar();
  return {
    hour:  ec.getHour().getName(),
    day:   ec.getDay().getName(),
    month: ec.getMonth().getName(),
    year:  ec.getYear().getName(),
    tst: tst.shift,
    tstStr: `${String(tst.appliedHour).padStart(2,'0')}:${String(tst.appliedMinute).padStart(2,'0')}`,
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
  console.log(`\n${'═'.repeat(105)}`);
  console.log(`  CROSS-CHECK · 20 cases · เอเชียหลายเมือง · เน้น HK/Macau/จีน`);
  console.log(`${'═'.repeat(105)}\n`);
  console.log(`  ${'#'.padEnd(3)} ${'City'.padEnd(11)} ${'Birth'.padEnd(20)} ${'Voytek (H D M Y)'.padEnd(28)} ${'Decode'.padEnd(28)} TST  Match`);
  console.log(`  ${'─'.repeat(105)}`);

  let pass = 0, fail = 0, error = 0;
  const results = [];

  for (let i = 0; i < CASES.length; i++) {
    const c = CASES[i];
    const decode = decodePillars(c);
    let voytek;
    try { voytek = await voytekFetch(c); }
    catch (e) { voytek = { error: e.message }; }
    if (voytek.error) {
      console.log(`  ${String(i+1).padEnd(3)} ${c.city.padEnd(11)} ${c.y}-${String(c.mo).padStart(2,'0')}-${String(c.d).padStart(2,'0')} ${String(c.h).padStart(2,'0')}:${String(c.mn).padStart(2,'0')}    ⚠ ${voytek.error}`);
      error++;
      continue;
    }
    const match = decode.hour === voytek.hour && decode.day === voytek.day && decode.month === voytek.month && decode.year === voytek.year;
    const dStr = `${decode.hour} ${decode.day} ${decode.month} ${decode.year}`;
    const vStr = `${voytek.hour} ${voytek.day} ${voytek.month} ${voytek.year}`;
    const birth = `${c.y}-${String(c.mo).padStart(2,'0')}-${String(c.d).padStart(2,'0')} ${String(c.h).padStart(2,'0')}:${String(c.mn).padStart(2,'0')}`;
    console.log(`  ${String(i+1).padEnd(3)} ${c.city.padEnd(11)} ${birth.padEnd(20)} ${vStr.padEnd(28)} ${dStr.padEnd(28)} ${String(decode.tst).padStart(5)} ${match ? '✅' : '❌'}`);
    results.push({ ...c, voytek: vStr, decode: dStr, match, tstShift: decode.tst });
    if (match) pass++; else fail++;

    await new Promise(r => setTimeout(r, 250));
  }

  console.log(`\n  ${'─'.repeat(105)}`);
  console.log(`  RESULT: ${pass}/${CASES.length} match · ${fail} mismatch · ${error} fetch-error`);
  console.log(`  Accuracy: ${Math.round((pass / Math.max(1, pass + fail)) * 100)}%`);
  console.log(`${'═'.repeat(105)}\n`);

  require('fs').writeFileSync(
    '/root/decode-app/scripts/test-results/cross-check-asia-' + Date.now() + '.json',
    JSON.stringify({ summary: { pass, fail, error, total: CASES.length }, results }, null, 2)
  );

  const misses = results.filter(r => !r.match);
  if (misses.length) {
    console.log(`  MISMATCH (${misses.length}):`);
    for (const m of misses) {
      console.log(`    ${m.city.padEnd(11)} ${m.y}-${m.mo}-${m.d} ${m.h}:${m.mn} (TST ${m.tstShift}min)`);
      console.log(`      Voytek: ${m.voytek}`);
      console.log(`      Decode: ${m.decode}`);
    }
  }

  process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error('FATAL', e); process.exit(2); });
