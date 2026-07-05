/* test-r413b-heluo.mjs · เทสแก้บั๊ก 河洛理數 ชื่อ卦ผิด 63/64 (5 ก.ค. 2026)
 * รัน: cd /root/decode-app && node --experimental-strip-types --import ./scripts/_ts-resolver-account.mjs scripts/test-r413b-heluo.mjs
 *
 * มิติเทส:
 *  (ก) 64/64 round-trip binary↔ชื่อ卦↔เลข King Wen เทียบตาราง 8×8 มาตรฐาน (เขียนแยกอิสระในไฟล์นี้)
 *      + invariant โครงสร้าง: unique 64 คู่/64 เลข + กฎคู่ King Wen (n คี่ → n+1 = พลิกกลับหัว หรือ complement เฉพาะ 1,27,29,61)
 *  (ข) เคสรอบ audit: 乾乾→1乾 · 坤坤→2坤 · 坎上離下→63既濟 · 離上坎下→64未濟 · 乾上坤下→12否 · 坤上乾下→11泰
 *  (ค) calcHeluo ดวงจริง (Aeaw + Mai + สุ่ม 5 วันเกิดผ่าน calcBazi) → ชื่อ卦 pre/post/annual/monthly
 *      ต้องสอดคล้องตรีลักษณ์ (re-implement สูตร rotation อิสระในไฟล์นี้) + ป้าย post-heaven ตรง卦หลัง flip
 *  (ง) ยิง /api/chart: live server (ก่อนแก้ · port 3349) + in-process route (โค้ดหลังแก้) → เทียบ heluo_astrology
 *  (จ) ตารางก่อน/หลัง 10 卦ตัวอย่าง + นับว่าโค้ดเก่าผิดกี่ตัวจาก 64
 */
import nextEnv from "@next/env";
import { randomUUID } from "node:crypto";

nextEnv.loadEnvConfig(process.cwd());

let pass = 0, fail = 0;
const ok = (c, label, detail = "") => {
  if (c) { pass++; console.log("  ✅ " + label); }
  else { fail++; console.log("  ❌ " + label + (detail ? " · " + detail : "")); }
};

/* ── ตารางอ้างอิงอิสระ (เขียนจากตำรามาตรฐาน 8×8 · rows=下卦 cols=上卦) ── */
const T = ["乾", "兌", "離", "震", "巽", "坎", "艮", "坤"]; // idx 1-8 ในไฟล์ engine
// MATRIX[lower][upper] = [เลข King Wen, ชื่อ]
const MATRIX = {
  "乾": { "乾": [1, "乾"], "兌": [43, "夬"], "離": [14, "大有"], "震": [34, "大壯"], "巽": [9, "小畜"], "坎": [5, "需"], "艮": [26, "大畜"], "坤": [11, "泰"] },
  "兌": { "乾": [10, "履"], "兌": [58, "兌"], "離": [38, "睽"], "震": [54, "歸妹"], "巽": [61, "中孚"], "坎": [60, "節"], "艮": [41, "損"], "坤": [19, "臨"] },
  "離": { "乾": [13, "同人"], "兌": [49, "革"], "離": [30, "離"], "震": [55, "豐"], "巽": [37, "家人"], "坎": [63, "既濟"], "艮": [22, "賁"], "坤": [36, "明夷"] },
  "震": { "乾": [25, "無妄"], "兌": [17, "隨"], "離": [21, "噬嗑"], "震": [51, "震"], "巽": [42, "益"], "坎": [3, "屯"], "艮": [27, "頤"], "坤": [24, "復"] },
  "巽": { "乾": [44, "姤"], "兌": [28, "大過"], "離": [50, "鼎"], "震": [32, "恆"], "巽": [57, "巽"], "坎": [48, "井"], "艮": [18, "蠱"], "坤": [46, "升"] },
  "坎": { "乾": [6, "訟"], "兌": [47, "困"], "離": [64, "未濟"], "震": [40, "解"], "巽": [59, "渙"], "坎": [29, "坎"], "艮": [4, "蒙"], "坤": [7, "師"] },
  "艮": { "乾": [33, "遯"], "兌": [31, "咸"], "離": [56, "旅"], "震": [62, "小過"], "巽": [53, "漸"], "坎": [39, "蹇"], "艮": [52, "艮"], "坤": [15, "謙"] },
  "坤": { "乾": [12, "否"], "兌": [45, "萃"], "離": [35, "晉"], "震": [16, "豫"], "巽": [20, "觀"], "坎": [8, "比"], "艮": [23, "剝"], "坤": [2, "坤"] },
};
// encoding ตรีลักษณ์เดียวกับ engine (bottom→top): 乾111 兌110 離101 震100 巽011 坎010 艮001 坤000
const TBIN = { "乾": "111", "兌": "110", "離": "101", "震": "100", "巽": "011", "坎": "010", "艮": "001", "坤": "000" };
const BIN2T = Object.fromEntries(Object.entries(TBIN).map(([k, v]) => [v, k]));

