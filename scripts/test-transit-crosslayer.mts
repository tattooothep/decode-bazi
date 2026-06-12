/* เทสหน่วย HK_CROSSLAYER_V1 · golden จากเคส Swit (壬 DM · เกิด 子丑戌酉 · ยาม己酉 · วัยจร甲辰 · ปีจร午/未)
 * รัน: npx tsx scripts/test-transit-crosslayer.mts */
import { buildTransitHehua, buildCrossLayerCombos } from "../src/lib/bazi-transit-crosslayer";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.log(`❌ ${name} ${detail}`); }
}

/* ── ดวงแบบ Swit: ก้านเกิด ปี?·เดือน辛·วัน壬(日干)·ยาม己 · กิ่ง 子丑戌酉 · เดือนเกิด丑 ── */
const natalStems = [
  { ref: "เสาปี", stem: "庚", isDayMaster: false },
  { ref: "เสาเดือน", stem: "辛", isDayMaster: false },
  { ref: "เสาวัน", stem: "壬", isDayMaster: true },
  { ref: "เสายาม", stem: "己", isDayMaster: false },
];
const natalBranches = [
  { ref: "เสาปี", branch: "子" },
  { ref: "เสาเดือน", branch: "丑" },
  { ref: "เสาวัน", branch: "戌" },
  { ref: "เสายาม", branch: "酉" },
];

/* 1) ฮะก้านจร: วัยจร甲辰 → 甲己合 (ก้านยาม己) · เดือน丑อยู่ใน season ดิน → 真化候補 (ไม่ใช่ประกาศ化) */
const hehua1 = buildTransitHehua({
  natalStems, monthBranch: "丑",
  transits: [{ label: "วัยจร甲辰", stem: "甲" }],
});
ok("甲己合 ต้องโผล่จากวัยจร甲", hehua1.length === 1 && hehua1[0].pair === "甲己", JSON.stringify(hehua1));
ok("甲己 ไม่ใช่日干 → ไม่ใช่本身之合", hehua1[0]?.involvesDayMaster === false);
ok("甲己 เดือน丑หนุนดิน → 真化候補 (ฟันแค่候補)", hehua1[0]?.verdict === "真化候補");

/* 2) ฮะก้านจรแตะ日干: ปีจร2027 丁未 → 丁壬合 ต้องเป็น本身之合 ไม่แปรธาตุ */
const hehua2 = buildTransitHehua({
  natalStems, monthBranch: "丑",
  transits: [{ label: "ปีจร2027(丁未)", stem: "丁" }],
});
ok("丁壬合 ต้องโผล่จากปีจร丁", hehua2.length === 1 && hehua2[0].pair === "丁壬");
ok("丁壬 แตะ日干壬 → 本身之合 เสมอ", hehua2[0]?.verdict === "本身之合" && hehua2[0]?.involvesDayMaster === true);

/* 3) ปีจร丙午 (2026): 丙辛合 · 辛 มีตัวเดียวในก้านบน → ไม่爭合 · เดือน丑ไม่อยู่ season น้ำ → 合而不化 */
const hehua3 = buildTransitHehua({
  natalStems, monthBranch: "丑",
  transits: [{ label: "ปีจร2026(丙午)", stem: "丙" }],
});
ok("丙辛合 ปีจร丙 → 合而不化 (เดือน丑ไม่หนุนน้ำ)", hehua3.length === 1 && hehua3[0].verdict === "合而不化", JSON.stringify(hehua3));

/* 4) ไม่มีคู่ฮะ → ว่าง */
const hehua4 = buildTransitHehua({ natalStems, monthBranch: "丑", transits: [{ label: "ปีจร2028(戊申)", stem: "戊" }] });
ok("戊 ไม่มีคู่癸ในก้านเกิด → ไม่มี hit", hehua4.length === 0);

/* 5) ข้ามชั้น: วัยจร辰 + ปีจร未(2027) + เกิด丑戌 → 丑戌未三刑 (ครบเพราะปีจร) + 四庫全 (辰วัยจร+戌丑เกิด+未ปีจร) */
const combos1 = buildCrossLayerCombos({
  natalBranches,
  luck: { label: "วัยจร甲辰", branch: "辰" },
  years: [{ year: 2026, branch: "午" }, { year: 2027, branch: "未" }],
});
const sanxing = combos1.find((h) => h.kind === "三刑");
ok("丑戌未三刑 ครบเมื่อปีจร2027", !!sanxing && sanxing.set === "丑戌未" && sanxing.years.includes(2027), JSON.stringify(combos1.map(h => h.kind + h.set + ":" + h.years.join())));
const fourstore = combos1.find((h) => h.kind === "四庫全");
ok("四庫全 ครบเมื่อปีจร2027 (辰จากวัยจร)", !!fourstore && fourstore.years.includes(2027));
ok("四庫全 สมาชิกมี辰จากวัยจร", !!fourstore && fourstore.members.some((m) => m.branch === "辰" && m.source.includes("วัยจร")));

/* 6) วัยจรล้วน: วัยจร乙巳 + เกิด酉丑 → 巳酉丑三合金 ครบไม่ต้องพึ่งปีจร (years=[]) */
const combos2 = buildCrossLayerCombos({
  natalBranches,
  luck: { label: "วัยจร乙巳", branch: "巳" },
  years: [{ year: 2036, branch: "辰" }],
});
const sanheJin = combos2.find((h) => h.kind === "三合" && h.set === "巳酉丑");
ok("巳酉丑三合金 ครบด้วยวัยจรล้วน (ตลอดช่วง)", !!sanheJin && sanheJin.years.length === 0 && sanheJin.element === "metal", JSON.stringify(combos2.map(h => h.kind + h.set)));

/* 7) โครงที่ครบในผังเกิดล้วน ต้องไม่ถูกรายงาน (ของเดิมครอบแล้ว) */
const combos3 = buildCrossLayerCombos({
  natalBranches: [
    { ref: "เสาปี", branch: "丑" }, { ref: "เสาเดือน", branch: "戌" },
    { ref: "เสาวัน", branch: "未" }, { ref: "เสายาม", branch: "卯" },
  ],
  luck: { label: "วัยจร庚申", branch: "申" },
  years: [],
});
ok("丑戌未 ครบใน natal ล้วน → ไม่รายงานซ้ำ", !combos3.some((h) => h.set === "丑戌未"), JSON.stringify(combos3.map(h => h.kind + h.set)));

/* 8) 三會: เกิด亥子 + ปีจร丑 → 亥子丑三會น้ำ */
const combos4 = buildCrossLayerCombos({
  natalBranches: [
    { ref: "เสาปี", branch: "亥" }, { ref: "เสาเดือน", branch: "子" },
    { ref: "เสาวัน", branch: "午" }, { ref: "เสายาม", branch: "寅" },
  ],
  luck: null,
  years: [{ year: 2033, branch: "丑" }],
});
const sanhui = combos4.find((h) => h.kind === "三會" && h.set === "亥子丑");
ok("亥子丑三會 ครบเมื่อปีจร丑 (ไม่มีวัยจรก็ทำงาน)", !!sanhui && sanhui.years.includes(2033) && sanhui.element === "water");

console.log(`\nผล: ${pass} ผ่าน · ${fail} ตก`);
process.exit(fail ? 1 : 0);
