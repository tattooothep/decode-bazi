// golden 雜曜/命主/身主 เทียบ iztro (oracle) หลายดวง — เฟส 5
// run: npx tsx scripts/test-ziwei-zayao-golden.mjs
import { astro } from "iztro";
import { ziweiChart } from "../src/lib/astro/ziwei/engine.ts";
import { buildZiweiOverlay } from "../src/lib/astro/ziwei/overlay.ts";

const S2T = { "龙池": "龍池", "凤阁": "鳳閣", "天哭": "天哭", "天虚": "天虛", "天空": "天空", "天德": "天德", "月德": "月德", "华盖": "華蓋", "咸池": "咸池", "孤辰": "孤辰", "寡宿": "寡宿", "破碎": "破碎", "蜚廉": "蜚廉", "天官": "天官", "天福": "天福", "天厨": "天廚", "天刑": "天刑", "天姚": "天姚", "天巫": "天巫", "天月": "天月", "阴煞": "陰煞", "解神": "解神", "三台": "三台", "八座": "八座", "恩光": "恩光", "天贵": "天貴", "台辅": "台輔", "封诰": "封誥", "贪狼": "貪狼", "巨门": "巨門", "禄存": "祿存", "文曲": "文曲", "廉贞": "廉貞", "武曲": "武曲", "破军": "破軍", "火星": "火星", "天相": "天相", "天梁": "天梁", "天同": "天同", "文昌": "文昌", "天机": "天機", "铃星": "鈴星" };
const norm = (s) => S2T[s] || s;
const OUR_STARS = ["龍池", "鳳閣", "天哭", "天虛", "天空", "天德", "月德", "華蓋", "咸池", "孤辰", "寡宿", "破碎", "蜚廉", "天官", "天福", "天廚", "天刑", "天姚", "天巫", "天月", "陰煞", "解神", "三台", "八座", "恩光", "天貴", "台輔", "封誥"];
const timeIndexOf = (h) => Math.floor((h + 1) / 2) % 12;
const localToUTC = (y, mo, d, h, mi) => new Date(Date.UTC(y, mo - 1, d, h - 7, mi, 0));

const cases = [
  { label: "Aeaw 1984-12-31 13:15 M", y: 1984, mo: 12, d: 31, h: 13, mi: 15, g: "M", ig: "male" },
  { label: "Mai 1986-04-08 00:04 F", y: 1986, mo: 4, d: 8, h: 0, mi: 4, g: "F", ig: "female" },
  { label: "T3 1990-06-15 08:30 M", y: 1990, mo: 6, d: 15, h: 8, mi: 30, g: "M", ig: "male" },
  { label: "T4 2000-01-01 23:30 F", y: 2000, mo: 1, d: 1, h: 23, mi: 30, g: "F", ig: "female" },
  { label: "T5 1975-09-21 17:45 M", y: 1975, mo: 9, d: 21, h: 17, mi: 45, g: "M", ig: "male" },
  { label: "T6 2010-03-05 05:10 F", y: 2010, mo: 3, d: 5, h: 5, mi: 10, g: "F", ig: "female" },
];

let pass = 0, fail = 0;
for (const c of cases) {
  const dt = localToUTC(c.y, c.mo, c.d, c.h, c.mi);
  const chart = ziweiChart(dt, 13.7, 100.5, c.g, true, { gmtOffsetHours: 7, refDate: new Date("2026-07-01T00:00:00Z") });
  const ov = buildZiweiOverlay(chart, dt, 7, 2026);
  const dateStr = `${c.y}-${String(c.mo).padStart(2, "0")}-${String(c.d).padStart(2, "0")}`;
  const a = astro.bySolar(dateStr, timeIndexOf(c.h), c.ig, true, "zh-CN");

  // 命主/身主
  const soulOk = ov.mingZhu === norm(a.soul), bodyOk = ov.shenZhu === norm(a.body);
  soulOk ? pass++ : (fail++, console.log(`❌ ${c.label} 命主 ours=${ov.mingZhu} iztro=${norm(a.soul)}`));
  bodyOk ? pass++ : (fail++, console.log(`❌ ${c.label} 身主 ours=${ov.shenZhu} iztro=${norm(a.body)}`));

  // 雜曜: ตำแหน่งของเราต้องตรง iztro ทุกดวงที่เราประกาศ
  const iztroAt = new Map(); // star → branch
  for (const p of a.palaces) for (const s of p.adjectiveStars) iztroAt.set(norm(s.name), p.earthlyBranch);
  for (const star of OUR_STARS) {
    const ours = ov.zaYao.find((z) => z.star === star);
    const ib = iztroAt.get(star);
    if (!ours) { fail++; console.log(`❌ ${c.label} ${star} เราไม่มี (iztro=${ib || "-"})`); continue; }
    if (!ib) { fail++; console.log(`❌ ${c.label} ${star} iztro ไม่มี (เรา=${ours.branch})`); continue; }
    if (ours.branch === ib) pass++;
    else { fail++; console.log(`❌ ${c.label} ${star} เรา=${ours.branch} iztro=${ib}`); }
  }
  console.log(`— ${c.label}: สะสม ${pass} ผ่าน / ${fail} พลาด`);
}
console.log(`\nรวม: ${pass} ผ่าน · ${fail} ไม่ผ่าน (${cases.length} ดวง × ${OUR_STARS.length + 2} จุด)`);
process.exit(fail ? 1 : 0);
