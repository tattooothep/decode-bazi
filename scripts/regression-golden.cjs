/**
 * Regression test · 6 profiles (4 DB + 2 fixture)
 * - 4 DB: เรียก /api/chart-deep · เช็ค 18 sections + pillars + kongWang
 * - 2 fixture: เรียก calcBazi helper · เช็ค pillars
 * Read-only · ไม่แก้อะไร
 */
const { spawn } = require('node:child_process');

const DB_PROFILES = [
  { id: 'b791d345-f9f9-4549-a345-c0abca27800c', name: 'Aeaw_TST',
    org: 'f912c4b1-3c7d-4863-a8d0-07b0fb0b64af',
    expected: { pillars: '庚午·己亥·丙子·甲子', dpVoid: '辰巳', ypVoid: '戌亥' } },
  { id: 'd6b43c87-3b7d-44a3-aa01-ed144c224caa', name: 'ไนท์(ใหม่)',
    org: 'c5fe9d7b-a6d6-4070-adad-3db83a4c666b',
    expected: { pillars: null, dpVoid: null, ypVoid: null } },
  { id: 'bfbc2844-664f-4a70-9870-1966a3868fa1', name: 'p1',
    org: '923a6525-b1d1-4855-b73c-2fa68ecbfc9f',
    expected: { pillars: '辛巳·庚辰·丁丑·己巳', dpVoid: '申酉', ypVoid: '戌亥' } },
  { id: '6da9e858-232c-4bae-8352-d8d831f182e6', name: 'p2',
    org: '49819630-34bc-4a67-818c-eb381d76fb77',
    expected: { pillars: '癸巳·辛亥·戊寅·庚午', dpVoid: '寅卯', ypVoid: '戌亥' } },
];

const FIXTURES = [
  { name: 'Mai',  date: '1986-04-12', time: '16:42', lng: 100.5018, gender: 'F',
    expected: { hour: '丙申', day: '丙戌', month: '壬辰', year: '丙寅' } },
  { name: 'เค็ง', date: '1987-07-28', time: '22:00', lng: 100.5018, gender: 'M',
    expected: { hour: '癸亥', day: '戊寅', month: '丁未', year: '丁卯' } },
];

const REQ_SECTIONS = ['pillars','hiddenStems','interactions','kongWang','tenGods','elements','dmStrength','geJu','structure','tiaoHou','luckPillars','naYin','qiPhases','symbolicStars','liuCycles','rootTouGan','storageTomb','palaceReading','narrative'];

function fmt(s, n=12) { return String(s).padEnd(n); }
function pass(b) { return b ? '✅' : '❌'; }

async function signToken(orgId) {
  const { signSession } = await import('../src/lib/auth.ts');
  return signSession({ userId: 'regression', orgId, email: 'r@r' });
}

async function callApi(token, profileId) {
  const t0 = Date.now();
  const r = await fetch(`http://localhost:3200/api/chart-deep?profile=${profileId}`, {
    headers: { Cookie: `decode_auth=${token}` },
  });
  const ms = Date.now() - t0;
  return { status: r.status, ms, body: r.status === 200 ? await r.json() : await r.text() };
}

async function callChartV2(token, profileId) {
  const r = await fetch(`http://localhost:3200/chart-v2?profile=${profileId}`, {
    headers: { Cookie: `decode_auth=${token}` },
  });
  return { status: r.status, size: (await r.text()).length };
}

async function calcFixture(p) {
  const { calcBazi } = await import('../src/lib/bazi-calc.ts');
  return calcBazi({ date: p.date, time: p.time, longitude: p.lng, gmtOffsetHours: 7, gender: p.gender });
}

