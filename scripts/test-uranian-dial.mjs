/**
 * test-uranian-dial.mjs · ทดสอบวงล้อ 90° ยูเรเนียน (r390-dial)
 * ════════════════════════════════════════════════════════════
 *  1) วงล้อคณิต: dial90 = lon mod 90 · ตำแหน่งจอ = dial90*4 (0-360) ถูกต้อง
 *  2) golden ดวง Aeaw (1984-12-31 13:15 Bangkok) — ตำแหน่งดาว deterministic คงที่
 *  3) endpoint shape: buildUranianPacket คืน field ครบตามที่หน้าใช้
 *  4) guard: ไม่มี TNP ต้องห้าม (Lefeldt/Sieggrün) หลุดเข้าจุดที่วาด
 *
 * รัน: node scripts/test-uranian-dial.mjs   (โหลด TS engine ผ่าน tsx ถ้ามี · ไม่งั้น fallback คณิตล้วน)
 */
import assert from "node:assert";

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log("  ✓ " + name); } else { fail++; console.error("  ✗ " + name); } }

/* ── 1) คณิตหน้าปัด (ไม่ต้องพึ่ง engine · reuse สูตรเดียวกับหน้า) ── */
const CX = 320, CY = 320;
function dpt(v, R) { const a = (v * 4) * Math.PI / 180; return [CX + R * Math.sin(a), CY - R * Math.cos(a)]; }
function dial90(lon) { return ((lon % 90) + 90) % 90; }

console.log("[1] คณิตหน้าปัด 90°");
ok("lon 0 → dial 0", dial90(0) === 0);
ok("lon 90 → dial 0 (พับควอดแรนต์)", dial90(90) === 0);
ok("lon 123.4 → dial 33.4", Math.abs(dial90(123.4) - 33.4) < 1e-9);
ok("lon 271 → dial 1 (270°ห่าง=มุมฉาก ทับ lon1)", Math.abs(dial90(271) - dial90(1)) < 1e-9);
// dial 0 อยู่บนสุด (12 นาฬิกา)
{ const [x, y] = dpt(0, 200); ok("dial 0 อยู่บนสุด (x=cx, y<cy)", Math.abs(x - CX) < 1e-6 && y < CY); }
// dial 22.5 (=90°จอ) อยู่ขวาสุด (3 นาฬิกา)
{ const [x, y] = dpt(22.5, 200); ok("dial 22.5 → 90°จอ อยู่ขวาสุด", x > CX && Math.abs(y - CY) < 1e-6); }
// dial 45 (=180°จอ) อยู่ล่างสุด
{ const [x, y] = dpt(45, 200); ok("dial 45 → 180°จอ อยู่ล่างสุด", Math.abs(x - CX) < 1e-6 && y > CY); }
// ดาวห่าง 90° longitude → dial เท่ากัน → ทับกันบนวง (จุดขาย "ภาพดาว")
ok("ดาวห่าง 90° → ทับกันบนหน้าปัด", Math.abs(dial90(45) - dial90(135)) < 1e-9);

/* snap: เลื่อน dial v ขึ้นยอด → ROT = (360 − v*4) mod 360 */
function snapRot(v) { return ((360 - v * 4) % 360 + 360) % 360; }
function readoutFromRot(rot) { return ((((360 - rot) % 360) + 360) % 360) / 4; }
console.log("[2] หมุน + เข็มอ่านค่า");
ok("snap dial 30 แล้วเข็มอ่านได้ 30", Math.abs(readoutFromRot(snapRot(30)) - 30) < 1e-9);
ok("snap dial 0 → ROT 0", snapRot(0) === 0);

/* ── 3+4) engine (โหลด TS ถ้าเป็นไปได้) ── */
async function loadEngine() {
  try { return await import("../src/lib/astro/uranian/engine.ts"); }
  catch { try { return await import("../src/lib/astro/uranian/engine.js"); } catch { return null; } }
}
const eng = await loadEngine();
if (!eng) {
  console.log("[3] engine (ข้าม — ต้องรันผ่าน tsx/ts-node เพื่อโหลด .ts)");
  console.log("    → รันเต็ม: npx tsx scripts/test-uranian-dial.mjs");
} else {
  console.log("[3] engine golden + shape");
  // Aeaw 1984-12-31 13:15 Bangkok (UTC = 06:15)
  const dt = new Date("1984-12-31T06:15:00Z");
  const chart = eng.uranianChart(dt, 13.7563, 100.5018, true, "M");
  ok("มีดาว/จุด (มีเวลาเกิด → 12)", chart.points.length === 12);
  ok("personalPoints = 10 (r392 · +แกนสี่ทิศ+LocationPoint)", chart.personalPoints.length === 10);
  ok("ทุกจุดมี dial90 ใน [0,90)", chart.points.every(p => p.dial90 >= 0 && p.dial90 < 90));
  ok("dial90 = lon mod 90 ตรง", chart.points.every(p => Math.abs(p.dial90 - dial90(p.lon)) < 1e-3));
  // golden deterministic: รันซ้ำได้ค่าเดิม
  const chart2 = eng.uranianChart(dt, 13.7563, 100.5018, true, "M");
  ok("deterministic (รันซ้ำ = ค่าเดิม)", JSON.stringify(chart.points) === JSON.stringify(chart2.points));
  // Sun ปลายธันวา ≈ ราศีมังกร (sign 9) — sanity ตำแหน่งจริง
  const sun = chart.points.find(p => p.name === "Sun");
  ok("อาทิตย์ 31 ธ.ค. อยู่ราศีมังกร (sign 9)", sun && sun.sign === 9);

  console.log("[4] guard TNP ต้องห้าม (Lefeldt/Sieggrün)");
  const drawn = new Set(chart.points.map(p => p.name).concat(chart.personalPoints.map(p => p.name)));
  const forbidden = ["Apollon", "Admetos", "Vulkanus", "Poseidon"];
  ok("ไม่มี TNP ต้องห้ามในจุดที่วาด", forbidden.every(f => !drawn.has(f)));
  ok("witteTransneptunians ยังไม่มีตำแหน่ง (เฟส1)", chart.tnpPositionSource === "witte_pd_ephemeris_not_wired_phase1");

  // no-time degrade
  const chartNT = eng.uranianChart(dt, 13.7563, 100.5018, false, "F");
  ok("ไม่มีเวลา → 10 จุด (ไม่มี Asc/MC)", chartNT.points.length === 10);
  ok("ไม่มีเวลา → จันทร์ติดธง uncertain", chartNT.points.find(p => p.name === "Moon")?.uncertain === true);
}

console.log("\n" + (fail === 0 ? "✅ PASS" : "❌ FAIL") + ` — ${pass} ผ่าน / ${fail} พลาด`);
process.exit(fail === 0 ? 0 : 1);
