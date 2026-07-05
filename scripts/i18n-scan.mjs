#!/usr/bin/env node
// i18n-scan.mjs
// ─────────────────────────────────────────────────────────────────────────
// ตรวจความครบของระบบแปลภาษา (TH/EN/ZH) ทุกหน้าใน public/*.html
// ใช้เฉพาะ node:fs + node:path (ไม่พึ่ง dependency ภายนอก)
//
// ตรวจ 4 อย่าง:
//   A. กลไกแปลของแต่ละหน้า (HK_I18N / inline / none)
//   B. คีย์ขาดภาษา (มี th แต่ขาด en หรือ zh)
//   C. คีย์ที่ data-i18n / data-i18n-ph อ้างถึง แต่ไม่มีนิยามในดิกชันนารี
//   D. "ไทยหลง" — ข้อความไทยที่จะโผล่แม้ผู้ใช้เลือกภาษาอื่น (D1=HTML, D2=JS)
//
// วิธี parse: ไม่ eval/require ไฟล์ html เลย — ใช้ regex หา entry point แล้ว
// เดิน brace-matching เองแบบระวังสตริง/คอมเมนต์ (ดู parseObjectAt ด้านล่าง)
// ─────────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');

// ช่วงอักษรไทย U+0E00–U+0E7F (฀-๿) — ครอบทั้งพยัญชนะ สระ วรรณยุกต์ เลขไทย ฿
const THAI_RE = /[฀-๿]/;

// tag ที่ไม่ครอบ text node (void elements) — ไม่ต้อง push ลง stack ตอนเดิน HTML
const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

// หน้าตายที่ next.config redirect ไปหน้าหลักแล้ว (ผู้ใช้เข้าไม่ถึง) — ไม่ต้องตรวจ
const DEAD_PAGES = new Set(['calendar-m.html', 'master-m.html', 'mygoal-m.html', 'picker-m.html']);

// ── CLI args ──────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const FLAG_JSON = argv.includes('--json');
const FLAG_SUMMARY = argv.includes('--summary');
const pageArg = argv.find((a) => a.startsWith('--page='));
const ONLY_PAGE = pageArg ? pageArg.slice('--page='.length) : null;

// ══════════════════════════════════════════════════════════════════════
// ชั้นล่างสุด: char-scanner ที่ระวังสตริง/คอมเมนต์ (ใช้ร่วมกันหลายจุด)
// ══════════════════════════════════════════════════════════════════════

// escape ตัวอักษรพิเศษของ regex (ใช้ตอนสร้าง pattern จากชื่อ alias ที่ค้นพบสด ๆ)
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ข้าม whitespace / comma / comment (// และ /* */) — ใช้ตอนไล่หา token ถัดไปในอ็อบเจ็กต์
function skipTrivia(text, i) {
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === ',') { i++; continue; }
    if (c === '/' && text[i + 1] === '/') { while (i < n && text[i] !== '\n') i++; continue; }
    if (c === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < n - 1 && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    break;
  }
  return i;
}

// parse คีย์ของ property หนึ่งตัว — รองรับทั้ง 'key' / "key" และ bare identifier เช่น th:
function parseKey(text, i) {
  const c = text[i];
  if (c === "'" || c === '"') {
    const quote = c;
    let j = i + 1;
    let raw = '';
    while (j < text.length && text[j] !== quote) {
      if (text[j] === '\\') { raw += text[j + 1]; j += 2; continue; }
      raw += text[j]; j++;
    }
    return { key: raw, next: j + 1 };
  }
  let j = i;
  while (j < text.length && /[A-Za-z0-9_$]/.test(text[j])) j++;
  if (j === i) return null; // token แปลก (เช่น computed key [expr]) — parse ไม่ได้ ยอมแพ้
  return { key: text.slice(i, j), next: j };
}

