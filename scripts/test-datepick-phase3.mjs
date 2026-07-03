/* test-datepick-phase3.mjs · phase-3: ปัญจางค์ 5 องค์ + ตาราพละ + ป้ายเห็นพ้องข้ามศาสตร์
   รัน (มาตรฐาน): set -a && source .env.local && set +a && npx tsx scripts/test-datepick-phase3.mjs
   (รันด้วย node --experimental-strip-types --import ./scripts/_ts-resolver.mjs ก็ได้ผลเดียวกัน)
   (ต้องมี env PG* จาก .env.local สำหรับส่วน route จริง · ถ้า DB ล่มส่วนนั้นจะ fail ชัดเจน)
   ครอบ: tithi/nakshatra/yoga/karana เทียบการคำนวณอิสระ 3 instant ต่อองค์ ·
         จันทร์ดับจริงจาก ephemeris → tithi 30 · จันทร์เพ็ญ → tithi 15 ·
         Rikta cap 55 (開市/婚姻) · Vishti cap 55 · Amavasya cap 45 · โยคะร้าย cap 60 · โยคะดี +5 ·
         Tarabala นับ janma→day (สังเคราะห์ N+2 → count 3 Vipat cap 50) · badge นับถูกบน mocked candidate ·
         module ปิด = route byte-identical baseline r374 · perf · regression (r372 86/86 ซึ่งรวม r367+bazi+tsc)
   วิธีคำนวณอิสระ: tithi/karana เทียบ A.MoonPhase (elongation อิสระจาก eclipticLon ของ module) ·
   nakshatra/yoga เทียบสูตร Lahiri เขียนซ้ำในไฟล์นี้ + จุดยึดภายนอก Mesha Sankranti (~14 เม.ย.) */
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import * as AE from "astronomy-engine";
/* dual-package interop: ใต้ tsx โมดูล TS ในกราฟ (panchanga → astro-core/ephemeris) โหลด
   astronomy-engine เป็น CJS ก่อน → namespace ของ .mjs ถูก dedupe ไปที่ CJS instance ซึ่ง
   named exports ตรวจไม่เจอ (เหลือแค่ .default) · ใต้ node --experimental-strip-types ได้ ESM
   entry ตรง ๆ → ใช้ตัวที่มีฟังก์ชันจริงเสมอ */
const A = typeof AE.SearchMoonPhase === "function" ? AE : AE.default;

import { combineScores } from "../src/lib/luck-engine/combineScores.ts";
import { ALL_MODULES, UNIVERSAL_MODULES } from "../src/lib/luck-engine/types.ts";
import {
  panchangaAt, computePanchanga, karanaNameOf,
  TITHI_NAMES, YOGA_NAMES, KARANA_MOVABLE, BENEFIC_YOGAS, MALEFIC_YOGAS,
} from "../src/lib/luck-engine/modules/panchanga.ts";
import {
  taraOf, computeTaraBala, nakshatraIndexAt, janmaNakshatraOf, parseBirthDatetime, TARA_TABLE,
} from "../src/lib/luck-engine/modules/tara-bala.ts";
import { computeAgreement, AGREEMENT_GROUPS } from "../src/lib/luck-engine/agreement.ts";

