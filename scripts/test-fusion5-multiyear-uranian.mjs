// r396 · ทดสอบชั้นเวลา "หลายปี/ปีอดีต" ของยูเรเนียน (multi-year + pair timing)
// run: npx tsx scripts/test-fusion5-multiyear-uranian.mjs
import { renderMultiYearBlock, renderPairTimingBlock, resolveFusionYearRange } from "../src/lib/fusion5/multi-year.ts";
import { buildSciencePrompt } from "../src/lib/fusion5/build-prompt.ts";

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => { cond ? (pass++, console.log(`✅ ${name}`)) : (fail++, console.log(`❌ ${name} ${detail}`)); };

// ดวงเอี๊ยว (Aeaw 1984-12-31 13:15 Bangkok · golden) → UTC 06:15
const AEAW = { name: "เอี๊ยว", dtUTC: new Date(Date.UTC(1984, 11, 31, 6, 15, 0)), lat: 13.7563, lng: 100.5018, hasTime: true, gender: "M" };
const MAI = { name: "ไหม", dtUTC: new Date(Date.UTC(1986, 3, 12, 9, 42, 0)), lat: 13.7563, lng: 100.5018, hasTime: true, gender: "F" };

// 1) multi-year ยูเรเนียน วนปีอดีต 2016-2019 → ไม่ empty · มีทุกปี · มีวันที่ (YYYY-MM-DD)
const t0 = Date.now();
const blk = renderMultiYearBlock("uranian", AEAW, 2016, 2019);
const ms = Date.now() - t0;
ok(`uranian multi-year 2016-2019 ไม่ empty (${ms}ms)`, blk.length > 0 && blk.includes("MULTI_YEAR_TIMELINE 2016-2019"), blk.slice(0, 120));
const years = ["2016", "2017", "2018", "2019"].filter((y) => blk.includes(`  ${y}:`));
ok("ครบ 4 ปี", years.length === 4, `got ${years.length}`);
ok("มีวันที่ exact (YYYY-MM-DD) เกาะเหตุการณ์", /20(16|17|18|19)-\d{2}-\d{2}\(/.test(blk));
ok("มี orb ลิปดา (′) ต่อเหตุการณ์", /\d+(\.\d+)?′\)/.test(blk));

// 2) deterministic (คำนวณซ้ำ = เหมือนเดิม)
ok("deterministic", renderMultiYearBlock("uranian", AEAW, 2016, 2019) === blk);

// 3) no-time ไม่พัง (ไม่มี Meridian/prog_mc → ยังต้องได้ string)
const NT = { ...AEAW, hasTime: false };
ok("no-time ไม่ throw + ได้ string", typeof renderMultiYearBlock("uranian", NT, 2016, 2018) === "string");

// 4) pair timing ยูเรเนียน (2 ดวง) ปีอดีต 2018 → มีหัว PAIR_TIMING + เนื้อหา
const pair = renderPairTimingBlock("uranian", [AEAW, MAI], 2018);
ok("pair timing มีหัว PAIR_TIMING ปี 2018", pair.includes("PAIR_TIMING_PACKET ปี 2018"));
ok("pair timing deterministic", renderPairTimingBlock("uranian", [AEAW, MAI], 2018) === pair);
ok("กลุ่ม >2 ดวง ไม่พัง", renderPairTimingBlock("uranian", [AEAW, MAI, { ...AEAW, name: "สาม" }], 2018).includes("ทั้งกลุ่ม 3 ดวง"));
ok("ดวงเดียวไม่มี pair block", renderPairTimingBlock("uranian", [AEAW], 2018) === "");

// 5) เต็มสาย: prompt ยูเรเนียน + คำถามช่วงปีอดีต → มี MULTI_YEAR · ไม่เกิน 118K
const yr = resolveFusionYearRange("ยูเรเนียนช่วง 2016-2019 จุดไวถูกปลุกปีไหน");
ok("จับช่วงปี 2016-2019", yr?.startYear === 2016 && yr?.endYear === 2019);
const pRange = buildSciencePrompt("uranian", [AEAW], "ช่วง 2016-2019 จุดไวถูกปลุกปีไหนบ้าง", "th");
ok("prompt ยูเรเนียน มี MULTI_YEAR_TIMELINE", pRange.includes("MULTI_YEAR_TIMELINE 2016-2019"));
ok("prompt ยูเรเนียน ≤ 118K", pRange.length <= 118000, `${pRange.length}`);
const pPair = buildSciencePrompt("uranian", [AEAW, MAI], "ปี 2018 คู่นี้เดือนไหนหนักพร้อมกัน", "th");
ok("prompt คู่ ยูเรเนียน มี PAIR_TIMING", pPair.includes("PAIR_TIMING_PACKET ปี 2018"));
ok("prompt คู่ ยูเรเนียน ≤ 118K", pPair.length <= 118000, `${pPair.length}`);

// ── โชว์ผลจริง (ดวงเอี๊ยว 2016-2019) ──
console.log("\n────── ตัวอย่างจริง · ยูเรเนียน multi-year ดวงเอี๊ยว 2016-2019 ──────");
console.log(blk);
console.log("\n────── ตัวอย่างจริง · pair timing เอี๊ยว×ไหม 2018 ──────");
console.log(pair);

console.log(`\nผล: ${pass} ผ่าน · ${fail} ไม่ผ่าน`);
process.exit(fail ? 1 : 0);