/* ── โหลด engine หลังแก้ ── */
const heluo = await import("../src/lib/heluo-astrology.ts");
const { calcHeluo, KING_WEN } = heluo;

/* HEX_NAMES ไม่ export · สร้างสำเนาอิสระจาก MATRIX เพื่อเช็คชื่อ */
const NAME_BY_NUM = {};
for (const lo of T) for (const up of T) { const [n, name] = MATRIX[lo][up]; NAME_BY_NUM[n] = name; }

console.log("\n══ (ก) 64/64 round-trip KING_WEN เทียบตาราง 8×8 มาตรฐาน ══");
{
  let matched = 0, wrong = [];
  const seenNums = new Set(), seenKeys = new Set();
  for (const lo of T) for (const up of T) {
    const key = TBIN[up] + TBIN[lo];
    const expectNum = MATRIX[lo][up][0];
    const gotNum = KING_WEN[key];
    seenKeys.add(key); seenNums.add(gotNum);
    if (gotNum === expectNum) matched++;
    else wrong.push(`${up}上${lo}下: expect ${expectNum}${MATRIX[lo][up][1]} got ${gotNum}`);
  }
  ok(matched === 64, `KING_WEN ตรงตาราง 8×8 ครบ ${matched}/64`, wrong.slice(0, 5).join(" | "));
  ok(seenKeys.size === 64 && Object.keys(KING_WEN).length === 64, "key binary unique 64 คู่");
  ok(seenNums.size === 64 && [...seenNums].every(n => n >= 1 && n <= 64), "เลข King Wen unique 1-64 ครบ");

  // invariant กฎคู่ King Wen: hexagram เต็ม 6 เส้น bottom→top = lowerBin + upperBin
  const linesByNum = {};
  for (const lo of T) for (const up of T) linesByNum[MATRIX[lo][up][0]] = TBIN[lo] + TBIN[up];
  const complementPairs = new Set([1, 27, 29, 61]);
  let pairOk = 0, pairBad = [];
  for (let n = 1; n <= 63; n += 2) {
    const a = linesByNum[n], b = linesByNum[n + 1];
    const expected = complementPairs.has(n)
      ? a.split("").map(c => c === "1" ? "0" : "1").join("")   // complement (卦พลิกกลับหัวแล้วเหมือนเดิม)
      : a.split("").reverse().join("");                          // พลิกกลับหัว (綜卦)
    if (b === expected) pairOk++; else pairBad.push(`${n}/${n + 1}`);
  }
  ok(pairOk === 32, `กฎคู่ King Wen (綜卦/錯卦) ผ่าน ${pairOk}/32 คู่`, pairBad.join(","));

  // 8 卦บริสุทธิ์
  const pure = { "乾": 1, "兌": 58, "離": 30, "震": 51, "巽": 57, "坎": 29, "艮": 52, "坤": 2 };
  ok(Object.entries(pure).every(([t, n]) => KING_WEN[TBIN[t] + TBIN[t]] === n), "8 卦บริสุทธิ์ (乾1兌58離30震51巽57坎29艮52坤2)");
}

console.log("\n══ (ข) เคสรอบ audit 6 เคส ══");
{
  const cases = [
    ["乾", "乾", 1, "乾"], ["坤", "坤", 2, "坤"],
    ["坎", "離", 63, "既濟"], ["離", "坎", 64, "未濟"],
    ["乾", "坤", 12, "否"], ["坤", "乾", 11, "泰"],
  ];
  for (const [up, lo, num, name] of cases) {
    const got = KING_WEN[TBIN[up] + TBIN[lo]];
    ok(got === num, `${up}上${lo}下 → ${num}${name}`, `got ${got}(${NAME_BY_NUM[got] || "?"})`);
  }
}