let pass = 0, fail = 0;
function ok(cond, name, detail = "") {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${detail}`); }
}

const TH = 7 * 3600_000;
const BRANCHES = ["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"];
const thaiDate = (ms) => new Date(ms + TH).toISOString().slice(0, 10);
const thaiTime = (ms) => new Date(ms + TH).toISOString().slice(11, 16);
const norm360 = (d) => ((d % 360) + 360) % 360;
/* สูตร Lahiri เขียนซ้ำอิสระ (ค่าคงที่เดียวกับตำรา · ไม่ import จาก module ที่เทส) */
const lahiriIndep = (date) => {
  const T = (date.getTime() / 86400000 + 2440587.5 - 2451545.0) / 36525.0;
  return 23.85294 + 1.396042 * T + 0.000308 * T * T;
};
const moonLonIndep = (date) => norm360(A.Ecliptic(A.GeoVector(A.Body.Moon, date, true)).elon);
const sunLonIndep = (date) => norm360(A.SunPosition(date).elon);

/** mock slot (shape เดียวกับ r372) · date = วันไทย · shichen 0-11 */
function mockSlot(date, shichen) {
  const zeRi = {
    module: "ze_ri", status: "ready",
    score: { raw: 80, normalized: 80, weight: 1 }, pass: true,
    tags: [], reasons: { up: [], down: [], warning: [] }, confidence: 0.9, raw: {},
  };
  return {
    id: "1", datetime: { start: `${date} 00:00:00`, end: `${date} 02:00:00`, timezone: "Asia/Bangkok" },
    calendar: { gregorianDate: date, shichen, shichenBranch: BRANCHES[shichen] },
    pillars: {
      year: { stem: "丙", branch: "午" }, month: { stem: "乙", branch: "未" },
      day: { stem: "庚", branch: "子" }, hour: { stem: "丙", branch: BRANCHES[shichen] },
    },
    donggong: null, zodiacClash: [], people: [],
    modules: { ze_ri: zeRi }, scoring: undefined, display: undefined,
  };
}
/** slot (date,shichen) ที่กลาง時辰 ใกล้ instant ms ที่สุด (子=00:00 นาฬิกาไทย) */
function slotCovering(ms) {
  const shifted = ms + 3600_000;
  const d = new Date(shifted + TH);
  const date = d.toISOString().slice(0, 10);
  const sc = Math.floor((d.getUTCHours() * 60 + d.getUTCMinutes()) / 120) % 12;
  return mockSlot(date, sc);
}
/** midpoint UTC ms ของ slot */
const slotMidMs = (slot) => Date.parse(`${slot.calendar.gregorianDate}T${String((slot.calendar.shichen * 2) % 24).padStart(2, "0")}:00:00+07:00`);

/* ═══ 1 · ติถี (tithi) เทียบการคำนวณอิสระ + จุดยึดจันทร์ดับ/เพ็ญจริงจาก ephemeris ═══ */
console.log("\n[1] panchanga · ติถี (Moon−Sun)/12° เทียบ A.MoonPhase อิสระ");
{
  // จันทร์ดับ (new moon) จริงลูกแรกหลัง 1 ก.ค. 2026 จาก ephemeris
  const nm = A.SearchMoonPhase(0, new Date("2026-07-01T00:00:00Z"), 40);
  console.log(`    🌑 จันทร์ดับจริง: ${nm.date.toISOString()} (ไทย ${thaiDate(nm.date.getTime())} ${thaiTime(nm.date.getTime())})`);
  const beforeNm = panchangaAt(new Date(nm.date.getTime() - 3 * 3600_000));
  const afterNm = panchangaAt(new Date(nm.date.getTime() + 3 * 3600_000));
  ok(beforeNm.tithi === 30 && beforeNm.isAmavasya, `ก่อนจันทร์ดับ 3 ชม. → tithi 30 อมาวสยา (${beforeNm.tithiTh})`, JSON.stringify({ t: beforeNm.tithi }));
  ok(afterNm.tithi === 1 && afterNm.paksha === "shukla", `หลังจันทร์ดับ 3 ชม. → tithi 1 ปรติปทา ข้างขึ้น`, JSON.stringify({ t: afterNm.tithi }));

  // จันทร์เพ็ญ (full moon) จริง → tithi 15 ปูรณิมา
  const fm = A.SearchMoonPhase(180, new Date("2026-07-01T00:00:00Z"), 40);
  const beforeFm = panchangaAt(new Date(fm.date.getTime() - 3 * 3600_000));
  ok(beforeFm.tithi === 15 && beforeFm.isPurnima, `ก่อนจันทร์เพ็ญจริง 3 ชม. → tithi 15 ปูรณิมา`, JSON.stringify({ t: beforeFm.tithi, d: fm.date.toISOString() }));

  // เสี้ยวแรก (first quarter · elong 90°) → กลางติถี 8
  const q1 = A.SearchMoonPhase(90, new Date("2026-07-01T00:00:00Z"), 40);
  const atQ1 = panchangaAt(new Date(q1.date.getTime() + 60_000));
  ok(atQ1.tithi === 8, `เสี้ยวแรกจริง (elong 90°) → tithi 8 อัษฏมี`, JSON.stringify({ t: atQ1.tithi }));

  // 3 instant สุ่มช่วงต่างกัน · เทียบ tithi กับ A.MoonPhase (เส้นทางคำนวณอิสระ)
  for (const iso of ["2026-07-03T05:00:00Z", "2026-08-19T13:30:00Z", "2026-12-01T22:00:00Z"]) {
    const d = new Date(iso);
    const p = panchangaAt(d);
    const indep = (Math.floor(A.MoonPhase(d) / 12) % 30) + 1;
    ok(p.tithi === indep, `tithi ${iso} = ${p.tithi} ตรงกับ A.MoonPhase อิสระ (${indep})`);
  }
  ok(TITHI_NAMES.length === 14, "ตารางชื่อติถี 14 + ปูรณิมา/อมาวสยา ครบ");
}

/* ═══ 2 · นักษัตร (sidereal Lahiri) เทียบสูตรอิสระ + จุดยึดภายนอก Mesha Sankranti ═══ */
console.log("\n[2] panchanga · นักษัตร sidereal (Lahiri) /13°20′");
{
  // Lahiri ayanamsa ปี 2026 ต้องอยู่ ~24°12′-24°16′ (ค่าตีพิมพ์มาตรฐาน)
  const ay = lahiriIndep(new Date("2026-07-01T00:00:00Z"));
  ok(ay > 24.15 && ay < 24.30, `Lahiri ayanamsa กลางปี 2026 = ${ay.toFixed(4)}° (ช่วงตีพิมพ์ ~24.2°)`);

  // จุดยึดภายนอก: Mesha Sankranti (อาทิตย์ sidereal ข้าม 0° = ปีใหม่สุริยคติอินเดีย) ต้องตก ~13-15 เม.ย. 2026
  let sankranti = null;
  for (let ms = Date.parse("2026-04-10T00:00:00Z"); ms < Date.parse("2026-04-20T00:00:00Z"); ms += 3600_000) {
    const a = norm360(sunLonIndep(new Date(ms)) - lahiriIndep(new Date(ms)));
    const b = norm360(sunLonIndep(new Date(ms + 3600_000)) - lahiriIndep(new Date(ms + 3600_000)));
    if (a > 350 && b < 10) { sankranti = ms; break; }
  }
  const skDate = sankranti ? thaiDate(sankranti) : "?";
  ok(!!sankranti && skDate >= "2026-04-13" && skDate <= "2026-04-15",
    `อาทิตย์ sidereal ข้าม 0° (Mesha Sankranti) = ${skDate} (ตำรา: ~14 เม.ย.)`, skDate);

  // 3 instant · นักษัตรจันทร์เทียบสูตรอิสระ (จันทร์ tropical อิสระ − Lahiri อิสระ)/13°20′
  for (const iso of ["2026-07-03T05:00:00Z", "2026-09-10T02:00:00Z", "2027-01-20T18:00:00Z"]) {
    const d = new Date(iso);
    const p = panchangaAt(d);
    const indep = Math.floor(norm360(moonLonIndep(d) - lahiriIndep(d)) / (360 / 27)) % 27;
    ok(p.nakshatra === indep, `nakshatra ${iso} = #${p.nakshatra + 1} ${p.nakshatraTh} (${p.nakshatraSa}) ตรงสูตรอิสระ`);
    ok(nakshatraIndexAt(d) === indep, `tara-bala nakshatraIndexAt ใช้ sidereal เดียวกัน (${iso})`);
  }
  // ครบ 27 ฤกษ์ในหนึ่งรอบจันทร์ (สแกน 28 วัน ราย 4 ชม.)
  const seen = new Set();
  for (let ms = Date.parse("2026-07-01T00:00:00Z"); ms < Date.parse("2026-07-29T00:00:00Z"); ms += 4 * 3600_000) {
    seen.add(panchangaAt(new Date(ms)).nakshatra);
  }
  ok(seen.size === 27, `รอบจันทร์ 28 วันเจอครบ 27 นักษัตร (ได้ ${seen.size})`);
}

