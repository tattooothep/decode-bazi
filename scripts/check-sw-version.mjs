#!/usr/bin/env node
/*
 * check-sw-version.mjs · r376
 * เทียบ HK_SW_VERSION ใน public/sw.js กับ release tag — ใช้ใน checklist ก่อน cut release
 * "แค่เตือน ไม่ block" (docs/PWA-PLAN-r376.md §2.1) → exit 0 เสมอ
 *
 * วิธีใช้:
 *   node scripts/check-sw-version.mjs r377          # เทียบกับ tag ที่จะ cut
 *   node scripts/check-sw-version.mjs               # เดาจาก /root/releases/current
 *
 * กติกา bump: แก้ sw.js / offline.html / icons เมื่อไหร่ → bump HK_SW_VERSION เป็น rXXX ปัจจุบัน
 * release ที่ไม่แตะไฟล์ PWA ไม่ต้อง bump (SW ไม่ cache HTML → ไม่มี version skew)
 */
import { readFileSync, readlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const swPath = join(root, 'public', 'sw.js');

function extractSwVersion() {
  const src = readFileSync(swPath, 'utf8');
  const m = src.match(/const\s+HK_SW_VERSION\s*=\s*['"]([^'"]+)['"]/);
  if (!m) throw new Error('ไม่พบ HK_SW_VERSION ใน ' + swPath);
  return m[1];
}

function expectedRelease() {
  const arg = process.argv[2];
  if (arg) {
    const m = String(arg).match(/r\d+/i);
    return { tag: m ? m[0].toLowerCase() : arg, source: 'argument' };
  }
  try {
    const target = readlinkSync('/root/releases/current');
    const m = basename(target).match(/r\d+/i);
    if (m) return { tag: m[0].toLowerCase(), source: '/root/releases/current → ' + basename(target) };
  } catch (_) {}
  return null;
}

try {
  const swVersion = extractSwVersion();
  const expected = expectedRelease();

  console.log('HK_SW_VERSION (public/sw.js) = ' + swVersion);
  if (!expected) {
    console.log('⚠️  ไม่รู้ release tag เป้าหมาย — ใส่ argument เช่น: node scripts/check-sw-version.mjs r377');
    process.exit(0);
  }
  console.log('release เป้าหมาย            = ' + expected.tag + ' (จาก ' + expected.source + ')');

  if (swVersion.toLowerCase() === expected.tag) {
    console.log('✅ ตรงกัน — deploy ได้');
  } else {
    console.log('⚠️  ไม่ตรงกัน!');
    console.log('   ถ้า release นี้แตะไฟล์ PWA (sw.js / offline.html / icons) → ต้อง bump HK_SW_VERSION เป็น ' + expected.tag);
    console.log('   ถ้าไม่แตะไฟล์ PWA → ปล่อยได้ (SW ไม่ cache HTML · ไม่มี version skew)');
  }
} catch (err) {
  console.log('⚠️  ' + (err && err.message ? err.message : String(err)));
}
process.exit(0);
