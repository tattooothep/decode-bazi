import { ascendant, eclipticLon, computeBodies, midheaven } from "../src/lib/astro-core/ephemeris.ts";
import { lahiriAyanamsa, toSidereal } from "../src/lib/astro-core/ayanamsa.ts";
import { houses, houseOf } from "../src/lib/astro-core/houses.ts";
const dt=new Date("1984-12-31T06:15:00Z"), lat=13.75, lng=100.5;
const SIGN=["เมษ","พฤษภ","เมถุน","กรกฎ","สิงห์","กันย์","ตุล","พิจิก","ธนู","มังกร","กุมภ์","มีน"];
const asc=ascendant(dt,lat,lng);
console.log("=== TEST astro-core · 31/12/1984 13:15 กทม ===");
console.log("ลัคนา(tropical):", asc.toFixed(2), "=", SIGN[Math.floor(asc/30)], "(tianxing เดิม=เมษ ✓ ถ้าตรง)");
console.log("MC:", midheaven(dt,lng).toFixed(2));
console.log("Lahiri ayanamsa 1984:", lahiriAyanamsa(dt).toFixed(4), "° (คาดหวัง ~23.6)");
console.log("\n--- ดาว tropical vs sidereal(Vedic) ---");
for(const b of computeBodies(dt,{modern:true,apogee:false})){
  const sid=toSidereal(b.lon,dt);
  console.log((b.key+":").padEnd(9), "trop", b.lon.toFixed(1).padStart(6), SIGN[Math.floor(b.lon/30)].padEnd(5),
    "| sid", sid.toFixed(1).padStart(6), SIGN[Math.floor(sid/30)].padEnd(5), b.retro?"R":"");
}
console.log("\n--- เรือน whole-sign (ลัคนาเมษ) ---");
const sun=eclipticLon("Sun",dt);
console.log("อาทิตย์ tropical อยู่เรือน:", houseOf(sun,asc,"whole"));
console.log("เรือน 1-12:", houses(asc,"whole").map(h=>SIGN[h.sign]).join(" "));
