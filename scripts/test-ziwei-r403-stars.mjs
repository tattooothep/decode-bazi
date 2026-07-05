// r403 · golden test: 10 ดาวเสริม/神煞 ใน engine.minorStars เทียบ iztro (oracle)
//   2 จำเป็น: 地空 地劫  ·  8 คุ้มค่า: 紅鸞 天喜 天姚 天刑 華蓋 咸池 孤辰 寡宿
// run: npx tsx scripts/test-ziwei-r403-stars.mjs
import { astro } from "iztro";
import { ziweiChart } from "../src/lib/astro/ziwei/engine.ts";

const TARGET = ["地空", "地劫", "紅鸞", "天喜", "天姚", "天刑", "華蓋", "咸池", "孤辰", "寡宿"];
const S2T = { "红鸾": "紅鸞", "华盖": "華蓋", "地空": "地空", "地劫": "地劫", "天喜": "天喜", "天姚": "天姚", "天刑": "天刑", "咸池": "咸池", "孤辰": "孤辰", "寡宿": "寡宿" };
const norm = (s) => S2T[s] || s;
const timeIndexOf = (h) => Math.floor((h + 1) / 2) % 12;
const localToUTC = (y, mo, d, h, mi) => new Date(Date.UTC(y, mo - 1, d, h - 7, mi, 0));

const cases = [
  { label: "Aeaw 1984-12-31 13:15 M", y: 1984, mo: 12, d: 31, h: 13, mi: 15, g: "M", ig: "male" },
  { label: "Mai 1986-04-12 16:42 F", y: 1986, mo: 4, d: 12, h: 16, mi: 42, g: "F", ig: "female" },
  { label: "T3 1990-06-15 08:30 M", y: 1990, mo: 6, d: 15, h: 8, mi: 30, g: "M", ig: "male" },
  { label: "T4 2000-01-01 23:30 F", y: 2000, mo: 1, d: 1, h: 23, mi: 30, g: "F", ig: "female" },
  { label: "T5 1975-09-21 17:45 M", y: 1975, mo: 9, d: 21, h: 17, mi: 45, g: "M", ig: "male" },
];

let pass = 0, fail = 0;
const failLines = [];
for (const c of cases) {
  const dt = localToUTC(c.y, c.mo, c.d, c.h, c.mi);
  const chart = ziweiChart(dt, 13.7, 100.5, c.g, true, { gmtOffsetHours: 7 });
  const dateStr = `${c.y}-${String(c.mo).padStart(2, "0")}-${String(c.d).padStart(2, "0")}`;
  const a = astro.bySolar(dateStr, timeIndexOf(c.h), c.ig, true, "zh-CN");

  // iztro: star → branch (รวม minorStars + adjectiveStars)
  const iz = new Map();
  for (const p of a.palaces) for (const arr of [p.minorStars, p.adjectiveStars]) for (const s of arr) iz.set(norm(s.name), p.earthlyBranch);
  // ours: star → { branch, palaceName }
  const ours = new Map();
  for (const p of chart.palaces) for (const s of p.minorStars) ours.set(s.name, { branch: p.branch, palace: p.name });

  for (const star of TARGET) {
    const o = ours.get(star), ib = iz.get(star);
    if (!o) { fail++; failLines.push(`❌ ${c.label} ${star} engine ไม่มี (iztro=${ib || "-"})`); continue; }
    if (!ib) { fail++; failLines.push(`❌ ${c.label} ${star} iztro ไม่มี (engine=${o.branch})`); continue; }
    if (o.branch === ib) pass++;
    else { fail++; failLines.push(`❌ ${c.label} ${star} engine=${o.branch} iztro=${ib}`); }
  }
}

// ตาราง ดาว×เรือน ของดวงเอี๊ยว (เทียบ iztro)
const c0 = cases[0];
const chart0 = ziweiChart(localToUTC(c0.y, c0.mo, c0.d, c0.h, c0.mi), 13.7, 100.5, c0.g, true, { gmtOffsetHours: 7 });
const a0 = astro.bySolar("1984-12-31", timeIndexOf(c0.h), c0.ig, true, "zh-CN");
const iz0 = new Map();
for (const p of a0.palaces) for (const arr of [p.minorStars, p.adjectiveStars]) for (const s of arr) iz0.set(norm(s.name), p.earthlyBranch);
const ours0 = new Map();
for (const p of chart0.palaces) for (const s of p.minorStars) ours0.set(s.name, { branch: p.branch, palace: p.name });
console.log(`\n=== ตารางดาว×เรือน · ${c0.label} (เทียบ iztro) ===`);
console.log("ดาว\tเรือน(engine)\t地支\tiztro地支\tตรง?");
for (const star of TARGET) {
  const o = ours0.get(star), ib = iz0.get(star);
  console.log(`${star}\t${o ? o.palace : "-"}\t${o ? o.branch : "-"}\t${ib || "-"}\t${o && ib && o.branch === ib ? "✅" : "❌"}`);
}

console.log("");
for (const l of failLines) console.log(l);
console.log(`\nรวม: ${pass} ผ่าน · ${fail} ไม่ผ่าน (${cases.length} ดวง × ${TARGET.length} ดาว = ${cases.length * TARGET.length} จุด)`);
process.exit(fail ? 1 : 0);