/* ═══ 3 · โยคะ (Sun+Moon sidereal)/13°20′ เทียบสูตรอิสระ ═══ */
console.log("\n[3] panchanga · โยคะ 27");
{
  for (const iso of ["2026-07-03T05:00:00Z", "2026-10-05T09:00:00Z", "2027-02-14T00:00:00Z"]) {
    const d = new Date(iso);
    const p = panchangaAt(d);
    const ayI = lahiriIndep(d);
    const indep = Math.floor(norm360(norm360(sunLonIndep(d) - ayI) + norm360(moonLonIndep(d) - ayI)) / (360 / 27)) % 27;
    ok(p.yoga === indep, `yoga ${iso} = #${p.yoga + 1} ${p.yogaTh} (${p.yogaSa}) ตรงสูตรอิสระ`);
  }
  ok(YOGA_NAMES.length === 27 && YOGA_NAMES[16].sa === "Vyatīpāta" && YOGA_NAMES[26].sa === "Vaidhṛti",
    "ตารางโยคะ 27 ชื่อ · #17 วยตีปาตะ · #27 ไวธฤติ ตรงตำแหน่งตำรา");
  ok(YOGA_NAMES[15].sa === "Siddhi" && YOGA_NAMES[20].sa === "Siddha" && YOGA_NAMES[22].sa === "Śubha",
    "โยคะดี #16 สิทธิ · #21 สิทธะ · #23 ศุภะ ตรงตำแหน่ง");
  ok(MALEFIC_YOGAS.has(16) && MALEFIC_YOGAS.has(26) && BENEFIC_YOGAS.has(15) && BENEFIC_YOGAS.has(20) && BENEFIC_YOGAS.has(22),
    "ชุดโยคะดี/ร้ายชี้ index ถูก (0-based)");
}

/* ═══ 4 · กรณะ (ครึ่งติถี) เทียบสูตรอิสระ + ตำแหน่งกรณะคงที่รอบจันทร์ดับ ═══ */
console.log("\n[4] panchanga · กรณะ 60 ช่อง (7 จร + 4 คงที่)");
{
  for (const iso of ["2026-07-03T05:00:00Z", "2026-08-19T13:30:00Z", "2026-11-11T07:45:00Z"]) {
    const d = new Date(iso);
    const p = panchangaAt(d);
    const indep = Math.floor(A.MoonPhase(d) / 6) % 60;
    ok(p.karana === indep, `karana ${iso} = ช่อง ${p.karana} ${p.karanaTh} ตรง A.MoonPhase อิสระ`);
    // กรณะสอดคล้องติถี: floor(karana/2)+1 = tithi เสมอ (ครึ่งติถีนิยาม)
    ok(Math.floor(p.karana / 2) + 1 === p.tithi, `karana/2 = tithi (${p.karana}→${p.tithi})`);
  }
  // กรณะคงที่ 4 ตัวรอบจันทร์ดับ: นาคะ (ก่อนดับ) → กิงสตุฆนะ (หลังดับ) · ศกุนิ/จตุษปาท ก่อนหน้า
  const nm = A.SearchMoonPhase(0, new Date("2026-07-01T00:00:00Z"), 40).date.getTime();
  ok(panchangaAt(new Date(nm - 2 * 3600_000)).karanaSa === "Nāga", "ครึ่งหลังอมาวสยา = นาคะ (Nāga)");
  ok(panchangaAt(new Date(nm + 2 * 3600_000)).karanaSa === "Kiṃstughna", "ครึ่งแรกปรติปทา = กิงสตุฆนะ (Kiṃstughna)");
  ok(karanaNameOf(57).sa === "Śakuni" && karanaNameOf(58).sa === "Catuṣpāda", "ช่อง 57/58 = ศกุนิ/จตุษปาท (ครึ่งหลังจตุรทศี+ครึ่งแรกอมาวสยา)");
  // วิษฏิ = กรณะจรตัวที่ 7 ทุกช่อง (k-1)%7==6 ในช่วง 1-56
  let vOk = true;
  for (let k = 1; k <= 56; k++) {
    const isV = karanaNameOf(k).isVishti;
    if (isV !== ((k - 1) % 7 === 6)) vOk = false;
  }
  ok(vOk && KARANA_MOVABLE[6].sa.startsWith("Viṣṭi"), "วิษฏิ (ภัทรา) ตกช่อง 7,14,…,56 ครบตามสูตรจร 7 ตัว");
}

