import { tianxingReading } from "../src/lib/tianxing/index.ts";
const HOUSE=["命(ตัวเอง)","財帛(เงิน)","兄弟","田宅(บ้าน)","子女(ลูก/สร้างสรรค์)","奴僕","妻妾(คู่)","疾厄(สุขภาพ)","遷移(ต่างแดน/โอกาส)","官祿(การงาน)","福德(บุญ/สุข)","相貌(ปัญญา)"];
const ascSign=0;
console.log("ดาวจร(transit)ทาบดวงเกิด · ลัคนาเมษ · 木/土=ดาวบอกจังหวะใหญ่");
for(let y=2015;y<=2025;y++){
  const r=tianxingReading(new Date(y+"-06-15T05:00:00Z"),13.75,100.5);
  const J=r.stars.find(s=>s.key==="Jupiter"), S=r.stars.find(s=>s.key==="Saturn");
  const hJ=((J.sign-ascSign+12)%12), hS=((S.sign-ascSign+12)%12);
  console.log(`${y} | 木 ${J.signTh}→เรือน${hJ+1} ${HOUSE[hJ]} | 土 ${S.signTh}→เรือน${hS+1} ${HOUSE[hS]}`);
}
