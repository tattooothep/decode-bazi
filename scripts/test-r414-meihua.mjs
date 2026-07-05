/* test-r414-meihua.mjs · เทสแก้บั๊ก hex64 ใน /api/auspicious (5 ก.ค. 2026)
 * บั๊กเดิม: hexNum = hash เลขกิ่ง (day*12 + hour*7 + zodiac) % 64 — เลข卦ไม่มีที่มาเชิง易
 * แก้เป็น: 梅花易數 以時間起卦 (年支數+月+日 จันทรคติ → 上卦 · +時支數 → 下卦 · 動爻 %6)
 *
 * รัน: cd /root/decode-app && npx tsx scripts/test-r414-meihua.mjs [--api-only|--no-api]
 * (ต้องมี .env.local: PG* + AUTH_SECRET · ส่วน API จะ start dev server เองที่ port 3991)
 *
 * มิติเทส:
 *  (ก) tyme4ts จันทรคติเทียบวันยึดภายนอก 9 วัน (ตรุษจีน×4 · ไหว้พระจันทร์×3 · บ๊ะจ่าง×2 + 閏月)
 *  (ข) สูตร梅花เทียบเคสตำราต้นฉบับ 2 เคส (觀梅占→革初爻→咸 · 牡丹占→姤五爻→鼎) + สูตรเขียนซ้ำอิสระ
 *  (ค) KING_WEN round-trip 64/64 เทียบตาราง 8×8 มาตรฐานอิสระ + HEX_NAMES ใน route.ts ตรง 64/64
 *  (ง) sweep หลายเดือน (ก.ค./ก.ย./ธ.ค. 2569 · ก.พ. 2570) × หลายยาม: 子 vs 午 คนละ下卦 ·
 *      กระจายตัวสมเหตุผล · เลข卦 1-64 · 動爻 1-6 เสมอ
 *  (จ) ยิง /api/auspicious จริง before(hash)/after(梅花): ศาสตร์อื่น byte-เท่าเดิม ·
 *      hex64 หลังแก้ตรงสูตรอิสระทุก slot · shape ครบ (hex_num/hex_name/changing_line/label/tags) ·
 *      universal-only (ไม่ล็อกอิน) เท่าเดิมทั้งก้อน · + ตาราง 10 แถวก่อน/หลัง
 */
import { spawn, execFileSync } from "node:child_process";
import { copyFileSync, readFileSync, mkdirSync } from "node:fs";
import { SignJWT } from "jose";
import nextEnv from "@next/env";
import { SolarDay } from "tyme4ts";
import pgpkg from "pg";

nextEnv.loadEnvConfig(process.cwd());

const ARG = process.argv.slice(2);
const API_ONLY = ARG.includes("--api-only");
const NO_API = ARG.includes("--no-api");

let pass = 0, fail = 0;
const ok = (c, label, detail = "") => {
  if (c) { pass++; console.log("  ✅ " + label); }
  else { fail++; console.log("  ❌ " + label + (detail ? " · " + detail : "")); }
};

const BRANCHES = ["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"];

/* ── ตารางอ้างอิงอิสระ (ตำรามาตรฐาน 8×8 · เขียนซ้ำในไฟล์นี้ · ไม่ import จาก engine) ── */
const T8 = ["乾", "兌", "離", "震", "巽", "坎", "艮", "坤"]; // 先天八卦數 1-8
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
// MATRIX[lower][upper] = [เลข King Wen, ชื่อ]
const NAME_BY_NUM = {};
for (const lo of T8) for (const up of T8) { const [n, name] = MATRIX[lo][up]; NAME_BY_NUM[n] = name; }
const TBIN = { "乾": "111", "兌": "110", "離": "101", "震": "100", "巽": "011", "坎": "010", "艮": "001", "坤": "000" };

