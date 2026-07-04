/**
 * ทดสอบ ภาพพื้นดวงสะอาด 3 ศาสตร์ (chart-svg-wheel) — ดวงเอี๊ยว
 *   1984-12-31 13:15 กรุงเทพฯ (UTC+7) → dtUTC 1984-12-31T06:15:00Z · lat 13.75 lng 100.5018
 * รัน: npx tsx scripts/test-chart-svg-wheel.mjs
 *
 * ตรวจ: (1) คืน SVG valid  (2) deterministic (รัน 2 รอบ = เท่ากันเป๊ะ)
 *       (3) พื้นโปร่ง/ไม่มี <script>  (4) มีดาว/ราศีจริง
 */
import { westernChartSvg, qizhengChartSvg, uranianChartSvg } from "../src/lib/book/chart-svg-wheel.ts";

const birth = {
  dtUTC: new Date("1984-12-31T06:15:00Z"),
  lat: 13.75,
  lng: 100.5018,
  hasTime: true,
  gender: "F",
};

const cases = [
  ["ตะวันตก (Western tropical)", westernChartSvg],
  ["七政四餘 (Qizheng sidereal)", qizhengChartSvg],
  ["ยูเรเนียน (Uranian dial 90°)", uranianChartSvg],
];

let pass = 0, fail = 0;
const check = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log("   ✗ FAIL:", msg); } };

for (const [label, fn] of cases) {
  console.log("════════════════════════════════════════════════════════");
  console.log(" " + label);
  console.log("════════════════════════════════════════════════════════");
  const a = fn(birth);
  const b = fn(birth);

  check(typeof a === "string" && a.length > 0, "คืน string ไม่ว่าง");
  check(a.startsWith("<svg") && a.trimEnd().endsWith("</svg>"), "ห่อด้วย <svg>…</svg>");
  check(a.includes('viewBox="0 0 600 600"'), "viewBox จัตุรัส 600×600");
  check(!a.includes("<script"), "ไม่มี <script>");
  check(!a.includes("http://") || a.includes('xmlns="http://www.w3.org/2000/svg"'),
    "ไม่มี external asset (มีแค่ xmlns namespace)");
  check(a === b, "deterministic (รัน 2 รอบเท่ากันเป๊ะ)");
  check((a.match(/<circle/g) || []).length >= 5, "มีวงกลม/โหนดดาว");
  check((a.match(/<text/g) || []).length >= 10, "มีป้ายราศี/ดาว");

  // นับโหนดดาว (role=listitem)
  const nodes = (a.match(/role="listitem"/g) || []).length;
  console.log("   จำนวนโหนดดาว/จุด:", nodes);
  console.log("   ขนาด SVG:", a.length, "bytes");

  // ตัวอย่าง output ย่อ (หัว + ท้าย)
  console.log("   ── ตัวอย่างย่อ (head) ──");
  console.log("   " + a.slice(0, 220).replace(/\n/g, " "));
  console.log("   … [ตัด] …");
  // ป้ายราศี/ดาวตัวแรก ๆ ที่พบ
  const glyphHits = (a.match(/>([☉☽☿♀♂♃♄♅♆♇☊☋日月水金火木土羅計孛紫♈-♓])</g) || [])
    .slice(0, 14).map((x) => x.slice(1, -1)).join(" ");
  console.log("   สัญลักษณ์ที่วาด:", glyphHits);
  console.log("");
}

console.log("════════════════════════════════════════════════════════");
console.log(` ผลรวม: ผ่าน ${pass} · ตก ${fail}`);
console.log("════════════════════════════════════════════════════════");
process.exit(fail === 0 ? 0 : 1);