// หาจุดจบของ "ค่า" (value) ตัวหนึ่งในอ็อบเจ็กต์ — เดินนับ depth ของ () [] {} และข้ามสตริง/คอมเมนต์
// หยุดที่ comma ระดับบนสุด หรือขอบปิด "}" ของอ็อบเจ็กต์แม่ (ไม่กินตัวปิดนั้น)
// วิธีนี้รองรับทั้งค่าที่เป็น string literal ล้วน, อ็อบเจ็กต์ซ้อน, array, และ expression เช่น 'a'+x+'b'
function scanValueEnd(text, i) {
  const n = text.length;
  let depth = 0;
  let inStr = null;
  while (i < n) {
    const c = text[i];
    if (inStr) {
      if (c === '\\') { i += 2; continue; }
      if (c === inStr) inStr = null;
      i++; continue;
    }
    if (c === "'" || c === '"' || c === '`') { inStr = c; i++; continue; }
    if (c === '/' && text[i + 1] === '/') { while (i < n && text[i] !== '\n') i++; continue; }
    if (c === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < n - 1 && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (c === '(' || c === '[' || c === '{') { depth++; i++; continue; }
    if (c === ')' || c === ']' || c === '}') {
      if (depth === 0) return i; // ถึงขอบปิดของอ็อบเจ็กต์แม่ — หยุดโดยไม่กิน
      depth--; i++; continue;
    }
    if (c === ',' && depth === 0) return i; // จบค่าที่ comma ระดับบนสุด
    i++;
  }
  return i;
}

// parse อ็อบเจ็กต์ literal ที่ตำแหน่ง '{' — คืน Map<key, {raw, valueStart, valueEnd, keyStartIdx}>
// และตำแหน่ง '}' ปิด (หรือ -1 ถ้า parse ไม่สำเร็จ เช่นเจอ token แปลกกลางทาง — เลิกแบบปลอดภัย)
function parseObjectAt(text, openIdx) {
  const entries = new Map();
  const n = text.length;
  let i = openIdx + 1;
  let closeIdx = -1;
  let guard = 0;
  while (i < n) {
    if (++guard > 300000) break; // กันลูปไม่รู้จบถ้าไฟล์เพี้ยนผิดปกติ
    i = skipTrivia(text, i);
    if (i >= n) break;
    if (text[i] === '}') { closeIdx = i; i++; break; }
    const keyRes = parseKey(text, i);
    if (!keyRes) break; // parse คีย์ไม่ได้ — เลิก parse ต่อ (ปลอดภัยกว่าเดามั่ว)
    i = skipTrivia(text, keyRes.next);
    if (text[i] !== ':') break;
    i = skipTrivia(text, i + 1);
    const valueStart = i;
    const valueEnd = scanValueEnd(text, i);
    const raw = text.slice(valueStart, valueEnd).trim();
    entries.set(keyRes.key, { raw, valueStart, valueEnd, keyStartIdx: keyRes.next });
    i = skipTrivia(text, valueEnd);
  }
  return { closeIdx, entries };
}

// เช็คว่า raw value เป็น string literal เดี่ยว ๆ ล้วน ๆ หรือไม่ (ไม่ใช่ 'a'+x หรือ expression อื่น)
// ถ้าใช่ คืนเนื้อหาที่ unescape แล้ว, ถ้าไม่ใช่ คืน null (แปลว่าเป็น dynamic/expression ประเมินไม่ได้)
function stringLiteralValue(raw) {
  if (!raw || raw.length < 2) return null;
  const q = raw[0];
  if ((q === "'" || q === '"' || q === '`') && raw[raw.length - 1] === q) {
    let i = 1;
    let out = '';
    while (i < raw.length - 1) {
      if (raw[i] === '\\') { out += raw[i + 1]; i += 2; continue; }
      if (raw[i] === q) return null; // เจอ quote ปิดก่อนถึงท้าย → มีเนื้อหาต่อ (concat) ไม่ใช่ literal ล้วน
      out += raw[i]; i++;
    }
    return out;
  }
  return null;
}

// ค่า "มีอยู่จริงและไม่ว่าง" หรือไม่ — string ว่างถือว่าขาด, ส่วน expression/dynamic ถือว่ามี (ประเมินไม่ได้ ไม่ฟันธงว่าขาด)
function valuePresent(entryVal) {
  if (!entryVal) return false;
  const s = stringLiteralValue(entryVal.raw);
  if (s === null) return true;
  return s.trim() !== '';
}

function lineTextOf(entryVal) {
  const s = stringLiteralValue(entryVal.raw);
  return s === null ? entryVal.raw : s;
}

// ตัดข้อความให้สั้นลง สำหรับแสดงผลตัวอย่าง (ไม่เกิน n ตัวอักษร, ยุบช่องว่างซ้ำ)
function truncate(s, n = 60) {
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length > n ? flat.slice(0, n) + '…' : flat;
}

function unescapeSimple(s) {
  return s.replace(/\\(.)/g, (_, ch) => (ch === 'n' || ch === 't' ? ' ' : ch));
}

// ── ตัวช่วยแปลง index อักขระ → เลขบรรทัด (1-indexed) แบบ binary search ─────
function makeLineLookup(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return function lineOf(idx) {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= idx) lo = mid; else hi = mid - 1;
    }
    return lo + 1;
  };
}