/* ── สูตร梅花เขียนซ้ำอิสระ (จากเลขจันทรคติตรงๆ · ใช้ MATRIX อิสระ ไม่แตะ KING_WEN) ── */
function meihuaIndep(yNum, mNum, dNum, hNum) {
  const upXT = ((yNum + mNum + dNum) % 8) || 8;
  const loXT = ((yNum + mNum + dNum + hNum) % 8) || 8;
  const yao = ((yNum + mNum + dNum + hNum) % 6) || 6;
  const up = T8[upXT - 1], lo = T8[loXT - 1];
  const [num, name] = MATRIX[lo][up];
  return { num, name, up, lo, yao };
}
/* จันทรคติจาก tyme4ts (ตัว lib ถูก validate ใน (ก) ก่อน) */
function lunarNums(dateStr, hourBranch) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const ld = SolarDay.fromYmd(y, m, d).getLunarDay();
  return {
    y: ld.getLunarMonth().getLunarYear().getSixtyCycle().getEarthBranch().getIndex() + 1,
    m: Math.abs(ld.getLunarMonth().getMonth()),
    d: ld.getDay(),
    h: BRANCHES.indexOf(hourBranch) + 1,
  };
}
function meihuaForSlot(dateStr, hourBranch) {
  const L = lunarNums(dateStr, hourBranch);
  return { ...meihuaIndep(L.y, L.m, L.d, L.h), L };
}
/* hash เดิม (before) เขียนซ้ำเพื่อทำตารางเทียบ */
function oldHash(dayBranch, hourBranch, cZ) {
  const i = (b) => BRANCHES.indexOf(b);
  return {
    num: ((i(dayBranch) * 12 + i(hourBranch) * 7 + i(cZ)) % 64) + 1,
    yao: ((i(hourBranch) + i(dayBranch)) % 6) + 1,
  };
}

