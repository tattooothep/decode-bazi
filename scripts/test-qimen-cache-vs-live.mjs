#!/usr/bin/env node
// test-qimen-cache-vs-live.mjs · 5 ก.ค. 2026 (r412 datepick fix)
// เทียบ aj_ephemeris_cache.qi_men กับ qimen-api (:4090) สด — ต้องตรง 100%
//   1. door/star/deity/direction ของ 值使宮 (headline)
//   2. ครบ 9 วัง เทียบรายวัง door/star/deity/direction
//   3. engine hour pillar ตรงกับ hour_pillar (tyme) — พิสูจน์ไม่ off-by-one
//   4. fallback ต้อง = 0 · status error ต้อง = 0
//   5. กระจาย direction ของ headline ทั้งตาราง (~11%/ทิศ)
// Usage: node scripts/test-qimen-cache-vs-live.mjs [--slots 18]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Client } = require('pg');

const QIMEN_API = process.env.QIMEN_API_URL || 'http://localhost:4090';
const SHICHEN_HOUR = [23,1,3,5,7,9,11,13,15,17,19,21];
const PALACE_DIR = {1:'N',2:'SW',3:'E',4:'SE',5:'C',6:'NW',7:'W',8:'NE',9:'S'};

// ≥15 slot คละเดือน (พ.ค./ส.ค./ต.ค./ธ.ค. 2026 · ก.พ./เม.ย. 2027) × ยามเช้า/บ่าย/ดึก/子時
const SLOTS = [
  ['2026-05-20', 0], ['2026-05-20', 4], ['2026-06-15', 7],
  ['2026-08-10', 0], ['2026-08-10', 5], ['2026-08-25', 9],
  ['2026-10-01', 3], ['2026-10-18', 8], ['2026-10-31', 11],
  ['2026-12-05', 0], ['2026-12-15', 6], ['2026-12-25', 10],
  ['2027-02-04', 2], ['2027-02-14', 7], ['2027-02-28', 0],
  ['2027-04-01', 5], ['2027-04-20', 9], ['2027-05-10', 11],
];

function midDatetime(date, shichen) {
  const h = SHICHEN_HOUR[shichen];
  if (h === 23) {
    const [y, m, d] = date.split('-').map(Number);
    const nd = new Date(Date.UTC(y, m - 1, d));
    nd.setUTCDate(nd.getUTCDate() + 1);
    return `${nd.toISOString().slice(0, 10)}T00:00:00+07:00`;
  }
  return `${date}T${String(h + 1).padStart(2, '0')}:00:00+07:00`;
}

