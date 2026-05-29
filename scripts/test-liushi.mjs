/* Test 流時 deep engine */
import { buildLiuShi } from "../src/lib/bazi-liushi.ts";

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { console.log("✓", name); pass++; } else { console.log("✗", name); fail++; } }

// ดวงเค็ง 丁卯 丁未 戊寅 癸亥 · DM 戊 · 用神 น้ำ
const ctx = {
  natalPillars: {
    year: { stem: "丁", branch: "卯" },
    month: { stem: "丁", branch: "未" },
    day: { stem: "戊", branch: "寅" },
    hour: { stem: "癸", branch: "亥" },
  },
  dmStem: "戊",
  todayDayStem: "甲",
  todayDayBranch: "子",   // วันนี้ชวด
  luckBranch: "亥",       // วัยจร 辛亥
  yearBranch: "午",       // ปีจร 丙午 (2026)
  monthBranch: "巳",
  yongshen: ["water"],
  jishen: ["wood", "fire", "metal"],
  nowBranch: "午",
};

const r = buildLiuShi(ctx);

// 1. คืน 12 ยามครบ
ok("คืน 12 ยามครบ", r.hours.length === 12);

// 2. ยาม子(วันนี้) ฮะ丑? — วันนี้子 · 子丑合 ดู丑
const chou = r.hours.find((h) => h.branch === "丑");
ok("ยาม丑 ฮะวันนี้子 (子丑合)", chou.reactions.some((x) => x.includes("合วันนี้")));

// 3. ยาม午 ชนเสายาม亥? ไม่ — 午ชน子. ยาม午 ชนปีจร? ปีจร午 → 午自刑? no. 午ชนเสาไหน=子. natal ไม่มี子. แต่ปีจร午=午 → ยาม午ซ้ำปีจร (ไม่flag เพราะไม่ self-punish午... 午 not in SELF_PUNISH)
// ทดสอบ: ยาม子 ชนปีจร午
const zi = r.hours.find((h) => h.branch === "子");
ok("ยาม子 ชนปีจร午 (子午沖) → bad", zi.reactions.some((x) => x.includes("沖ปีจร")) && zi.quality === "bad");

// 4. ยาม申 ชนเสาวัน寅 (寅申沖) → bad
const shen = r.hours.find((h) => h.branch === "申");
ok("ยาม申 ชนเสาวัน寅 (寅申沖) → bad", shen.reactions.some((x) => x.includes("沖เสาวัน")) && shen.quality === "bad");

// 5. ยาม巳 ชนเสายาม亥 + วัยจร亥 (巳亥沖) → bad
const si = r.hours.find((h) => h.branch === "巳");
ok("ยาม巳 ชนเสายาม/วัยจร亥 (巳亥沖) → bad", si.reactions.some((x) => x.includes("沖")) && si.quality === "bad");

// 6. 用神 น้ำ — ยาม子(น้ำ)/亥(น้ำ) ควรเป็นของช่วย (แต่子โดนชง → bad override)
ok("ยาม亥 น้ำ=用神 reason บอกของช่วย", r.hours.find((h) => h.branch === "亥").reasonTh.includes("ของช่วย"));

// 7. 神煞 — เค็ง year卯 (亥卯未 group) → 桃花=子 · 驛馬=巳
ok("ยาม子 มี 桃花 (亥卯未→子)", zi.shensha.some((x) => x.includes("桃花")));

// 8. golden/avoid window มี
ok("มี avoidWindow (เพราะมีหลายยามชง)", r.avoidWindow !== null);

// 9. ทุกยามมี sourceRuleIds
ok("ทุกยามมี sourceRuleIds (YHZP/SMTG)", r.hours.every((h) => h.sourceRuleIds.includes("YHZP-XJP")));

// 10. isNow ตรงยาม午
ok("isNow ตรงยาม午", r.hours.find((h) => h.branch === "午").isNow === true);

console.log(`\n[流時 deep] ${pass} pass · ${fail} fail · รวม ${pass + fail}`);
process.exit(fail ? 1 : 0);
