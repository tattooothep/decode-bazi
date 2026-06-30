import { tianxingReading } from "../src/lib/tianxing/index.ts";
import { miaoWangDeg } from "../src/lib/tianxing/tables.ts";
let p=0,f=0; const ok=(n,c)=>{ c?p++:(f++,console.log("  ✗ "+n)); };
// miaoWangDeg unit
ok("日@奎10°=正廟", miaoWangDeg("Sun","奎",10)?.code==="廟");
ok("日@奎14°=ไม่เข้า(null)", miaoWangDeg("Sun","奎",14)===null);
ok("土@斗15°=正廟", miaoWangDeg("Saturn","斗",15)?.code==="廟");
ok("水@箕(升殿)", miaoWangDeg("Mercury","箕",3)?.code==="升殿");
ok("火@奎(樂)", miaoWangDeg("Mars","奎",5)?.code==="樂");
ok("木@อื่น(null)", miaoWangDeg("Jupiter","女",5)===null);
// integration: reading มี shu + ทำงาน
const r=tianxingReading(new Date("2026-06-30T03:00:00Z"),13.75,100.5);
ok("ดาวมี shu", r.stars.every(s=>typeof s.shu==="string"&&s.shu.length>0));
ok("ดาวมี shuDeg 0-33", r.stars.every(s=>s.shuDeg>=0&&s.shuDeg<34));
ok("statusRank มี (1-6)", r.stars.every(s=>s.statusRank>=1&&s.statusRank<=6));
console.log(`\n${f===0?"✅ PASS":"❌ FAIL"} ${p}/${p+f}`);
process.exit(f?1:0);