if (!API_ONLY) {

console.log("\n══ (ก) tyme4ts จันทรคติ เทียบวันยึดภายนอก 9 วัน ══");
{
  // [gregorian, 年支數, เดือนจันทรคติ, วันจันทรคติ, คำอธิบาย]
  const ANCHORS = [
    ["2023-01-22", 4, 1, 1, "ตรุษจีน 癸卯"],
    ["2024-02-10", 5, 1, 1, "ตรุษจีน 甲辰"],
    ["2025-01-29", 6, 1, 1, "ตรุษจีน 乙巳"],
    ["2026-02-17", 7, 1, 1, "ตรุษจีน 丙午"],
    ["2024-09-17", 5, 8, 15, "ไหว้พระจันทร์ 甲辰"],
    ["2025-10-06", 6, 8, 15, "ไหว้พระจันทร์ 乙巳"],
    ["2026-09-25", 7, 8, 15, "ไหว้พระจันทร์ 丙午"],
    ["2025-05-31", 6, 5, 5, "บ๊ะจ่าง 乙巳"],
    ["2026-06-19", 7, 5, 5, "บ๊ะจ่าง 丙午"],
  ];
  for (const [g, ey, em, ed, label] of ANCHORS) {
    const L = lunarNums(g, "子");
    ok(L.y === ey && L.m === em && L.d === ed,
      `${g} = ${label} → 年${ey} 月${em} 日${ed}`,
      `ได้ 年${L.y} 月${L.m} 日${L.d}`);
  }
  // 閏月: 2025-08-01 = 乙巳 閏六月初八 → เดือนใช้เลข 6 (閏ใช้เลขเดือนเดิม)
  const L = lunarNums("2025-08-01", "子");
  ok(L.y === 6 && L.m === 6 && L.d === 8, "2025-08-01 = 閏六月初八 → 月6 日8 (閏月ใช้เลขเดิม)", JSON.stringify(L));
}

console.log("\n══ (ข) เคสตำราต้นฉบับ 梅花易數 (สูตรอิสระ) ══");
{
  // 觀梅占: 辰年(5) 十二月(12) 十七日(17) 申時(9) → 上兌 下離 = 澤火革49 · 動爻1 · 變→咸
  const a = meihuaIndep(5, 12, 17, 9);
  ok(a.num === 49 && a.name === "革" && a.up === "兌" && a.lo === "離" && a.yao === 1,
    "觀梅占 辰年12月17日申時 → 澤火革(49) 動爻1", JSON.stringify(a));
  // 牡丹占: 巳年(6) 三月(3) 十六日(16) 卯時(4) → 上乾 下巽 = 天風姤44 · 動爻5 · 變→鼎
  const b = meihuaIndep(6, 3, 16, 4);
  ok(b.num === 44 && b.name === "姤" && b.up === "乾" && b.lo === "巽" && b.yao === 5,
    "牡丹占 巳年3月16日卯時 → 天風姤(44) 動爻5", JSON.stringify(b));
  // 變卦 (พลิกเส้น動爻) ต้องได้ตามตำรา: 革→咸(31) · 姤→鼎(50)
  const flip = (r) => {
    // TBIN แต่ละตรีลักษณ์เรียง "ล่าง→บน" (兌=110: ล่างหยาง กลางหยาง บนยิน) · full = up(เส้น4-6) + lo(เส้น1-3)
    const bits = (TBIN[r.up] + TBIN[r.lo]).split("");
    const idx = r.yao <= 3 ? 2 + r.yao : r.yao - 4; // เส้น1→idx3 (ล่างสุดของ下卦) · เส้น4→idx0
    bits[idx] = bits[idx] === "1" ? "0" : "1";
    const ub = bits.slice(0, 3).join(""), lb = bits.slice(3).join("");
    const u = T8[Object.values(TBIN).indexOf(ub)], l = T8[Object.values(TBIN).indexOf(lb)];
    return MATRIX[l][u];
  };
  ok(flip(a)[0] === 31 && flip(a)[1] === "咸", "變卦 革 爻1 → 咸(31) ตรงตำรา", JSON.stringify(flip(a)));
  ok(flip(b)[0] === 50 && flip(b)[1] === "鼎", "變卦 姤 爻5 → 鼎(50) ตรงตำรา", JSON.stringify(flip(b)));
}

console.log("\n══ (ค) KING_WEN 64/64 + HEX_NAMES ใน route.ts ══");
{
  const { KING_WEN } = await import("../src/lib/heluo-astrology.ts");
  let matched = 0; const wrong = [];
  for (const lo of T8) for (const up of T8) {
    const got = KING_WEN[TBIN[up] + TBIN[lo]];
    if (got === MATRIX[lo][up][0]) matched++;
    else wrong.push(`${up}上${lo}下 expect ${MATRIX[lo][up][0]} got ${got}`);
  }
  ok(matched === 64, `KING_WEN ตรงตาราง 8×8 มาตรฐาน ${matched}/64`, wrong.slice(0, 3).join(" · "));
  // HEX_NAMES literal ใน route.ts (ตารางที่ user เห็นจริง) ตรงชื่อมาตรฐาน 64/64
  const src = readFileSync("src/app/api/auspicious/route.ts", "utf8");
  const mm = src.match(/const HEX_NAMES: Record<number, string> = \{([^}]+)\}/);
  ok(!!mm, "พบ HEX_NAMES ใน route.ts");
  if (mm) {
    const tbl = Object.fromEntries(mm[1].split(",").map(s => s.trim()).filter(Boolean)
      .map(s => { const [k, v] = s.split(":"); return [Number(k), v.replace(/['"]/g, "")]; }));
    let nOk = 0; const nBad = [];
    for (let n = 1; n <= 64; n++) (tbl[n] === NAME_BY_NUM[n]) ? nOk++ : nBad.push(`${n}:${tbl[n]}≠${NAME_BY_NUM[n]}`);
    ok(nOk === 64, `HEX_NAMES route.ts ตรงมาตรฐาน ${nOk}/64`, nBad.slice(0, 3).join(" · "));
  }
  // สูตรใน route ใช้ mapping 先天數→binary ชุดเดียวกับ TBIN (เช็คจาก source)
  ok(/_XIANTIAN_BIN[^=]*= \{ 1:'111', 2:'110', 3:'101', 4:'100', 5:'011', 6:'010', 7:'001', 8:'000' \}/.test(src),
    "_XIANTIAN_BIN ใน route.ts = encoding เดียวกับ TRIGRAM_BIN heluo");
}

console.log("\n══ (ง) sweep หลายเดือน × หลายยาม ══");
{
  const DATES = ["2026-07-10", "2026-07-11", "2026-09-08", "2026-12-15", "2027-02-08", "2025-08-01"];
  const HOURS = ["子", "卯", "午", "酉"];
  const seen = new Set(); let all = 0, sane = 0;
  for (const d of DATES) for (const h of HOURS) {
    const r = meihuaForSlot(d, h);
    all++;
    if (r.num >= 1 && r.num <= 64 && r.yao >= 1 && r.yao <= 6 && NAME_BY_NUM[r.num] === r.name) sane++;
    seen.add(r.num);
  }
  ok(sane === all, `ทุก slot ${all}/${all}: เลข卦 1-64 · 動爻 1-6 · ชื่อตรง`);
  ok(seen.size >= 8, `กระจายตัวสมเหตุผล (${seen.size} 卦ต่างกันจาก ${all} slot)`);
  // 子時 vs 午時 วันเดียวกัน: 時支數ต่าง 6 → 下卦ต้องต่างเสมอ (6 mod 8 ≠ 0) → 卦ต่าง
  let zwOk = true;
  for (const d of DATES) {
    const z = meihuaForSlot(d, "子"), w = meihuaForSlot(d, "午");
    if (z.lo === w.lo || z.num === w.num) zwOk = false;
    if (z.up !== w.up) zwOk = false; // 上卦ไม่ใช้เวลา → ต้องเท่ากันในวันเดียวกัน
  }
  ok(zwOk, "子時 vs 午時 วันเดียวกัน → 上卦เท่า · 下卦/卦ต่างเสมอ");
  // วันจันทรคติ +1 (ยามเดิม) → 上卦เลื่อน → คนละ卦 (ยกเว้นข้ามเดือน) — เช็คตัวอย่าง
  const d1 = meihuaForSlot("2026-07-10", "午"), d2 = meihuaForSlot("2026-07-11", "午");
  ok(d1.num !== d2.num, `วันติดกันยามเดิม → 卦ต่าง (${d1.num}${d1.name} vs ${d2.num}${d2.name})`);
}

} // !API_ONLY

/* ══ (จ) API integration before/after ══ */
if (!NO_API) {
  console.log("\n══ (จ) ยิง /api/auspicious จริง · before(hash) vs after(梅花) · port 3991 ══");
  const BASE = "http://127.0.0.1:3991";
  const ROUTE = "src/app/api/auspicious/route.ts";
  const BACKUP_OLD = "/root/backups/r412-datepick-fix-20260705-161018/route.ts.before-meihua";
  const SCRATCH = "/tmp/claude-0/-root/14fcd76f-de20-4971-b9e7-a973b82e973e/scratchpad";
  mkdirSync(SCRATCH, { recursive: true });
  const NEW_COPY = SCRATCH + "/route.ts.r414-meihua";
  copyFileSync(ROUTE, NEW_COPY); // เก็บเวอร์ชันใหม่ไว้ · finally จะ restore เสมอ

  const { Client } = pgpkg;
  const db = new Client({
    host: process.env.PGHOST, port: +(process.env.PGPORT || 5432), user: process.env.PGUSER,
    password: process.env.PGPASSWORD, database: process.env.PGDATABASE,
  });
  await db.connect();
  const prof = (await db.query(
    `SELECT u.person_id, trim(u.zodiac) AS zodiac, p.org_id
       FROM aj_user_profiles u JOIN profiles p ON p.id::text = replace(u.person_id,'hk_','') AND p.is_archived=false
      LIMIT 1`)).rows[0];
  if (!prof) { console.log("  ❌ ไม่พบโปรไฟล์ทดสอบใน DB"); process.exit(1); }
  console.log(`  ใช้โปรไฟล์ ${prof.person_id} (นักษัตร ${prof.zodiac}) org ${prof.org_id}`);
  const clearCache = () => db.query("DELETE FROM aj_personal_cache WHERE person_id=$1", [prof.person_id]);

  const token = await new SignJWT({ userId: "r414-test", email: "r414@test.local", orgId: prof.org_id })
    .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h")
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  const COOKIE = `decode_auth=${token}`;

  const MODULES = ["ze_ri", "twelve_officers", "twenty_eight", "twelve_spirits", "nine_stars", "tai_sui", "qi_men", "he_luo", "ba_zi", "yong_shen", "hex64"];
  const WINDOWS = [["2026-07-10", "2026-07-14"], ["2026-09-08", "2026-09-12"], ["2026-12-14", "2026-12-18"], ["2027-02-08", "2027-02-12"]];
  const ACTIVITIES = ["開市", "婚姻"];

  const post = async (body, withAuth) => {
    for (let attempt = 0; ; attempt++) {
      let r;
      try {
        r = await fetch(`${BASE}/api/auspicious`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(withAuth ? { Cookie: COOKIE } : {}) },
          body: JSON.stringify(body),
        });
      } catch (e) {
        if (attempt < 60) { await new Promise((s) => setTimeout(s, 2000)); continue; } // รอ dev compile
        throw e;
      }
      const data = await r.json().catch(() => null);
      if (r.status === 429 && attempt < 5) {
        const w = Number(r.headers.get("retry-after") || 5) + 1;
        await new Promise((s) => setTimeout(s, w * 1000)); continue;
      }
      return { status: r.status, data };
    }
  };

  let server = null;
  const startServer = () => {
    server = spawn("npx", ["next", "dev", "-p", "3991"], { cwd: process.cwd(), detached: true, stdio: "ignore" });
  };
  const stopServer = () => {
    if (server) { try { process.kill(-server.pid, "SIGKILL"); } catch {} server = null; }
    try { execFileSync("bash", ["-c", "fuser -k 3991/tcp 2>/dev/null || true"]); } catch {}
  };

  const runQueries = async () => {
    const out = {};
    for (const [f, t] of WINDOWS) for (const act of ACTIVITIES) {
      const r = await post({ activityType: act, dateFrom: f, dateTo: t, peopleIds: [prof.person_id], activeModules: MODULES }, true);
      out[`${f}|${act}`] = r;
    }
    out["universal"] = await post({ activityType: "開市", dateFrom: "2026-07-10", dateTo: "2026-07-14", activeModules: MODULES.filter((m) => !["ba_zi", "yong_shen", "hex64"].includes(m)) }, false);
    return out;
  };

  const stripMeta = (d) => { const { meta, ...rest } = d || {}; return rest; };

  try {
    // ── BEFORE: โค้ดเก่า (hash) ──
    copyFileSync(BACKUP_OLD, ROUTE);
    await clearCache();
    startServer();
    const before = await runQueries();
    stopServer();

    // ── AFTER: โค้ดใหม่ (梅花) ──
    copyFileSync(NEW_COPY, ROUTE);
    await clearCache();
    startServer();
    const after = await runQueries();
    stopServer();
    await clearCache(); // ไม่ทิ้ง cache เทสไว้ให้ production

    // universal-only (ไม่มี personal): ต้องเท่าเดิมทั้งก้อน
    ok(JSON.stringify(stripMeta(before.universal.data)) === JSON.stringify(stripMeta(after.universal.data)),
      "universal-only (guest · ไม่มี hex64): ก่อน/หลัง byte-identical");

    let tableRows = [];
    for (const key of Object.keys(before)) {
      if (key === "universal") continue;
      const [win, act] = key.split("|");
      const B = before[key], A = after[key];
      ok(B.status === 200 && A.status === 200, `${win} ${act}: HTTP 200/200`, `${B.status}/${A.status}`);
      if (B.status !== 200 || A.status !== 200) continue;
      const bById = new Map((B.data.candidates || []).map((c) => [c.id, c]));
      let othersSame = true, hexOk = true, shapeOk = true, scoreOk = true, nB = 0;
      for (const c of A.data.candidates || []) {
        const h = c.modules?.hex64;
        if (!h) continue;
        nB++;
        // shape ครบ
        const raw = h.raw || {};
        if (!(raw.hex_num >= 1 && raw.hex_num <= 64) || !(raw.changing_line >= 1 && raw.changing_line <= 6)
          || typeof raw.hex_name !== "string" || !raw.label
          || !(h.tags || []).includes(`hex_${raw.hex_num}`) || !(h.tags || []).includes(`yao_line_${raw.changing_line}`)
          || raw.meihua?.method !== "meihua_time") shapeOk = false;
        // ตรงสูตรอิสระ
        const exp = meihuaForSlot(c.calendar.gregorianDate, c.calendar.shichenBranch);
        if (raw.hex_num !== exp.num || raw.hex_name !== exp.name || raw.changing_line !== exp.yao
          || raw.meihua?.upper !== exp.up || raw.meihua?.lower !== exp.lo) hexOk = false;
        // คะแนน consistent กับป้ายดี/ร้ายเดิม (สเกลเดิม)
        const GOOD = new Set([1, 11, 14, 19, 24, 25, 34, 41, 42, 46, 53, 55, 57, 58, 61]);
        const BAD = new Set([12, 23, 29, 36, 39, 44, 47, 49, 56]);
        const expScore = GOOD.has(raw.hex_num) ? 80 + (raw.hex_num % 10) : BAD.has(raw.hex_num) ? 30 + (raw.hex_num % 10) : 60;
        if (h.score.raw !== expScore) scoreOk = false;
        // ศาสตร์อื่นทุก module (นอก hex64) เท่าเดิม
        const bc = bById.get(c.id);
        if (bc) {
          for (const mk of Object.keys(c.modules)) {
            if (mk === "hex64") continue;
            if (JSON.stringify(c.modules[mk]) !== JSON.stringify(bc.modules[mk])) othersSame = false;
          }
          if (tableRows.length < 10 && bc.modules?.hex64) {
            const bh = bc.modules.hex64.raw;
            const oh = oldHash(c.pillars.day.branch, c.calendar.shichenBranch, prof.zodiac);
            if (bh.hex_num !== oh.num) console.log(`  ⚠ before hash ไม่ตรงสูตร re-impl: ${bh.hex_num} vs ${oh.num}`);
            tableRows.push([c.calendar.gregorianDate, c.calendar.shichenBranch, `${bh.hex_num}${bh.hex_name} 爻${bh.changing_line}`, `${raw.hex_num}${raw.hex_name} 爻${raw.changing_line}`, `${exp.up}上${exp.lo}下`, `年${exp.L.y}+月${exp.L.m}+日${exp.L.d}+時${exp.L.h}`]);
          }
        }
      }
      ok(nB > 0, `${win} ${act}: มี slot ที่มี hex64 (${nB})`);
      ok(shapeOk, `${win} ${act}: hex64 shape ครบ (hex_num/hex_name/changing_line/label/tags/meihua)`);
      ok(hexOk, `${win} ${act}: เลข卦/動爻/ตรีลักษณ์ ตรงสูตร梅花อิสระทุก slot`);
      ok(scoreOk, `${win} ${act}: hexScore ตามสเกล HEX_GOOD/HEX_BAD เดิม`);
      ok(othersSame, `${win} ${act}: module อื่นทุกตัว (ba_zi/yong_shen/universal) byte-เท่าเดิม`);
    }

    console.log("\n── ตาราง 10 วัน-เวลา · ก่อน(hash) → หลัง(梅花) ──");
    console.log("  วันที่       ยาม  ก่อน(hash)      หลัง(梅花)      ตรีลักษณ์     เลขจันทรคติ");
    for (const r of tableRows) console.log("  " + r.map((x, i) => String(x).padEnd([12, 4, 15, 15, 12, 20][i])).join(" "));
  } finally {
    copyFileSync(NEW_COPY, ROUTE); // restore โค้ดใหม่เสมอ
    stopServer();
    await clearCache().catch(() => {});
    await db.end().catch(() => {});
  }
}

console.log(`\n═══ สรุป: ✅ ${pass} · ❌ ${fail} ═══`);
process.exit(fail ? 1 : 0);
