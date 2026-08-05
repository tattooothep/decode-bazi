/**
 * test-sifu-live-summary.mts — ด่านตรวจใบสรุปสายคุยสดเข้าสมุดดวง (4 ส.ค. 2569)
 * ยิงตรง lib pure: src/lib/sifu-live-call-summary.ts (ไม่แตะ DB)
 * รัน: npx tsx scripts/test-sifu-live-summary.mts
 */
import assert from "node:assert/strict";

import {
  SIFU_LIVE_SUMMARY_MAX_PAIRS,
  buildSifuLiveCallSummaryEntry,
  cleanSifuLiveConversationId,
  cleanSifuLiveDurationSec,
  cleanSifuLiveSummaryLang,
  cleanSifuLiveSummaryPairs,
} from "../src/lib/sifu-live-call-summary";

let passed = 0;
function check(label: string, run: () => void): void {
  run();
  passed += 1;
  console.log(`  ✅ ${label}`);
}

check("conversationId: รับเฉพาะ cnv_+hex32", () => {
  assert.equal(cleanSifuLiveConversationId(`cnv_${"ab".repeat(16)}`), `cnv_${"ab".repeat(16)}`);
  assert.equal(cleanSifuLiveConversationId("cnv_XYZ"), null);
  assert.equal(cleanSifuLiveConversationId(`cnv_${"ab".repeat(16)}x`), null);
  assert.equal(cleanSifuLiveConversationId(42), null);
});

check("lang: th/en/zh · อื่นๆ ตกเป็น th", () => {
  assert.equal(cleanSifuLiveSummaryLang("zh"), "zh");
  assert.equal(cleanSifuLiveSummaryLang("en"), "en");
  assert.equal(cleanSifuLiveSummaryLang("jp"), "th");
  assert.equal(cleanSifuLiveSummaryLang(undefined), "th");
});

check("durationSec: ปัดพื้น + เพดาน 4 ชม. + ค่าเพี้ยนเป็น 0", () => {
  assert.equal(cleanSifuLiveDurationSec(95.7), 95);
  assert.equal(cleanSifuLiveDurationSec(999_999), 4 * 3_600);
  assert.equal(cleanSifuLiveDurationSec(-5), 0);
  assert.equal(cleanSifuLiveDurationSec("x"), 0);
});

check("pairs: ทิ้งคู่ครึ่งเดียว/ขยะ · เกินเพดานเก็บท้ายสุด", () => {
  const dirty = [
    { question: "ถาม 1", answer: "ตอบ 1" },
    { question: "ไม่มีคำตอบ", answer: "" },
    { question: "", answer: "ไม่มีคำถาม" },
    "junk",
    null,
    { question: "  ถาม 2  ", answer: " ตอบ 2 " },
  ];
  const pairs = cleanSifuLiveSummaryPairs(dirty);
  assert.equal(pairs.length, 2);
  assert.equal(pairs[1].question, "ถาม 2");
  assert.equal(pairs[1].answer, "ตอบ 2");

  const many = Array.from({ length: SIFU_LIVE_SUMMARY_MAX_PAIRS + 7 }, (_, i) => ({
    answer: `ตอบ ${i + 1}`,
    question: `ถาม ${i + 1}`,
  }));
  const capped = cleanSifuLiveSummaryPairs(many);
  assert.equal(capped.length, SIFU_LIVE_SUMMARY_MAX_PAIRS);
  assert.equal(capped[0].question, "ถาม 8", "เก็บเรื่องล่าสุด ทิ้งเก่าสุด");
  assert.equal(cleanSifuLiveSummaryPairs("not-array").length, 0);
});

check("entry ไทย: หัวมีวันเวลา (Asia/Bangkok) + นาที + จำนวนคำถาม · เนื้อครบทุกคู่", () => {
  const endedAt = new Date("2026-08-04T05:30:00Z"); // = 12:30 เวลาไทย
  const entry = buildSifuLiveCallSummaryEntry({
    durationSec: 125,
    endedAt,
    lang: "th",
    pairs: [
      { answer: "ฟันธงว่าย้ายได้หลังเดือน 10", question: "ปีนี้ย้ายงานดีไหม" },
      { answer: "ระวังกระเพาะช่วงหน้าฝน", question: "สุขภาพล่ะ" },
    ],
  });
  assert.ok(entry);
  assert.ok(entry.question.includes("สรุปสายคุยสดกับซินแส"));
  assert.ok(entry.question.includes("04/08/2026 12:30"), `หัวต้องเป็นเวลาไทย: ${entry.question}`);
  assert.ok(entry.question.includes("3 นาที"), "125 วิ = ปัดขึ้น 3 นาที");
  assert.ok(entry.question.includes("2 คำถาม"));
  assert.ok(entry.answer.includes("1. ถาม: ปีนี้ย้ายงานดีไหม"));
  assert.ok(entry.answer.includes("2. ถาม: สุขภาพล่ะ"));
  assert.ok(entry.answer.includes("ระวังกระเพาะช่วงหน้าฝน"));
  assert.ok(entry.answer.includes("บันทึกอัตโนมัติหลังวางสาย"));
});

check("entry: คำตอบยาวถูกย่อในใบสรุป (ฉบับเต็มอยู่รายคู่แล้ว) · สายว่าง = null", () => {
  const entry = buildSifuLiveCallSummaryEntry({
    durationSec: 60,
    endedAt: new Date(),
    lang: "en",
    pairs: [{ answer: "long ".repeat(1_000), question: "will I move" }],
  });
  assert.ok(entry);
  assert.ok(entry.answer.length < 1_500, "ย่อยคำตอบต่อข้อเหลือ ~700 ตัว");
  assert.ok(entry.answer.includes("…"), "ต้องมีรอยตัดชัดเจน");
  assert.equal(buildSifuLiveCallSummaryEntry({
    durationSec: 60, endedAt: new Date(), lang: "th", pairs: [],
  }), null);
});

check("entry zh: หัว/ท้ายเป็นจีน ไม่มีไทยปน", () => {
  const entry = buildSifuLiveCallSummaryEntry({
    durationSec: 61,
    endedAt: new Date(),
    lang: "zh",
    pairs: [{ answer: "可以搬", question: "今年適合搬家嗎" }],
  });
  assert.ok(entry);
  assert.ok(entry.question.includes("與老師即時通話摘要"));
  assert.ok(!/[฀-๿]/.test(entry.question), "หัว zh ห้ามมีอักษรไทย");
  assert.ok(!/[฀-๿]/.test(entry.answer), "เนื้อ zh ห้ามมีอักษรไทย");
});

console.log(`\nด่านตรวจใบสรุปสายคุยสดผ่าน ${passed}/${passed} ข้อ`);
