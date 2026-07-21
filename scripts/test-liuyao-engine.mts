// Golden test 六爻 engine — 裝卦ตาม 增刪卜易 (ห้ามแก้ค่าคาดหวังโดยไม่เทียบคัมภีร์)
import assert from "node:assert/strict";
import { castLiuyao, seasonState } from "../src/lib/liuyao/engine";

// 1) 乾為天 (โยนได้ 7 หกครั้ง) — ตาราง八卦各宮全圖: เส้น1 子孫甲子水 · 世เส้น6 · 應เส้น3
const r1 = castLiuyao({ tosses: [7, 7, 7, 7, 7, 7], topicKey: "money_goods_treasury", dateIso: "2026-07-21" });
assert.ok(r1.ok);
assert.equal(r1.ben.name_zh, "乾為天");
assert.equal(r1.ben.palace, "乾");
assert.equal(r1.ben.palaceElement, "金");
assert.equal(r1.ben.lines[0].stemBranch, "甲子");
assert.equal(r1.ben.lines[0].liuqin, "子孫");
assert.ok(r1.ben.lines[5].shi && r1.ben.lines[2].ying, "世6 應3");
assert.deepEqual(r1.yongshen.lines, [2], "妻財 = เส้น 2 甲寅木");
assert.equal(r1.bian, null);

// 2) เส้น 1 動 (9) → 變卦 天風姤 (乾宮一世)
const r2 = castLiuyao({ tosses: [9, 7, 7, 7, 7, 7], topicKey: "career_fame_office", dateIso: "2026-07-21" });
assert.ok(r2.ok);
assert.equal(r2.bian?.name_zh, "天風姤");
assert.deepEqual(r2.movingIndexes, [1]);
assert.deepEqual(r2.yongshen.lines, [4], "官鬼壬午火 = เส้น 4");

// 3) วัน 丙申 (21 ก.ค. 2569): 六獸เริ่ม朱雀 (丙丁朱雀) · 旬空辰巳 (甲午旬)
assert.equal(r2.ben.lines[0].liushou, "朱雀");
assert.equal(r2.ben.lines[1].liushou, "勾陳");
assert.equal(r2.day.ganzhi, "丙申");
const kongBranches = r2.ben.lines.filter((l) => l.kong).map((l) => l.branch);
for (const b of kongBranches) assert.ok(["辰", "巳"].includes(b), `旬空ต้องเป็น 辰/巳 ได้ ${b}`);

// 4) 旺相休囚死: เดือน未(土) → 土旺 金相 火休 木囚 水死
assert.equal(seasonState("土", "土"), "旺");
assert.equal(seasonState("金", "土"), "相");
assert.equal(seasonState("火", "土"), "休");
assert.equal(seasonState("木", "土"), "囚");
assert.equal(seasonState("水", "土"), "死");

// 5) 月破: เดือน未 ชน丑 — 澤天夬? ใช้卦ที่มีเส้น丑: 天風姤 เส้น1 辛丑 → โยนให้ได้姤 [0,1,1,1,1,1]=binary 011111 → tosses [8,7,7,7,7,7]
const r5 = castLiuyao({ tosses: [8, 7, 7, 7, 7, 7], topicKey: "parents_grandparents_elders", dateIso: "2026-07-21" });
assert.ok(r5.ok);
assert.equal(r5.ben.name_zh, "天風姤");
assert.ok(r5.ben.lines[0].yuePo, "辛丑 ชนเดือน未 = 月破");

// 6) ค่าผิด
assert.equal((castLiuyao({ tosses: [1, 2, 3, 4, 5, 6], topicKey: "money_goods_treasury" }) as { error: string }).error, "bad_tosses");
assert.equal((castLiuyao({ tosses: [7, 7, 7, 7, 7, 7], topicKey: "nonsense" }) as { error: string }).error, "bad_topic");

console.log("LIUYAO_ENGINE_OK 裝卦+變卦+六獸+旬空+月破+旺衰");
