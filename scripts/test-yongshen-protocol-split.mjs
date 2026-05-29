/* Regression: HK_YONGSHEN_PROTOCOL_SPLIT_V1
   แยก 格局/月令用神, 調候, 扶抑, 病藥, 相神 ออกจาก usefulGods ก้อนรวม
   รัน: node --experimental-strip-types --loader ./scripts/ts-loader.mjs scripts/test-yongshen-protocol-split.mjs */
import { calcBazi } from "../src/lib/bazi-calc.ts";
import { buildChartExtensions } from "../src/lib/chart-extensions.ts";
import { buildStructuredChartPacket, renderChartPrompt, validateChartPacket } from "../src/lib/chart-packet.ts";

let pass = 0, fail = 0;
function ok(desc, cond) {
  console.log(`${cond ? "✓" : "✗"} ${desc}`);
  cond ? pass++ : fail++;
}

const calc = await calcBazi({
  date: "1984-12-31",
  time: "13:15",
  longitude: 100.5018,
  gmtOffsetHours: 7,
  gender: "F",
  dayBoundary: "00:00",
  birthTimeKnown: true,
});
const today = new Date("2026-05-29T12:00:00+07:00");
const birthDate = new Date("1984-12-31T13:15:00+07:00");
const ext = buildChartExtensions(
  calc.pillars,
  today,
  "F",
  birthDate,
  10,
  calc.geJu.structure,
  calc.strength.percent,
  calc.yongshen[0]?.element,
  calc.yongshen.map((x) => x.element),
);
const rootedness = {
  dmElement: "earth",
  dmLabel: "token_root",
  isExtremelyWeak: true,
  isTokenOnly: true,
  all: { wood: "partial_root", fire: "partial_root", earth: "token_root", metal: "token_root", water: "strong_root" },
};
const packet = buildStructuredChartPacket(
  calc,
  ext,
  calc.dayMaster,
  41,
  {},
  rootedness,
  "F",
  null,
  { dayBoundary: "00:00", dayBoundarySource: "explicit" },
);
const p = packet.yongShenProtocols;
const prompt = renderChartPrompt(packet);
const validation = validateChartPacket(packet);

ok("packet has protocol split tag", p?.tag === "HK_YONGSHEN_PROTOCOL_SPLIT_V1");
ok("structure layer is separated as 格局/月令用神", p?.structure.protocol === "格局/月令用神" && p.structure.canonicalChinese === "八字用神，專求月令");
ok("finalCombined keeps old usefulGods unchanged", JSON.stringify(p?.finalCombined.yong) === JSON.stringify(packet.usefulGods.yong));
ok("xiangShen is separate from tiaoHou/fuyi", p?.xiangShen.protocol === "相神" && p?.tiaoHou.protocol === "調候用神" && p?.fuyi.protocol === "扶抑用神");
ok("render exposes 用神分層 to AI", prompt.includes("用神分層 (HK_YONGSHEN_PROTOCOL_SPLIT_V1"));
ok("render says split is not a response limiter", prompt.includes("ไม่ใช่ข้อจำกัดคำตอบ"));
ok("render keeps final engine combined wording", prompt.includes("engineรวมภาพรวม=") && prompt.includes("ไม่ใช่ 子平真詮 用神(月令) อย่างเดียว"));
ok("render does not leak raw percent from geJu basis", !/[0-9.]+%/.test(prompt));
ok("validateChartPacket stays clean", validation.ok === true);

console.log(`\n=== ${pass}/${pass + fail} ${fail ? "❌ FAIL" : "✅ PASS"} ===`);
process.exit(fail ? 1 : 0);
