// ทดสอบ Qizheng TIMING_TIMELINE (流年ครบดวง + 流月太陽過宮 + วันชนจุดสำคัญ + บั๊กพิกัด)
// run: npx tsx scripts/test-qizheng-timeline.mjs
import { qizhengNatal, qizhengTransit } from "../src/lib/astro/qizheng/engine.ts";
import { buildQizhengTimeline } from "../src/lib/astro/qizheng/timeline.ts";
import { buildQizhengPacket } from "../src/lib/astro/qizheng/packet.ts";
import { renderQizhengPrompt } from "../src/lib/astro/qizheng/render.ts";
import { buildSciencePrompt } from "../src/lib/fusion5/build-prompt.ts";
import { tianxingReading } from "../src/lib/tianxing/index.ts";
import { bodyLon, wrap180 } from "../src/lib/astro-core/events.ts";

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.log(`❌ ${name} ${detail}`); }
};

// golden Aeaw: 1984-12-31 13:15 กรุงเทพ
const birth = { dtUTC: new Date("1984-12-31T06:15:00Z"), lat: 13.7563, lng: 100.5018 };
const TARGET = 2026;
const natal = qizhengNatal(birth.dtUTC, birth.lat, birth.lng, true);

const t0 = Date.now();
const tl = buildQizhengTimeline(natal.reading, TARGET, birth.lat, birth.lng);
console.log(`เวลาคำนวณ: ${Date.now() - t0}ms`);
ok("performance < 20s", Date.now() - t0 < 20000);

// 1) 流年ครบดวง: ≥ 11 ดวง (七政7 + 四餘4) และเรือนตรงกับคำนวณตรง
ok("流年ครบ ≥ 11 ดวง (เดิมส่งแค่ 2)", tl.liuNianStars.length >= 11, `got ${tl.liuNianStars.length}`);
const midYear = new Date(Date.UTC(2026, 5, 15, 5));
const rr = tianxingReading(midYear, birth.lat, birth.lng);
const asc = natal.reading.ascendant.sign;
let houseOk = true;
for (const s of tl.liuNianStars) {
  const real = rr.stars.find((x) => x.key === s.key);
  const h = ((real.sign - asc + 12) % 12) + 1;
  if (h !== s.house) houseOk = false;
}
ok("เรือนดาวจรตรงคำนวณตรงทุกดวง", houseOk);
ok("มี relationToMing ทุกดวง", tl.liuNianStars.every((s) => s.relationToMing));

// 2) 流月: ~12 ช่วง · ต่อเนื่อง · ขอบเดือน = อาทิตย์ย้ายราศี sidereal จริง
ok("流月 11-13 ช่วง", tl.months.length >= 11 && tl.months.length <= 13, `got ${tl.months.length}`);
let contiguous = true;
for (let i = 1; i < tl.months.length; i++) {
  if (tl.months[i].fromISO !== tl.months[i - 1].toISO) contiguous = false;
}
ok("流月ต่อเนื่องไม่มีรู", contiguous, JSON.stringify(tl.months.map((m) => m.fromISO)));
// ขอบเดือน 2-3 จุดแรก: อาทิตย์ sidereal ต้องอยู่ใกล้ขอบราศี (<0.2°)
let boundaryOk = true;
for (const m of tl.months.slice(1, 4)) {
  const d = new Date(m.fromISO + "T05:00:00Z"); // ประมาณเที่ยงไทยของวันขอบ
  const sidLon = ((bodyLon("Sun", d) - rr.ayanamsa) % 360 + 360) % 360;
  const distToBoundary = Math.min(sidLon % 30, 30 - (sidLon % 30));
  if (distToBoundary > 1.2) boundaryOk = false; // อาทิตย์เดิน ~1°/วัน · เช็คระดับวัน
}
ok("ขอบ流月 = อาทิตย์ย้ายราศี sidereal จริง (ระดับวัน)", boundaryOk);

