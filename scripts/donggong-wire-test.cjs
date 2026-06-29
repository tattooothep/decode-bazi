/* เทียบ lib donggong-data ↔ DB ↔ tyme สำหรับวันจริง · พิสูจน์ wire ถูก */
const fs = require("fs");
const tyme = require("tyme4ts"); const { SolarDay } = tyme;
const { execSync } = require("child_process");
const src = fs.readFileSync("src/lib/donggong-data.ts", "utf8");
const DG_DAY = JSON.parse(src.match(/DG_DAY[^=]*=\s*({.*?});\nexport const DG_EXC/s)[1]);
const DG_EXC = JSON.parse(src.match(/DG_EXC[^=]*=\s*({.*});\s*$/s)[1]);
const MONTH_IDX = { 寅:1,卯:2,辰:3,巳:4,午:5,未:6,申:7,酉:8,戌:9,亥:10,子:11,丑:12 };
function lib(monBr, dayBr, gz) {
  const mi = MONTH_IDX[monBr]; const d = DG_DAY[`${mi}|${dayBr}`]; if (!d) return null;
  const e = DG_EXC[`${mi}|${gz}`];
  return { jianchu: d.pos, verdict: (e && e.verdict) ? e.verdict : (d.verdict || "—") };
}
const tests = ["2026-01-15","2026-03-03","2026-05-20","2026-07-07","2026-09-09","2026-11-30","2026-12-25","2026-02-28","2026-06-18","2026-10-10"];
let ok = 0, bad = 0;
for (const dt of tests) {
  const [y,m,da] = dt.split("-").map(Number);
  const scd = SolarDay.fromYmd(y,m,da).getSixtyCycleDay();
  const monBr = scd.getMonth().getEarthBranch().getName();
  const mi = MONTH_IDX[monBr];
  const gz = scd.getSixtyCycle().getName();
  const dayBr = scd.getSixtyCycle().getEarthBranch().getName();
  const L = lib(monBr, dayBr, gz);
  const sql = `SELECT d.jianchu, COALESCE(e.verdict, d.base_verdict, '—') FROM ref_donggong_day d LEFT JOIN ref_donggong_exception e ON e.month=d.month AND e.day_ganzhi='${gz}' WHERE d.month=${mi} AND d.day_branch='${dayBr}';`;
  const db = execSync(`docker exec decode-postgres psql -U decode_user -d decode_db -t -A -F"|" -c "${sql}"`).toString().trim();
  const [dbJc, dbV] = db.split("|");
  const match = L && L.jianchu === dbJc && L.verdict === dbV;
  console.log(`${dt} ${monBr}月 ${gz} → lib[${L.jianchu}|${L.verdict}] db[${dbJc}|${dbV}] ${match?"✓":"✗"}`);
  match ? ok++ : bad++;
}
console.log(`\nlib↔DB consistency: ${ok}/${tests.length} ${bad===0?"✓ PASS":"✗ FAIL"}`);