// ══════════════════════════════════════════════════════════════════════
// A + B: หาก้อนดิกชันนารีของแต่ละกลไก แล้ว parse คีย์ th/en/zh
// ══════════════════════════════════════════════════════════════════════

// หา index ของ '{' ที่เป็นจุดเริ่ม "ก้อนคอนเทนเนอร์" ของ HK_I18N (มีหลายคีย์อยู่ข้างใน)
// รองรับ 2 รูปแบบ: Object.assign(window.HK_I18N, {...}) และ window.HK_I18N = {...}
// (ไม่นับ window.HK_I18N = window.HK_I18N || {} ที่เป็นแค่ default-init และไม่นับ IIFE-derived อย่าง luopan.html)
function findHkContainerOpenIndices(text) {
  const idxs = [];
  const assignRe = /Object\.assign\(\s*window\.HK_I18N\s*,\s*\{/g;
  let m;
  while ((m = assignRe.exec(text))) idxs.push(m.index + m[0].length - 1);
  const directRe = /window\.HK_I18N\s*=\s*(\{|\(function|window\.HK_I18N)/g;
  while ((m = directRe.exec(text))) {
    if (m[1] === '{') idxs.push(m.index + m[0].length - 1);
  }
  return idxs;
}

// หา alias ของ HK_I18N ที่ถูกตั้งด้วย pattern `var DICT = window.HK_I18N || (window.HK_I18N = {})`
// (พบใน chart.html) — เพื่อให้จับ DICT['key'] = {...} ได้ด้วย
function findHkAliasNames(text) {
  const aliases = [];
  const re = /\b(?:var|const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*window\.HK_I18N\s*\|\|\s*\(\s*window\.HK_I18N\s*=\s*\{\}\s*\)/g;
  let m;
  while ((m = re.exec(text))) aliases.push(m[1]);
  return aliases;
}

// หาจุดกำหนดคีย์เดี่ยว ๆ เช่น window.HK_I18N['key'] = {...} หรือ DICT.key = {...}
// (พบใน today.html และ chart.html) — คืน {openIdx, key} ต่อรายการ
function findHkSingleEntryAssignments(text, identifiers) {
  const results = [];
  for (const idPattern of identifiers) {
    const re = new RegExp(
      idPattern + "\\s*(?:\\[\\s*['\"`]([^'\"`]+)['\"`]\\s*\\]|\\.([A-Za-z_$][\\w$]*))\\s*=\\s*\\{",
      'g'
    );
    let m;
    while ((m = re.exec(text))) {
      const key = m[1] !== undefined ? m[1] : m[2];
      results.push({ openIdx: m.index + m[0].length - 1, key });
    }
  }
  return results;
}

// เก็บ entry หนึ่งตัวลง map กลาง (key -> สถานะ th/en/zh + เลขบรรทัด)
function registerHkEntry(map, key, nestedEntries, idxForLine, lineOf) {
  map.set(key, {
    th: nestedEntries.get('th'),
    en: nestedEntries.get('en'),
    zh: nestedEntries.get('zh'),
    line: lineOf(idxForLine),
  });
}

// รวบรวมทุกคีย์ของกลไก HK_I18N ในไฟล์เดียว — คืน {entries, excludedRanges}
// excludedRanges = ช่วง [start,end) ของทุกก้อนดิกชันนารีที่ parse สำเร็จ (ไว้กันไม่ให้ D2 มานับซ้ำ)
function collectHkEntries(text, lineOf) {
  const entries = new Map();
  const excludedRanges = [];

  for (const openIdx of findHkContainerOpenIndices(text)) {
    const { closeIdx, entries: containerEntries } = parseObjectAt(text, openIdx);
    if (closeIdx === -1) continue;
    excludedRanges.push([openIdx, closeIdx + 1]);
    for (const [key, val] of containerEntries) {
      if (!val.raw.startsWith('{')) continue; // ค่าไม่ใช่ {th,en,zh} object ข้าม (โครงสร้างแปลก)
      const nested = parseObjectAt(text, val.valueStart);
      if (nested.closeIdx === -1) continue;
      registerHkEntry(entries, key, nested.entries, val.keyStartIdx, lineOf);
    }
  }

  const aliasNames = findHkAliasNames(text).map(escapeRegExp);
  const identifiers = ['window\\.HK_I18N', ...aliasNames];
  for (const { openIdx, key } of findHkSingleEntryAssignments(text, identifiers)) {
    const nested = parseObjectAt(text, openIdx);
    if (nested.closeIdx === -1) continue;
    excludedRanges.push([openIdx, nested.closeIdx + 1]);
    registerHkEntry(entries, key, nested.entries, openIdx, lineOf);
  }

  return { entries, excludedRanges };
}

// หาก้อน inline `var/const/let I18N = { th:{...}, en:{...}, zh:{...} }` (ตัวแรกที่เจอในไฟล์)
function findInlineI18nOpenIdx(text) {
  const re = /\b(?:var|const|let)\s+I18N\s*=\s*\{/;
  const m = re.exec(text);
  return m ? m.index + m[0].length - 1 : null;
}

// รวบรวมกลไก inline — คืน null ถ้าไม่มี, หรือ {perLang: {th,en,zh: Map}, excludedRanges}
function collectInlineEntries(text) {
  const openIdx = findInlineI18nOpenIdx(text);
  if (openIdx === null) return null;
  const outer = parseObjectAt(text, openIdx);
  if (outer.closeIdx === -1) return null;
  const excludedRanges = [[openIdx, outer.closeIdx + 1]];
  const perLang = {};
  for (const lang of ['th', 'en', 'zh']) {
    const entry = outer.entries.get(lang);
    if (entry && entry.raw.startsWith('{')) {
      perLang[lang] = parseObjectAt(text, entry.valueStart).entries;
    } else {
      perLang[lang] = new Map();
    }
  }
  return { perLang, excludedRanges };
}

// ══════════════════════════════════════════════════════════════════════
// C: data-i18n / data-i18n-ph ที่อ้างถึงคีย์ — เทียบกับคีย์ที่นิยามจริง
// ══════════════════════════════════════════════════════════════════════
// scriptRanges: ช่วง content ของ <script> ทั้งหมด — ต้องข้าม ไม่งั้นโค้ด bootstrap ที่เขียน
// string ประกอบเอง เช่น '[data-i18n="'+key+'"]' จะโดนจับผิดว่าเป็นการอ้างคีย์จริง (false positive)
function collectI18nRefs(text, lineOf, scriptRanges) {
  const refs = [];
  const re = /data-i18n(-ph)?\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(text))) {
    if (isInExcluded(m.index, scriptRanges)) continue;
    const key = m[2] !== undefined ? m[2] : m[3];
    if (key) refs.push({ key, line: lineOf(m.index) });
  }
  return refs;
}

// ══════════════════════════════════════════════════════════════════════
// D1: ไทยหลงใน HTML — text node ที่มีอักษรไทยแต่ element ครอบไม่มี data-i18n(-ph)
// ══════════════════════════════════════════════════════════════════════

// หาช่วง [start,end) ของ <script>...</script>, <style>...</style>, <!-- --> ทั้งหมด
// (ใช้สองจุด: เอาไป "เบลอ" ก่อนวิเคราะห์ HTML text node, และ content-only range ไปสแกน D2)
function findScriptBlocks(text) {
  const blocks = [];
  const re = /<script([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let m;
  while ((m = re.exec(text))) {
    const attrs = m[1];
    const contentStart = m.index + '<script'.length + attrs.length + 1;
    const contentEnd = contentStart + m[2].length;
    blocks.push({ fullStart: m.index, fullEnd: m.index + m[0].length, contentStart, contentEnd, attrs });
  }
  return blocks;
}

function findBlankableRanges(text, scriptBlocks) {
  const ranges = scriptBlocks.map((b) => [b.fullStart, b.fullEnd]);
  const styleRe = /<style\b[^>]*>[\s\S]*?<\/style\s*>/gi;
  let m;
  while ((m = styleRe.exec(text))) ranges.push([m.index, m.index + m[0].length]);
  const commentRe = /<!--[\s\S]*?-->/g;
  while ((m = commentRe.exec(text))) ranges.push([m.index, m.index + m[0].length]);
  return ranges;
}

// แทนที่ตัวอักษรในช่วงที่กำหนดด้วยช่องว่าง (คงตำแหน่ง \n ไว้ทุกตัว) เพื่อไม่ให้เลขบรรทัดเลื่อน
function blankRanges(text, ranges) {
  const chars = text.split('');
  for (const [s, e] of ranges) {
    for (let i = s; i < e && i < chars.length; i++) if (chars[i] !== '\n') chars[i] = ' ';
  }
  return chars.join('');
}

function findD1Stray(blankedText, lineOf) {
  const findings = [];
  // จับ tag เปิด/ปิด โดยระวัง attribute ที่มี > อยู่ในเครื่องหมายคำพูด
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
  const stack = []; // { name, hasI18n }
  let lastIndex = 0;
  let m;
  const checkTextNode = (start, end) => {
    const node = blankedText.slice(start, end);
    if (!node.length || !THAI_RE.test(node)) return;
    // เช็คทั้งสาย ancestor ไม่ใช่แค่ตัวครอบชั้นในสุด — container ที่มี data-i18n (เช่น data-i18n-html ทั้งก้อน)
    // แปลเนื้อทั้งหมดใต้มันตอน runtime อยู่แล้ว (บทเรียน today.html sc.body: เช็คแค่ top = false positive 65 จุด)
    if (stack.some((s) => s.hasI18n)) return;
    const thaiOffset = node.search(THAI_RE);
    findings.push({ line: lineOf(start + thaiOffset), snippet: truncate(node) });
  };
  while ((m = tagRe.exec(blankedText))) {
    checkTextNode(lastIndex, m.index);
    const isClose = m[1] === '/';
    const tagName = m[2].toLowerCase();
    const selfClose = m[4] === '/' || VOID_TAGS.has(tagName);
    if (isClose) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].name === tagName) { stack.length = i; break; }
      }
    } else if (!selfClose) {
      // นับทุกสำเนียง i18n ที่มีจริงในเว็บ: data-i18n(-ph) กลาง · data-i (book) · data-t/-tp (tianxing) · data-l (pricing/article/offline)
      const hasI18n = /data-(?:i18n(?:-ph)?|i|t|tp|l)\s*=/.test(m[3]);
      stack.push({ name: tagName, hasI18n });
    }
    lastIndex = m.index + m[0].length;
  }
  checkTextNode(lastIndex, blankedText.length); // ข้อความหลัง tag สุดท้าย (กันไว้เผื่อไฟล์ปิด tag ไม่ครบ)
  return findings;
}

// ══════════════════════════════════════════════════════════════════════
// D2: ไทยหลงใน JS — string literal ที่มีอักษรไทย อยู่ใน <script> แต่นอกก้อนดิกชันนารี
// ══════════════════════════════════════════════════════════════════════
function isInExcluded(idx, excludedRanges) {
  for (const [s, e] of excludedRanges) if (idx >= s && idx < e) return true;
  return false;
}

function findD2Stray(text, scriptBlocks, excludedRanges, lineOf, lines) {
  const findings = [];
  for (const blk of scriptBlocks) {
    // ข้าม <script type="application/ld+json"> ทั้งก้อนไม่ได้ตาม spec (สแกนเหมือน script ทั่วไป)
    // → หมายเหตุ known-limitation: จะขึ้นเป็น "ไทยหลง JS" ได้แม้เป็นแค่ schema.org metadata
    let i = blk.contentStart;
    const end = blk.contentEnd;
    let inStr = null;
    let strStart = -1;
    while (i < end) {
      const c = text[i];
      if (inStr) {
        if (c === '\\') { i += 2; continue; }
        if (c === inStr) {
          handleLiteral(text.slice(strStart, i + 1), strStart);
          inStr = null;
        }
        i++; continue;
      }
      if (c === "'" || c === '"' || c === '`') { inStr = c; strStart = i; i++; continue; }
      if (c === '/' && text[i + 1] === '/') { while (i < end && text[i] !== '\n') i++; continue; }
      if (c === '/' && text[i + 1] === '*') {
        i += 2;
        while (i < end - 1 && !(text[i] === '*' && text[i + 1] === '/')) i++;
        i += 2;
        continue;
      }
      i++;
    }
  }
  function handleLiteral(raw, startIdx) {
    if (isInExcluded(startIdx, excludedRanges)) return; // อยู่ในก้อนนิยาม dict → ไม่นับ
    if (!THAI_RE.test(raw)) return;
    const lineNo = lineOf(startIdx);
    const lineText = lines[lineNo - 1] || '';
    if (/^\s*(\/\/|\*|\/\*)/.test(lineText)) return; // บรรทัด comment ล้วน
    if (/console\s*\.\s*[a-zA-Z]+\s*\(/.test(lineText)) return; // บรรทัด console.*
    // fallback ไทยเป็น argument ที่ 2 ของ helper แปล เช่น _dptx('key','ไทย') / _qtx / _chtx
    // — ตัวนี้ถูกแทนด้วยคำแปลตอน runtime แล้ว ไม่ใช่ไทยหลง (บทเรียนจาก chart/datepick)
    const before = text.slice(Math.max(0, startIdx - 80), startIdx);
    if (/_[A-Za-z0-9]*tx\(\s*(['"])[^'"`]+\1\s*,\s*$/.test(before)) return;
    // entry คลังข้อมูล 3 ภาษาในบรรทัดเดียว เช่น {th:'..',en:'..',zh:'..'} นอกก้อน HK_I18N — มีคู่แปลแล้ว
    if (/\bth\s*:/.test(lineText) && (/\ben\s*:/.test(lineText) || /\bzh\s*:/.test(lineText))) return;
    const inner = raw.slice(1, -1);
    if (/^(lang|charset)\s*=/.test(inner.trim())) return; // attribute lang/charset เดี่ยว ๆ
    findings.push({ line: lineNo, snippet: truncate(unescapeSimple(inner)) });
  }
  return findings;
}

// ══════════════════════════════════════════════════════════════════════
// ประมวลผลไฟล์เดียว
// ══════════════════════════════════════════════════════════════════════
function analyzeFile(filePath, fileName) {
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split('\n');
  const lineOf = makeLineLookup(text);

  const hk = collectHkEntries(text, lineOf);
  const inline = collectInlineEntries(text);

  const hasHk = hk.entries.size > 0;
  const hasInline = !!(inline && (inline.perLang.th.size || inline.perLang.en.size || inline.perLang.zh.size));
  let mechanism = 'none';
  if (hasHk && hasInline) mechanism = 'HK_I18N+inline';
  else if (hasHk) mechanism = 'HK_I18N';
  else if (hasInline) mechanism = 'inline';

  const excludedRanges = [...hk.excludedRanges, ...(inline ? inline.excludedRanges : [])];

  // ── B: คีย์ขาดภาษา + นับจำนวนคีย์ต่อภาษา ──
  const missingEn = [];
  const missingZh = [];
  let thCount = 0, enCount = 0, zhCount = 0;
  const definedKeys = new Set();

  if (mechanism === 'HK_I18N' || mechanism === 'HK_I18N+inline') {
    for (const [key, rec] of hk.entries) {
      definedKeys.add(key);
      if (valuePresent(rec.th)) thCount++;
      if (valuePresent(rec.en)) enCount++; else missingEn.push({ key, line: rec.line });
      if (valuePresent(rec.zh)) zhCount++; else missingZh.push({ key, line: rec.line });
    }
  }
  if (mechanism === 'inline' || mechanism === 'HK_I18N+inline') {
    for (const [key] of inline.perLang.th) definedKeys.add(key);
    for (const [key] of inline.perLang.en) definedKeys.add(key);
    for (const [key] of inline.perLang.zh) definedKeys.add(key);
    for (const [key, thVal] of inline.perLang.th) {
      if (valuePresent(thVal)) thCount++;
      const enVal = inline.perLang.en.get(key);
      const zhVal = inline.perLang.zh.get(key);
      const line = lineOf(thVal.keyStartIdx);
      if (valuePresent(enVal)) enCount++; else missingEn.push({ key, line });
      if (valuePresent(zhVal)) zhCount++; else missingZh.push({ key, line });
    }
    // นับ en/zh เผื่อมีคีย์ที่นิยามใน en/zh แต่ไม่มีใน th (ไม่ปกติ แต่กันตกหล่นในยอดรวม)
    for (const [key, v] of inline.perLang.en) if (!inline.perLang.th.has(key) && valuePresent(v)) enCount++;
    for (const [key, v] of inline.perLang.zh) if (!inline.perLang.th.has(key) && valuePresent(v)) zhCount++;
  }

  // ── D1/D2 เตรียมข้อมูล script block ไว้ก่อน (ใช้ร่วมกับ C ด้วย) ──
  const scriptBlocks = findScriptBlocks(text);
  const scriptContentRanges = scriptBlocks.map((b) => [b.contentStart, b.contentEnd]);

  // ── C: คีย์อ้างแต่ไม่นิยาม (ข้าม <script> ที่ประกอบ string เอง + <!-- comment --> ที่พูดถึงคีย์เฉย ๆ) ──
  const commentRanges = [];
  {
    const commentRe = /<!--[\s\S]*?-->/g;
    let cm;
    while ((cm = commentRe.exec(text))) commentRanges.push([cm.index, cm.index + cm[0].length]);
  }
  const refs = collectI18nRefs(text, lineOf, scriptContentRanges.concat(commentRanges));
  const seenRefKeys = new Set();
  const undefinedKeys = [];
  for (const ref of refs) {
    if (seenRefKeys.has(ref.key)) continue;
    seenRefKeys.add(ref.key);
    if (!definedKeys.has(ref.key)) undefinedKeys.push(ref);
  }

  // ── D1/D2: ไทยหลง ──
  const blankRangesAll = findBlankableRanges(text, scriptBlocks);
  const blankedText = blankRanges(text, blankRangesAll);
  const strayHtml = findD1Stray(blankedText, lineOf);
  const strayJs = findD2Stray(text, scriptBlocks, excludedRanges, lineOf, lines);

  const totalKeys = definedKeys.size;
  const problemCount = missingEn.length + missingZh.length + undefinedKeys.length + strayHtml.length + strayJs.length;

  return {
    file: fileName,
    mechanism,
    totalKeys,
    thCount, enCount, zhCount,
    missingEn, missingZh, undefinedKeys, strayHtml, strayJs,
    problemCount,
  };
}

// ══════════════════════════════════════════════════════════════════════
// รายงานผล
// ══════════════════════════════════════════════════════════════════════
function pad(s, n) { s = String(s); return s.length >= n ? s : s + ' '.repeat(n - s.length); }
function padNum(s, n) { s = String(s); return s.length >= n ? s : ' '.repeat(n - s.length) + s; }

function printTable(results) {
  const cols = [
    ['ไฟล์', 26], ['กลไก', 15], ['คีย์', 5], ['TH', 4], ['EN', 4], ['ZH', 4],
    ['ขาดEN', 6], ['ขาดZH', 6], ['อ้างไม่นิยาม', 12], ['หลงHTML', 8], ['หลงJS', 6],
  ];
  const header = cols.map(([label, w]) => pad(label, w)).join(' | ');
  console.log(header);
  console.log('-'.repeat(header.length));
  for (const r of results) {
    const row = [
      pad(r.file, 26), pad(r.mechanism, 15), padNum(r.totalKeys, 5),
      padNum(r.thCount, 4), padNum(r.enCount, 4), padNum(r.zhCount, 4),
      padNum(r.missingEn.length, 6), padNum(r.missingZh.length, 6),
      padNum(r.undefinedKeys.length, 12), padNum(r.strayHtml.length, 8), padNum(r.strayJs.length, 6),
    ];
    console.log(row.join(' | '));
  }
  console.log('-'.repeat(header.length));
  const sum = (k) => results.reduce((a, r) => a + (typeof r[k] === 'number' ? r[k] : r[k].length), 0);
  console.log(
    `รวม ${results.length} ไฟล์ · คีย์รวม ${sum('totalKeys')} · ขาด EN ${sum('missingEn')} · ขาด ZH ${sum('missingZh')} · อ้างไม่นิยาม ${sum('undefinedKeys')} · หลง HTML ${sum('strayHtml')} · หลง JS ${sum('strayJs')}`
  );
}

function printDetails(results, limit) {
  for (const r of results) {
    if (r.problemCount === 0) continue;
    console.log(`\n=== ${r.file} (${r.mechanism}) — ปัญหา ${r.problemCount} รายการ ===`);
    const items = [];
    for (const m of r.missingEn) items.push(`[ขาด EN] L${m.line}  คีย์ "${m.key}"`);
    for (const m of r.missingZh) items.push(`[ขาด ZH] L${m.line}  คีย์ "${m.key}"`);
    for (const u of r.undefinedKeys) items.push(`[อ้างไม่นิยาม] L${u.line}  คีย์ "${u.key}"`);
    for (const h of r.strayHtml) items.push(`[หลง HTML] L${h.line}  "${h.snippet}"`);
    for (const j of r.strayJs) items.push(`[หลง JS] L${j.line}  "${j.snippet}"`);
    const shown = limit ? items.slice(0, limit) : items;
    for (const line of shown) console.log('  ' + line);
    if (limit && items.length > limit) console.log(`  ... และอีก ${items.length - limit} รายการ (ใช้ --json หรือ --page=${r.file} เพื่อดูเต็ม)`);
  }
}

// ══════════════════════════════════════════════════════════════════════
// main
// ══════════════════════════════════════════════════════════════════════
function main() {
  let fileNames = fs.readdirSync(PUBLIC_DIR).filter((f) => f.endsWith('.html') && !DEAD_PAGES.has(f)).sort();
  if (ONLY_PAGE) {
    if (!fileNames.includes(ONLY_PAGE)) {
      console.error(`ไม่พบไฟล์ ${ONLY_PAGE} ใน ${PUBLIC_DIR}`);
      process.exitCode = 1;
      return;
    }
    fileNames = [ONLY_PAGE];
  }

  const results = fileNames.map((f) => analyzeFile(path.join(PUBLIC_DIR, f), f));
  const totalProblems = results.reduce((a, r) => a + r.problemCount, 0);

  if (FLAG_JSON) {
    console.log(JSON.stringify({ page: ONLY_PAGE || null, files: results, totalProblems }, null, 2));
    process.exitCode = totalProblems > 0 ? 1 : 0;
    return;
  }

  printTable(results);
  if (!FLAG_SUMMARY) {
    const limit = ONLY_PAGE ? null : 20; // --page = รายละเอียดเต็ม, ปกติ = 20 รายการแรกต่อไฟล์
    printDetails(results, limit);
  }

  process.exitCode = totalProblems > 0 ? 1 : 0;
}

main();
