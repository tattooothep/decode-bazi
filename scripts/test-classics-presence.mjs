/**
 * test-classics-presence (Gap 1 · 29 พ.ค. · เพิ่ม 神峰通考 30 พ.ค.)
 * พิสูจน์ว่าตำรา 三命通會 + 淵海子平 + 神峰通考 ถูกโหลดเข้า prompt sifu ครบ
 *
 * รัน: node scripts/test-classics-presence.mjs
 *
 * 5 จุดที่ assert:
 *   1. smtg-clean.md มีอยู่ + ขนาด > 50KB + มี keyword 神煞/納音
 *   2. yhzp-clean.md มีอยู่ + ขนาด > 50KB + มี keyword 五干通變(=傷官~金神)/喜忌
 *   3. sftk-clean.md มีอยู่ + ขนาด > 30KB + มี keyword 病藥/動靜/合婚/蓋頭 (神峰通考 verbatim)
 *   4. /api/sifu/route.ts ลงทะเบียน smtg + yhzp + sftk ใน SIFU_EXTRA_FILES
 *   5. /api/sifu/group/route.ts ลงทะเบียน smtg + yhzp + sftk ใน SIFU_EXTRA_FILES
 *
 * เกณฑ์: ต้องผ่าน 5/5
 */
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SIFU_EXTRA = join(ROOT, "data/library/sifu-extra");
let pass = 0, fail = 0;
function t(label, ok, detail = "") {
  console.log(`  ${ok ? "✅" : "❌"} ${label}${detail ? " · " + detail : ""}`);
  ok ? pass++ : fail++;
}

/* 1. 三命通會 (smtg) */
{
  const path = join(SIFU_EXTRA, "smtg-clean.md");
  let size = 0, text = "";
  try {
    size = statSync(path).size;
    text = readFileSync(path, "utf8");
  } catch (e) {
    /* will fail below */
  }
  const exists = size > 0;
  const big = size > 50 * 1024;
  const hasShensha = /神煞/.test(text);
  const hasNayin = /(納音|纳音)/.test(text);
  t(
    "smtg-clean.md present + >50KB + 神煞/納音 keywords",
    exists && big && hasShensha && hasNayin,
    `size=${size} 神煞=${hasShensha} 納音=${hasNayin}`,
  );
}

/* 2. 淵海子平 (yhzp) */
{
  const path = join(SIFU_EXTRA, "yhzp-clean.md");
  let size = 0, text = "";
  try {
    size = statSync(path).size;
    text = readFileSync(path, "utf8");
  } catch (e) {
    /* will fail below */
  }
  const exists = size > 0;
  const big = size > 50 * 1024;
  /* 五干通變 = บท 论傷官 → 论金神 (10干通変) */
  const hasWuganTongbian = /(五干通變|五干通变|论傷官|论伤官|论金神)/.test(text);
  const hasXiji = /喜忌/.test(text);
  t(
    "yhzp-clean.md present + >50KB + 五干通變/喜忌 keywords",
    exists && big && hasWuganTongbian && hasXiji,
    `size=${size} 五干通變=${hasWuganTongbian} 喜忌=${hasXiji}`,
  );
}

/* 3. 神峰通考 (sftk · 病藥論 ต้นทาง BY-08) */
{
  const path = join(SIFU_EXTRA, "sftk-clean.md");
  let size = 0, text = "";
  try {
    size = statSync(path).size;
    text = readFileSync(path, "utf8");
  } catch (e) {
    /* will fail below */
  }
  const exists = size > 0;
  const big = size > 30 * 1024;
  /* 病藥論 + 動靜説 + 男女合婚説 + 蓋頭説 (รับทั้งตัวเต็ม/ตัวย่อ) */
  const hasBingyao = /(病藥|病药)/.test(text);
  const hasDongjing = /(動靜|动静)/.test(text);
  const hasHehun = /合婚/.test(text);
  const hasGaitou = /(蓋頭|盖头)/.test(text);
  t(
    "sftk-clean.md present + >30KB + 病藥/動靜/合婚/蓋頭 keywords",
    exists && big && hasBingyao && hasDongjing && hasHehun && hasGaitou,
    `size=${size} 病藥=${hasBingyao} 動靜=${hasDongjing} 合婚=${hasHehun} 蓋頭=${hasGaitou}`,
  );
}

/* 4. /api/sifu/route.ts ลงทะเบียน */
{
  const path = join(ROOT, "src/app/api/sifu/route.ts");
  const text = readFileSync(path, "utf8");
  const hasSmtg = /smtg-clean\.md/.test(text);
  const hasYhzp = /yhzp-clean\.md/.test(text);
  const hasSftk = /sftk-clean\.md/.test(text);
  t(
    "src/app/api/sifu/route.ts registered smtg+yhzp+sftk",
    hasSmtg && hasYhzp && hasSftk,
    `smtg=${hasSmtg} yhzp=${hasYhzp} sftk=${hasSftk}`,
  );
}

/* 5. /api/sifu/group/route.ts ลงทะเบียน */
{
  const path = join(ROOT, "src/app/api/sifu/group/route.ts");
  const text = readFileSync(path, "utf8");
  const hasSmtg = /smtg-clean\.md/.test(text);
  const hasYhzp = /yhzp-clean\.md/.test(text);
  const hasSftk = /sftk-clean\.md/.test(text);
  t(
    "src/app/api/sifu/group/route.ts registered smtg+yhzp+sftk",
    hasSmtg && hasYhzp && hasSftk,
    `smtg=${hasSmtg} yhzp=${hasYhzp} sftk=${hasSftk}`,
  );
}

console.log(`\n[classics-presence] ${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
