/* Regression: 神煞 67 supplemental stars + AI packet cap
   รัน: node --experimental-strip-types --loader ./scripts/ts-loader.mjs scripts/test-shensha-67.mjs */
import { readFileSync } from "fs";
import { detectShenSha62, buildSpecialStars } from "../src/lib/chart-table.ts";
import { renderChartPrompt } from "../src/lib/chart-packet.ts";

let pass = 0, fail = 0;
function ok(desc, cond) {
  console.log(`${cond ? "✓" : "✗"} ${desc}`);
  cond ? pass++ : fail++;
}

function p(y, m, d, h = null) {
  const mk = (x) => ({ stem: x[0], branch: x[1] });
  return { year: mk(y), month: mk(m), day: mk(d), hour: h ? mk(h) : null };
}

function hits(pillars) {
  return detectShenSha62(pillars);
}

function has(pillars, zh, pillar = null) {
  return hits(pillars).some((s) => s.zh === zh && (!pillar || s.pillars.includes(pillar)));
}

function promptFor(pillars, keys = ["year", "month", "day", "hour"]) {
  const specialStars = buildSpecialStars(pillars);
  const packet = {
    meta: { mode: pillars.hour ? "4p" : "3p" },
    pillars: keys.filter((k) => pillars[k]).map((k) => ({
      key: k,
      stem: pillars[k].stem,
      branch: pillars[k].branch,
      tenGod: k === "day" ? "日主" : "-",
      hiddenStems: [],
      qiPhase: { dm: null, pillar: null, hidden: null },
      palaceZh: k,
      hexZh: null,
      nayinZh: "-",
      stars: specialStars[k]
        .sort((a, b) => ({ bad: 0, good: 1, neutral: 2 }[a.polarity] - { bad: 0, good: 1, neutral: 2 }[b.polarity]))
        .slice(0, 15)
        .map((s) => ({ name: s.th || s.zh, polarity: s.polarity })),
    })),
    structure: { label: "test" },
    usefulGods: { yong: [], xi: [], ji: [] },
    elementProfile: { counts: { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 }, voytekLevel: "test" },
    kongWang: { dayVoids: [], yearVoids: [] },
    annualPillar: { stem: "丙", branch: "午" },
    interactions: { raw: [], status: "none" },
    luckTimeline: [],
    luckInteractions: [],
    annualInteractions: [],
    timeline: [],
  };
  return renderChartPrompt(packet, { subjectLabel: "shensha-67-test" });
}

const yinCuo = p(["甲", "子"], ["乙", "亥"], ["丁", "丑"]);
ok("陰錯 emits from 陰陽差錯日 丁丑 at day pillar", has(yinCuo, "陰錯", "day"));

const yangChaLuKu = p(["甲", "子"], ["丁", "丑"], ["丙", "子"], ["辛", "卯"]);
ok("陽差 emits from 陰陽差錯日 丙子 at day pillar", has(yangChaLuKu, "陽差", "day"));
ok("祿庫 emits when 丙日 sees 丑 wealth vault", has(yangChaLuKu, "祿庫", "month"));
ok("buildSpecialStars routes 祿庫 to the month pillar", buildSpecialStars(yangChaLuKu).month.some((s) => s.zh === "祿庫"));

const guLuan = p(["癸", "卯"], ["甲", "寅"], ["乙", "巳"], ["丙", "子"]);
ok("孤鸞 emits from 孤鸞日 乙巳 at day pillar", has(guLuan, "孤鸞", "day"));

const jieLu4p = p(["癸", "卯"], ["甲", "寅"], ["甲", "子"], ["壬", "申"]);
ok("截路空亡 emits only from day-to-hour rule 甲日見申時", has(jieLu4p, "截路空亡", "hour"));

const jieLu3p = p(["癸", "卯"], ["甲", "寅"], ["甲", "子"]);
ok("截路空亡 does not emit without known hour pillar", !has(jieLu3p, "截路空亡"));

const prompt4p = promptFor(p(["甲", "辰"], ["丁", "丑"], ["戊", "申"], ["癸", "亥"]));
ok("renderChartPrompt sends 陽差/孤鸞/祿庫/截路空亡 labels to AI packet text",
  ["หยางคลาด", "หงส์เดี่ยว", "คลังลาภ", "ทางตันว่าง"].every((s) => prompt4p.includes(s)));
const prompt3p = promptFor(yinCuo, ["year", "month", "day"]);
ok("renderChartPrompt sends 陰錯 label and still omits 截路空亡 for 3p",
  prompt3p.includes("หยินคลาด") && !prompt3p.includes("ทางตันว่าง"));

const packetSource = readFileSync(new URL("../src/lib/chart-packet.ts", import.meta.url), "utf8");
ok("AI packet cap is 15 stars per pillar", packetSource.includes(".slice(0, 15)"));

console.log(`\n=== ${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"} ===`);
process.exit(fail ? 1 : 0);