(async () => {
  console.log('═══ REGRESSION · 4 DB + 2 fixture ═══\n');
  let totalChecks = 0, totalPassed = 0;
  const fails = [];

  for (const p of DB_PROFILES) {
    console.log(`▶ ${p.name} · ${p.id}`);
    const token = await signToken(p.org);
    const api = await callApi(token, p.id);
    const cv2 = await callChartV2(token, p.id);

    const pillarsStr = api.body?.pillars?.map(x => x.stem + x.branch).join('·');
    const dp = api.body?.kongWang?.dp?.join('');
    const yp = api.body?.kongWang?.yp?.join('');
    const missing = REQ_SECTIONS.filter(k => api.body?.[k] === undefined);
    const nullSec = REQ_SECTIONS.filter(k => api.body?.[k] === null);

    const checks = [
      { name: 'API HTTP 200',         pass: api.status === 200 },
      { name: '4 pillars',            pass: api.body?.pillars?.length === 4 },
      { name: 'TST info',             pass: api.body?.subject?.birthTime !== undefined },
      { name: 'hiddenStems 4',        pass: api.body?.hiddenStems?.length === 4 },
      { name: 'kongWang DP',          pass: api.body?.kongWang?.dp?.length === 2 },
      { name: 'kongWang YP',          pass: api.body?.kongWang?.yp?.length === 2 },
      { name: '18 sections all set',  pass: missing.length === 0 },
      { name: 'no null sections',     pass: nullSec.length === 0 },
      { name: '/chart-v2 200',        pass: cv2.status === 200 },
      { name: 'response < 100ms',     pass: api.ms < 100 },
    ];
    if (p.expected.pillars) checks.push({ name: `pillars match expected`, pass: pillarsStr === p.expected.pillars });
    if (p.expected.dpVoid)  checks.push({ name: `DP void match`, pass: dp === p.expected.dpVoid });
    if (p.expected.ypVoid)  checks.push({ name: `YP void match`, pass: yp === p.expected.ypVoid });

    for (const c of checks) {
      totalChecks++;
      if (c.pass) totalPassed++;
      else fails.push(`${p.name} · ${c.name}`);
    }

    console.log(`  HTTP ${api.status} · ${api.ms}ms · ${JSON.stringify(api.body).length}b · /chart-v2 ${cv2.status}`);
    console.log(`  pillars=${pillarsStr || '—'}  dp=${dp || '—'}  yp=${yp || '—'}`);
    if (missing.length) console.log(`  ❌ missing:`, missing);
    if (nullSec.length) console.log(`  ❌ null   :`, nullSec);
    console.log(`  ${checks.filter(c=>c.pass).length}/${checks.length} checks pass`);
    console.log('');
  }

  for (const f of FIXTURES) {
    console.log(`▶ ${f.name} (fixture · calcBazi only · ไม่ insert DB)`);
    try {
      const calc = await calcFixture(f);
      const got = calc.pillars;
      const checks = [
        { name: 'hour pillar',  pass: (got.hour.stem + got.hour.branch)   === f.expected.hour  },
        { name: 'day pillar',   pass: (got.day.stem + got.day.branch)     === f.expected.day   },
        { name: 'month pillar', pass: (got.month.stem + got.month.branch) === f.expected.month },
        { name: 'year pillar',  pass: (got.year.stem + got.year.branch)   === f.expected.year  },
      ];
      for (const c of checks) {
        totalChecks++;
        if (c.pass) totalPassed++;
        else fails.push(`${f.name} · ${c.name}`);
      }
      console.log(`  got: ${got.hour.stem+got.hour.branch} / ${got.day.stem+got.day.branch} / ${got.month.stem+got.month.branch} / ${got.year.stem+got.year.branch}`);
      console.log(`  exp: ${f.expected.hour} / ${f.expected.day} / ${f.expected.month} / ${f.expected.year}`);
      console.log(`  ${checks.filter(c=>c.pass).length}/${checks.length} pillar match`);
    } catch (e) {
      console.log('  ❌ EXCEPTION:', e.message);
      fails.push(`${f.name} · exception`);
    }
    console.log('');
  }

  console.log('═══ SUMMARY ═══');
  console.log(`  ${totalPassed}/${totalChecks} checks pass`);
  if (fails.length) {
    console.log('  ❌ FAILS:');
    for (const f of fails) console.log('    ·', f);
    process.exit(1);
  }
  console.log('  🟢 ALL PASS');
})();
