/**
 * เทสหน้ารับเชิญบนเว็บ (referral.html โหมด ?invite=CODE) · 24 ก.ค. เวฟ 4
 * รันด้วย: npx tsx scripts/test-invite-web-page.mts
 *
 * ตรวจว่า:
 *   - บล็อกรับเชิญมีจริงในหน้า และซ่อนไว้จนกว่าจะมีโค้ด (หน้า affiliate เดิมไม่กระทบ)
 *   - 3 ภาษาครบ th/en/zh (+cn) ทุกคีย์ · zh/cn ห้ามมีอักษรไทยแม้ตัวเดียว
 *   - ไม่ยิง /api/affiliate ตอนอยู่โหมดรับเชิญ
 *   - ต้องมีช่องยินยอมก่อนส่งวันเกิด
 *   - สคริปต์ทั้งหน้า parse ผ่าน (กันพิมพ์ผิดแล้วหน้าขาว)
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const html = readFileSync(`${root}public/referral.html`, "utf8");
const THAI = /[฀-๿]/;
let passed = 0;
function ok(label: string) { passed += 1; console.log(`  ✅ ${label}`); }

/* ── โครงหน้า ─────────────────────────────────────────────── */
{
  assert.ok(html.includes('id="ivWrap"'), "ต้องมีบล็อกรับเชิญ");
  assert.match(html, /<section class="wrap" id="ivWrap" hidden>/, "บล็อกรับเชิญต้องซ่อนไว้ก่อน");
  ok("มีบล็อกรับเชิญ และซ่อนไว้จนกว่าจะมีโค้ด");

  for (const id of ["ivName", "ivDate", "ivTime", "ivGender", "ivPlace", "ivTz", "ivConsent", "ivSubmit", "ivPillars", "ivProfile", "ivClaim"]) {
    assert.ok(html.includes(`id="${id}"`), `ขาดช่อง ${id}`);
  }
  ok("ช่องกรอกวันเกิด + ปุ่ม + ที่แสดงดวง ครบ");

  assert.ok(html.includes('id="ivConsent" type="checkbox"'), "ต้องมีช่องกดยินยอม");
  assert.ok(/if\(!E\('ivConsent'\)\.checked\)\{st\.lastError='consent_required'/.test(html), "ต้องบล็อกตอนยังไม่กดยินยอม");
  ok("ต้องกดยินยอมก่อนส่งวันเกิด (บล็อกฝั่งหน้าเว็บด้วย)");

  assert.ok(html.includes("window.__HK_INVITE_MODE__=true"), "ต้องตั้งธงโหมดรับเชิญ");
  assert.ok(html.includes("if(!window.__HK_INVITE_MODE__)load()"), "โหมดรับเชิญต้องไม่ยิง /api/affiliate");
  ok("โหมดรับเชิญไม่ไปยุ่งกับคอนโซล affiliate เดิม");

  assert.ok(html.includes("/api/invite/'+encodeURIComponent(code)"), "ต้องเรียกเส้นตรวจโค้ด");
  assert.ok(html.includes("action:'claim'"), "ต้องมีปุ่มรับยามของเพื่อน");
  ok("ต่อเส้น /api/invite ครบ (ตรวจโค้ด · ยืนยันวันเกิด · รับยาม)");

  // หน้าเดิมต้องไม่ถูกรื้อ
  assert.ok(html.includes("Affiliate Console"), "คอนโซล affiliate เดิมต้องยังอยู่");
  assert.ok(html.includes("/api/affiliate"), "เส้น affiliate เดิมต้องยังอยู่");
  ok("ของเดิมบนหน้า referral ยังอยู่ครบ (เพิ่มอย่างเดียว)");
}

/* ── สคริปต์ทั้งหน้า parse ผ่าน ─────────────────────────────── */
{
  const blocks = html.match(/<script>[\s\S]*?<\/script>/g) || [];
  assert.ok(blocks.length >= 2, `ต้องมีสคริปต์อย่างน้อย 2 ก้อน แต่มี ${blocks.length}`);
  for (const b of blocks) {
    const body = b.replace(/^<script>/, "").replace(/<\/script>$/, "");
    assert.doesNotThrow(() => new Function(body), "สคริปต์ในหน้าต้อง parse ผ่าน");
  }
  ok(`สคริปต์ในหน้า ${blocks.length} ก้อน parse ผ่านหมด`);
}

/* ── 3 ภาษา ครบ + zh สะอาด ─────────────────────────────────── */
{
  // ดึงก้อน IV={...} ออกมาแล้วประเมินจริง (ไม่ใช่เดาด้วย regex)
  const start = html.indexOf("  var IV={");
  assert.ok(start > 0, "หาก้อนภาษา IV ไม่เจอ");
  const tail = html.slice(start);
  const endMark = "\n  };\n";
  const end = tail.indexOf(endMark);
  assert.ok(end > 0, "หาปลายก้อนภาษา IV ไม่เจอ");
  const src = tail.slice(0, end + endMark.length).replace(/^\s*var IV=/, "return ");
  const IV = new Function(src)() as Record<string, Record<string, unknown>>;

  const langs = ["th", "en", "zh", "cn"];
  for (const l of langs) assert.ok(IV[l], `ขาดภาษา ${l}`);
  ok(`มีภาษาครบ ${langs.join(" / ")}`);

  const thKeys = Object.keys(IV.th).sort();
  for (const l of langs) {
    const keys = Object.keys(IV[l]).sort();
    assert.deepEqual(keys, thKeys, `คีย์ภาษา ${l} ไม่ตรงกับ th`);
  }
  ok(`คีย์ครบเท่ากันทุกภาษา (${thKeys.length} คีย์)`);

  // ทุกคีย์ต้องมีค่าจริง ไม่ว่าง
  for (const l of langs) {
    for (const k of thKeys) {
      const v = IV[l][k];
      if (typeof v === "string") assert.ok(v.trim().length > 0, `${l}.${k} ว่าง`);
      else if (Array.isArray(v)) assert.ok(v.length > 0, `${l}.${k} ว่าง`);
      else if (typeof v === "object" && v) assert.ok(Object.keys(v).length > 0, `${l}.${k} ว่าง`);
      else assert.equal(typeof v, "function", `${l}.${k} ชนิดไม่ถูก`);
    }
  }
  ok("ทุกคีย์ทุกภาษามีค่าจริง ไม่มีช่องว่าง");

  // zh/cn ห้ามมีอักษรไทยแม้ตัวเดียว (กฎเจ้านาย: zh ห้ามไทยปนเด็ดขาด)
  function walk(node: unknown, path: string, lang: string) {
    if (typeof node === "string") {
      assert.ok(!THAI.test(node), `${lang}.${path} มีอักษรไทยปน: ${node}`);
    } else if (typeof node === "function") {
      const out = String((node as (...a: unknown[]) => string)(3, 3));
      assert.ok(!THAI.test(out), `${lang}.${path}() คืนค่ามีอักษรไทยปน: ${out}`);
    } else if (Array.isArray(node)) {
      node.forEach((n, i) => walk(n, `${path}[${i}]`, lang));
    } else if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`, lang);
    }
  }
  for (const l of ["zh", "cn", "en"]) for (const k of thKeys) walk(IV[l][k], k, l);
  ok("zh / cn / en ไม่มีอักษรไทยปนแม้ตัวเดียว (รวมข้อความที่ประกอบจากฟังก์ชัน)");

  // ภาษาอื่นต้องตกไป en ไม่ใช่ th
  assert.ok(html.includes("function dict(l){return IV[l]||IV.en}"), "ภาษาที่ไม่มีต้องตกไป en");
  ok("ภาษาที่ยังไม่แปล ตกไป en (ไม่ปล่อยไทยไปหน้าต่างชาติ)");

  // ถ้าไม่มีคำแปลของผลดวง ต้องไม่เอาไทยไปแปะ
  assert.ok(html.includes("if(!tr)return null;"), "ไม่มีคำแปลผลดวง = ไม่แสดง ดีกว่าเอาไทยไปแปะ");
  ok("ผลดวงในภาษาอื่น ถ้าไม่มีคำแปลจะไม่แสดง (ไม่ตกเป็นไทย)");
}

/* ── ธีมสว่าง/มืด ─────────────────────────────────────────── */
{
  assert.ok(html.includes('[data-theme="light"]'), "ต้องรองรับธีมสว่าง");
  // บล็อกรับเชิญต้องใช้ตัวแปรสีของธีม ไม่ hardcode สี
  const css = html.slice(html.indexOf(".iv-grid{"), html.indexOf(".iv-profile .iv-blk p"));
  assert.ok(css.includes("var(--line)") && css.includes("var(--bg)") && css.includes("var(--fg)"), "ต้องใช้ตัวแปรสีของธีม");
  assert.ok(!/#[0-9a-fA-F]{6}/.test(css), "ห้าม hardcode สีในบล็อกรับเชิญ (ธีมสว่างจะพัง)");
  ok("บล็อกรับเชิญใช้ตัวแปรสีของธีม ทำงานทั้งสว่างและมืด");
}

console.log(`\n[invite web page] ${passed}/${passed} passed`);
