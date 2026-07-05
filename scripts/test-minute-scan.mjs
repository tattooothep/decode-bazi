/**
 * test-minute-scan.mjs · e2e test สำหรับ /api/tianxing/minute-scan + ผังฉีเหมิน 8 ทิศ
 * รันกับ dev/prod server: BASE=http://127.0.0.1:3390 node scripts/test-minute-scan.mjs
 * ตรวจ: (1) สแกนวันจริงคืน top นาที (2) deterministic (สแกน 3 รอบ ผลตรง)
 *       (3) ผังฉีเหมินต่อนาทีถูก (เทียบ /api/qimen · 9 宮 + ประตูจัดคลาสได้) (4) degrade bad input
 */
const BASE = process.env.BASE || "http://127.0.0.1:3390";
const BKK = { lat: 13.7563, lng: 100.5018 };
const DATE = process.argv[2] || "2026-07-05";
const GOOD = { "開門": 1, "休門": 1, "生門": 1 }, NEU = { "景門": 1 };
const doorClass = (z) => (GOOD[z] ? "good" : NEU[z] ? "" : "bad");
let fails = 0;
const ok = (c, m) => { console.log((c ? "  PASS " : "  FAIL ") + m); if (!c) fails++; };

async function scan(body) {
  const r = await fetch(`${BASE}/api/tianxing/minute-scan`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  return { status: r.status, json: await r.json().catch(() => null) };
}
async function qimen(date, time, lat, lng) {
  const u = `${BASE}/api/qimen?system_type=hour&school=chaibu&date=${date}&time=${time}&lat=${lat}&lng=${lng}`;
  const r = await fetch(u, { headers: { Accept: "application/json" } });
  return r.ok ? r.json() : null;
}

(async () => {
  console.log("=== TEST 1: สแกนวันจริง (กทม " + DATE + ") ===");
  const s1 = await scan({ date: DATE, ...BKK });
  ok(s1.status === 200 && s1.json && s1.json.ok, "endpoint 200 + ok");
  ok(s1.json && s1.json.scanned >= 90, "สแกน >= 90 จุด (ได้ " + (s1.json && s1.json.scanned) + ")");
  ok(Array.isArray(s1.json.top) && s1.json.top.length >= 1, "คืน top อย่างน้อย 1 นาที");
  const ranks = (s1.json.top || []).map((t) => t.rank).sort();
  ok(JSON.stringify(ranks) === JSON.stringify([1, 2, 3]) || ranks.length < 3, "rank 1/2/3 ครบ");
  // rank ต้องเรียงตามคะแนน (🥇 = แรงสุด)
  const byRank = [...s1.json.top].sort((a, b) => a.rank - b.rank).map((t) => t.score);
  ok(byRank.every((v, i) => i === 0 || byRank[i - 1] >= v), "medal rank ยึดคะแนน (🥇 แรงสุด)");
  s1.json.top.forEach((t) =>
    console.log(`    #${t.rank} ${t.time} score=${t.score} ${t.level} · ลัคนา ${t.ascSignTh} ${t.ascDeg}° · 用神 ${t.yongKey} ${t.yongStatus}${t.atBorder ? " ⚠ขอบราศี" : ""}`));

  console.log("=== TEST 2: deterministic (สแกน 3 รอบ ผลต้องตรง) ===");
  const sig = (j) => JSON.stringify((j.top || []).map((t) => [t.time, t.score, t.rank, t.yongKey]));
  const a = await scan({ date: DATE, ...BKK }), b = await scan({ date: DATE, ...BKK });
  ok(sig(s1.json) === sig(a.json) && sig(a.json) === sig(b.json), "3 รอบผลตรงกันเป๊ะ");
  ok(a.json.cached === true, "รอบ 2 มาจาก cache");

  console.log("=== TEST 3: ผังฉีเหมิน 8 ทิศต่อนาที (เทียบ /api/qimen) ===");
  for (const t of s1.json.top) {
    const q = await qimen(DATE, t.time, BKK.lat, BKK.lng);
    const pal = q && q.data && q.data.palaces;
    if (!pal) { ok(false, t.time + " · qimen ไม่พร้อม (degrade → UI ซ่อนผัง)"); continue; }
    const dirs = new Set(pal.map((p) => p.direction));
    const has8 = ["N", "S", "E", "W", "NE", "NW", "SE", "SW"].every((d) => dirs.has(d));
    const green = pal.filter((p) => p.direction !== "C" && doorClass(p.door_zh) === "good").map((p) => p.direction);
    const red = pal.filter((p) => p.direction !== "C" && doorClass(p.door_zh) === "bad").map((p) => p.direction);
    ok(pal.length === 9 && has8 && dirs.has("C"), t.time + " · ผังครบ 9 宮 + 8 ทิศ + 中宮");
    console.log(`    ${t.time}: เขียว(ไปได้) [${green.join(",") || "—"}] · แดง(เลี่ยง) [${red.join(",") || "—"}]`);
  }

  console.log("=== TEST 4: degrade bad input ===");
  const bad = await scan({ date: "not-a-date", ...BKK });
  ok(bad.status === 400, "date ผิด → 400 (ไม่พัง)");
  const bad2 = await scan({ date: DATE, lat: 999, lng: 0 });
  ok(bad2.status === 400, "lat นอกช่วง → 400");

  console.log("\n" + (fails === 0 ? "✅ ALL PASS" : "❌ " + fails + " FAILED"));
  process.exit(fails === 0 ? 0 : 1);
})().catch((e) => { console.error("test crashed:", e); process.exit(2); });
