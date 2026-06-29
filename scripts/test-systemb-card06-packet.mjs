/* Regression: Card 06 element distribution uses SystemB by default and Sifu packet renders SystemB as canonical.
 * Run: node --experimental-strip-types --loader ./scripts/ts-loader.mjs scripts/test-systemb-card06-packet.mjs
 */
import { buildElementDistribution, resolveElementDistMode } from "../src/lib/element-distribution-functional.ts";
import { calcBazi } from "../src/lib/bazi-calc.ts";
import { buildChartExtensions } from "../src/lib/chart-extensions.ts";
import { buildStructuredChartPacket, renderChartPrompt } from "../src/lib/chart-packet.ts";

let pass = 0;
let fail = 0;
function ok(desc, cond, got = "") {
  console.log(`${cond ? "✓" : "✗"} ${desc}${cond ? "" : ` -> ${got}`}`);
  cond ? pass++ : fail++;
}

const natal = {
  year: { stem: "甲", branch: "子" },
  month: { stem: "丙", branch: "子" },
  day: { stem: "己", branch: "亥" },
  hour: { stem: "庚", branch: "午" },
};

ok("default mode resolver = systemB", resolveElementDistMode(undefined) === "systemB", resolveElementDistMode(undefined));
ok("legacy env override is disabled for runtime", resolveElementDistMode("legacy") === "systemB", resolveElementDistMode("legacy"));

const sysB = buildElementDistribution(natal);
const legacy = buildElementDistribution(natal, "legacy");
ok("default distribution engine = system-b-v1", sysB.engine_version === "system-b-v1", sysB.engine_version);
ok("legacy distribution engine remains direct-test only", legacy.engine_version === "phase-17g-v6", legacy.engine_version);
ok("SystemB Night water rounds to 46%", Math.round(sysB.pctRaw.water) === 46, sysB.pctRaw.water);
ok("legacy Night water is the old 57% class", Math.round(legacy.pctRaw.water) === 57, legacy.pctRaw.water);

const calc = await calcBazi({
  date: "1984-12-31",
  time: "13:15",
  longitude: 100.5018,
  gmtOffsetHours: 7,
  gender: "F",
  dayBoundary: "00:00",
  birthTimeKnown: true,
});
const birthDate = new Date("1984-12-31T13:15:00+07:00");
const today = new Date("2026-06-09T12:00:00+07:00");
const ageNow = 2026 - 1984;
const ext = buildChartExtensions(
  calc.pillars,
  today,
  "F",
  birthDate,
  ageNow,
  calc.geJu.structure,
  calc.strength.percent,
  calc.yongshen[0]?.element,
  calc.yongshen.map((x) => x.element),
);
const packet = buildStructuredChartPacket(calc, ext, calc.dayMaster, ageNow, {}, null, "F", null, {
  dayBoundary: "00:00",
  dayBoundarySource: "explicit",
});
const prompt = renderChartPrompt(packet);

ok("packet has SystemB card06 field", packet.elementProfile.systemB?.engineVersion === "system-b-v1", JSON.stringify(packet.elementProfile.systemB));
ok("runtime packet does not expose element legacy", !("legacy" in packet.elementProfile), JSON.stringify(packet.elementProfile));
ok("Sifu prompt renders SystemB as canonical for card 06", prompt.includes("ธาตุรวมการ์ด 06 (canonical SystemB system-b-v1"), prompt);
ok("Sifu prompt does not render old legacy 57 water line", !prompt.includes("น้ำ 57"), prompt);
ok("Sifu prompt has no legacy fallback", !prompt.includes("fallback legacy") && !prompt.includes("ธาตุรวม: ไม้"), prompt);
ok("Sifu prompt tells AI not to replace yongshen with card06", prompt.includes("ห้ามใช้บรรทัดนี้แทน用神/喜忌"), prompt);
ok("Sifu prompt guards raw tally/counts from becoming element weight", prompt.includes("ห้ามแปลงเลข internal tally/counts เป็นน้ำหนักธาตุ"), prompt);
ok("Sifu prompt hides raw BingYao count= tally", !/(^|[^A-Za-z0-9_])count=\d+(?:\.\d+)?/.test(prompt), prompt);
ok("Sifu prompt hides raw point-count wording", !/ปรากฏ\s+\d+(?:\.\d+)?\s+จุด/.test(prompt), prompt);
ok("Sifu prompt does not render raw tally as Thai parts", !/\d+(?:\.\d+)?\s*ส่วน/.test(prompt), prompt);

if (fail) {
  console.error(`FAIL ${fail}/${pass + fail}`);
  process.exit(1);
}
console.log(`PASS ${pass}/${pass + fail}`);
