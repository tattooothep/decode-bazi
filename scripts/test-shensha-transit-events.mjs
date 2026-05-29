/* Test Gap 4: shenshaTransit + sixRelativesEvents */
import { buildShenShaTransit } from "../src/lib/bazi-shensha-transit.ts";
import { buildSixRelativesEvents } from "../src/lib/bazi-six-relatives-events.ts";

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { console.log("✓", name); pass++; } else { console.log("✗", name); fail++; } }

/* === ShenSha Transit === */
// ดวงตัวอย่าง: 戊午 庚申 戊寅 癸亥 (day-stem 戊 · year 午)
// 桃花 ของ寅午戌 = 卯 (ไม่อยู่ในผัง)
// 驛馬 ของ寅午戌 = 申 (อยู่ที่เสาเดือน)
// 羊刃 ของ戊 = 午 (อยู่ที่เสาปี)
const pillars1 = {
  year: { stem: "戊", branch: "午" },
  month: { stem: "庚", branch: "申" },
  day: { stem: "戊", branch: "寅" },
  hour: { stem: "癸", branch: "亥" },
};

// 1. natal 驛馬 อยู่ที่เสาเดือน + วัยจร申 → amplified
const t1 = buildShenShaTransit(pillars1, { luckBranch: "申", luckLabel: "甲申" });
const yiMaAmp = t1.find((r) => r.starKey === "yiMa" && r.verdict === "amplified");
ok("驛馬 @month + 大運申 → amplified", !!yiMaAmp);

// 2. natal 羊刃 อยู่ที่เสาปี + ปีจร子 (ชง午) → clashed
const t2 = buildShenShaTransit(pillars1, { yearBranch: "子", yearLabel: "甲子" });
const yangRenClash = t2.find((r) => r.starKey === "yangRen" && r.verdict === "clashed");
ok("羊刃 @year + 流年子 (ชง午) → clashed", !!yangRenClash);

// 3. natal 桃花 ไม่อยู่ในผัง + วัยจรนำ卯เข้ามา → activated
const t3 = buildShenShaTransit(pillars1, { luckBranch: "卯", luckLabel: "丁卯" });
const taoHuaAct = t3.find((r) => r.starKey === "taoHua" && r.activatedBy === "luck");
ok("桃花 ไม่อยู่ในผัง + 大運卯 → activated", !!taoHuaAct);

// 4. ไม่มี luck/year input → return list neutral fallback
const t4 = buildShenShaTransit(pillars1, {});
ok("ไม่มี luck/year → return fallback list", t4.length > 0);

// 5. 文昌 lookup ตรงตำรา (戊→申)
const wenChang = t1.find((r) => r.starKey === "wenChang");
ok("文昌 อยู่ที่ branch 申 (戊→申)", wenChang?.natalBranch === "申");

/* === Six Relatives Events === */
// ดวงเดียวกัน · sixRelatives mock
const sixRelativesMock = [
  { relativeZh: "配偶", starsZh: ["正財"], foundAt: ["day"] },
  { relativeZh: "父", starsZh: ["偏財"], foundAt: [] },
  { relativeZh: "母", starsZh: ["正印"], foundAt: ["hour"] },
];
const yearTimeline = [
  { year: 2026, branch: "午" },
  { year: 2027, branch: "未" },
  { year: 2028, branch: "申" },
  { year: 2029, branch: "酉" },
  { year: 2030, branch: "戌" },
];

// 6. ปี 2028 (申) ชนเรือนคู่ (寅) → clash_palace
const ev1 = buildSixRelativesEvents(pillars1, sixRelativesMock, yearTimeline, 10);
const clashSpouse = ev1.find((e) => e.year === 2028 && e.relativeZh === "配偶" && e.eventType === "clash_palace");
ok("ปี 2028 申 ชนเรือนคู่ 寅 → clash_palace", !!clashSpouse);

// 7. ปี 2027 (未) ฮะเรือนคู่ (寅)? — 寅亥合 ไม่ใช่ 寅未 → ไม่ flag
const ev2 = ev1.find((e) => e.year === 2027 && e.relativeZh === "配偶");
ok("ปี 2027 未 ไม่ฮะเรือนคู่ 寅 → ไม่ flag", !ev2);

// 8. ปี 2027 (未) ฮะเรือนลูก (亥)? — 寅亥 ไม่ใช่ 未亥 → ไม่ flag → แต่ลองดูเรือนแม่ที่ hour=亥 → 未 ฮะ午 ไม่ใช่亥
// ทดสอบ: 寅亥合 → ปีจร寅 (2029=酉?, 2034=寅?) ในtimeline ไม่มี — skip

// 9. events เรียงตามปี
const years = ev1.map((e) => e.year);
const sortedAsc = [...years].sort((a, b) => a - b);
ok("events sorted by year asc", JSON.stringify(years) === JSON.stringify(sortedAsc));

console.log(`\n[shensha-transit + six-relatives-events] ${pass} pass · ${fail} fail · รวม ${pass + fail}`);
process.exit(fail ? 1 : 0);
