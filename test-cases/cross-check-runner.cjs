/**
 * Cross-check 60 birth charts vs Voytek (bazi-calculator.com)
 * Output: /root/decode-app/test-cases/results/<timestamp>.md
 */
const fs = require('fs');
const path = require('path');
const tyme = require('tyme4ts');

const cases = JSON.parse(fs.readFileSync(path.join(__dirname, 'cases-60.json'), 'utf-8'));
const all = [...cases.groups.asia, ...cases.groups.western, ...cases.groups.extra20];

// ─── TST helper (port from src/lib/tyme-tst.ts) ───
function applyTST({ year, month, day, hour, minute, longitude, gmtOffsetHours = 7 }) {
  const standardMeridian = gmtOffsetHours * 15;
  const dt = new Date(Date.UTC(year, month - 1, day, hour - gmtOffsetHours, minute, 0));
  const dayOfYear = Math.floor((dt - Date.UTC(dt.getUTCFullYear(),0,0)) / 86400000);
  const gamma = (2 * Math.PI / 365) * (dayOfYear - 1 + (hour - 12) / 24);
  const eotMin = 229.18 * (
    0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma)
    - 0.014615 * Math.cos(2*gamma) - 0.040849 * Math.sin(2*gamma)
  );
  const longitudeShiftMin = (longitude - standardMeridian) * 4;
  const totalShiftMin = longitudeShiftMin + eotMin;
  const totalMin = hour * 60 + minute + totalShiftMin;
  let appliedHour = Math.floor(totalMin / 60);
  let appliedMinute = Math.floor(totalMin - appliedHour * 60);
  let dayOffset = 0;
  if (appliedHour < 0) { appliedHour += 24; dayOffset = -1; }
  if (appliedHour >= 24) { appliedHour -= 24; dayOffset = 1; }
  if (appliedMinute < 0) appliedMinute += 60;
  return { appliedHour, appliedMinute, dayOffset, totalShiftMin: Math.round(totalShiftMin*10)/10 };
}

// ─── Decode pillars ───
function decodePillars(c) {
  const [yy, mm, dd] = c.date.split('-').map(Number);
  const [hh, mn] = c.time.split(':').map(Number);
  const tst = applyTST({ year: yy, month: mm, day: dd, hour: hh, minute: mn, longitude: c.lng, gmtOffsetHours: c.gmt });
  // Apply day offset
  const baseDate = new Date(Date.UTC(yy, mm-1, dd));
  if (tst.dayOffset !== 0) baseDate.setUTCDate(baseDate.getUTCDate() + tst.dayOffset);
  const ay = baseDate.getUTCFullYear(), am = baseDate.getUTCMonth() + 1, ad = baseDate.getUTCDate();
  const ec = tyme.SolarTime.fromYmdHms(ay, am, ad, tst.appliedHour, tst.appliedMinute, 0).getLunarHour().getEightChar();
  return {
    year: ec.getYear().getName(),
    month: ec.getMonth().getName(),
    day: ec.getDay().getName(),
    hour: ec.getHour().getName(),
    tst,
  };
}

// ─── Pinyin → Chinese mapping ───
const PIN_TO_STEM = {
  Jia:'甲', Yi:'乙', Bing:'丙', Ding:'丁', Wu:'戊', Ji:'己',
  Geng:'庚', Xin:'辛', Ren:'壬', Gui:'癸',
};
const PIN_TO_BRANCH = {
  Zi:'子', Chou:'丑', Yin:'寅', Mao:'卯', Chen:'辰', Si:'巳',
  Wu:'午', Wei:'未', Shen:'申', You:'酉', Xu:'戌', Hai:'亥',
};

// ─── Voytek fetch ───
async function voytekPillars(c) {
  const [yy, mm, dd] = c.date.split('-').map(Number);
  const [hh, mn] = c.time.split(':').map(Number);
  // POST to root (form-encoded) · Voytek expects gender s=0/1
  const sParam = c.gender === 'F' ? '1' : '0';
  const body = new URLSearchParams({
    n: c.id, s: sParam,
    h: `${String(hh).padStart(2,'0')}:${String(mn).padStart(2,'0')}`,
    d: String(dd), m: String(mm), y: String(yy),
    g: String(c.gmt), l: String(c.lng),
    miasto1: c.city || 'Test',
    licz: 'Calculate',
  });
  const res = await fetch('https://bazi-calculator.com/', {
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:120) Gecko/20100101 Firefox/120',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'text/html,application/xhtml+xml,application/xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    body: body.toString(),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) return { error: `HTTP ${res.status}` };
  const html = await res.text();
  // Voytek format · <span class="f16">PINYIN</span> in chart cells
  // Order: stems[H,D,M,Y] + branches[H,D,M,Y] · ใช้ context tag <table> หา HS row + EB row
  // Simpler: ดูทุก f16 · แล้ว map ตามลำดับ first 8 in chart cells
  const pat = /<span class="f1[68]">(\w+)<\/span>/g;
  const tokens = [];
  let m;
  while ((m = pat.exec(html)) !== null) tokens.push(m[1]);
  if (tokens.length < 8) return { error: `parsed only ${tokens.length} tokens` };
  // Map first 4 = stems · next 4 = branches (in main chart)
  const stems = tokens.slice(0, 4).map(t => PIN_TO_STEM[t] || '?');
  const branches = tokens.slice(4, 8).map(t => PIN_TO_BRANCH[t] || '?');
  if (stems.includes('?') || branches.includes('?')) {
    return { error: `unmapped tokens · stems=${tokens.slice(0,4)} branches=${tokens.slice(4,8)}` };
  }
  return {
    hour:  stems[0] + branches[0],
    day:   stems[1] + branches[1],
    month: stems[2] + branches[2],
    year:  stems[3] + branches[3],
  };
}

