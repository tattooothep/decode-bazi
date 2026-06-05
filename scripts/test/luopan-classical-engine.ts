import assert from "node:assert/strict";
import { findMountain24 } from "../../src/lib/luopan/mountains";
import { calcXuanKongChart, decideTigua, replacementForMountain } from "../../src/lib/luopan/tigua";
import { buildBashaContext, evaluateBashaHuangQuan, najiaForMountain, resolvePinCategory } from "../../src/lib/luopan/najia-basha";
import { evaluateWaterMethod, waterMouthJu } from "../../src/lib/luopan/water-method";
import { dayShaDirection, evaluateMonthDaySha, MONTH_SHA_BY_MONTH_BRANCH } from "../../src/lib/luopan/month-day-sha";

function eq<T>(actual: T, expected: T, label: string) {
  assert.deepEqual(actual, expected, label);
}

eq(findMountain24(0).name, "子", "0° ต้องเป็น 子");
eq(findMountain24(345).name, "壬", "345° ต้องเป็น 壬");
eq(findMountain24(15).name, "癸", "15° ต้องเป็น 癸");
eq(findMountain24(180).name, "午", "180° ต้องเป็น 午");
eq(findMountain24(337.49).name, "亥", "337.49° ต้องเป็น 亥");
eq(findMountain24(337.5).name, "壬", "337.5° ต้องเป็น 壬");

eq(findMountain24(345).yuan, "地元", "壬 = 地元");
eq(findMountain24(0).yuan, "天元", "子 = 天元");
eq(findMountain24(15).yuan, "人元", "癸 = 人元");
eq(findMountain24(120).yinYang, "陰", "辰 = 陰");
eq(findMountain24(135).yinYang, "陽", "巽 = 陽");
eq(findMountain24(150).yinYang, "陽", "巳 = 陽");

eq(decideTigua(0).mode, "下卦", "子กลางซานใช้下卦");
eq(decideTigua(7).trigger, "same_yinyang", "子兼癸เป็น同陰同陽");
eq(decideTigua(353).trigger, "yin_yang_cross", "子兼壬เป็น陰陽互兼");
eq(decideTigua(338).trigger, "out_of_gua", "壬兼亥เป็น出卦");
eq(replacementForMountain("壬")?.starNumber, 2, "壬 替巨門2");
eq(replacementForMountain("甲")?.starNumber, 1, "甲 替貪狼1");
eq(replacementForMountain("戌"), null, "戌 ไม่มี替星ใน沈氏13山");

const chart = calcXuanKongChart(68, 8);
eq(chart.facing.name, "甲", "68° facing = 甲");
eq(chart.waterFlight.decision.mode, "替卦", "甲兼向 case ต้องเข้า替卦");
assert.ok(chart.waterFlight.centerStar >= 1 && chart.waterFlight.centerStar <= 9, "center star ต้องเป็น 1-9");

const najia = najiaForMountain("子");
eq(najia?.gua, "坎", "子 อยู่坎");
eq(najia?.guanGui, "辰", "坎官鬼 = 辰");

const basha = buildBashaContext(180);
eq(basha.facingMountain.name, "午", "向午");
eq(basha.sittingMountain.name, "子", "坐子");
eq(basha.longShaMountain.name, "辰", "坐坎龍上八煞在辰");

const longHit = evaluateBashaHuangQuan(180, { type: "water", degree: 120 });
assert.ok(longHit.hits.some((h) => h.code === "LONG_SHA_HIT" && h.pass === false), "坐坎 + 辰水 ต้อง hit 龍上八煞");

const hqHit = evaluateBashaHuangQuan(252, { type: "water", degree: 225 });
assert.ok(hqHit.hits.some((h) => h.code === "HUANG_QUAN_HIT" && h.pass === false), "向庚 + 坤水 ต้อง hit 黃泉");

const hqDesk = evaluateBashaHuangQuan(252, { type: "desk", degree: 225 });
assert.ok(hqDesk.hits.some((h) => h.code === "HUANG_QUAN_HIT" && h.pass === true), "向庚 + 坤โต๊ะ เป็น warning ไม่ใช่ hard fail");
assert.equal(resolvePinCategory({ type: "window" }), "neutral", "หน้าต่างไม่ควรถูกนับเป็น door_gate");

eq(waterMouthJu(120)?.ju, "水局", "辰水口 = 水局");
eq(waterMouthJu(300)?.ju, "火局", "戌水口 = 火局");
eq(waterMouthJu(30)?.ju, "金局", "丑水口 = 金局");
eq(waterMouthJu(210)?.ju, "木局", "未水口 = 木局");

const waterUnknown = evaluateWaterMethod({
  houseLocked: true,
  facingDeg: 252,
  waterFeatures: [{ bearingDeg: 225, flowRole: "unknown", isRealWater: true }],
});
assert.equal(waterUnknown.pass, false, "黃泉水 flow unknown ต้องไม่ผ่าน");
assert.equal(waterUnknown.status, "partial", "flow unknown ต้อง partial");

const waterNotReal = evaluateWaterMethod({
  houseLocked: true,
  facingDeg: 252,
  waterFeatures: [{ bearingDeg: 225, flowRole: "outgoing" }],
});
assert.equal(waterNotReal.status, "missing", "ไม่ระบุ isRealWater=true ต้องไม่ถูกนับเป็นน้ำจริง");
assert.equal(waterNotReal.pass, true, "น้ำที่ยังไม่ยืนยันจริงต้องไม่ hard fail");

eq(MONTH_SHA_BY_MONTH_BRANCH.寅, "丑", "寅月月煞 = 丑");
const ms = evaluateMonthDaySha({ monthBranch: "寅", dayBranch: "丑", activityType: "動土" });
assert.equal(ms.pass, false, "寅月丑日動土ต้องไม่ผ่าน");
assert.ok(ms.tags.includes("month_sha_hit"), "ต้อง tag month_sha_hit");
eq(dayShaDirection("卯")?.dir, "W", "卯日煞西");
const ds = evaluateMonthDaySha({ monthBranch: "辰", dayBranch: "卯", activityType: "出行", targetDirection: "W" });
assert.equal(ds.pass, false, "卯日煞西 + 出行ไปตะวันตกต้อง cap");

console.log("luopan classical engine tests passed");
