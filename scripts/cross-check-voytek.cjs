/**
 * Cross-check 20 ดวง · Decode helper vs Voytek bazi-calculator.com
 * Bangkok · lng 100.5018 · GMT+7
 *
 * Tests Layer 0 (TST) + Layer 1 (pillar) end-to-end
 */

const tyme = require('tyme4ts');
const https = require('https');

// 20 cases · varied date/time
const CASES = [
  { name: 'Aeaw',     y: 1984, mo: 12, d: 31, h: 13, mn: 15, g: 0 },
  { name: 'Mai',      y: 1986, mo:  4, d: 12, h: 16, mn: 42, g: 1 },
  { name: 'NongPun',  y: 2024, mo:  6, d:  7, h: 10, mn: 59, g: 1 },
  { name: 'C04',      y: 1990, mo:  1, d:  1, h:  0, mn: 30, g: 0 },
  { name: 'C05',      y: 1990, mo:  4, d: 15, h:  6, mn: 45, g: 1 },
  { name: 'C06',      y: 1990, mo:  7, d: 20, h: 12, mn: 30, g: 0 },
  { name: 'C07',      y: 1990, mo: 10, d: 31, h: 18, mn: 20, g: 1 },
  { name: 'C08',      y: 2000, mo:  2, d: 29, h: 23, mn: 45, g: 0 },
  { name: 'C09',      y: 2000, mo:  8, d: 15, h:  3, mn: 33, g: 1 },
  { name: 'C10',      y: 2010, mo: 12, d: 25, h: 17, mn: 10, g: 0 },
  { name: 'C11',      y: 1975, mo:  5, d: 10, h:  9, mn:  0, g: 1 },
  { name: 'C12',      y: 1965, mo:  9, d: 22, h: 14, mn: 50, g: 0 },
  { name: 'C13',      y: 1955, mo: 11, d: 11, h: 11, mn: 11, g: 1 },
  { name: 'C14',      y: 1945, mo:  3, d:  8, h: 22, mn: 30, g: 0 },
  { name: 'C15',      y: 1980, mo:  6, d: 21, h:  8, mn:  8, g: 1 },
  { name: 'C16',      y: 1995, mo:  4, d:  5, h: 19, mn: 19, g: 0 },
  { name: 'C17',      y: 2005, mo:  8, d: 29, h:  2, mn:  2, g: 1 },
  { name: 'C18',      y: 2018, mo: 12, d: 12, h: 15, mn: 45, g: 0 },
  { name: 'C19',      y: 2022, mo:  2, d: 22, h: 22, mn: 22, g: 1 },
  { name: 'C20',      y: 2024, mo:  9, d:  9, h: 11, mn: 30, g: 0 },
];

const LNG = 100.5018;
const GMT = 7;

// ─── TST helper (lock-step with src/lib/tyme-tst.ts) ───
function applyTST({ year, month, day, hour, minute, longitude = LNG, gmtOffsetHours = GMT }) {
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
  const tst = applyTST({ year: c.y, month: c.mo, day: c.d, hour: c.h, minute: c.mn });
  const ec = tyme.SolarTime.fromYmdHms(c.y, c.mo, c.d, tst.appliedHour, tst.appliedMinute, 0).getLunarHour().getEightChar();
  return {
    hour:  ec.getHour().getName(),
    day:   ec.getDay().getName(),
    month: ec.getMonth().getName(),
    year:  ec.getYear().getName(),
    tst: tst.shift,
  };
}