console.log("\n══ (จ) ตารางก่อน/หลัง 10 卦ตัวอย่าง (เก่า=parseInt+1 · ใหม่=King Wen) ══");
{
  const samples = [["乾","乾"],["坤","坤"],["坎","離"],["離","坎"],["乾","坤"],["坤","乾"],["坎","震"],["艮","坎"],["巽","乾"],["震","兌"]];
  let oldWrong = 0;
  for (const lo of T) for (const up of T) {
    const key = TBIN[up] + TBIN[lo];
    if ((parseInt(key, 2) + 1) !== MATRIX[lo][up][0]) oldWrong++;
  }
  console.log("  ┌ 上卦/下卦 │ เก่า(ผิด) │ ใหม่(ถูก)");
  for (const [up, lo] of samples) {
    const key = TBIN[up] + TBIN[lo];
    const oldNum = parseInt(key, 2) + 1, newNum = KING_WEN[key];
    console.log(`  │ ${up}上${lo}下 │ ${String(oldNum).padStart(2)} ${NAME_BY_NUM[oldNum]} │ ${String(newNum).padStart(2)} ${NAME_BY_NUM[newNum]}`);
  }
  console.log(`  └ โค้ดเก่าให้ชื่อผิด ${oldWrong}/64 卦`);
  // audit เดิมประเมิน 63/64 · ตรวจ exhaustive จริงพบผิดครบ 64/64 (ไม่มี卦ไหน parseInt+1 บังเอิญตรง King Wen)
  ok(oldWrong === 64, `โค้ดเก่าผิด ${oldWrong}/64 (แรงกว่าที่ audit ประเมิน 63/64 — ผิดหมดทุก卦)`);
}

/* ── (ค) calcHeluo ดวงจริง · re-implement สูตรอิสระเพื่อเช็คความสอดคล้อง ── */
console.log("\n══ (ค) calcHeluo ดวงจริง (Aeaw + Mai + สุ่ม 5) ══");
const STEM_NUM = { "甲": 10, "己": 10, "乙": 9, "庚": 9, "丙": 8, "辛": 8, "丁": 7, "壬": 7, "戊": 5, "癸": 5 };
const BRANCH_NUM = { "子": 1, "午": 9, "卯": 3, "酉": 7, "丑": 8, "寅": 8, "辰": 4, "巳": 4, "未": 2, "申": 2, "戌": 6, "亥": 6 };
const TZH = { 1: "乾", 2: "兌", 3: "離", 4: "震", 5: "巽", 6: "坎", 7: "艮", 8: "坤" };

function expectedHeluo(pillars, birthYear, now) {
  const stems = ["year", "month", "day", "hour"].map(k => pillars[k].stem);
  const branches = ["year", "month", "day", "hour"].map(k => pillars[k].branch);
  const heavenly = stems.reduce((a, s) => a + (STEM_NUM[s] || 0), 0);
  const earthly = branches.reduce((a, b) => a + (BRANCH_NUM[b] || 0), 0);
  const upperTrig = ((heavenly - 1) % 8) + 1, lowerTrig = ((earthly - 1) % 8) + 1;
  const upperBin = TBIN[TZH[upperTrig]], lowerBin = TBIN[TZH[lowerTrig]];
  const kw = (u, l) => MATRIX[BIN2T[l]][BIN2T[u]];
  const line = ((heavenly + earthly - 1) % 6) + 1;
  const full = (upperBin + lowerBin).split("");
  full[6 - line] = full[6 - line] === "1" ? "0" : "1";
  const postU = full.slice(0, 3).join(""), postL = full.slice(3, 6).join("");
  const age = now.getFullYear() - birthYear + 1;
  const ageBlock = Math.floor((age - 1) / 6);
  const annU = TBIN[TZH[((upperTrig - 1 + ageBlock) % 8) + 1]], annL = TBIN[TZH[((lowerTrig - 1 + ageBlock) % 8) + 1]];
  const month = now.getMonth() + 1, monthBlock = Math.floor((month - 1) / 2);
  const monU = TBIN[TZH[((upperTrig - 1 + monthBlock + age) % 8) + 1]], monL = TBIN[TZH[((lowerTrig - 1 + monthBlock) % 8) + 1]];
  return {
    pre: { num: kw(upperBin, lowerBin)[0], name: kw(upperBin, lowerBin)[1], upper: TZH[upperTrig], lower: TZH[lowerTrig] },
    post: { num: kw(postU, postL)[0], name: kw(postU, postL)[1], upper: BIN2T[postU], lower: BIN2T[postL] },
    annual: { num: kw(annU, annL)[0], name: kw(annU, annL)[1] },
    monthly: { num: kw(monU, monL)[0], name: kw(monU, monL)[1] },
  };
}

