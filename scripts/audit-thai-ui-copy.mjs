import fs from 'node:fs';

const files = [
  'public/chart.html',
  'public/today.html',
  'public/yongsennetwork.html',
  'public/datepick.html',
];

const banned = [
  'DAY VERDICT',
  "TODAY'S PILLAR",
  'LUCKY HOURS',
  'ACTION TODAY',
  'HIGH SIGNAL',
  'STEADY',
  'LOW ·',
  'OVERVIEW',
  'STRUCTURE',
  'LIFE DOMAINS',
  'PERSONAL',
  'DUTY',
  'INCOME',
  'CHALLENGE',
  'OUTPUT',
  'SELF',
  'YONGSHEN NETWORK',
  'TIME RANGE',
  'SOLAR SYSTEM',
  'PEOPLE GRID',
  'TEAM BUILDER',
  'AI Assist',
  'RISK CTRL',
  'AVG',
  'CO-FOUNDER',
  'Four Pillars',
  'DAY MASTER',
  'HS',
  'EB',
  'HHS',
  'Na Yin',
  '3 phases',
  'DHHS',
  'Stars',
  'React.',
  'Palace',
  'Hex Natal',
  'BIRTH DATE',
  'BIRTH TIME',
  'DAY BOUNDARY',
  'wrapper7',
  'own luck',
  'next step',
  'pre-read',
  'scope creep',
  'Challenger',
  'Blind spot',
  'final approver',
  'Name',
  'Nickname',
  'Date',
  'Time',
  'GENDER',
  'Male',
  'Female',
  'Google Places',
  'Team Builder',
  'Date Picking',
  'Tong Shu',
  'Ba Zi',
  'Qi Men',
  'Tai Sui',
  '12 Officers',
  '28 Constellations',
  '12 Spirits',
  '9 Flying Stars',
  'Yongshen',
  'He Luo',
  '64 Hex',
  'Filter Funnel',
  'Hard Filter',
  'Scoring Layers',
  'SCORE',
  'bonus',
  'warning',
  'strict mode',
  'Keyword instant',
  'AI fallback',
  'Qimen API',
  'slot',
  'Center',
  'center',
  'no Hour',
];

const stripCode = (html) => html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ');

const stripTags = (html) => html
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ');

const thStrings = (html) => {
  const out = [];
  const re = /th\s*:\s*(['"`])([\s\S]*?)\1/g;
  let m;
  while ((m = re.exec(html))) out.push(m[2]);
  return out.join('\n');
};

let failed = false;

for (const file of files) {
  const html = fs.readFileSync(file, 'utf8');
  const visible = stripTags(stripCode(html));
  const thaiDict = thStrings(html);
  const haystack = `${visible}\n${thaiDict}`;
  const hits = banned.filter((term) => haystack.includes(term));
  if (hits.length) {
    failed = true;
    console.error(`${file}: ${hits.join(', ')}`);
  }
}

if (failed) process.exit(1);
console.log('Thai UI copy audit passed');