// 3) hits: ทุกจุดต้องแม่นจริง (มุมจริงเทียบเป้า < 0.7° ระดับวัน) และอยู่ปีเป้าหมาย
ok("มี hits > 0", tl.hits.length > 0, `got ${tl.hits.length}`);
ok("hits อยู่ปี 2026 ทุกจุด", tl.hits.every((h) => h.dateISO.startsWith("2026")));
const targetLon = { "命度": natal.reading.mingDegree.lonTrop, "身度": natal.reading.shenDegree.lonTrop };
const ysStar = natal.reading.stars.find((s) => s.key === natal.reading.yongshen.key);
targetLon["命主กำเนิด"] = ysStar ? ysStar.lonTrop : null;
const KEY = { "木": "Jupiter", "土": "Saturn", "羅睺": "Rahu", "計都": "Ketu", "火": "Mars" };
let hitOk = true, hd = "";
for (const h of tl.hits) {
  const lon = bodyLon(KEY[h.starZh], new Date(h.dateISO + "T05:00:00Z"));
  const sep = Math.abs(wrap180(lon - targetLon[h.target]));
  const want = h.aspect.startsWith("ทับ") ? 0 : 180;
  const err = Math.abs(sep - want);
  if (err > 0.7) { hitOk = false; hd += `${h.starZh}${h.aspect}${h.target}@${h.dateISO} err=${err.toFixed(2)} `; }
}
ok("hits แม่นระดับวันทุกจุด", hitOk, hd);

// 4) บั๊กพิกัด: qizhengTransit รับ lat/lng แล้ว (default เดิมยังใช้ได้)
const tOld = qizhengTransit(asc, [2026]);
const tNew = qizhengTransit(asc, [2026], birth.lat, birth.lng);
ok("qizhengTransit รับพิกัดจริง (สัญญาณเดิมไม่พัง)", tOld.length === 1 && tNew.length === 1);

// 5) packet + render + เต็มสาย
const packet = buildQizhengPacket(birth.dtUTC, birth.lat, birth.lng, true, undefined, new Date("2026-07-01T00:00:00Z"));
ok("packet มี timingTimeline", !!packet.data.timingTimeline);
ok("notAvailable ไม่มี 流年全星/流月 แล้ว", !packet.notAvailable.includes("流年全星") && !packet.notAvailable.includes("流月"));
ok("notAvailable ยังแจ้ง 流日/化曜/小限 ตามจริง", packet.notAvailable.includes("流日") && packet.notAvailable.includes("化曜") && packet.notAvailable.includes("小限"));
const rendered = renderQizhengPrompt(packet);
ok("render มี TIMING_TIMELINE + 流月 + วันแม่น", rendered.includes("TIMING_TIMELINE ปี 2026") && rendered.includes("太陽過宮"));
const prompt = buildSciencePrompt("qizheng", [{ name: "เทส", dtUTC: birth.dtUTC, lat: birth.lat, lng: birth.lng, hasTime: true, gender: "M" }], "สุขภาพปี 2026 เดือนไหนต้องระวัง", "th");
ok("เต็มสาย prompt มี TIMING_TIMELINE", prompt.includes("TIMING_TIMELINE ปี 2026"));
ok("prompt ไม่เกิน 78K", prompt.length <= 78000, `${prompt.length}`);
console.log(`ขนาด prompt: ${prompt.length}`);

// 6) no-time: timeline ปิด + ธงครบ
const packetNT = buildQizhengPacket(birth.dtUTC, birth.lat, birth.lng, false, undefined, new Date("2026-07-01T00:00:00Z"));
ok("no-time: timeline = null + ธง流年全星", packetNT.data.timingTimeline === null && packetNT.notAvailable.includes("流年全星"));

// 7) determinism
const tl2 = buildQizhengTimeline(natal.reading, TARGET, birth.lat, birth.lng);
ok("deterministic", JSON.stringify(tl2) === JSON.stringify(tl));

console.log(`\nผล: ${pass} ผ่าน · ${fail} ไม่ผ่าน`);
process.exit(fail ? 1 : 0);
