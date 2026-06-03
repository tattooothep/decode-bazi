import fs from 'node:fs';

const files = [
  'public/chart.html',
  'public/today.html',
  'public/yongsennetwork.html',
];

let failed = false;

for (const file of files) {
  const html = fs.readFileSync(file, 'utf8');
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  let idx = 0;
  while ((m = re.exec(html))) {
    idx += 1;
    const attrs = m[1] || '';
    const code = m[2] || '';
    if (/\bsrc\s*=/.test(attrs)) continue;
    if (/\btype\s*=\s*["']?(application\/json|importmap)/i.test(attrs)) continue;
    try {
      new Function(code);
    } catch (err) {
      failed = true;
      console.error(`${file} <script #${idx}>: ${err.message}`);
    }
  }
}

if (failed) process.exit(1);
console.log('Public HTML script syntax passed');
