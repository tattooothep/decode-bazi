// ทดสอบ Ashtakoota (Guna Milan 36) — spot-check มือจากตาราง saravali.github.io (CC BY-SA 4.0)
// run: npx tsx scripts/test-vedic-ashtakoota.mjs
import { ashtakoota, ASHTAKOOTA_ATTRIBUTION } from "../src/lib/astro/vedic/ashtakoota.ts";
import { renderPairInteractionPacket } from "../src/lib/fusion5/pair-interactions.ts";
import { buildSciencePrompt } from "../src/lib/fusion5/build-prompt.ts";

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.log(`❌ ${name} ${detail}`); }
};
const kuta = (res, key) => res.kutas.find((k) => k.key === key);

// ============ Spot-check 1 (คำนวณมือจากตาราง saravali):
// bride: Aswini (nak 0) จันทร์ราศีเมษ (0) · groom: Chitra (nak 13) จันทร์ราศีตุล (6)
// - Varna: เมษ=Kshatriya, ตุล=Vaishya → แถว bride "Kshattriya | 1 | 1 | 0 | 0" ช่อง Vaishya = 0
// - Vashya: เมษ=Quadruped, ตุล=Human → แถว "Quadruped | 2 | 0 | 0 | 0.5 | 0" ช่อง Human = 0
// - Dina: groom→bride count = 15 → 15%9=6 (ไม่ใช่ 3/5/7) = 1.5 · bride→groom = 14 → 14%9=5 = 0 → รวม 1.5
// - Yoni: Aswini=Horse, Chitra=Tiger → แถว "Horse | 4 2 2 3 2 2 2 1 0 [Tiger]=1 ..." = 1
// - Graha: เมษ lord=Mars, ตุล lord=Venus → ทั้งคู่ neutral ต่อกัน → "Both Neutral | 3"
// - Gana: Aswini=Deva, Chitra=Rakshas → แถว "Deva | 6 | 6 | 0" ช่อง Rakshasa = 0
// - Rasi: เมษ→ตุล = ตำแหน่ง 7 (benefic 1,3,4,7,10,11) = 7
// - Nadi: Aswini=Adi, Chitra=Madhya → ต่างกัน = 8
// รวม = 0+0+1.5+1+3+0+7+8 = 20.5
const r1 = ashtakoota({ nakshatraIndex: 0, rashi: 0 }, { nakshatraIndex: 13, rashi: 6 });
ok("S1 varna=0", kuta(r1, "varna").score === 0);
ok("S1 vashya=0", kuta(r1, "vashya").score === 0);
ok("S1 dina=1.5", kuta(r1, "dina").score === 1.5);
ok("S1 yoni=1 (Horse×Tiger)", kuta(r1, "yoni").score === 1 && kuta(r1, "yoni").bride === "Horse" && kuta(r1, "yoni").groom === "Tiger");
ok("S1 grahaMaitri=3 (Mars×Venus both neutral)", kuta(r1, "grahaMaitri").score === 3);
ok("S1 gana=0 (Deva×Rakshasa)", kuta(r1, "gana").score === 0);
ok("S1 rasi=7 (ตำแหน่ง 7)", kuta(r1, "rasi").score === 7);
ok("S1 nadi=8 (Adi×Madhya)", kuta(r1, "nadi").score === 8);
ok("S1 total=20.5", r1.total === 20.5, `got ${r1.total}`);

// ============ Spot-check 2: ทั้งคู่ Rohini (nak 3) จันทร์ราศีพฤษภ (1)
// - Varna: พฤษภ=Shudra ทั้งคู่ → แถว "Shudra | 1 | 1 | 1 | 1" = 1
// - Vashya: Quadruped ทั้งคู่ = 2
// - Dina: count=1 ทั้งสองทิศ → เศษ 1 = 1.5+1.5 = 3
// - Yoni: Rohini=Serpent ทั้งคู่ → diagonal = 4
// - Graha: Venus×Venus → mutual friendship = 5 (PyJHora 7x7 diagonal = 5.0)
// - Gana: Rohini=Manuj ทั้งคู่ → "Manushya | 5 | 6 | 0" ช่อง Manushya = 6
// - Rasi: ตำแหน่ง 1 (benefic) = 7
// - Nadi: Antya ทั้งคู่ → เหมือนกัน = 0 (Nadi dosha)
// รวม = 1+2+3+4+5+6+7+0 = 28
const r2 = ashtakoota({ nakshatraIndex: 3, rashi: 1 }, { nakshatraIndex: 3, rashi: 1 });
ok("S2 varna=1", kuta(r2, "varna").score === 1);
ok("S2 vashya=2", kuta(r2, "vashya").score === 2);
ok("S2 dina=3", kuta(r2, "dina").score === 3);
ok("S2 yoni=4 (Serpent×Serpent)", kuta(r2, "yoni").score === 4);
ok("S2 grahaMaitri=5 (Venus×Venus)", kuta(r2, "grahaMaitri").score === 5);
ok("S2 gana=6 (Manushya×Manushya)", kuta(r2, "gana").score === 6);
ok("S2 rasi=7", kuta(r2, "rasi").score === 7);
ok("S2 nadi=0 (Nadi dosha)", kuta(r2, "nadi").score === 0);
ok("S2 total=28", r2.total === 28, `got ${r2.total}`);
// Rajju: ทั้งคู่ Rohini = Kanta/Aroha → same rajju same type = 0
ok("S2 rajju=0 (same rajju same type)", r2.rajju.score === 0 && r2.rajju.bride === "Kanta/Aroha");

