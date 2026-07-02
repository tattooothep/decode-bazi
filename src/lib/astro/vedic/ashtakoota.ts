/**
 * astro/vedic · Ashtakoota (Guna Milan · 8 kuta · 36 คะแนน) + Rajju (เสริม · ไม่รวมใน 36)
 *
 * PRIMARY SOURCE (ทุกตารางในไฟล์นี้ตรวจกับต้นทางคำต่อคำ):
 *   saravali.github.io — Maitreya project docs: koota_varna / koota_vashya / koota_dina /
 *   koota_yoni / koota_graha / koota_gana / koota_rasi / koota_nadi / koota_rajju
 *   License: CC BY-SA 4.0 (footer: "Website licensed under CC BY-SA 4.0.")
 * CROSS-CHECK (ตรวจตัวเลขเท่านั้น · ไม่ได้คัดลอกโค้ด): PyJHora (AGPL-3.0) numeric tables +
 *   NeeleshRoy/ashtakoot (MIT) + Drik Panchang Varna/Vashya tutorial pages.
 * VARIANTS ที่พบและวิธีตัดสิน (ยึด saravali · จดตัวแปรไว้):
 *   - Varna: saravali+PyJHora ให้ Vaishya=ราศีลม(เมถุน/ตุล/กุมภ์), Shudra=ราศีดิน(พฤษภ/กันย์/มกร);
 *     Drik Panchang+NeeleshRoy สลับสองกลุ่มนี้ → ใช้ตาม saravali
 *   - Vashya: ตาราง saravali ไม่ระบุราศีธนู → เติมตามธรรมเนียม Drik/PyJHora (ครึ่งแรก=Human ครึ่งหลัง=Quadruped);
 *     มังกรแบ่งครึ่งราศี (ครึ่งแรก=Quadruped ครึ่งหลัง=Jalachara) ตาม saravali; เมทริกซ์คะแนนมี variant
 *     (PyJHora "saravali.de" / AstroYogi) → ใช้เมทริกซ์จากหน้า saravali.github.io ตรง ๆ
 *   - Dina/Tara: saravali ใช้กฎเศษ 3/5/7 → 0 มิฉะนั้น 1.5 ต่อทิศ (รวม 0/1.5/3);
 *     PyJHora มี variant 9x9 ที่ให้ 1.0 ตรงช่อง Vadha×Mitra/Ati-Mitra → ใช้กฎ saravali
 *   - Yoni: ตาราง saravali ไม่สมมาตรที่ ม้า(เจ้าสาว)×กวาง=3 แต่ กวาง(เจ้าสาว)×ม้า=1;
 *     PyJHora ปรับเป็น 1/1 → คงตาม saravali คำต่อคำ
 *   - Graha Maitri: คะแนน saravali = 5/4/3/2/1/0 (friend+enemy=2 · neutral+enemy=1);
 *     PyJHora ใช้ 1.0/0.5 สองช่องนั้น → ใช้คะแนน saravali; ความเป็นมิตร/ศัตรูของดาว (Parashara)
 *     สอบทานจากเมทริกซ์ 7x7 ของ PyJHora (ค่า 5/4/3/1/0.5/0 ถอดกลับเป็นเซตมิตร-ศัตรูได้ตรงกัน)
 *
 * additive: ไม่แตะ engine/packet เดิม — ผู้เรียกส่ง nakshatra index (0-26) + rashi (0-11) (+ องศาในราศี) ของจันทร์ทั้งคู่
 */

export const ASHTAKOOTA_ATTRIBUTION = "Ashtakoota tables adapted from saravali.github.io (CC BY-SA 4.0)";

export type AshtakootaMoon = {
  nakshatraIndex: number;  // 0=Aswini … 26=Revati
  rashi: number;           // 0=Aries … 11=Pisces (จันทร์ sidereal)
  rashiDeg?: number;       // องศาในราศี 0-30 (ใช้แบ่งครึ่งราศีธนู/มังกรของ Vashya · ไม่ส่ง = ครึ่งแรก)
};

