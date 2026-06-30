import { tianxingReading } from "../src/lib/tianxing/index.ts";
const dt=new Date("1986-04-07T17:04:00Z"), lat=13.36, lng=100.98;
const r=tianxingReading(dt,lat,lng);
console.log("== ผัง 七政四餘 · 08/04/1986 00:04 หญิง ชลบุรี ==");
console.log("命宮:",r.ascendant.signTh,"· 命主/用神:",r.yongshen.th,"("+r.yongshen.status+")");
console.log("ดาวเด่น(แข็ง):");
for(const s of r.stars) if(s.statusRank>=4) console.log("  ",s.zh,s.th,"·",s.signTh,s.shu+s.shuDeg+"° ·",s.status);
console.log("恩星:",r.en_stars.map(s=>s.th).join("、")||"-","· 難星:",r.nan_stars.map(s=>s.th).join("、")||"-");
console.log("格局:",r.geju.map(g=>g.th+(g.good?"✓":"✗")).join(" · ")||"-","· สรุป:",r.verdictTh.th);
const a=r.ascendant.sign;
const H=["命","財帛(เงิน)","兄弟","田宅(บ้าน)","子女(ลูก)","奴僕","妻妾(คู่)","疾厄(สุขภาพ)","遷移(ต่างแดน)","官祿(งาน)","福德(บุญ)","相貌(ปัญญา)"];
console.log("\n== ดาวจร 10 ปี (ลัคนา"+r.ascendant.signTh+") ==");
for(let y=2015;y<=2025;y++){
  const rr=tianxingReading(new Date(y+"-06-15T05:00:00Z"),lat,lng);
  const J=rr.stars.find(s=>s.key==="Jupiter"),S=rr.stars.find(s=>s.key==="Saturn");
  console.log(`${y} | 木→เรือน${((J.sign-a+12)%12)+1} ${H[(J.sign-a+12)%12]} | 土→เรือน${((S.sign-a+12)%12)+1} ${H[(S.sign-a+12)%12]}`);
}
