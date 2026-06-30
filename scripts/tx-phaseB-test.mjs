import { combineScores } from "../src/lib/luck-engine/combineScores.ts";
import { getNormalizedWeights } from "../src/lib/luck-engine/weights.ts";
import { ALL_MODULES, UNIVERSAL_MODULES } from "../src/lib/luck-engine/types.ts";
let p=0,f=0; const ok=(n,c)=>{ c?p++:(f++,console.log("  ✗ "+n)); };
const mr=(norm)=>({module:"x",status:"ready",score:{raw:norm,normalized:norm,weight:1},pass:true,tags:[],reasons:{up:[],down:[],warning:[]},confidence:1,raw:{}});
// modules: ze_ri + ba_zi + tian_xing(มีใน modules)
const modules={ ze_ri:mr(70), ba_zi:mr(60), tian_xing:mr(95) };
// 1) ไม่ติ๊ก tian_xing → คะแนนเท่ากับไม่มี tian_xing เลย (ZERO-EFFECT)
const without = combineScores(modules, ["ze_ri","ba_zi"], "立約").finalScore;
const ref = combineScores({ze_ri:mr(70),ba_zi:mr(60)}, ["ze_ri","ba_zi"], "立約").finalScore;
ok(`zero-effect: ไม่ติ๊ก=${without} == ไม่มีเลย=${ref}`, without===ref);
// 2) ติ๊ก tian_xing → คะแนนเปลี่ยน (มีผล)
const withTx = combineScores(modules, ["ze_ri","ba_zi","tian_xing"], "立約").finalScore;
ok(`ติ๊ก tian_xing → คะแนนเปลี่ยน (${without}→${withTx})`, withTx!==without);
ok(`ติ๊ก tian_xing(95) ดึงคะแนนขึ้น`, withTx>without);
// 3) weights: ไม่ active tian_xing → normalize รวม=1.0 (ดาวอื่นเหมือนเดิม)
const w=getNormalizedWeights("立約",["ze_ri","ba_zi","tai_sui"]);
const sum=Object.values(w).reduce((a,b)=>a+b,0);
ok(`normalize ไม่มี tian_xing รวม=1.0 (${sum.toFixed(3)})`, Math.abs(sum-1)<0.001);
ok("tian_xing ∈ ALL_MODULES", ALL_MODULES.includes("tian_xing"));
ok("tian_xing ∉ UNIVERSAL (ไม่เข้า hard SQL · บั๊ก#1 fix)", !UNIVERSAL_MODULES.includes("tian_xing"));
console.log(`\n${f===0?"✅ PASS":"❌ FAIL"} ${p}/${p+f}`);
process.exit(f?1:0);
