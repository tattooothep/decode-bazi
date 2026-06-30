import { fourRelations, GEJU_RULES } from "../src/lib/tianxing/tables.ts";
import { tianxingReading } from "../src/lib/tianxing/index.ts";
let p=0,f=0; const eq=(n,g,e)=>{ const G=JSON.stringify(g),E=JSON.stringify(e); if(G===E)p++; else{f++;console.log(`  ✗ ${n}: ${G} ≠ ${E}`);} };
// A3 · 4-leg
eq("水 4-leg", fourRelations("Mercury"), {en:["metal"],yong:["wood"],chou:["fire"],nan:["earth"],special:false});
eq("火 4-leg", fourRelations("Mars"), {en:["wood"],yong:["earth"],chou:["metal"],nan:["water"],special:false});
eq("木 4-leg", fourRelations("Jupiter"), {en:["water"],yong:["fire"],chou:["earth"],nan:["metal"],special:false});
eq("金 4-leg", fourRelations("Venus"), {en:["earth"],yong:["water"],chou:["wood"],nan:["fire"],special:false});
eq("土 4-leg", fourRelations("Saturn"), {en:["fire"],yong:["metal"],chou:["water"],nan:["wood"],special:false});
eq("日 special", fourRelations("Sun").special, true);
eq("月 special", fourRelations("Moon").special, true);
// A4 · 格局 sign rule
const ctx=(m)=>({signOf:(k)=>m[k]??null, ascSign:0});
const has=(id,c)=>GEJU_RULES.find(r=>r.id===id).test(c);
eq("日居午=合", has("sun_own", ctx({Sun:4})), true);
eq("日在未=忌", has("sun_moon_seat", ctx({Sun:3})), true);
eq("木入金鄉(辰6)=忌", has("jupiter_metal", ctx({Jupiter:6})), true);
eq("木居垣(寅8)=合", has("jupiter_yuan", ctx({Jupiter:8})), true);
eq("木ที่อื่น(午4)=ไม่เข้า", has("jupiter_yuan", ctx({Jupiter:4})), false);
// integration: รัน reading จริง ไม่ error + มี field ใหม่
const r = tianxingReading(new Date("2026-06-30T03:00:00Z"), 13.75, 100.5);
eq("reading มี yong_stars", Array.isArray(r.yong_stars), true);
eq("reading มี chou_stars", Array.isArray(r.chou_stars), true);
eq("reading geju เป็น array", Array.isArray(r.geju), true);
eq("level valid", ["top","good","neutral","bad"].includes(r.level), true);
console.log(`\n${f===0?"✅ PASS":"❌ FAIL"} ${p}/${p+f}`);
process.exit(f?1:0);
