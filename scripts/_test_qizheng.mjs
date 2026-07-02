import { qizhengNatal, qizhengTransit } from "../src/lib/astro/qizheng/engine.ts";
const n = qizhengNatal(new Date("1984-12-31T06:15:00Z"),13.75,100.5);
console.log("=== 七政四餘 12宮 · 31/12/1984 ลัคนา"+n.reading.ascendant.signTh+" 命主"+n.reading.yongshen.th+" ===");
console.log("命度/度主:", n.reading.mingDegree.shu + n.reading.mingDegree.shuDeg + "°", n.reading.mingDegree.lordTh, n.reading.mingDegree.lordStatus);
console.log("身主(月為身):", n.reading.shenDegree.shu + n.reading.shenDegree.shuDeg + "°", n.reading.shenDegree.lordTh, n.reading.shenDegree.lordStatus);
for(const h of n.houses){
  const mark = h.level==="good"?"⭐":h.level==="weak"?"⚠":"·";
  console.log(`${mark} ${h.house} ${h.zh}(${h.domain.split("·")[0]}) — ${h.signTh} เจ้า=${h.rulerTh}(${h.rulerStatus})→เรือน${h.rulerInHouse} ${h.starsInHouse.map(s=>s.th).join("+")||""}`);
}
console.log("\n=== ดาวจร 2017-2024 ===");
for(const t of qizhengTransit(n.reading.ascendant.sign,[2017,2018,2019,2020,2021,2023])){
  console.log(t.year, "·", t.note);
}
