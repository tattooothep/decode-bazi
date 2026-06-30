import { buildSciencePrompt, loadCanon, renderChartForScience } from "../src/lib/fusion5/build-prompt.ts";
const A={name:"เอ๋ว",dtUTC:new Date("1984-12-31T06:15:00Z"),lat:13.75,lng:100.5,hasTime:true,gender:"M"};
for(const s of ["qizheng","western","vedic","ziwei"]){
  const canon=loadCanon(s), chart=renderChartForScience(s,A,new Date("2026-06-30T00:00:00Z")), full=buildSciencePrompt(s,[A],"การงานปีนี้เป็นไง","th");
  console.log(`\n### ${s} · prompt รวม ${full.length} ตัว`);
  console.log(`   คัมภีร์: ${canon.length} · ผัง(packet render): ${chart.length} · มี guard กันมั่ว: ${full.includes("⚠️")}`);
  console.log(`   ครบ 4 ส่วน: คัมภีร์[${full.includes("=== คัมภีร์")?"✓":"✗"}] ผัง[${full.includes("=== ผังดวง")?"✓":"✗"}] คำถาม[${full.includes("=== คำถาม")?"✓":"✗"}] guard[${full.includes("ห้ามเดาตำแหน่ง")?"✓":"✗"}]`);
}
