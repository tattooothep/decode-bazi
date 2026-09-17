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
const entry = (tag: string) => ({
  title: `จันทร์ทับดาวเกิด ${tag}`, body: `ยามนี้อารมณ์นิ่ง เหมาะคุยงานละเอียด ${tag}`,
  meaning: `บนฟ้าจันทร์อยู่ราศีธนู ทับอาทิตย์กำเนิดของคุณ แปลว่าใจนิ่ง คิดชัด ${tag}`,
  doList: ["คุยงานละเอียด"], avoidList: ["ตัดสินใจเรื่องเงินก้อน"],
});
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
check(gen.locales.th.title.includes("จันทร์") && /^[a-f0-9]{64}$/.test(gen.factsDigest) && gen.model === "mock", "generate returns validated locales + digest");
await assert.rejects(() => lib.generateAstronomyInterpretation({ facts, natal }, { invoke: async () => "ไม่ใช่ json" }), /astronomy_interpretation_invalid/); checks += 1;

console.log(`PASS astronomy-interpret-r8: ${checks} checks (mock only; no AI, no DB).`);
