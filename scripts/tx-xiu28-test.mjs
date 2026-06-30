import { xiuBoundaries, shuAt, XIU28 } from "../src/lib/tianxing/xiu28.ts";
let p=0,f=0; const ok=(n,c)=>{ c?p++:(f++,console.log("  ✗ "+n)); };
const d=new Date("1684-06-01T00:00:00Z");
const b=xiuBoundaries(d);
let sum=0; for(let i=0;i<28;i++){ sum += ((b[(i+1)%28]-b[i])%360+360)%360; }
ok(`ขอบรวม=360 (ได้ ${sum.toFixed(2)})`, Math.abs(sum-360)<0.01);
ok("28 距星", XIU28.length===28);
const anchors=[
 [0,"箕",3.167],[1,"牛",0.383],[2,"危",1.0],[3,"室",10.95],[4,"婁",0.45],[5,"昴",5.2],
 [6,"觜",10.633],[7,"井",29.083],[8,"星",7.067],[9,"翼",10.617],[10,"角",10.567],[11,"房",1.65]];
let maxe=0;
for(const [k,zh,adeg] of anchors){
  const lam=((270+k*30)%360+360)%360;
  const r=shuAt(lam,d);
  if(k===6){ ok(`次6 觜參 anomaly (ได้ ${r.zh}${r.deg}° · known·清史稿卷28)`, ["觜","參"].includes(r.zh)); continue; }
  const hit=r.zh===zh; const derr=Math.abs(r.deg-adeg)*60;
  if(hit) maxe=Math.max(maxe,derr);
  ok(`次${k}→${zh} (ได้ ${r.zh}${r.deg}° ต่าง${derr.toFixed(0)}′)`, hit && derr<40);
}
console.log(`  anchor度 ต่างมากสุด ${maxe.toFixed(0)}′ (ไม่นับ觜參)`);
console.log(`\n${f===0?"✅ PASS":"❌ FAIL"} ${p}/${p+f}`);
process.exit(f?1:0);