/* ═══ 5 · กติกาตัดคะแนนปัญจางค์ (rikta/vishti/amavasya/yoga) ═══ */
console.log("\n[5] panchanga · caps ตามตำรา (rikta 55 · vishti 55 · amavasya 45 · โยคะร้าย 60 · โยคะดี +5)");
{
  // หา slot เที่ยงวันของแต่ละเงื่อนไขจากสแกน ก.ค.-ก.ย. 2026 (คำนวณจริง ไม่ hardcode)
  const found = { rikta: null, vishti: null, amavasya: null, badYoga: null, goodYoga: null };
  for (let ms = Date.parse("2026-07-01T05:00:00Z"); ms < Date.parse("2026-09-30T05:00:00Z"); ms += 2 * 3600_000) {
    const p = panchangaAt(new Date(ms));
    if (!found.rikta && p.isRikta && !p.isVishti && !MALEFIC_YOGAS.has(p.yoga) && !p.isAmavasya) found.rikta = ms;
    if (!found.vishti && p.isVishti && !p.isRikta && !MALEFIC_YOGAS.has(p.yoga) && !p.isAmavasya) found.vishti = ms;
    if (!found.amavasya && p.isAmavasya && !p.isVishti && !MALEFIC_YOGAS.has(p.yoga)) found.amavasya = ms;
    if (!found.badYoga && MALEFIC_YOGAS.has(p.yoga) && !p.isRikta && !p.isVishti && !p.isAmavasya) found.badYoga = ms;
    if (!found.goodYoga && BENEFIC_YOGAS.has(p.yoga) && !p.isRikta && !p.isVishti && !p.isAmavasya) found.goodYoga = ms;
    if (Object.values(found).every(Boolean)) break;
  }
  ok(Object.values(found).every(Boolean), "สแกน 3 เดือนเจอครบทุกเงื่อนไข (rikta/vishti/amavasya/โยคะร้าย/โยคะดี)",
    JSON.stringify(Object.fromEntries(Object.entries(found).map(([k, v]) => [k, v ? thaiDate(v) : null]))));

  // rikta tithi → cap 55 เฉพาะ 開市/婚姻 · กิจกรรมอื่นเตือนอย่างเดียว
  const riktaSlot = slotCovering(found.rikta);
  for (const act of ["開市", "婚姻"]) {
    const mr = computePanchanga(riktaSlot, act);
    const cap = (mr.caps || []).find((x) => x.code === "PANCHANGA_RIKTA_CAP");
    ok(!!cap && cap.type === "max" && cap.value === 55 && mr.pass === false,
      `ติถีริกตา (${thaiDate(found.rikta)}) + ${act} → cap max 55`, JSON.stringify(mr.caps));
  }
  const riktaTravel = computePanchanga(riktaSlot, "出行");
  ok(!(riktaTravel.caps || []).some((x) => x.code === "PANCHANGA_RIKTA_CAP")
    && (riktaTravel.reasons.warning || []).some((r) => r.code === "PANCHANGA_RIKTA_WARN"),
    "ติถีริกตา + 出行 → เตือนอย่างเดียว ไม่ cap");
  // cap ไหลผ่าน combineScores จริง (ze_ri 80 → ≤55)
  {
    const mr = computePanchanga(riktaSlot, "開市");
    const sc = combineScores({ ze_ri: riktaSlot.modules.ze_ri, panchanga: mr }, ["ze_ri", "panchanga"], "開市");
    ok(sc.finalScore <= 55 && sc.caps.some((x) => x.code === "PANCHANGA_RIKTA_CAP"),
      `rikta cap ไหลผ่าน combineScores → finalScore ≤ 55 (ได้ ${sc.finalScore} จาก ze_ri 80)`);
  }

  // vishti karana → cap 55 ทุกกิจกรรม
  const vishtiSlot = slotCovering(found.vishti);
  for (const act of ["立約", "祭祀"]) {
    const mr = computePanchanga(vishtiSlot, act);
    ok((mr.caps || []).some((x) => x.code === "PANCHANGA_VISHTI_CAP" && x.value === 55),
      `กรณะวิษฏิ (${thaiDate(found.vishti)}) + ${act} → cap 55 ทุกกิจกรรม`);
  }

  // amavasya → cap 45 ทุกกิจกรรมยกเว้น 祭祀
  const amaSlot = slotCovering(found.amavasya);
  const amaOpen = computePanchanga(amaSlot, "開市");
  ok((amaOpen.caps || []).some((x) => x.code === "PANCHANGA_AMAVASYA_CAP" && x.value === 45),
    `อมาวสยา (${thaiDate(found.amavasya)}) + 開市 → cap 45`);
  const amaRitual = computePanchanga(amaSlot, "祭祀");
  ok(!(amaRitual.caps || []).some((x) => x.code === "PANCHANGA_AMAVASYA_CAP")
    && amaRitual.reasons.up.some((r) => r.code === "PANCHANGA_AMAVASYA_RITUAL"),
    "อมาวสยา + 祭祀 (pitṛ-kārya) → ไม่ cap · แจ้งว่าเหมาะพิธีบูชาบรรพบุรุษ");

  // โยคะร้าย → cap 60 · โยคะดี → +5
  const byMr = computePanchanga(slotCovering(found.badYoga), "立約");
  ok((byMr.caps || []).some((x) => x.code === "PANCHANGA_BAD_YOGA_CAP" && x.value === 60),
    `โยคะร้าย (${thaiDate(found.badYoga)} · ${byMr.raw.yogaTh}) → cap 60`);
  const gyMr = computePanchanga(slotCovering(found.goodYoga), "立約");
  ok(gyMr.reasons.up.some((r) => r.code === "PANCHANGA_GOOD_YOGA" && r.delta === 5) && gyMr.score.normalized === 60,
    `โยคะดี (${thaiDate(found.goodYoga)} · ${gyMr.raw.yogaTh}) → +5 (normalized 60)`);
  // ทุกผลลัพธ์มี info สรุป 5 องค์ ไทย+สันสกฤต
  ok(gyMr.reasons.up.some((r) => r.code === "PANCHANGA_INFO" && /ติถี.*วาระ.*นักษัตร.*โยคะ.*กรณะ/.test(r.thai)),
    "reason สรุปปัญจางค์ครบ 5 องค์ (ไทย+ทับศัพท์) ติดทุกการ์ด");
  // deterministic
  const a = computePanchanga(riktaSlot, "開市"), b = computePanchanga(riktaSlot, "開市");
  ok(JSON.stringify(a) === JSON.stringify(b), "deterministic · เรียกซ้ำได้ผลเดิมทุก byte");
}