// ─── Voytek HTTP fetch + parser ───
function voytekFetch(c) {
  return new Promise((resolve, reject) => {
    const url = `https://bazi-calculator.com/?v=ff&licz=1&n=${c.name}&y=${c.y}&m=${c.mo}&d=${c.d}&h=${String(c.h).padStart(2,'0')}:${String(c.mn).padStart(2,'0')}&g=${GMT}&l=${LNG}&miasto1=Bangkok&s=${c.g}`;
    https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux) AppleWebKit/537.36' },
      timeout: 15000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        // Parse: <span class="f1\d">PINYIN</span><br />\s*<span class="cn">\s*CHAR
        const matches = [...data.matchAll(/<span class="f1\d">(\w+)<\/span><br \/>\s*<span class="cn">\s*([甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥])/g)];
        const tokens = matches.map(m => m[2]);
        if (tokens.length < 8) return resolve({ error: `only ${tokens.length} tokens parsed` });
        // Voytek order: Hour-Day-Month-Year stem, then Hour-Day-Month-Year branch
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

// ─── runner ───
async function main() {
  console.log(`\n${'═'.repeat(85)}`);
  console.log(`  CROSS-CHECK · Decode helper vs Voytek · 20 cases · Bangkok GMT+7`);
  console.log(`${'═'.repeat(85)}\n`);
  console.log(`  ${'#'.padEnd(3)} ${'Name'.padEnd(10)} ${'Birth'.padEnd(20)} ${'Voytek (H/D/M/Y)'.padEnd(28)} ${'Decode'.padEnd(28)} Match`);
  console.log(`  ${'─'.repeat(85)}`);

  let pass = 0, fail = 0, error = 0;
  const results = [];

  for (let i = 0; i < CASES.length; i++) {
    const c = CASES[i];
    const decode = decodePillars(c);
    let voytek;
    try {
      voytek = await voytekFetch(c);
    } catch (e) {
      voytek = { error: e.message };
    }
    if (voytek.error) {
      console.log(`  ${String(i+1).padEnd(3)} ${c.name.padEnd(10)} ${c.y}-${String(c.mo).padStart(2,'0')}-${String(c.d).padStart(2,'0')} ${String(c.h).padStart(2,'0')}:${String(c.mn).padStart(2,'0')}    ⚠ ${voytek.error}`);
      error++;
      continue;
    }
    const match =
      decode.hour === voytek.hour &&
      decode.day === voytek.day &&
      decode.month === voytek.month &&
      decode.year === voytek.year;
    const dStr = `${decode.hour} ${decode.day} ${decode.month} ${decode.year}`;
    const vStr = `${voytek.hour} ${voytek.day} ${voytek.month} ${voytek.year}`;
    const birth = `${c.y}-${String(c.mo).padStart(2,'0')}-${String(c.d).padStart(2,'0')} ${String(c.h).padStart(2,'0')}:${String(c.mn).padStart(2,'0')}`;
    console.log(`  ${String(i+1).padEnd(3)} ${c.name.padEnd(10)} ${birth.padEnd(20)} ${vStr.padEnd(28)} ${dStr.padEnd(28)} ${match ? '✅' : '❌'}`);
    results.push({ ...c, voytek: vStr, decode: dStr, match, tstShift: decode.tst });
    if (match) pass++; else fail++;

    // Small delay to be polite to Voytek
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\n  ${'─'.repeat(85)}`);
  console.log(`  RESULT: ${pass}/${CASES.length} match · ${fail} mismatch · ${error} fetch-error`);
  console.log(`  Accuracy: ${Math.round((pass / (pass + fail)) * 100)}%`);
  console.log(`${'═'.repeat(85)}\n`);

  // Save details
  require('fs').writeFileSync(
    '/root/decode-app/scripts/test-results/cross-check-' + Date.now() + '.json',
    JSON.stringify({ summary: { pass, fail, error, total: CASES.length }, results }, null, 2)
  );

  // Mismatches detail
  const misses = results.filter(r => !r.match);
  if (misses.length) {
    console.log(`  MISMATCH detail (${misses.length}):`);
    for (const m of misses) {
      console.log(`    ${m.name} ${m.y}-${m.mo}-${m.d} ${m.h}:${m.mn} (TST shift ${m.tstShift}min)`);
      console.log(`      Voytek: ${m.voytek}`);
      console.log(`      Decode: ${m.decode}`);
    }
  }

  process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error('FATAL', e); process.exit(2); });