// ============ Spot-check 3 (จุด variant + ทิศทาง):
// - Yoni ไม่สมมาตรตามต้นทาง saravali: Horse(bride)×Deer(groom)=3 · Deer(bride)×Horse(groom)=1
const yHD = ashtakoota({ nakshatraIndex: 0, rashi: 0 }, { nakshatraIndex: 17, rashi: 7 }); // Aswini=Horse × Jyeshta=Deer
const yDH = ashtakoota({ nakshatraIndex: 17, rashi: 7 }, { nakshatraIndex: 0, rashi: 0 });
ok("S3 yoni Horse(bride)×Deer=3 (saravali · PyJHora variant=1 ไม่ใช้)", kuta(yHD, "yoni").score === 3);
ok("S3 yoni Deer(bride)×Horse=1", kuta(yDH, "yoni").score === 1);
// - Varna ทิศทาง: bride Brahmin (กรกฎ rashi 3) × groom Kshatriya (สิงห์ rashi 4) → แถว "Brahmin | 1 | 0 | 0 | 0" = 0
const v1 = ashtakoota({ nakshatraIndex: 7, rashi: 3 }, { nakshatraIndex: 9, rashi: 4 });
ok("S3 varna bride Brahmin × groom Kshatriya = 0", kuta(v1, "varna").score === 0);
const v2 = ashtakoota({ nakshatraIndex: 9, rashi: 4 }, { nakshatraIndex: 7, rashi: 3 });
ok("S3 varna bride Kshatriya × groom Brahmin = 1", kuta(v2, "varna").score === 1);
// - Graha Maitri คะแนน saravali: จันทร์(กรกฎ lord Moon) × เมถุน(lord Mercury): Moon→Mercury friend, Mercury→Moon enemy → "Friend and Enemy | 2"
const g1 = ashtakoota({ nakshatraIndex: 7, rashi: 3 }, { nakshatraIndex: 6, rashi: 2 });
ok("S3 grahaMaitri Moon×Mercury = 2 (saravali friend+enemy · PyJHora variant 1.0 ไม่ใช้)", kuta(g1, "grahaMaitri").score === 2);
// - Rasi 2/12: เมษ→พฤษภ = ตำแหน่ง 2 = 0 ทั้งสองทิศ
const b1 = ashtakoota({ nakshatraIndex: 0, rashi: 0 }, { nakshatraIndex: 3, rashi: 1 });
const b2 = ashtakoota({ nakshatraIndex: 3, rashi: 1 }, { nakshatraIndex: 0, rashi: 0 });
ok("S3 rasi 2/12 = 0 สมมาตร", kuta(b1, "rasi").score === 0 && kuta(b2, "rasi").score === 0);
// - Vashya มังกรแบ่งครึ่งราศี (saravali): 0-15° = Quadruped · 15-30° = Jalachara
const capQ = ashtakoota({ nakshatraIndex: 21, rashi: 9, rashiDeg: 5 }, { nakshatraIndex: 21, rashi: 9, rashiDeg: 5 });
const capJ = ashtakoota({ nakshatraIndex: 21, rashi: 9, rashiDeg: 20 }, { nakshatraIndex: 21, rashi: 9, rashiDeg: 20 });
ok("S3 vashya มังกรครึ่งแรก = Quadruped", kuta(capQ, "vashya").bride === "Quadruped");
ok("S3 vashya มังกรครึ่งหลัง = Jalachara", kuta(capJ, "vashya").bride === "Jalachara");
// - Rajju 4 คะแนน: Aswini (Pada/Aroha) × Rohini (Kanta/Aroha) → ต่างสาย ทั้งคู่ขาขึ้น = 4
ok("S3 rajju=4 (diff rajju both Aroha)", ashtakoota({ nakshatraIndex: 0, rashi: 0 }, { nakshatraIndex: 3, rashi: 1 }).rajju.score === 4);

