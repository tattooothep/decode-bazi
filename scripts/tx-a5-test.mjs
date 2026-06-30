import { ziqiLon, shuAt } from "../src/lib/tianxing/xiu28.ts";
import { tianxingReading } from "../src/lib/tianxing/index.ts";
let p=0,f=0; const ok=(n,c)=>{ c?p++:(f++,console.log("  ✗ "+n)); };
// verify 1752 紫氣 ตก 心/尾 region (ปฏิทินว่า尾 · ±1宿)
const z1752=ziqiLon(new Date(Date.UTC(1752,1,1)));
const sh=shuAt(z1752, new Date(Date.UTC(1752,1,1)));
ok(`紫氣 1752 = ${sh.zh}${sh.deg}° (ปฏิทิน:尾 · รับ心/尾/箕)`, ["心","尾","箕"].includes(sh.zh));
// reading มี 紫氣
const r=tianxingReading(new Date("2026-06-30T03:00:00Z"),13.75,100.5);
const zq=r.stars.find(s=>s.key==="Ziqi");
ok("reading มี 紫氣", !!zq);
ok("紫氣 มี宿+sign", !!zq && typeof zq.shu==="string" && zq.sign>=0&&zq.sign<12);
ok("紫氣 เดินหน้า(順·ไม่ retro)", !!zq && zq.retro===false);
ok("四餘ครบ 4 (羅計孛氣)", ["Rahu","Ketu","Yuebo","Ziqi"].every(k=>r.stars.some(s=>s.key===k)));
console.log(`\n${f===0?"✅ PASS":"❌ FAIL"} ${p}/${p+f}`);
process.exit(f?1:0);
