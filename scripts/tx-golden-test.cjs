const A=require("astronomy-engine");
// โหลด ts ผ่าน transpile ง่ายๆ: ใช้ require ของ next ไม่ได้ใน cjs → จำลองฟังก์ชันจาก ephemeris.ts ตรงๆ
const norm360=d=>((d%360)+360)%360, D2R=Math.PI/180,R2D=180/Math.PI;
const jdOf=date=>date.getTime()/86400000+2440587.5, tOf=date=>(jdOf(date)-2451545)/36525;
function eclLon(b,d){ if(b==="Sun")return norm360(A.SunPosition(d).elon); return norm360(A.Ecliptic(A.GeoVector(b,d,true)).elon); }
function obliquity(d){const T=tOf(d);return 23.439291-0.0130042*T;}
function ascendant(d,lat,lng){const gst=A.SiderealTime(d);const ramc=norm360(gst*15+lng);const eps=obliquity(d)*D2R,phi=lat*D2R,th=ramc*D2R;return norm360(Math.atan2(Math.cos(th),-(Math.sin(th)*Math.cos(eps)+Math.tan(phi)*Math.sin(eps)))*R2D);}

// GOLDEN: พระอาทิตย์ขึ้น → Sun ecliptic lon ≈ Ascendant (±3°)
const obs=new A.Observer(13.7563,100.5018,10);
let pass=0,tot=0;
for(const dstr of ["2026-03-21","2026-06-21","2026-09-23","2026-12-22","2026-07-09"]){
  const sr=A.SearchRiseSet("Sun",obs,+1,new Date(dstr+"T00:00:00Z"),1);
  const d=sr.date;
  const sun=eclLon("Sun",d), asc=ascendant(d,13.7563,100.5018);
  let diff=Math.abs(sun-asc); if(diff>180)diff=360-diff;
  tot++; const ok=diff<4; if(ok)pass++;
  console.log(`${dstr} sunrise ${d.toISOString().slice(11,16)}Z · Sun=${sun.toFixed(2)}° Asc=${asc.toFixed(2)}° diff=${diff.toFixed(2)}° ${ok?"✓":"✗"}`);
}
console.log(`\nGOLDEN ascendant: ${pass}/${tot} ${pass===tot?"✓ ลัคนาถูกต้อง (Sun≈Asc ตอนอาทิตย์ขึ้น)":"✗"}`);
// retrograde sanity: Mars 2026 มีช่วงถอยไหม
console.log("\nMars retro 2026-01-01:", (()=>{const a=eclLon("Mars",new Date("2026-01-01T00:00:00Z")),b=eclLon("Mars",new Date("2025-12-31T00:00:00Z"));let df=a-b;if(df>180)df-=360;if(df<-180)df+=360;return df<0?"ถอย":"เดินหน้า";})());