function checkChart(label, pillars, birthYear, now) {
  const r = calcHeluo(pillars, birthYear, now);
  const e = expectedHeluo(pillars, birthYear, now);
  const allOk =
    r.pre_heaven.hex === e.pre.num && r.pre_heaven.name === e.pre.name &&
    r.pre_heaven.upper === e.pre.upper && r.pre_heaven.lower === e.pre.lower &&
    r.post_heaven.hex === e.post.num && r.post_heaven.name === e.post.name &&
    r.post_heaven.upper === e.post.upper && r.post_heaven.lower === e.post.lower &&
    r.annual.hex === e.annual.num && r.annual.name === e.annual.name &&
    r.monthly.hex === e.monthly.num && r.monthly.name === e.monthly.name;
  ok(allOk, `${label}: pre ${r.pre_heaven.upper}上${r.pre_heaven.lower}下=${r.pre_heaven.hex}${r.pre_heaven.name} · post ${r.post_heaven.upper}上${r.post_heaven.lower}下=${r.post_heaven.hex}${r.post_heaven.name} (爻${r.pre_heaven.changing_line}) · annual ${r.annual.hex}${r.annual.name} · monthly ${r.monthly.hex}${r.monthly.name}`,
    JSON.stringify({ got: r, expect: e }));
  return r;
}

const NOW = new Date();
// golden pillars (จาก scripts/test-bazi-calc.cjs · Voytek verified)
checkChart("Aeaw 1984-12-31 13:15", {
  year: { stem: "甲", branch: "子" }, month: { stem: "丙", branch: "子" },
  day: { stem: "己", branch: "亥" }, hour: { stem: "庚", branch: "午" },
}, 1984, NOW);
checkChart("Mai 1986-04-12 16:42", {
  year: { stem: "丙", branch: "寅" }, month: { stem: "壬", branch: "辰" },
  day: { stem: "丙", branch: "戌" }, hour: { stem: "丙", branch: "申" },
}, 1986, NOW);

// สุ่ม 5 วันเกิด (fix seed list · reproducible) → pillars จริงผ่าน calcBazi (Layer 0-1)
const { calcBazi } = await import("../src/lib/bazi-calc.ts");
const randomBirths = [
  ["1975-03-08", "05:30"], ["1992-11-21", "22:10"], ["2001-07-04", "09:45"],
  ["1988-02-29", "17:20"], ["2010-09-15", "12:00"],
];
for (const [date, time] of randomBirths) {
  const calc = await calcBazi({ date, time, longitude: 100.5018, gmtOffsetHours: 7, gender: "M", dayBoundary: "23:00", birthTimeKnown: true });
  checkChart(`สุ่ม ${date} ${time} (${calc.pillarsZh.year}·${calc.pillarsZh.month}·${calc.pillarsZh.day}·${calc.pillarsZh.hour})`,
    calc.pillars, Number(date.slice(0, 4)), NOW);
}

/* ── (ง) ยิง /api/chart ── */
console.log("\n══ (ง) /api/chart · live (ก่อนแก้ r411) vs in-process (หลังแก้) ══");
const { signSession } = await import("../src/lib/auth.ts");
const jwt = await signSession({ userId: randomUUID(), email: "test-r413b@test.hourkey.io", orgId: null });
const chartBody = { date: "1984-12-31", time: "13:15", longitude: 100.5018, gender: "M" };