async function liveChart(dt) {
  const r = await fetch(`${QIMEN_API}/api/qimen/calculate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ datetime: dt, longitude: 100.5018, latitude: 13.7563, profile_id: 1 }),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error('live http ' + r.status);
  const j = await r.json();
  return j.data;
}

const client = new Client({ host: 'localhost', port: 5433, database: 'decode_db', user: 'decode_user', password: '98a1021d6df0d117cff8d7aef3be275e' });
await client.connect();

let pass = 0, fail = 0;
const failures = [];

for (const [date, shichen] of SLOTS) {
  const { rows } = await client.query(
    'SELECT hour_pillar, qi_men FROM aj_ephemeris_cache WHERE date=$1 AND shichen=$2', [date, shichen]);
  if (!rows.length) { fail++; failures.push(`${date} sc=${shichen}: ไม่มีแถวใน cache`); continue; }
  const { hour_pillar, qi_men } = rows[0];
  const raw = qi_men.raw || {};
  const problems = [];

  if (qi_men.status !== 'ready') problems.push(`status=${qi_men.status}`);
  if (raw.fallback !== false) problems.push(`fallback=${raw.fallback}`);
  if (!Array.isArray(raw.palaces) || raw.palaces.length !== 9) problems.push(`palaces=${raw.palaces?.length}`);

  const live = await liveChart(midDatetime(date, shichen));
  const c = live.chart;
  const lp = new Map((live.palaces || []).map(p => [p.palace_id, p]));

  // 3) hour pillar ตรง tyme
  if (c.pillars.hour.zh !== hour_pillar.trim()) problems.push(`ยามไม่ตรง engine=${c.pillars.hour.zh} tyme=${hour_pillar.trim()}`);
  if (raw.engine_hour_pillar !== c.pillars.hour.zh) problems.push(`engine_hour_pillar cache=${raw.engine_hour_pillar} live=${c.pillars.hour.zh}`);

  // 1) headline = 值使宮 จริง
  if (raw.palace_id !== c.zhi_shi_palace_id) problems.push(`palace_id cache=${raw.palace_id} live=${c.zhi_shi_palace_id}`);
  const zsLive = lp.get(c.zhi_shi_palace_id);
  if (zsLive) {
    if (raw.door !== zsLive.door_zh) problems.push(`door cache=${raw.door} live=${zsLive.door_zh}`);
    if (raw.star !== zsLive.star_zh) problems.push(`star cache=${raw.star} live=${zsLive.star_zh}`);
    if (raw.deity !== zsLive.deity_zh) problems.push(`deity cache=${raw.deity} live=${zsLive.deity_zh}`);
    const liveDir = zsLive.direction || PALACE_DIR[c.zhi_shi_palace_id];
    if (raw.direction !== liveDir) problems.push(`direction cache=${raw.direction} live=${liveDir}`);
  }

  // 2) 9 วังตรงรายวัง
  for (const pal of raw.palaces || []) {
    const lv = lp.get(pal.palace_id);
    if (!lv) { problems.push(`live ไม่มีวัง ${pal.palace_id}`); continue; }
    if (pal.door !== lv.door_zh || pal.star !== lv.star_zh || pal.deity !== lv.deity_zh
        || pal.direction !== (lv.direction || PALACE_DIR[pal.palace_id])) {
      problems.push(`วัง${pal.palace_id}: cache=${pal.door}/${pal.star}/${pal.deity}/${pal.direction} live=${lv.door_zh}/${lv.star_zh}/${lv.deity_zh}/${lv.direction}`);
    }
  }

  if (problems.length) { fail++; failures.push(`${date} sc=${shichen} (${hour_pillar.trim()}): ${problems.join(' · ')}`); }
  else pass++;
}

console.log(`\n── เทียบ cache vs live: ผ่าน ${pass}/${SLOTS.length} ──`);
for (const f of failures) console.log('  ✗ ' + f);

// 4) fallback + error ทั้งตาราง
const agg = await client.query(`
  SELECT
    count(*)::int AS total,
    count(*) FILTER (WHERE (qi_men->'raw'->>'fallback') = 'true')::int AS fallback,
    count(*) FILTER (WHERE qi_men->>'status' <> 'ready')::int AS not_ready,
    count(*) FILTER (WHERE jsonb_array_length(qi_men->'raw'->'palaces') <> 9 OR qi_men->'raw'->'palaces' IS NULL)::int AS bad_palaces
  FROM aj_ephemeris_cache`);
const a = agg.rows[0];
console.log(`\nทั้งตาราง: ${a.total} แถว · fallback=${a.fallback} · status≠ready=${a.not_ready} · palaces≠9=${a.bad_palaces}`);

// 5) กระจายทิศ headline
// เกณฑ์ตามตำรา: 值使 ตก中宮(5) engine ฝาก坤二 (中五寄坤二宮) → SW ได้ 2/9 ≈ 22.2%
// ทิศอื่นได้ 1/9 ≈ 11.1% · อาการบั๊กเดิม = N เกิน 20% (坎一 ตายตัว) ต้องไม่เกิด
const dist = await client.query(`
  SELECT qi_men->'raw'->>'direction' AS dir, count(*)::int AS n
  FROM aj_ephemeris_cache GROUP BY 1 ORDER BY 2 DESC`);
console.log('\nกระจายทิศ 值使宮 (SW≈22% เพราะ 中五寄坤二 · ทิศอื่น≈11%):');
const pctBy = {};
for (const r of dist.rows) {
  const pct = (100 * r.n / a.total);
  pctBy[r.dir] = pct;
  console.log(`  ${String(r.dir).padEnd(4)} ${String(r.n).padStart(5)}  ${pct.toFixed(1)}%`);
}
const DIRS8 = ['N','NE','E','SE','S','SW','W','NW'];
const distOk = DIRS8.every(d => (pctBy[d] || 0) >= 5)                       // ครบ 8 ทิศ ไม่มีทิศหาย
  && (pctBy['N'] || 0) <= 20                                                // อาการบั๊กเดิมต้องไม่กลับมา
  && (pctBy['SW'] || 0) <= 26                                               // 2/9=22.2% + margin
  && DIRS8.filter(d => d !== 'SW').every(d => (pctBy[d] || 0) <= 20);

await client.end();

const ok = fail === 0 && a.fallback === 0 && a.not_ready === 0 && a.bad_palaces === 0 && distOk;
console.log(`\n${ok ? '✅ PASS ทุกเงื่อนไข' : '❌ FAIL'} (slot ${pass}/${SLOTS.length} · fallback=${a.fallback} · not_ready=${a.not_ready} · bad_palaces=${a.bad_palaces} · กระจายทิศ ${distOk ? 'ผ่าน' : 'ไม่ผ่าน'})`);
process.exit(ok ? 0 : 1);