export type KutaScore = {
  key: string;
  name: string;
  nameTh: string;
  score: number;
  max: number;
  bride: string;           // ค่าที่จัดกลุ่มได้ฝั่งเจ้าสาว (เช่น Varna/Yoni animal/Gana)
  groom: string;
  note?: string;
};

export type AshtakootaResult = {
  system: "ashtakoota_guna_milan_north_36";
  attribution: string;
  bride: { nakshatraIndex: number; rashi: number };
  groom: { nakshatraIndex: number; rashi: number };
  kutas: KutaScore[];
  total: number;
  max: 36;
  rajju: {                 // ไม่รวมใน 36 — kuta เสริมจากหน้า koota_rajju ของแหล่งเดียวกัน
    score: number;
    max: 4;
    bride: string;
    groom: string;
    rule: string;
  };
};

const NAK_N = 27;
const r1 = (n: number) => Math.round(n * 10) / 10;

/* ===== 1) Varna (max 1) — saravali koota_varna: Brahmin=Water(Cancer,Scorpio,Pisces),
   Kshatriya=Fire(Aries,Leo,Sag), Vaishya=Air(Gemini,Libra,Aquarius), Shudra=Earth(Taurus,Virgo,Capricorn) */
const VARNA_NAMES = ["Brahmin", "Kshatriya", "Vaishya", "Shudra"];
// index by rashi 0..11 (Aries..Pisces)
const VARNA_BY_RASHI = [1, 3, 2, 0, 1, 3, 2, 0, 1, 3, 2, 0];
// rows = bride, cols = groom (saravali: "Varna of the groom should be equal or higher")
const VARNA_MATRIX = [
  [1, 0, 0, 0],
  [1, 1, 0, 0],
  [1, 1, 1, 0],
  [1, 1, 1, 1],
];

/* ===== 2) Vashya (max 2) — saravali koota_vashya:
   Quadruped = Aries, Taurus, Capricorn ครึ่งแรก · Human = Gemini, Virgo, Libra, Aquarius ·
   Jalachara = Cancer, Pisces, Capricorn ครึ่งหลัง · Leo · Scorpio
   (ธนูไม่อยู่ในตาราง saravali → เติมตาม Drik/PyJHora: ครึ่งแรก Human ครึ่งหลัง Quadruped) */
const VASHYA_NAMES = ["Quadruped", "Human", "Jalachara", "Leo", "Scorpio"];
function vashyaClass(rashi: number, rashiDeg = 0): number {
  if (rashi === 0 || rashi === 1) return 0;
  if (rashi === 2 || rashi === 5 || rashi === 6 || rashi === 10) return 1;
  if (rashi === 3 || rashi === 11) return 2;
  if (rashi === 4) return 3;
  if (rashi === 7) return 4;
  if (rashi === 8) return rashiDeg < 15 ? 1 : 0; // Sagittarius (variant fill — ดู header)
  return rashiDeg < 15 ? 0 : 2;                  // Capricorn: 1st half Quadruped, 2nd half Jalachara
}
// rows = bride, cols = groom — ตาราง saravali ตรง ๆ
const VASHYA_MATRIX = [
  [2, 0, 0, 0.5, 0],
  [1, 2, 1, 0.5, 1],
  [0.5, 1, 2, 1, 1],
  [0, 0, 0, 2, 0],
  [1, 1, 1, 0, 2],
];

/* ===== 3) Dina/Tara (max 3) — saravali koota_dina:
   "Count the number of Nakshatras from the groom to the bride and divide it by 9.
    If the remainder is 3, 5 or 7, no points are assigned, else 1.5. Repeat in reverse order." */