/* ═══ 6 · ตาราพละ (Tarabala) ═══ */
console.log("\n[6] tara_bala · นับ janma→day mod 9 (ตาราง Tārā 9 ชั้นมาตรฐาน)");
{
  // เลขคณิตล้วน: janma N · day N+2 → count 3 = Vipat (ชั้นร้าย) ทุก N
  let arithOk = true;
  for (let n = 0; n < 27; n++) {
    const t = taraOf(n, (n + 2) % 27);
    if (t.count !== 3 || t.tara !== 3 || TARA_TABLE[t.tara - 1].sa !== "Vipat") arithOk = false;
  }
  ok(arithOk, "janma N → day N+2 = count 3 = Vipat ครบทั้ง 27 N");
  ok(taraOf(5, 5).tara === 1 && TARA_TABLE[0].sa === "Janma", "day = janma → count 1 = Janma");
  ok(taraOf(0, 1).tara === 2 && taraOf(0, 8).tara === 9 && taraOf(0, 9).tara === 1,
    "ขอบรอบ 9: +1→Sampat · +8→Parama Maitra · +9→วนกลับ Janma");
  ok(taraOf(20, 6).count === 14 && taraOf(20, 6).tara === 5, "ข้ามรอบ 27: janma 20 → day 6 = count 14 (นับรวมต้นทาง) = tara 5 ปรัตยัก");
  ok(TARA_TABLE.filter((t) => t.kind === "bad").map((t) => t.sa).join(",") === "Vipat,Pratyak,Naidhana",
    "ชั้นร้าย = 3 วิปัต / 5 ปรัตยัก / 7 ไนธนะ ตามตารางมาตรฐาน");

  // end-to-end สังเคราะห์: หา birth datetime ที่ janma = dayNak−2 (สแกนจันทร์จริงราย 2 ชม.)
  const slot = mockSlot("2026-07-15", 6); // เที่ยงวันไทย
  const dayNak = nakshatraIndexAt(new Date(slotMidMs(slot)));
  const wantJanma = (dayNak - 2 + 27) % 27;
  const wantGood = (dayNak - 1 + 27) % 27; // count 2 = Sampat
  let birthBad = null, birthGood = null;
  for (let ms = Date.parse("1990-01-01T00:00:00Z"); ms < Date.parse("1990-02-05T00:00:00Z"); ms += 2 * 3600_000) {
    const nk = nakshatraIndexAt(new Date(ms));
    const str = new Date(ms + TH).toISOString().slice(0, 19).replace("T", " ");
    if (birthBad == null && nk === wantJanma) birthBad = str;
    if (birthGood == null && nk === wantGood) birthGood = str;
    if (birthBad && birthGood) break;
  }
  ok(!!birthBad && !!birthGood, "สแกนเจอวันเกิดสังเคราะห์ทั้ง 2 เคส (janma = day−2 และ day−1)");
  const person = (b) => ({ personId: "hk_test", birthDatetime: b });
  const bad = computeTaraBala(slot, "開市", person(birthBad));
  ok(bad.status === "ready" && bad.raw.count === 3 && bad.raw.tara === 3 && bad.pass === false
    && (bad.caps || []).some((x) => x.code === "TARA_BALA_CAP" && x.type === "max" && x.value === 50),
    `janma ${wantJanma} → day ${dayNak} = count 3 Vipat → cap 50`, JSON.stringify(bad.raw));
  {
    const sc = combineScores({ ze_ri: slot.modules.ze_ri, tara_bala: bad }, ["ze_ri", "tara_bala"], "開市");
    ok(sc.finalScore <= 50 && sc.caps.some((x) => x.code === "TARA_BALA_CAP"),
      `Vipat cap ไหลผ่าน combineScores → finalScore ≤ 50 (ได้ ${sc.finalScore})`);
  }
  const good = computeTaraBala(slot, "開市", person(birthGood));
  ok(good.status === "ready" && good.raw.tara === 2 && !(good.caps || []).length
    && good.reasons.up.some((r) => r.code === "TARA_BALA_GOOD" && r.delta === 4),
    "janma = day−1 = count 2 Sampat → +4 ไม่มี cap");
  // ไม่มีโปรไฟล์ → missing → zero-effect ใน combineScores
  const none = computeTaraBala(slot, "開市", null);
  ok(none.status === "missing" && !(none.caps || []).length, "ไม่มีโปรไฟล์ → status missing (ข้ามเงียบ ๆ)");
  const scNo = combineScores({ ze_ri: slot.modules.ze_ri }, ["ze_ri"], "開市");
  const scMiss = combineScores({ ze_ri: slot.modules.ze_ri, tara_bala: none }, ["ze_ri", "tara_bala"], "開市");
  ok(scNo.finalScore === scMiss.finalScore, `missing = zero-effect (${scNo.finalScore} = ${scMiss.finalScore})`);
  // parser วันเกิด: รูปแบบ DB + ISO + เคสพัง
  ok(parseBirthDatetime("1984-12-31 13:15:00")?.toISOString() === "1984-12-31T06:15:00.000Z",
    "parse '1984-12-31 13:15:00' = เวลาไทย (UTC+7)");
  ok(parseBirthDatetime("1984-12-31T13:15:00+07:00")?.toISOString() === "1984-12-31T06:15:00.000Z"
    && parseBirthDatetime("garbage") === null && janmaNakshatraOf("") === null,
    "รองรับ ISO มี tz · ข้อมูลพัง → null (module ข้าม ไม่ล้ม)");
}

