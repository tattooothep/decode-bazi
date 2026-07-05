#!/usr/bin/env node
// i18n-export.mjs
// ─────────────────────────────────────────────────────────────────────────
// ส่งออกทุกคีย์ + ค่า th/en/zh จากทุกหน้า public/*.html → data/i18n/keys-export.json
// เตรียมให้ทีมแปล vi/ja/ko/ru/es ทำงานคนละไฟล์ขนานกันได้ (public/i18n/<locale>.json)
// โดยไม่ต้องแก้ไฟล์หน้า 35 หน้าเลย
//
// ใช้ parser ชุดเดียวกับ scripts/i18n-scan.mjs (import ฟังก์ชันจริง — ไม่เขียน parser ใหม่)
// รูปแบบไฟล์ผลลัพธ์: { "<หน้า>::<key>": { th, en, zh } }
//   - "<หน้า>"  = ชื่อไฟล์ใน public/ (เช่น "auspicious.html")
//   - ถ้าค่าเป็น dynamic expression (ประเมิน string literal ตรง ๆ ไม่ได้) จะเก็บ raw expression ไว้
//     (ตัวช่วยเดียวกับที่ i18n-scan.mjs ใช้ตรวจ "ขาดภาษา" — lineTextOf)
// ─────────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PUBLIC_DIR,
  DEAD_PAGES,
  makeLineLookup,
  collectHkEntries,
  collectInlineEntries,
  lineTextOf,
  valuePresent,
} from './i18n-scan.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '..', 'data', 'i18n');
const OUT_PATH = path.join(OUT_DIR, 'keys-export.json');

const argv = process.argv.slice(2);
const FLAG_QUIET = argv.includes('--quiet');

function valueOf(entryVal) {
  if (!entryVal || !valuePresent(entryVal)) return '';
  return lineTextOf(entryVal);
}

// ดึงทุกคีย์ของหน้าเดียว (รวมทั้งกลไก HK_I18N และ inline I18N ถ้ามีทั้งคู่)
function exportFile(filePath, fileName) {
  const text = fs.readFileSync(filePath, 'utf8');
  const lineOf = makeLineLookup(text);
  const hk = collectHkEntries(text, lineOf);
  const inline = collectInlineEntries(text);

  const out = {};

  // กลไก HK_I18N — key -> {th, en, zh, langs}
  for (const [key, rec] of hk.entries) {
    out[`${fileName}::${key}`] = {
      th: valueOf(rec.th),
      en: valueOf(rec.en),
      zh: valueOf(rec.zh),
    };
  }

  // กลไก inline I18N — key แยกอยู่คนละ Map ต่อภาษา (th/en/zh)
  if (inline) {
    const allKeys = new Set([
      ...inline.perLang.th.keys(),
      ...inline.perLang.en.keys(),
      ...inline.perLang.zh.keys(),
    ]);
    for (const key of allKeys) {
      const exportKey = `${fileName}::${key}`;
      if (out[exportKey]) continue; // ชนกับ HK_I18N (ไม่ควรเกิด แต่กันไว้ — HK_I18N ชนะ)
      out[exportKey] = {
        th: valueOf(inline.perLang.th.get(key)),
        en: valueOf(inline.perLang.en.get(key)),
        zh: valueOf(inline.perLang.zh.get(key)),
      };
    }
  }

  return out;
}

function main() {
  const fileNames = fs
    .readdirSync(PUBLIC_DIR)
    .filter((f) => f.endsWith('.html') && !DEAD_PAGES.has(f))
    .sort();

  const merged = {};
  const perFileCounts = [];

  for (const f of fileNames) {
    const out = exportFile(path.join(PUBLIC_DIR, f), f);
    perFileCounts.push([f, Object.keys(out).length]);
    Object.assign(merged, out);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(merged, null, 2) + '\n', 'utf8');

  const totalKeys = Object.keys(merged).length;
  if (!FLAG_QUIET) {
    console.log(`เขียน ${OUT_PATH}`);
    console.log(`หน้า ${fileNames.length} ไฟล์ · คีย์รวม ${totalKeys}`);
    console.log('-'.repeat(46));
    for (const [f, n] of perFileCounts) {
      console.log(`  ${f.padEnd(28)} ${String(n).padStart(6)}`);
    }
    console.log('-'.repeat(46));
    console.log(`รวม ${totalKeys} คีย์ จาก ${fileNames.length} หน้า`);
  }
}

main();