function taraCount(fromNak: number, toNak: number): number {
  return ((toNak - fromNak + NAK_N) % NAK_N) + 1; // นับรวมตัวตั้ง 1..27
}
function dinaScore(brideNak: number, groomNak: number): { score: number; g2b: number; b2g: number } {
  const g2b = taraCount(groomNak, brideNak) % 9;
  const b2g = taraCount(brideNak, groomNak) % 9;
  const bad = (r: number) => r === 3 || r === 5 || r === 7;
  return { score: (bad(g2b) ? 0 : 1.5) + (bad(b2g) ? 0 : 1.5), g2b, b2g };
}

/* ===== 4) Yoni (max 4) — saravali koota_yoni: nakshatra→สัตว์ 14 ชนิด + เมทริกซ์ 14x14 (rows=bride)
   mapping ตรวจตรงกับ PyJHora yoni_mappings ทุกตัว */
const YONI_NAMES = ["Horse", "Elephant", "Sheep", "Serpent", "Dog", "Cat", "Rat", "Cow", "Buffalo", "Tiger", "Deer", "Monkey", "Mongoose", "Lion"];
// index by nakshatra 0..26 (saravali male/female nakshatra columns → สัตว์)
const YONI_BY_NAK = [0, 1, 2, 3, 3, 4, 5, 2, 5, 6, 6, 7, 8, 9, 8, 9, 10, 10, 4, 11, 12, 11, 13, 0, 13, 7, 1];
// rows = bride, cols = groom — verbatim saravali (สังเกต Horse×Deer=3 ↔ Deer×Horse=1 ไม่สมมาตรตามต้นทาง)
const YONI_MATRIX = [
  [4, 2, 2, 3, 2, 2, 2, 1, 0, 1, 3, 3, 2, 1],
  [2, 4, 3, 3, 2, 2, 2, 2, 3, 1, 2, 3, 2, 0],
  [2, 3, 4, 2, 1, 2, 1, 3, 3, 1, 2, 0, 3, 1],
  [3, 3, 2, 4, 2, 1, 1, 1, 1, 2, 2, 2, 0, 2],
  [2, 2, 1, 2, 4, 2, 1, 2, 2, 1, 0, 2, 1, 1],
  [2, 2, 2, 1, 2, 4, 0, 2, 2, 1, 3, 3, 2, 1],
  [2, 2, 1, 1, 1, 0, 4, 2, 2, 2, 2, 2, 1, 2],
  [1, 2, 3, 1, 2, 2, 2, 4, 3, 0, 3, 2, 2, 1],
  [0, 3, 3, 1, 2, 2, 2, 3, 4, 1, 2, 2, 2, 1],
  [1, 1, 1, 2, 1, 1, 2, 0, 1, 4, 1, 1, 2, 1],
  [1, 2, 2, 2, 0, 3, 2, 3, 2, 1, 4, 2, 2, 1],
  [3, 3, 0, 2, 2, 3, 2, 2, 2, 1, 2, 4, 3, 2],
  [2, 2, 3, 0, 1, 2, 1, 2, 2, 2, 2, 3, 4, 2],
  [1, 0, 1, 2, 1, 1, 2, 1, 2, 1, 1, 2, 2, 4],
];

/* ===== 5) Graha Maitram (max 5) — saravali koota_graha:
   Mutual Friendship=5 · Friend+Neutral=4 · Both Neutral=3 · Friend+Enemy=2 · Neutral+Enemy=1 · Mutual enmity=0
   เจ้าเรือนราศี (มาตรฐาน · ตรวจตรง NeeleshRoy signLordMappings + PyJHora raasi_adhipathi_mappings) */
