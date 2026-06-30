import { buildSciencePrompt, buildJudgePrompt } from "../src/lib/fusion5/build-prompt.ts";
const A={name:"เอ๋ว",dtUTC:new Date("1984-12-31T06:15:00Z"),lat:13.75,lng:100.5,hasTime:true,gender:"M"};
const B={name:"หมาย",dtUTC:new Date("1986-04-07T17:04:00Z"),lat:13.36,lng:100.98,hasTime:true,gender:"F"};
for(const sci of ["qizheng","western","vedic"]){
  const p=buildSciencePrompt(sci,[A],"การงานปีนี้เป็นไง","th");
  console.log(`\n##### ${sci} (เดี่ยว) — ${p.length} chars · ตัวอย่างหัว:`);
  console.log(p.split("\n").slice(0,4).join("\n"));
}
// couple
const pc=buildSciencePrompt("western",[A,B],"คู่นี้เข้ากันไหม","th");
console.log("\n##### western (ดูคู่) มี 2 ผัง:", (pc.match(/=== ผังดวง/g)||[]).length, "· มีบล็อกดูคู่:", pc.includes("=== ดูคู่"));
// judge
const j=buildJudgePrompt([{science:"qizheng",reply:"งานเด่น"},{science:"western",reply:"MC แข็ง"}],[A],"งาน","th");
console.log("judge prompt:", j.length, "chars · ติดป้ายศาสตร์:", j.includes("七政四餘")&&j.includes("โหราตะวันตก"));
