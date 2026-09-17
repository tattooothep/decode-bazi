import assert from "node:assert/strict";
import { createRequire } from "node:module";
const lib = createRequire(import.meta.url)("../src/lib/mobile-astronomy-interpret-r8.cjs");

let checks = 0;
function check(value: unknown, message: string) { assert.ok(value, message); checks += 1; }

const facts = {
  localBoundary: "2026-09-18T08:00:00+07:00", timezone: "Asia/Bangkok", frame: "geocentric",
  physicalBodies: [
    { key: "Sun", longitudeTropicalDeg: 175.4, retrograde: false },
    { key: "Moon", longitudeTropicalDeg: 262.9, retrograde: false, illuminatedFraction: 0.41 },
    { key: "Saturn", longitudeTropicalDeg: 2.1, retrograde: true },
  ],
  points: [{ key: "Rahu", definition: "mean_ascending_lunar_node", longitudeTropicalDeg: 328.4 }],
  prediction: false, judgment: null,
};
const natal = { bodies: [{ key: "Sun", lon: 264.0 }, { key: "Venus", lon: 100.0 }] };

// เรขาคณิต: ราศี + มุมดาวจร-ดาวกำเนิด
check(lib.signOf(262.9).th === "ธนู" && lib.signOf(2.1).en === "Aries", "sign lookup from tropical longitude");
const hits = lib.transitHits(facts, natal);
const moonHit = hits.find((h: { transit: string; natal: string }) => h.transit === "Moon" && h.natal === "Sun");
check(moonHit !== undefined && moonHit.aspect.startsWith("ทับ") && moonHit.orb <= 3, "moon conjunct natal sun within orb detected");
check(hits.every((h: { orb: number }) => h.orb <= 3), "every hit stays inside the 3-degree orb");
const prompt = lib.buildInterpretPrompt({ facts, natal, dailyTone: { verdict: "วันเก็บงาน" }, profileName: "ไนท์" });
check(prompt.includes("ธนู") && prompt.includes("Saturn") && prompt.includes("วันเก็บงาน") && prompt.includes("ห้ามตัดสินว่ายามนี้"), "prompt carries sky table, tone anchor and the no-election rule");

// validator
const entry = (tag: string) => tag === "th" ? {
  title: "จันทร์ทับดาวเกิด", body: "ยามนี้อารมณ์นิ่ง เหมาะคุยงานละเอียด",
  meaning: "บนฟ้าจันทร์อยู่ราศีธนู ทับอาทิตย์กำเนิดของคุณ แปลว่าใจนิ่ง คิดชัด",
  doList: ["คุยงานละเอียด"], avoidList: ["ตัดสินใจเรื่องเงินก้อน"],
} : tag === "zh" ? {
  title: "月亮合本命太陽", body: "此刻情緒平穩，適合細談工作",
  meaning: "天上的月亮在射手座，與你本命太陽相合，代表心境安定、思路清晰",
  doList: ["細談工作"], avoidList: ["決定大筆金錢"],
} : {
  title: "Moon on your natal Sun", body: "A calm, steady mood; good for detailed work talks",
  meaning: "The Moon sits in Sagittarius on your natal Sun, which reads as a settled mind and clear thinking",
  doList: ["Talk through detailed work"], avoidList: ["Big money decisions"],
};
const good = { th: entry("th"), en: entry("en"), zh: entry("zh") };
check(lib.validateInterpretation(good) !== null, "valid interpretation accepted");
check(lib.validateInterpretation("ครับ\n```json\n" + JSON.stringify(good) + "\n```") !== null, "fenced JSON extracted");
for (const bad of [
  { ...good, zh: undefined },
  { ...good, th: { ...good.th, title: "x".repeat(61) } },
  { ...good, th: { ...good.th, body: "" } },
  { ...good, th: { ...good.th, doList: [] } },
  { ...good, th: { ...good.th, avoidList: ["a", "b", "c", "d"] } },
]) check(lib.validateInterpretation(bad) === null, "broken interpretation rejected");

const gen = await lib.generateAstronomyInterpretation({ facts, natal, dailyTone: null, profileName: "x" }, { invoke: async () => JSON.stringify(good), model: "mock" });
check(gen.locales.th.title.includes("จันทร์") && gen.locales.zh.title.includes("月亮") && /^[a-f0-9]{64}$/.test(gen.factsDigest) && gen.model === "mock", "generate returns validated locales + digest");
await assert.rejects(() => lib.generateAstronomyInterpretation({ facts, natal }, { invoke: async () => "ไม่ใช่ json" }), /astronomy_interpretation_invalid/); checks += 1;

// รอบตรวจ 18 ก.ย.: zh/en ห้ามไทย · อักขระควบคุมถูกยุบ · คำต้องห้าม · งบเวลารวม · ตาราง SKY มีชื่อจีน · clamp 29.9 · เรียง orb
check(lib.validateInterpretation({ ...good, zh: { ...good.zh, title: "ราศีธนู 月亮" } }) === null, "zh with Thai characters rejected");
check(lib.validateInterpretation({ ...good, en: { ...good.en, body: "Moon in ธนู" } }) === null, "en with Thai characters rejected");
const ctl = lib.validateInterpretation({ ...good, th: { ...good.th, body: "บรรทัดหนึ่ง\nบรรทัดสอง\u0000ท้าย" } });
check(ctl !== null && ctl.th.body === "บรรทัดหนึ่ง บรรทัดสอง ท้าย", "control chars and newlines collapse to single spaces");
check(lib.validateInterpretation({ ...good, th: { ...good.th, body: "ยามนี้ฤกษ์ดีมาก" } }) === null, "hourly-election verdict word rejected");
check(lib.validateInterpretation({ ...good, zh: { ...good.zh, meaning: "今天是吉時" } }) === null, "zh election word rejected");
await assert.rejects(() => lib.generateAstronomyInterpretation({ facts, natal }, { invoke: () => new Promise(() => {}), totalTimeoutMs: 50 }), /astronomy_interpretation_timeout/); checks += 1;
check(prompt.includes("射手") && prompt.includes("月亮") && prompt.includes("ห้ามมีอักษรไทย"), "prompt carries zh names and the no-Thai rule");
check(lib.signOf(29.99).deg === 29.9 && lib.signOf(29.99).th === "เมษ" && lib.signOf(30).deg === 0, "degree within sign is clamped below 30");
const manyNatal = { bodies: Array.from({ length: 15 }, (_, i) => ({ key: `N${i}`, lon: 175.4 + (i === 14 ? 0 : 2.9) })) };
const capped = lib.transitHits(facts, manyNatal);
check(capped.length === 12 && capped[0].orb === 0, "cap keeps the tightest aspects first");

console.log(`PASS astronomy-interpret-r8: ${checks} checks (mock only; no AI, no DB).`);
