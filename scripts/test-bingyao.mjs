/* 病藥 v1 tests — derived packet layer only.
   รัน: node --experimental-strip-types --loader ./scripts/ts-loader.mjs scripts/test-bingyao.mjs */
import { buildBingYao } from '../src/lib/chart-packet.ts';

const roots = (over = {}) => ({
  dmElement: 'fire',
  dmLabel: 'rooted',
  isExtremelyWeak: false,
  isTokenOnly: false,
  all: { wood:'partial_root', fire:'rooted', earth:'no_root', metal:'no_root', water:'no_root', ...over },
});
const useful = (yong=['wood'], xi=['fire'], ji=['metal']) => ({
  yong, xi, ji,
  method: 'derived_from_engine_top3_useful_elements',
  confidence: 'engine_derived_not_sifu_final',
});
const profile = (counts={wood:1,fire:1,earth:1,metal:1,water:1}) => ({ counts, voytekLevel:'rooted' });

const cases = [
  {
    name: 'true follow gate → not_applicable',
    args: ['從財格', 'earth', roots(), useful(), null, null, profile()],
    expectStatus: 'not_applicable',
  },
  {
    name: 'false follow + support yong → BY-11 not closed',
    args: ['假從兒格', 'water',
      { dmElement:'water', dmLabel:'token_root', isExtremelyWeak:true, isTokenOnly:true, all:{ wood:'rooted', fire:'rooted', earth:'rooted', metal:'token_root', water:'token_root' } },
      useful(['metal'], ['water'], ['wood','fire','earth']), null, null, profile({wood:4.5,fire:1.5,earth:3,metal:0,water:1})],
    expectId: 'BY-11',
  },
  {
    name: '財破印 → BY-08',
    args: ['印綬格', 'fire', roots({ metal:'rooted' }), useful(['wood'], ['fire'], ['metal']),
      { geZh:'印綬格', verdict:'破格', subLabel:'財為忌', reason:'財重破印 (PO_SEAL_1)' }, null, profile({wood:1,fire:1,earth:0,metal:3,water:0})],
    expectId: 'BY-08',
  },
  {
    name: '殺重身輕 → BY-10',
    args: ['七殺格', 'wood', roots({ wood:'token_root', metal:'strong_root' }), useful(['water'], ['wood'], ['earth']),
      { geZh:'七殺格', verdict:'破格', subLabel:null, reason:'煞重身輕無制無印 (PO_KILL_3)' }, null, profile({wood:1,fire:0,earth:2,metal:4,water:1})],
    expectId: 'BY-10',
  },
  {
    name: '旺神太過 fallback → BY-01',
    args: ['正官格', 'wood', roots({ fire:'strong_root', wood:'rooted' }), useful(['water'], ['wood'], ['fire']),
      null, null, profile({wood:1,fire:4,earth:1,metal:0,water:1})],
    expectId: 'BY-01',
  },
  {
    name: 'weak useful fallback → BY-03',
    args: ['正官格', 'wood', roots({ water:'token_root', wood:'rooted' }), useful(['water'], ['wood'], ['metal']),
      null, null, profile({wood:2,fire:1,earth:1,metal:1,water:1})],
    expectId: 'BY-03',
  },
  {
    name: 'no_root useful must not be BY-03',
    args: ['正官格', 'wood', roots({ water:'no_root', wood:'rooted' }), useful(['water'], ['wood'], []),
      null, null, profile({wood:2,fire:1,earth:1,metal:0,water:0})],
    expectNotId: 'BY-03',
  },
];

let pass = 0, fail = 0;
console.log('=== 病藥 v1 tests ===');
for (const c of cases) {
  const r = buildBingYao(...c.args);
  const ok = c.expectStatus ? r?.status === c.expectStatus : c.expectNotId ? r?.primary?.id !== c.expectNotId : r?.primary?.id === c.expectId;
  console.log(`${ok ? '✓' : '✗'} ${c.name} → status=${r?.status} primary=${r?.primary?.id ?? '-'} (expect ${c.expectStatus || c.expectId || `not ${c.expectNotId}`})`);
  ok ? pass++ : fail++;
}
console.log(`\n=== ${pass}/${pass+fail} ${fail ? '❌ FAIL' : '✅ PASS'} ===`);
process.exit(fail ? 1 : 0);
