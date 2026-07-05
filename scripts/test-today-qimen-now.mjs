#!/usr/bin/env node
/**
 * test-today-qimen-now.mjs
 * ตรวจฟีเจอร์ "奇門ตอนนี้ (時家) · ภาพรวมเหตุการณ์ + ทิศ ณ ตำแหน่งตอนนี้" บน /today
 * - additive: section เดิมต้องอยู่ครบ (5สัตว์/ชั่วยาม/ทิศวันนี้/actions)
 * - i18n 3 ภาษา TH/EN/ZH
 * - degrade เงียบถ้า /api/qimen ล่ม
 * - /api/qimen (hour) คืน 9宮 + ประตู
 *
 * รัน: node scripts/test-today-qimen-now.mjs [baseUrl]
 *   baseUrl default = http://127.0.0.1:3350
 */
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execSync } from 'node:child_process';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..');
const HTML = join(ROOT, 'public', 'today.html');
const BASE = process.argv[2] || 'http://127.0.0.1:3350';

let pass = 0, fail = 0;
function ok(name, cond, extra) { (cond ? (pass++, console.log('  ✓ ' + name)) : (fail++, console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')))); }

const html = readFileSync(HTML, 'utf8');

console.log('\n[1] section เดิมต้องอยู่ครบ (additive · ห้ามแตะของเดิม)');
ok('5 สัตว์มงคล (dm-spirit)', html.includes('dm-spirit') && html.includes('สัตว์มงคล'));
ok('ชั่วยาม 12 (grid12 / t-hours-grid)', html.includes('t-hours-grid') && html.includes('ชั่วยาม'));
ok('ทิศใช้วันนี้ เดิม (t-de-board)', html.includes('id="t-de-board"') && html.includes('ทิศใช้วันนี้'));
ok('actions for goals (actions-grid)', html.includes('actions-grid') && html.includes('t-actions-guard'));

console.log('\n[2] section ใหม่ครบ + วางใต้ "ทิศใช้วันนี้"');
ok('section 奇門ตอนนี้ (t-qn-board)', html.includes('id="t-qn-board"'));
ok('content mount (t-qn-content)', html.includes('id="t-qn-content"'));
ok('ปุ่มรีเฟรช (t-qn-refresh)', html.includes('id="t-qn-refresh"'));
ok('ป้ายไม่รวมดวงส่วนตัว', html.includes('ไม่รวมดวงส่วนตัว'));
ok('เริ่มซ่อน (display:none) degrade', /id="t-qn-board"[^>]*display:none/.test(html));
const iDe = html.indexOf('id="t-de-board"');
const iQn = html.indexOf('id="t-qn-board"');
const iHours = html.indexOf('id="t-hours-grid"');
ok('วางใต้ทิศวันนี้ + เหนือชั่วยาม', iDe > 0 && iQn > iDe && iHours > iQn, `de=${iDe} qn=${iQn} hours=${iHours}`);
ok('hook applyI18N (__renderTodayQimenNow)', html.includes('__renderTodayQimenNow'));
ok('เรียก /api/qimen system_type=hour', html.includes('/api/qimen?system_type=hour'));
ok('geolocation + default BKK', html.includes('navigator.geolocation') && html.includes('13.7563'));

console.log('\n[3] i18n 3 ภาษา (TH/EN/ZH) ใน label dict');
for (const key of ['ovTitle', 'lvGood', 'lvBad', 'dirsHead', 'recoGood', 'foot', 'badge']) {
  const re = new RegExp(key + ':\\{[^}]*\\bth:[^}]*\\ben:[^}]*\\bzh:');
  ok(`LB.${key} มี th/en/zh`, re.test(html));
}
ok('DIR 8 ทิศ + กลาง มี 3 ภาษา', /N:\{ th:'เหนือ', en:'North', zh:'北'/.test(html) && /C:\{ th:'กลาง', en:'Center', zh:'中'/.test(html));

console.log('\n[4] คัมภีร์ประตู · จัดกลุ่มมงคล/ระวัง (boss spec)');
ok('三吉門 開/休/生 = good', /GOOD_DOORS *= *\{ *'開門':1,'休門':1,'生門':1/.test(html));
ok('景門 = กลาง (neutral)', /NEUTRAL_DOORS *= *\{ *'景門':1/.test(html));

console.log('\n[5] node --check ของ JS block ที่เพิ่มใหม่');
try {
  const marker = '奇門ตอนนี้ · 時家 · ภาพรวมเหตุการณ์ + ทิศ ณ ตำแหน่งตอนนี้ (ไม่ผูกดวงคน) ──';
  const mi = html.indexOf(marker);
  const start = html.lastIndexOf('<script>', mi);
  const end = html.indexOf('</script>', mi);
  const js = html.slice(start + '<script>'.length, end);
  const tmp = join(ROOT, 'scripts', '.qn-check.tmp.js');
  writeFileSync(tmp, js);
  execSync(`node --check ${tmp}`, { stdio: 'pipe' });
  unlinkSync(tmp);
  ok('JS block syntax valid (node --check)', true);
} catch (e) {
  ok('JS block syntax valid (node --check)', false, String(e.message || e).slice(0, 200));
}

console.log('\n[6] /api/qimen (hour) คืน 9宮 + ประตู (ตัวอย่างจริง กทม ตอนนี้)');
async function testApi() {
  try {
    const r = await fetch(`${BASE}/api/qimen?system_type=hour&school=chaibu&lat=13.7563&lng=100.5018`, { headers: { Accept: 'application/json' } });
    const j = await r.json();
    const data = j.data;
    ok('HTTP ok + data.palaces = 9', r.ok && data && Array.isArray(data.palaces) && data.palaces.length === 9, data ? `len=${data.palaces?.length}` : 'no data');
    const c = data.chart;
    ok('chart มี zhi_fu / zhi_shi palace', c && c.zhi_fu_palace_id != null && c.zhi_shi_palace_id != null);
    ok('ทุกวังมี door_zh + direction + trigram', data.palaces.every(p => p.door_zh && p.direction && p.trigram_zh));
    // สรุปตัวอย่างจริง
    const GOOD = { '開門': 1, '休門': 1, '生門': 1 }, NEU = { '景門': 1 };
    const DIRTH = { N: 'เหนือ', S: 'ใต้', E: 'ตะวันออก', W: 'ตะวันตก', NE: 'ตะวันออกเฉียงเหนือ', NW: 'ตะวันตกเฉียงเหนือ', SE: 'ตะวันออกเฉียงใต้', SW: 'ตะวันตกเฉียงใต้', C: 'กลาง' };
    const open = [], bad = [];
    for (const p of data.palaces) {
      if (p.direction === 'C') continue;
      if (GOOD[p.door_zh]) open.push(`${DIRTH[p.direction]}(${p.door_zh})`);
      else if (!NEU[p.door_zh]) bad.push(`${DIRTH[p.direction]}(${p.door_zh})`);
    }
    console.log(`     · เวลา: ${j.input?.date} ${j.input?.time} · ยามเสา ${c.pillars?.hour?.zh} · โดยรวม ${c.chart_overall_symbol}`);
    console.log(`     · ทิศเปิด (มงคล): ${open.join(', ') || '—'}`);
    console.log(`     · ทิศระวัง:        ${bad.join(', ') || '—'}`);
    console.log(`     · 值符 ${c.zhi_fu_palace_zh} · 值使 ${c.zhi_shi_palace_zh}`);
  } catch (e) {
    ok('เรียก /api/qimen', false, String(e.message || e));
    console.log('     (degrade: ถ้า endpoint ล่ม section จะซ่อนเงียบ · today ไม่พัง)');
  }
}

await testApi();

console.log(`\n=== ผลรวม: ผ่าน ${pass} · ตก ${fail} ===`);
process.exit(fail ? 1 : 0);