const LORD_NAMES = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn"];
// index by rashi 0..11 → เจ้าเรือน
const LORD_BY_RASHI = [2, 5, 3, 1, 0, 3, 5, 2, 4, 6, 6, 4];
// ความเป็นมิตร/ศัตรูธรรมชาติ (Parashara) — ถอดสอบทานจาก PyJHora raasi_adhipathi_array 7x7 ทุกช่อง
const GRAHA_FRIENDS: number[][] = [
  [1, 2, 4],       // Sun: Moon, Mars, Jupiter
  [0, 3],          // Moon: Sun, Mercury
  [0, 1, 4],       // Mars: Sun, Moon, Jupiter
  [0, 5],          // Mercury: Sun, Venus
  [0, 1, 2],       // Jupiter: Sun, Moon, Mars
  [3, 6],          // Venus: Mercury, Saturn
  [3, 5],          // Saturn: Mercury, Venus
];
const GRAHA_ENEMIES: number[][] = [
  [5, 6],          // Sun: Venus, Saturn
  [],              // Moon: none
  [3],             // Mars: Mercury
  [1],             // Mercury: Moon
  [3, 5],          // Jupiter: Mercury, Venus
  [0, 1],          // Venus: Sun, Moon
  [0, 1, 2],       // Saturn: Sun, Moon, Mars
];
function relationOf(a: number, b: number): "friend" | "enemy" | "neutral" {
  if (a === b) return "friend"; // เจ้าเรือนเดียวกัน = mutual friendship (PyJHora diagonal = 5)
  if (GRAHA_FRIENDS[a].includes(b)) return "friend";
  if (GRAHA_ENEMIES[a].includes(b)) return "enemy";
  return "neutral";
}
function grahaMaitriScore(brideLord: number, groomLord: number): number {
  const ab = relationOf(brideLord, groomLord);
  const ba = relationOf(groomLord, brideLord);
  const pair = [ab, ba].sort().join("+");
  if (pair === "friend+friend") return 5;
  if (pair === "friend+neutral") return 4;
  if (pair === "neutral+neutral") return 3;
  if (pair === "enemy+friend") return 2;
  if (pair === "enemy+neutral") return 1;
  return 0; // enemy+enemy
}

/* ===== 6) Gana (max 6) — saravali koota_gana: รายชื่อฤกษ์ 3 กลุ่ม + เมทริกซ์ (rows=bride)
   Deva: Aswini, Mrigasira, Punarvasu, Pushyami, Hasta, Swati, Anuradha, Sravana, Revati
   Manushya: Bharani, Rohini, Ardra, PoorvaPhalguni, UttaraPhalguni, Poorvashadha, Uttarashadha, Poorvabhadra, Uttarabhadra
   Rakshasa: Krittika, Aslesha, Magha, Chitra, Visakha, Jyeshta, Moola, Dhanista, Satabhisha */
const GANA_NAMES = ["Deva", "Manushya", "Rakshasa"];
const GANA_DEVA = new Set([0, 4, 6, 7, 12, 14, 16, 21, 26]);
const GANA_MANUSHYA = new Set([1, 3, 5, 10, 11, 19, 20, 24, 25]);
function ganaOf(nak: number): number {
  if (GANA_DEVA.has(nak)) return 0;
  if (GANA_MANUSHYA.has(nak)) return 1;
  return 2;
}
// rows = bride, cols = groom — saravali (= PyJHora gana_array; NeeleshRoy เป็น variant [[6,3,1],…] ไม่ใช้)
const GANA_MATRIX = [
  [6, 6, 0],
  [5, 6, 0],
  [1, 0, 6],
];

/* ===== 7) Rasi/Bhakoot (max 7) — saravali koota_rasi:
   "if the relationship is 5/9, 6/8 or 2/12 they get no points else they get 7 points"
   (benefic mutual positions: 1st, 3rd, 4th, 7th, 10th, 11th — สมมาตรสองทิศ) */
function rasiScore(brideRashi: number, groomRashi: number): { score: number; distance: number } {
  const d = ((groomRashi - brideRashi + 12) % 12) + 1; // นับรวมตัวตั้ง 1..12
  const benefic = d === 1 || d === 3 || d === 4 || d === 7 || d === 10 || d === 11;
  return { score: benefic ? 7 : 0, distance: d };
}

/* ===== 8) Nadi (max 8) — saravali koota_nadi:
   Adi: Aswini, Ardra, Punarvasu, Uttaraphalguni, Hasta, Jyeshta, Moola, Satabhisha, Poorvabhadra
   Madhya: Bharani, Mrigasira, Pushyami, Poorvaphalguni, Chitra, Anuradha, Poorvashadha, Dhanista, Uttarabhadra
   Antya: Krittika, Rohini, Aslesha, Magha, Swati, Visakha, Uttarashadha, Sravana, Revati
   → different Nadi = 8, same = 0 */