/* ═══ 7 · ป้ายเห็นพ้องข้ามศาสตร์ (agreement) บน mocked candidate ═══ */
console.log("\n[7] agreement · นับกลุ่มหนุน/ค้านจาก ModuleResult 4 สาย");
{
  const mk = (module, ups, downs, status = "ready") => ({
    module, status,
    score: { raw: 50, normalized: 50, weight: 1 }, pass: true, tags: [],
    reasons: {
      up: ups.map((d, i) => ({ code: `U${i}`, thai: "x", delta: d })),
      down: downs.map((d, i) => ({ code: `D${i}`, thai: "x", delta: d })),
      warning: [],
    },
    confidence: 0.8, raw: {},
  });
  // ① basic: up 2 (delta>0) vs down 1 → หนุน · ② sky: down 1 → ค้าน (delta 0 ก็นับ — สาย cap)
  // ③ personal: up 1 → หนุน · ④ advanced: up 1 → หนุน → groups 4 · positive 3 · negative 1
  const cand = {
    modules: {
      ze_ri: mk("ze_ri", [5, 3], []),
      dong_gong: mk("dong_gong", [], [0]),
      moon_void: mk("moon_void", [], [0]),
      ba_zi: mk("ba_zi", [10], []),
      qi_men: mk("qi_men", [3], []),
    },
  };
  const a = computeAgreement(cand);
  ok(a.groups === 4 && a.positive === 3 && a.negative === 1,
    `mocked candidate → groups 4 · หนุน 3 · ค้าน 1`, JSON.stringify(a));
  ok(a.perGroup.find((g) => g.key === "basic")?.up === 2 && a.perGroup.find((g) => g.key === "basic")?.down === 1,
    "perGroup basic นับ up 2 / down 1 ถูก (down delta 0 ของสาย cap ก็นับเป็นสัญญาณลบ)");
  // up delta 0 (info เช่น BAZI_NEUTRAL/PANCHANGA_INFO) ไม่นับเป็นสัญญาณบวก
  const b = computeAgreement({ modules: { ba_zi: mk("ba_zi", [0], []) } });
  ok(b.groups === 0 && b.positive === 0, "up delta 0 (info) ไม่นับ → กลุ่มไม่มีสัญญาณ");
  // module missing ไม่นับ · เท่ากัน (1:1) = ผสม ไม่เข้าฝั่งไหน
  const c = computeAgreement({ modules: { tara_bala: mk("tara_bala", [4], [], "missing"), ze_ri: mk("ze_ri", [5], [0]) } });
  ok(c.groups === 1 && c.positive === 0 && c.negative === 0, "missing ไม่นับ · up=down=1 = ผสม (ไม่นับทั้งสองฝั่ง)");
  // module ใหม่อยู่ในกลุ่มถูกต้อง
  const gSky = AGREEMENT_GROUPS.find((g) => g.key === "sky");
  const gPer = AGREEMENT_GROUPS.find((g) => g.key === "personal");
  ok(gSky.modules.includes("panchanga") && gPer.modules.includes("tara_bala"),
    "map กลุ่ม: panchanga ∈ ② sky · tara_bala ∈ ③ personal (ชุดเดียวกับ UI r372)");
  // ครอบทุก module ใน ALL_MODULES (กัน module หลุดกลุ่ม)
  const mapped = new Set(AGREEMENT_GROUPS.flatMap((g) => g.modules));
  ok(ALL_MODULES.every((m) => mapped.has(m)), "ทุก module ใน ALL_MODULES มีกลุ่ม (ไม่มีหลุด)");
}

/* ═══ 8 · wiring แหล่งจริง (อ่านไฟล์ route/types/weights/datepick.html) ═══ */
console.log("\n[8] wiring · route + types + weights + UI");
{
  const { readFileSync } = await import("node:fs");
  const route = readFileSync("src/app/api/auspicious/route.ts", "utf8");
  ok(route.includes('PT_MODULE_KEYS: ModuleKey[] = ["panchanga", "tara_bala"]'), "route ประกาศ PT_MODULE_KEYS");
  ok(route.includes("applyPanchangaModules(c, ptModulesActive, resolvedActivityType, customer)"),
    "route แนบ phase-3 จุดเดียวกับ sky (ก่อน combineScores) + ส่ง customer เข้า tara_bala");
  ok(route.includes("enforceSkyCaps(c, skyModulesActive)") && route.includes("enforceSkyCaps(c, ptModulesActive)"),
    "enforceSkyCaps ครอบ caps ของ phase-3 อีกชั้น (กัน profile rules ดันทะลุ · ไม่แตะชั้น sky เดิม)");
  ok(route.includes("ptModulesActive.length ? attachAgreement(c) : c"),
    "agreement แนบเฉพาะเมื่อ module phase-3 เปิด (ปิด = byte-identical · กัน regression r372 พัง)");
  ok(/pt: ptActive\.length \? `\$\{PT_MODULE_POLICY\}:\$\{ptActive\.join\("\+"\)\}` : "off"/.test(route), "cache key มี field pt (additive)");
  ok(/DATEPICK_HARD_MODULES = new Set<ModuleKey>\(\["ze_ri", "tai_sui", "ba_zi", "qi_men"\]\)/.test(route),
    "DATEPICK_HARD_MODULES ไม่ถูกแตะ (phase-3 ไม่เข้า hard-SQL)");
  const types = readFileSync("src/lib/luck-engine/types.ts", "utf8");
  ok(!UNIVERSAL_MODULES.includes("panchanga") && !UNIVERSAL_MODULES.includes("tara_bala")
    && ALL_MODULES.includes("panchanga") && ALL_MODULES.includes("tara_bala"),
    "types: อยู่ใน ALL_MODULES แต่ไม่อยู่ใน UNIVERSAL (กัน SQL query คอลัมน์ที่ไม่มี)");
  ok(!/PERSONAL_MODULES: ModuleKey\[\] = \[[^\]]*tara_bala/.test(types),
    "tara_bala ไม่อยู่ใน PERSONAL_MODULES (aj_personal_cache ไม่มีคอลัมน์)");
  const { MODULE_WEIGHTS } = await import("../src/lib/luck-engine/weights.ts");
  const wOk = Object.values(MODULE_WEIGHTS).every((w) => w.panchanga === 0.03 && w.tara_bala === 0.02);
  ok(wOk, "weights: panchanga 0.03 + tara_bala 0.02 ครบทั้ง 8 กิจกรรม (เล็ก · ตัดหลักผ่าน caps)");
  const html = readFileSync("public/datepick.html", "utf8");
  ok(html.includes('data-filter="panchanga"') && html.includes('data-filter="tarabala"'),
    "UI: checkbox panchanga (หมวด②) + tarabala (หมวด③)");
  ok(html.includes("showHelp('panchanga')") && html.includes("showHelp('tarabala')")
    && html.includes("panchanga: { han:'五支曆'") && html.includes("tarabala: { han:'宿曜'"),
    "UI: ⓘ HELP_DATA ครบ 2 ตัว (3 ภาษา)");
  ok(html.includes("'dp.pc.sub'") && html.includes("'dp.tb.sub'"), "UI: i18n keys dp.pc.* + dp.tb.*");
  ok(html.includes("activeModules.push('panchanga')") && html.includes("activeModules.push('tara_bala')"),
    "UI: ติ๊กแล้ว push เข้า activeModules (ไม่แตะ hardModules)");
  ok(html.includes("function agreementBadge(") && html.includes("agreement: c.agreement || null")
    && html.includes("${ag.chip}") && html.includes("${ag.line}"),
    "UI: badge เห็นพ้อง render บนการ์ด (chip) + detail (r-line)");
  ok(html.includes("'tianxing','moonvoid','moonsign','retro','eclipse','rahu','panchanga'")
    && html.includes("'bazi','yongshen','hex','tarabala'"),
    "UI: preset group ② มี panchanga · ③ มี tarabala");
  ok(html.includes("'rahu_kalam','panchanga'") && html.includes("'yong_shen','tara_bala'"),
    "UI: MODULE_ORDER/science order มี module ใหม่");
}