// ============ 4) กวาดทุกคู่: total อยู่ใน 0..36 · kuta ไม่ติดลบ/ไม่เกิน max · สมมาตรใน kuta ที่สมมาตร
let sweepOk = true, symOk = true, sd = "";
const rashiOfNak = (n) => Math.floor(((n + 0.5) * (360 / 27)) / 30) % 12;
for (let bn = 0; bn < 27; bn++) {
  for (let gn = 0; gn < 27; gn++) {
    const br = rashiOfNak(bn), gr = rashiOfNak(gn);
    const res = ashtakoota({ nakshatraIndex: bn, rashi: br }, { nakshatraIndex: gn, rashi: gr });
    if (!(res.total >= 0 && res.total <= 36)) { sweepOk = false; sd = `total=${res.total}@${bn},${gn}`; }
    for (const k of res.kutas) if (k.score < 0 || k.score > k.max) { sweepOk = false; sd = `${k.key}=${k.score}@${bn},${gn}`; }
    const rev = ashtakoota({ nakshatraIndex: gn, rashi: gr }, { nakshatraIndex: bn, rashi: br });
    for (const key of ["dina", "rasi", "nadi", "grahaMaitri"]) {
      if (kuta(res, key).score !== kuta(rev, key).score) { symOk = false; sd = `asym ${key}@${bn},${gn}`; }
    }
    if (res.rajju.score !== rev.rajju.score) { symOk = false; sd = `asym rajju@${bn},${gn}`; }
  }
}
ok("sweep 27x27: 0 ≤ total ≤ 36 และทุก kuta อยู่ในช่วง", sweepOk, sd);
ok("sweep: dina/rasi/nadi/grahaMaitri/rajju สมมาตรเมื่อสลับ bride↔groom", symOk, sd);

// ============ 5) attribution บังคับ (CC BY-SA 4.0)
ok("มี attribution ใน result", r1.attribution === ASHTAKOOTA_ATTRIBUTION && ASHTAKOOTA_ATTRIBUTION.includes("saravali.github.io") && ASHTAKOOTA_ATTRIBUTION.includes("CC BY-SA 4.0"));

// ============ 6) wiring: pair packet vedic มี ashtakoota + attribution ถูก render + bride=ฝ่ายหญิง
const A = { name: "เอ", dtUTC: new Date("1984-12-31T06:15:00Z"), lat: 13.7563, lng: 100.5018, hasTime: true, gender: "M" };
const B = { name: "บี", dtUTC: new Date("1986-04-08T17:04:00Z"), lat: 13.7563, lng: 100.5018, hasTime: true, gender: "F" };
const block = renderPairInteractionPacket("vedic", [A, B], new Date("2026-07-01T00:00:00Z"));
const payload = JSON.parse(block.split("CLOSED_LIST ===")[1].split("=== END_PAIR_INTERACTION_PACKET")[0].replace(/^[\s\S]*?\n(?=\{)/, ""));
ok("pair packet มี data.ashtakoota", !!payload.data.ashtakoota);
ok("bride = B (ฝ่ายหญิง)", payload.data.ashtakoota.brideChart === "B" && payload.data.ashtakoota.groomChart === "A");
ok("total ≤ 36 + มี 8 kuta", payload.data.ashtakoota.result.kutas.length === 8 && payload.data.ashtakoota.result.total <= 36);
ok("attribution ถูก render ใน block", block.includes("saravali.github.io") && block.includes("CC BY-SA 4.0"));
ok("notAvailable ไม่มี ashtakootaScore แล้ว", !payload.notAvailable.includes("ashtakootaScore"));
ok("navamsaSynastry ยังแจ้งไม่มีตามจริง", payload.notAvailable.includes("navamsaSynastry"));

// determinism ของ wiring
const block2 = renderPairInteractionPacket("vedic", [A, B], new Date("2026-07-01T00:00:00Z"));
ok("pair packet deterministic", block2 === block);

// ============ 7) เต็มสาย prompt คู่ vedic มี ashtakoota + ไม่เกิน 78K
const prompt = buildSciencePrompt("vedic", [A, B], "คู่นี้เข้ากันไหม", "th");
ok("prompt คู่มี ashtakoota", prompt.includes("ashtakoota"));
ok("prompt ไม่เกิน 78K", prompt.length <= 78000, `${prompt.length}`);
console.log(`ขนาด prompt คู่ vedic: ${prompt.length}`);

console.log(`\nผล: ${pass} ผ่าน · ${fail} ไม่ผ่าน`);
process.exit(fail ? 1 : 0);
