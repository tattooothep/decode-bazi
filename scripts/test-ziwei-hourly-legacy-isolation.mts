import assert from "node:assert/strict";
import { ziweiChart } from "../src/lib/astro/ziwei/engine";
import { buildZiweiPacket } from "../src/lib/astro/ziwei/packet";

const birth = new Date("1984-12-31T06:15:00.000Z");
const refDate = new Date("2026-08-26T18:30:00.000Z");
const opts = { gmtOffsetHours: 7, refDate };
const chart = ziweiChart(birth, 13.7563, 100.5018, "M", true, opts);

assert.equal(Object.hasOwn(chart, "liuShi"), false, "legacy chart must not acquire liuShi");
assert.equal(chart.liuNian?.annualStars.length, 8, "legacy annual star set drift");
assert.equal(chart.liuYue?.monthlyStars.length, 8, "legacy monthly star set drift");
assert.equal(chart.liuRi?.dailyStars.length, 8, "legacy daily star set drift");
assert.equal(chart.liuRi?.dateISO, refDate.toISOString().slice(0, 10), "legacy UTC date semantics drift");
assert.deepEqual(chart.notAvailable, []);

const packet = buildZiweiPacket(birth, 13.7563, 100.5018, "M", true, opts);
assert.equal(Object.hasOwn(packet.data, "liuShi"), false, "legacy packet must not acquire liuShi");

const noReference = ziweiChart(birth, 13.7563, 100.5018, "M", true, { gmtOffsetHours: 7 });
assert.equal(Object.hasOwn(noReference, "liuShi"), false);
assert.deepEqual(noReference.notAvailable, ["流年", "流年四化", "流年星", "流月", "流日"]);

const noBirthTime = ziweiChart(birth, 13.7563, 100.5018, "M", false, { gmtOffsetHours: 7, refDate });
assert.equal(Object.hasOwn(noBirthTime, "liuShi"), false);
assert.deepEqual(noBirthTime.notAvailable, [
  "命宮", "身宮", "五行局", "12宮安星", "大限", "大限四化", "三方四正",
  "流年", "流年四化", "流年星", "流月", "流日",
]);

console.log("PASS ziwei hourly legacy isolation — old chart and packet contracts unchanged");