const NADI_NAMES = ["Adi", "Madhya", "Antya"];
const NADI_ADI = new Set([0, 5, 6, 11, 12, 17, 18, 23, 24]);
const NADI_MADHYA = new Set([1, 4, 7, 10, 13, 16, 19, 22, 25]);
function nadiOf(nak: number): number {
  if (NADI_ADI.has(nak)) return 0;
  if (NADI_MADHYA.has(nak)) return 1;
  return 2;
}

/* ===== Rajju (เสริม · max 4 · ไม่รวมใน 36) — saravali koota_rajju:
   Aroha: Pada(Aswini,Magha,Moola) Kati(Bharani,PPhalguni,PShadha) Nabhi(Krittika,UPhalguni,UShadha) Kanta(Rohini,Hasta,Sravana)
   Shiro: Mrigasira,Chitra,Dhanista
   Avaroha: Kanta(Ardra,Swati,Satabhisha) Nabhi(Punarvasu,Visakha,PBhadra) Kati(Pushyami,Anuradha,UBhadra) Pada(Aslesha,Jyeshta,Revati)
   Points: 4=diff rajju both Aroha · 3=diff rajju mixed · 2=same rajju Aroha↔Avaroha · 1=diff rajju both Avaroha · 0=same rajju same type */
const RAJJU_PARTS = ["Pada", "Kati", "Nabhi", "Kanta", "Shiro"];
function rajjuOf(nak: number): { part: number; type: "Aroha" | "Shiro" | "Avaroha" } {
  const m = nak % 9; // วนรอบละ 9 ฤกษ์: 0..3 ขาขึ้น · 4 หัว · 5..8 ขาลง
  if (m <= 3) return { part: m, type: "Aroha" };
  if (m === 4) return { part: 4, type: "Shiro" };
  return { part: 8 - m, type: "Avaroha" };
}
function rajjuScore(brideNak: number, groomNak: number): { score: number; bride: string; groom: string; rule: string } {
  const b = rajjuOf(brideNak), g = rajjuOf(groomNak);
  const bl = `${RAJJU_PARTS[b.part]}/${b.type}`, gl = `${RAJJU_PARTS[g.part]}/${g.type}`;
  let score: number;
  let rule: string;
  if (b.part === g.part) {
    if (b.type !== g.type) { score = 2; rule = "same rajju, one Aroha one Avaroha"; }
    else { score = 0; rule = "same rajju and same type"; }
  } else if (b.type === "Aroha" && g.type === "Aroha") { score = 4; rule = "different rajjus, both Aroha"; }
  else if (b.type === "Avaroha" && g.type === "Avaroha") { score = 1; rule = "different rajjus, both Avaroha"; }
  else { score = 3; rule = "different rajjus, mixed type"; }
  return { score, bride: bl, groom: gl, rule };
}

function assertMoon(m: AshtakootaMoon, who: string): void {
  if (!Number.isInteger(m.nakshatraIndex) || m.nakshatraIndex < 0 || m.nakshatraIndex > 26) throw new Error(`${who}: nakshatraIndex ต้องเป็น 0-26`);
  if (!Number.isInteger(m.rashi) || m.rashi < 0 || m.rashi > 11) throw new Error(`${who}: rashi ต้องเป็น 0-11`);
}

