/**
 * test 六親 (อ่านญาติ · 27 พ.ค.)
 * รัน: node --experimental-strip-types --loader ./scripts/ts-loader.mjs scripts/test-liuqin.mjs
 * เช็ค: 十神→ญาติ แปรเพศ + ธาตุญาติถูก + foundAt + 3p ตัดลูก + กันเดา
 * golden Aeaw: 庚午/丙子/己亥/甲子 · DM=己(土) · หญิง(F)
 */
import { buildSixRelatives } from "../src/lib/chart-packet.ts";

let pass = 0, fail = 0;
function t(label, got, exp) { const ok = JSON.stringify(got) === JSON.stringify(exp); console.log(`  ${ok ? "✅" : "❌"} ${label}: ${JSON.stringify(got)}${ok ? "" : ` (exp ${JSON.stringify(exp)})`}`); ok ? pass++ : fail++; }

const aeaw = { year: { stem: "庚", branch: "午" }, month: { stem: "丙", branch: "子" }, day: { stem: "己", branch: "亥" }, hour: { stem: "甲", branch: "子" } };
const noUse = () => "neutral";
const empty = new Set();

// ── หญิง (F · DM己土) ──
const f = buildSixRelatives(aeaw, "己", "earth", "F", null, empty, empty, noUse, false);
const byZh = (zh) => f.items.find((i) => i.relativeZh === zh);

t("配偶หญิง = ธาตุไม้(官殺ข่มดิน)", byZh("配偶").element, "wood");
t("配偶หญิง ดาว = 正官/七殺", byZh("配偶").starsZh, ["正官", "七殺"]);
t("配偶 เรือน = 日支", byZh("配偶").palaceZh.includes("日支"), true);
t("父 = ธาตุน้ำ(財·ดินข่มน้ำ)", byZh("父").element, "water");
t("父 ดาว = 偏財", byZh("父").starsZh, ["偏財"]);
t("母 = ธาตุไฟ(印·ไฟผลิตดิน)", byZh("母").element, "fire");
t("子女หญิง = ธาตุทอง(食傷·ดินผลิตทอง)", byZh("子女").element, "metal");
t("子女หญิง ดาว = 食神/傷官", byZh("子女").starsZh, ["食神", "傷官"]);
t("兄弟 = ธาตุดิน(比劫เท่า DM)", byZh("兄弟姊妹").element, "earth");

// foundAt: 配偶(官殺木) ต้องเจอ 甲(時ก้าน=正官) + 亥ซ่อน甲
t("配偶 พบดาวในผัง (ไม่ว่าง)", byZh("配偶").foundAt.length > 0, true);
// 母(印火) ต้องเจอ 丙(月ก้าน=正印)
t("母 พบ 丙 ที่เสาเดือน(ก้าน)", byZh("母").foundAt.includes("เสาเดือน(ก้าน)"), true);

// ── ชาย (M · สลับ 配偶/子女) ──
const m = buildSixRelatives(aeaw, "己", "earth", "M", null, empty, empty, noUse, false);
const mZh = (zh) => m.items.find((i) => i.relativeZh === zh);
t("配偶ชาย = ธาตุน้ำ(財)", mZh("配偶").element, "water");
t("配偶ชาย ดาว = 正財/偏財", mZh("配偶").starsZh, ["正財", "偏財"]);
t("子女ชาย = ธาตุไม้(官殺)", mZh("子女").element, "wood");

// ── 3p ตัดลูก (時) ──
const p3 = buildSixRelatives({ year: aeaw.year, month: aeaw.month, day: aeaw.day, hour: null }, "己", "earth", "F", null, empty, empty, noUse, true);
t("3p ไม่มี 子女 (ตัดลูก·กันเดายาม)", p3.items.some((i) => i.relativeZh === "子女"), false);
t("3p ยังมี 配偶/父/母/兄弟 (4 ราย)", p3.items.length, 4);

// ── กันเดา: ดาวไม่ปรากฏ → foundAt ว่าง (ไม่ใช่ crash) ──
const noStar = buildSixRelatives({ year: { stem: "己", branch: "丑" }, month: { stem: "己", branch: "丑" }, day: { stem: "己", branch: "丑" }, hour: { stem: "己", branch: "丑" } }, "己", "earth", "F", null, empty, empty, noUse, false);
t("ดวงไร้官殺 → 配偶 foundAt ว่าง (ไม่ crash)", noStar.items.find((i) => i.relativeZh === "配偶").foundAt, []);

console.log(`\n[六親] ${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