// 1) live server (โค้ด production ปัจจุบัน = ก่อนแก้)
let liveHeluo = null;
try {
  const res = await fetch("http://127.0.0.1:3349/api/chart", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `decode_auth=${jwt}` },
    body: JSON.stringify(chartBody),
  });
  const j = await res.json();
  liveHeluo = j.heluo_astrology || null;
  ok(res.status === 200, `live /api/chart status 200 (got ${res.status})`);
  console.log("  📡 live (ก่อนแก้): pre=" + (liveHeluo ? `${liveHeluo.pre_heaven.hex}${liveHeluo.pre_heaven.name} (${liveHeluo.pre_heaven.upper}上${liveHeluo.pre_heaven.lower}下)` : "null")
    + (liveHeluo ? ` · post=${liveHeluo.post_heaven.hex}${liveHeluo.post_heaven.name}` : ""));
} catch (e) {
  console.log("  ⚠️ live server ยิงไม่ได้: " + e.message);
}

// 2) in-process route (โค้ดหลังแก้) · stub next/headers + shim require ของ webpack
globalThis.__testCookies = { decode_auth: jwt };
globalThis.require = (spec) => {
  if (spec === "@/lib/heluo-astrology") return heluo; // route ใช้ require (webpack-compiled บน prod) · เทส in-process ต้อง shim
  throw new Error("test require shim: unexpected " + spec);
};
const route = await import("../src/app/api/chart/route.ts");
const req = new Request("http://127.0.0.1/api/chart", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(chartBody),
});
const resp = await route.POST(req);
const json = await resp.json();
ok(resp.status === 200, `in-process /api/chart status 200 (got ${resp.status})`);
const h = json.heluo_astrology;
ok(!!h, "heluo_astrology ไม่เป็น null");
if (h) {
  const e = expectedHeluo({
    year: { stem: "甲", branch: "子" }, month: { stem: "丙", branch: "子" },
    day: { stem: "己", branch: "亥" }, hour: { stem: "庚", branch: "午" },
  }, 1984, NOW);
  ok(h.pre_heaven.hex === e.pre.num && h.pre_heaven.name === e.pre.name, `API pre_heaven = ${e.pre.num}${e.pre.name} (got ${h.pre_heaven.hex}${h.pre_heaven.name})`);
  ok(h.post_heaven.hex === e.post.num && h.post_heaven.name === e.post.name && h.post_heaven.upper === e.post.upper && h.post_heaven.lower === e.post.lower,
    `API post_heaven = ${e.post.num}${e.post.name} (${e.post.upper}上${e.post.lower}下) (got ${h.post_heaven.hex}${h.post_heaven.name} ${h.post_heaven.upper}上${h.post_heaven.lower}下)`);
  ok(h.annual.hex === e.annual.num && h.monthly.hex === e.monthly.num, `API annual=${e.annual.num}${e.annual.name} monthly=${e.monthly.num}${e.monthly.name} (got ${h.annual.hex}${h.annual.name}/${h.monthly.hex}${h.monthly.name})`);
  console.log("  🔬 in-process (หลังแก้): pre=" + `${h.pre_heaven.hex}${h.pre_heaven.name} (${h.pre_heaven.upper}上${h.pre_heaven.lower}下)` + ` · post=${h.post_heaven.hex}${h.post_heaven.name} (${h.post_heaven.upper}上${h.post_heaven.lower}下)` + ` · annual=${h.annual.hex}${h.annual.name} · monthly=${h.monthly.hex}${h.monthly.name}`);
  // ตัวเลขคำนวณ (heavenly/earthly/เส้น) ต้องไม่เปลี่ยนจาก live (แก้เฉพาะชื่อ/ป้าย)
  if (liveHeluo) {
    ok(JSON.stringify(liveHeluo.numbers) === JSON.stringify(h.numbers), "numbers (heavenly/earthly) เท่าเดิมทุกตัว — logic คำนวณไม่ถูกแตะ",
      JSON.stringify({ live: liveHeluo.numbers, new: h.numbers }));
    ok(liveHeluo.pre_heaven.changing_line === h.pre_heaven.changing_line, "เส้นเปลี่ยน (爻) เท่าเดิม");
    ok(liveHeluo.pre_heaven.upper === h.pre_heaven.upper && liveHeluo.pre_heaven.lower === h.pre_heaven.lower, "ตรีลักษณ์ pre-heaven เท่าเดิม (ชื่อ卦เท่านั้นที่เปลี่ยน)");
  }
}

console.log(`\n══ สรุป: ✅ ${pass} · ❌ ${fail} ══`);
process.exit(fail === 0 ? 0 : 1);