async function main() {
  const args = process.argv.slice(2);
  const limit = args.find(a => a.startsWith('--limit='));
  const limitN = limit ? parseInt(limit.split('=')[1]) : all.length;

  console.log(`\n═══ Cross-check ${Math.min(limitN, all.length)} cases vs Voytek ═══\n`);

  const results = [];
  let pass4 = 0, pass3 = 0, partial = 0, error = 0;

  for (let i = 0; i < Math.min(limitN, all.length); i++) {
    const c = all[i];
    process.stdout.write(`[${i+1}/${all.length}] ${c.name.padEnd(35)} ... `);
    let decode, voytek;
    try {
      decode = decodePillars(c);
    } catch (e) {
      console.log(`❌ DECODE ERROR: ${e.message}`);
      error++;
      results.push({ ...c, error: 'decode: ' + e.message });
      continue;
    }
    try {
      voytek = await voytekPillars(c);
    } catch (e) {
      console.log(`❌ VOYTEK ERROR: ${e.message}`);
      error++;
      results.push({ ...c, decode, error: 'voytek: ' + e.message });
      continue;
    }
    if (voytek.error) {
      console.log(`❌ ${voytek.error}`);
      error++;
      results.push({ ...c, decode, error: voytek.error });
      continue;
    }
    let match = 0;
    if (decode.hour === voytek.hour) match++;
    if (decode.day === voytek.day) match++;
    if (decode.month === voytek.month) match++;
    if (decode.year === voytek.year) match++;
    const tag = match === 4 ? '✅ 4/4' : match === 3 ? '⚠️  3/4' : `❌ ${match}/4`;
    if (match === 4) pass4++;
    else if (match === 3) pass3++;
    else partial++;
    console.log(`${tag} D[${decode.hour}/${decode.day}/${decode.month}/${decode.year}] V[${voytek.hour}/${voytek.day}/${voytek.month}/${voytek.year}] tst${decode.tst.totalShiftMin}m`);
    results.push({ ...c, decode, voytek, match });
    // Polite delay to Voytek server
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n═══ SUMMARY ═══`);
  console.log(`  4/4 perfect: ${pass4}`);
  console.log(`  3/4 partial: ${pass3}`);
  console.log(`  <3/4 fail  : ${partial}`);
  console.log(`  errors     : ${error}`);
  console.log(`  total      : ${results.length}`);

  // Save report
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = path.join(__dirname, 'results');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `cross-check-${ts}.json`);
  fs.writeFileSync(outFile, JSON.stringify({ ran_at: new Date().toISOString(), summary: { pass4, pass3, partial, error, total: results.length }, results }, null, 2));
  console.log(`\n  saved → ${outFile}`);

  // MD report
  const md = [];
  md.push(`# Cross-check 60 cases vs Voytek\n`);
  md.push(`**Run at:** ${new Date().toISOString()}\n`);
  md.push(`## Summary\n`);
  md.push(`| Result | Count |\n|---|---|\n| ✅ 4/4 | ${pass4} |\n| ⚠️ 3/4 | ${pass3} |\n| ❌ <3/4 | ${partial} |\n| 🛑 error | ${error} |\n| **total** | ${results.length} |\n`);
  md.push(`\n## Details\n`);
  md.push(`| # | Name | Date · Time | Decode | Voytek | Match |`);
  md.push(`|---|---|---|---|---|---|`);
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.error) {
      md.push(`| ${i+1} | ${r.name} | ${r.date} ${r.time} | — | — | 🛑 ${r.error} |`);
    } else {
      const dStr = `H ${r.decode.hour} D ${r.decode.day} M ${r.decode.month} Y ${r.decode.year}`;
      const vStr = `H ${r.voytek.hour} D ${r.voytek.day} M ${r.voytek.month} Y ${r.voytek.year}`;
      const tag = r.match === 4 ? '✅' : r.match === 3 ? '⚠️' : '❌';
      md.push(`| ${i+1} | ${r.name} | ${r.date} ${r.time} | ${dStr} | ${vStr} | ${tag} ${r.match}/4 |`);
    }
  }
  const mdFile = path.join(outDir, `cross-check-${ts}.md`);
  fs.writeFileSync(mdFile, md.join('\n'));
  console.log(`  md     → ${mdFile}`);
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
