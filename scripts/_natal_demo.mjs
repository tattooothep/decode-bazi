import { tianxingReading } from "../src/lib/tianxing/index.ts";
const r = tianxingReading(new Date("1984-12-31T06:15:00Z"), 13.75, 100.5);
console.log("══ ผังดาวจริง 七政四餘 · 31/12/1984 13:15 ชาย กทม ══");
console.log("命宮(ลัคนา):", r.ascendant.signTh, r.ascendant.signZh, "· 命主/用神:", r.yongshen.th, r.yongshen.zh, "("+r.yongshen.status+")");
console.log("\nดาว           ราศี      宿        กำลัง");
for(const s of r.stars){
  console.log((s.zh+" "+s.th).padEnd(14), (s.signTh||"").padEnd(7), (s.shu||"-")+" "+s.shuDeg+"°", "  "+s.status, s.retro?"↺":"");
}
console.log("\n恩星(หนุน用神):", r.en_stars.map(s=>s.th).join("、")||"-");
console.log("用星:", r.yong_stars.map(s=>s.th).join("、")||"-", "· 仇星:", r.chou_stars.map(s=>s.th).join("、")||"-");
console.log("難星(ขัด用神):", r.nan_stars.map(s=>s.th).join("、")||"-");
console.log("格局:", r.geju.map(g=>g.th+(g.good?" ✓":" ✗")).join(" · ")||"-");
console.log("\nสรุป:", r.verdictTh.th, "("+r.level+")");
console.log("เหตุผล:"); r.reasons.forEach(x=>console.log("  • "+x.th));