/* ═══ 9 · route จริง: module ปิด = byte-identical baseline r374 · เปิด = ตัดจริง + badge ═══ */
console.log("\n[9] route จริง (in-process + DB)");
const BASELINE = "/root/backups/parallel-r374-20260703-121108/route.ts";
{
  const { NextRequest } = await import("next/server.js");
  const newRoute = await import("../src/app/api/auspicious/route.ts");
  const { copyFileSync, unlinkSync } = await import("node:fs");
  const TMP_BASELINE = "scripts/.tmp-baseline-route-phase3.ts";
  copyFileSync(BASELINE, TMP_BASELINE);
  let baseRoute;
  try {
    baseRoute = await import(pathToFileURL(TMP_BASELINE).href);
  } finally {
    try { unlinkSync(TMP_BASELINE); } catch { /* ignore */ }
  }
  const UNIV8 = ["ze_ri", "twelve_officers", "twenty_eight", "twelve_spirits", "nine_stars", "tai_sui", "qi_men", "he_luo"];
  const PT2 = ["panchanga", "tara_bala"];
  const mkReq = (extra = [], df = "2026-07-01", dt = "2026-07-30") =>
    new NextRequest("http://localhost/api/auspicious", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ activityType: "開市", dateFrom: df, dateTo: dt, activeModules: [...UNIV8, ...extra], options: { limit: 50 } }),
    });
  const strip = (j) => {
    const m = { ...(j.meta || {}) };
    delete m.durationMs; delete m.cache;
    return { c: j.candidates, f: j.funnelStats, m };
  };

  const offNew = await (await newRoute.POST(mkReq())).json();
  const offBase = await (await baseRoute.POST(mkReq())).json();
  ok(!offNew.error && !offBase.error, "ทั้งสอง route ตอบปกติ (DB ต่อได้)", offNew.error || offBase.error || "");
  const cNew = JSON.stringify(offNew.candidates), cBase = JSON.stringify(offBase.candidates);
  ok(cNew === cBase,
    `module ปิด → candidates byte-identical กับ baseline r374 (${cNew.length.toLocaleString()} bytes · ไม่มี agreement โผล่)`,
    cNew.length + " vs " + cBase.length);
  ok(JSON.stringify(strip(offNew)) === JSON.stringify(strip(offBase)),
    "module ปิด → funnelStats+meta identical ทุก field (pt fields ไม่โผล่เมื่อปิด)");
  ok(!("ptModules" in (offNew.meta || {})) && !(offNew.candidates || []).some((c) => "agreement" in c),
    "module ปิด → ไม่มี meta.ptModules และไม่มี candidate.agreement (additive เฉพาะเมื่อเปิด)");

  // เปิด phase-3 (ไม่มี peopleIds → tara_bala missing แบบ graceful · panchanga ตัดจริง)
  const onNew = await (await newRoute.POST(mkReq(PT2))).json();
  ok(onNew.meta?.ptScoringPolicy === "v1_panchanga_r374"
    && JSON.stringify(onNew.meta?.ptModules) === JSON.stringify(PT2),
    "module เปิด → meta.ptScoringPolicy=v1_panchanga_r374 + ptModules ครบ");
  const cands = onNew.candidates || [];
  ok(cands.length > 0 && cands.every((c) => c.agreement && typeof c.agreement.groups === "number"),
    `ทุก candidate มี agreement (${cands.length} ใบ)`);
  // agreement ตรงกับการนับซ้ำจาก modules ใน response (deterministic)
  const agOk = cands.every((c) => {
    const re = computeAgreement(c);
    return re.groups === c.agreement.groups && re.positive === c.agreement.positive && re.negative === c.agreement.negative;
  });
  ok(agOk, "agreement ทุกใบ = คำนวณซ้ำจาก modules ตรงเป๊ะ (deterministic · ไม่มี AI)");
  ok(cands.every((c) => c.modules?.panchanga?.status === "ready" && typeof c.scoring?.moduleScores?.panchanga === "number"),
    "panchanga แนบ ready + เข้า moduleScores ทุกใบ");
  ok(cands.every((c) => !c.scoring?.moduleScores?.tara_bala && c.modules?.tara_bala?.status === "missing"),
    "ไม่มี peopleIds → tara_bala missing (skip gracefully · ไม่พังหน้า)");
  // ตัดจริง: ขอ limit ใหญ่ให้ slot ที่โดน cap ยังอยู่ใน response แล้วเช็คว่าไม่ทะลุเพดานสักใบ
  const mkBig = (extra) => new NextRequest("http://localhost/api/auspicious", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ activityType: "開市", dateFrom: "2026-07-01", dateTo: "2026-07-30", activeModules: [...UNIV8, ...extra], options: { limit: 300 } }),
  });
  const onBig = await (await newRoute.POST(mkBig(PT2))).json();
  const capped = (onBig.candidates || []).filter((c) => (c.modules?.panchanga?.caps || []).length);
  const capOk = capped.length > 0 && capped.every((c) => c.scoring.finalScore <= Math.min(...c.modules.panchanga.caps.map((x) => x.value)));
  ok(capOk, `ตัดจริง: slot ติด cap ปัญจางค์ ${capped.length} ใบใน pool · finalScore ไม่ทะลุเพดานสักใบ`,
    JSON.stringify(capped.slice(0, 2).map((c) => ({ d: c.calendar.gregorianDate, s: c.scoring.finalScore }))));
  ok(capped.every((c) => (c.scoring.caps || []).some((x) => String(x.source) === "panchanga")),
    "caps ใน scoring อ้าง source=panchanga ถูกต้อง (UI ใช้แสดงเหตุผล)");
  // อันดับ top เปลี่ยนจริงเมื่อเปิด (slot โดน cap จมออกจาก top — ไม่ใช่ decorative)
  const offTop = (offNew.candidates || []).slice(0, 10).map((c) => c.id).join(",");
  const onTop = cands.slice(0, 10).map((c) => c.id).join(",");
  ok(offTop !== onTop, "อันดับ top10 เปลี่ยนจริงเมื่อเปิด phase-3 (slot ติดเพดานจมลง)");
  ok(cands.some((c) => (c.scoring?.reasonsUp || []).some((r) => r.code === "PANCHANGA_INFO")),
    "reason สรุปปัญจางค์ 5 องค์โผล่ใน response (UI ใช้แสดง)");
  // cache key แยกจริง
  const onAgain = await (await newRoute.POST(mkReq(PT2))).json();
  ok(onAgain.meta?.cache === "hit" && onAgain.meta?.ptScoringPolicy === "v1_panchanga_r374",
    "ยิงซ้ำ ON = cache hit ที่ key ของ ON เอง (ไม่ปนกับ OFF)");

  /* ═══ 10 · perf ═══ */
  console.log("\n[10] perf · latency เพิ่ม <150ms ต่อ request 30 วัน (วัดจริง)");
  let t0 = performance.now();
  await (await newRoute.POST(mkReq([], "2026-08-01", "2026-08-30"))).json();
  const tOff = performance.now() - t0;
  t0 = performance.now();
  await (await newRoute.POST(mkReq(PT2, "2026-08-01", "2026-08-30"))).json();
  const tOnCold = performance.now() - t0;
  const mkReq2 = (extra) => new NextRequest("http://localhost/api/auspicious", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ activityType: "婚姻", dateFrom: "2026-08-01", dateTo: "2026-08-30", activeModules: [...UNIV8, ...extra], options: { limit: 40 } }),
  });
  t0 = performance.now();
  await (await newRoute.POST(mkReq2([]))).json();
  const tOff2 = performance.now() - t0;
  t0 = performance.now();
  await (await newRoute.POST(mkReq2(PT2))).json();
  const tOnWarm = performance.now() - t0;
  console.log(`    ⏱ 30วัน OFF ${tOff.toFixed(1)}ms · ON(เย็น) ${tOnCold.toFixed(1)}ms (Δ ${(tOnCold - tOff).toFixed(1)}ms) · ON(อุ่น) ${tOnWarm.toFixed(1)}ms (Δ ${(tOnWarm - tOff2).toFixed(1)}ms)`);
  ok(tOnCold - tOff < 150, `เปิด phase-3 ครั้งแรก (cache เย็น) เพิ่ม ${(tOnCold - tOff).toFixed(1)}ms < 150ms`);
  ok(tOnWarm - tOff2 < 60, `รอบอุ่น (cache ราย slot ทำงาน) เพิ่ม ${(tOnWarm - tOff2).toFixed(1)}ms < 60ms`);
}

