import assert from "node:assert/strict";
import { createRequire } from "node:module";
const summaryLib = createRequire(import.meta.url)("../src/lib/daily-ai-summary.cjs");

let checks = 0;
function check(value: unknown, description: string) { assert.ok(value, description); checks += 1; }

const facts = {
  date: "2026-09-07", timezone: "Asia/Bangkok", profileName: "ทดสอบ",
  bazi: { score: 78, label: "ดีมาก", dayRelation: "อำนาจถูกตำแหน่ง" },
  tongshu: { yi: ["ลงนาม", "ค้าขาย"], ji: ["ขึ้นบ้านใหม่"] },
  qimen: { goldenHour: "09:00-11:00", direction: "SE" },
  sky: { moonNote: "จันทร์เล็งดาวศุกร์กำเนิดช่วงบ่าย" },
  hours: [{ range: "09:00-11:00", quality: "best" }],
};

const localeEntry = (tag: string) => ({
  pushTitle: `งานเด่นชัดเจน ${tag}`,
  pushBody: `สามศาสตร์ชี้ทางเดียวกัน เหมาะปิดดีลช่วงสาย ${tag}`,
  verdict: `วันทำงานที่ดีที่สุดของสัปดาห์ ${tag}`,
  agree: ["bazi", "tongshu", "qimen"],
  life: ["work", "money", "love", "health", "travel"].map((key) => ({
    key, stars: key === "love" ? 2 : 4, text: `คำอธิบาย ${key} ${tag}`, tip: `คำแนะนำ ${key}`,
  })),
  doList: ["ปิดดีลก่อนเที่ยง", "ทวงเงินช่วงสาย"],
  avoidList: ["เรื่องอ่อนไหวหลังบ่ายสาม"],
  scienceNotes: [
    { science: "bazi", stance: "support", text: "พลังวันหนุนดาวการงาน" },
    { science: "sky", stance: "caution", text: "จันทร์ชนดาวความสัมพันธ์ช่วงบ่าย" },
  ],
});
const goodSummary = { th: localeEntry("th"), en: localeEntry("en"), zh: localeEntry("zh") };

// prompt: ต้องฝัง facts + จำกัดศาสตร์ + ห้ามคำนวณเอง
const prompt = summaryLib.buildDailyAiPrompt(facts);
check(prompt.includes('"score": 78') && prompt.includes("bazi, tongshu, qimen, sky"), "prompt embeds engine facts and allowed sciences");
check(prompt.includes("ห้ามคำนวณหรือแต่งตัวเลข"), "prompt forbids AI-made numbers");
assert.throws(() => summaryLib.buildDailyAiPrompt({ bazi: { score: 1 } }), /not_enough_sciences/); checks += 1;

// validator: รับของดี ปฏิเสธของเสีย
check(summaryLib.validateDailySummary(goodSummary, facts) !== null, "valid summary accepted");
check(summaryLib.validateDailySummary(JSON.stringify(goodSummary), facts) !== null, "string JSON accepted");
check(summaryLib.validateDailySummary("ครับ นี่คือผล:\n```json\n" + JSON.stringify(goodSummary) + "\n```", facts) !== null, "fenced JSON extracted");
const broken = [
  { ...goodSummary, en: undefined },
  { ...goodSummary, th: { ...goodSummary.th, agree: ["bazi", "bazi"] } },
  { ...goodSummary, th: { ...goodSummary.th, agree: ["bazi"] } },
  { ...goodSummary, th: { ...goodSummary.th, agree: ["vedic"] } },
  { ...goodSummary, th: { ...goodSummary.th, life: goodSummary.th.life.slice(0, 4) } },
  { ...goodSummary, th: { ...goodSummary.th, life: goodSummary.th.life.map((x: Record<string, unknown>, i: number) => (i === 0 ? { ...x, stars: 9 } : x)) } },
  { ...goodSummary, th: { ...goodSummary.th, doList: [] } },
  { ...goodSummary, th: { ...goodSummary.th, scienceNotes: [{ science: "qimen", stance: "maybe", text: "x" }] } },
  { ...goodSummary, th: { ...goodSummary.th, pushTitle: "x".repeat(61) } },
];
for (const bad of broken) check(summaryLib.validateDailySummary(bad, facts) === null, "broken summary rejected");
const factsNoSky = { ...facts, sky: null };
check(summaryLib.validateDailySummary(goodSummary, factsNoSky) === null, "science outside available facts rejected");

// generate: invoke ฉีดได้ · ตอบเสีย = โยน error (ให้คนเรียก fallback)
const generated = await summaryLib.generateDailySummary(facts, { invoke: async () => JSON.stringify(goodSummary) });
check(generated.summary.th.pushTitle.includes("งานเด่น") && /^[a-f0-9]{64}$/.test(generated.factsDigest), "generateDailySummary returns validated summary and digest");
await assert.rejects(() => summaryLib.generateDailySummary(facts, { invoke: async () => "ไม่ใช่ json" }), /daily_ai_summary_invalid/); checks += 1;
await assert.rejects(() => summaryLib.generateDailySummary(facts, { invoke: async () => { throw new Error("cli down"); } }), /cli down/); checks += 1;

// applyAiCopiesToNotice: ทับเฉพาะข้อความ · key/payload/tokens คงเดิม
const notice = {
  userId: "u1", key: "daily|morning|2026-09-07|p1", kind: "daily",
  title: "ข้อความสูตรเดิม", body: "สูตรเดิม",
  historyCopies: { th: { title: "สูตรเดิม", body: "สูตรเดิม" }, en: { title: "old", body: "old" }, zh: { title: "舊", body: "舊" } },
  payload: { kind: "daily" },
  messages: [
    { tokenId: "t1", locale: "th", title: "สูตรเดิม", body: "สูตรเดิม", url: "/today" },
    { tokenId: "t2", locale: "en-US", title: "old", body: "old", url: "/today" },
    { tokenId: "t3", locale: "zh-TW", title: "舊", body: "舊", url: "/today" },
  ],
};
const applied = summaryLib.applyAiCopiesToNotice(notice, generated.summary, { dateLabel: "07/09", isTomorrow: false, score: 78 });
check(applied.key === notice.key && applied.payload === notice.payload, "dedupe key and payload untouched");
check(applied.title.includes("งานเด่นชัดเจน th") && applied.title.includes("78"), "th title = AI hook + engine score");
check(applied.messages[1].title.includes("Today (07/09)") && applied.messages[2].body.includes("zh"), "per-locale messages overridden");
check(applied.messages[0].url === "/today" && applied.messages[0].tokenId === "t1", "message routing fields untouched");
check(summaryLib.applyAiCopiesToNotice(notice, null, {}) === notice, "missing summary leaves template notice as-is");

console.log(`PASS daily-ai-summary: ${checks} checks (mock only; no AI call, no DB).`);