/** คำนวณ Ashtakoota 8 kuta / 36 คะแนน (bride = ฝ่ายหญิง · groom = ฝ่ายชาย) + Rajju เสริม */
export function ashtakoota(bride: AshtakootaMoon, groom: AshtakootaMoon): AshtakootaResult {
  assertMoon(bride, "bride");
  assertMoon(groom, "groom");
  const bv = VARNA_BY_RASHI[bride.rashi], gv = VARNA_BY_RASHI[groom.rashi];
  const bva = vashyaClass(bride.rashi, bride.rashiDeg ?? 0), gva = vashyaClass(groom.rashi, groom.rashiDeg ?? 0);
  const dina = dinaScore(bride.nakshatraIndex, groom.nakshatraIndex);
  const by = YONI_BY_NAK[bride.nakshatraIndex], gy = YONI_BY_NAK[groom.nakshatraIndex];
  const bl = LORD_BY_RASHI[bride.rashi], gl = LORD_BY_RASHI[groom.rashi];
  const bg = ganaOf(bride.nakshatraIndex), gg = ganaOf(groom.nakshatraIndex);
  const rasi = rasiScore(bride.rashi, groom.rashi);
  const bn = nadiOf(bride.nakshatraIndex), gn = nadiOf(groom.nakshatraIndex);

  const kutas: KutaScore[] = [
    { key: "varna", name: "Varna", nameTh: "วรรณะ (ระดับจิต/หน้าที่)", score: VARNA_MATRIX[bv][gv], max: 1, bride: VARNA_NAMES[bv], groom: VARNA_NAMES[gv] },
    { key: "vashya", name: "Vashya", nameTh: "อำนาจดึงดูด/การโอนอ่อน", score: VASHYA_MATRIX[bva][gva], max: 2, bride: VASHYA_NAMES[bva], groom: VASHYA_NAMES[gva] },
    { key: "dina", name: "Dina (Tara)", nameTh: "ดวงดาววันเกิด/สุขภาพ-โชค", score: dina.score, max: 3, bride: `tara-remainder ${dina.g2b}`, groom: `tara-remainder ${dina.b2g}`, note: "เศษ 3/5/7 = 0 ต่อทิศ (กฎ saravali)" },
    { key: "yoni", name: "Yoni", nameTh: "แรงดึงดูดทางกาย", score: YONI_MATRIX[by][gy], max: 4, bride: YONI_NAMES[by], groom: YONI_NAMES[gy] },
    { key: "grahaMaitri", name: "Graha Maitram", nameTh: "มิตรภาพเจ้าเรือนจันทร์ (จิตใจ)", score: grahaMaitriScore(bl, gl), max: 5, bride: LORD_NAMES[bl], groom: LORD_NAMES[gl] },
    { key: "gana", name: "Gana", nameTh: "พื้นอารมณ์/อุปนิสัย", score: GANA_MATRIX[bg][gg], max: 6, bride: GANA_NAMES[bg], groom: GANA_NAMES[gg] },
    { key: "rasi", name: "Rasi (Bhakoot)", nameTh: "ตำแหน่งราศีจันทร์ต่อกัน", score: rasi.score, max: 7, bride: `rashi ${bride.rashi}`, groom: `rashi ${groom.rashi}`, note: `mutual position ${rasi.distance} (2/12, 5/9, 6/8 = 0)` },
    { key: "nadi", name: "Nadi", nameTh: "ธาตุชีพจร/สุขภาพลูกหลาน", score: bn !== gn ? 8 : 0, max: 8, bride: NADI_NAMES[bn], groom: NADI_NAMES[gn], note: bn === gn ? "Nadi เดียวกัน = Nadi dosha (0 คะแนน)" : undefined },
  ];
  const total = r1(kutas.reduce((s, k) => s + k.score, 0));
  const rajju = rajjuScore(bride.nakshatraIndex, groom.nakshatraIndex);
  return {
    system: "ashtakoota_guna_milan_north_36",
    attribution: ASHTAKOOTA_ATTRIBUTION,
    bride: { nakshatraIndex: bride.nakshatraIndex, rashi: bride.rashi },
    groom: { nakshatraIndex: groom.nakshatraIndex, rashi: groom.rashi },
    kutas,
    total,
    max: 36,
    rajju: { score: rajju.score, max: 4, bride: rajju.bride, groom: rajju.groom, rule: rajju.rule },
  };
}