/* ═══ 11 · regression ═══ */
console.log("\n[11] regression");
{
  // node --check ทุกสคริปต์ datepick (syntax)
  let checkOk = true;
  for (const f of ["scripts/test-datepick-phase3.mjs", "scripts/test-datepick-sky-r372.mjs", "scripts/test-datepick-r367.mjs"]) {
    try { execFileSync("node", ["--check", f], { encoding: "utf8" }); }
    catch (e) { checkOk = false; console.log(`    ${f}: ${e.message.slice(0, 200)}`); }
  }
  ok(checkOk, "node --check สคริปต์ datepick ทั้ง 3 ไฟล์ผ่าน");
  if (process.env.SKIP_HEAVY === "1") {
    console.log("    (ข้าม r372/r367/bazi/tsc ตาม SKIP_HEAVY=1 — รันเต็มในรอบหลัก)");
  } else {
    // r372 (86 เทส · ภายในรันซ้ำ r367 40/40 + bazi 2/2 + tsc --noEmit ทั้งโปรเจกต์อยู่แล้ว)
    const out372 = execFileSync("node", ["--experimental-strip-types", "--import", "./scripts/_ts-resolver.mjs", "scripts/test-datepick-sky-r372.mjs"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 900_000 });
    const m372 = out372.match(/ผลรวม: (\d+) passed · (\d+) failed/);
    ok(!!m372 && m372[2] === "0" && Number(m372[1]) >= 86,
      `test-datepick-sky-r372 ผ่านครบ (${m372?.[1]}/${m372 ? Number(m372[1]) + Number(m372[2]) : "?"} · byte-identical baseline r370 ยังผ่าน)`);
    ok(/test-datepick-r367 ยังผ่านครบ/.test(out372) && /test-bazi-calc\.cjs 2\/2/.test(out372) && /tsc --noEmit ผ่าน/.test(out372),
      "r367 40/40 + bazi 2/2 + tsc --noEmit ผ่าน (รันภายใน r372)");
  }
}

console.log(`\n═══ ผลรวม: ${pass} passed · ${fail} failed ═══`);
process.exit(fail ? 1 : 0);
