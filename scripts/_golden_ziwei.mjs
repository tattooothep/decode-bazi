/**
 * _golden_ziwei.mjs · เทียบ engine กับ iztro (oracle)
 *   命宮地支 · 身宮 · 五行局 · ตำแหน่ง紫微 · 14主星 distribution + 廟旺 · 四化 · 輔煞 placement
 * รัน: npx tsx scripts/_golden_ziwei.mjs
 * — Ziwei engine
 */
import { astro } from "iztro";
import { ziweiChart } from "../src/lib/astro/ziwei/engine.ts";

function localToUTC(y, mo, d, h, mi, offset = 7) {
  return new Date(Date.UTC(y, mo - 1, d, h - offset, mi, 0));
}

/* simp→trad normalize เพื่อเทียบชื่อดาว */
const S2T = {
  "紫微":"紫微","天机":"天機","太阳":"太陽","武曲":"武曲","天同":"天同","廉贞":"廉貞","天府":"天府",
  "太阴":"太陰","贪狼":"貪狼","巨门":"巨門","天相":"天相","天梁":"天梁","七杀":"七殺","破军":"破軍",
  "左辅":"左輔","右弼":"右弼","文昌":"文昌","文曲":"文曲","禄存":"祿存","擎羊":"擎羊","陀罗":"陀羅",
  "火星":"火星","铃星":"鈴星","地空":"地空","地劫":"地劫","天魁":"天魁","天钺":"天鉞","天马":"天馬",
  "红鸾":"紅鸞","天喜":"天喜",
};
const BR = { miao:"廟", wang:"旺", de:"得", li:"利", ping:"平", xian:"陷", bu:"不",
  "庙":"廟","旺":"旺","得":"得","利":"利","平":"平","陷":"陷","不":"不" };
const norm = (s) => S2T[s] || s;
const MUT = { "禄":"祿","权":"權","科":"科","忌":"忌" };

/* timeIndex iztro 0..11 (子=0), 23:00-00:59→0 */
const timeIndexOf = (h) => Math.floor((h + 1) / 2) % 12;

const cases = [
  { label: "Aeaw 1984-12-31 13:15 ชาย", y:1984,mo:12,d:31,h:13,mi:15, g:"M", iztroG:"male" },
  { label: "Mai 1986-04-08 00:04 หญิง", y:1986,mo:4,d:8,h:0,mi:4, g:"F", iztroG:"female" },
];

let totalChecks = 0, totalFail = 0;

for (const c of cases) {
  console.log("\n==================================================");
  console.log("GOLDEN:", c.label);
  console.log("==================================================");
  const dt = localToUTC(c.y, c.mo, c.d, c.h, c.mi);
  const mine = ziweiChart(dt, 13.7, 100.5, c.g, true, { gmtOffsetHours: 7 });

  const dateStr = `${c.y}-${String(c.mo).padStart(2,"0")}-${String(c.d).padStart(2,"0")}`;
  const ti = timeIndexOf(c.h);
  const a = astro.bySolar(dateStr, ti, c.iztroG, true, "zh-CN");

  const fails = [];
  const check = (name, got, exp) => {
    totalChecks++;
    const ok = got === exp;
    if (!ok) { totalFail++; fails.push(`  ✗ ${name}: engine=${got} · iztro=${exp}`); }
    else console.log(`  ✓ ${name}: ${got}`);
  };

  check("命宮地支", mine.mingGong.branch, a.earthlyBranchOfSoulPalace);
  check("身宮地支", mine.shenGong.branch, a.earthlyBranchOfBodyPalace);
  check("五行局", mine.wuxingJu.name, a.fiveElementsClass);
  check("紫微地支", ["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"][(mine.ziweiGround+2)%12], a.palaces.find(p=>p.majorStars.some(s=>norm(s.name)==="紫微")).earthlyBranch);

  /* index iztro palace ตาม branch */
  const izByBranch = {};
  for (const p of a.palaces) izByBranch[p.earthlyBranch] = p;

  /* 14 主星 + 廟旺 ต่อ branch */
  for (const pal of mine.palaces) {
    const iz = izByBranch[pal.branch];
    const myMaj = pal.majorStars.map(s => `${s.name}(${s.brightness})`).sort().join(",");
    const izMaj = iz.majorStars.map(s => `${norm(s.name)}(${BR[s.brightness]||s.brightness})`).sort().join(",");
    check(`主星@${pal.branch}`, myMaj || "—", izMaj || "—");
  }

  /* 四化 (star → type) */
  const mySi = mine.siHua.map(s => `${s.star}${s.type}`).sort().join(",");
  const izSi = [];
  for (const p of a.palaces) for (const s of [...p.majorStars, ...p.minorStars]) if (s.mutagen) izSi.push(`${norm(s.name)}${MUT[s.mutagen]||s.mutagen}`);
  check("四化", mySi, izSi.sort().join(","));

  /* 輔煞 placement (เทียบเฉพาะดาวที่ iztro มี: minorStars + adjective 火鈴空劫魁鉞馬左右昌曲祿羊陀紅鸞天喜) */
  const TRACK = new Set(["左輔","右弼","文昌","文曲","祿存","擎羊","陀羅","火星","鈴星","地空","地劫","天魁","天鉞","天馬","紅鸞","天喜"]);
  /* รวมตำแหน่ง iztro จากทุก category */
  const izMinorBranch = {}; // star → branch
  for (const p of a.palaces) {
    const all = [...p.majorStars, ...p.minorStars, ...(p.adjectiveStars||[])];
    for (const s of all) { const n = norm(s.name); if (TRACK.has(n)) izMinorBranch[n] = p.earthlyBranch; }
  }
  const myMinorBranch = {};
  for (const pal of mine.palaces) for (const s of pal.minorStars) if (TRACK.has(s.name)) myMinorBranch[s.name] = pal.branch;
  for (const star of TRACK) {
    if (izMinorBranch[star]) check(`輔煞 ${star}`, myMinorBranch[star] || "MISSING", izMinorBranch[star]);
  }

  if (fails.length) { console.log("\n  --- MISMATCH ---"); fails.forEach(f => console.log(f)); }
}

console.log("\n==================================================");
console.log(`รวม ${totalChecks} checks · ผ่าน ${totalChecks-totalFail} · ไม่ผ่าน ${totalFail}`);
console.log(totalFail === 0 ? "✅ GOLDEN PASS — ตรง iztro เป๊ะ" : "❌ GOLDEN FAIL");
console.log("==================================================");
process.exit(totalFail === 0 ? 0 : 1);
